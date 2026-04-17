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

  /**
   * Processa a importação e realiza a "Prova Real" dos valores.
   */
  async importBulk(pagamentos: any[]) {
    const totalInicial = pagamentos.length;
    console.log(`\n🚀 [CLEAN IMPORT] Reconstruindo financeiro com comissões...`);

    const nfsNaPlanilha = pagamentos
      .map((p) => String(p.nota || p.nf || p.nfVenda).trim())
      .filter((nf) => nf && nf !== "undefined");

    const vendasNoBanco = await prisma.venda.findMany({
      where: { nf: { in: nfsNaPlanilha } },
      select: { id: true, nf: true, liquidoReceber: true, baseIcms: true, loja: true },
    });

    const updatesVendas = new Map<string, any>();
    const novosPagamentos: any[] = [];
    const idsVendasParaLimpar = new Set<string>();

    pagamentos.forEach((pgto) => {
      const nfRef = String(pgto.nota || pgto.nf || pgto.nfVenda).trim();
      const nParcela = parseInt(String(pgto.parcelaPaga || pgto.numeroParcela || 1));
      const totalParcelasInput = parseInt(String(pgto.parcelas || pgto.qtdParcelas || 1));

      const valorRaw = String(pgto.repasse || pgto.valor || 0).replace(',', '.');
      const valorRepasse = Math.round(parseFloat(valorRaw) * 100) / 100;

      // Campos de Comissão e Taxas
      const valComissaoVenda = parseFloat(String(pgto.comissaoVenda || 0).replace(',', '.'));
      const valComissaoFrete = parseFloat(String(pgto.comissaoFrete || 0).replace(',', '.'));
      const valFreteTaxas = parseFloat(String(pgto.frete_e_taxas || 0).replace(',', '.'));
      const baseIcmsPlanilha = parseFloat(String(pgto.baseIcms || 0).replace(',', '.'));

      const venda = vendasNoBanco.find((v) => v.nf === nfRef);
      if (!venda) return;

      idsVendasParaLimpar.add(venda.id);

      // Cálculo da comissão retida (Soma das comissões e taxas)
      const comissaoTotal = Math.round((valComissaoVenda + valComissaoFrete + valFreteTaxas) * 100) / 100;

      novosPagamentos.push({
        vendaId: venda.id,
        nfVenda: nfRef,
        numeroParcela: nParcela,
        valor: valorRepasse,
        data: pgto.data ? new Date(pgto.data) : new Date(),
        comissaoRetida: comissaoTotal > 0 ? comissaoTotal : null,
        loja: pgto.loja || venda.loja
      });

      const totalSendoInserido = novosPagamentos
        .filter(p => p.vendaId === venda.id)
        .reduce((acc, p) => acc + p.valor, 0);

      // Atualização dos dados da venda (Cabeçalho)
      const dadosUpdateVenda: any = {
        qtdParcelas: totalParcelasInput,
        status: totalSendoInserido >= (Number(venda.liquidoReceber) - 0.1) ? "PAGO" : "PARCIALMENTE_PAGO"
      };

      // Se a planilha trouxer dados financeiros, atualizamos a base da venda
      if (valComissaoVenda > 0 || valFreteTaxas > 0) {
        const baseCalculo = Number(venda.baseIcms) > 0 ? Number(venda.baseIcms) : baseIcmsPlanilha;
        dadosUpdateVenda.comissaoVenda = valComissaoVenda;
        dadosUpdateVenda.frete_e_taxas = valFreteTaxas;
        dadosUpdateVenda.liquidoReceber = baseCalculo - comissaoTotal;
      }

      updatesVendas.set(venda.id, {
        where: { id: venda.id },
        data: dadosUpdateVenda,
      });
    });

    if (idsVendasParaLimpar.size > 0) {
      await prisma.$transaction(async (tx) => {
        await tx.pagamento.deleteMany({
          where: { vendaId: { in: Array.from(idsVendasParaLimpar) } }
        });

        for (const u of updatesVendas.values()) {
          await tx.venda.update(u);
        }

        if (novosPagamentos.length > 0) {
          await tx.pagamento.createMany({
            data: novosPagamentos
          });
        }
      }, { timeout: 60000 });
    }

    return {
      status: "success",
      vendasProcessadas: idsVendasParaLimpar.size,
      pagamentosCriados: novosPagamentos.length
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

