/**
 * chef-layout-customizer.js — Gerenciador de Layout Personalizado por Colaborador
 * Permite que cada operador/colaborador personalize totalmente sua exibição no Caixa
 */
(function (window, document) {
  'use strict';

  function getOperadorKey() {
    var op = localStorage.getItem('chef_operador_nome') || 
             (window.crmPerfil ? window.crmPerfil.nome : null) || 
             localStorage.getItem('crm_usuario') || 
             localStorage.getItem('usuario_logado') || 'Padrao';
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
      resumo_sections_visible: ['cliente', 'permanencia', 'racha', 'itens', 'totais'],
      caixa_ux_resumo_visible: true,
      caixa_ux_setores_visible: true,
      caixa_ux_busca_visible: true,
      dock_lado: 'esquerda',   // 'esquerda' | 'direita'
      dock_modo: 'expandida',  // 'expandida' | 'compacta' | 'oculta'
      resumo_lado: 'direita',  // 'direita' | 'esquerda'
      resumo_modo: 'expandido',// 'expandido' | 'compacto' | 'oculto'
      setores_posicao: 'abaixo', // 'abaixo' (do Resumo) | 'antes'
      mesas_orientacao: 'horizontal',
      mesas_colunas: '2',      // '1' | '2' | '3' | 'compact'
      mesas_agrupado: true,
      monitor_vertical_modo: 'auto', // 'disabled' | 'stacked' | '2col' | 'auto'
      zoom_pct: 100            // 85 | 90 | 100 | 110 | 120
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

    // 1. Escala / Zoom da Interface
    var z = parseInt(cfg.zoom_pct, 10) || 100;
    if (document.documentElement) {
      if (z === 100) {
        document.documentElement.style.zoom = '';
      } else {
        document.documentElement.style.zoom = z + '%';
      }
    }

    // 2. Altura do Painel de Mesas
    var mesasContainer = document.getElementById('mesas-section-container');
    if (mesasContainer && cfg.mesas_height_pct) {
      mesasContainer.style.flex = '0 0 ' + cfg.mesas_height_pct + '%';
    }

    // 3. Largura da Barra de Resumo (Direita)
    var rightPanel = document.getElementById('right-panel');
    if (rightPanel && cfg.resumo_width_px) {
      if (rightPanel.classList.contains('mode-expanded') || !rightPanel.classList.contains('mode-mini')) {
        var rw = parseInt(cfg.resumo_width_px, 10) || 320;
        rightPanel.style.width = rw + 'px';
        rightPanel.style.maxWidth = (rw + 20) + 'px';
        rightPanel.style.minWidth = (rw - 20) + 'px';
      }
    }

    // 4. Local das Informações da Mesa (Topo da Tabela vs Barra de Resumo)
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

    // 5. Visibilidade dos Botões do Dock Mini (Esquerda)
    if (Array.isArray(cfg.dock_mini_visible)) {
      document.querySelectorAll('.dock-mini-btn').forEach(function (btn) {
        var id = btn.getAttribute('data-mini-id');
        if (id) {
          btn.style.display = cfg.dock_mini_visible.indexOf(id) !== -1 ? 'flex' : 'none';
        }
      });
    }

    // 6. Exibições da Tela de Mesas (Resumo do Salão / Setores / Busca)
    var resumoCaixa = document.getElementById('caixa-ux-dashboard-header');
    if (resumoCaixa) {
      resumoCaixa.style.setProperty('display', cfg.caixa_ux_resumo_visible === false ? 'none' : 'block', 'important');
    }
    var setoresCaixa = document.getElementById('caixa-ux-setores-container');
    if (setoresCaixa) {
      setoresCaixa.style.setProperty('display', cfg.caixa_ux_setores_visible === false ? 'none' : 'block', 'important');
    }
    var buscaCaixa = document.getElementById('caixa-ux-search-box-topbar');
    if (buscaCaixa) {
      buscaCaixa.style.setProperty('display', cfg.caixa_ux_busca_visible === false ? 'none' : 'flex', 'important');
    }

    // 7. Disposição (ordem) dos painéis laterais
    var workspace = document.querySelector('.workspace');
    var leftPanel = document.getElementById('left-panel');
    var mainPanel = document.getElementById('main-panel');
    if (workspace && leftPanel && rightPanel && mainPanel) {
      leftPanel.style.order = cfg.dock_lado === 'direita' ? '2' : '-2';
      rightPanel.style.order = cfg.resumo_lado === 'esquerda' ? '-2' : '2';
      mainPanel.style.order = '0';
      mainPanel.scrollLeft = 0;
      var rl = document.getElementById('resizer-left');
      var rr = document.getElementById('resizer-right');
      if (rl) rl.style.order = String(parseInt(leftPanel.style.order, 10) / 2);
      if (rr) rr.style.order = String(parseInt(rightPanel.style.order, 10) / 2);
      if (typeof window.chefSyncSplitterOrders === 'function') window.chefSyncSplitterOrders();
    }

    // 8. Modo (tamanho) da Barra Esquerda e Direita
    if (leftPanel && cfg.dock_modo) {
      if (typeof window.chefApplySidebarMode === 'function') {
        var defaultDock = (window.innerWidth < 900 && !cfg.dock_modo) ? 'mini' : 'expanded';
        var dockMode = cfg.dock_modo === 'compacta' ? 'mini' : (cfg.dock_modo === 'oculta' ? 'hidden' : (cfg.dock_modo === 'expandida' ? 'expanded' : defaultDock));
        window.chefApplySidebarMode('left', dockMode);
      } else if (typeof window.applyLeftSidebarResize === 'function') {
        window.applyLeftSidebarResize(cfg.dock_modo === 'compacta' ? 68 : (cfg.dock_modo === 'oculta' ? 0 : 240));
      }
    }
    if (rightPanel && cfg.resumo_modo && typeof window.chefApplySidebarMode === 'function') {
      var resumoMode = cfg.resumo_modo === 'compacto' ? 'mini' : (cfg.resumo_modo === 'oculto' ? 'hidden' : 'expanded');
      window.chefApplySidebarMode('right', resumoMode);
      if (resumoMode === 'expanded') {
        var wRes = parseInt(cfg.resumo_width_px, 10) || 280;
        if (window.innerWidth < 768) {
          wRes = Math.min(wRes, 210);
        } else if (window.innerWidth < 850 && wRes > 250) {
          wRes = 240;
        }
        rightPanel.style.width = wRes + 'px';
        rightPanel.style.maxWidth = Math.max(wRes + 20, 340) + 'px';
        rightPanel.style.minWidth = '190px';
        rightPanel.style.flexShrink = '1';
        try { localStorage.setItem('chef_sidebar_right_width', String(wRes)); } catch(e){}
      }
    }

    // 9. Posição da Barra de Setores (acima/abaixo do Resumo do Salão)
    var resumoCaixaEl = document.getElementById('caixa-ux-dashboard-header');
    var setoresCaixaEl = document.getElementById('caixa-ux-setores-container');
    if (resumoCaixaEl && setoresCaixaEl) {
      if (cfg.setores_posicao === 'antes') {
        resumoCaixaEl.style.order = '1';
        setoresCaixaEl.style.order = '0';
      } else {
        resumoCaixaEl.style.order = '0';
        setoresCaixaEl.style.order = '0';
      }
    }

    // 10. Orientação, colunas e agrupamento do Bloco de Mesas
    if (cfg.mesas_orientacao && typeof window.setMesasOrientation === 'function') {
      window.setMesasOrientation(cfg.mesas_orientacao);
    }
    if (cfg.mesas_colunas && typeof window.setMesaGridCols === 'function') {
      window.setMesaGridCols(cfg.mesas_colunas);
    }
    if (cfg.mesas_agrupado !== undefined && window.chefMesasAgrupado !== !!cfg.mesas_agrupado && typeof window.toggleMesasAgrupado === 'function') {
      window.toggleMesasAgrupado();
    }

    // 11. Modo Monitor Vertical (Pivot / Retrato)
    var vMode = cfg.monitor_vertical_modo || localStorage.getItem('chef_monitor_vertical_mode') || 'auto';
    var isPortrait = (window.innerHeight || 0) >= (window.innerWidth || 1);
    var h = window.innerHeight || 0;
    var w = window.innerWidth || 0;
    var isVert = false;
    if (vMode === 'stacked' || vMode === '2col') {
      isVert = true;
    } else if (vMode === 'auto') {
      // Telas em proporção retrato, janela estreita (<850px) ou split screen no monitor
      isVert = (isPortrait && h >= 580 && w < 850) || (w < 680);
    } else {
      isVert = false;
    }

    document.body.classList.toggle('chef-monitor-vertical', isVert);
    document.documentElement.classList.toggle('chef-monitor-vertical', isVert);
    document.body.classList.toggle('device-monitor-vertical', isVert);
    document.documentElement.classList.toggle('device-monitor-vertical', isVert);
    document.body.classList.toggle('chef-vertical-2col', isVert && vMode === '2col');
    document.body.classList.toggle('chef-vertical-stacked', isVert && vMode !== '2col');

    var lblVMode = document.getElementById('label-monitor-vertical-val');
    if (lblVMode) {
      var mapNames = { 'disabled': 'Padrão (3 Col)', 'stacked': 'Empilhado', '2col': '2 Col', 'auto': 'Auto' };
      lblVMode.innerText = mapNames[vMode] || 'Padrão';
    }

    try { window.dispatchEvent(new CustomEvent('chef_layout_colaborador_salvo')); } catch(e){}
  };

  window.setMonitorVerticalMode = function (mode) {
    var cfg = window.obterConfigLayoutColaborador();
    cfg.monitor_vertical_modo = mode;
    try { localStorage.setItem('chef_monitor_vertical_mode', mode); } catch(e){}
    window.salvarConfigLayoutColaborador(cfg);
    if (typeof window.showToast === 'function') {
      var mapToast = {
        'disabled': '🖥️ Layout Desktop: 3 colunas tradicionais (Padrão)',
        'stacked': '📐 Layout Empilhado: 100% largura útil, resumo no rodapé',
        '2col': '📑 Layout 2-Colunas: mini-dock + resumo lateral',
        'auto': '🤖 Layout Automático (detecta orientação do monitor)'
      };
      window.showToast(mapToast[mode] || 'Modo de visualização atualizado', 'info');
    }
  };

  window.cycleMonitorVerticalMode = function () {
    var cfg = window.obterConfigLayoutColaborador();
    var cur = cfg.monitor_vertical_modo || localStorage.getItem('chef_monitor_vertical_mode') || 'disabled';
    var next = cur === 'disabled' ? 'stacked' : (cur === 'stacked' ? '2col' : (cur === '2col' ? 'disabled' : 'disabled'));
    window.setMonitorVerticalMode(next);
  };

  // ── PRESETS DE LAYOUT EM 1 CLIQUE ──
  window.aplicarPresetLayout = function (preset) {
    if (preset === 'desktop_3col') {
      document.getElementById('range-mesas-height').value = '50';
      document.getElementById('label-mesas-height-val').innerText = '50%';
      document.getElementById('select-dock-modo').value = 'expandida';
      document.getElementById('select-resumo-modo').value = 'expandido';
      document.getElementById('range-resumo-width').value = '280';
      document.getElementById('label-resumo-width-val').innerText = '280px';
      document.getElementById('select-mesas-colunas').value = '2';
      document.getElementById('select-mesas-orient').value = 'horizontal';
      document.getElementById('select-monitor-vertical-modo').value = 'disabled';
      document.getElementById('select-zoom-pct').value = '100';
    } else if (preset === 'stacked_vertical') {
      document.getElementById('range-mesas-height').value = '42';
      document.getElementById('label-mesas-height-val').innerText = '42%';
      document.getElementById('select-dock-modo').value = 'compacta';
      document.getElementById('select-resumo-modo').value = 'expandido';
      document.getElementById('range-resumo-width').value = '320';
      document.getElementById('label-resumo-width-val').innerText = '320px';
      document.getElementById('select-mesas-colunas').value = '3';
      document.getElementById('select-mesas-orient').value = 'horizontal';
      document.getElementById('select-monitor-vertical-modo').value = 'stacked';
      document.getElementById('select-zoom-pct').value = '100';
    } else if (preset === 'duas_colunas') {
      document.getElementById('range-mesas-height').value = '50';
      document.getElementById('label-mesas-height-val').innerText = '50%';
      document.getElementById('select-dock-modo').value = 'compacta';
      document.getElementById('select-resumo-modo').value = 'expandido';
      document.getElementById('range-resumo-width').value = '280';
      document.getElementById('label-resumo-width-val').innerText = '280px';
      document.getElementById('select-mesas-colunas').value = '3';
      document.getElementById('select-mesas-orient').value = 'horizontal';
      document.getElementById('select-monitor-vertical-modo').value = '2col';
      document.getElementById('select-zoom-pct').value = '100';
    } else if (preset === 'foco_pedido') {
      document.getElementById('range-mesas-height').value = '35';
      document.getElementById('label-mesas-height-val').innerText = '35%';
      document.getElementById('select-dock-modo').value = 'expandida';
      document.getElementById('select-resumo-modo').value = 'expandido';
      document.getElementById('range-resumo-width').value = '340';
      document.getElementById('label-resumo-width-val').innerText = '340px';
      document.getElementById('select-mesas-colunas').value = '2';
      document.getElementById('select-mesas-orient').value = 'horizontal';
      document.getElementById('select-monitor-vertical-modo').value = 'disabled';
      document.getElementById('select-zoom-pct').value = '100';
    }

    // Marca o cartão selecionado
    document.querySelectorAll('.preset-layout-card').forEach(function(c) {
      c.style.borderColor = '#e2e8f0';
      c.style.background = '#ffffff';
    });
    var selCard = document.getElementById('preset-card-' + preset);
    if (selCard) {
      selCard.style.borderColor = '#fc4b15';
      selCard.style.background = 'rgba(252,75,21,0.06)';
    }
  };

  // ─── MODAL VISUAL DE PERSONALIZAÇÃO DO LAYOUT ───
  window.abrirModalPersonalizarLayout = function () {
    var cfg = window.obterConfigLayoutColaborador();
    var opNome = localStorage.getItem('chef_operador_nome') || 
                 (window.crmPerfil ? window.crmPerfil.nome : null) || 
                 localStorage.getItem('usuario_logado') || 'Colaborador';

    var modal = document.getElementById('modal-personalizar-layout');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'modal-personalizar-layout';
      modal.style.cssText = 'position:fixed; inset:0; background:rgba(15,23,42,0.8); backdrop-filter:blur(6px); z-index:999999; display:flex; align-items:center; justify-content:center; padding:16px; animation:fadeIn 0.2s ease;';
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div style="background:var(--bg-card, #ffffff); border-radius:22px; max-width:620px; width:100%; max-height:92vh; display:flex; flex-direction:column; overflow:hidden; box-shadow:0 25px 70px rgba(0,0,0,0.45); border:1px solid rgba(255,255,255,0.15); color:var(--text-primary, #0f172a); font-family:var(--font-family, system-ui, sans-serif);">
        <!-- CABEÇALHO -->
        <div style="padding:16px 20px; border-bottom:1px solid var(--border-color, #e2e8f0); display:flex; justify-content:space-between; align-items:center; background:var(--bg-secondary, #f8fafc);">
          <div style="display:flex; align-items:center; gap:12px;">
            <div style="width:42px; height:42px; border-radius:12px; background:linear-gradient(135deg, #fc4b15, #ff7a45); color:#ffffff; display:flex; align-items:center; justify-content:center; font-size:22px; box-shadow:0 4px 12px rgba(252,75,21,0.3);">
              <i class="ph-bold ph-sliders"></i>
            </div>
            <div>
              <h3 style="margin:0; font-size:16.5px; font-weight:800; color:var(--text-primary, #0f172a);">Configurar Exibição do Caixa</h3>
              <span style="font-size:12px; color:var(--text-secondary, #64748b);">Perfil ativo: <strong style="color:#fc4b15;">${opNome}</strong> • Preferências exclusivas do operador</span>
            </div>
          </div>
          <button type="button" onclick="document.getElementById('modal-personalizar-layout').style.display='none'" style="background:transparent; border:none; width:34px; height:34px; border-radius:8px; color:#64748b; font-size:20px; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:background 0.15s;" onmouseover="this.style.background='#e2e8f0'" onmouseout="this.style.background='transparent'">&times;</button>
        </div>

        <!-- CONTEÚDO SCROLL -->
        <div style="padding:18px 20px; overflow-y:auto; flex:1; display:flex; flex-direction:column; gap:16px;">
          
          <!-- PRESETS DE LAYOUT EM 1 CLIQUE -->
          <div>
            <label style="font-size:12.5px; font-weight:800; text-transform:uppercase; letter-spacing:0.5px; color:#64748b; display:block; margin-bottom:8px;">
              ⚡ Presets Rápidos de Visualização
            </label>
            <div style="display:grid; grid-template-columns:repeat(2, 1fr); gap:10px;">
              
              <div id="preset-card-desktop_3col" class="preset-layout-card" onclick="window.aplicarPresetLayout('desktop_3col')" style="border:1.5px solid ${cfg.monitor_vertical_modo === 'disabled' || !cfg.monitor_vertical_modo ? '#fc4b15' : '#e2e8f0'}; background:${cfg.monitor_vertical_modo === 'disabled' || !cfg.monitor_vertical_modo ? 'rgba(252,75,21,0.06)' : '#ffffff'}; border-radius:12px; padding:12px; cursor:pointer; transition:all 0.15s ease;">
                <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
                  <span style="font-size:18px;">🖥️</span>
                  <strong style="font-size:13px; color:#0f172a;">Desktop 3 Colunas</strong>
                </div>
                <span style="font-size:11px; color:#64748b; line-height:1.3; display:block;">Padrão ideal: Ações à esquerda, Salão e Pedido no centro, Resumo à direita.</span>
              </div>

              <div id="preset-card-duas_colunas" class="preset-layout-card" onclick="window.aplicarPresetLayout('duas_colunas')" style="border:1.5px solid ${cfg.monitor_vertical_modo === '2col' ? '#fc4b15' : '#e2e8f0'}; background:${cfg.monitor_vertical_modo === '2col' ? 'rgba(252,75,21,0.06)' : '#ffffff'}; border-radius:12px; padding:12px; cursor:pointer; transition:all 0.15s ease;">
                <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
                  <span style="font-size:18px;">📑</span>
                  <strong style="font-size:13px; color:#0f172a;">2 Colunas</strong>
                </div>
                <span style="font-size:11px; color:#64748b; line-height:1.3; display:block;">Mini-dock de ícones, Salão amplo no centro e Resumo lateral fixo.</span>
              </div>

              <div id="preset-card-stacked_vertical" class="preset-layout-card" onclick="window.aplicarPresetLayout('stacked_vertical')" style="border:1.5px solid ${cfg.monitor_vertical_modo === 'stacked' ? '#fc4b15' : '#e2e8f0'}; background:${cfg.monitor_vertical_modo === 'stacked' ? 'rgba(252,75,21,0.06)' : '#ffffff'}; border-radius:12px; padding:12px; cursor:pointer; transition:all 0.15s ease;">
                <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
                  <span style="font-size:18px;">📱</span>
                  <strong style="font-size:13px; color:#0f172a;">Monitor Vertical</strong>
                </div>
                <span style="font-size:11px; color:#64748b; line-height:1.3; display:block;">Telas em pé: 100% largura útil para mesas, resumo de pagamento no rodapé.</span>
              </div>

              <div id="preset-card-foco_pedido" class="preset-layout-card" onclick="window.aplicarPresetLayout('foco_pedido')" style="border:1.5px solid #e2e8f0; background:#ffffff; border-radius:12px; padding:12px; cursor:pointer; transition:all 0.15s ease;">
                <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
                  <span style="font-size:18px;">🔍</span>
                  <strong style="font-size:13px; color:#0f172a;">Foco no Pedido</strong>
                </div>
                <span style="font-size:11px; color:#64748b; line-height:1.3; display:block;">Salão compacto (35%) e tabela de itens do pedido ampliada (65%).</span>
              </div>

            </div>
          </div>

          <!-- 1. BLOCO DE SALÃO E MESAS -->
          <div style="background:var(--bg-secondary, #f8fafc); padding:14px; border-radius:14px; border:1px solid var(--border-color, #e2e8f0);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
              <label style="font-size:13px; font-weight:800; color:var(--text-primary, #0f172a); display:flex; align-items:center; gap:6px;">
                <i class="ph-bold ph-squares-four" style="color:#fc4b15; font-size:16px;"></i> Salão de Mesas &amp; Comandas
              </label>
              <span id="label-mesas-height-val" style="font-size:12.5px; font-weight:800; color:#fc4b15; background:rgba(252,75,21,0.1); padding:2px 8px; border-radius:6px;">${cfg.mesas_height_pct || 50}%</span>
            </div>
            
            <div style="margin-bottom:12px;">
              <span style="font-size:11.5px; color:#64748b; display:block; margin-bottom:4px;">Altura ocupada pelo Salão de Mesas:</span>
              <input type="range" id="range-mesas-height" min="25" max="75" step="5" value="${cfg.mesas_height_pct || 50}" oninput="document.getElementById('label-mesas-height-val').innerText = this.value + '%'" style="width:100%; accent-color:#fc4b15; cursor:pointer;">
            </div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:10px;">
              <div>
                <span style="font-size:11.5px; font-weight:700; color:#334155; display:block; margin-bottom:4px;">Colunas de Mesas:</span>
                <select id="select-mesas-colunas" style="width:100%; padding:7px 10px; border-radius:8px; border:1px solid #cbd5e1; font-size:12px; font-weight:700; background:white; cursor:pointer;">
                  <option value="1" ${cfg.mesas_colunas === '1' ? 'selected' : ''}>☰ 1 Coluna (Lista corrida)</option>
                  <option value="2" ${cfg.mesas_colunas === '2' ? 'selected' : ''}>⊞ 2 Colunas (Equilibrado)</option>
                  <option value="3" ${cfg.mesas_colunas === '3' ? 'selected' : ''}>⊞ 3 Colunas (Compacto)</option>
                  <option value="compact" ${cfg.mesas_colunas === 'compact' ? 'selected' : ''}>❖ Modo Ultra Compacto</option>
                </select>
              </div>

              <div>
                <span style="font-size:11.5px; font-weight:700; color:#334155; display:block; margin-bottom:4px;">Disposição do Bloco:</span>
                <select id="select-mesas-orient" style="width:100%; padding:7px 10px; border-radius:8px; border:1px solid #cbd5e1; font-size:12px; font-weight:700; background:white; cursor:pointer;">
                  <option value="horizontal" ${cfg.mesas_orientacao === 'horizontal' ? 'selected' : ''}>Horizontal (Lado a lado)</option>
                  <option value="vertical" ${cfg.mesas_orientacao === 'vertical' ? 'selected' : ''}>Vertical (Empilhado)</option>
                </select>
              </div>
            </div>

            <div style="display:flex; flex-direction:column; gap:6px; pt:4px; font-size:12px; font-weight:600; color:#334155;">
              <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                <input type="checkbox" id="chk-mesas-agrupado" ${cfg.mesas_agrupado !== false ? 'checked' : ''} style="accent-color:#fc4b15;">
                Agrupar mesas por status (Livres, Ocupadas, Em Fechamento)
              </label>
              <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                <input type="checkbox" class="chk-caixa-ux" value="caixa_ux_resumo_visible" ${cfg.caixa_ux_resumo_visible !== false ? 'checked' : ''} style="accent-color:#fc4b15;">
                Exibir Resumo do Salão no topo (indicadores e atalhos rápidos)
              </label>
              <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                <input type="checkbox" class="chk-caixa-ux" value="caixa_ux_setores_visible" ${cfg.caixa_ux_setores_visible !== false ? 'checked' : ''} style="accent-color:#fc4b15;">
                Exibir Barra de Setores do Salão (Interno, Deck, Balcão)
              </label>
            </div>
          </div>

          <!-- 2. BARRA LATERAL DE AÇÕES (ESQUERDA) -->
          <div style="background:var(--bg-secondary, #f8fafc); padding:14px; border-radius:14px; border:1px solid var(--border-color, #e2e8f0);">
            <label style="font-size:13px; font-weight:800; color:var(--text-primary, #0f172a); display:flex; align-items:center; gap:6px; margin-bottom:8px;">
              <i class="ph-bold ph-columns" style="color:#10b981; font-size:16px;"></i> Barra Lateral de Ações (Atalhos do Caixa)
            </label>
            
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:10px;">
              <div>
                <span style="font-size:11.5px; font-weight:700; color:#334155; display:block; margin-bottom:4px;">Estilo da Barra:</span>
                <select id="select-dock-modo" style="width:100%; padding:7px 10px; border-radius:8px; border:1px solid #cbd5e1; font-size:12px; font-weight:700; background:white; cursor:pointer;">
                  <option value="expandida" ${cfg.dock_modo === 'expandida' ? 'selected' : ''}>Expandida (Texto + Ícones)</option>
                  <option value="compacta" ${cfg.dock_modo === 'compacta' ? 'selected' : ''}>Apenas Ícones (Dock 68px)</option>
                  <option value="oculta" ${cfg.dock_modo === 'oculta' ? 'selected' : ''}>Oculta</option>
                </select>
              </div>

              <div>
                <span style="font-size:11.5px; font-weight:700; color:#334155; display:block; margin-bottom:4px;">Posição na Tela:</span>
                <div style="display:flex; gap:12px; align-items:center; height:32px;">
                  <label style="display:flex; align-items:center; gap:5px; font-size:12px; font-weight:700; cursor:pointer;">
                    <input type="radio" name="radio-dock-lado" value="esquerda" ${cfg.dock_lado !== 'direita' ? 'checked' : ''} style="accent-color:#10b981;"> Esquerda
                  </label>
                  <label style="display:flex; align-items:center; gap:5px; font-size:12px; font-weight:700; cursor:pointer;">
                    <input type="radio" name="radio-dock-lado" value="direita" ${cfg.dock_lado === 'direita' ? 'checked' : ''} style="accent-color:#10b981;"> Direita
                  </label>
                </div>
              </div>
            </div>

            <div>
              <span style="font-size:11.5px; font-weight:700; color:#334155; display:block; margin-bottom:6px;">Botões Visíveis na Barra Rápida:</span>
              <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:6px; font-size:11.5px; font-weight:600;">
                ${[
                  { id: 'mini-lancar', label: '➕ Lançar Itens' },
                  { id: 'mini-parcial', label: '💰 Pagto Parcial' },
                  { id: 'mini-fechar', label: '✅ Fechar Conta' },
                  { id: 'mini-imprimir', label: '🖨️ Imprimir' },
                  { id: 'mini-cliente', label: '📱 Ver no Celular' },
                  { id: 'mini-qrcode', label: '🔳 QR Mesa' },
                  { id: 'mini-desconto', label: '🏷️ Desconto' },
                  { id: 'mini-juntar', label: '🔀 Juntar Mesas' },
                  { id: 'mini-chamar', label: '🔔 Chamar Garçom' }
                ].map(b => `
                  <label style="display:flex; align-items:center; gap:6px; padding:6px 8px; background:white; border-radius:8px; border:1px solid #e2e8f0; cursor:pointer;">
                    <input type="checkbox" class="chk-dock-mini" value="${b.id}" ${(cfg.dock_mini_visible || []).indexOf(b.id) !== -1 ? 'checked' : ''} style="accent-color:#10b981;">
                    <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${b.label}</span>
                  </label>
                `).join('')}
              </div>
            </div>
          </div>

          <!-- 3. BARRA DE RESUMO E TOTAIS (DIREITA) -->
          <div style="background:var(--bg-secondary, #f8fafc); padding:14px; border-radius:14px; border:1px solid var(--border-color, #e2e8f0);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
              <label style="font-size:13px; font-weight:800; color:var(--text-primary, #0f172a); display:flex; align-items:center; gap:6px;">
                <i class="ph-bold ph-receipt" style="color:#6366f1; font-size:16px;"></i> Painel de Totais &amp; Fechamento (Direita)
              </label>
              <span id="label-resumo-width-val" style="font-size:12.5px; font-weight:800; color:#6366f1; background:rgba(99,102,241,0.1); padding:2px 8px; border-radius:6px;">${cfg.resumo_width_px || 320}px</span>
            </div>

            <div style="margin-bottom:12px;">
              <span style="font-size:11.5px; color:#64748b; display:block; margin-bottom:4px;">Largura do painel de resumo:</span>
              <input type="range" id="range-resumo-width" min="260" max="420" step="10" value="${cfg.resumo_width_px || 320}" oninput="document.getElementById('label-resumo-width-val').innerText = this.value + 'px'" style="width:100%; accent-color:#6366f1; cursor:pointer;">
            </div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:10px;">
              <div>
                <span style="font-size:11.5px; font-weight:700; color:#334155; display:block; margin-bottom:4px;">Modo do Resumo:</span>
                <select id="select-resumo-modo" style="width:100%; padding:7px 10px; border-radius:8px; border:1px solid #cbd5e1; font-size:12px; font-weight:700; background:white; cursor:pointer;">
                  <option value="expandido" ${cfg.resumo_modo === 'expandido' ? 'selected' : ''}>Expandido (Padrão)</option>
                  <option value="compacto" ${cfg.resumo_modo === 'compacto' ? 'selected' : ''}>Compacto</option>
                  <option value="oculto" ${cfg.resumo_modo === 'oculto' ? 'selected' : ''}>Oculto</option>
                </select>
              </div>

              <div>
                <span style="font-size:11.5px; font-weight:700; color:#334155; display:block; margin-bottom:4px;">Lado do Resumo:</span>
                <div style="display:flex; gap:12px; align-items:center; height:32px;">
                  <label style="display:flex; align-items:center; gap:5px; font-size:12px; font-weight:700; cursor:pointer;">
                    <input type="radio" name="radio-resumo-lado" value="direita" ${cfg.resumo_lado !== 'esquerda' ? 'checked' : ''} style="accent-color:#6366f1;"> Direita
                  </label>
                  <label style="display:flex; align-items:center; gap:5px; font-size:12px; font-weight:700; cursor:pointer;">
                    <input type="radio" name="radio-resumo-lado" value="esquerda" ${cfg.resumo_lado === 'esquerda' ? 'checked' : ''} style="accent-color:#6366f1;"> Esquerda
                  </label>
                </div>
              </div>
            </div>

            <div>
              <span style="font-size:11.5px; font-weight:700; color:#334155; display:block; margin-bottom:4px;">Onde mostrar dados da mesa (Cliente/Permanência):</span>
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
                <label style="display:flex; align-items:center; gap:6px; padding:7px 10px; border-radius:8px; border:1px solid #cbd5e1; background:white; cursor:pointer; font-size:12px; font-weight:700;">
                  <input type="radio" name="radio-info-mesa-local" value="topo" ${cfg.info_mesa_local !== 'resumo' ? 'checked' : ''} style="accent-color:#6366f1;">
                  <span>No Topo do Pedido</span>
                </label>
                <label style="display:flex; align-items:center; gap:6px; padding:7px 10px; border-radius:8px; border:1px solid #cbd5e1; background:white; cursor:pointer; font-size:12px; font-weight:700;">
                  <input type="radio" name="radio-info-mesa-local" value="resumo" ${cfg.info_mesa_local === 'resumo' ? 'checked' : ''} style="accent-color:#6366f1;">
                  <span>No Painel de Resumo</span>
                </label>
              </div>
            </div>
          </div>

          <!-- 4. ESCALA / ZOOM & MONITOR VERTICAL -->
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
            <!-- ZOOM -->
            <div style="background:var(--bg-secondary, #f8fafc); padding:14px; border-radius:14px; border:1px solid var(--border-color, #e2e8f0);">
              <label style="font-size:12.5px; font-weight:800; color:var(--text-primary, #0f172a); display:flex; align-items:center; gap:6px; margin-bottom:6px;">
                <i class="ph-bold ph-magnifying-glass-plus" style="color:#0ea5e9;"></i> Escala / Zoom da Tela
              </label>
              <select id="select-zoom-pct" style="width:100%; padding:7px 10px; border-radius:8px; border:1px solid #cbd5e1; font-size:12px; font-weight:700; background:white; cursor:pointer;">
                <option value="85" ${cfg.zoom_pct == 85 ? 'selected' : ''}>85% (Mais mesas na tela)</option>
                <option value="90" ${cfg.zoom_pct == 90 ? 'selected' : ''}>90% (Compacto)</option>
                <option value="100" ${!cfg.zoom_pct || cfg.zoom_pct == 100 ? 'selected' : ''}>100% (Padrão 1:1)</option>
                <option value="110" ${cfg.zoom_pct == 110 ? 'selected' : ''}>110% (Texto ampliado)</option>
                <option value="120" ${cfg.zoom_pct == 120 ? 'selected' : ''}>120% (Touch / Balcão)</option>
              </select>
            </div>

            <!-- MONITOR VERTICAL -->
            <div style="background:var(--bg-secondary, #f8fafc); padding:14px; border-radius:14px; border:1px solid var(--border-color, #e2e8f0);">
              <label style="font-size:12.5px; font-weight:800; color:var(--text-primary, #0f172a); display:flex; align-items:center; gap:6px; margin-bottom:6px;">
                <i class="ph-bold ph-device-tablet-speaker" style="color:#2563eb;"></i> Monitor na Vertical (Pivot)
              </label>
              <select id="select-monitor-vertical-modo" style="width:100%; padding:7px 10px; border-radius:8px; border:1px solid #cbd5e1; font-size:12px; font-weight:700; background:white; cursor:pointer;">
                <option value="disabled" ${cfg.monitor_vertical_modo === 'disabled' || !cfg.monitor_vertical_modo ? 'selected' : ''}>❌ Desativado (3 colunas tradicionais)</option>
                <option value="stacked" ${cfg.monitor_vertical_modo === 'stacked' ? 'selected' : ''}>📐 Empilhado no rodapé</option>
                <option value="2col" ${cfg.monitor_vertical_modo === '2col' ? 'selected' : ''}>📑 2-Colunas (Mini-dock + Lateral)</option>
                <option value="auto" ${cfg.monitor_vertical_modo === 'auto' ? 'selected' : ''}>🤖 Automático</option>
              </select>
            </div>
          </div>

        </div>

        <!-- BOTÕES DE AÇÃO -->
        <div style="padding:14px 20px; background:var(--bg-secondary, #f8fafc); border-top:1px solid var(--border-color, #e2e8f0); display:flex; justify-content:space-between; align-items:center; gap:10px;">
          <button type="button" onclick="window.restaurarLayoutPadrao()" style="background:transparent; border:none; color:#ef4444; font-weight:700; font-size:12.5px; cursor:pointer; display:flex; align-items:center; gap:5px; padding:6px 10px; border-radius:8px;" onmouseover="this.style.background='rgba(239,68,68,0.1)'" onmouseout="this.style.background='transparent'">
            <i class="ph-bold ph-arrow-counter-clockwise"></i> Restaurar Padrão Perfeito
          </button>
          
          <div style="display:flex; align-items:center; gap:8px;">
            <button type="button" onclick="document.getElementById('modal-personalizar-layout').style.display='none'" style="background:#e2e8f0; color:#475569; border:none; padding:9px 16px; border-radius:10px; font-weight:700; font-size:13px; cursor:pointer;">
              Cancelar
            </button>
            <button type="button" onclick="window.confirmarSalvarLayoutModal()" style="background:#fc4b15; color:white; border:none; padding:9px 20px; border-radius:10px; font-weight:800; font-size:13.5px; cursor:pointer; display:flex; align-items:center; gap:6px; box-shadow:0 4px 14px rgba(252,75,21,0.35);">
              <i class="ph-bold ph-check"></i> Salvar Minha Exibição
            </button>
          </div>
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

    var dockLado = document.querySelector('input[name="radio-dock-lado"]:checked');
    dockLado = dockLado ? dockLado.value : 'esquerda';
    var resumoLado = document.querySelector('input[name="radio-resumo-lado"]:checked');
    resumoLado = resumoLado ? resumoLado.value : 'direita';

    var caixaUxFlags = { caixa_ux_resumo_visible: true, caixa_ux_setores_visible: true, caixa_ux_busca_visible: true };
    document.querySelectorAll('.chk-caixa-ux').forEach(function (chk) {
      caixaUxFlags[chk.value] = chk.checked;
    });

    var resumoWidth = parseInt(document.getElementById('range-resumo-width').value) || 320;
    var zoomPct = parseInt(document.getElementById('select-zoom-pct').value) || 100;

    var newConfig = {
      mesas_height_pct: heightPct,
      resumo_width_px: resumoWidth,
      info_mesa_local: infoLocal,
      dock_mini_visible: dockVisibles,
      caixa_ux_resumo_visible: caixaUxFlags.caixa_ux_resumo_visible,
      caixa_ux_setores_visible: caixaUxFlags.caixa_ux_setores_visible,
      caixa_ux_busca_visible: true,
      dock_lado: dockLado,
      dock_modo: document.getElementById('select-dock-modo').value,
      resumo_lado: resumoLado,
      resumo_modo: document.getElementById('select-resumo-modo').value,
      setores_posicao: 'abaixo',
      mesas_orientacao: document.getElementById('select-mesas-orient').value,
      mesas_colunas: document.getElementById('select-mesas-colunas').value,
      mesas_agrupado: document.getElementById('chk-mesas-agrupado').checked,
      monitor_vertical_modo: document.getElementById('select-monitor-vertical-modo').value,
      zoom_pct: zoomPct
    };

    window.salvarConfigLayoutColaborador(newConfig);

    var modal = document.getElementById('modal-personalizar-layout');
    if (modal) modal.style.display = 'none';

    if (typeof window.showToast === 'function') {
      window.showToast('✅ Sua exibição foi salva e aplicada com sucesso!', 'success');
    }
  };

  window.restaurarLayoutPadrao = function () {
    try { 
      localStorage.removeItem(getOperadorKey());
      localStorage.removeItem('chef_monitor_vertical_mode');
    } catch(e){}
    
    // Reseta zoom e classes
    if (document.documentElement) document.documentElement.style.zoom = '';
    document.body.classList.remove('chef-monitor-vertical', 'device-monitor-vertical', 'chef-vertical-2col', 'chef-vertical-stacked');
    document.documentElement.classList.remove('chef-monitor-vertical', 'device-monitor-vertical');

    window.aplicarConfigLayoutColaborador();
    
    var modal = document.getElementById('modal-personalizar-layout');
    if (modal) modal.style.display = 'none';
    
    if (typeof window.showToast === 'function') {
      window.showToast('↺ Layout padrão restaurado com sucesso!', 'info');
    }
  };

  // Salva a altura do painel de mesas definida pelo arraste do splitter
  window.salvarAlturaPainelMesas = function (pct) {
    var cfg = window.obterConfigLayoutColaborador();
    cfg.mesas_height_pct = Math.round(pct);
    window.salvarConfigLayoutColaborador(cfg);
  };

  document.addEventListener('DOMContentLoaded', function () {
    setTimeout(window.aplicarConfigLayoutColaborador, 150);
  });

})(window, document);
