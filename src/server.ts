import { app } from './app';
import { pagamentoService } from './services/pagamento.service';
// import { pagamentoService } from './services/pagamento.service';

const port = process.env.PORT || 3333;

app.listen(port, async () => {
  console.log(`🚀 Server running on port ${port}`);

  // try {
  //   console.log("⚙️ Iniciando apuração financeira e limpeza de duplicidades...");

  //   const resultado = await pagamentoService.verify();

  //   console.log(`✅ Processo concluído: ${resultado.processadas} vendas analisadas.`);

  //   if (resultado.duplicidadesRemovidas > 0) {
  //     console.log(`🧹 Faxina: ${resultado.duplicidadesRemovidas} pagamentos duplicados deletados.`);
  //   }

  //   if (resultado.corrigidas > 0) {
  //     console.log(`🔧 ${resultado.corrigidas} status de vendas corrigidos.`);
  //     console.log(`📝 Amostra das correções:`);
  //     resultado.detalhes.slice(0, 15).forEach(d => console.log(`   > ${d}`));
  //     if (resultado.corrigidas > 15) console.log(`   ... e mais ${resultado.corrigidas - 15} alterações.`);
  //   } else {
  //     console.log("✨ Tudo em conformidade! Nenhuma inconsistência encontrada.");
  //   }

  // } catch (error) {
  //   console.error("❌ Falha crítica na apuração inicial:", error);
  // }
});