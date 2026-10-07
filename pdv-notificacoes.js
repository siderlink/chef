// Central de Notificações - PDV Mobile (Caixa/Garçom)

let notificacoesArray = [];
const NOTIFICACOES_STORAGE_KEY = 'chef_pdv_notificacoes';

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
  carregarNotificacoes();
  configurarSocketNotificacoes();
});

function carregarNotificacoes() {
  try {
    const salvos = localStorage.getItem(NOTIFICACOES_STORAGE_KEY);
    if (salvos) {
      notificacoesArray = JSON.parse(salvos);
    }
  } catch (e) {
    notificacoesArray = [];
  }
  atualizarBadge();
  renderizarLista();
}

function salvarNotificacoes() {
  localStorage.setItem(NOTIFICACOES_STORAGE_KEY, JSON.stringify(notificacoesArray));
  atualizarBadge();
}

function atualizarBadge() {
  const badge = document.getElementById('badge-notificacoes');
  if (!badge) return;
  const unreadCount = notificacoesArray.filter(n => !n.lida).length;
  if (unreadCount > 0) {
    badge.innerText = unreadCount > 99 ? '99+' : unreadCount;
    badge.style.display = 'block';
  } else {
    badge.style.display = 'none';
  }
}

function renderizarLista() {
  const container = document.getElementById('lista-notificacoes');
  const emptyState = document.getElementById('empty-notificacoes');
  if (!container || !emptyState) return;

  // Limpar a lista atual mantendo o estado vazio
  container.querySelectorAll('.notificacao-item').forEach(el => el.remove());

  if (notificacoesArray.length === 0) {
    emptyState.style.display = 'block';
    return;
  } else {
    emptyState.style.display = 'none';
  }

  // Renderizar ordenado por data (mais recente primeiro)
  const ordenados = [...notificacoesArray].sort((a, b) => b.timestamp - a.timestamp);

  ordenados.forEach(notif => {
    const div = document.createElement('div');
    div.className = 'notificacao-item glass';
    div.style.cssText = `
      padding: 14px; 
      border-radius: 12px; 
      border-left: 4px solid ${notif.cor || 'var(--primary)'};
      display: flex;
      gap: 12px;
      align-items: flex-start;
      background: ${notif.lida ? 'rgba(0,0,0,0.05)' : 'var(--bg-card)'};
      opacity: ${notif.lida ? '0.7' : '1'};
      position: relative;
    `;

    const dataObj = new Date(notif.timestamp);
    const horaStr = dataObj.getHours().toString().padStart(2, '0') + ':' + dataObj.getMinutes().toString().padStart(2, '0');

    div.innerHTML = `
      <div style="width: 40px; height: 40px; border-radius: 10px; background: ${notif.corBg || 'rgba(99,102,241,0.1)'}; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
        <i class="${notif.icone || 'ph ph-bell'}" style="font-size: 20px; color: ${notif.cor || 'var(--primary)'};"></i>
      </div>
      <div style="flex: 1;">
        <div style="display:flex; justify-content: space-between; margin-bottom: 4px;">
          <strong style="color: var(--text-main); font-size: 14px;">${notif.titulo}</strong>
          <span style="font-size: 11px; color: var(--text-muted);">${horaStr}</span>
        </div>
        <div style="font-size: 13px; color: var(--text-secondary); line-height: 1.4;">${notif.mensagem}</div>
      </div>
      ${!notif.lida ? '<div style="width:8px; height:8px; border-radius:50%; background:#ef4444; position:absolute; top:16px; right:16px;"></div>' : ''}
    `;

    div.onclick = () => {
      marcarComoLida(notif.id);
      renderizarLista();
    };

    container.appendChild(div);
  });
}

function adicionarNotificacao(titulo, mensagem, icone, cor, corBg) {
  const notif = {
    id: Date.now().toString() + Math.random().toString(36).substring(2, 6),
    titulo,
    mensagem,
    icone,
    cor,
    corBg,
    timestamp: Date.now(),
    lida: false
  };
  
  notificacoesArray.push(notif);
  
  // Limitar a 50 notificações no histórico local
  if (notificacoesArray.length > 50) {
    notificacoesArray.sort((a, b) => b.timestamp - a.timestamp);
    notificacoesArray = notificacoesArray.slice(0, 50);
  }

  salvarNotificacoes();
  renderizarLista();

  // Se o PDV tiver a função showToast (geralmente injetada globalmente)
  if (typeof showToast === 'function') {
    showToast(titulo + ': ' + mensagem, 'info');
  }

  // Tocar um som se o navegador permitir (somente interações prévias)
  try {
    const audio = new Audio('/sons/notification.mp3'); // Se não existir, não faz mal, vai falhar silenciosamente
    audio.play().catch(e => {}); 
  } catch(e) {}
}

function marcarComoLida(id) {
  const notif = notificacoesArray.find(n => n.id === id);
  if (notif && !notif.lida) {
    notif.lida = true;
    salvarNotificacoes();
  }
}

window.marcarTodasComoLidas = function() {
  notificacoesArray.forEach(n => n.lida = true);
  salvarNotificacoes();
  renderizarLista();
}

window.abrirCentralNotificacoes = function() {
  const modal = document.getElementById('modal-notificacoes');
  if (modal) {
    modal.style.display = 'block';
    // Timeout para animar a entrada
    setTimeout(() => {
      const content = modal.querySelector('.sheet-content');
      if (content) content.style.transform = 'translateY(0)';
    }, 10);
  }
  renderizarLista();
}

window.fecharCentralNotificacoes = function() {
  const modal = document.getElementById('modal-notificacoes');
  if (modal) {
    const content = modal.querySelector('.sheet-content');
    if (content) content.style.transform = 'translateY(100%)';
    setTimeout(() => {
      modal.style.display = 'none';
      // Ao fechar, marcar todas as novas que já foram visualizadas?
      // window.marcarTodasComoLidas(); // Opcional
    }, 300);
  }
}

// Interceptar eventos Socket.io se globalmente disponível
function configurarSocketNotificacoes() {
  if (typeof io !== 'undefined') {
    // Caso a conexão já esteja rolando em app.js ou broadcast.js, reutilizamos a instância window.socket se existir
    const s = window.socket || io();

    s.on('alerta_chamar_garcom', (mesa) => {
      adicionarNotificacao(
        'Garçom Solicitado',
        `A mesa ${mesa || 'Desconhecida'} está solicitando atendimento.`,
        'ph-bell-ringing',
        '#f59e0b', // Amber
        'rgba(245, 158, 11, 0.1)'
      );
    });

    s.on('alerta_pedir_conta', (mesa) => {
      adicionarNotificacao(
        'Conta Solicitada',
        `A mesa ${mesa || 'Desconhecida'} pediu o fechamento da conta.`,
        'ph-receipt',
        '#10b981', // Emerald
        'rgba(16, 185, 129, 0.1)'
      );
    });

    // Se no futuro adicionarmos alerta de delivery
    s.on('novo_pedido_delivery', (dados) => {
      adicionarNotificacao(
        'Novo Delivery',
        `Pedido #${dados.id || ''} recebido.`,
        'ph-motorcycle',
        '#ef4444', // Red
        'rgba(239, 68, 68, 0.1)'
      );
    });

    s.on('alerta_buffet_cozinha', (msg) => {
      adicionarNotificacao(
        'Aviso da Cozinha',
        msg || 'Alerta de Buffet acionado.',
        'ph-cooking-pot',
        '#8b5cf6', // Violet
        'rgba(139, 92, 246, 0.1)'
      );
    });
  }
}
