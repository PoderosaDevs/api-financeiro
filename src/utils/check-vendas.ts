import { PrismaClient, Venda, Pagamento } from "@prisma/client";

const prisma = new PrismaClient();

interface IVendaRepository {
  findByNf(nf: string): Promise<(Venda & { pagamentos: Pagamento[] }) | null>;
}

class PrismaVendaRepository implements IVendaRepository {
  async findByNf(nf: string): Promise<(Venda & { pagamentos: Pagamento[] }) | null> {
    const cleanNf = nf.trim();
    
    return await prisma.venda.findFirst({
      where: {
        OR: [
          { nf: cleanNf },
          { nf: { contains: cleanNf } }
        ]
      },
      include: {
        pagamentos: true
      }
    });
  }
}

class GetVendaByNfUseCase {
  constructor(private vendaRepository: IVendaRepository) {}

  async execute(nf: string) {
    if (!nf) throw new Error("NF_REQUIRED");
    
    const venda = await this.vendaRepository.findByNf(nf);
    
    if (!venda) {
      return {
        found: false,
        message: `NF ${nf} não encontrada no banco de dados.`
      };
    }

    return {
      found: true,
      data: venda,
      hasPayments: venda.pagamentos.length > 0
    };
  }
}

async function debugDatabaseSearch() {
  const targetNf = "465182";
  const repository = new PrismaVendaRepository();
  const useCase = new GetVendaByNfUseCase(repository);

  try {
    console.log(`🔍 Iniciando busca profunda no banco para NF: ${targetNf}`);
    const result = await useCase.execute(targetNf);

    if (result.found) {
      console.log("✅ Registro encontrado no banco:");
      console.dir(result.data, { depth: null });
    } else {
      console.error(`❌ Falha: ${result.message}`);
      
      const totalVendas = await prisma.venda.count();
      console.log(`📊 Total de registros no banco: ${totalVendas}`);
      
      const amostra = await prisma.venda.findMany({ take: 1 });
      console.log("📝 Formato da NF no banco (Exemplo):", {
        valor: amostra[0]?.nf,
        tipo: typeof amostra[0]?.nf
      });
    }
  } catch (error) {
    console.error("💥 Erro na operação:", error);
  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}

debugDatabaseSearch();