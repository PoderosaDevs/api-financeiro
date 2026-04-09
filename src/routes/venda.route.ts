import { Router, Request, Response } from "express";
import { vendaService } from "../services/venda.service";
import { ensureAuthenticated } from "../middlewares/auth.middleware";

export const vendaRoutes = Router();

vendaRoutes.get("/", async (req: Request, res: Response) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 50;
  const dataInicio = req.query.dataInicio as string;
  const dataFim = req.query.dataFim as string;
  const status = req.query.status as string;
  const marketplaceId = req.query.marketplaceId as string;
  const search = req.query.search as string;

  const result = await vendaService.getAll(
    page,
    limit,
    dataInicio,
    dataFim,
    status,
    marketplaceId,
    search
  );
  
  return res.json(result);
});

vendaRoutes.get("/summary", async (req: Request, res: Response) => {
  const dataInicio = req.query.dataInicio as string;
  const dataFim = req.query.dataFim as string;
  const status = req.query.status as string;
  const marketplaceId = req.query.marketplaceId as string;

  const summary = await vendaService.getSummary(
    dataInicio,
    dataFim,
    status,
    marketplaceId
  );
  
  return res.json(summary);
});

vendaRoutes.get("/export", async (req: Request, res: Response) => {
  try {
    const filters = {
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
      marketplaceId: req.query.marketplaceId as string,
      status: req.query.status as string,
    };

    const vendas = await vendaService.getExportData(filters);

    if (!vendas || vendas.length === 0) {
      return res
        .status(404)
        .json({
          message: "Nenhum dado encontrado para os filtros informados.",
        });
    }

    return res.json(vendas);
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Erro interno ao processar exportação." });
  }
});

vendaRoutes.get("/frete", async (req: Request, res: Response) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 50;
  const search = req.query.search as string;
  const status = req.query.status as string;

  try {
    const result = await vendaService.getAllFrete(page, limit, search, status);

    return res.json({
      data: result.vendas,
      total: result.total,
    });
  } catch (error) {
    return res.status(500).json({ error: "Erro ao buscar dados de frete" });
  }
});

vendaRoutes.get("/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const venda = await vendaService.getById(id as string);
  return venda
    ? res.json(venda)
    : res.status(404).json({ message: "Venda não encontrada" });
});

vendaRoutes.post(
  "/",
  ensureAuthenticated,
  async (req: Request, res: Response) => {
    try {
      const venda = await vendaService.create(req.body);
      return res.status(201).json(venda);
    } catch (error: any) {
      return res.status(400).json({ message: error.message });
    }
  },
);

vendaRoutes.post(
  "/import",
  ensureAuthenticated,
  async (req: Request, res: Response) => {
    try {
      const vendas = Array.isArray(req.body) ? req.body : req.body.vendas;

      if (!Array.isArray(vendas)) {
        return res
          .status(400)
          .json({ message: "Formato inválido. Esperado um array de vendas." });
      }

      const result = await vendaService.createMany(vendas);
      return res.status(201).json(result);
    } catch (error: any) {
      return res
        .status(400)
        .json({ message: error.message || "Erro ao importar vendas" });
    }
  },
);

vendaRoutes.post(
  "/verify",
  ensureAuthenticated,
  async (req: Request, res: Response) => {
    try {
      const sales = Array.isArray(req.body) ? req.body : req.body.sales;

      if (!Array.isArray(sales)) {
        return res
          .status(400)
          .json({ message: "Formato inválido. Esperado um array de vendas." });
      }

      const result = await vendaService.verifyDuplicity(sales);
      return res.status(200).json(result);
    } catch (error: any) {
      return res
        .status(500)
        .json({ message: error.message || "Erro ao verificar duplicidade" });
    }
  },
);

vendaRoutes.post(
  "/frete/import",
  ensureAuthenticated,
  async (req: Request, res: Response) => {
    try {
      const planilhaFretes = Array.isArray(req.body)
        ? req.body
        : req.body.fretes || req.body.data;

      if (!Array.isArray(planilhaFretes)) {
        return res
          .status(400)
          .json({ message: "Formato inválido. Esperado um array de fretes." });
      }

      const result = await vendaService.processarFretesEmMassa(planilhaFretes);
      return res.status(200).json(result);
    } catch (error: any) {
      return res.status(400).json({
        message: error.message || "Erro ao importar faturas de frete",
      });
    }
  },
);

vendaRoutes.put(
  "/:id",
  ensureAuthenticated,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const updated = await vendaService.update(id as string, req.body);
      return res.json(updated);
    } catch (error: any) {
      return res.status(400).json({ message: error.message });
    }
  },
);

vendaRoutes.delete(
  "/:id",
  ensureAuthenticated,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      await vendaService.delete(id as string);
      return res.status(204).send();
    } catch (error: any) {
      return res.status(400).json({ message: error.message });
    }
  },
);