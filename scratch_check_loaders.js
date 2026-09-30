const fs = require('fs');
const js = fs.readFileSync('super-admin.js', 'utf8');

const functionsToCheck = [
  'carregarDashboard',
  'carregarBiFranquias',
  'carregarRestaurantes',
  'carregarChavesOffline',
  'carregarUsuarios',
  'carregarClientes',
  'carregarLogs',
  'carregarConfig',
  'carregarLicencas',
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
  'abrirSecaoSuporteRemoto',
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

console.log('=== CHECKING LOADER FUNCTIONS IN SUPER-ADMIN.JS ===');
const missing = [];
functionsToCheck.forEach(fn => {
  const hasFn = new RegExp('(function\\s+' + fn + '\\b|window\\.' + fn + '\\s*=|var\\s+' + fn + '\\s*=\\s*function)', 'g').test(js);
  if (!hasFn) {
    missing.push(fn);
  }
});

console.log('Total checked:', functionsToCheck.length);
console.log('Missing functions:', missing);
