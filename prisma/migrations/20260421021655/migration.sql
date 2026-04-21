/*
  Warnings:

  - A unique constraint covering the columns `[vendaId,numero_parcela]` on the table `pagamentos` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "pagamentos_vendaId_numero_parcela_key" ON "pagamentos"("vendaId", "numero_parcela");
