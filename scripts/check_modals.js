const fs = require('fs');
const html = fs.readFileSync('views/super-admin-panel.html', 'utf8');
const js = fs.readFileSync('super-admin.js', 'utf8');

const modalRegex = /<div[^>]*class="([^"]*modal[^"]*)"[^>]*id="([^"]+)"/g;
let m;
const list = [];
while ((m = modalRegex.exec(html)) !== null) {
  const cls = m[1];
  const id = m[2];
  
  // Check how it's opened in JS
  const openedWithActive = js.includes(`${id}').classList.add('active')`) || js.includes(`${id}").classList.add('active')`);
  const openedWithFlex = js.includes(`${id}').style.display = 'flex'`) || js.includes(`${id}").style.display = 'flex'`) || js.includes(`${id}').style.display = 'block'`);
  const openedWithClassOverlay = cls.includes('modal-overlay');
  
  list.push({ id, cls, openedWithActive, openedWithFlex, openedWithClassOverlay });
}

console.log('Total modals in HTML:', list.length);
for (const item of list) {
  let status = 'OK';
  if (!item.openedWithClassOverlay && item.openedWithActive && !item.openedWithFlex) {
    status = '🚨 BROKEN! (Has class="modal" not "modal-overlay", but JS only adds .active!)';
  } else if (!item.openedWithActive && !item.openedWithFlex) {
    status = '⚠️ NEVER OPENED IN JS!';
  }
  console.log(`[${item.id}] (class: "${item.cls}")`);
  console.log(`   openedWithActive: ${item.openedWithActive} | openedWithFlex: ${item.openedWithFlex} -> ${status}`);
}
