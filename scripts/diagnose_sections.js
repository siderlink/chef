/**
 * diagnose_sections.js
 * Scans super-admin.js to find ALL loader functions invoked by switchTab(),
 * then checks if each function is actually defined in the file.
 */
const fs = require('fs');
const path = require('path');

const jsFile = path.join(__dirname, '..', 'super-admin.js');
const js = fs.readFileSync(jsFile, 'utf8');

// Extract the switchTab function body
const switchStart = js.indexOf('function switchTab(targetId)');
const switchEnd = js.indexOf('\n}\n', switchStart);
const switchBody = js.substring(switchStart, switchEnd + 3);

// Find all function calls in switchTab
const callRegex = /(?:window\.)?(\w+)\s*\(/g;
let m;
const calledFunctions = new Set();
const skipWords = new Set([
  'switchTab', 'function', 'if', 'else', 'for', 'var', 'typeof', 'toggle',
  'querySelector', 'querySelectorAll', 'getElementById', 'getAttribute',
  'forEach', 'classList', 'contains', 'remove', 'add', 'closest',
  'setItem', 'replaceState', 'includes', 'encodeURIComponent', 'textContent',
  'focus', 'localStorage', 'history', 'document', 'window', 'getSuperAdminToken',
  'resetInactivityTimer', 'console'
]);

while ((m = callRegex.exec(switchBody)) !== null) {
  const fn = m[1];
  if (!skipWords.has(fn) && fn.length > 2) {
    calledFunctions.add(fn);
  }
}

console.log('=== Functions called by switchTab() ===\n');

const results = { defined: [], missing: [] };

for (const fn of [...calledFunctions].sort()) {
  // Check if function is defined in the file
  const defPatterns = [
    new RegExp(`function\\s+${fn}\\s*\\(`),
    new RegExp(`(?:var|let|const)\\s+${fn}\\s*=\\s*function`),
    new RegExp(`window\\.${fn}\\s*=\\s*function`),
    new RegExp(`window\\.${fn}\\s*=\\s*${fn}`),  // assigned from local
  ];
  
  let defined = false;
  let lineNum = -1;
  for (const pat of defPatterns) {
    const match = pat.exec(js);
    if (match) {
      defined = true;
      // Find line number
      lineNum = js.substring(0, match.index).split('\n').length;
      break;
    }
  }
  
  // Also check if it's guarded with typeof check in switchTab
  const guardedPattern = new RegExp(`typeof\\s+(?:window\\.)?${fn}\\s*===\\s*'function'`);
  const isGuarded = guardedPattern.test(switchBody);
  
  if (defined) {
    results.defined.push({ fn, lineNum, isGuarded });
  } else {
    results.missing.push({ fn, isGuarded });
  }
}

console.log('DEFINED functions:');
for (const item of results.defined) {
  const guard = item.isGuarded ? ' (guarded with typeof)' : ' ⚠️  NO GUARD - will throw ReferenceError if missing';
  console.log(`  ✅ ${item.fn} (line ${item.lineNum})${guard}`);
}

console.log('\nMISSING/UNDEFINED functions:');
if (results.missing.length === 0) {
  console.log('  None');
} else {
  for (const item of results.missing) {
    const guard = item.isGuarded ? ' (guarded - safe)' : ' ❌ NOT GUARDED - WILL CRASH!';
    console.log(`  ❌ ${item.fn}${guard}`);
  }
}

// Now check which sections DON'T have any loader at all in switchTab
console.log('\n=== Sections with NO loader in switchTab() ===\n');
const htmlFile = path.join(__dirname, '..', 'views', 'super-admin-panel.html');
const html = fs.readFileSync(htmlFile, 'utf8');

const secRegex = /class="content-section[^"]*"\s+id="(sec-[^"]+)"/g;
const allSections = [];
while ((m = secRegex.exec(html)) !== null) {
  allSections.push(m[1]);
}

// Also try reverse order: id before class
const secRegex2 = /id="(sec-[^"]+)"[^>]*class="[^"]*content-section/g;
while ((m = secRegex2.exec(html)) !== null) {
  if (!allSections.includes(m[1])) allSections.push(m[1]);
}

for (const secId of allSections.sort()) {
  const inSwitch = switchBody.includes(`'${secId}'`);
  if (!inSwitch) {
    console.log(`  ⚠️  ${secId} - NOT handled in switchTab()`);
  }
}

// Check which loader functions are called WITHOUT typeof guard
// and aren't directly defined in the top-level scope (could fail)
console.log('\n=== Unguarded loader calls in switchTab (risky) ===\n');
const lines = switchBody.split('\n');
for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line.startsWith('else if') && !line.startsWith('if (targetId')) continue;
  
  // Find function calls on this line that are NOT guarded
  const directCalls = line.match(/\b(?!typeof|if|else|var|for|window)\b(\w+)\s*\(/g);
  if (!directCalls) continue;
  
  for (const call of directCalls) {
    const fnName = call.replace(/\s*\($/, '');
    if (skipWords.has(fnName)) continue;
    
    // Check if this specific call is guarded on the same line
    const guardCheck = `typeof ${fnName}` ;
    const guardCheck2 = `typeof window.${fnName}`;
    if (line.includes(guardCheck) || line.includes(guardCheck2)) continue;
    
    // Check if function is defined
    const isDefined = results.defined.find(d => d.fn === fnName);
    if (!isDefined) {
      console.log(`  ❌ Line: ${line.substring(0, 100)}`);
      console.log(`     Function "${fnName}" called without guard and NOT FOUND in file!`);
      console.log('');
    }
  }
}

console.log('\n=== Summary ===');
console.log(`Total sections in HTML: ${allSections.length}`);
console.log(`Total functions called by switchTab: ${calledFunctions.size}`);
console.log(`Defined: ${results.defined.length}`);
console.log(`Missing: ${results.missing.length}`);
