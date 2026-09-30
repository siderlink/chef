const fs = require('fs');

const panel = fs.readFileSync('views/super-admin-panel.html', 'utf8');
const js = fs.readFileSync('super-admin.js', 'utf8');

// Match all inline event attributes: onclick, onchange, oninput, onsubmit, onkeyup, etc.
const eventRegex = /\s(on[a-z]+)=["']([^"']+)["']/gi;
let m;
const handlers = new Set();
while ((m = eventRegex.exec(panel)) !== null) {
  handlers.add(m[2].trim());
}

console.log(`Found ${handlers.size} unique event handler attributes in panel.`);

const reserved = new Set(['if', 'for', 'while', 'switch', 'catch', 'alert', 'confirm', 'prompt', 'parseInt', 'parseFloat', 'encodeURIComponent', 'decodeURIComponent']);

// Extract function names (e.g. fn(...) or window.fn(...))
const fnNames = new Set();
handlers.forEach(h => {
  const matches = h.matchAll(/(?:window\.)?([a-zA-Z0-9_$]+)\s*\(/g);
  for (const match of matches) {
    const fn = match[1];
    if (!reserved.has(fn)) {
      fnNames.add(fn);
    }
  }
});

console.log(`Extracted ${fnNames.size} unique function names called from inline events:`);
const missingOnWindow = [];
const missingInJs = [];

fnNames.forEach(fn => {
  const inJs = js.includes(fn);
  const onWin = js.includes('window.' + fn) || js.includes('window["' + fn + '"]') || js.includes("window['" + fn + "']");
  if (!inJs) {
    missingInJs.push(fn);
  } else if (!onWin) {
    missingOnWindow.push(fn);
  }
});

console.log('\n❌ Functions NOT ATTACHED to window (risk of ReferenceError):');
console.log(JSON.stringify(missingOnWindow, null, 2));

console.log('\n⚠️ Functions NOT FOUND in super-admin.js at all:');
console.log(JSON.stringify(missingInJs, null, 2));

