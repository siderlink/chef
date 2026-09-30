const js = require('fs').readFileSync('super-admin.js', 'utf8');
const fns = [
  'carregarTemaCustomGlobal', 'carregarTemasLista', 'renderFuncoes', 
  'carregarSolicitacoesFeatures', 'carregarCommitsGit', 'carregarGitStatus',
  'carregarCentralNotificacoes', 'carregarGestaoContadorCheff', 
  'carregarFinCustodia', 'carregarFinAssinaturas', 'carregarFinContratacoes', 
  'carregarFinGateways', 'carregarSessoesSuporte', 'carregarTarefas', 
  'carregarImageProviders', 'carregarLicencas', 'renderFeaturesRestaurante',
  'renderDominios', 'renderCapacidade', 'renderMapa', 'renderLoadControl',
  'carregarInstancias', 'carregarSyncCheffStatus', 'carregarPlugins'
];
for (const fn of fns) {
  const r = new RegExp('function\\s+' + fn + '\\s*\\(');
  const m = r.exec(js);
  const w = js.includes('window.' + fn + ' =');
  const def = m ? ('line ' + js.substring(0, m.index).split('\n').length) : 'NOT DEFINED';
  console.log((m ? 'DEF' : 'MISS') + ' | ' + (w ? 'WIN' : 'NO-WIN') + ' | ' + fn + ' | ' + def);
}
