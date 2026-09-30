const fs = require('fs');

const js = fs.readFileSync('super-admin.js', 'utf8');

const loaders = [
  'carregarDashboard',
  'carregarBiFranquias',
  'carregarRestaurantes',
  'carregarChavesOffline',
  'carregarUsuarios',
  'carregarServidor',
  'carregarCerts',
  'carregarMensagens',
  'carregarTemaCustomGlobal',
  'carregarTemasLista',
  'carregarLogs',
  'carregarConfig',
  'carregarLicencas',
  'carregarClientes',
  'carregarSuporte',
  'renderFuncoes',
  'carregarSolicitacoesFeatures',
  'renderFeaturesRestaurante',
  'renderDominios',
  'renderCapacidade',
  'renderMapa',
  'renderLoadControl',
  'popularAlvosTerminal',
  'carregarInstancias',
  'carregarUsuariosRecovery',
  'carregarTarefas',
  'carregarSiteVendas',
  'carregarPainelAfiliadosCompleto',
  'carregarConfigSeguranca',
  'carregarSyncCheffStatus',
  'carregarCommitsGit',
  'carregarGitStatus',
  'carregarPlugins',
  'carregarSupabase',
  'carregarInfraCloud',
  'carregarTuneis',
  'carregarImageProviders',
  'carregarCentralNotificacoes',
  'carregarGestaoContadorCheff',
  'carregarFinCustodia',
  'carregarFinAssinaturas',
  'carregarFinContratacoes',
  'carregarFinGateways'
];

console.log('=== AUDITING ALL SECTION LOADERS IN super-admin.js ===');
for (const fn of loaders) {
  const isDeclared = js.includes(`function ${fn}`) || js.includes(`window.${fn} =`) || js.includes(`${fn} = function`);
  const isExportedToWindow = js.includes(`window.${fn}`) || js.includes(`${fn}: typeof ${fn}`);
  console.log(`${fn.padEnd(32)} -> Declared: ${isDeclared} | On window: ${isExportedToWindow}`);
}
