/**
 * scripts/update-index-toolbar.js
 * Adiciona o botão de Configurar Exibição no index.html e src/views/caixa/index.html
 */
const fs = require('fs');

function updateHtml(filePath) {
  if (!fs.existsSync(filePath)) return;
  let content = fs.readFileSync(filePath, 'utf8');

  // 1. Adiciona botão no .top-toolbar se não existir
  if (!content.includes('id="btn-toolbar-layout-customizer"')) {
    const target = '<button class="toolbar-btn btn-view-mode-toggle" id="btn-view-mode-toggle"';
    const addition = `<button class="toolbar-btn" id="btn-toolbar-layout-customizer" onclick="window.abrirModalPersonalizarLayout && window.abrirModalPersonalizarLayout()" title="Personalizar Exibição do Colaborador (Layout, Colunas, Zoom)"><i class="ph-bold ph-sliders"></i></button>\n      `;
    content = content.replace(target, addition + target);
  }

  // 2. Adiciona botão proeminente "Exibição" no Salão header se não existir
  if (!content.includes('id="btn-abrir-config-exibicao"')) {
    const target = '<!-- BOTÃO TOGGLE CONFIGURAR LAYOUT (RECOLHIDO POR PADRÃO) -->';
    const addition = `<!-- BOTÃO DIRETO CONFIGURAR EXIBIÇÃO -->\n              <button type="button" onclick="window.abrirModalPersonalizarLayout && window.abrirModalPersonalizarLayout()" id="btn-abrir-config-exibicao" class="chip-view-btn" title="Configurar Exibição do Colaborador (Layout, Colunas, Zoom)" style="padding: 4px 10px; border-radius: 8px; border: 1.5px solid rgba(252,75,21,0.35); font-size: 11.5px; font-weight: 700; cursor: pointer; background: rgba(252,75,21,0.08); color: #fc4b15; display: inline-flex; align-items: center; gap: 5px; transition: all 0.15s ease;"><i class="ph-bold ph-sliders"></i> <span>Exibição</span></button>\n              \n              `;
    content = content.replace(target, addition + target);
  }

  // 3. Atualiza o label do botão vertical no header para indicar padrão
  content = content.replace(
    '<strong id="label-monitor-vertical-val">Auto</strong>',
    '<strong id="label-monitor-vertical-val">Padrão</strong>'
  );

  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Updated index html:', filePath);
}

['index.html', 'src/views/caixa/index.html'].forEach(updateHtml);
