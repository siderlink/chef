// auth.js - Proteção Estrita de Rotas, Validação de Sessão e Controle de Acesso
(function() {
  const rawPath = window.location.pathname.toLowerCase();
  const path = (rawPath === '/' || rawPath === '') ? '/index.html' : rawPath;

  // Páginas públicas que não exigem login
  const publicPages = [
    'login.html',
    'cadastro.html',
    'registro.html',
    'ativacao.html',
    'cardapio.html',
    'conta-cliente.html',
    'area-cliente.html',
    'site.html',
    'site-vendas.html',
    'totem.html',
    'fila-lite.html',
    'garcom-lite.html'
  ];

  const isPublic = publicPages.some(p => path.endsWith('/' + p) || path.includes('/' + p));
  if (isPublic) {
    return;
  }

  // Obter token
  const token = localStorage.getItem('chef_token');

  function bloquearERedirecionar(motivo) {
    try {
      document.documentElement.style.display = 'none';
    } catch(e) {}
    localStorage.removeItem('chef_token');
    localStorage.removeItem('chef_credentials');
    localStorage.removeItem('chef_session');
    if (motivo) console.warn('[Auth Guard]', motivo);
    window.location.replace('/login.html');
  }

  if (!token || typeof token !== 'string' || token.trim() === '' || token.split('.').length !== 3) {
    bloquearERedirecionar('Nenhum token JWT válido encontrado na sessão.');
    return;
  }

  // Validação rápida de expiração local no client
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    if (payload.exp && (payload.exp * 1000) < Date.now()) {
      bloquearERedirecionar('Sessão expirada localmente.');
      return;
    }
  } catch(e) {
    bloquearERedirecionar('Formato de token corrompido.');
    return;
  }

  // Validação assíncrona em segundo plano com o servidor backend
  fetch('/api/auth/me', {
    headers: { 'Authorization': 'Bearer ' + token }
  })
  .then(res => {
    if (res.status === 401 || res.status === 403) {
      bloquearERedirecionar('Sessão rejeitada pelo servidor (' + res.status + ').');
      return null;
    }
    return res.json();
  })
  .then(data => {
    if (data && data.success) {
      if (data.restaurante && data.restaurante.id) {
        localStorage.setItem('restaurante_id', String(data.restaurante.id));
        localStorage.setItem('restaurante_nome', data.restaurante.nome || '');
      }
      if (data.politica_acesso) {
        localStorage.setItem('chef_politica_acesso', JSON.stringify(data.politica_acesso));
      }
      window.chefSessaoValidada = data;
    }
  })
  .catch(err => {
    console.warn('[Auth Server Check Offline/Retry]', err);
  });

  // Controle de acesso por perfil / cargo
  let credsStr = localStorage.getItem('chef_session') || localStorage.getItem('chef_credentials');
  if (credsStr) {
    try {
      const creds = JSON.parse(credsStr);
      const cargo = (creds.cargo || creds.funcao || creds.role || '').toLowerCase();
      const isGarcom = cargo === 'garçom' || cargo === 'garcom' || cargo === 'atendente';
      const isCozinha = ['cozinha', 'copa', 'bar', 'kds'].includes(cargo);
      const isStrictAdmin = ['admin', 'administrador', 'gerente', 'dono', 'proprietário'].includes(cargo);

      if ((path.includes('configuracoes.html') || path.includes('dashboard.html') || path.includes('painel-dono.html')) && !isStrictAdmin) {
        if (isGarcom) window.location.replace('/garcom.html');
        else if (isCozinha) window.location.replace('/fila-pedidos.html');
        else window.location.replace('/index.html');
        return;
      }

      if (path.includes('fila-pedidos.html') && isGarcom) {
        window.location.replace('/garcom.html');
        return;
      }
    } catch(e) {}
  }
})();

// Registrar auditoria de navegação de páginas automaticamente
if (typeof socket !== 'undefined' && socket.emit) {
  const currentPath = window.location.pathname || 'index.html';
  const pageTitle = document.title || 'Módulo do Sistema';
  socket.emit('registrar_acesso_pagina', { pagina: currentPath, titulo: pageTitle, autorizado: true });
}

// Ouvinte global para forçar logout de todos os funcionários quando o restaurante é deslogado
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    if (typeof io !== 'undefined' || typeof socket !== 'undefined') {
      const s = window.socket || (typeof io === 'function' ? io() : null);
      if (s && s.on) {
        s.on('forcar_logout_global', function(data) {
          const myRestId = localStorage.getItem('restaurante_id');
          if (!data || !data.restaurante_id || String(data.restaurante_id) === String(myRestId)) {
            localStorage.clear();
            sessionStorage.clear();
            alert(data?.motivo || 'A sessão do restaurante foi encerrada pelo administrador. Faça login novamente.');
            window.location.replace('/login.html');
          }
        });

        s.on('forcar_logout_duplicado', function(data) {
          const creds = localStorage.getItem('chef_credentials') ? JSON.parse(localStorage.getItem('chef_credentials')) : {};
          const myUser = creds.usuario || creds.nome || '';
          const myUserId = localStorage.getItem('usuario_id') || creds.id || '';
          
          if (!data || (data.usuario_id && String(data.usuario_id) === String(myUserId)) || (data.usuario && String(data.usuario).toLowerCase() === String(myUser).toLowerCase())) {
            localStorage.clear();
            sessionStorage.clear();
            alert(data?.motivo || 'Esta conta foi conectada em outro dispositivo. Esta sessão foi finalizada.');
            window.location.replace('/login.html');
          }
        });
      }
    }
  });
}
