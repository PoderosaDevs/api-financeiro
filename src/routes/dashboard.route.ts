import { Router, Request, Response } from "express";
import { dashboardService } from "../services/dashboard.service";
import { ensureAuthenticated } from "../middlewares/auth.middleware";

export const dashboardRoutes = Router();

// Aplica a autenticação para todas as métricas do dashboard, se necessário
dashboardRoutes.use(ensureAuthenticated);

/**
 * GET /dashboard
 * Retorna o consolidado de vendas, pagamentos, dados para o gráfico de linha e ranking
 */
dashboardRoutes.get("/", async (req: Request, res: Response) => {
  try {
    console.log("chegou")
    const dataInicio = req.query.dataInicio as string;
    const dataFim = req.query.dataFim as string;

    // Busca a agregação inteligente que criamos no vendaService
    const analytics = await dashboardService.getDashboardAnalytics(dataInicio, dataFim);
    
    return res.json(analytics);
  } catch (error: any) {
    return res.status(500).json({ 
      message: error.message || "Erro interno ao processar indicadores do dashboard." 
    });
  }
});