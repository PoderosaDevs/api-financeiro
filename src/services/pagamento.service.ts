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


interface ArrayPagamentoInput {
  // Identificação
  nota?: string;
  nf?: string;         // Alias comum para nota
  nfVenda?: string;    // Alias comum para nota
  marketplaceId?: string;
  loja?: string;

  // Valores Financeiros
  repasse?: string | number;     // Valor líquido (seu objeto: 216.95)
  valor?: string | number;       // Alias para repasse
  comissaoVenda?: string | number;
  comissaoFrete?: string | number;
  frete_e_taxas?: string | number;
  baseIcms?: string | number;    // Valor bruto da nota (seu objeto: 219.89)

  // Controle de Parcelas
  parcelaPaga?: string | number; // A parcela atual (ex: 1)
  numeroParcela?: string | number; // Alias para parcelaPaga
  parcelas?: string | number;    // Qtd total de parcelas (ex: 1)

  // Temporal
  data?: string | Date;
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

  async importBulk(pagamentos: ArrayPagamentoInput[]) {
  console.log(`[IMPORT] Iniciando processamento de ${pagamentos.length} registros.`);
  let [criados, atualizados] = [0, 0];
  const erros: any[] = [];

  // 1. ORDENAÇÃO: Garante que a Parcela 1 venha antes para podermos validar a estrutura da Venda
  const pgtosOrdenados = [...pagamentos].sort((a, b) => {
    const pA = Number(a.parcelaPaga ?? a.numeroParcela ?? 0);
    const pB = Number(b.parcelaPaga ?? b.numeroParcela ?? 0);
    return pA - pB;
  });

  // 2. BUSCA DE VENDAS: Coleta todas as NFs para uma única consulta ao banco
  const nfs = [...new Set(pgtosOrdenados.map(p => p.nota || p.nf || p.nfVenda).filter((n): n is string => !!n))];
  const vendasDB = await prisma.venda.findMany({
    where: { nf: { in: nfs } },
    include: { pagamentos: { orderBy: { numeroParcela: 'asc' } } }
  });

  const vendaMap = new Map(vendasDB.map(v => [v.nf, v]));

  // 3. TRANSAÇÃO: Garante integridade dos dados
  await prisma.$transaction(async (tx) => {
    for (const pgto of pgtosOrdenados) {
      const nfRef = pgto.nota || pgto.nf || pgto.nfVenda;
      if (!nfRef) continue;

      const venda = vendaMap.get(nfRef);
      if (!venda) {
        erros.push({ nota: nfRef, motivo: "Venda não cadastrada no sistema." });
        continue;
      }

      // --- MAPEAMENTO DE DADOS (Converte string/number para Number puro) ---
      const nParcelaAtual = Math.floor(Number(pgto.parcelaPaga ?? pgto.numeroParcela)) || 1;
      const totalParcelasInput = Math.floor(Number(pgto.parcelas ?? venda.qtdParcelas)) || 1;
      const valorRepasse = Number(pgto.repasse ?? pgto.valor ?? 0);
      const taxas = Number(pgto.comissaoVenda ?? 0) + Number(pgto.comissaoFrete ?? 0) + Number(pgto.frete_e_taxas ?? 0);
      const valorBrutoDestaParcela = valorRepasse + taxas;

      // --- REGRA: ATUALIZAR QTD_PARCELAS DA VENDA SOMENTE NA PARCELA 1 ---
      if (nParcelaAtual === 1 && totalParcelasInput !== venda.qtdParcelas) {
        await tx.venda.update({
          where: { id: venda.id },
          data: { qtdParcelas: totalParcelasInput }
        });
        venda.qtdParcelas = totalParcelasInput; // Atualiza em memória para as próximas verificações do loop
      }

      // --- REGRA: NÃO PERMITIR PARCELA MAIOR QUE O TOTAL DA VENDA ---
      if (nParcelaAtual > (venda.qtdParcelas || 0)) {
        erros.push({ nota: nfRef, parcela: nParcelaAtual, motivo: `Venda configurada para ${venda.qtdParcelas}x, mas recebida parcela ${nParcelaAtual}.` });
        continue;
      }

      // --- REGRA: FLUXO SEQUENCIAL (Não pode pular parcelas) ---
      if (nParcelaAtual > 1) {
        const anteriorExiste = venda.pagamentos.some(p => p.numeroParcela === nParcelaAtual - 1);
        if (!anteriorExiste) {
          erros.push({ nota: nfRef, parcela: nParcelaAtual, motivo: `Pagamento da parcela ${nParcelaAtual - 1} não encontrado. O fluxo deve ser sequencial.` });
          continue;
        }
      }

      // --- REGRA: CRUZAMENTO DE VALORES (CONSISTÊNCIA FINANCEIRA) ---
      // Verificamos se o Bruto (Repasse + Comissões) bate com a divisão da BaseIcms
      const valorEsperadoBruto = Number(venda.baseIcms) / (venda.qtdParcelas || 1);
      if (Math.abs(valorBrutoDestaParcela - valorEsperadoBruto) > 1.0) { // Margem de R$ 1,00
        erros.push({ 
          nota: nfRef, 
          parcela: nParcelaAtual, 
          motivo: `Valor inconsistente. Esperado Bruto: ${valorEsperadoBruto.toFixed(2)}, Recebido: ${valorBrutoDestaParcela.toFixed(2)}` 
        });
        continue;
      }

      // --- REGRA: VERIFICAÇÃO E ATUALIZAÇÃO (UPSERT MANUAL) ---
      const pagamentoExistente = venda.pagamentos.find(p => p.numeroParcela === nParcelaAtual);

      if (pagamentoExistente) {
        // Se já existe, apenas ATUALIZAMOS os campos, nunca criamos duplicados (respeitando o @@unique)
        const pgtoAtualizado = await tx.pagamento.update({
          where: { id: pagamentoExistente.id },
          data: {
            valor: valorRepasse,
            comissaoRetida: taxas,
            data: pgto.data ? new Date(pgto.data) : new Date(),
            loja: pgto.loja || venda.loja
          }
        });
        // Atualiza a memória para o recálculo do status abaixo
        venda.pagamentos = venda.pagamentos.map(p => p.id === pgtoAtualizado.id ? pgtoAtualizado : p);
        atualizados++;
      } else {
        // Se não existe, criamos o novo registro
        const novoPgto = await tx.pagamento.create({
          data: {
            vendaId: venda.id,
            nfVenda: nfRef,
            numeroParcela: nParcelaAtual,
            valor: valorRepasse,
            comissaoRetida: taxas,
            data: pgto.data ? new Date(pgto.data) : new Date(),
            loja: pgto.loja || venda.loja
          }
        });
        venda.pagamentos.push(novoPgto);
        criados++;
      }

      // --- RECALCULO DE STATUS DA VENDA ---
      const totalBrutoRecebido = venda.pagamentos.reduce((acc, p) => acc + Number(p.valor) + Number(p.comissaoRetida), 0);
      const totalBaseVenda = Number(venda.baseIcms);
      const totalParcelasPagas = venda.pagamentos.length;
      
      let novoStatus: any = 'PARCIALMENTE_PAGO';

      // Se pagou todas as parcelas E o valor bate com a BaseIcms (margem de 50 centavos)
      if (totalParcelasPagas >= (venda.qtdParcelas || 0)) {
        const diferencaFinal = Math.abs(totalBaseVenda - totalBrutoRecebido);
        if (diferencaFinal <= 0.50) {
          novoStatus = 'PAGO';
        }
      }

      await tx.venda.update({
        where: { id: venda.id },
        data: { status: novoStatus }
      });
    }
  }, { timeout: 600000 });

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