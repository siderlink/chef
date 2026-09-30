const js = require('fs').readFileSync('super-admin.js', 'utf8');
const fns = [
  'carregarLicencas', 'renderFeaturesRestaurante', 'renderDominios',
  'renderCapacidade', 'renderMapa', 'renderLoadControl', 'carregarInstancias',
  'carregarSyncCheffStatus', 'carregarPlugins', 'carregarTemaCustomGlobal',
  'carregarTemasLista', 'renderFuncoes', 'carregarSolicitacoesFeatures',
  'carregarCommitsGit', 'carregarGitStatus', 'carregarSessoesSuporte',
  'carregarImageProviders'
];
for (const fn of fns) {
  const p1 = js.includes('window.' + fn + ' = function');
  const p2 = js.includes('window.' + fn + '=function');
  const r = new RegExp('function\\s+' + fn + '\\s*\\(');
  const p3 = r.test(js);
  const lineMatch = js.match(new RegExp('(?:window\\.' + fn + '\\s*=|function\\s+' + fn + ')'));
  let lineNum = -1;
  if (lineMatch) {
    lineNum = js.substring(0, lineMatch.index).split('\n').length;
  }
  console.log(`${fn}: window.fn=func? ${p1 || p2}  |  function fn()? ${p3}  |  line: ${lineNum}`);
}
