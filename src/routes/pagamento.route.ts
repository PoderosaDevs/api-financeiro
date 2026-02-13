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
    // FLEXIBILIDADE DE PAYLOAD:
    // Aceita tanto um array direto `[...]` quanto um objeto `{ pagamentos: [...] }`
    // Isso evita erros comuns de integração front/back.
    let dadosImportacao = req.body;
    
    if (req.body.pagamentos && Array.isArray(req.body.pagamentos)) {
        dadosImportacao = req.body.pagamentos;
    }

    // Validação básica de segurança
    if (!Array.isArray(dadosImportacao)) {
      return res.status(400).json({ 
        message: "Formato inválido. Esperado um array de pagamentos." 
      });
    }

    console.log(`📡 [API] Recebendo ${dadosImportacao.length} itens para importação.`);

    // Chama o serviço
    const result = await pagamentoService.importBulk(dadosImportacao);
    
    // Retorna 201 (Created) com o resumo
    return res.status(201).json(result);

  } catch (error: any) {
    console.error("❌ Erro crítico na importação:", error);
    return res.status(400).json({ 
      message: error.message || "Erro interno ao processar arquivo." 
    });
  }
});


// Exclusão
pagamentoRoutes.delete('/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    await pagamentoService.delete(req.params.id)
    return res.status(204).send()
  } catch (error: any) {
    return res.status(400).json({ message: error.message })
  }
})