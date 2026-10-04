// --- QR CODE SCANNER LOGIC ---
let html5QrCode = null;
let qrScanning = false;

window.startQRScanner = (mesaName) => {
  if (qrScanning) return;
  qrScanning = true;

  const modal = document.getElementById('qr-modal');
  const readerEl = document.getElementById('qr-reader');
  if (!modal || !readerEl) {
    qrScanning = false;
    return;
  }

  if (typeof Html5Qrcode === 'undefined') {
    showToast('Leitor de QR indisponivel (biblioteca nao carregada).', '#e74c3c');
    qrScanning = false;
    return;
  }

  // Always destroy previous instance to avoid stale state
  if (html5QrCode) {
    try { html5QrCode.clear(); } catch (e) {}
    html5QrCode = null;
  }

  modal.style.display = 'flex';

  // Wait for DOM to render the modal before starting camera
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      try {
        html5QrCode = new Html5Qrcode("qr-reader");
      } catch (e) {
        console.error("Erro ao criar Html5Qrcode:", e);
        modal.style.display = 'none';
        qrScanning = false;
        showToast('Erro ao inicializar leitor QR.', '#e74c3c');
        return;
      }

      html5QrCode.start(
        { facingMode: "environment" },
        {
          fps: 15,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0
        },
        (decodedText) => {
          qrScanning = false;
          window.closeQRScanner();
          const codigoLimpo = String(decodedText || '').trim().replace(/[\r\n]/g, '');
          if (!codigoLimpo) {
            showToast('QR Code vazio ou invalido.', '#e74c3c');
            return;
          }
          socket.emit('validar_cupom', {
            mesaName: mesaName,
            codigo: codigoLimpo,
            userName: loggedUser ? loggedUser.nome : 'Garcom'
          });
          showToast('Validando cupom...', '#f2c94c');
        },
        () => {}
      ).catch((err) => {
        console.error("Erro ao iniciar camera:", err);
        modal.style.display = 'none';
        qrScanning = false;
        showToast('Nao foi possivel abrir a camera. Verifique as permissoes.', '#e74c3c');
      });
    });
  });
};

window.closeQRScanner = () => {
  qrScanning = false;
  if (html5QrCode) {
    try {
      html5QrCode.stop().then(() => {
        try { html5QrCode.clear(); } catch (e) {}
        html5QrCode = null;
      }).catch(() => {
        try { html5QrCode.clear(); } catch (e) {}
        html5QrCode = null;
      });
    } catch (e) {
      html5QrCode = null;
    }
  }
  document.getElementById('qr-modal').style.display = 'none';
};

socket.on('cupom_sucesso', (data) => {
  showToast(data.mensagem || 'Cupom aplicado!', '#3ab55b');
  playDing();
  const inp = document.getElementById('cupom-manual-input');
  if (inp) inp.value = '';
  showView('tables', 'Comanda Mobile');
});

socket.on('cupom_invalido', (data) => {
  showToast(data.error || 'Cupom inválido', '#e74c3c');
  const inp = document.getElementById('cupom-manual-input');
  if (inp) { inp.value = ''; inp.focus(); }
});

// ── Cupom manual: valida ao digitar último caractere ──
(function() {
  let _mesaName = null;
  const origStartQR = window.startQRScanner;
  window.startQRScanner = function(mesaName) {
    _mesaName = mesaName;
    if (origStartQR) origStartQR(mesaName);
  };
  document.addEventListener('DOMContentLoaded', () => {
    const inp = document.getElementById('cupom-manual-input');
    if (!inp) return;
    inp.addEventListener('input', () => {
      const val = inp.value.trim().toUpperCase();
      if (val.length >= 4) {
        socket.emit('validar_cupom', {
          mesaName: _mesaName,
          codigo: val,
          userName: loggedUser ? loggedUser.nome : 'Garcom'
        });
        showToast('Validando cupom...', '#f2c94c');
      }
    });
  });
})();

socket.on('pedido_pronto', (pedido) => {
  if (loggedUser) {
    const escopo = localStorage.getItem('esteira-som-escopo') || (CONFIGS && CONFIGS['esteira-som-escopo']) || 'todos';
    const isOwnOrder = pedido.userName === loggedUser.nome;
    const shouldPlaySound = (escopo === 'todos') || isOwnOrder;

    const comandaLabel = pedido.mesa_comanda ? ` - (${pedido.mesa_comanda})` : '';

    if (shouldPlaySound) {
      showToast(`🔔 PEDIDO PRONTO! ${pedido.quantity || 1}x ${pedido.productName || 'Item'} (${pedido.localName}${comandaLabel})`, '#22c55e');
      if (typeof playChamarGarcom === 'function') playChamarGarcom();
      if (typeof playDing === 'function') playDing();
      try {
        if ('vibrate' in navigator) {
          navigator.vibrate([300, 150, 300, 150, 450]);
        }
      } catch (e) {}
    }
    socket.emit('get_esteira', loggedUser.nome);

    const bellBtn = document.getElementById('nav-esteira');
    if (bellBtn && shouldPlaySound) {
      const bellIcon = bellBtn.querySelector('i');
      if (bellIcon) {
        bellIcon.classList.remove('bell-shake');
        void bellIcon.offsetWidth;
        bellIcon.classList.add('bell-shake');
        bellIcon.addEventListener('animationend', () => bellIcon.classList.remove('bell-shake'), { once: true });
      }
    }
    const badge = document.getElementById('esteira-badge') || document.getElementById('prontos-badge');
    if (badge) {
      badge.style.display = 'block';
      badge.classList.remove('badge-glow');
      void badge.offsetWidth;
      badge.classList.add('badge-glow');
      badge.addEventListener('animationend', () => badge.classList.remove('badge-glow'), { once: true });
    }

    if (shouldPlaySound && 'Notification' in window && Notification.permission === 'granted') {
      new Notification('🔔 Pedido Pronto!', {
        body: `${pedido.quantity || 1}x ${pedido.productName} - ${pedido.localName}${comandaLabel}`,
        tag: `pronto-${pedido.id}`,
        requireInteraction: true
      });
    }
  }
});

let activeAcceptModal = null;

function showAcceptNotification(data) {
  const existing = document.getElementById('garcom-accept-modal');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'garcom-accept-modal';
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:200000;';
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

  const box = document.createElement('div');
  box.style.cssText = 'background:white;border-radius:20px;padding:28px;max-width:360px;width:90%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.3);animation:modalPop 0.2s ease;';

  box.innerHTML = `
    <div style="font-size:48px;margin-bottom:8px;"><i class="ph ph-hand-waving"></i></div>
    <h3 style="font-size:18px;font-weight:800;margin-bottom:4px;">Chamado na Mesa</h3>
    <p style="font-size:14px;color:#64748b;margin-bottom:4px;">${escHtml(data.localName)}</p>
    ${data.clienteNome ? '<p style="font-size:13px;color:#d97706;font-weight:700;margin-bottom:4px;"><i class="ph ph-user"></i> ' + escHtml(data.clienteNome) + '</p>' : ''}
    <p style="font-size:13px;color:#94a3b8;margin-bottom:20px;">Cliente chamou o garçom</p>
    <div style="display:flex;gap:10px;">
      <button id="btn-recusar-chamado" style="flex:1;padding:12px;border-radius:12px;border:2px solid #e2e8f0;background:white;font-weight:700;font-size:14px;cursor:pointer;color:#64748b;">Recusar</button>
      <button id="btn-aceitar-chamado" style="flex:1;padding:12px;border-radius:12px;border:none;background:linear-gradient(135deg,#10b981,#059669);color:white;font-weight:700;font-size:14px;cursor:pointer;">Aceitar</button>
    </div>
  `;
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  document.getElementById('btn-aceitar-chamado').onclick = () => {
    socket.emit('garcom_aceitou_chamado', { localName: data.localName, garcomNome: loggedUser.nome });
    showToast(`Você aceitou o chamado de ${data.localName}`, '#10b981');
    overlay.remove();
    activeAcceptModal = null;
  };
  document.getElementById('btn-recusar-chamado').onclick = () => {
    overlay.remove();
    activeAcceptModal = null;
  };
  activeAcceptModal = overlay;
}

socket.on('notificacao_garcom', (data) => {
  if (!loggedUser) return;

  const badge = document.getElementById('esteira-badge');
  if (badge) {
    badge.style.display = 'block';
    badge.classList.remove('badge-glow');
    void badge.offsetWidth;
    badge.classList.add('badge-glow');
    badge.addEventListener('animationend', () => badge.classList.remove('badge-glow'), { once: true });
  }

  const bellBtn = document.getElementById('nav-esteira');
  if (bellBtn) {
    const bellIcon = bellBtn.querySelector('i');
    if (bellIcon) {
      bellIcon.classList.remove('bell-shake');
      void bellIcon.offsetWidth;
      bellIcon.classList.add('bell-shake');
      bellIcon.addEventListener('animationend', () => bellIcon.classList.remove('bell-shake'), { once: true });
    }
  }

  if (data.userName === 'Chamada') {
    showAcceptNotification(data);
  }

  const clienteLabel = data.clienteNome ? ` — ${data.clienteNome}` : '';
  const msg = `🔔 ${data.quantity}x ${data.productName} - ${data.localName}${clienteLabel} aguardando retirada!`;
  showToast(msg, '#8b5cf6');
  playChamarGarcom();
  try {
    if ('vibrate' in navigator) {
      navigator.vibrate([350, 150, 350, 150, 500]);
    }
  } catch (e) {}

  if ('Notification' in window) {
    const sendNotif = () => {
      new Notification('🔔 Garçom Chamado!', {
        body: `${data.quantity}x ${data.productName} - ${data.localName}${data.clienteNome ? ' (' + data.clienteNome + ')' : ''}`,
        tag: `chamar-${data.id}`,
        requireInteraction: true
      });
    };
    if (Notification.permission === 'granted') {
      sendNotif();
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then(perm => { if (perm === 'granted') sendNotif(); });
    }
  }
});

socket.on('garcom_buscando', ({ pedidoId, garcomNome, localName, productName }) => {
  if (!loggedUser) return;
  chamadasReclamadas.set(pedidoId, garcomNome);
  if (garcomNome === loggedUser.nome) {
    showToast(`✅ Você está buscando ${productName} - ${localName}`, '#16a34a');
  } else {
    showToast(`👨‍🍳 ${garcomNome} está indo buscar ${productName} - ${localName}`, '#8b5cf6');
  }
  socket.emit('get_esteira', loggedUser.nome);
});

socket.on('status_atualizado', () => {
  if (loggedUser) socket.emit('get_esteira', loggedUser.nome);
  if (currentTable && document.getElementById('view-bill').classList.contains('active')) {
    socket.emit('get_itens_mesa', currentTable);
  }
});

socket.on('validacao_pedido_necessaria', ({ id, mesa, mesa_origem, cliente_nome }) => {
  playDing();
  showToast(`⚠️ Validação: ${cliente_nome} trocou de mesa (${mesa_origem || '?'} → ${mesa}). Verifique!`, '#f59e0b');
  if (loggedUser) socket.emit('get_esteira', loggedUser.nome);
});
