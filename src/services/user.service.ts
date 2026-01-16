import bcrypt from 'bcrypt'
import { prisma } from '../prisma/client'

export async function createUser(data: {
  name: string
  email: string
  password: string
}) {
  const exists = await prisma.user.findUnique({
    where: { email: data.email },
  })

  if (exists) {
    throw new Error('User already exists')
  }

  const passwordHash = await bcrypt.hash(data.password, 10)

  return prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      passwordHash,
    },
  })
}
