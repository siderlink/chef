/**
 * chef-layout-customizer.js — Gerenciador de Layout Personalizado por Colaborador
 */
(function (window, document) {
  'use strict';

  function getOperadorKey() {
    var op = localStorage.getItem('chef_operador_nome') || 
             (window.crmPerfil ? window.crmPerfil.nome : null) || 
             localStorage.getItem('crm_usuario') || 'Padrao';
    return 'chef_layout_user_' + encodeURIComponent(op.replace(/\s+/g, '_'));
  }

  window.obterConfigLayoutColaborador = function () {
    try {
      var saved = localStorage.getItem(getOperadorKey());
      if (saved) return JSON.parse(saved);
    } catch(e){}
    return {
      mesas_height_pct: 50,
      resumo_width_px: 320,
      info_mesa_local: 'topo', // 'topo' | 'resumo'
      dock_mini_visible: ['mini-lancar', 'mini-parcial', 'mini-fechar', 'mini-imprimir', 'mini-cliente', 'mini-qrcode', 'mini-desconto', 'mini-juntar', 'mini-chamar'],
      resumo_sections_visible: ['cliente', 'permanencia', 'racha', 'itens', 'totais']
    };
  };

  window.salvarConfigLayoutColaborador = function (config) {
    try {
      localStorage.setItem(getOperadorKey(), JSON.stringify(config));
      window.aplicarConfigLayoutColaborador();
    } catch(e){}
  };

  window.aplicarConfigLayoutColaborador = function () {
    var cfg = window.obterConfigLayoutColaborador();

    // 1. Altura do Painel de Mesas
    var mesasContainer = document.getElementById('mesas-section-container');
    if (mesasContainer && cfg.mesas_height_pct) {
      mesasContainer.style.flex = '0 0 ' + cfg.mesas_height_pct + '%';
    }

    // 2. Largura da Barra de Resumo (Direita)
    var rightPanel = document.getElementById('right-panel');
    if (rightPanel && cfg.resumo_width_px) {
      if (rightPanel.classList.contains('mode-expanded')) {
        rightPanel.style.width = cfg.resumo_width_px + 'px';
        rightPanel.style.maxWidth = (cfg.resumo_width_px + 20) + 'px';
      }
    }

    // 3. Local das Informações da Mesa (Topo da Tabela vs Barra de Resumo)
    var cardMesaInfo = document.getElementById('mobile-mesa-info-card');
    var targetResumo = document.getElementById('inner-right-panel');
    var targetTopo = document.getElementById('products-section-container');

    if (cardMesaInfo) {
      if (cfg.info_mesa_local === 'resumo' && targetResumo) {
        if (!targetResumo.contains(cardMesaInfo)) {
          targetResumo.insertBefore(cardMesaInfo, targetResumo.firstChild);
          cardMesaInfo.style.display = 'block';
          cardMesaInfo.style.marginBottom = '12px';
        }
      } else if (targetTopo) {
        if (!targetTopo.contains(cardMesaInfo)) {
          targetTopo.insertBefore(cardMesaInfo, targetTopo.firstChild);
        }
      }
    }

    // 4. Visibilidade dos Botões do Dock Mini (Esquerda)
    if (Array.isArray(cfg.dock_mini_visible)) {
      document.querySelectorAll('.dock-mini-btn').forEach(function (btn) {
        var id = btn.getAttribute('data-mini-id');
        if (id) {
          btn.style.display = cfg.dock_mini_visible.indexOf(id) !== -1 ? 'flex' : 'none';
        }
      });
    }
  };

  // ─── MODAL VISUAL DE PERSONALIZAÇÃO DO LAYOUT ───
  window.abrirModalPersonalizarLayout = function () {
    var cfg = window.obterConfigLayoutColaborador();
    var opNome = localStorage.getItem('chef_operador_nome') || 'Colaborador';

    var modal = document.getElementById('modal-personalizar-layout');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'modal-personalizar-layout';
      modal.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.85); backdrop-filter:blur(8px); z-index:999999; display:flex; align-items:center; justify-content:center; padding:16px; animation:fadeIn 0.2s ease;';
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div style="background:var(--bg-card, #ffffff); border-radius:24px; max-width:520px; width:100%; max-height:90vh; display:flex; flex-direction:column; overflow:hidden; box-shadow:0 20px 60px rgba(0,0,0,0.4); border:1px solid rgba(255,255,255,0.1); color:var(--text-primary, #0f172a);">
        <!-- CABEÇALHO -->
        <div style="padding:18px 20px; border-bottom:1px solid var(--border-color, #e2e8f0); display:flex; justify-content:space-between; align-items:center;">
          <div style="display:flex; align-items:center; gap:10px;">
            <div style="width:40px; height:40px; border-radius:12px; background:rgba(252,75,21,0.12); color:#fc4b15; display:flex; align-items:center; justify-content:center; font-size:22px;">
              <i class="ph-bold ph-layout"></i>
            </div>
            <div>
              <h3 style="margin:0; font-size:17px; font-weight:800;">Personalizar Layout do Operador</h3>
              <span style="font-size:12px; color:var(--text-secondary, #64748b);">Perfil ativo: <strong>${opNome}</strong></span>
            </div>
          </div>
          <button type="button" onclick="document.getElementById('modal-personalizar-layout').style.display='none'" style="background:#f1f5f9; border:none; width:34px; height:34px; border-radius:50%; color:#64748b; font-size:18px; cursor:pointer; display:flex; align-items:center; justify-content:center;">&times;</button>
        </div>

        <!-- CONTEÚDO SCROLL -->
        <div style="padding:18px 20px; overflow-y:auto; flex:1; display:flex; flex-direction:column; gap:16px;">
          
          <!-- 1. DISPOSIÇÃO DO SALÃO DE MESAS -->
          <div style="background:#f8fafc; padding:14px; border-radius:14px; border:1px solid #e2e8f0;">
            <label style="font-size:13px; font-weight:800; color:#0f172a; display:block; margin-bottom:8px;">
              <i class="ph-bold ph-squares-four" style="color:#fc4b15;"></i> Espaço Ocupado pelo Bloco de Mesas:
            </label>
            <div style="display:flex; align-items:center; gap:12px;">
              <input type="range" id="range-mesas-height" min="30" max="75" step="5" value="${cfg.mesas_height_pct || 50}" oninput="document.getElementById('label-mesas-height-val').innerText = this.value + '%'" style="flex:1; accent-color:#fc4b15; cursor:pointer;">
              <span id="label-mesas-height-val" style="font-size:13.5px; font-weight:800; color:#fc4b15; width:45px; text-align:right;">${cfg.mesas_height_pct || 50}%</span>
            </div>
          </div>

          <!-- 2. LOCAL DAS INFORMAÇÕES DA MESA -->
          <div style="background:#f8fafc; padding:14px; border-radius:14px; border:1px solid #e2e8f0;">
            <label style="font-size:13px; font-weight:800; color:#0f172a; display:block; margin-bottom:8px;">
              <i class="ph-bold ph-user-circle" style="color:#6366f1;"></i> Onde exibir informações da mesa (Cliente/Permanência):
            </label>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
              <label style="display:flex; align-items:center; gap:8px; padding:10px; border-radius:10px; border:1px solid #cbd5e1; background:white; cursor:pointer; font-size:12.5px; font-weight:700;">
                <input type="radio" name="radio-info-mesa-local" value="topo" ${cfg.info_mesa_local !== 'resumo' ? 'checked' : ''} style="accent-color:#6366f1;">
                <span>No Topo do Pedido</span>
              </label>
              <label style="display:flex; align-items:center; gap:8px; padding:10px; border-radius:10px; border:1px solid #cbd5e1; background:white; cursor:pointer; font-size:12.5px; font-weight:700;">
                <input type="radio" name="radio-info-mesa-local" value="resumo" ${cfg.info_mesa_local === 'resumo' ? 'checked' : ''} style="accent-color:#6366f1;">
                <span>Na Barra de Resumo (Direita)</span>
              </label>
            </div>
          </div>

          <!-- 3. BOTÕES VISÍVEIS NA MINIBARRA ESQUERDA -->
          <div style="background:#f8fafc; padding:14px; border-radius:14px; border:1px solid #e2e8f0;">
            <label style="font-size:13px; font-weight:800; color:#0f172a; display:block; margin-bottom:8px;">
              <i class="ph-bold ph-columns" style="color:#10b981;"></i> Botões Ativos na Minibarra Lateral (Esquerda):
            </label>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; font-size:12px; font-weight:600;">
              ${[
                { id: 'mini-lancar', label: '➕ Lançar Itens' },
                { id: 'mini-parcial', label: '💰 Pagamento Parcial' },
                { id: 'mini-fechar', label: '✅ Fechar Conta' },
                { id: 'mini-imprimir', label: '🖨️ Imprimir Conta' },
                { id: 'mini-cliente', label: '📱 Ver no Celular' },
                { id: 'mini-qrcode', label: '🔳 QR Code Mesa' },
                { id: 'mini-desconto', label: '🏷️ Desconto' },
                { id: 'mini-juntar', label: '🔀 Juntar Mesas' },
                { id: 'mini-chamar', label: '🔔 Chamar Garçom' }
              ].map(b => `
                <label style="display:flex; align-items:center; gap:8px; padding:6px 8px; background:white; border-radius:8px; border:1px solid #e2e8f0; cursor:pointer;">
                  <input type="checkbox" class="chk-dock-mini" value="${b.id}" ${(cfg.dock_mini_visible || []).indexOf(b.id) !== -1 ? 'checked' : ''} style="accent-color:#10b981;">
                  <span>${b.label}</span>
                </label>
              `).join('')}
            </div>
          </div>

        </div>

        <!-- BOTÕES DE AÇÃO -->
        <div style="padding:14px 20px; background:var(--bg-main, #f8fafc); border-top:1px solid var(--border-color, #e2e8f0); display:flex; justify-content:space-between; align-items:center; gap:10px;">
          <button type="button" onclick="window.restaurarLayoutPadrao()" style="background:transparent; border:none; color:#ef4444; font-weight:700; font-size:13px; cursor:pointer;">
            <i class="ph-bold ph-arrow-counter-clockwise"></i> Restaurar Padrão
          </button>
          
          <button type="button" onclick="window.confirmarSalvarLayoutModal()" style="background:#fc4b15; color:white; border:none; padding:10px 20px; border-radius:12px; font-weight:800; font-size:14px; cursor:pointer; display:flex; align-items:center; gap:6px; box-shadow:0 4px 14px rgba(252,75,21,0.3);">
            <i class="ph-bold ph-check"></i> Salvar Meu Layout
          </button>
        </div>
      </div>
    `;

    modal.style.display = 'flex';
  };

  window.confirmarSalvarLayoutModal = function () {
    var heightPct = parseInt(document.getElementById('range-mesas-height').value) || 50;
    var infoLocal = document.querySelector('input[name="radio-info-mesa-local"]:checked') ? document.querySelector('input[name="radio-info-mesa-local"]:checked').value : 'topo';

    var dockVisibles = [];
    document.querySelectorAll('.chk-dock-mini:checked').forEach(function (chk) {
      dockVisibles.push(chk.value);
    });

    var newConfig = {
      mesas_height_pct: heightPct,
      resumo_width_px: 320,
      info_mesa_local: infoLocal,
      dock_mini_visible: dockVisibles
    };

    window.salvarConfigLayoutColaborador(newConfig);

    var modal = document.getElementById('modal-personalizar-layout');
    if (modal) modal.style.display = 'none';

    if (typeof window.showToast === 'function') {
      window.showToast('✅ Layout personalizado salvo com sucesso para o seu perfil!', 'success');
    }
  };

  window.restaurarLayoutPadrao = function () {
    try { localStorage.removeItem(getOperadorKey()); } catch(e){}
    window.aplicarConfigLayoutColaborador();
    var modal = document.getElementById('modal-personalizar-layout');
    if (modal) modal.style.display = 'none';
    if (typeof window.showToast === 'function') window.showToast('Layout padrão restaurado!', 'info');
  };

  // Inicialização (aplica o layout salvo)
  // Nota: o arraste do splitter #splitter-middle-v é de responsabilidade
  // exclusiva do main.js (initMesasSectionResizer), que também persiste a
  // altura via window.salvarAlturaPainelMesas. Mantido aqui apenas o apply.

  // Salva a altura do painel de mesas definida pelo arraste do splitter
  window.salvarAlturaPainelMesas = function (pct) {
    var cfg = window.obterConfigLayoutColaborador();
    cfg.mesas_height_pct = Math.round(pct);
    window.salvarConfigLayoutColaborador(cfg);
  };

  document.addEventListener('DOMContentLoaded', function () {
    setTimeout(window.aplicarConfigLayoutColaborador, 200);
  });

})(window, document);
