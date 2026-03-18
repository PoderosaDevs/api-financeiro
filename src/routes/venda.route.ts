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

// Listagem Geral do Frete
vendaRoutes.get('/frete', async (req: Request, res: Response) => {
  const vendas = await vendaService.getAllFrete()
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
    const vendas = Array.isArray(req.body) ? req.body : req.body.vendas;

    if (!Array.isArray(vendas)) {
      return res.status(400).json({ message: "Formato inválido. Esperado um array de vendas." });
    }

    // Chama o service modificado
    const result = await vendaService.createMany(vendas);

    return res.status(201).json(result);
  } catch (error: any) {
    console.error("Erro importação:", error);
    return res.status(400).json({ message: error.message || "Erro ao importar vendas" });
  }
});

// IMPORTAÇÃO EM MASSA (Planilha de Fretes)
vendaRoutes.post('/frete/import', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    // Pega o array que o frontend enviou (tratando caso venha solto ou dentro de uma chave)
    const planilhaFretes = Array.isArray(req.body) ? req.body : req.body.fretes || req.body.data;

    if (!Array.isArray(planilhaFretes)) {
      return res.status(400).json({ message: "Formato inválido. Esperado um array de fretes." });
    }

    // Chama o novo service focado em checar e atualizar os fretes
    const result = await vendaService.processarFretesEmMassa(planilhaFretes);

    // Retorna 200 (OK) enviando exatamente o { successCount, errors } que o frontend espera
    return res.status(200).json(result);
  } catch (error: any) {
    console.error("Erro na importação de fretes:", error);
    return res.status(400).json({ message: error.message || "Erro ao importar faturas de frete" });
  }
});
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