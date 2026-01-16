import bcrypt from 'bcrypt'
import { prisma } from '../prisma/client'
import { generateTokens } from '../utils/generateTokens'

export async function authenticate(email: string, password: string) {
  const user = await prisma.user.findUnique({
    where: { email },
  })

  if (!user) {
    throw new Error('Invalid credentials')
  }

  const passwordMatch = await bcrypt.compare(password, user.passwordHash)

  if (!passwordMatch) {
    throw new Error('Invalid credentials')
  }

  const tokens = generateTokens(user.id)

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
    },
    tokens,
  }
}
