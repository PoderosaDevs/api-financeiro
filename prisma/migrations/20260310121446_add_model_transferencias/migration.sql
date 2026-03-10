-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "VendaStatus" ADD VALUE 'PARCIALMENTE_REEMBOLSADO';
ALTER TYPE "VendaStatus" ADD VALUE 'PARCIALMENTE_CONTESTACAO';
ALTER TYPE "VendaStatus" ADD VALUE 'REEMBOLSADO';
ALTER TYPE "VendaStatus" ADD VALUE 'CONTESTACAO';
ALTER TYPE "VendaStatus" ADD VALUE 'FINALIZADO';

-- AlterTable
ALTER TABLE "vendas" ADD COLUMN     "frete_pago" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "frete_transportadora" TEXT,
ADD COLUMN     "numero_fatura" TEXT,
ADD COLUMN     "observacao" TEXT;

-- CreateTable
CREATE TABLE "Transferencias" (
    "id" TEXT NOT NULL,
    "valor" DECIMAL(65,30) NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "nf_venda" TEXT NOT NULL,

    CONSTRAINT "Transferencias_pkey" PRIMARY KEY ("id")
);
