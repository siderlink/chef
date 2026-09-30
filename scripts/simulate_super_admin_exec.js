const fs = require('fs');

// Create mock browser environment
global.window = global;
global.document = {
  readyState: 'loading',
  getElementById: (id) => ({
    id,
    style: {},
    classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false },
    addEventListener: () => {},
    value: '',
    textContent: '',
    innerHTML: '',
    appendChild: () => {},
    querySelector: () => null,
    querySelectorAll: () => []
  }),
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: (ev, cb) => {
    if (ev === 'DOMContentLoaded') {
      global._domLoadedCbs = global._domLoadedCbs || [];
      global._domLoadedCbs.push(cb);
    }
  },
  removeEventListener: () => {},
  createElement: (tag) => ({
    tagName: tag.toUpperCase(),
    style: {},
    classList: { add: () => {}, remove: () => {} },
    appendChild: () => {},
    addEventListener: () => {},
    innerHTML: '',
    value: ''
  }),
  body: { style: {} }
};
global.navigator = { userAgent: 'Node', vibrate: () => {} };
global.location = { origin: 'http://localhost:8080', hash: '', pathname: '/super-admin.html' };
global.localStorage = {
  getItem: (k) => null,
  setItem: (k, v) => {},
  removeItem: (k) => {}
};
global.sessionStorage = {
  getItem: (k) => null,
  setItem: (k, v) => {},
  removeItem: (k) => {}
};
global.history = { replaceState: () => {} };
global.XMLHttpRequest = function() {
  return {
    open: () => {},
    setRequestHeader: () => {},
    send: () => {},
    onreadystatechange: () => {}
  };
};
global.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({}), text: () => Promise.resolve('') });

console.log('Loading super-admin.js in simulated browser runtime...');
try {
  require('../super-admin.js');
  console.log('✅ super-admin.js loaded successfully without top-level errors!');
} catch (e) {
  console.error('💥 TOP-LEVEL ERROR IN super-admin.js:', e);
}

// Now trigger DOMContentLoaded listeners
if (global._domLoadedCbs) {
  console.log(`Triggering ${global._domLoadedCbs.length} DOMContentLoaded callbacks...`);
  global._domLoadedCbs.forEach((cb, idx) => {
    try {
      cb();
      console.log(`  Callback ${idx + 1} succeeded.`);
    } catch (e) {
      console.error(`  💥 DOMContentLoaded callback ${idx + 1} THREW:`, e);
    }
  });
}
