import { VendaStatus } from "@prisma/client";
import { prisma } from "../prisma/client";

export const vendaService = {
  // --- BUSCAS ---
  // --- BUSCAS ---
  async getAll() {
    return await prisma.venda.findMany({
      include: { 
        marketplace: true, 
        // Ordena os pagamentos internos para a barra de progresso ficar certa
        pagamentos: {
            orderBy: { numeroParcela: 'asc' }
        },
        devolucoes: true,
        reembolsos: true,

      },
      // Ordena pela data que a venda aconteceu, do mais novo pro mais velho
      orderBy: { dataVenda: "desc" }, 
    });
  },

   async getAllFrete() {
    return await prisma.venda.findMany({
      include: { 
        marketplace: true, 
        pagamentos: {
            orderBy: { numeroParcela: 'asc' }
        }
      },
      where: {
        marketplace: {
          freteParte: true
        }, 
      },
      // Ordena pela data que a venda aconteceu, do mais novo pro mais velho
      orderBy: { dataVenda: "desc" }, 
    });
  },

  async getById(id: string) {
    return await prisma.venda.findUnique({
      where: { id },
      include: { marketplace: true, pagamentos: true },
    });
  },

  // --- CRIAÇÃO UNITÁRIA ---
  async create(data: any) {
    // Normalização: evita erro de 'nf: undefined'
    const nfRef = data.nf || data.nfVenda;
    if (!nfRef) throw new Error("O número da NF é obrigatório.");

    const exists = await prisma.venda.findUnique({
      where: { nf: String(nfRef) },
    });
    if (exists) throw new Error(`A NF ${nfRef} já está cadastrada.`);

    const liquido =
      Number(data.baseIcms || 0) -
      (Number(data.comissaoVenda) || 0) -
      (Number(data.comissaoFrete) || 0) -
      (Number(data.desconto) || 0);

    return await prisma.venda.create({
      data: {
        nf: String(nfRef),
        loja: data.loja,
        marketplaceId: data.marketplaceId,
        baseIcms: Number(data.baseIcms || 0),
        comissaoVenda: Number(data.comissaoVenda || 0),
        comissaoFrete: Number(data.comissaoFrete || 0),
        desconto: Number(data.desconto || 0),
        liquidoReceber: liquido,
        // Define parcelas se enviado, caso contrário null
        qtdParcelas: data.qtdParcelas ? Number(data.qtdParcelas) : null,
      },
    });
  },

  // --- IMPORTAÇÃO EM MASSA (VENDAS) ---
  // vendaService.ts

  async createMany(vendas: any[]) {
    // 1. Normaliza as NFs para verificação de duplicidade
    const nfsPlanilha = vendas.filter((v) => v.nf).map((v) => String(v.nf));

    // 2. Busca NFs já existentes no banco
    const existentes = await prisma.venda.findMany({
      where: { nf: { in: nfsPlanilha } },
      select: { nf: true },
    });
    const nfsExistentes = new Set(existentes.map((v) => v.nf)); // Set é mais rápido para buscas

    // 3. Filtra e Mapeia os novos dados
    const paraCadastrar = vendas
      .filter((v) => {
        const nf = String(v.nf);
        return nf && !nfsExistentes.has(nf);
      })
      .map((v) => {
        const base = Number(v.baseIcms || 0);

        // Tratamento da Data: se vier vazia, usa a data atual
        let dataVendaDb = new Date();
        if (v.dataVenda) {
          // Tenta converter. Se for inválido, mantém a data atual ou null (depende do seu schema)
          const parsed = new Date(v.dataVenda);
          if (!isNaN(parsed.getTime())) {
            dataVendaDb = parsed;
          }
        }

        return {
          nf: String(v.nf),
          loja: v.loja || "LOJA PADRAO", // Garante que não quebre se vier vazio
          marketplaceId: v.marketplaceId || null, // Front pode mandar null

          baseIcms: base,
          dataVenda: dataVendaDb, // Campo NOVO adicionado

          // Campos que o front parou de mandar, mas o banco exige (preenchemos com padrão)
          comissaoVenda: 0,
          comissaoFrete: 0,
          desconto: 0,
          liquidoReceber: 0, // Inicialmente o líquido é igual a base (sem descontos)

          status: VendaStatus.PENDENTE, // Status padrão inicial
          qtdParcelas: 0,
        };
      });

    if (paraCadastrar.length === 0) {
      return {
        count: 0,
        message: "Todas as NFs da planilha já existem no sistema.",
      };
    }

    // 4. Salva no banco
    const result = await prisma.venda.createMany({
      data: paraCadastrar,
      skipDuplicates: true,
    });

    return {
      count: result.count,
      message: `${result.count} vendas importadas com sucesso.`,
    };
  },

  // --- IMPORTAÇÃO EM MASSA (FRETES) ---
  async processarFretesEmMassa(planilhaFretes: any[]) {
    // 1. Normaliza as NFs que vieram da planilha para buscar no banco
    const nfsPlanilha = planilhaFretes
      .filter((item) => item.nf)
      .map((item) => String(item.nf));

    if (nfsPlanilha.length === 0) {
      return { successCount: 0, errors: [] };
    }

    // 2. Busca os registros no banco para ver o que existe e o que já foi pago
    const vendasNoBanco = await prisma.venda.findMany({
      where: { nf: { in: nfsPlanilha } },
      select: { 
        id: true, // Trazemos o ID para fazer o update com segurança
        nf: true, 
        fretePago: true 
      },
    });

    // Cria um mapa (Dicionário) para busca super rápida: { "1234": { id: "...", fretePago: false } }
    const mapaVendasDb = new Map(
      vendasNoBanco.map((v) => [v.nf, { id: v.id, fretePago: v.fretePago }])
    );

    const paraAtualizar = [];
    const errors = [];

    // 3. Classifica os dados da planilha (O que vai atualizar x O que dá erro)
    for (const item of planilhaFretes) {
      const nf = String(item.nf);
      const vendaDb = mapaVendasDb.get(nf);

      // Regra 1: A nota nem existe no banco
      if (!vendaDb) {
        errors.push({
          nf: nf,
          fatura: item.fatura || "",
          loja: item.loja || "DESCONHECIDA",
          motivo: "NÃO ENCONTRADO",
        });
        continue;
      }

      // Regra 2: A nota existe, mas o frete JÁ FOI PAGO
      if (vendaDb.fretePago) {
        errors.push({
          nf: nf,
          fatura: item.fatura || "",
          loja: item.loja || "DESCONHECIDA",
          motivo: "JÁ PAGO",
        });
        continue;
      }

      // Regra 3: Tudo certo, separa para atualizar
      paraAtualizar.push({
        id: vendaDb.id, // Usamos o ID do banco para não dar erro de constraint
        NumeroFatura: item.fatura || null, // Se vier vazio, salva como null
      });
    }

    // Se não houver nada válido para atualizar, já retorna os erros
    if (paraAtualizar.length === 0) {
      return { successCount: 0, errors };
    }

    // 4. Executa a atualização no banco de dados usando $transaction
    // O Prisma não tem um updateMany dinâmico (com faturas diferentes pra cada linha), 
    // então criamos um array de promises e rodamos na transaction.
    const transacoesUpdate = paraAtualizar.map((dados) =>
      prisma.venda.update({
        where: { id: dados.id },
        data: {
          fretePago: true, // Muda o status para pago
          NumeroFatura: dados.NumeroFatura, // Salva a fatura que veio do excel
        },
      })
    );

    await prisma.$transaction(transacoesUpdate);

    // 5. Retorna o formato exato que o Front-end está esperando
    return {
      successCount: paraAtualizar.length,
      errors: errors,
    };
  },

  // --- ATUALIZAÇÃO (IMUTABILIDADE) ---
  async update(id: string, data: any) {
    const current = await prisma.venda.findUnique({ where: { id } });
    if (!current) throw new Error("Venda não encontrada");

    // Regra de Imutabilidade das parcelas
    let finalQtd = current.qtdParcelas;
    const novaQtd = data.qtdParcelas || data.numeroParcelas;
    if (current.qtdParcelas === null && novaQtd) {
      finalQtd = Number(novaQtd);
    }

    const liquido =
      Number(data.baseIcms || current.baseIcms) -
      Number(data.comissaoVenda || current.comissaoVenda) -
      Number(data.comissaoFrete || current.comissaoFrete) -
      Number(data.desconto || current.desconto);

    return await prisma.venda.update({
      where: { id },
      data: {
        ...data,
        liquidoReceber: liquido,
        qtdParcelas: finalQtd,
      },
    });
  },

  async delete(id: string) {
    return await prisma.venda.delete({ where: { id } });
  },
};
