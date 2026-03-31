import { Router } from "express";
import { vendaService } from "../services/venda.service";
import { ensureAuthenticated } from "../middlewares/auth.middleware";
import { Request, Response } from "express";

export const vendaRoutes = Router();

// Listagem Paginada
vendaRoutes.get("/", async (req: Request, res: Response) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 50;
  const dataInicio = req.query.dataInicio as string;
  const dataFim = req.query.dataFim as string;
  const status = req.query.status as string;
  const marketplaceId = req.query.marketplaceId as string;

  const result = await vendaService.getAll(
    page,
    limit,
    dataInicio,
    dataFim,
    status,
    marketplaceId
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

// --- ROTA DE EXPORTAÇÃO ---
// Esta rota ignora a paginação para garantir que o CSV contenha todos os registros do período.
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
    console.error("[ERROR_VENDA_EXPORT]:", error);
    return res
      .status(500)
      .json({ message: "Erro interno ao processar exportação." });
  }
});

// Listagem Geral do Frete
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

// Busca Única
vendaRoutes.get("/:id", async (req: Request, res: Response) => {
  const venda = await vendaService.getById(req.params.id);
  return venda
    ? res.json(venda)
    : res.status(404).json({ message: "Venda não encontrada" });
});

// Cadastro Manual (Já com tratamento de NF duplicada)
vendaRoutes.post(
  "/",
  ensureAuthenticated,
  async (req: Request, res: Response) => {
    try {
      const venda = await vendaService.create(req.body);
      return res.status(201).json(venda);
    } catch (error: any) {
      // Retorna a mensagem "A NF X já está cadastrada" definida no service
      return res.status(400).json({ message: error.message });
    }
  },
);

// IMPORTAÇÃO EM MASSA (Planilha)
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

      // Chama o service modificado
      const result = await vendaService.createMany(vendas);

      return res.status(201).json(result);
    } catch (error: any) {
      console.error("Erro importação:", error);
      return res
        .status(400)
        .json({ message: error.message || "Erro ao importar vendas" });
    }
  },
);

// IMPORTAÇÃO EM MASSA (Planilha de Fretes)
vendaRoutes.post(
  "/frete/import",
  ensureAuthenticated,
  async (req: Request, res: Response) => {
    try {
      // Pega o array que o frontend enviou (tratando caso venha solto ou dentro de uma chave)
      const planilhaFretes = Array.isArray(req.body)
        ? req.body
        : req.body.fretes || req.body.data;

      if (!Array.isArray(planilhaFretes)) {
        return res
          .status(400)
          .json({ message: "Formato inválido. Esperado um array de fretes." });
      }

      // Chama o novo service focado em checar e atualizar os fretes
      const result = await vendaService.processarFretesEmMassa(planilhaFretes);

      // Retorna 200 (OK) enviando exatamente o { successCount, errors } que o frontend espera
      return res.status(200).json(result);
    } catch (error: any) {
      console.error("Erro na importação de fretes:", error);
      return res.status(400).json({
        message: error.message || "Erro ao importar faturas de frete",
      });
    }
  },
);
// Atualização
vendaRoutes.put(
  "/:id",
  ensureAuthenticated,
  async (req: Request, res: Response) => {
    try {
      const updated = await vendaService.update(req.params.id, req.body);
      return res.json(updated);
    } catch (error: any) {
      return res.status(400).json({ message: error.message });
    }
  },
);

// Exclusão
vendaRoutes.delete(
  "/:id",
  ensureAuthenticated,
  async (req: Request, res: Response) => {
    try {
      await vendaService.delete(req.params.id);
      return res.status(204).send();
    } catch (error: any) {
      return res.status(400).json({ message: error.message });
    }
  },
);
