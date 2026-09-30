const fs = require('fs');

const globalEmBreve = `
// --- Geração Automática: Fallback para Botões em Breve ---
window.showEmBreveToast = function(featureName) {
  if (typeof showToast === 'function') {
    showToast('🚀 O recurso "' + featureName + '" estará disponível na próxima atualização!', 'ph-rocket', 'info');
  } else {
    alert('🚀 O recurso "' + featureName + '" estará disponível na próxima atualização!');
  }
};
`;

const painelDonoFuncs = [
  "enviarRelato",
  "window.calcularFracaoPizzaDono",
  "window.lancarPizzaFornoDono",
  "window.rotearBurgerKDSDono",
  "window.sinalizarMesaChurrascariaDono",
  "window.registrarLoteSushiDono",
  "window.lancarDoseBarDono",
  "window.pesarBalancaBuffetDono",
  "window.dispararFornadaPadariaDono",
  "window.criarEncomendaPadariaDono",
  "window.marcharPratoAlacarteDono",
  "window.consultarSommelierDono",
  "autorizarTerminalPorCodigoDono",
  "salvarPoliticasAcessoDono",
  "abrirModalGamificacao",
  "salvarNovoCupom",
  "salvarConfigGamificacao",
  "ativarModuloImediatoDono",
  "enviarSolicitacaoModuloDono",
  "autorizarTerminalPorCodigoDonoModal",
  "gerarLinkWhatsAppEquipeDono",
  "window.confirmarAtivacaoAddon"
];

const configuracoesFuncs = [
  "abrirSolicitarTemaLoja",
  "window.salvarConfigIA",
  "window.testarChaveIA",
  "window.gerarPromocoesIAComGemini",
  "window.gerarCopyVendasIA",
  "window.salvarParceiro",
  "window.salvarGoogleSync",
  "window.solicitarNovaFuncao",
  "window.testarLeituraBalanca",
  "window.restaurarTodosModosClassicos",
  "window.ativarTodosModosModernos"
];

const garcomFuncs = [
  "window.confirmarPizzaGarcom",
  "window.confirmarRodizioGarcom",
  "window.confirmarMarchaGarcom",
  "window.consultarSommelierGarcom"
];

const suporteFuncs = [
  "executarChamadaSandbox",
  "salvarScaffoldNoDisco"
];

function inject(file, funcs) {
  if (!fs.existsSync(file)) return;
  let code = fs.readFileSync(file, 'utf8');
  
  if (!code.includes('window.showEmBreveToast')) {
    code += '\n' + globalEmBreve;
  }
  
  let added = 0;
  funcs.forEach(func => {
    const cleanName = func.replace('window.', '');
    if (!code.includes(`window.${cleanName} =`) && !code.includes(`function ${cleanName}(`)) {
      code += `\nwindow.${cleanName} = function() { window.showEmBreveToast('${cleanName}'); };\n`;
      added++;
    }
  });
  
  if (added > 0) {
    fs.writeFileSync(file, code);
    console.log(`Injected ${added} stubs into ${file}`);
  } else {
    console.log(`No missing stubs for ${file}`);
  }
}

inject('painel-dono.js', painelDonoFuncs);
inject('public/configuracoes.js', configuracoesFuncs);
inject('public/garcom.js', garcomFuncs);
inject('public/suporte.js', suporteFuncs);
