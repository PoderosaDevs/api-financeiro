import { prisma } from "../prisma/client";
import { VendaStatus, Pagamento, Prisma } from "../generated/prisma";

/**
 * Interface para garantir tipagem na entrada de dados (Unitário e Bulk)
 */
interface PagamentoInput {
  nota?: string;
  nf?: string;
  nfVenda?: string;
  parcelaPaga?: string | number;
  numeroParcela?: string | number;
  valor?: string | number;
  repasse?: string | number;
  comissaoVenda?: string | number;
  comissaoFrete?: string | number;
  frete_e_taxas?: string | number;
  data?: string | Date;
  loja?: string;
}

export const pagamentoService = {

  /**
   * 1. VERIFY (Apuração Geral e Higienização)
   * Varre vendas ativas para remover duplicatas e recalcular status.
   */
  async verify(): Promise<{
    processadas: number;
    corrigidas: number;
    duplicidadesRemovidas: number;
    detalhes: string[]
  }> {
    console.log("🔍 Iniciando Higienização e Apuração Financeira (Processamento em Lotes)...");

    let processadas = 0;
    let corrigidas = 0;
    let duplicidadesRemovidas = 0;
    const detalhes: string[] = [];

    const TAMANHO_LOTE = 2000; // Processamos 2000 vendas por vez para não estourar a memória
    let skip = 0;
    let continuar = true;

    while (continuar) {
      // Buscamos um lote de vendas
      const vendas = await prisma.venda.findMany({
        where: { status: { notIn: [VendaStatus.CANCELADO, VendaStatus.FINALIZADO] } },
        include: { pagamentos: { orderBy: { data: 'desc' } } },
        take: TAMANHO_LOTE,
        skip: skip,
      });

      if (vendas.length === 0) {
        continuar = false;
        break;
      }

      for (const venda of vendas) {
        processadas++;

        // --- LOGICA DE DUPLICIDADE ---
        const parcelasUnicas = new Map<number, string>();
        const idsParaDeletar: string[] = [];

        for (const pgto of venda.pagamentos) {
          const nParcela = pgto.numeroParcela || 1;
          if (parcelasUnicas.has(nParcela)) {
            idsParaDeletar.push(pgto.id);
          } else {
            parcelasUnicas.set(nParcela, pgto.id);
          }
        }

        if (idsParaDeletar.length > 0) {
          await prisma.pagamento.deleteMany({ where: { id: { in: idsParaDeletar } } });
          duplicidadesRemovidas += idsParaDeletar.length;
          venda.pagamentos = venda.pagamentos.filter(p => !idsParaDeletar.includes(p.id));
        }

        // --- LOGICA DE STATUS ---
        const somaLiquido = venda.pagamentos.reduce((acc: number, p: Pagamento) => acc + Number(p.valor), 0);
        const somaTaxas = venda.pagamentos.reduce((acc: number, p: Pagamento) => acc + Number(p.comissaoRetida || 0), 0);
        const totalRecebido = somaLiquido + somaTaxas;
        const valorMeta = Number(venda.baseIcms);

        let novoStatus: VendaStatus = VendaStatus.PENDENTE;
        if (totalRecebido >= (valorMeta - 0.1)) {
          novoStatus = VendaStatus.PAGO;
        } else if (totalRecebido > 0) {
          novoStatus = VendaStatus.PARCIALMENTE_PAGO;
        }

        if (venda.status !== novoStatus) {
          await prisma.venda.update({
            where: { id: venda.id },
            data: { status: novoStatus }
          });
          detalhes.push(`NF: ${venda.nf} | ${venda.status} -> ${novoStatus}`);
          corrigidas++;
        }
      }

      console.log(`⏳ Processadas ${processadas} vendas...`);
      skip += TAMANHO_LOTE;
    }

    return { processadas, corrigidas, duplicidadesRemovidas, detalhes };
  },

  /**
   * 2. CRIAÇÃO UNITÁRIA
   * Aplica Upsert manual para evitar duplicatas em inserções avulsas.
   */
  async create(data: PagamentoInput): Promise<Pagamento> {
    const nfRef = String(data.nfVenda || data.nf);
    if (!nfRef) throw new Error("NF de venda é obrigatória.");

    const venda = await prisma.venda.findUnique({ where: { nf: nfRef } });
    if (!venda) throw new Error(`Venda NF ${nfRef} não encontrada.`);

    const nParcela = Number(data.numeroParcela || data.parcelaPaga || 1);
    const valorRepasse = Number(data.valor || data.repasse || 0);
    const comissaoTotal = Number(data.comissaoVenda || 0) + Number(data.comissaoFrete || 0) + Number(data.frete_e_taxas || 0);

    const existente = await prisma.pagamento.findFirst({
      where: { vendaId: venda.id, numeroParcela: nParcela }
    });

    if (existente) {
      return await prisma.pagamento.update({
        where: { id: existente.id },
        data: {
          valor: valorRepasse,
          comissaoRetida: comissaoTotal,
          data: data.data ? new Date(data.data) : new Date()
        }
      });
    }

    return await prisma.pagamento.create({
      data: {
        valor: valorRepasse,
        comissaoRetida: comissaoTotal,
        data: data.data ? new Date(data.data) : new Date(),
        nfVenda: nfRef,
        vendaId: venda.id,
        numeroParcela: nParcela,
        loja: data.loja || venda.loja
      }
    });
  },

  /**
   * 3. IMPORTAÇÃO EM MASSA (Bulk)
   */
  async importBulk(pagamentos: PagamentoInput[]): Promise<{ criados: number; atualizados: number }> {
    let criados = 0;
    let atualizados = 0;

    const parseMoney = (val: string | number | undefined) => {
      if (!val) return 0;
      if (typeof val === 'number') return val;
      return parseFloat(val.replace('.', '').replace(',', '.')) || 0;
    };

    await prisma.$transaction(async (tx) => {
      for (const pgto of pagamentos) {
        const nfRef = String(pgto.nota || pgto.nf || pgto.nfVenda).trim();
        if (!nfRef || nfRef === "undefined") continue;

        const venda = await tx.venda.findUnique({
          where: { nf: nfRef },
          select: { id: true, loja: true }
        });

        if (!venda) continue;

        const nParcela = parseInt(String(pgto.parcelaPaga || pgto.numeroParcela || 1));
        const valorRepasse = parseMoney(pgto.repasse || pgto.valor);
        const comissaoTotal = parseMoney(pgto.comissaoVenda) + parseMoney(pgto.comissaoFrete) + parseMoney(pgto.frete_e_taxas);

        const existente = await tx.pagamento.findFirst({
          where: { vendaId: venda.id, numeroParcela: nParcela }
        });

        if (existente) {
          await tx.pagamento.update({
            where: { id: existente.id },
            data: {
              valor: valorRepasse,
              comissaoRetida: comissaoTotal,
              data: pgto.data ? new Date(pgto.data) : new Date()
            }
          });
          atualizados++;
        } else {
          await tx.pagamento.create({
            data: {
              vendaId: venda.id,
              nfVenda: nfRef,
              numeroParcela: nParcela,
              valor: valorRepasse,
              comissaoRetida: comissaoTotal,
              data: pgto.data ? new Date(pgto.data) : new Date(),
              loja: pgto.loja || venda.loja
            }
          });
          criados++;
        }
      }
    }, { timeout: 300000 });

    return { criados, atualizados };
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