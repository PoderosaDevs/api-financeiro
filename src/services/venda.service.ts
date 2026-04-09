
import { VendaStatus, Prisma } from "@prisma/client";
import { prisma } from "../prisma/client";
import { getIntervaloDatas } from "../utils/getIntervaloDatas";
export const vendaService = {
  // --- BUSCAS PAGINADAS ---
  async getAll(
    page: number = 1,
    limit: number = 50,
    dataInicio?: string,
    dataFim?: string,
    status?: string,
    marketplaceId?: string,
    search?: string
  ) {
    const skip = (page - 1) * limit;

    let where: Prisma.VendaWhereInput = {};

    if (search && search.trim() !== "") {
      where = {
        OR: [
          { nf: { contains: search.trim() } },
          { loja: { contains: search.trim(), mode: 'insensitive' } }
        ]
      };
    } else {
      const { inicio, fim } = getIntervaloDatas(dataInicio, dataFim);
      const statusArray = status ? (status.split(",") as VendaStatus[]) : undefined;

      where = {
        dataVenda: { gte: inicio, lte: fim },
        ...(statusArray && { status: { in: statusArray } }),
        ...(marketplaceId && { marketplaceId }),
      };
    }

    const [vendas, total] = await Promise.all([
      prisma.venda.findMany({
        where,
        skip,
        take: limit,
        include: {
          marketplace: true,
          pagamentos: { orderBy: { numeroParcela: "asc" } },
          devolucoes: true,
          reembolsos: true,
        },
        orderBy: { dataVenda: "desc" },
      }),
      prisma.venda.count({ where }),
    ]);

    return {
      data: vendas,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  },

  // --- SUMÁRIO DE MÉTRICAS (RESOLVE O PROBLEMA DO LIMIT 50) ---

  async getSummary(
    dataInicio?: string,
    dataFim?: string,
    status?: string,
    marketplaceId?: string,
  ) {
    const { inicio, fim } = getIntervaloDatas(dataInicio, dataFim);

    const where: any = {
      dataVenda: { gte: inicio, lte: fim },
    };

    if (status) {
      const statusArray = status.split(",");
      where.status = { in: statusArray };
    }

    if (marketplaceId) {
      where.marketplaceId = marketplaceId;
    }

    const [vendasAgregadas, pagamentosAgregados, totalVendas] =
      await Promise.all([
        prisma.venda.aggregate({
          where,
          _sum: {
            baseIcms: true,
            comissaoVenda: true,
            comissaoFrete: true,
            frete_e_taxas: true,
            liquidoReceber: true,
          },
        }),
        prisma.pagamento.aggregate({
          where: {
            venda: where,
          },
          _sum: {
            valor: true,
          },
        }),
        prisma.venda.count({ where }),
      ]);

    const receitaBruta = Number(vendasAgregadas._sum.baseIcms || 0);
    const receitaRecebida = Number(pagamentosAgregados._sum.valor || 0);

    const statusPendentes = ["PENDENTE"];
    const wherePendentes = {
      ...where,
      status: { in: statusPendentes },
    };

    if (status) {
      const statusArray = status.split(",");
      const intersect = statusArray.filter((s) => statusPendentes.includes(s));
      wherePendentes.status = {
        in: intersect.length > 0 ? intersect : ["FORCAR_VAZIO"],
      };
    }

    const vendasPendentes = await prisma.venda.aggregate({
      where: wherePendentes,
      _sum: {
        baseIcms: true,
      },
    });

    const faltaReceber = Number(vendasPendentes._sum.baseIcms || 0);

    const comissoesDescontadas =
      Number(vendasAgregadas._sum.comissaoVenda || 0) +
      Number(vendasAgregadas._sum.comissaoFrete || 0);

    const fretesETarifas = Number(vendasAgregadas._sum.frete_e_taxas || 0);

    return {
      vendasNoPeriodo: totalVendas,
      receitaBruta: Number(receitaBruta.toFixed(2)),
      faltaReceber: Number(faltaReceber.toFixed(2)),
      receitaRecebida: Number(receitaRecebida.toFixed(2)),
      comissoesDescontadas: Number(comissoesDescontadas.toFixed(2)),
      fretesETarifas: Number(fretesETarifas.toFixed(2)),
    };
  },

  // --- VERIFICAÇÃO DE DUPLICIDADE (PRÉ-IMPORTAÇÃO) ---
  async verifyDuplicity(sales: any[]) {
    const results = await Promise.all(
      sales.map(async (sale) => {
        const nfRef = sale.nf || sale.nfVenda;

        if (!nfRef) {
          return {
            ...sale,
            status: "error",
            motivo: "NF não informada",
          };
        }

        const existingVenda = await prisma.venda.findFirst({
          where: { nf: String(nfRef) },
          include: { marketplace: true }
        });

        return {
          ...sale,
          status: existingVenda ? "exists" : "not_found",
          dadosOriginais: existingVenda || null,
        };
      })
    );

    return results;
  },

  // --- EXPORTAÇÃO COM FILTROS AVANÇADOS ---
  async getExportData(filters: {
    startDate?: string;
    endDate?: string;
    marketplaceId?: string;
    status?: string;
  }) {
    // Usamos o seu util aqui também para manter o padrão de 00:00:00 e 23:59:59
    const { inicio, fim } = getIntervaloDatas(
      filters.startDate,
      filters.endDate,
    );

    const where: any = {
      dataVenda: { gte: inicio, lte: fim },
    };

    if (filters.marketplaceId && filters.marketplaceId !== "all") {
      where.marketplaceId = filters.marketplaceId;
    }

    if (filters.status && filters.status !== "all") {
      where.status = filters.status;
    }

    return await prisma.venda.findMany({
      where,
      include: {
        marketplace: true,
        pagamentos: true,
        devolucoes: true,
        reembolsos: true,
      },
      orderBy: { dataVenda: "asc" },
    });
  },

  // --- LISTAGEM DE FRETES (LOGÍSTICA) ---
  async getAllFrete(
    page: number = 1,
    limit: number = 50,
    search?: string,
    status?: string,
  ) {
    const skip = (page - 1) * limit;

    const whereClause: any = {
      marketplace: { freteParte: true },
    };

    if (search) {
      whereClause.OR = [
        { nf: { contains: search, mode: "insensitive" } },
        { NumeroFatura: { contains: search, mode: "insensitive" } },
      ];
    }

    if (status === "pago") {
      whereClause.fretePago = true;
    } else if (status === "pendente") {
      whereClause.fretePago = false;
    }

    const [vendas, total] = await prisma.$transaction([
      prisma.venda.findMany({
        skip,
        take: limit,
        where: whereClause,
        include: {
          marketplace: true,
          pagamentos: { orderBy: { numeroParcela: "asc" } },
        },
        orderBy: { dataVenda: "desc" },
      }),
      prisma.venda.count({ where: whereClause }),
    ]);

    return { vendas, total };
  },

  async getById(id: string) {
    return await prisma.venda.findUnique({
      where: { id },
      include: { marketplace: true, pagamentos: true },
    });
  },

  // --- CRIAÇÃO E ATUALIZAÇÃO ---
  async create(data: any) {
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
        qtdParcelas: data.qtdParcelas ? Number(data.qtdParcelas) : null,
      },
    });
  },

  async createMany(vendas: any[]) {
    const nfsPlanilha = vendas.filter((v) => v.nf).map((v) => String(v.nf));
    const existentes = await prisma.venda.findMany({
      where: { nf: { in: nfsPlanilha } },
      select: { nf: true },
    });
    const nfsExistentes = new Set(existentes.map((v) => v.nf));

    const paraCadastrar = vendas
      .filter((v) => v.nf && !nfsExistentes.has(String(v.nf)))
      .map((v) => {
        const base = Number(v.baseIcms || 0);
        return {
          nf: String(v.nf),
          loja: v.loja || "LOJA PADRAO",
          marketplaceId: v.marketplaceId || null,
          baseIcms: base,
          dataVenda: v.dataVenda ? new Date(v.dataVenda) : new Date(),
          comissaoVenda: 0,
          comissaoFrete: 0,
          desconto: 0,
          liquidoReceber: 0,
          status: VendaStatus.PENDENTE,
          qtdParcelas: 0,
        };
      });

    if (paraCadastrar.length === 0)
      return { count: 0, message: "Sem novas NFs para importar." };

    const result = await prisma.venda.createMany({
      data: paraCadastrar,
      skipDuplicates: true,
    });
    return {
      count: result.count,
      message: `${result.count} vendas importadas.`,
    };
  },

  async processarFretesEmMassa(planilhaFretes: any[]) {
    const nfsPlanilha = planilhaFretes
      .filter((item) => item.nf)
      .map((item) => String(item.nf));
    if (nfsPlanilha.length === 0) return { successCount: 0, errors: [] };

    const vendasNoBanco = await prisma.venda.findMany({
      where: { nf: { in: nfsPlanilha } },
      select: { id: true, nf: true, fretePago: true },
    });

    const mapaVendasDb = new Map(vendasNoBanco.map((v) => [v.nf, v]));
    const paraAtualizar = [];
    const errors = [];

    for (const item of planilhaFretes) {
      const nf = String(item.nf);
      const vendaDb = mapaVendasDb.get(nf);

      if (!vendaDb) {
        errors.push({ nf, motivo: "NÃO ENCONTRADO" });
        continue;
      }
      if (vendaDb.fretePago) {
        errors.push({ nf, motivo: "JÁ PAGO" });
        continue;
      }

      paraAtualizar.push({ id: vendaDb.id, fatura: item.fatura || null });
    }

    if (paraAtualizar.length > 0) {
      await prisma.$transaction(
        paraAtualizar.map((d) =>
          prisma.venda.update({
            where: { id: d.id },
            data: { fretePago: true, NumeroFatura: d.fatura },
          }),
        ),
      );
    }

    return { successCount: paraAtualizar.length, errors };
  },

  async update(id: string, data: any) {
    const current = await prisma.venda.findUnique({ where: { id } });
    if (!current) throw new Error("Venda não encontrada");

    let finalQtd = current.qtdParcelas;
    if (current.qtdParcelas === null && data.qtdParcelas)
      finalQtd = Number(data.qtdParcelas);

    const liquido =
      Number(data.baseIcms ?? current.baseIcms) -
      Number(data.comissaoVenda ?? current.comissaoVenda) -
      Number(data.comissaoFrete ?? current.comissaoFrete) -
      Number(data.desconto ?? current.desconto);

    return await prisma.venda.update({
      where: { id },
      data: { ...data, liquidoReceber: liquido, qtdParcelas: finalQtd },
    });
  },

  async delete(id: string) {
    return await prisma.venda.delete({ where: { id } });
  },
};
