/**
 * plugins/fila-espera/client.js
 * Frontend do Módulo de Fila de Espera Digital com QR Code no Salão
 */
(function (window) {
  'use strict';

  window.filaEsperaDados = [];

  function escHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function garantirModaisFilaNoDOM() {
    if (!document.getElementById('modal-fila-espera')) {
      const modalFila = document.createElement('div');
      modalFila.id = 'modal-fila-espera';
      modalFila.className = 'modal-overlay';
      modalFila.style.cssText = 'display:none; z-index:10000; position:fixed; inset:0; background:rgba(0,0,0,0.65); backdrop-filter:blur(4px); justify-content:center; align-items:center;';
      modalFila.innerHTML = `
        <div class="modal" style="width:720px; max-width:95%; max-height:90vh; padding:24px; border-radius:16px; background:var(--bg-card, #ffffff); color:var(--text, #0f172a); box-shadow:0 20px 40px rgba(0,0,0,0.3); display:flex; flex-direction:column; overflow:hidden;">
          <div class="modal-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; border-bottom:1px solid #e2e8f0; padding-bottom:12px;">
            <div style="display:flex; align-items:center; gap:12px;">
              <h3 style="margin:0; display:flex; align-items:center; gap:8px; color:#d97706; font-size:19px;">
                <i class="ph ph-users-three"></i> Fila de Espera Digital
              </h3>
              <button type="button" onclick="window.abrirQrFilaEsperaModal()" title="Exibir QR Code para os clientes entrarem na fila" style="background:#fffbeb; color:#d97706; border:1px solid #fde68a; padding:6px 12px; border-radius:8px; font-weight:bold; cursor:pointer; font-size:12px; display:flex; align-items:center; gap:6px;">
                <i class="ph ph-qr-code" style="font-size:16px;"></i> QR Code Salão
              </button>
            </div>
            <button type="button" onclick="document.getElementById('modal-fila-espera').style.display='none'" style="background:none; border:none; font-size:24px; cursor:pointer; color:#94a3b8;">&times;</button>
          </div>

          <!-- Formulário Adicionar Cliente na Fila -->
          <div style="background:#fffbeb; border:1px solid #fde68a; border-radius:12px; padding:14px; margin-bottom:16px;">
            <h4 style="margin:0 0 10px 0; color:#92400e; font-size:13.5px; display:flex; align-items:center; gap:6px;">
              <i class="ph ph-user-plus"></i> Inserir Cliente na Fila
            </h4>
            <div style="display:grid; grid-template-columns:2fr 1.5fr 1fr 1.5fr; gap:8px; margin-bottom:8px;">
              <input type="text" id="input-fila-nome" placeholder="Nome do Cliente *" style="padding:8px 10px; border:1px solid #cbd5e1; border-radius:6px; font-size:13px;">
              <input type="text" id="input-fila-telefone" placeholder="WhatsApp (DDD)" style="padding:8px 10px; border:1px solid #cbd5e1; border-radius:6px; font-size:13px;">
              <input type="number" id="input-fila-pessoas" placeholder="Pessoas" min="1" value="2" style="padding:8px 10px; border:1px solid #cbd5e1; border-radius:6px; font-size:13px; text-align:center;">
              <input type="text" id="input-fila-preferencia" placeholder="Pref. (ex: Salão, 4p)" style="padding:8px 10px; border:1px solid #cbd5e1; border-radius:6px; font-size:13px;">
            </div>
            <div style="display:flex; gap:8px;">
              <input type="text" id="input-fila-obs" placeholder="Observação (ex: Cadeira de bebê, aniversário)" style="flex:1; padding:8px 10px; border:1px solid #cbd5e1; border-radius:6px; font-size:13px;">
              <button type="button" onclick="window.adicionarClienteFilaEspera()" style="background:#d97706; color:white; border:none; padding:8px 16px; border-radius:6px; font-weight:bold; cursor:pointer; font-size:13px; display:flex; align-items:center; gap:6px;">
                <i class="ph ph-plus"></i> Entrar na Fila
              </button>
            </div>
          </div>

          <!-- Lista de Clientes em Espera -->
          <div style="flex:1; overflow-y:auto; max-height:450px;">
            <table style="width:100%; border-collapse:collapse; text-align:left; font-size:13px;">
              <thead>
                <tr style="background:#f8fafc; border-bottom:2px solid #e2e8f0; color:#475569;">
                  <th style="padding:10px;">Cliente</th>
                  <th style="padding:10px; text-align:center;">Pessoas</th>
                  <th style="padding:10px;">Tempo Espera</th>
                  <th style="padding:10px;">Pref. / Obs / Pré-pedidos</th>
                  <th style="padding:10px; text-align:center;">Ações</th>
                </tr>
              </thead>
              <tbody id="tbody-fila-espera">
                <tr><td colspan="5" style="text-align:center; padding:24px; color:#94a3b8;">Nenhum cliente na fila de espera no momento.</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      `;
      document.body.appendChild(modalFila);
    }

    if (!document.getElementById('modal-qr-fila-espera')) {
      const modalQr = document.createElement('div');
      modalQr.id = 'modal-qr-fila-espera';
      modalQr.className = 'modal-overlay';
      modalQr.style.cssText = 'display:none; z-index:10005; position:fixed; inset:0; background:rgba(0,0,0,0.7); backdrop-filter:blur(6px); justify-content:center; align-items:center;';
      modalQr.innerHTML = `
        <div class="modal" style="width:420px; max-width:92%; padding:24px; border-radius:18px; background:var(--bg-card, #ffffff); text-align:center; box-shadow:0 20px 50px rgba(0,0,0,0.35);">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <h3 style="margin:0; color:#d97706; font-size:18px; display:flex; align-items:center; gap:8px;">
              <i class="ph ph-qr-code"></i> Fila Digital & Cardápio de Espera
            </h3>
            <button type="button" onclick="document.getElementById('modal-qr-fila-espera').style.display='none'" style="background:none; border:none; font-size:22px; cursor:pointer; color:#94a3b8;">&times;</button>
          </div>
          <p style="font-size:13px; color:#64748b; margin-bottom:16px;">
            Aponte a câmera do celular para entrar na fila, ver a posição em tempo real e fazer pré-pedidos de bebidas/entradas na calçada!
          </p>
          <div id="container-qr-fila-espera" style="display:flex; justify-content:center; align-items:center; margin:10px 0; padding:16px; background:#f8fafc; border-radius:12px; min-height:220px;"></div>
          <div style="font-size:11px; color:#94a3b8; word-break:break-all; margin-top:10px; background:#f1f5f9; padding:8px; border-radius:6px;" id="display-url-fila-espera">
            /cardapio.html?modo=fila
          </div>
        </div>
      `;
      document.body.appendChild(modalQr);
    }
  }

  window.abrirFilaEsperaModal = function () {
    garantirModaisFilaNoDOM();
    const modal = document.getElementById('modal-fila-espera');
    if (modal) modal.style.display = 'flex';
    if (typeof socket !== 'undefined' && socket) {
      socket.emit('get_fila_espera');
    } else {
      fetch('/api/fila-espera')
        .then(r => r.json())
        .then(res => { if (res && res.fila) renderFilaEsperaTabela(res.fila); })
        .catch(() => {});
    }
  };

  window.abrirQrFilaEsperaModal = function () {
    garantirModaisFilaNoDOM();
    const modal = document.getElementById('modal-qr-fila-espera');
    if (modal) modal.style.display = 'flex';

    const origin = window.location.origin || (window.location.protocol + '//' + window.location.host);
    const url = origin + '/cardapio.html?modo=fila';

    const display = document.getElementById('display-url-fila-espera');
    if (display) display.textContent = url;

    const container = document.getElementById('container-qr-fila-espera');
    if (!container) return;
    container.innerHTML = '';

    const qrImgEl = document.createElement('img');
    qrImgEl.width = 200;
    qrImgEl.height = 200;
    qrImgEl.style.borderRadius = '8px';
    qrImgEl.style.imageRendering = 'pixelated';
    container.appendChild(qrImgEl);

    if (typeof window.qrImg === 'function') {
      window.qrImg(qrImgEl, url, 200);
    } else {
      qrImgEl.src = `${origin}/api/qr?size=200&data=${encodeURIComponent(url)}`;
    }
  };

  window.adicionarClienteFilaEspera = function () {
    const inpNome = document.getElementById('input-fila-nome');
    const inpTel = document.getElementById('input-fila-telefone');
    const inpPessoas = document.getElementById('input-fila-pessoas');
    const inpPref = document.getElementById('input-fila-preferencia');
    const inpObs = document.getElementById('input-fila-obs');

    const nome = inpNome ? inpNome.value.trim() : '';
    if (!nome) return alert('Informe o nome do cliente.');

    const telefone = inpTel ? inpTel.value.trim() : '';
    const pessoas = inpPessoas ? parseInt(inpPessoas.value, 10) || 2 : 2;
    const mesa_preferida = inpPref ? inpPref.value.trim() : '';
    const observacao = inpObs ? inpObs.value.trim() : '';

    const payload = {
      cliente_nome: nome,
      cliente_telefone: telefone,
      pessoas: pessoas,
      mesa_preferida: mesa_preferida,
      observacao: observacao
    };

    if (typeof socket !== 'undefined' && socket) {
      socket.emit('adicionar_fila_espera', payload);
    } else {
      fetch('/api/fila-espera', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }

    if (inpNome) inpNome.value = '';
    if (inpTel) inpTel.value = '';
    if (inpPref) inpPref.value = '';
    if (inpObs) inpObs.value = '';
  };

  window.removerClienteFilaEspera = function (id) {
    if (!confirm('Deseja remover este cliente da fila de espera?')) return;
    if (typeof socket !== 'undefined' && socket) {
      socket.emit('remover_fila_espera', id);
    } else {
      fetch(`/api/fila-espera/${id}`, { method: 'DELETE' });
    }
  };

  window.chamarClienteWhatsapp = function (id, nome, telefone, pessoas) {
    if (!telefone) {
      alert('Telefone/WhatsApp do cliente não informado.');
      return;
    }
    const telLimpo = telefone.replace(/\D/g, '');
    const numCompleto = telLimpo.length <= 11 ? '55' + telLimpo : telLimpo;
    const texto = encodeURIComponent(`Olá ${nome}! Sua mesa (${pessoas} pessoas) no restaurante está pronta! Por favor, dirija-se à recepção.`);
    window.open(`https://wa.me/${numCompleto}?text=${texto}`, '_blank');

    if (typeof socket !== 'undefined' && socket && id) {
      socket.emit('atualizar_status_fila_espera', { id: id, status: 'Notificado' });
    } else if (id) {
      fetch(`/api/fila-espera/${id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'Notificado' })
      });
    }
  };

  window.acomodarClienteFilaPrompt = function (id, nomeCliente) {
    let mesasLivres = [];
    if (Array.isArray(window.allMesas)) {
      mesasLivres = window.allMesas.filter(m => m.status === 'Disponível' || m.status === 'Livre').map(m => m.nome || m.mesaName);
    }

    let sugestaoMsg = mesasLivres.length > 0 ? `Mesas livres disponíveis: ${mesasLivres.join(', ')}` : 'Nenhuma mesa marcada como livre no momento.';
    const mesaName = prompt(`Informe a mesa para acomodar ${nomeCliente}:\n(${sugestaoMsg})`, mesasLivres[0] || 'Mesa 1');
    if (!mesaName || !mesaName.trim()) return;

    if (typeof socket !== 'undefined' && socket) {
      socket.emit('acomodar_cliente_fila', { id: id, mesaName: mesaName.trim() });
    }
  };

  function renderFilaEsperaTabela(rows) {
    window.filaEsperaDados = rows || [];
    const tbody = document.getElementById('tbody-fila-espera');
    const badgeCount = document.getElementById('badge-count-fila-espera');
    if (badgeCount) {
      badgeCount.textContent = window.filaEsperaDados.length;
      badgeCount.style.display = window.filaEsperaDados.length > 0 ? 'inline-block' : 'none';
    }

    if (!tbody) return;

    if (!rows || rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:24px; color:#94a3b8; font-weight:500;"><i class="ph ph-users" style="font-size:24px; display:block; margin-bottom:4px; color:#cbd5e1;"></i> Nenhum cliente na fila de espera no momento.</td></tr>';
      return;
    }

    const agora = new Date();

    tbody.innerHTML = rows.map((r, index) => {
      let minsEspera = 0;
      if (r.criado_em) {
        const dt = new Date(r.criado_em.includes('T') ? r.criado_em : r.criado_em.replace(' ', 'T'));
        if (!isNaN(dt.getTime())) minsEspera = Math.floor((agora - dt) / 60000);
      }
      minsEspera = Math.max(0, minsEspera);

      let statusTag = '';
      if (r.status === 'Notificado') {
        statusTag = `<span style="background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; padding:4px 8px; border-radius:6px; font-weight:700; font-size:11.5px; display:inline-flex; align-items:center; gap:4px;"><i class="ph ph-bell-ringing"></i> Notificado (${minsEspera}m)</span>`;
      } else if (r.status === 'Mesa Ofertada' || r.mesa_ofertada) {
        statusTag = `<span style="background:#f0fdf4; color:#15803d; border:1px solid #bbf7d0; padding:4px 8px; border-radius:6px; font-weight:700; font-size:11.5px; display:inline-flex; align-items:center; gap:4px;"><i class="ph ph-check-circle"></i> Ofertado (${escHtml(r.mesa_ofertada || '')})</span>`;
      } else {
        const badgeColor = minsEspera > 30 ? '#dc2626' : (minsEspera > 15 ? '#d97706' : '#16a34a');
        const badgeBg = minsEspera > 30 ? '#fef2f2' : (minsEspera > 15 ? '#fffbe6' : '#f0fdf4');
        const badgeBorder = minsEspera > 30 ? '#fecaca' : (minsEspera > 15 ? '#ffe58f' : '#bbf7d0');
        statusTag = `<span style="background:${badgeBg}; color:${badgeColor}; border:1px solid ${badgeBorder}; padding:4px 8px; border-radius:6px; font-weight:700; font-size:11.5px; display:inline-flex; align-items:center; gap:4px;"><i class="ph ph-clock"></i> ${minsEspera} min</span>`;
      }

      let prePedidosHtml = '';
      if (r.pre_pedidos) {
        try {
          const itens = JSON.parse(r.pre_pedidos);
          if (Array.isArray(itens) && itens.length > 0) {
            prePedidosHtml = `<div style="font-size:11px; color:#0284c7; margin-top:3px;"><i class="ph-bold ph-bag"></i> ${itens.length} pré-pedido(s)</div>`;
          }
        } catch (e) {}
      }

      const prefObs = [r.mesa_preferida ? `Pref: ${r.mesa_preferida}` : '', r.observacao || ''].filter(Boolean).join(' - ') || '—';

      return `
        <tr style="border-bottom:1px solid #f1f5f9;">
          <td style="padding:12px 10px; font-weight:700; color:#0f172a;">
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="background:#f1f5f9; color:#475569; border-radius:50%; width:22px; height:22px; display:inline-flex; align-items:center; justify-content:center; font-size:11px; font-weight:800; flex-shrink:0;">${index + 1}</span>
              <div>
                <div>${escHtml(r.cliente_nome)}</div>
                ${r.cliente_telefone ? `<div style="font-weight:normal; font-size:11.5px; color:#64748b; margin-top:2px;"><i class="ph ph-whatsapp-logo" style="color:#25d366;"></i> ${escHtml(r.cliente_telefone)}</div>` : ''}
              </div>
            </div>
          </td>
          <td style="padding:12px 10px; text-align:center; font-weight:800; color:#d97706; font-size:14px;">${r.pessoas || 2}p</td>
          <td style="padding:12px 10px;">${statusTag}</td>
          <td style="padding:12px 10px; font-size:12px; color:#475569;">${escHtml(prefObs)}${prePedidosHtml}</td>
          <td style="padding:12px 10px; text-align:center;">
            <div style="display:flex; gap:6px; justify-content:center;">
              <button type="button" onclick="window.acomodarClienteFilaPrompt(${r.id}, '${escHtml(r.cliente_nome).replace(/'/g, "\\'")}')" title="Acomodar na Mesa" style="background:#10b981; color:white; border:none; padding:6px 10px; border-radius:6px; font-weight:bold; cursor:pointer; font-size:11.5px; display:flex; align-items:center; gap:4px;">
                <i class="ph ph-armchair"></i> Sentar
              </button>
              ${r.cliente_telefone ? `
                <button type="button" onclick="window.chamarClienteWhatsapp(${r.id}, '${escHtml(r.cliente_nome).replace(/'/g, "\\'")}', '${r.cliente_telefone}', ${r.pessoas || 2})" title="Chamar no WhatsApp" style="background:#25d366; color:white; border:none; padding:6px 10px; border-radius:6px; font-weight:bold; cursor:pointer; font-size:11.5px; display:flex; align-items:center; gap:4px;">
                  <i class="ph ph-whatsapp-logo"></i> Chamar
                </button>
              ` : ''}
              <button type="button" onclick="window.removerClienteFilaEspera(${r.id})" title="Remover da Fila" style="background:#f1f5f9; color:#64748b; border:1px solid #cbd5e1; padding:6px 9px; border-radius:6px; cursor:pointer; font-size:11px;">
                <i class="ph ph-trash"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  // Socket listener
  if (typeof io !== 'undefined') {
    const s = (typeof socket !== 'undefined' && socket) ? socket : io();
    s.on('fila_espera_atualizada', (rows) => {
      renderFilaEsperaTabela(rows);
    });
  }

  // Intervalo de recalculo de tempos de espera a cada 15s
  setInterval(() => {
    const modal = document.getElementById('modal-fila-espera');
    if (modal && modal.style.display !== 'none' && window.filaEsperaDados && window.filaEsperaDados.length > 0) {
      renderFilaEsperaTabela(window.filaEsperaDados);
    }
  }, 15000);

  document.addEventListener('DOMContentLoaded', () => {
    garantirModaisFilaNoDOM();
  });

})(window);
