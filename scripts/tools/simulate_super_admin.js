const fs = require('fs');
let js = fs.readFileSync('super-admin.js', 'utf8');

// Patch line 10317 in test
js = js.replace(/io\.on\(/g, '// io.on(');

// Mock browser environment
const globalWindow = {
  location: { pathname: '/super-admin.html', hash: '', href: '' },
  localStorage: {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {}
  },
  sessionStorage: {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {}
  },
  addEventListener: () => {},
  removeEventListener: () => {},
  setTimeout: (fn) => {}, // don't start timers
  clearTimeout: () => {},
  setInterval: (fn) => {},
  clearInterval: () => {},
  document: {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
    removeEventListener: () => {},
    createElement: () => ({ style: {}, classList: { add: ()=>{}, remove: ()=>{} }, appendChild: ()=>{} }),
    body: { style: {} }
  },
  io: function() { return { on: ()=>{}, emit: ()=>{} }; },
  fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({}), text: () => Promise.resolve('') })
};

const vm = require('vm');
const context = vm.createContext(Object.assign({}, global, globalWindow, {
  window: globalWindow,
  document: globalWindow.document,
  localStorage: globalWindow.localStorage,
  sessionStorage: globalWindow.sessionStorage,
  location: globalWindow.location,
  io: globalWindow.io,
  fetch: globalWindow.fetch,
  XMLHttpRequest: function() {
    this.open = () => {};
    this.setRequestHeader = () => {};
    this.send = () => {};
  }
}));

try {
  vm.runInContext(js, context, { filename: 'super-admin.js' });
  console.log('SUCCESS: super-admin.js executed completely without any other top-level errors!');
} catch (e) {
  console.error('ERROR in super-admin.js:', e);
}
