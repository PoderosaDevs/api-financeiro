import { Router } from 'express'
import * as marketplaceService from '../services/marketplace.service'
import { ensureAuthenticated } from '../middlewares/auth.middleware'
import { Request, Response } from "express";

export const marketplaceRoutes = Router()

marketplaceRoutes.get('/', async (req, res) => {
  const marketplaces = await marketplaceService.getAllMarketplaces()
  return res.json(marketplaces)
})

marketplaceRoutes.get('/:id', async (req: Request, res: Response) => {
  try {
    const marketplace = await marketplaceService.getMarketplaceById(req.params.id)
    return res.json(marketplace)
  } catch (error: any) {
    return res.status(404).json({ message: error.message })
  }
})

marketplaceRoutes.post('/', ensureAuthenticated, async (req: Request, res: Response) => {
  const { titulo } = req.body
  const marketplace = await marketplaceService.createMarketplace(titulo)
  return res.status(201).json(marketplace)
})

marketplaceRoutes.put('/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const updated = await marketplaceService.updateMarketplace(req.params.id, req.body.titulo)
    return res.json(updated)
  } catch (error: any) {
    return res.status(400).json({ message: error.message })
  }
})

marketplaceRoutes.delete('/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    await marketplaceService.deleteMarketplace(req.params.id)
    return res.status(204).send()
  } catch (error: any) {
    return res.status(400).json({ message: error.message })
  }
})