/*
  Warnings:

  - You are about to drop the `Transferencias` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterTable
ALTER TABLE "pagamentos" ADD COLUMN     "loja" TEXT;

-- AlterTable
ALTER TABLE "vendas" ADD COLUMN     "frete_e_taxas" DECIMAL(65,30);

-- DropTable
DROP TABLE "Transferencias";

-- CreateTable
CREATE TABLE "reembolsos" (
    "id" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "nf_venda" TEXT NOT NULL,
    "loja" TEXT NOT NULL,
    "valor_repasse" DECIMAL(65,30) NOT NULL,
    "comissao_venda" DECIMAL(65,30),
    "comissao_frete" DECIMAL(65,30),
    "base_icms" DECIMAL(65,30),
    "parcela_paga" INTEGER,
    "total_parcelas" INTEGER,
    "vendaId" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reembolsos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devolucoes" (
    "id" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "nf_venda" TEXT NOT NULL,
    "valor_base" DECIMAL(65,30) NOT NULL,
    "numero_devolucao" TEXT NOT NULL,
    "valor" DECIMAL(65,30) NOT NULL,
    "saldo" DECIMAL(65,30) DEFAULT 0,
    "tratativa" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "loja" TEXT NOT NULL,
    "vendaId" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "devolucoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "devolucoes_numero_devolucao_key" ON "devolucoes"("numero_devolucao");

-- AddForeignKey
ALTER TABLE "reembolsos" ADD CONSTRAINT "reembolsos_vendaId_fkey" FOREIGN KEY ("vendaId") REFERENCES "vendas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devolucoes" ADD CONSTRAINT "devolucoes_vendaId_fkey" FOREIGN KEY ("vendaId") REFERENCES "vendas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
