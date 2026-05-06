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

interface BulkImportResult {
  criados: number;
  atualizados: number;
  erros: Array<{ nota: string; parcela: number; motivo: string }>;
}

function chunkArray<T>(array: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(array.length / size) }, (_, i) =>
    array.slice(i * size, i * size + size)
  );
}

const parseToNumber = (val: string | number | undefined): number => {
  if (val === undefined || val === null || val === "") return 0;
  if (typeof val === 'number') return val;
  const normalized = val.replace(/\./g, '').replace(',', '.');
  return parseFloat(normalized) || 0;
};

const getNF = (data: PagamentoInput): string => {
  const nf = String(data.nfVenda || data.nf || data.nota || "").trim();
  return nf === "undefined" || nf === "" ? "" : nf;
};

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
    const nfRef = getNF(data);
    if (!nfRef) throw new Error("NF de venda é obrigatória.");

    const venda = await prisma.venda.findUnique({ where: { nf: nfRef } });
    if (!venda) throw new Error(`Venda NF ${nfRef} não encontrada.`);

    // Normalização rigorosa para bater com a lógica do Verify
    const nParcela = Math.floor(parseToNumber(data.numeroParcela || data.parcelaPaga)) || 1;
    const valorRepasse = parseToNumber(data.valor || data.repasse);
    const comissaoTotal = parseToNumber(data.comissaoVenda) +
      parseToNumber(data.comissaoFrete) +
      parseToNumber(data.frete_e_taxas);

    // Evita duplicidade: busca se a parcela já existe para esta venda
    const existente = await prisma.pagamento.findFirst({
      where: { vendaId: venda.id, numeroParcela: nParcela }
    });

    if (existente) {
      return await prisma.pagamento.update({
        where: { id: existente.id },
        data: {
          valor: valorRepasse,
          comissaoRetida: comissaoTotal,
          data: data.data ? new Date(data.data) : new Date(),
          loja: data.loja || venda.loja
        }
      });
    }

    return await prisma.pagamento.create({
      data: {
        vendaId: venda.id,
        nfVenda: nfRef,
        numeroParcela: nParcela,
        valor: valorRepasse,
        comissaoRetida: comissaoTotal,
        data: data.data ? new Date(data.data) : new Date(),
        loja: data.loja || venda.loja
      }
    });
  },

  async importBulk(pagamentos: PagamentoInput[]): Promise<{ criados: number; atualizados: number; erros: any[] }> {
    console.log(`[IMPORT] Processando ${pagamentos.length} registros.`);
    let [criados, atualizados] = [0, 0];
    const erros: any[] = [];

    // 1. Ordenação (Parcela 1 antes da 2)
    const pgtosOrdenados = [...pagamentos].sort((a, b) =>
      Number(a.parcelaPaga || a.numeroParcela || 0) - Number(b.parcelaPaga || b.numeroParcela || 0)
    );

    // 2. Busca de dados em massa para evitar gargalo
    const nfs = [...new Set(pgtosOrdenados.map(p => p.nota).filter((n): n is string => !!n))];
    const vendasDB = await prisma.venda.findMany({
      where: { nf: { in: nfs } },
      include: { pagamentos: true }
    });
    const vendaMap = new Map(vendasDB.map(v => [v.nf, v]));

    await prisma.$transaction(async (tx) => {
      for (const pgto of pgtosOrdenados) {
        const nfRef = pgto.nota;
        if (!nfRef) continue;

        const venda = vendaMap.get(nfRef);
        if (!venda) {
          console.warn(`[AVISO] NF ${nfRef} não encontrada.`);
          erros.push({ nota: nfRef, motivo: "Venda não encontrada" });
          continue;
        }

        // Normalização de valores e parcelas
        const nParcela = Math.floor(Number(pgto.parcelaPaga || pgto.numeroParcela)) || 1;
        const totalParcelas = Math.floor(Number(pgto.numeroParcela)) || 1;
        const valorRepasse = Number(pgto.repasse || pgto.valor || 0);
        const comissaoTotal = Number(pgto.comissaoVenda || 0) + Number(pgto.comissaoFrete || 0) + Number(pgto.frete_e_taxas || 0);

        // --- REGRA 1: Validação de Parcela Anterior ---
        if (nParcela > 1) {
          const anterior = venda.pagamentos.some(p => Number(p.numeroParcela) === nParcela - 1);
          if (!anterior) {
            console.error(`[ERRO SEQ] NF ${nfRef}: Parcela ${nParcela} sem a anterior.`);
            erros.push({ nota: nfRef, parcela: nParcela, motivo: "Parcela anterior ausente" });
            continue;
          }
        }

        // --- UPSERT (Cria ou Atualiza) ---
        const existente = venda.pagamentos.find(p => Number(p.numeroParcela) === nParcela);
        let pgtoSalvo;

        if (existente) {
          pgtoSalvo = await tx.pagamento.update({
            where: { id: existente.id },
            data: { valor: valorRepasse, comissaoRetida: comissaoTotal, data: pgto.data ? new Date(pgto.data) : new Date() }
          });
          atualizados++;
          const idx = venda.pagamentos.findIndex(p => p.id === existente.id);
          venda.pagamentos[idx] = pgtoSalvo;
        } else {
          pgtoSalvo = await tx.pagamento.create({
            data: {
              vendaId: venda.id,
              nfVenda: nfRef,
              numeroParcela: nParcela,
              valor: valorRepasse,
              comissaoRetida: comissaoTotal,
              data: pgto.data ? new Date(pgto.data) : new Date(),
              loja: pgto.loja || venda.loja || "N/A"
            }
          });
          criados++;
          venda.pagamentos.push(pgtoSalvo); // Atualiza memória para o próximo loop
        }

        // --- REGRA 2: Status da Venda e Valor Total ---
        if (nParcela === totalParcelas) {
          const pagoTotal = venda.pagamentos.reduce((acc, p) => acc + Number(p.valor) + Number(p.comissaoRetida), 0);
          const esperado = Number(venda.baseIcms || 0);

          if (Math.abs(esperado - pagoTotal) <= 0.50) { // Margem de centavos
            await tx.venda.update({ where: { id: venda.id }, data: { status: 'PAGO' } });
            console.log(`[STATUS] NF ${nfRef}: Pago Integralmente.`);
          } else {
            await tx.venda.update({ where: { id: venda.id }, data: { status: 'PENDENTE' } });
            console.warn(`[STATUS] NF ${nfRef}: Divergência de valores (Esperado: ${esperado}, Pago: ${pagoTotal}).`);
            erros.push({ nota: nfRef, motivo: "Valor final não bate" });
          }
        } else {
          await tx.venda.update({ where: { id: venda.id }, data: { status: 'PARCIALMENTE_PAGO' } });
        }
      }
    }, { timeout: 300000 });

    return { criados, atualizados, erros };
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