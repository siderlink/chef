const fs = require('fs');
let js = fs.readFileSync('super-admin.js', 'utf8');

// Apply the 4 fixes to test
js = js.replace("btn.addEventListener('click', renderMapa);", "btn.addEventListener('click', window.renderMapa);");
js = js.replace("btnSave.addEventListener('click', salvarConfigLoadControl);", "btnSave.addEventListener('click', window.salvarConfigLoadControl);");
js = js.replace("btnSpike.addEventListener('click', salvarSpikeLoadControl);", "btnSpike.addEventListener('click', window.salvarSpikeLoadControl);");
js = js.replace("if (sec && sec.className.indexOf('active') !== -1) renderLoadControl(true);", "if (sec && sec.className && sec.className.indexOf('active') !== -1 && typeof window.renderLoadControl === 'function') window.renderLoadControl(true);");
js = js.replace("io.on('tarefa_nova'", "// io.on('tarefa_nova'");
js = js.replace("io.on('tarefa_atualizada'", "// io.on('tarefa_atualizada'");
js = js.replace("io.on('tarefa_removida'", "// io.on('tarefa_removida'");

// Mock window and document
const mockDoc = {
  getElementById: (id) => ({
    id, style: {}, classList: { add: ()=>{}, remove: ()=>{}, toggle: ()=>{}, contains: ()=>false },
    addEventListener: ()=>{}, removeEventListener: ()=>{}, appendChild: ()=>{},
    querySelector: ()=>null, querySelectorAll: ()=>[], value: '', checked: false,
    innerHTML: '', innerText: '', textContent: '', setAttribute: ()=>{}, getAttribute: ()=>null
  }),
  querySelector: () => ({ style: {}, classList: { add: ()=>{}, remove: ()=>{} }, addEventListener: ()=>{} }),
  querySelectorAll: () => [],
  addEventListener: () => {}, removeEventListener: () => {},
  createElement: () => ({ style: {}, classList: { add: ()=>{}, remove: ()=>{} }, appendChild: ()=>{} }),
  body: { style: {} }
};

const win = {
  location: { pathname: '/super-admin.html', hash: '', href: '' },
  localStorage: { getItem: () => 'token', setItem: () => {}, removeItem: () => {} },
  sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  addEventListener: () => {}, removeEventListener: () => {},
  setTimeout: (fn) => {}, clearTimeout: () => {},
  setInterval: (fn) => {}, clearInterval: () => {},
  document: mockDoc,
  io: function() { return { on: ()=>{}, emit: ()=>{} }; },
  fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({}), text: () => Promise.resolve('') })
};
win.window = win;

const vm = require('vm');
const context = vm.createContext(Object.assign(win, {
  document: mockDoc,
  localStorage: win.localStorage,
  sessionStorage: win.sessionStorage,
  location: win.location,
  io: win.io,
  fetch: win.fetch,
  XMLHttpRequest: function() { this.open = ()=>{}; this.setRequestHeader = ()=>{}; this.send = ()=>{}; }
}));

try {
  vm.runInContext(js, context, { filename: 'super-admin.js' });
  console.log('Script loaded successfully in VM.');
} catch (e) {
  console.error('Error loading script:', e);
  process.exit(1);
}

// Now read list of onclicks from views/super-admin-panel.html
const panelHtml = fs.readFileSync('views/super-admin-panel.html', 'utf8');
const reOnclick = /onclick=["']([^"']+)["']/gi;
let m;
const missingFns = [];
const checkedFns = new Set();

while ((m = reOnclick.exec(panelHtml)) !== null) {
  const raw = m[1].trim();
  const calls = raw.match(/([a-zA-Z0-9_$.]+)\s*\(/g);
  if (calls) {
    for (const c of calls) {
      const expr = c.replace(/\s*\($/, '');
      if (['if', 'document.getElementById', 'inp.type', 'String', 'Number', 'parseInt', 'parseFloat', 'confirm', 'alert', 'prompt'].includes(expr)) continue;
      if (checkedFns.has(expr)) continue;
      checkedFns.add(expr);

      try {
        const val = vm.runInContext(`typeof (${expr})`, context);
        if (val !== 'function') {
          missingFns.push({ expr, type: val, inRaw: raw });
        }
      } catch (err) {
        missingFns.push({ expr, type: 'ERROR: ' + err.message, inRaw: raw });
      }
    }
  }
}

console.log(`Checked ${checkedFns.size} functions called in onclick.`);
console.log(`Missing or non-function count: ${missingFns.length}`);
missingFns.forEach(mf => console.log('MISSING:', mf.expr, '->', mf.type, 'in:', mf.inRaw));
process.exit(0);
