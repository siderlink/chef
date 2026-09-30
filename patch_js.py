import os

js_to_inject = """
window.alterarTamanhoCampo = function(campo, delta) {
  const cssVar = '--kds-font-' + campo;
  const storageKey = 'chef_kds_font_' + campo;
  
  // Define tamanhos padrao
  const defaultSizes = { nome: 16.5, qtd: 15, obs: 12, comps: 11.7 };
  
  // Pega o atual do estilo root ou do cache
  let currentRaw = document.documentElement.style.getPropertyValue(cssVar) || localStorage.getItem(storageKey);
  let size = parseFloat(currentRaw);
  if (isNaN(size) || !size) size = defaultSizes[campo];
  
  // Incremento/Decremento
  size += (delta * 1.5);
  
  // Limites
  if (size < 8) size = 8;
  if (size > 40) size = 40;
  
  document.documentElement.style.setProperty(cssVar, size + 'px');
  localStorage.setItem(storageKey, size);
};

// Ao inicializar, aplicar tamanhos salvos
function aplicarTamanhosCamposSalvos() {
  ['nome', 'qtd', 'obs', 'comps'].forEach(campo => {
    const val = localStorage.getItem('chef_kds_font_' + campo);
    if (val) {
      document.documentElement.style.setProperty('--kds-font-' + campo, val + 'px');
    }
  });
}
aplicarTamanhosCamposSalvos();
"""

path = 'src/js/pages/fila.js'
if os.path.exists(path):
    with open(path, 'r', encoding='utf-8') as f:
        c = f.read()
    if 'window.alterarTamanhoCampo' not in c:
        c = c.replace('window.alterarTamanhoFonte = function(delta) {', js_to_inject + '\nwindow.alterarTamanhoFonte = function(delta) {')
        with open(path, 'w', encoding='utf-8') as f:
            f.write(c)
