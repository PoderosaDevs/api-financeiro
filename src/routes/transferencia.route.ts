import { Router, Request, Response } from 'express';
import { ensureAuthenticated } from '../middlewares/auth.middleware';
import { transferenciaService } from '../services/transferencias.service';

export const transferenciaRoutes = Router();

transferenciaRoutes.post('/reembolsos/manual', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const data = req.body;
    const result = await transferenciaService.createReembolso(data);
    return res.status(201).json(result);
  } catch (error: any) {
    return res.status(400).json({ message: error.message });
  }
});

transferenciaRoutes.post('/devolucoes/manual', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const data = req.body;
    const result = await transferenciaService.createDevolucao(data);
    return res.status(201).json(result);
  } catch (error: any) {
    return res.status(400).json({ message: error.message });
  }
});

transferenciaRoutes.post('/import-reembolsos', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const reembolsos = Array.isArray(req.body) ? req.body : req.body.reembolsos;

    if (!Array.isArray(reembolsos)) {
      return res.status(400).json({ message: "Formato inválido. Esperado um array de reembolsos." });
    }

    const result = await transferenciaService.importReembolsos(reembolsos);
    return res.status(201).json(result);
  } catch (error: any) {
    return res.status(400).json({ message: error.message });
  }
});

transferenciaRoutes.post('/import-devolucoes', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const devolucoes = Array.isArray(req.body) ? req.body : req.body.devolucoes;

    if (!Array.isArray(devolucoes)) {
      return res.status(400).json({ message: "Formato inválido. Esperado um array de devoluções." });
    }

    const result = await transferenciaService.importDevolucoes(devolucoes);
    return res.status(201).json(result);
  } catch (error: any) {
    return res.status(400).json({ message: error.message });
  }
});

transferenciaRoutes.get('/devolucoes', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const result = await transferenciaService.getAllDevolucoes();
    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
});

transferenciaRoutes.get('/devolucoes/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const result = await transferenciaService.getDevolucaoById(req.params.id);
    if (!result) return res.status(404).json({ message: "Devolução não encontrada." });
    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
});

transferenciaRoutes.put('/devolucoes/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const result = await transferenciaService.updateDevolucao(req.params.id, req.body);
    return res.json(result);
  } catch (error: any) {
    return res.status(400).json({ message: error.message });
  }
});

transferenciaRoutes.delete('/devolucoes/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    await transferenciaService.deleteDevolucao(req.params.id);
    return res.status(204).send();
  } catch (error: any) {
    return res.status(400).json({ message: error.message });
  }
});