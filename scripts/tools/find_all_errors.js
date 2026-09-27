const fs = require('fs');
let js = fs.readFileSync('super-admin.js', 'utf8');

const patches = [];

for (let iter = 0; iter < 100; iter++) {
  let currentJs = js;
  for (const p of patches) {
    currentJs = currentJs.replace(p.from, p.to);
  }

  const vm = require('vm');
  const mockDoc = {
    getElementById: (id) => ({
      id, style: {}, classList: { add: ()=>{}, remove: ()=>{}, toggle: ()=>{}, contains: ()=>false },
      addEventListener: ()=>{}, removeEventListener: ()=>{}, appendChild: ()=>{},
      querySelector: ()=>null, querySelectorAll: ()=>[], value: '', checked: false,
      innerHTML: '', innerText: '', textContent: '', setAttribute: ()=>{}, getAttribute: ()=>null
    }),
    querySelector: () => ({ style: {}, classList: { add: ()=>{}, remove: ()=>{} }, addEventListener: ()=>{} }),
    querySelectorAll: () => [],
    addEventListener: () => {},
    removeEventListener: () => {},
    createElement: () => ({ style: {}, classList: { add: ()=>{}, remove: ()=>{} }, appendChild: ()=>{} }),
    body: { style: {} }
  };

  const context = vm.createContext(Object.assign({}, global, {
    window: {
      location: { pathname: '/super-admin.html', hash: '', href: '' },
      localStorage: { getItem: () => 'token', setItem: () => {}, removeItem: () => {} },
      sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
      addEventListener: () => {}, removeEventListener: () => {},
      setTimeout: (fn) => {}, clearTimeout: () => {},
      setInterval: (fn) => {}, clearInterval: () => {},
      document: mockDoc,
      io: function() { return { on: ()=>{}, emit: ()=>{} }; },
      fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({}), text: () => Promise.resolve('') })
    },
    document: mockDoc,
    localStorage: { getItem: () => 'token', setItem: () => {}, removeItem: () => {} },
    sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    location: { pathname: '/super-admin.html', hash: '', href: '' },
    io: function() { return { on: ()=>{}, emit: ()=>{} }; },
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({}), text: () => Promise.resolve('') }),
    XMLHttpRequest: function() { this.open = ()=>{}; this.setRequestHeader = ()=>{}; this.send = ()=>{}; }
  }));
  context.window.window = context.window;
  context.window.document = mockDoc;

  try {
    vm.runInContext(currentJs, context, { filename: 'super-admin.js' });
    console.log('NO MORE LOAD ERRORS! Total patches needed:', patches.length);
    break;
  } catch (e) {
    const stack = e.stack;
    const match = stack.match(/super-admin\.js:(\d+):(\d+)/);
    if (!match) {
      console.log('Cannot parse location from stack:', stack);
      break;
    }
    const lineNum = parseInt(match[1]);
    const lines = currentJs.split('\n');
    const errLine = lines[lineNum - 1];
    console.log(`[Iter ${iter + 1}] Line ${lineNum}: ${errLine.trim()} -> ${e.message}`);

    const refMatch = e.message.match(/([a-zA-Z0-9_$]+) is not defined/);
    if (refMatch) {
      const varName = refMatch[1];
      patches.push({
        from: errLine,
        to: errLine.replace(new RegExp(`\\b${varName}\\b`, 'g'), `window.${varName}`)
      });
    } else if (e.message.includes('io.on is not a function')) {
      patches.push({
        from: errLine,
        to: '// ' + errLine
      });
    } else {
      console.log('Unrecognized error type:', e.message);
      break;
    }
  }
}

console.log('\nAll patches:');
patches.forEach((p, i) => console.log(`${i+1}: "${p.from.trim()}" -> "${p.to.trim()}"`));
