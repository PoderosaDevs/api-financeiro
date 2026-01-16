import { Router } from 'express'
import { vendaService } from '../services/venda.service'
import { ensureAuthenticated } from '../middlewares/auth.middleware'
import { Request, Response } from "express";

export const vendaRoutes = Router()

// Listagem Geral
vendaRoutes.get('/', async (req: Request, res: Response) => {
  const vendas = await vendaService.getAll()
  return res.json(vendas)
})

// Busca Única
vendaRoutes.get('/:id', async (req: Request, res: Response) => {
  const venda = await vendaService.getById(req.params.id)
  return venda ? res.json(venda) : res.status(404).json({ message: 'Venda não encontrada' })
})

// Cadastro Manual (Já com tratamento de NF duplicada)
vendaRoutes.post('/', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const venda = await vendaService.create(req.body)
    return res.status(201).json(venda)
  } catch (error: any) {
    // Retorna a mensagem "A NF X já está cadastrada" definida no service
    return res.status(400).json({ message: error.message })
  }
})

// IMPORTAÇÃO EM MASSA (Planilha)
vendaRoutes.post('/import', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    // Se o Front-end enviar o array direto no body, usamos req.body
    // Se enviar como { vendas: [] }, mantemos o const { vendas } = req.body
    const vendas = Array.isArray(req.body) ? req.body : req.body.vendas;

    if (!Array.isArray(vendas)) {
      return res.status(400).json({ message: "Formato inválido. Esperado um array de vendas." });
    }

    const result = await vendaService.createMany(vendas)

    // Retornamos o objeto completo do service: { count, skipped, message }
    // Isso permite que o Front-end mostre o alerta de NFs puladas
    return res.status(201).json(result)
  } catch (error: any) {
    return res.status(400).json({ message: error.message })
  }
})

// Atualização
vendaRoutes.put('/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const updated = await vendaService.update(req.params.id, req.body)
    return res.json(updated)
  } catch (error: any) {
    return res.status(400).json({ message: error.message })
  }
})

// Exclusão
vendaRoutes.delete('/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    await vendaService.delete(req.params.id)
    return res.status(204).send()
  } catch (error: any) {
    return res.status(400).json({ message: error.message })
  }
})