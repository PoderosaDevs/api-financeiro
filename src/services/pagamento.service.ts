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
    console.log(
      `\n🚀 [IMPORT] Iniciando auditoria e processamento de ${totalInicial} pagamentos...`,
    );

    let processados = 0;
    const falhasNf: string[] = [];
    const duplicados: string[] = [];
    const errosValidacao: string[] = []; // Novo array para erros de conta (R$ não bate)

    // ------------------------------------------------------------------
    // PASSO 1: OTIMIZAÇÃO DE BUSCA
    // ------------------------------------------------------------------
    const nfsNaPlanilha = pagamentos
      .map((p) => String(p.nota || p.nf || p.nfVenda))
      .filter((nf) => nf && nf !== "undefined");

    console.log(`🔍 [STEP 1] Buscando dados no banco...`);

    const [vendasNoBanco, pagamentosExistentes] = await Promise.all([
      prisma.venda.findMany({
        where: { nf: { in: nfsNaPlanilha } },
        // Precisamos trazer o ID e o Status atual
        select: {
          id: true,
          nf: true,
          qtdParcelas: true,
          status: true,
          baseIcms: true,
        },
      }),
      prisma.pagamento.findMany({
        where: { nfVenda: { in: nfsNaPlanilha } },
        select: { vendaId: true, numeroParcela: true },
      }),
    ]);

    const updatesVendas: any[] = [];
    const novosPagamentos: any[] = [];

    // ------------------------------------------------------------------
    // PASSO 2: PROCESSAMENTO E VALIDAÇÃO MATEMÁTICA
    // ------------------------------------------------------------------

    pagamentos.forEach((pgto) => {
      // 1. Normalização de Dados
      const nfRef = String(pgto.nota || pgto.nf).trim();

      const nParcela = parseInt(
        String(pgto.parcelaPaga || pgto.numeroParcela || 1),
      );
      const totalParcelasInput = parseInt(
        String(pgto.parcelas || pgto.qtdParcelas || 1),
      );

      // Valores Financeiros (Tratamento para garantir float)
      const valorRepasse = parseFloat(String(pgto.repasse || pgto.valor || 0)); // Líquido que entrou
      const valComissaoVenda = parseFloat(String(pgto.comissaoVenda || 0));
      const valComissaoFrete = parseFloat(String(pgto.comissaoFrete || 0));
      const valFreteTaxas = parseFloat(String(pgto.frete_e_taxas || 0));
      const baseIcmsPlanilha = parseFloat(String(pgto.baseIcms || 0)); // Bruto esperado

      // 2. Validação: Venda existe?
      const venda = vendasNoBanco.find((v) => v.nf === nfRef);
      if (!venda) {
        falhasNf.push(nfRef);
        return;
      }

      // 3. Validação: Duplicidade
      const jaExiste = pagamentosExistentes.some(
        (p) => p.vendaId === venda.id && p.numeroParcela === nParcela,
      );
      if (jaExiste) {
        duplicados.push(`NF ${nfRef} (Parc. ${nParcela})`);
        return;
      }

      // 4. A "Prova Real" (Validação Financeira)
      // Regra: Repasse + Comissões deve ser igual a Base ICMS (com margem de erro de centavos)
      const somaCalculada = valorRepasse + valComissaoVenda + valComissaoFrete + valFreteTaxas;
      const diferenca = Math.abs(somaCalculada - baseIcmsPlanilha);

      // Aceita erro de até R$ 0.10 por arredondamento
      if (diferenca > 0.1 && baseIcmsPlanilha > 0) {
        // Se a conta não fecha, podemos logar um aviso ou impedir (depende da sua regra).
        // Aqui vou logar apenas, mas processar o pagamento.
        console.warn(
          `⚠️ [ALERTA FINANCEIRO] NF ${nfRef}: Conta não fecha! Repasse(${valorRepasse}) + Comissões(${valComissaoVenda}+${valComissaoFrete}) + Frete e Taxas(${valFreteTaxas}) != Base(${baseIcmsPlanilha})`,
        );
      }

      // 5. Lógica de Status e Atualização da Venda
      let novoStatus = venda.status;

      // Se for a última parcela, consideramos PAGO.
      // Se for menor que o total, é PARCIALMENTE_PAGO.
      if (nParcela >= totalParcelasInput) {
        novoStatus = "PAGO";
      } else {
        novoStatus = "PARCIALMENTE_PAGO";
      }

      // Preparar atualização da Venda (Enriquece com dados financeiros do Marketplace)
      // ATENÇÃO: Só atualizamos os dados financeiros da Venda se os dados vierem preenchidos
      const dadosUpdateVenda: any = {
        status: novoStatus,
        // Se o excel informou parcelas, atualizamos
        qtdParcelas:
          totalParcelasInput > 0 ? totalParcelasInput : venda.qtdParcelas,
      };

      // Se a planilha trouxer comissões, atualizamos a venda para refletir o custo real
      // Calculamos o líquido a receber PROJETADO para a venda total
      if (valComissaoVenda > 0 || valComissaoFrete > 0) {
        dadosUpdateVenda.comissaoVenda = valComissaoVenda;
        dadosUpdateVenda.comissaoFrete = valComissaoFrete;
        dadosUpdateVenda.frete_e_taxas = valFreteTaxas;

        // Líquido Receber = Base ICMS (do banco ou planilha) - Comissões
        const baseCalculo =
          Number(venda.baseIcms) > 0
            ? Number(venda.baseIcms)
            : baseIcmsPlanilha;
        dadosUpdateVenda.liquidoReceber =
          baseCalculo - (valComissaoVenda + valComissaoFrete + valFreteTaxas);
      }

      updatesVendas.push(
        prisma.venda.update({
          where: { id: venda.id },
          data: dadosUpdateVenda,
        }),
      );

      // 6. Criar o Pagamento
      novosPagamentos.push({
        vendaId: venda.id,
        nfVenda: nfRef,
        numeroParcela: nParcela,
        valor: valorRepasse, // Salva o Líquido (Repasse)
        data: new Date(), // Ou pgto.data se tiver na planilha
        // Se adicionou o campo opcional sugerido:
        // comissaoRetida: valComissaoVenda + valComissaoFrete
      });

      processados++;
    });

    // ------------------------------------------------------------------
    // PASSO 3: PERSISTÊNCIA
    // ------------------------------------------------------------------

    if (novosPagamentos.length > 0 || updatesVendas.length > 0) {
      console.log(
        `💾 [STEP 3] Gravando ${novosPagamentos.length} pagamentos e atualizando vendas...`,
      );

      await prisma.$transaction([
        ...updatesVendas,
        prisma.pagamento.createMany({
          data: novosPagamentos,
          skipDuplicates: true,
        }),
      ]);
    }

    return {
      message: `${processados} pagamentos processados.`,
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
