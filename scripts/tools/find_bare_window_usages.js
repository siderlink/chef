const fs = require('fs');
const js = fs.readFileSync('super-admin.js', 'utf8');

const lines = js.split('\n');

// 1. Collect all window.foo = function
const windowFns = new Set();
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(/window\.([a-zA-Z0-9_$]+)\s*=\s*(?:async\s+)?function/);
  if (m) windowFns.add(m[1]);
}
console.log('Total window.foo functions found:', windowFns.size);

// 2. Collect all declared var/let/const/function foo
const declaredFns = new Set();
for (let i = 0; i < lines.length; i++) {
  const m1 = lines[i].match(/(?:var|let|const)\s+([a-zA-Z0-9_$]+)/g);
  if (m1) {
    m1.forEach(decl => {
      const name = decl.replace(/(?:var|let|const)\s+/, '');
      declaredFns.add(name);
    });
  }
  const m2 = lines[i].match(/(?:async\s+)?function\s+([a-zA-Z0-9_$]+)\s*\(/);
  if (m2) declaredFns.add(m2[1]);
}

// 3. Find windowFns that are NOT declared as top-level / local var or function
const onlyOnWindow = new Set();
for (const fn of windowFns) {
  if (!declaredFns.has(fn)) {
    onlyOnWindow.add(fn);
  }
}
console.log('Functions defined ONLY on window (not declared with var/function):', onlyOnWindow.size);

// 4. Now find lines where bare `foo(` or `addEventListener('...', foo)` is called without `window.`
const bareUsages = [];
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  // skip the definition line
  if (line.includes('window.')) continue;
  if (line.trim().startsWith('//') || line.trim().startsWith('/*') || line.trim().startsWith('*')) continue;

  for (const fn of onlyOnWindow) {
    // Check if line contains bare fn
    const reCall = new RegExp(`(?<![a-zA-Z0-9_$.])${fn}\\s*\\(`, 'g');
    const reRef = new RegExp(`(?<![a-zA-Z0-9_$.])${fn}(?![a-zA-Z0-9_$])`, 'g');

    if (reCall.test(line) || (line.includes('addEventListener') && reRef.test(line))) {
      bareUsages.push({
        line: i + 1,
        fn,
        code: line.trim()
      });
    }
  }
}

console.log('Found bare usages of window-only functions:', bareUsages.length);
bareUsages.forEach(b => console.log(`Line ${b.line} [${b.fn}]: ${b.code}`));
