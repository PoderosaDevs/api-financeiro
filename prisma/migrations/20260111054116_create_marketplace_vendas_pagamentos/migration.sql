-- CreateTable
CREATE TABLE "marketplaces" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,

    CONSTRAINT "marketplaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendas" (
    "id" TEXT NOT NULL,
    "nf" TEXT NOT NULL,
    "loja" TEXT NOT NULL,
    "baseIcms" DECIMAL(65,30) NOT NULL,
    "comissao_venda" DECIMAL(65,30),
    "comissao_frete" DECIMAL(65,30),
    "desconto" DECIMAL(65,30),
    "liquido_receber" DECIMAL(65,30) NOT NULL,
    "marketplaceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pagamentos" (
    "id" TEXT NOT NULL,
    "valor" DECIMAL(65,30) NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "nf_venda" TEXT NOT NULL,
    "vendaId" TEXT NOT NULL,

    CONSTRAINT "pagamentos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vendas_nf_key" ON "vendas"("nf");

-- AddForeignKey
ALTER TABLE "vendas" ADD CONSTRAINT "vendas_marketplaceId_fkey" FOREIGN KEY ("marketplaceId") REFERENCES "marketplaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagamentos" ADD CONSTRAINT "pagamentos_vendaId_fkey" FOREIGN KEY ("vendaId") REFERENCES "vendas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
