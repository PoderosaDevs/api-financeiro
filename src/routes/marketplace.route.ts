import { Router } from 'express'
import * as marketplaceService from '../services/marketplace.service'
import { ensureAuthenticated } from '../middlewares/auth.middleware'

export const marketplaceRoutes = Router()

marketplaceRoutes.get('/', async (req, res) => {
  const marketplaces = await marketplaceService.getAllMarketplaces()
  return res.json(marketplaces)
})

marketplaceRoutes.get('/:id', async (req, res) => {
  try {
    const marketplace = await marketplaceService.getMarketplaceById(req.params.id)
    return res.json(marketplace)
  } catch (error: any) {
    return res.status(404).json({ message: error.message })
  }
})

marketplaceRoutes.post('/', ensureAuthenticated, async (req, res) => {
  const { titulo } = req.body
  const marketplace = await marketplaceService.createMarketplace(titulo)
  return res.status(201).json(marketplace)
})

marketplaceRoutes.put('/:id', ensureAuthenticated, async (req, res) => {
  try {
    const updated = await marketplaceService.updateMarketplace(req.params.id, req.body.titulo)
    return res.json(updated)
  } catch (error: any) {
    return res.status(400).json({ message: error.message })
  }
})

marketplaceRoutes.delete('/:id', ensureAuthenticated, async (req, res) => {
  try {
    await marketplaceService.deleteMarketplace(req.params.id)
    return res.status(204).send()
  } catch (error: any) {
    return res.status(400).json({ message: error.message })
  }
})