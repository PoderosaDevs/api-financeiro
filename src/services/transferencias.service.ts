import { VendaStatus } from "../generated/prisma";
import { prisma } from "../prisma/client";

export const transferenciaService = {
  async importReembolsos(reembolsos: any[]) {
    const nfs = [
      ...new Set(
        reembolsos
          .map((r) => String(r.nota || r.nf || r.nfVenda).trim())
          .filter(Boolean)
      ),
    ];

    const [vendas, reembolsosExistentes] = await Promise.all([
      prisma.venda.findMany({
        where: { nf: { in: nfs } },
        select: { id: true, nf: true, liquidoReceber: true },
      }),
      prisma.reembolso.findMany({
        where: { nfVenda: { in: nfs } },
        select: { vendaId: true, valor: true, parcelaPaga: true },
      }),
    ]);

    const vendasMap = new Map(vendas.map((v) => [v.nf, v]));
    const reembolsosMap = new Map();
    const acumuladoMap = new Map<string, number>();

    for (const r of reembolsosExistentes) {
      const key = `${r.vendaId}-${r.parcelaPaga}`;
      reembolsosMap.set(key, true);

      const atual = acumuladoMap.get(r.vendaId) || 0;
      acumuladoMap.set(r.vendaId, atual + Number(r.valor));
    }

    let processados = 0;
    const falhasNf: string[] = [];
    const duplicados: string[] = [];
    const updatesVendas: any[] = [];
    const novosReembolsos: any[] = [];

    for (const remb of reembolsos) {
      const nfRef = String(remb.nota || remb.nf || remb.nfVenda).trim();
      const venda = vendasMap.get(nfRef);

      if (!venda) {
        falhasNf.push(nfRef);
        continue;
      }

      const valorReembolso = Math.abs(parseFloat(String(remb.repasse || remb.valor || 0)));
      const nParcela = parseInt(String(remb.parcelaPaga || 1));
      const key = `${venda.id}-${nParcela}`;

      if (reembolsosMap.has(key)) {
        duplicados.push(`NF ${nfRef} (Remb. Parc ${nParcela})`);
        continue;
      }

      const jaReembolsado = acumuladoMap.get(venda.id) || 0;
      const totalAposEste = jaReembolsado + valorReembolso;
      acumuladoMap.set(venda.id, totalAposEste);

      const novoStatus =
        totalAposEste >= Number(venda.liquidoReceber)
          ? VendaStatus.REEMBOLSADO
          : VendaStatus.PARCIALMENTE_REEMBOLSADO;

      updatesVendas.push(
        prisma.venda.update({
          where: { id: venda.id },
          data: { status: novoStatus },
        })
      );

      novosReembolsos.push({
        vendaId: venda.id,
        nfVenda: nfRef,
        data: new Date(remb.data || new Date()),
        valor: valorReembolso,
        loja: String(remb.loja || ""),
        comissaoVenda: parseFloat(String(remb.comissaoVenda || 0)),
        comissaoFrete: parseFloat(String(remb.comissaoFrete || 0)),
        baseIcms: parseFloat(String(remb.baseIcms || 0)),
        parcelaPaga: nParcela,
        totalParcelas: parseInt(String(remb.parcelas || 1)),
      });

      reembolsosMap.set(key, true);
      processados++;
    }

    if (novosReembolsos.length > 0) {
      await prisma.$transaction([
        ...updatesVendas,
        prisma.reembolso.createMany({ data: novosReembolsos }),
      ]);
    }

    return { count: processados, skipped: falhasNf, duplicates: duplicados };
  },

  async importDevolucoes(devolucoes: any[]) {
    const nfs = [
      ...new Set(
        devolucoes
          .map((d) => String(d.nf || d.nfVenda).trim())
          .filter(Boolean)
      ),
    ];

    const vendas = await prisma.venda.findMany({
      where: { nf: { in: nfs } },
      select: { id: true, nf: true },
    });

    const vendasMap = new Map(vendas.map((v) => [v.nf, v]));

    let processados = 0;
    const falhasNf: string[] = [];

    // --- TRANSAÇÃO INTERATIVA COM TEMPO EXPANDIDO (SEGUINDO O SEU PADRÃO) ---
    await prisma.$transaction(async (tx) => {
      for (const dev of devolucoes) {
        const nfRef = String(dev.nf || dev.nfVenda).trim();
        const venda = vendasMap.get(nfRef);

        if (!venda) {
          falhasNf.push(nfRef);
          continue;
        }

        const tratativa = String(dev.tratativa || "").toUpperCase();
        const novoStatus =
          tratativa.includes("TOTAL") || tratativa === "DEVOLUCAO TOTAL"
            ? VendaStatus.DEVOLVIDO
            : VendaStatus.PARCIALMENTE_DEVOLVIDO;

        // Executa o update de forma sequencial e controlada dentro do contexto 'tx'
        await tx.venda.update({
          where: { id: venda.id },
          data: { status: novoStatus },
        });

        // Monta o identificador único para o numeroDevolucao caso venha vazio
        const numeroDevRef = String(
          dev.numeroDevolucao ||
          dev.devolucao ||
          `DEV-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`
        );

        // Cria a devolução utilizando o createMany com skipDuplicates dentro do escopo seguro
        await tx.devolucao.createMany({
          data: [{
            vendaId: venda.id,
            nfVenda: nfRef,
            data: dev.data ? new Date(dev.data) : new Date(),
            valorBase: parseFloat(String(dev.valorBase || dev.base || 0)),
            numeroDevolucao: numeroDevRef,
            valor: parseFloat(String(dev.valor || 0)),
            saldo: parseFloat(String(dev.saldo || 0)),
            tratativa: tratativa,
            motivo: String(dev.motivo || ""),
            loja: String(dev.loja || ""),
          }],
          skipDuplicates: true,
        });

        processados++;
      }
    }, {
      timeout: 600000 // Timeout estendido para 10 minutos, idêntico ao seu importBulk
    });

    return { count: processados, skipped: falhasNf };
  },

  async createReembolso(data: any) {
    const payload = {
      ...data,
      nf: data.nf,
      valor: data.repasse || data.valor,
      data: data.dataOperacao ? new Date(data.dataOperacao) : new Date(),
      parcelaPaga: parseInt(String(data.parcelaPaga || 1)),
    };

    const res = await this.importReembolsos([payload]);

    if (res.skipped.length > 0) {
      throw new Error(`Venda com NF ${data.nf} não encontrada.`);
    }

    if (res.duplicates.length > 0) {
      throw new Error(`A parcela ${payload.parcelaPaga} já possui um reembolso registrado para esta NF.`);
    }

    return {
      message: "Reembolso criado com sucesso",
      vendaId: data.vendaId,
      ...res
    };
  },

  async createDevolucao(data: any) {
    const payload = {
      ...data,
      nf: data.nf,
      valor: data.valorDevolucao || data.valor,
      valorBase: data.baseIcms || data.valorBase,
      data: data.dataOperacao ? new Date(data.dataOperacao) : new Date(),
      numeroDevolucao: data.numeroDevolucao || `MAN-${Date.now()}`,
    };

    const res = await this.importDevolucoes([payload]);

    if (res.skipped.length > 0) {
      throw new Error(`Venda com NF ${data.nf} não encontrada.`);
    }

    return {
      message: "Devolução criada com sucesso",
      vendaId: data.vendaId,
      ...res
    };
  },

  async getAllDevolucoes() {
    return await prisma.devolucao.findMany({
      include: { venda: true },
      orderBy: { data: "desc" },
    });
  },

  async getDevolucaoById(id: string) {
    return await prisma.devolucao.findUnique({
      where: { id },
      include: { venda: true },
    });
  },

  async updateDevolucao(id: string, data: any) {
    return await prisma.devolucao.update({
      where: { id },
      data,
    });
  },

  async deleteDevolucao(id: string) {
    return await prisma.devolucao.delete({
      where: { id },
    });
  },
};