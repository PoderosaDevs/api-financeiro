import { Router } from 'express'
import { authenticate } from '../services/auth.service'
import { Request, Response } from "express";

export const authRoutes = Router()

authRoutes.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body
  const result = await authenticate(email, password)
  return res.json(result)
})
