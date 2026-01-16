import { prisma } from '../prisma/client'

export const vendaService = {
  // --- BUSCAS ---
  async getAll() {
    return await prisma.venda.findMany({ 
      include: { marketplace: true, pagamentos: true },
      orderBy: { createdAt: 'desc' }
    });
  },

  async getById(id: string) {
    return await prisma.venda.findUnique({ 
      where: { id }, 
      include: { marketplace: true, pagamentos: true } 
    });
  },

  // --- CRIAÇÃO UNITÁRIA ---
  async create(data: any) {
    // Normalização: evita erro de 'nf: undefined'
    const nfRef = data.nf || data.nfVenda;
    if (!nfRef) throw new Error("O número da NF é obrigatório.");

    const exists = await prisma.venda.findUnique({ where: { nf: String(nfRef) } });
    if (exists) throw new Error(`A NF ${nfRef} já está cadastrada.`);

    const liquido = Number(data.baseIcms || 0) - (Number(data.comissaoVenda) || 0) - (Number(data.comissaoFrete) || 0) - (Number(data.desconto) || 0);

    return await prisma.venda.create({
      data: { 
        nf: String(nfRef),
        loja: data.loja,
        marketplaceId: data.marketplaceId,
        baseIcms: Number(data.baseIcms || 0),
        comissaoVenda: Number(data.comissaoVenda || 0),
        comissaoFrete: Number(data.comissaoFrete || 0),
        desconto: Number(data.desconto || 0),
        liquidoReceber: liquido,
        // Define parcelas se enviado, caso contrário null
        qtdParcelas: data.qtdParcelas ? Number(data.qtdParcelas) : null, 
      }
    });
  },

  // --- IMPORTAÇÃO EM MASSA (VENDAS) ---
  async createMany(vendas: any[]) {
    const nfsPlanilha = vendas.filter(v => v.nf || v.nfVenda).map(v => String(v.nf || v.nfVenda));
    
    const existentes = await prisma.venda.findMany({
      where: { nf: { in: nfsPlanilha } },
      select: { nf: true }
    });
    const nfsExistentes = existentes.map(v => v.nf);

    const paraCadastrar = vendas
      .filter(v => {
        const nf = String(v.nf || v.nfVenda);
        return nf && !nfsExistentes.includes(nf);
      })
      .map(v => {
        const base = Number(v.baseIcms || 0);
        const liquido = base - (Number(v.comissaoVenda) || 0) - (Number(v.comissaoFrete) || 0) - (Number(v.desconto) || 0);
        return {
          nf: String(v.nf || v.nfVenda),
          loja: v.loja,
          marketplaceId: v.marketplaceId,
          baseIcms: base,
          comissaoVenda: Number(v.comissaoVenda || 0),
          comissaoFrete: Number(v.comissaoFrete || 0),
          desconto: Number(v.desconto || 0),
          liquidoReceber: liquido,
          qtdParcelas: null, // Na planilha de vendas, nasce vazio
        };
      });

    if (paraCadastrar.length === 0) return { count: 0, message: "Todas as NFs já existem." };

    const result = await prisma.venda.createMany({ data: paraCadastrar, skipDuplicates: true });
    return { count: result.count, message: `${result.count} vendas importadas.` };
  },

  // --- ATUALIZAÇÃO (IMUTABILIDADE) ---
  async update(id: string, data: any) {
    const current = await prisma.venda.findUnique({ where: { id } });
    if (!current) throw new Error("Venda não encontrada");
    
    // Regra de Imutabilidade das parcelas
    let finalQtd = current.qtdParcelas;
    const novaQtd = data.qtdParcelas || data.numeroParcelas;
    if (current.qtdParcelas === null && novaQtd) {
        finalQtd = Number(novaQtd);
    }

    const liquido = Number(data.baseIcms || current.baseIcms) - 
                    Number(data.comissaoVenda || current.comissaoVenda) - 
                    Number(data.comissaoFrete || current.comissaoFrete) - 
                    Number(data.desconto || current.desconto);

    return await prisma.venda.update({
      where: { id },
      data: { 
        ...data, 
        liquidoReceber: liquido,
        qtdParcelas: finalQtd
      }
    });
  },

  async delete(id: string) {
    return await prisma.venda.delete({ where: { id } });
  }
}