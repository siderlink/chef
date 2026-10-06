// --- Routing ---
window.showView = (id, titleText, pushToHistory = true) => {
  if (!id || id === 'home' || id === 'mesas') id = 'tables';
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const targetView = document.getElementById(`view-${id}`) || document.getElementById('view-tables');
  if (targetView) targetView.classList.add('active');
  if (document.getElementById('header-title')) document.getElementById('header-title').innerText = titleText || 'Chef Garçom';
  
  if (pushToHistory) {
    const rootTabs = ['tables', 'mesas', 'esteira', 'atalhos'];
    if (rootTabs.includes(id)) {
      history.replaceState({ view: id, title: titleText }, '', '');
    } else {
      history.pushState({ view: id, title: titleText }, '', '');
    }
  }

  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  if (id === 'tables' && document.getElementById('nav-mesas')) document.getElementById('nav-mesas').classList.add('active');
  if (id === 'esteira' && document.getElementById('nav-esteira')) document.getElementById('nav-esteira').classList.add('active');
  if (id === 'atalhos') {
    const navAtalhos = document.getElementById('nav-atalhos');
    if (navAtalhos) navAtalhos.classList.add('active');
    if (typeof window.carregarAtalhosGarcom === 'function') window.carregarAtalhosGarcom();
  }

  const bottomNav = document.querySelector('.bottom-nav');
  if (bottomNav) {
    if (id === 'tables' || id === 'esteira' || id === 'atalhos') {
      bottomNav.style.display = 'flex';
    } else {
      bottomNav.style.display = 'none';
    }
  }
};

window.addEventListener('popstate', (e) => {
  if (e.state && e.state.view) {
    showView(e.state.view, e.state.title, false);
  }
});

// --- Toast ---
function showToast(msg, bg = '#3ab55b') {
  const toast = document.getElementById('toast');
  toast.innerText = msg;
  toast.style.background = bg;
  toast.classList.add('show');
  toast.style.display = 'block';
  setTimeout(() => { toast.classList.remove('show'); toast.style.display = 'none'; }, 2500);
}
