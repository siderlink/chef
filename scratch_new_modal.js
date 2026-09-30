window.abrirModalReordenarSeccoes = function() {
  let modal = document.getElementById('modal-reordenar-seccoes');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modal-reordenar-seccoes';
    modal.className = 'modal-overlay hidden';
    document.body.appendChild(modal);
  }

  const cfg = window.getDonoModularConfig();
  const fontScale = cfg.fontScale || 1.0;

    const sortedSecoes = [...DONO_SECOES_DEF].sort((a, b) => {
    const itemA = cfg.secoes.find(s => s.id === a.id) || { ordem: 99 };
    const itemB = cfg.secoes.find(s => s.id === b.id) || { ordem: 99 };
    return itemA.ordem - itemB.ordem;
  });

  let htmlSeccoes = sortedSecoes.map((def) => {
    const item = cfg.secoes.find(s => s.id === def.id) || { visivel: true, largura: 'medium', ordem: 99 };
    return `
      <div class="mod-item-card" data-sec-id="${def.id}" style="background:var(--card2); border:1px solid var(--border); border-radius:14px; padding:14px; display:flex; flex-direction:column; gap:10px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <strong style="font-size:15px; color:var(--text); display:flex; align-items:center; gap:8px;">
            <span class="drag-handle" style="cursor:grab; padding: 4px; display:inline-flex; opacity:0.5;" title="Arraste para reordenar"><i class="ph-bold ph-dots-six-vertical"></i></span>
            <i class="ph-bold ${def.icon}" style="color:var(--primary);"></i> ${def.nome}
          </strong>
          <div style="display:flex; gap:6px;">
            <button type="button" onclick="window.moverSecaoDono('${def.id}', -1)" style="padding:6px 10px; border-radius:8px; border:1px solid var(--border); background:var(--card); color:var(--text); cursor:pointer; font-weight:800;">⬆️</button>
            <button type="button" onclick="window.moverSecaoDono('${def.id}', 1)" style="padding:6px 10px; border-radius:8px; border:1px solid var(--border); background:var(--card); color:var(--text); cursor:pointer; font-weight:800;">⬇️</button>
          </div>
        </div>

        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; font-size:12px;">
          <div>
            <label style="color:var(--text-sub); font-weight:700; display:block; margin-bottom:4px;">Tamanho / Largura</label>
            <select onchange="window.alterarParametroSecao('${def.id}', 'largura', this.value)" class="form-input" style="padding:8px 10px; font-size:12px;">
              <option value="small" ${item.largura === 'small' ? 'selected' : ''}>Pequeno (1 col)</option>
              <option value="medium" ${item.largura === 'medium' ? 'selected' : ''}>Médio (2 cols)</option>
              <option value="large" ${item.largura === 'large' ? 'selected' : ''}>Grande (Linha Toda)</option>
            </select>
          </div>
          <div>
            <label style="color:var(--text-sub); font-weight:700; display:block; margin-bottom:4px;">Visibilidade</label>
            <select onchange="window.alterarParametroSecao('${def.id}', 'visivel', this.value === 'true')" class="form-input" style="padding:8px 10px; font-size:12px;">
              <option value="true" ${item.visivel !== false ? 'selected' : ''}>👁️ Exibir</option>
              <option value="false" ${item.visivel === false ? 'selected' : ''}>🙈 Ocultar</option>
            </select>
          </div>
        </div>
      </div>
    `;
  }).join('');

  modal.innerHTML = `
    <div class="modal-sheet" style="max-width: 680px;">
      <div class="modal-drag"></div>
      <div class="modal-title-row">
        <span class="modal-title"><i class="ph-bold ph-sliders" style="color:var(--primary);"></i> Personalizar Painel</span>
        <button class="modal-close" onclick="fecharModal('modal-reordenar-seccoes')"><i class="ph-bold ph-x"></i></button>
      </div>

      <p style="font-size:13.5px; color:var(--text-sub); line-height:1.4; margin-bottom:12px;">
        Escolha um <strong>Perfil Pronto por Faixa Etária</strong> ou personalize o tamanho e a visibilidade de cada card individualmente.
      </p>

      <!-- Presets de Perfil por Faixa Etária -->
      <div style="background:var(--card2); border:1px solid var(--border); border-radius:16px; padding:16px; margin-bottom:16px;">
        <div style="font-size:12px; font-weight:800; color:var(--primary); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:10px;">
          ⚡ Perfis Rápidos por Faixa Etária
        </div>
        <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:8px;">
          <button type="button" onclick="window.aplicarPerfilDono('senior')" class="btn-primary" style="padding:12px 8px; font-size:12px; flex-direction:column; gap:4px; text-align:center; background:linear-gradient(135deg, #10b981, #059669);">
            <span style="font-size:18px;">👓</span>
            <span>Sênior (60+)</span>
            <small style="font-size:10px; opacity:0.8; font-weight:600;">Fontes & Botões Gigantes</small>
          </button>

          <button type="button" onclick="window.aplicarPerfilDono('jovem')" class="btn-primary" style="padding:12px 8px; font-size:12px; flex-direction:column; gap:4px; text-align:center; background:linear-gradient(135deg, #fc4b15, #ea580c);">
            <span style="font-size:18px;">⚡</span>
            <span>Jovem / Executivo</span>
            <small style="font-size:10px; opacity:0.8; font-weight:600;">Bento Grid Completo</small>
          </button>

          <button type="button" onclick="window.aplicarPerfilDono('mobile_one_hand')" class="btn-primary" style="padding:12px 8px; font-size:12px; flex-direction:column; gap:4px; text-align:center; background:linear-gradient(135deg, #3b82f6, #2563eb);">
            <span style="font-size:18px;">📱</span>
            <span>Mobile Mão Única</span>
            <small style="font-size:10px; opacity:0.8; font-weight:600;">Direto no Essencial</small>
          </button>
        </div>
      </div>

      <!-- Ajuste Rápido de Fonte (Acessibilidade) -->
      <div style="display:flex; justify-content:space-between; align-items:center; background:var(--card2); border:1px solid var(--border); border-radius:14px; padding:12px 16px; margin-bottom:16px;">
        <span style="font-size:13px; font-weight:700; color:var(--text); display:flex; align-items:center; gap:6px;">
          <i class="ph-bold ph-text-aa" style="color:var(--yellow);"></i> Tamanho do Texto & Ícones:
        </span>
        <div style="display:flex; gap:6px;">
          <button type="button" onclick="window.alterarEscalaFonteDono(1.0)" style="padding:6px 12px; border-radius:8px; border:1px solid var(--border); background:${fontScale === 1.0 ? 'var(--primary)' : 'var(--card)'}; color:white; font-size:12px; font-weight:800; cursor:pointer;">Padrão (100%)</button>
          <button type="button" onclick="window.alterarEscalaFonteDono(1.25)" style="padding:6px 12px; border-radius:8px; border:1px solid var(--border); background:${fontScale >= 1.2 ? 'var(--green)' : 'var(--card)'}; color:white; font-size:12px; font-weight:800; cursor:pointer;">👓 Gigante (125% - 60+)</button>
        </div>
      </div>

      <div style="font-size:12px; font-weight:800; color:var(--text-sub); text-transform:uppercase; margin-bottom:10px; letter-spacing:0.5px;">
        Ajuste Card a Card (Ordem & Dimensão)
      </div>

      <div id="dono-modal-sortable-list" style="display:flex; flex-direction:column; gap:10px; max-height:360px; overflow-y:auto; padding-right:4px; padding-left:4px; padding-bottom: 20px;">
        ${htmlSeccoes}
      </div>

      <div style="display:flex; gap:10px; margin-top:16px;">
        <button class="btn-cancel" onclick="fecharModal('modal-reordenar-seccoes')" style="flex:1; padding:14px;">Concluído</button>
      </div>
    </div>
  `;

  modal.classList.remove('hidden');
};
