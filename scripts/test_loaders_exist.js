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
  'resetInactivityTimer',
  'popularAlvosTerminal',
  'carregarInstancias',
  'carregarSessoesSuporte',
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

loaders.forEach(fn => {
  const isFunction = new RegExp(`function\\s+${fn}\\b`).test(js);
  const isWindow = new RegExp(`window\\.${fn}\\s*=`).test(js);
  console.log(`${fn}: function? ${isFunction} | window.? ${isWindow}`);
});
