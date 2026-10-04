/**
 * scripts/apply-layout-fix.js
 * Aplica a correção completa de layout do Caixa e personalização de exibição do colaborador.
 */
const fs = require('fs');
const path = require('path');

function replaceInFile(filePath, search, replacement) {
  if (!fs.existsSync(filePath)) {
    console.log('Skipping (not found):', filePath);
    return false;
  }
  let content = fs.readFileSync(filePath, 'utf8');
  if (typeof search === 'string') {
    if (!content.includes(search)) {
      console.log('Search string not found in:', filePath);
      return false;
    }
    content = content.replace(search, replacement);
  } else if (search instanceof RegExp) {
    if (!search.test(content)) {
      console.log('Regex pattern not found in:', filePath);
      return false;
    }
    content = content.replace(search, replacement);
  }
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Successfully updated:', filePath);
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. CORREÇÃO DE style.css & src/css/style.css
// ─────────────────────────────────────────────────────────────────────────────
function fixStyleCss(filePath) {
  if (!fs.existsSync(filePath)) return;
  let content = fs.readFileSync(filePath, 'utf8');

  // a) Moderniza .action-group e .btn-action
  const actionGroupOld = /\.action-group\s*\{[\s\S]*?padding:\s*8px;[\s\S]*?box-shadow:\s*0\s*1px\s*2px\s*#00000005[\s\S]*?\}/;
  const actionGroupNew = `.action-group {
  border: none;
  background: transparent;
  margin-bottom: 8px;
  padding: 0;
  box-shadow: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
}`;
  content = content.replace(actionGroupOld, actionGroupNew);

  const groupTitleOld = /\.group-title\s*\{[\s\S]*?color:\s*var\(--text-secondary\);[\s\S]*?border-bottom:\s*1px\s*solid\s*#f0f0f0;[\s\S]*?\}/;
  const groupTitleNew = `.group-title {
  color: var(--text-secondary, #64748b);
  text-transform: uppercase;
  border-bottom: 1px solid var(--border-subtle, rgba(0,0,0,0.06));
  margin-bottom: 4px;
  padding-bottom: 2px;
  padding-left: 2px;
  font-size: 10.5px;
  font-weight: 800;
  letter-spacing: 0.5px;
}`;
  content = content.replace(groupTitleOld, groupTitleNew);

  const btnActionOld = /\.btn-action\s*\{[\s\S]*?white-space:\s*normal;[\s\S]*?border-radius:\s*4px;[\s\S]*?transition:\s*all\s*\.2s;[\s\S]*?display:\s*flex[\s\S]*?\}/;
  const btnActionNew = `.btn-action {
  color: var(--text-primary);
  font-family: var(--font-family);
  cursor: pointer;
  white-space: nowrap;
  text-align: center;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  justify-content: center;
  align-items: center;
  gap: 6px;
  width: 100%;
  height: auto;
  min-height: 36px;
  padding: 7px 8px;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.2;
  transition: all .15s ease;
  display: flex;
  box-shadow: 0 1px 2px rgba(0,0,0,0.02);
}`;
  content = content.replace(btnActionOld, btnActionNew);

  // b) Garante que .info-row e .info-row .val nunca quebrem moeda e fiquem flex
  const infoRowOld = /\.info-row\s*\{[\s\S]*?justify-content:\s*space-between;[\s\S]*?align-items:\s*flex-start;[\s\S]*?margin-bottom:\s*8px;[\s\S]*?font-size:\s*12px;[\s\S]*?display:\s*flex[\s\S]*?\}[\s\S]*?\.info-row>:last-child\s*\{[\s\S]*?text-align:\s*right;[\s\S]*?word-break:\s*break-word;[\s\S]*?flex:\s*1[\s\S]*?\}/;
  const infoRowNew = `.info-row {
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 12px;
  display: flex;
  width: 100%;
}

.info-row:last-child {
  margin-bottom: 0;
}

.info-row span:first-child,
.info-row .label,
.info-row > :first-child {
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1 1 auto;
}

.info-row > :last-child,
.info-row .val {
  text-align: right;
  white-space: nowrap !important;
  word-break: keep-all !important;
  flex-shrink: 0 !important;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
}`;
  content = content.replace(infoRowOld, infoRowNew);

  // c) No resumo do rodapé empilhado (quando ativo), aumentar min-width de 130px para 210px
  content = content.replace(
    /grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(130px,\s*1fr\)\)\s*!important;/g,
    'grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)) !important;'
  );

  // d) Remove as media queries soltas @media screen and (orientation: portrait) and (min-height: 680px) and (min-width: 500px)
  // que sequestravam a tela inteira mesmo sem chef-monitor-vertical ativo
  content = content.replace(
    /@media screen and \(orientation: portrait\) and \(min-height: 680px\) and \(min-width: 500px\) \{[\s\S]*?body:not\(\.force-mobile\) table\.products-table td:nth-child\(7\) \{[\s\S]*?\}\s*\}/g,
    '/* Media query de tabela portrait desativada para manter layout do colaborador */'
  );

  content = content.replace(
    /@media screen and \(orientation: portrait\) and \(min-height: 680px\) and \(min-width: 500px\) \{[\s\S]*?body:not\(\.chef-vertical-2col\):not\(\.force-mobile\) \.workspace \{[\s\S]*?\}\s*\}/g,
    '/* Media query workspace portrait desativada para manter layout do colaborador */'
  );

  content = content.replace(
    /@media screen and \(orientation: portrait\) and \(min-height: 680px\) and \(min-width: 500px\) \{[\s\S]*?body:not\(\.chef-vertical-2col\):not\(\.force-mobile\) #right-panel[\s\S]*?\}\s*\}/g,
    '/* Media query right-panel portrait desativada para manter layout do colaborador */'
  );

  content = content.replace(
    /@media screen and \(orientation: portrait\) and \(min-height: 680px\) and \(min-width: 500px\) \{[\s\S]*?body:not\(\.left-expanded\):not\(\.force-mobile\) #left-panel[\s\S]*?\}\s*\}/g,
    '/* Media query left-panel portrait desativada para manter layout do colaborador */'
  );

  // e) Adiciona regra global de segurança para que números de moeda NUNCA fiquem verticais
  if (!content.includes('/* CHEF CURRENCY PROTECTION */')) {
    content += `\n
/* CHEF CURRENCY PROTECTION */
.info-row .val,
#resumo-taxas,
#total-pagar-text,
#resumo-total-itens,
#resumo-desconto,
#resumo-subtotal,
.summary-row .val,
.acoes-total,
.acoes-falta {
  white-space: nowrap !important;
  word-break: keep-all !important;
  flex-shrink: 0 !important;
  font-variant-numeric: tabular-nums !important;
  text-align: right !important;
}
`;
  }

  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Fixed style css:', filePath);
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. CORREÇÃO DE device-adapters.css
// ─────────────────────────────────────────────────────────────────────────────
function fixDeviceAdaptersCss(filePath) {
  if (!fs.existsSync(filePath)) return;
  let content = fs.readFileSync(filePath, 'utf8');

  // Remove seletores órfãos com vírgula antes de @media
  content = content.replace(/,\s*\n\s*@media/g, ';\n@media');

  // Remove as media queries soltas portrait que sequestravam o right-panel
  content = content.replace(
    /@media screen and \(orientation: portrait\) and \(min-height: 680px\) and \(min-width: 500px\) \{[\s\S]*?body:not\(\.chef-vertical-2col\):not\(\.force-mobile\) #right-panel[\s\S]*?\}\s*\}/g,
    '/* Media query right-panel portrait desativada */'
  );

  content = content.replace(
    /grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(130px,\s*1fr\)\)\s*!important;/g,
    'grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)) !important;'
  );

  if (!content.includes('/* CHEF CURRENCY PROTECTION */')) {
    content += `\n
/* CHEF CURRENCY PROTECTION */
.info-row .val,
#resumo-taxas,
#total-pagar-text,
#resumo-total-itens,
#resumo-desconto,
#resumo-subtotal {
  white-space: nowrap !important;
  word-break: keep-all !important;
  flex-shrink: 0 !important;
  font-variant-numeric: tabular-nums !important;
}
`;
  }

  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Fixed device-adapters.css:', filePath);
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. CORREÇÃO DE device-adapters.js
// ─────────────────────────────────────────────────────────────────────────────
function fixDeviceAdaptersJs(filePath) {
  if (!fs.existsSync(filePath)) return;
  let content = fs.readFileSync(filePath, 'utf8');

  // Ajusta a detecção do monitor vertical para respeitar 'disabled' como padrão
  const oldDetection = /\/\/ 7\. MONITOR VERTICAL[\s\S]*?body\.classList\.toggle\('chef-vertical-stacked'[\s\S]*?\);/;
  const newDetection = `// 7. MONITOR VERTICAL (DESKTOP / BALCÃO EM MODO RETRATO)
      var vMode = 'disabled';
      try {
        var layoutCfg = window.obterConfigLayoutColaborador && window.obterConfigLayoutColaborador();
        if (layoutCfg && layoutCfg.monitor_vertical_modo) vMode = layoutCfg.monitor_vertical_modo;
        else vMode = localStorage.getItem('chef_monitor_vertical_mode') || 'disabled';
      } catch(e) {}

      var isVerticalMonitor = false;
      if (vMode === 'stacked' || vMode === '2col') {
        isVerticalMonitor = true;
      } else if (vMode === 'auto') {
        // Auto: apenas em telas pequenas (< 640px) com altura >= 680px
        isVerticalMonitor = isPortrait && h >= 680 && w < 640;
      } else {
        isVerticalMonitor = false;
      }

      body.classList.toggle('chef-monitor-vertical', isVerticalMonitor);
      doc.classList.toggle('chef-monitor-vertical', isVerticalMonitor);
      body.classList.toggle('device-monitor-vertical', isVerticalMonitor);
      doc.classList.toggle('device-monitor-vertical', isVerticalMonitor);
      body.classList.toggle('chef-vertical-2col', isVerticalMonitor && vMode === '2col');
      body.classList.toggle('chef-vertical-stacked', isVerticalMonitor && vMode !== '2col');`;

  content = content.replace(oldDetection, newDetection);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Fixed device-adapters.js:', filePath);
}

// ─────────────────────────────────────────────────────────────────────────────
// Executa em todos os caminhos conhecidos
// ─────────────────────────────────────────────────────────────────────────────
['style.css', 'src/css/style.css'].forEach(fixStyleCss);
['device-adapters.css', 'public/device-adapters.css', 'dist/device-adapters.css'].forEach(fixDeviceAdaptersCss);
['device-adapters.js', 'public/device-adapters.js', 'dist/device-adapters.js'].forEach(fixDeviceAdaptersJs);

console.log('Layout fix applied successfully!');
