import { Router } from 'express'
import { createUser } from '../services/user.service' // Ajuste o caminho conforme sua pasta
import { Request, Response } from "express";

export const userRoutes = Router()

userRoutes.post('/register', async (req: Request, res: Response) => {
  try {
    const { name, email, password } = req.body

    // Chamando o service que você forneceu
    const user = await createUser({
      name,
      email,
      password,
    })

    // Removemos o passwordHash da resposta por segurança
    const { passwordHash, ...userWithoutPassword } = user

    return res.status(201).json(userWithoutPassword)
  } catch (error: any) {
    // Tratamento básico de erro (ex: Usuário já existe)
    return res.status(400).json({ 
      message: error.message || 'Unexpected error' 
    })
  }
})