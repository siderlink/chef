const fs = require('fs');
let code = fs.readFileSync('scratch_old_modal.js', 'utf8');

// Replace mapping to sort first
const oldMap = 'let htmlSeccoes = DONO_SECOES_DEF.map((def) => {';
const newMap = `  const sortedSecoes = [...DONO_SECOES_DEF].sort((a, b) => {
    const itemA = cfg.secoes.find(s => s.id === a.id) || { ordem: 99 };
    const itemB = cfg.secoes.find(s => s.id === b.id) || { ordem: 99 };
    return itemA.ordem - itemB.ordem;
  });

  let htmlSeccoes = sortedSecoes.map((def) => {`;
code = code.replace(oldMap, newMap);

// Add SortableJS initialization
const oldInit = "modal.classList.remove('hidden');\n};";
const newInit = `modal.classList.remove('hidden');

  const sortableList = document.getElementById('dono-modal-sortable-list');
  if (sortableList && typeof Sortable !== 'undefined') {
    new Sortable(sortableList, {
      handle: '.drag-handle',
      animation: 150,
      onEnd: function(evt) {
        const currentCfg = window.getDonoModularConfig();
        const items = sortableList.querySelectorAll('.mod-item-card');
        const newSecoes = [];
        
        items.forEach((item, index) => {
          const secId = item.getAttribute('data-sec-id');
          const confSec = currentCfg.secoes.find(s => s.id === secId);
          if (confSec) {
            confSec.ordem = index + 1;
            newSecoes.push(confSec);
          }
        });
        
        currentCfg.secoes.forEach(s => {
          if (!newSecoes.find(ns => ns.id === s.id)) {
            s.ordem = newSecoes.length + 1;
            newSecoes.push(s);
          }
        });
        
        currentCfg.secoes = newSecoes;
        window.salvarDonoModularConfig(currentCfg);
        if (typeof window.aplicarDonoModularConfig === 'function') window.aplicarDonoModularConfig(currentCfg);
      }
    });
  }
};`;
code = code.replace(oldInit, newInit);

// Change container div
const oldDiv = '<div style="display:flex; flex-direction:column; gap:10px; max-height:360px; overflow-y:auto; padding-right:4px;">';
const newDiv = '<div id="dono-modal-sortable-list" style="display:flex; flex-direction:column; gap:10px; max-height:360px; overflow-y:auto; padding-right:4px; padding-left:4px; padding-bottom: 20px;">';
code = code.replace(oldDiv, newDiv);

// Add drag handle
const oldStrong = '<strong style="font-size:15px; color:var(--text); display:flex; align-items:center; gap:8px;">';
const newStrong = '<strong style="font-size:15px; color:var(--text); display:flex; align-items:center; gap:8px;">\n            <span class="drag-handle" style="cursor:grab; padding: 4px; display:inline-flex; opacity:0.5;" title="Arraste para reordenar"><i class="ph-bold ph-dots-six-vertical"></i></span>';
code = code.replace(oldStrong, newStrong);

fs.writeFileSync('scratch_new_modal.js', code);
console.log('Saved to scratch_new_modal.js');

const js = fs.readFileSync('painel-dono.js', 'utf8');
const original = fs.readFileSync('scratch_old_modal.js', 'utf8');
const newJs = js.replace(original, code);
fs.writeFileSync('painel-dono.js', newJs);
console.log('painel-dono.js updated!');
