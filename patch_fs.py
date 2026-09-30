import os

path = 'fullscreen.js'
if os.path.exists(path):
    with open(path, 'r', encoding='utf-8') as f:
        c = f.read()

    # 1. Change const to var for btn
    c = c.replace("const btn = document.createElement('button');", "var btn = document.createElement('button');")

    # 2. Update injectButton to handle existing buttons correctly
    old_inject = """  function injectButton() {
    if (document.getElementById('btn-global-fullscreen')) return;

    // Se estiver no KDS Fila de Pedidos, não duplicar botões de tema ou engrenagem já existentes nativamente
    if (location.pathname.includes('fila-pedidos') || document.querySelector('.kds-navbar')) {"""
    
    new_inject = """  function bindFs() {
    if(btn) {
      btn.removeEventListener('click', toggleFullScreen);
      btn.addEventListener('click', toggleFullScreen);
    }
  }

  function injectButton() {
    // Evita duplicar se a tela já tiver o botão nativo do KDS
    if (document.getElementById('btn-toggle-fullscreen')) return;

    var extBtn = document.getElementById('btn-global-fullscreen');
    if (extBtn) {
      btn = extBtn; // Usa o botão que já está no HTML
      bindFs();
      updateFsIcon();
      return;
    }

    // Se estiver no KDS Fila de Pedidos, não duplicar botões de tema ou engrenagem já existentes nativamente
    if (location.pathname.includes('fila-pedidos') || document.querySelector('.kds-navbar')) {"""

    c = c.replace(old_inject, new_inject)

    # 3. Replace the old hardcoded addEventListeners at the bottom
    old_listeners = """  btn.addEventListener('click', toggleFullScreen);
  btn.addEventListener('touchend', function(e) {
    toggleFullScreen(e);
  });"""
    new_listeners = "  bindFs();"
    
    c = c.replace(old_listeners, new_listeners)

    with open(path, 'w', encoding='utf-8') as f:
        f.write(c)
