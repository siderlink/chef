// --- Login Logic ---
let loginMode = 'usuario';
const btnModeUsuario = document.getElementById('btn-mode-usuario');
const btnModePin = document.getElementById('btn-mode-pin');
const formUsuario = document.getElementById('login-form-usuario');
const formPin = document.getElementById('login-form-pin');

if (btnModeUsuario) btnModeUsuario.addEventListener('click', () => {
  loginMode = 'usuario';
  btnModeUsuario.style.background = 'white'; btnModeUsuario.style.color = '#7c3aed'; btnModeUsuario.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
  btnModePin.style.background = 'transparent'; btnModePin.style.color = '#6b7280'; btnModePin.style.boxShadow = 'none';
  formUsuario.style.display = 'block'; formPin.style.display = 'none';
});
if (btnModePin) btnModePin.addEventListener('click', () => {
  loginMode = 'pin';
  btnModePin.style.background = 'white'; btnModePin.style.color = '#7c3aed'; btnModePin.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
  btnModeUsuario.style.background = 'transparent'; btnModeUsuario.style.color = '#6b7280'; btnModeUsuario.style.boxShadow = 'none';
  formPin.style.display = 'block'; formUsuario.style.display = 'none';
  document.getElementById('input-pin').focus();
});

document.getElementById('btn-login').onclick = () => {
  try {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => console.log(err));
    }
  } catch(e) {}

  if (loginMode === 'pin') {
    const pin = document.getElementById('input-pin').value.trim();
    if (!pin) return showToast('Informe o PIN', '#fc4b15');
    socket.emit('login_por_pin', { pin });
  } else {
    const usuario = document.getElementById('input-usuario').value;
    const senha = document.getElementById('input-senha').value;
    if (!usuario || !senha) return showToast('Preencha os campos', '#fc4b15');
    socket.emit('login_funcionario', { usuario, senha });
  }
};

document.getElementById('btn-logout').onclick = () => {
    localStorage.removeItem('chef_credentials');
    localStorage.removeItem('chef_session');
    localStorage.removeItem('logged_user');
    window.location.href = '/painel-funcionario.html';
  };

window.garantirTelaCheia = function() {
  try {
    const isFs = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;
    if (!isFs) {
      const doc = document.documentElement;
      const rfs = doc.requestFullscreen || doc.webkitRequestFullscreen || doc.mozRequestFullScreen || doc.msRequestFullscreen;
      if (rfs) {
        const res = rfs.call(doc);
        if (res && typeof res.catch === 'function') res.catch(() => {});
      }
    }
  } catch (e) {}
};

// Engaja tela cheia em qualquer interação do usuário
['click', 'touchstart'].forEach(evt => {
  document.addEventListener(evt, () => {
    window.garantirTelaCheia();
  }, { passive: true });
});

const btnFullscreenEl = document.getElementById('btn-fullscreen');
if (btnFullscreenEl) {
  btnFullscreenEl.onclick = async (e) => {
    e.stopPropagation();
    const doc = document.documentElement;
    const isFullscreen = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;
    
    if (!isFullscreen) {
      window.garantirTelaCheia();
    } else {
      try {
        if (document.exitFullscreen) await document.exitFullscreen();
        else if (document.webkitExitFullscreen) await document.webkitExitFullscreen();
        else if (document.msExitFullscreen) await document.msExitFullscreen();
      } catch (err) {}
    }
  };
}

const handleFullscreenChange = () => {
  const icon = document.querySelector('#btn-fullscreen i');
  if (!icon) return;
  const isFullscreen = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;
  if (isFullscreen) {
    icon.className = 'ph ph-corners-in';
  } else {
    icon.className = 'ph ph-corners-out';
  }
};
document.addEventListener('fullscreenchange', handleFullscreenChange);
document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
document.addEventListener('mozfullscreenchange', handleFullscreenChange);
document.addEventListener('MSFullscreenChange', handleFullscreenChange);

socket.on('login_success', (user) => {
  loggedUser = user;
  if (user.restaurante_id) localStorage.setItem('restaurante_id', user.restaurante_id);
  if (typeof initTracking === 'function') initTracking(user.id);
  /* Home, Colaborador e Logout sempre visíveis para todos os cargos */
  if(document.getElementById('btn-home')) document.getElementById('btn-home').style.display = 'block';
  if(document.getElementById('btn-colaborador')) document.getElementById('btn-colaborador').style.display = 'block';
  if(document.getElementById('btn-logout')) document.getElementById('btn-logout').style.display = 'block';
  document.getElementById('btn-fullscreen').style.display = 'block';
  showToast(`Bem vindo, ${user.nome}!`);
  showView('tables', 'Comanda Mobile');
  socket.emit('get_mesas');
  socket.emit('get_produtos');
  socket.emit('get_esteira', loggedUser.nome);
  if (typeof window.applyAtalhosConfig === 'function') {
    if (user.atalhos_config) {
      window.applyAtalhosConfig(user.atalhos_config);
    } else if (typeof window.carregarAtalhosGarcom === 'function') {
      window.carregarAtalhosGarcom();
    }
  }

  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }

  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
});

// (Segurança) Armazena apenas o token de sessão (sem senha) para reautenticação automática.
socket.on('login_token', (token) => {
  if (!token || !loggedUser) return;
  try {
    localStorage.setItem('chef_session', JSON.stringify({ token, usuario: loggedUser.usuario, cargo: loggedUser.cargo, nome: loggedUser.nome, id: loggedUser.id }));
  } catch (e) { }
});

socket.on('login_error', (msg) => {
  localStorage.removeItem('chef_credentials');
  localStorage.removeItem('chef_session');
  showToast(msg, '#fc4b15');
  showView('login', 'Acesso Garçom');
});
