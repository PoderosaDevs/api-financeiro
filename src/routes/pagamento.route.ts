import { Router } from 'express'
import { pagamentoService } from '../services/pagamento.service'
import { ensureAuthenticated } from '../middlewares/auth.middleware'
import { Request, Response } from "express";

export const pagamentoRoutes = Router()

// Listagem Geral
pagamentoRoutes.get('/', async (req: Request, res: Response) => {
  try {
    const pagamentos = await pagamentoService.getAll()
    return res.json(pagamentos)
  } catch (error: any) {
    return res.status(500).json({ message: error.message })
  }
})

// Cadastro Individual Manual
pagamentoRoutes.post('/', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const pagamento = await pagamentoService.create(req.body)
    return res.status(201).json(pagamento)
  } catch (error: any) {
    return res.status(400).json({ message: error.message })
  }
})

// --- NOVA ROTA: IMPORTAÇÃO EM MASSA (PLANILHA) ---
pagamentoRoutes.post('/import', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    // O front-end deve enviar um array de objetos no corpo da requisição: { pagamentos: [...] }
    const pagamentos = Array.isArray(req.body) ? req.body : req.body.pagamentos;

    if (!Array.isArray(pagamentos)) {
      return res.status(400).json({ message: "Formato inválido. Esperado um array de pagamentos." });
    }

    const result = await pagamentoService.importBulk(pagamentos)
    return res.status(201).json(result)
  } catch (error: any) {
    return res.status(400).json({ message: error.message })
  }
})


// Exclusão
pagamentoRoutes.delete('/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    await pagamentoService.delete(req.params.id)
    return res.status(204).send()
  } catch (error: any) {
    return res.status(400).json({ message: error.message })
  }
})