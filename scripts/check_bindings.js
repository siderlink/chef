const fs = require('fs');
const js = fs.readFileSync('super-admin.js', 'utf8');

const fnRegex = /function\s+([a-zA-Z0-9_$]+)\s*\(/g;
let m;
const declaredFns = new Set();
while ((m = fnRegex.exec(js)) !== null) {
  declaredFns.add(m[1]);
}

console.log('Total declared functions in super-admin.js:', declaredFns.size);

const unattached = [];
const attached = [];
declaredFns.forEach(fn => {
  const isAttached = js.includes('window.' + fn + ' =') || 
                     js.includes('window["' + fn + '"] =') || 
                     js.includes("window['" + fn + "'] =");
  if (isAttached) attached.push(fn);
  else unattached.push(fn);
});

console.log('Explicitly attached to window:', attached.length);
console.log('Not explicitly attached to window:', unattached.length);
console.log('Sample unattached functions:', JSON.stringify(unattached.slice(0, 40), null, 2));
