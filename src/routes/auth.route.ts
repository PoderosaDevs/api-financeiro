import { Router } from 'express'
import { authenticate } from '../services/auth.service'

export const authRoutes = Router()

authRoutes.post('/login', async (req, res) => {
  const { email, password } = req.body
  const result = await authenticate(email, password)
  return res.json(result)
})
