import { prisma } from "../prisma/client";
import { vendaService } from "./venda.service";

export const pagamentoService = {
  // --- CRIAÇÃO UNITÁRIA (Manual) ---
  async create(data: any) {
    const nfRef = data.nfVenda || data.nf;
    if (!nfRef) throw new Error("A NF da venda é obrigatória.");

    const venda = await prisma.venda.findUnique({
      where: { nf: String(nfRef) },
    });
    if (!venda) throw new Error(`Venda com NF ${nfRef} não encontrada.`);

    // 1. Lógica de Sincronização: numeroParcelas (input) -> qtdParcelas (venda)
    const totalParcelasInput = data.numeroParcelas || data.qtdParcelas;
    if (venda.qtdParcelas === null && totalParcelasInput) {
      await vendaService.update(venda.id, {
        qtdParcelas: Number(totalParcelasInput),
      });
    }

    // 2. Lógica de Campo: parcelaPaga (input) -> numeroParcela (pagamento)
    const nParcela = Number(data.parcelaPaga || data.numeroParcela || 1);

    const duplicado = await prisma.pagamento.findFirst({
      where: { vendaId: venda.id, numeroParcela: nParcela },
    });
    if (duplicado)
      throw new Error(`A parcela ${nParcela} da NF ${nfRef} já está paga.`);

    return await prisma.pagamento.create({
      data: {
        valor: Number(data.valor),
        data: new Date(data.data),
        nfVenda: String(nfRef),
        vendaId: venda.id,
        numeroParcela: nParcela,
      },
    });
  },

  async importBulk(pagamentos: any[]) {
    const totalInical = pagamentos.length;
    console.log(
      `\n🚀 [IMPORT] Iniciando processamento de ${totalInical} pagamentos...`
    );

    let processados = 0;
    const falhasNf: string[] = [];
    const duplicados: string[] = [];

    // 1. Busca em lote para evitar centenas de SELECTs
    console.log(
      `🔍 [STEP 1] Buscando vendas e pagamentos existentes no banco...`
    );
    const nfsNaPlanilha = pagamentos.map((p) => String(p.nf || p.nfVenda));

    const [vendasNoBanco, pagamentosExistentes] = await Promise.all([
      prisma.venda.findMany({ where: { nf: { in: nfsNaPlanilha } } }),
      prisma.pagamento.findMany({ where: { nfVenda: { in: nfsNaPlanilha } } }),
    ]);
    console.log(
      `✅ [STEP 1] ${vendasNoBanco.length} vendas encontradas. ${pagamentosExistentes.length} pagamentos já registrados.`
    );

    const updatesVendas: any[] = [];
    const novosPagamentos: any[] = [];

    // 2. Processamento em memória (Muito rápido)
    console.log(`⚙️ [STEP 2] Analisando regras de negócio e parcelas...`);

    pagamentos.forEach((pgto, index) => {
      const nfRef = String(pgto.nf || pgto.nfVenda);
      const venda = vendasNoBanco.find((v) => v.nf === nfRef);

      if (!venda) {
        falhasNf.push(nfRef);
        return;
      }

      const nParcela = Number(pgto.parcelaPaga || pgto.numeroParcela || 1);
      const totalParcelasInput = Number(
        pgto.numeroParcelas || pgto.qtdParcelas || 0
      );

      // Checar duplicidade na memória
      const jaExiste = pagamentosExistentes.some(
        (p) => p.vendaId === venda.id && p.numeroParcela === nParcela
      );
      if (jaExiste) {
        duplicados.push(`${nfRef} (Parc. ${nParcela})`);
        return;
      }

      // Preparar Update da Venda (Imutabilidade)
      if (venda.qtdParcelas === null && totalParcelasInput > 0) {
        updatesVendas.push(
          prisma.venda.update({
            where: { id: venda.id },
            data: { qtdParcelas: totalParcelasInput },
          })
        );
        venda.qtdParcelas = totalParcelasInput; // Atualiza ref local
      }

      // Preparar Objeto de Pagamento
      novosPagamentos.push({
        valor: Number(pgto.valor),
        data: new Date(),
        nfVenda: nfRef,
        vendaId: venda.id,
        numeroParcela: nParcela,
      });

      processados++;

      // Log de progresso a cada 50 itens para não poluir demais o terminal
      if ((index + 1) % 50 === 0) {
        console.log(
          `⏳ [PROCESSO] Analisados: ${index + 1} / ${totalInical}...`
        );
      }
    });

    // 3. Persistência em lote (Onde a mágica da velocidade acontece)
    console.log(
      `💾 [STEP 3] Gravando ${novosPagamentos.length} novos pagamentos e ${updatesVendas.length} atualizações de vendas...`
    );

    const inicioGravacao = Date.now();

    await prisma.$transaction([
      ...updatesVendas,
      prisma.pagamento.createMany({
        data: novosPagamentos,
        skipDuplicates: true,
      }),
    ]);

    const fimGravacao = Date.now();
    console.log(
      `🏁 [FINALIZADO] Importação concluída em ${
        (fimGravacao - inicioGravacao) / 1000
      }s de gravação.`
    );
    console.log(
      `📊 [RESUMO] Sucesso: ${processados} | NFs não encontradas: ${falhasNf.length} | Duplicados: ${duplicados.length}\n`
    );

    return {
      message: `${processados} pagamentos processados com sucesso.`,
      count: processados,
      skipped: falhasNf,
      duplicates: duplicados,
    };
  },

  async getAll() {
    return await prisma.pagamento.findMany({
      include: { venda: true },
      orderBy: { data: "desc" },
    });
  },

  async delete(id: string) {
    return await prisma.pagamento.delete({ where: { id } });
  },
};
