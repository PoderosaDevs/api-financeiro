-- AlterTable
ALTER TABLE "pagamentos" ADD COLUMN     "numero_parcela" INTEGER;

-- AlterTable
ALTER TABLE "vendas" ADD COLUMN     "qtd_parcelas" INTEGER;
