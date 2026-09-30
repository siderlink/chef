const fs = require('fs');

const panelHtml = fs.readFileSync('views/super-admin-panel.html', 'utf8');
const indexHtml = fs.readFileSync('super-admin.html', 'utf8');
const js = fs.readFileSync('super-admin.js', 'utf8');

console.log('=== AUDITING SUPER ADMIN BUTTONS, MODALS, CARDS, SUBTABS ===');

// 1. Modals in views/super-admin-panel.html and super-admin.html
const modalRegex = /<div[^>]*class="[^"]*(?:modal-overlay|modal)[^"]*"[^>]*id="([^"]+)"/g;
const modals = new Set();
let m;
while ((m = modalRegex.exec(panelHtml)) !== null) modals.add(m[1]);
while ((m = modalRegex.exec(indexHtml)) !== null) modals.add(m[1]);

console.log(`\n--- MODALS FOUND (${modals.size}) ---`);
for (const modalId of modals) {
  // Check how this modal is opened in JS or HTML
  const openedInJs = js.includes(modalId);
  const openedInHtml = panelHtml.includes(modalId) || indexHtml.includes(modalId);
  const re = new RegExp(`['"]${modalId}['"]`, 'g');
  const countInJs = (js.match(re) || []).length;
  console.log(`Modal: #${modalId} | Referenced in JS: ${countInJs} times`);
}

// 2. Buttons in views/super-admin-panel.html
console.log('\n--- AUDITING ALL BUTTONS IN PANEL HTML ---');
const btnRegex = /<button([^>]*)>([\s\S]*?)<\/button>/gi;
let btnMatch;
let unhandledButtons = [];
let brokenOnclickButtons = [];

while ((btnMatch = btnRegex.exec(panelHtml)) !== null) {
  const attrs = btnMatch[1];
  const text = btnMatch[2].replace(/<[^>]+>/g, '').trim().slice(0, 30);
  
  // Extract id
  const idMatch = attrs.match(/id="([^"]+)"/i);
  const id = idMatch ? idMatch[1] : null;

  // Extract onclick
  const onclickMatch = attrs.match(/onclick="([^"]+)"/i);
  const onclick = onclickMatch ? onclickMatch[1] : null;

  if (onclick) {
    // Check if the function or statement exists
    // If it's a simple function call like foo() or foo('bar')
    const fnNameMatch = onclick.match(/^\s*([a-zA-Z0-9_$.]+)\s*\(/);
    if (fnNameMatch) {
      const rawFn = fnNameMatch[1];
      const fnName = rawFn.replace(/^(?:window\.)/, '');
      // Check if built-in
      if (!['alert', 'confirm', 'prompt', 'history.back', 'location.reload', 'this.select'].includes(fnName)) {
        const inJs = js.includes(`function ${fnName}`) || js.includes(`window.${fnName}`) || js.includes(`${fnName} =`) || js.includes(`${fnName}:`);
        if (!inJs) {
          brokenOnclickButtons.push({ id, text, onclick, reason: `Function '${fnName}' NOT FOUND in JS!` });
        }
      }
    }
  } else if (id) {
    // Check if bound in JS (e.g. getElementById('id'))
    const boundInJs = js.includes(`'${id}'`) || js.includes(`"${id}"`);
    if (!boundInJs) {
      unhandledButtons.push({ id, text, reason: `No onclick and ID '${id}' never referenced in JS` });
    }
  } else {
    // Neither onclick nor id
    const typeMatch = attrs.match(/type="([^"]+)"/i);
    const type = typeMatch ? typeMatch[1] : 'button';
    if (type !== 'submit') {
      unhandledButtons.push({ id: '(no id)', text, reason: 'No onclick, no id, not submit' });
    }
  }
}

console.log(`Broken onclick buttons (${brokenOnclickButtons.length}):`);
brokenOnclickButtons.forEach(b => console.log(`  ❌ [${b.id || 'no-id'}] "${b.text}": ${b.reason} (onclick: ${b.onclick})`));

console.log(`Unhandled buttons with no onclick or JS listener (${unhandledButtons.length}):`);
unhandledButtons.slice(0, 30).forEach(b => console.log(`  ⚠️ [${b.id}] "${b.text}": ${b.reason}`));
if (unhandledButtons.length > 30) console.log(`  ... and ${unhandledButtons.length - 30} more`);
