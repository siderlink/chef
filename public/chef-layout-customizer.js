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
      mesas_agrupado: true
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

    // 5. Exibições da Tela de Mesas (Resumo do Salão / Setores / Busca)
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

    // 6. Disposição (ordem) dos painéis laterais — Minibarra PODE ir para a direita
    //    e a Barra de Resumo para a esquerda (disposição modular do caixa).
    //    Usa ordens simétricas (-2/0/2) para deixar slots inteiros (-1/+1) para
    //    os splitters (#resizer-left/#resizer-right) ficarem entre os painéis.
    var workspace = document.querySelector('.workspace');
    var leftPanel = document.getElementById('left-panel');
    var mainPanel = document.getElementById('main-panel');
    if (workspace && leftPanel && rightPanel && mainPanel) {
      leftPanel.style.order = cfg.dock_lado === 'direita' ? '2' : '-2';
      rightPanel.style.order = cfg.resumo_lado === 'esquerda' ? '-2' : '2';
      mainPanel.style.order = '0';
      var rl = document.getElementById('resizer-left');
      var rr = document.getElementById('resizer-right');
      if (rl) rl.style.order = String(parseInt(leftPanel.style.order, 10) / 2);
      if (rr) rr.style.order = String(parseInt(rightPanel.style.order, 10) / 2);
      if (typeof window.chefSyncSplitterOrders === 'function') window.chefSyncSplitterOrders();
    }

    // 7. Modo (tamanho) da Minibarra e da Barra de Resumo
    if (leftPanel && cfg.dock_modo && typeof window.chefApplySidebarMode === 'function') {
      var dockMode = cfg.dock_modo === 'compacta' ? 'mini' : (cfg.dock_modo === 'oculta' ? 'hidden' : 'expanded');
      window.chefApplySidebarMode('left', dockMode);
    }
    if (rightPanel && cfg.resumo_modo && typeof window.chefApplySidebarMode === 'function') {
      var resumoMode = cfg.resumo_modo === 'compacto' ? 'mini' : (cfg.resumo_modo === 'oculto' ? 'hidden' : 'expanded');
      window.chefApplySidebarMode('right', resumoMode);
      if (resumoMode === 'expanded') {
        var wRes = parseInt(cfg.resumo_width_px, 10) || 320;
        rightPanel.style.width = wRes + 'px';
        rightPanel.style.maxWidth = (wRes + 20) + 'px';
        rightPanel.style.minWidth = (wRes - 20) + 'px';
        try { localStorage.setItem('chef_sidebar_right_width', String(wRes)); } catch(e){}
      }
    }

    // 8. Posição da Barra de Setores (acima/abaixo do Resumo do Salão)
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

    // 9. Orientação, colunas e agrupamento do Bloco de Mesas
    if (cfg.mesas_orientacao && typeof window.setMesasOrientation === 'function') {
      window.setMesasOrientation(cfg.mesas_orientacao);
    }
    if (cfg.mesas_colunas && typeof window.setMesaGridCols === 'function') {
      window.setMesaGridCols(cfg.mesas_colunas);
    }
    if (cfg.mesas_agrupado !== undefined && window.chefMesasAgrupado !== !!cfg.mesas_agrupado && typeof window.toggleMesasAgrupado === 'function') {
      window.toggleMesasAgrupado();
    }

    try { window.dispatchEvent(new CustomEvent('chef_layout_colaborador_salvo')); } catch(e){}
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
            <span style="font-size:11px; color:#94a3b8; display:block; margin-top:8px;">A posição da minibarra (esquerda/direita) e o tamanho são definidos nos módulos abaixo.</span>
          </div>

          <!-- MÓDULOS DO CAIXA: TAMANHO E DISPOSIÇÃO -->
          <div style="background:#f8fafc; padding:14px; border-radius:14px; border:1px solid #e2e8f0;">
            <label style="font-size:14px; font-weight:800; color:#0f172a; display:block; margin-bottom:4px;">
              <i class="ph-bold ph-squares-four" style="color:#fc4b15;"></i> Módulos do Caixa — Tamanho &amp; Disposição
            </label>
            <span style="font-size:11.5px; color:#64748b; display:block; margin-bottom:10px;">Escolha como cada módulo fica: lado, modo (tamanho), colunas e o que mostrar. Nada é apagado.</span>

            <div style="display:flex; flex-direction:column; gap:10px;">

              <!-- Minibarra (dock) -->
              <div style="background:white; border:1px solid #e2e8f0; border-radius:12px; padding:10px 12px;">
                <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
                  <i class="ph-bold ph-columns" style="color:#10b981;"></i>
                  <span style="font-size:12.5px; font-weight:800; color:#0f172a;">Minibarra Lateral</span>
                </div>
                <div style="display:flex; flex-wrap:wrap; gap:10px; align-items:center; font-size:12px; font-weight:600; color:#334155;">
                  <span>Lado:</span>
                  ${[['esquerda','Esquerda'],['direita','Direita']].map(o => `
                    <label style="display:flex; align-items:center; gap:5px; cursor:pointer;">
                      <input type="radio" name="radio-dock-lado" value="${o[0]}" ${cfg.dock_lado === o[0] ? 'checked' : ''} style="accent-color:#10b981;">
                      ${o[1]}
                    </label>`).join('')}
                  <span style="width:1px;height:16px;background:#e2e8f0;"></span>
                  <span>Tamanho:</span>
                  <select id="select-dock-modo" style="padding:5px 8px; border-radius:8px; border:1px solid #cbd5e1; font-size:12px; font-weight:700; cursor:pointer;">
                    <option value="expandida" ${cfg.dock_modo === 'expandida' ? 'selected' : ''}>Expandida</option>
                    <option value="compacta" ${cfg.dock_modo === 'compacta' ? 'selected' : ''}>Compacta</option>
                    <option value="oculta" ${cfg.dock_modo === 'oculta' ? 'selected' : ''}>Oculta</option>
                  </select>
                </div>
              </div>

              <!-- Bloco de Mesas -->
              <div style="background:white; border:1px solid #e2e8f0; border-radius:12px; padding:10px 12px;">
                <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
                  <i class="ph-bold ph-squares-four" style="color:#fc4b15;"></i>
                  <span style="font-size:12.5px; font-weight:800; color:#0f172a;">Bloco de Mesas</span>
                  <span style="font-size:10.5px; color:#94a3b8;">(altura no primeiro controle)</span>
                </div>
                <div style="display:flex; flex-wrap:wrap; gap:10px; align-items:center; font-size:12px; font-weight:600; color:#334155;">
                  <span>Disposição:</span>
                  <select id="select-mesas-orient" style="padding:5px 8px; border-radius:8px; border:1px solid #cbd5e1; font-size:12px; font-weight:700; cursor:pointer;">
                    <option value="horizontal" ${cfg.mesas_orientacao === 'horizontal' ? 'selected' : ''}>Horizontal</option>
                    <option value="vertical" ${cfg.mesas_orientacao === 'vertical' ? 'selected' : ''}>Vertical</option>
                  </select>
                  <select id="select-mesas-colunas" style="padding:5px 8px; border-radius:8px; border:1px solid #cbd5e1; font-size:12px; font-weight:700; cursor:pointer;">
                    <option value="1" ${cfg.mesas_colunas === '1' ? 'selected' : ''}>1 Coluna</option>
                    <option value="2" ${cfg.mesas_colunas === '2' ? 'selected' : ''}>2 Colunas</option>
                    <option value="3" ${cfg.mesas_colunas === '3' ? 'selected' : ''}>3 Colunas</option>
                    <option value="compact" ${cfg.mesas_colunas === 'compact' ? 'selected' : ''}>Compacto</option>
                  </select>
                  <label style="display:flex; align-items:center; gap:5px; cursor:pointer; margin-left:4px;">
                    <input type="checkbox" id="chk-mesas-agrupado" ${cfg.mesas_agrupado !== false ? 'checked' : ''} style="accent-color:#fc4b15;">
                    Agrupar por status
                  </label>
                </div>
              </div>

              <!-- Barra de Resumo -->
              <div style="background:white; border:1px solid #e2e8f0; border-radius:12px; padding:10px 12px;">
                <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
                  <i class="ph-bold ph-chart-bar" style="color:#6366f1;"></i>
                  <span style="font-size:12.5px; font-weight:800; color:#0f172a;">Barra de Resumo (resumo da mesa)</span>
                </div>
                <div style="display:flex; flex-wrap:wrap; gap:10px; align-items:center; font-size:12px; font-weight:600; color:#334155;">
                  <span>Lado:</span>
                  ${[['direita','Direita'],['esquerda','Esquerda']].map(o => `
                    <label style="display:flex; align-items:center; gap:5px; cursor:pointer;">
                      <input type="radio" name="radio-resumo-lado" value="${o[0]}" ${cfg.resumo_lado === o[0] ? 'checked' : ''} style="accent-color:#6366f1;">
                      ${o[1]}
                    </label>`).join('')}
                  <span style="width:1px;height:16px;background:#e2e8f0;"></span>
                  <span>Tamanho:</span>
                  <select id="select-resumo-modo" style="padding:5px 8px; border-radius:8px; border:1px solid #cbd5e1; font-size:12px; font-weight:700; cursor:pointer;">
                    <option value="expandido" ${cfg.resumo_modo === 'expandido' ? 'selected' : ''}>Expandido</option>
                    <option value="compacto" ${cfg.resumo_modo === 'compacto' ? 'selected' : ''}>Compacto</option>
                    <option value="oculto" ${cfg.resumo_modo === 'oculto' ? 'selected' : ''}>Oculto</option>
                  </select>
                  <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
                    Largura:
                    <input type="range" id="range-resumo-width" min="260" max="420" step="10" value="${cfg.resumo_width_px || 320}" oninput="document.getElementById('label-resumo-width-val').innerText = this.value + 'px'" style="width:110px; accent-color:#6366f1; cursor:pointer;">
                    <span id="label-resumo-width-val" style="font-size:11.5px; font-weight:800; color:#6366f1; width:48px; text-align:right;">${cfg.resumo_width_px || 320}px</span>
                  </label>
                </div>
              </div>

              <!-- Resumo do Salão -->
              <div style="background:white; border:1px solid #e2e8f0; border-radius:12px; padding:10px 12px;">
                <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:12.5px; font-weight:800; color:#0f172a;">
                  <input type="checkbox" class="chk-caixa-ux" value="caixa_ux_resumo_visible" ${cfg.caixa_ux_resumo_visible !== false ? 'checked' : ''} style="accent-color:#fc4b15;">
                  <i class="ph-bold ph-lightning" style="color:#f59e0b;"></i> Resumo do Salão (indicadores + atalhos)
                </label>
              </div>

              <!-- Setores -->
              <div style="background:white; border:1px solid #e2e8f0; border-radius:12px; padding:10px 12px;">
                <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:12.5px; font-weight:800; color:#0f172a; margin-bottom:8px;">
                  <input type="checkbox" class="chk-caixa-ux" value="caixa_ux_setores_visible" ${cfg.caixa_ux_setores_visible !== false ? 'checked' : ''} style="accent-color:#fc4b15;">
                  <i class="ph-bold ph-grid-four" style="color:#10b981;"></i> Barra de Setores do Salão
                </label>
                <div style="display:flex; flex-wrap:wrap; gap:10px; align-items:center; font-size:12px; font-weight:600; color:#334155; padding-left:30px;">
                  <span>Posição:</span>
                  <select id="select-setores-posicao" style="padding:5px 8px; border-radius:8px; border:1px solid #cbd5e1; font-size:12px; font-weight:700; cursor:pointer;">
                    <option value="abaixo" ${cfg.setores_posicao !== 'antes' ? 'selected' : ''}>Abaixo do Resumo do Salão</option>
                    <option value="antes" ${cfg.setores_posicao === 'antes' ? 'selected' : ''}>Acima do Resumo do Salão</option>
                  </select>
                </div>
              </div>

              <!-- Busca -->
              <div style="background:white; border:1px solid #e2e8f0; border-radius:12px; padding:10px 12px;">
                <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:12.5px; font-weight:800; color:#0f172a;">
                  <input type="checkbox" class="chk-caixa-ux" value="caixa_ux_busca_visible" ${cfg.caixa_ux_busca_visible !== false ? 'checked' : ''} style="accent-color:#fc4b15;">
                  <i class="ph-bold ph-magnifying-glass" style="color:#64748b;"></i> Busca de Mesa / Comanda (no top-menubar)
                </label>
              </div>

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

    var dockLado = document.querySelector('input[name="radio-dock-lado"]:checked');
    dockLado = dockLado ? dockLado.value : 'esquerda';
    var resumoLado = document.querySelector('input[name="radio-resumo-lado"]:checked');
    resumoLado = resumoLado ? resumoLado.value : 'direita';

    var caixaUxFlags = { caixa_ux_resumo_visible: true, caixa_ux_setores_visible: true, caixa_ux_busca_visible: true };
    document.querySelectorAll('.chk-caixa-ux').forEach(function (chk) {
      caixaUxFlags[chk.value] = chk.checked;
    });

    var resumoWidth = parseInt(document.getElementById('range-resumo-width').value) || 320;

    var newConfig = {
      mesas_height_pct: heightPct,
      resumo_width_px: resumoWidth,
      info_mesa_local: infoLocal,
      dock_mini_visible: dockVisibles,
      caixa_ux_resumo_visible: caixaUxFlags.caixa_ux_resumo_visible,
      caixa_ux_setores_visible: caixaUxFlags.caixa_ux_setores_visible,
      caixa_ux_busca_visible: caixaUxFlags.caixa_ux_busca_visible,
      dock_lado: dockLado,
      dock_modo: document.getElementById('select-dock-modo').value,
      resumo_lado: resumoLado,
      resumo_modo: document.getElementById('select-resumo-modo').value,
      setores_posicao: document.getElementById('select-setores-posicao').value,
      mesas_orientacao: document.getElementById('select-mesas-orient').value,
      mesas_colunas: document.getElementById('select-mesas-colunas').value,
      mesas_agrupado: document.getElementById('chk-mesas-agrupado').checked
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
