import { Router, Request, Response } from 'express';
import { pagamentoService } from '../services/pagamento.service';
import { ensureAuthenticated } from '../middlewares/auth.middleware';

export const pagamentoRoutes = Router();

pagamentoRoutes.get('/', async (req: Request, res: Response) => {
  try {
    const pagamentos = await pagamentoService.getAll();
    return res.json(pagamentos);
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
});

pagamentoRoutes.post('/', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const pagamento = await pagamentoService.create(req.body);
    return res.status(201).json(pagamento);
  } catch (error: any) {
    return res.status(400).json({ message: error.message });
  }
});

pagamentoRoutes.post('/import', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    let dadosImportacao = req.body;
    
    if (req.body.pagamentos && Array.isArray(req.body.pagamentos)) {
        dadosImportacao = req.body.pagamentos;
    }

    if (!Array.isArray(dadosImportacao)) {
      return res.status(400).json({ 
        message: "Formato inválido. Esperado um array de pagamentos." 
      });
    }

    const result = await pagamentoService.importBulk(dadosImportacao);
    
    return res.status(201).json(result);

  } catch (error: any) {
    return res.status(400).json({ 
      message: error.message || "Erro interno ao processar arquivo." 
    });
  }
});

pagamentoRoutes.delete('/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await pagamentoService.delete(id as string);
    return res.status(204).send();
  } catch (error: any) {
    return res.status(400).json({ message: error.message });
  }
});