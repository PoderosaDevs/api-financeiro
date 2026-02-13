/*
  Warnings:

  - The values [EM_DEBITO] on the enum `VendaStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "VendaStatus_new" AS ENUM ('PENDENTE', 'PARCIALMENTE_PAGO', 'PAGO', 'CANCELADO');
ALTER TABLE "vendas" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "vendas" ALTER COLUMN "status" TYPE "VendaStatus_new" USING ("status"::text::"VendaStatus_new");
ALTER TYPE "VendaStatus" RENAME TO "VendaStatus_old";
ALTER TYPE "VendaStatus_new" RENAME TO "VendaStatus";
DROP TYPE "VendaStatus_old";
ALTER TABLE "vendas" ALTER COLUMN "status" SET DEFAULT 'PENDENTE';
COMMIT;
