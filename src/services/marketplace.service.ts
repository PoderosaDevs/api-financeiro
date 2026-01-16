import { prisma } from '../prisma/client'

export async function createMarketplace(titulo: string) {
  return await prisma.marketplace.create({
    data: { titulo }
  })
}

export async function getAllMarketplaces() {
  return await prisma.marketplace.findMany({
    include: { _count: { select: { vendas: true } } } // Opcional: traz a contagem de vendas
  })
}

export async function getMarketplaceById(id: string) {
  const marketplace = await prisma.marketplace.findUnique({
    where: { id }
  })
  
  if (!marketplace) throw new Error('Marketplace não encontrado')
  return marketplace
}

export async function updateMarketplace(id: string, titulo: string) {
  return await prisma.marketplace.update({
    where: { id },
    data: { titulo }
  })
}

export async function deleteMarketplace(id: string) {
  return await prisma.marketplace.delete({
    where: { id }
  })
}