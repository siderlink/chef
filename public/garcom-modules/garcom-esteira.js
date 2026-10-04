// --- Esteira ---
let prontosAnterioresIds = [];
const chamadasReclamadas = new Map();

socket.on('pedidos_atualizados', () => {
  if (loggedUser) socket.emit('get_esteira', loggedUser.nome);
  if (currentTable && document.getElementById('view-bill').classList.contains('active')) {
    socket.emit('get_itens_mesa', currentTable);
  }
});

socket.on('esteira_atualizada', (pedidos) => {
  const esteira = document.getElementById('esteira-list');
  const prontos = pedidos;
  const novosIds = prontos.map(p => p.id);
  const idsNovos = novosIds.filter(id => !prontosAnterioresIds.includes(id));
  prontosAnterioresIds = novosIds;

  const badge = document.getElementById('esteira-badge');
  if (badge) {
    badge.style.display = (prontos.length > 0) ? 'block' : 'none';
  }

  // Atualizar banner de alerta da cozinha na tela de mesas
  const passBanner = document.getElementById('garcom-pass-alert-banner');
  const passText = document.getElementById('garcom-pass-alert-text');
  if (passBanner) {
    if (prontos.length > 0) {
      passBanner.style.display = 'flex';
      if (passText) passText.innerText = `${prontos.length} pedido${prontos.length > 1 ? 's' : ''} pronto${prontos.length > 1 ? 's' : ''} na cozinha!`;
    } else {
      passBanner.style.display = 'none';
    }
  }

  // Notificar garçom com som e vibração se novos pratos ficaram prontos
  if (idsNovos.length > 0) {
    if (typeof playDing === 'function') playDing();
    if (typeof playChamarGarcom === 'function') playChamarGarcom();
    try {
      if ('vibrate' in navigator) navigator.vibrate([250, 100, 250]);
    } catch(e) {}
    if (typeof showToast === 'function') {
      showToast(`🔔 ${idsNovos.length} pedido(s) pronto(s) na cozinha!`, '#22c55e');
    }
  }

  var pendentes = [];
  try {
    var chave = "chef_pendentes_" + (loggedUser ? loggedUser.nome : "local");
    pendentes = JSON.parse(localStorage.getItem(chave) || "[]");
    if (!Array.isArray(pendentes)) pendentes = [];
  } catch(e) { pendentes = []; }

  var html = '';

  if (pendentes.length > 0) {
    html += '<div style="font-size:12px;font-weight:800;color:#b45309;margin-bottom:8px;text-transform:uppercase;letter-spacing:1px;display:flex;align-items:center;gap:6px;"><i class="ph ph-clock"></i> Atividades Pendentes</div>';
    html += pendentes.map(function(p, idx) {
      var tempo = Math.floor((Date.now() - (p.criadoEm || 0)) / 60000);
      var tempoTxt = tempo < 1 ? 'agora' : tempo + 'min';
      return '<div style="background:#fffbeb;border:1px solid #fde68a;padding:12px;border-radius:10px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;">' +
        '<div style="flex:1;font-size:13px;color:#92400e;font-weight:600;">' +
          '<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;"><i class="ph ph-clock" style="color:#b45309;"></i> ' + tempoTxt + '</div>' +
          '<div style="font-size:12px;color:#78716c;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px;">' + (p.texto || 'Atividade pendente') + '</div>' +
        '</div>' +
        '<button onclick="window.marcarPendenteResolvido(' + idx + ')" style="background:#22c55e;color:white;border:none;padding:8px 12px;border-radius:8px;font-weight:700;cursor:pointer;font-size:12px;white-space:nowrap;">Feito</button>' +
      '</div>';
    }).join('');
  }

  if (prontos.length === 0 && pendentes.length === 0) {
    esteira.innerHTML = '<div style="text-align: center; color: #888; padding: 20px;">Nenhum pedido pronto.</div>';
    return;
  }

  if (prontos.length > 0) {
    if (pendentes.length > 0) {
      html += '<div style="font-size:12px;font-weight:800;color:#15803d;margin:12px 0 8px;text-transform:uppercase;letter-spacing:1px;display:flex;align-items:center;gap:6px;"><i class="ph ph-check-circle"></i> Prontos para Entrega</div>';
    }
    html += prontos.map(p => {
      const isPdv = p.tipo === 'pdv';
      const isChamada = p.userName === 'Chamada';
      const isCalled = !!(p.garcom_call) || isChamada;
      const borderColor = isPdv ? '#f97316' : (isCalled ? '#8b5cf6' : '#3ab55b');
      const icon = isPdv ? 'ph-hand-waving' : (isCalled ? 'ph-bell-ringing' : 'ph-table');
      const iconColor = isPdv ? '#f97316' : (isCalled ? '#8b5cf6' : '#fc4b15');
      const locationLabel = isPdv ? `📋 ${p.localName}` : (isChamada ? `🔔 ${p.localName}` : p.localName);
      const isNew = idsNovos.includes(p.id);
      const blinkClass = isNew ? (isChamada ? 'pronto-blink-orange' : 'pronto-blink') : '';
      const claimedBy = isPdv ? p.targetGarcom : (isChamada ? chamadasReclamadas.get(p.id) : null);

      let tempoPronto = '';
      if (p.prontoEm) {
        const diffSec = Math.floor((Date.now() - new Date(p.prontoEm).getTime()) / 1000);
        if (diffSec < 60) tempoPronto = `${diffSec}s`;
        else if (diffSec < 3600) tempoPronto = `${Math.floor(diffSec / 60)}min`;
        else tempoPronto = `${Math.floor(diffSec / 3600)}h${Math.floor((diffSec % 3600) / 60)}m`;
      } else if (p.createdAt) {
        const diffSec = Math.floor((Date.now() - parseUtc(p.createdAt)) / 1000);
        if (diffSec < 60) tempoPronto = `${diffSec}s`;
        else if (diffSec < 3600) tempoPronto = `${Math.floor(diffSec / 60)}min`;
        else tempoPronto = `${Math.floor(diffSec / 3600)}h${Math.floor((diffSec % 3600) / 60)}m`;
      }

      // For QR code chamada calls accepted by this waiter: hide the card immediately (no "Entregar" step)
      if (isChamada && chamadasReclamadas.get(p.id) === loggedUser?.nome) return '';

      let btnHtml = '';
      if (isPdv) {
        if (!p.targetGarcom) {
          btnHtml = `<button onclick="aceitarChamadoPdv(${escJs(p.localName)})" style="background:#f97316;color:white;border:none;padding:12px 18px;border-radius:10px;font-weight:bold;font-size:14px;cursor:pointer;display:flex;align-items:center;gap:6px;"><i class="ph ph-arrow-right" style="font-size:18px;"></i> IR</button>`;
        } else if (p.targetGarcom === loggedUser?.nome) {
          btnHtml = `<button onclick="marcarEntregue('${p.id}')" style="background:#16a34a;color:white;border:none;padding:12px 18px;border-radius:10px;font-weight:bold;font-size:14px;cursor:pointer;display:flex;align-items:center;gap:6px;"><i class="ph ph-check-circle" style="font-size:18px;"></i> Entregar</button>`;
        } else {
          btnHtml = `<div style="background:#fef3c7;color:#92400e;border:none;padding:8px 12px;border-radius:10px;font-size:12px;font-weight:700;white-space:nowrap;display:flex;align-items:center;gap:4px;"><i class="ph ph-user-check"></i> ${p.targetGarcom}</div>`;
        }
      } else if (isChamada && claimedBy && claimedBy !== loggedUser?.nome) {
        // Another waiter already accepted this QR call
        btnHtml = `<div style="background:#fef3c7;color:#92400e;border:none;padding:8px 12px;border-radius:10px;font-size:12px;font-weight:700;white-space:nowrap;display:flex;align-items:center;gap:4px;"><i class="ph ph-user-check"></i> ${claimedBy}</div>`;
      } else if (isChamada) {
        // QR code waiter call — "IR" disappears card immediately (no Entregar step)
        btnHtml = `<button onclick="irChamadaQR(${p.id}, ${escJs(p.localName || '')})" style="background:#8b5cf6;color:white;border:none;padding:12px 18px;border-radius:10px;font-weight:bold;font-size:14px;cursor:pointer;display:flex;align-items:center;gap:6px;"><i class="ph ph-arrow-right" style="font-size:18px;"></i> IR</button>`;
      } else if (isCalled) {
        // Regular garcom_call — Buscar flow (keeps Entregar step)
        btnHtml = `<button onclick="buscarChamada(${p.id}, ${escJs(p.productName || '')}, ${escJs(p.localName || '')})" style="background:#8b5cf6;color:white;border:none;padding:12px 18px;border-radius:10px;font-weight:bold;font-size:14px;cursor:pointer;display:flex;align-items:center;gap:6px;"><i class="ph ph-walk" style="font-size:18px;"></i> Buscar</button>`;
      } else {
        btnHtml = `<button onclick="marcarEntregue(${p.id})" style="background:${borderColor};color:white;border:none;padding:12px 18px;border-radius:10px;font-weight:bold;font-size:14px;cursor:pointer;display:flex;align-items:center;gap:6px;"><i class="ph ph-check-circle" style="font-size:18px;"></i> Entregar</button>`;
      }

      const cardBg = isCalled ? '#7c3aed' : (isPdv ? '#fff7ed' : 'white');
      const textColor = isCalled ? 'white' : '#1e293b';
      const subTextColor = isCalled ? '#e9d5ff' : '#475569';
      const tagBg = isCalled ? 'rgba(255,255,255,0.2)' : (isPdv ? '#fff5f0' : '#fff5f0');
      const tagColor = isCalled ? 'white' : '#fc4b15';

      return `
    <div data-id="${p.id}" class="${blinkClass}" style="background: ${cardBg}; padding: 16px; border-radius: 12px; margin-bottom: 12px; border-left: 5px solid ${borderColor}; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
      <div>
        <div style="font-size: 18px; font-weight: 800; color: ${textColor}; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">
          <i class="ph ${icon}" style="color: ${iconColor};"></i>
          <span>${locationLabel}</span>
          ${p.mesa_comanda ? `<span style="background: ${tagBg}; color: ${tagColor}; border: 1px solid ${isCalled ? 'rgba(255,255,255,0.3)' : '#ffcca8'}; padding: 2px 8px; border-radius: 8px; font-size: 14px; font-weight: 700;">(${escHtml(p.mesa_comanda)})</span>` : ''}
          ${isNew ? `<span style="background: #dcfce7; color: #15803d; padding: 2px 8px; border-radius: 8px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px;">Novo</span>` : ''}
          ${claimedBy && claimedBy !== loggedUser?.nome ? `<span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:8px;font-size:11px;font-weight:700;">👤 ${escHtml(claimedBy)}</span>` : ''}
        </div>
        <div style="color: ${subTextColor}; font-size: 15px; font-weight: 600;">${p.quantity}x ${escHtml(p.productEmoji || '')} ${escHtml(p.productName)}</div>
        ${tempoPronto ? `<div style="color: ${isCalled ? '#fbbf24' : (isChamada ? '#c2410c' : '#15803d')}; font-size: 12px; font-weight: 700; margin-top: 4px; display: flex; align-items: center; gap: 4px;"><i class="ph ph-clock"></i> Pronto há ${tempoPronto}</div>` : ''}
        ${(() => {
          if (p.prontoEm && p.createdAt) {
            const prepSec = Math.floor((parseUtc(p.prontoEm) - parseUtc(p.createdAt)) / 1000);
            if (prepSec > 0) {
              let tempoPrep = '';
              if (prepSec < 60) tempoPrep = `${prepSec}s`;
              else if (prepSec < 3600) tempoPrep = `${Math.floor(prepSec / 60)}min${prepSec % 60 ? ' ' + (prepSec % 60) + 's' : ''}`;
              else tempoPrep = `${Math.floor(prepSec / 3600)}h${Math.floor((prepSec % 3600) / 60)}min`;
              return `<div style="color: ${isCalled ? '#e9d5ff' : (isPdv ? '#c2410c' : '#1d4ed8')}; font-size: 11px; font-weight: 600; margin-top: 2px; display: flex; align-items: center; gap: 4px;"><i class="ph ph-stopwatch"></i> Preparo: ${tempoPrep}</div>`;
            }
          }
          return '';
        })()}
      </div>
      ${btnHtml}
    </div>
  `;
    }).join('');
  }

  esteira.innerHTML = html;
});

window.marcarEntregue = (id) => {
  if(!loggedUser) return;
  try {
    if ('vibrate' in navigator) navigator.vibrate(60);
  } catch(e) {}
  socket.emit('marcar_entregue', { id, userName: loggedUser.nome });
  showToast('✅ Pedido entregue à mesa!', '#16a34a');
};

window.aceitarChamadoPdv = (localName) => {
  if(!loggedUser) return;
  socket.emit('garcom_aceitou_chamado', { localName, garcomNome: loggedUser.nome });
};

window.buscarChamada = (pedidoId, productName, localName) => {
  if(!loggedUser) return;
  chamadasReclamadas.set(pedidoId, loggedUser.nome);
  socket.emit('garcom_buscando', { pedidoId, garcomNome: loggedUser.nome, localName, productName });
  showToast(`✅ Indo buscar ${productName} - ${localName}`, '#8b5cf6');
};

// For QR code chamada calls: IR button makes card vanish immediately
window.irChamadaQR = (pedidoId, localName) => {
  if (!loggedUser) return;
  chamadasReclamadas.set(pedidoId, loggedUser.nome); // hides card on next render
  socket.emit('garcom_buscando', { pedidoId, garcomNome: loggedUser.nome, localName, productName: 'Chamado' });
  showToast(`✅ Indo até ${localName}`, '#8b5cf6');
  // Immediately request fresh esteira so card disappears right away
  socket.emit('get_esteira', loggedUser.nome);
};

window.marcarPendenteResolvido = (idx) => {
  try {
    var chave = "chef_pendentes_" + (loggedUser ? loggedUser.nome : "local");
    var lista = JSON.parse(localStorage.getItem(chave) || "[]");
    if (Array.isArray(lista) && idx >= 0 && idx < lista.length) {
      lista.splice(idx, 1);
      localStorage.setItem(chave, JSON.stringify(lista));
    }
    if (loggedUser) socket.emit('get_esteira', loggedUser.nome);
  } catch(e) {}
};

document.getElementById('nav-mesas').onclick = () => showView('tables', 'Comanda Mobile');
document.getElementById('nav-esteira').onclick = () => showView('esteira', 'Prontos para Entrega');
const navAtalhosBtn = document.getElementById('nav-atalhos');
if (navAtalhosBtn) {
  navAtalhosBtn.onclick = () => showView('atalhos', 'Atalhos Rápidos');
}
