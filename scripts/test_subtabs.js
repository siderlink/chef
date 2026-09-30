const fs = require('fs');
const js = fs.readFileSync('super-admin.js', 'utf8');
const fns = [
  'alternarSubtabMapa',
  'alternarSubabaInstancias',
  'alternarToolTab',
  'selecionarOsInstalador',
  'trocarAbaSuperContador',
  'trocarSubtabAfiliados',
  'renderSiteVendasTab',
  'alternarSubabaSyncCheff'
];

fns.forEach(fn => {
  const hasFn = js.includes('function ' + fn) || js.includes(fn + ' =');
  const onWin = js.includes('window.' + fn) || js.includes('window["' + fn + '"]');
  console.log(fn + ': exists = ' + hasFn + ', on window = ' + onWin);
});
