-- CreateEnum
CREATE TYPE "VendaStatus" AS ENUM ('PAGO', 'EM_DEBITO', 'PENDENTE');

-- AlterTable
ALTER TABLE "vendas" ADD COLUMN     "status" "VendaStatus" NOT NULL DEFAULT 'PENDENTE';
