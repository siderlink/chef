const fs = require('fs');

const js = fs.readFileSync('super-admin.js', 'utf8');
const html = fs.readFileSync('views/super-admin-panel.html', 'utf8');

// Mapping of section to its loader function from switchTab
const sectionLoaders = {
  'sec-dash': 'carregarDashboard',
  'sec-bi': 'carregarBiFranquias',
  'sec-restaurantes': 'carregarRestaurantes',
  'sec-usuarios': 'carregarUsuarios',
  'sec-servidor': 'carregarServidor',
  'sec-mensagens': 'carregarMensagens',
  'sec-tema-custom': 'carregarTemaCustomGlobal',
  'sec-logs': 'carregarLogs',
  'sec-config': 'carregarConfig',
  'sec-ia-global': 'carregarConfig',
  'sec-licencas': 'carregarLicencas',
  'sec-clientes': 'carregarClientes',
  'sec-hub-marketing': 'iframe',
  'sec-suporte': 'carregarSuporte',
  'sec-funcoes': 'renderFuncoes',
  'sec-features-restaurante': 'renderFeaturesRestaurante',
  'sec-dominios': 'renderDominios',
  'sec-capacidade': 'renderCapacidade',
  'sec-mapa': 'renderMapa',
  'sec-load-control': 'renderLoadControl',
  'sec-terminal': 'popularAlvosTerminal',
  'sec-instancias': 'carregarInstancias',
  'sec-suporte-remoto': 'carregarSessoesSuporte',
  'sec-recuperar-acesso': 'carregarUsuariosRecovery',
  'sec-tarefas': 'carregarTarefas',
  'sec-site-vendas': 'carregarSiteVendas',
  'sec-afiliados': 'carregarPainelAfiliadosCompleto',
  'sec-seguranca-waf': 'carregarConfigSeguranca',
  'sec-alterar-senha': 'focus',
  'sec-synccheff': 'carregarSyncCheffStatus',
  'sec-deploy-updates': 'carregarCommitsGit',
  'sec-plugins-modulos': 'carregarPlugins',
  'sec-supabase': 'carregarSupabase',
  'sec-infra-cloud': 'carregarInfraCloud',
  'sec-tuneis': 'carregarTuneis',
  'sec-image-providers': 'carregarImageProviders',
  'sec-notificacoes': 'carregarCentralNotificacoes',
  'sec-contador-gestao': 'carregarGestaoContadorCheff',
  'sec-fin-custodia': 'carregarFinCustodia',
  'sec-fin-assinaturas': 'carregarFinAssinaturas',
  'sec-fin-contratacoes': 'carregarFinContratacoes',
  'sec-fin-gateways': 'carregarFinGateways'
};

for (const [secId, loader] of Object.entries(sectionLoaders)) {
  if (loader === 'iframe' || loader === 'focus') {
    console.log(`[${secId}] -> special: ${loader}`);
    continue;
  }
  const hasFn = js.includes(`function ${loader}`) || js.includes(`window.${loader} =`) || js.includes(`${loader} = function`);
  if (!hasFn) {
    console.log(`❌ [${secId}] Loader function '${loader}' NOT FOUND in super-admin.js!`);
  } else {
    // Find where the loader is defined and look for endpoints it calls
    const fnIdx = js.indexOf(loader);
    const snippet = js.substring(fnIdx, fnIdx + 1200);
    const apiCalls = Array.from(snippet.matchAll(/(?:\/api\/[a-zA-Z0-9_\-\/:]+)/g)).map(m => m[0]);
    console.log(`✅ [${secId}] -> ${loader} (calls: ${apiCalls.slice(0, 3).join(', ') || 'internal/socket'})`);
  }
}
