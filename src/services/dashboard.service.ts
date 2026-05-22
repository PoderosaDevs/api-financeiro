import { prisma } from '../prisma/client'
import { startOfMonth, subMonths, endOfMonth, format } from "date-fns";

// Definição dos tipos de retorno para organizar sua API
interface DashboardData {
  resumoFinanceiro: {
    totalVendas: number;
    totalPagamentos: number;
    totalMarketplaces: number;
    valoresPendentes: number;
  };
  dadosGraficoLinha: Array<{
    mes: string;
    marketplace: string;
    valorTotal: number;
  }>;
  rankingMarketplaces: Array<{
    marketplaceId: string;
    nome: string;
    totalVendas: number;
  }>;
}

export const dashboardService = {
  async getDashboardAnalytics(dataInicio?: string, dataFim?: string): Promise<DashboardData> {
    // Tratamento de datas para o Filtro de Período Geral (Padrão: últimos 6 meses)
    const dataFimFiltro = dataFim ? new Date(dataFim) : endOfMonth(new Date());
    const dataInicioFiltro = dataInicio ? new Date(dataInicio) : startOfMonth(subMonths(dataFimFiltro, 5));

    // 1. Busca todas as vendas do período com os relacionamentos necessários
    const vendas = await prisma.venda.findMany({
      where: {
        dataVenda: {
          gte: dataInicioFiltro,
          lte: dataFimFiltro,
        },
      },
      include: {
        marketplace: true,
        pagamentos: true,
      },
    });

    // --- SERVICE 1: RESUMO FINANCEIRO ---
    let totalVendas = 0;
    let totalPagamentos = 0;
    const marketplacesUnicosSet = new Set<string>();

    // Mapeamento para auxiliar nos agrupamentos do gráfico e ranking
    const agrupamentoGrafico: { [key: string]: number } = {};
    const agrupamentoRanking: { [key: string]: { nome: string; total: number } } = {};

    // Array de meses em português para o gráfico alinhar com a imagem (Jan, Fev, Mar...)
    const mesesPt = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

    vendas.forEach((venda) => {
      const valorVenda = Number(venda.baseIcms || 0);
      totalVendas += valorVenda;

      // Soma de pagamentos vinculados a esta venda
      const somaPagamentosVenda = venda.pagamentos.reduce((acc, pag) => acc + Number(pag.valor || 0), 0);
      totalPagamentos += somaPagamentosVenda;

      // Marketplace tracker
      if (venda.marketplaceId) {
        marketplacesUnicosSet.add(venda.marketplaceId);
        
        // --- SERVICE 3: PREPARAÇÃO DO RANKING ---
        const nomeMkt = venda.marketplace?.titulo || "Não Informado"; // Ajuste se o campo no seu schema for outro (ex: 'loja')
        if (!agrupamentoRanking[venda.marketplaceId]) {
          agrupamentoRanking[venda.marketplaceId] = { nome: nomeMkt, total: 0 };
        }
        agrupamentoRanking[venda.marketplaceId].total += valorVenda;
      }

      // --- SERVICE 2: PREPARAÇÃO DO GRÁFICO (Por Mês e Marketplace) ---
      if (venda.marketplaceId) {
        const dataVendaObj = new Date(venda.dataVenda);
        const nomeMes = mesesPt[dataVendaObj.getMonth()]; // Retorna 'Jan', 'Fev', etc.
        const nomeMkt = venda.marketplace?.titulo || "Desconhecido";
        
        // Chave composta para agrupar
        const chaveAgrupamento = `${nomeMes}_${venda.marketplaceId}_${nomeMkt}`;
        
        if (!agrupamentoGrafico[chaveAgrupamento]) {
          agrupamentoGrafico[chaveAgrupamento] = 0;
        }
        agrupamentoGrafico[chaveAgrupamento] += valorVenda;
      }
    });

    // Cálculo do valor pendente (Subtração)
    const valoresPendentes = totalVendas - totalPagamentos;

    // --- FORMATAÇÃO FINAL - SERVICE 2 (Gráfico de Linha) ---
    const dadosGraficoLinha = Object.keys(agrupamentoGrafico).map((chave) => {
      const [mes, , marketplace] = chave.split("_");
      return {
        mes,
        marketplace,
        valorTotal: Number(agrupamentoGrafico[chave].toFixed(2)),
      };
    });

    // Ordenar os dados do gráfico baseado na ordem cronológica dos meses recebidos do período
    // Dica: Seu frontend pode usar esse array plano e dividi-lo por "marketplace" usando bibliotecas como Chart.js ou Recharts.

    // --- FORMATAÇÃO FINAL - SERVICE 3 (Ranking) ---
    const rankingMarketplaces = Object.keys(agrupamentoRanking)
      .map((mktId) => ({
        marketplaceId: mktId,
        nome: agrupamentoRanking[mktId].nome,
        totalVendas: Number(agrupamentoRanking[mktId].total.toFixed(2)),
      }))
      .sort((a, b) => b.totalVendas - a.totalVendas); // Do maior para o menor

    // Retorno unificado de todos os indicadores
    return {
      resumoFinanceiro: {
        totalVendas: Number(totalVendas.toFixed(2)),
        totalPagamentos: Number(totalPagamentos.toFixed(2)),
        totalMarketplaces: marketplacesUnicosSet.size,
        valoresPendentes: Number(valoresPendentes.toFixed(2)),
      },
      dadosGraficoLinha,
      rankingMarketplaces,
    };
  },
};