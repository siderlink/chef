/**
 * diagnose_sections_v2.js
 * Precisely checks each switchTab handler:
 * 1) Which sections are handled
 * 2) Which loader functions they call
 * 3) Whether those loaders exist
 * 4) Whether sections in HTML are missing from switchTab
 */
const fs = require('fs');
const path = require('path');

const jsFile = path.join(__dirname, '..', 'super-admin.js');
const js = fs.readFileSync(jsFile, 'utf8');
const jsLines = js.split('\n');

// Extract switchTab function
const switchStartIdx = jsLines.findIndex(l => l.includes('function switchTab(targetId)'));
let braceCount = 0, switchEndIdx = switchStartIdx;
for (let i = switchStartIdx; i < jsLines.length; i++) {
  for (const ch of jsLines[i]) {
    if (ch === '{') braceCount++;
    if (ch === '}') braceCount--;
  }
  if (braceCount === 0 && i > switchStartIdx) { switchEndIdx = i; break; }
}

const switchLines = jsLines.slice(switchStartIdx, switchEndIdx + 1);

// Parse each section handler
const handlers = [];
const secPattern = /targetId\s*===\s*'(sec-[^']+)'/;
const fnCallPattern = /\b(carregar\w+|render\w+|popular\w+)\s*\(/g;

for (const line of switchLines) {
  const secMatch = secPattern.exec(line);
  if (!secMatch) continue;
  
  const secId = secMatch[1];
  const fns = [];
  let m;
  const regex = /\b(carregar\w+|render\w+|popular\w+)\s*\(/g;
  while ((m = regex.exec(line)) !== null) {
    fns.push(m[1]);
  }
  
  // Check if function is guarded
  const isGuarded = line.includes('typeof');
  
  handlers.push({ secId, fns, isGuarded, line: line.trim() });
}

console.log('=== Section handlers in switchTab() ===\n');

const handledSections = new Set();
const problems = [];

for (const h of handlers) {
  handledSections.add(h.secId);
  
  for (const fn of h.fns) {
    // Check if function exists in JS
    const patterns = [
      new RegExp(`function\\s+${fn}\\s*\\(`),
      new RegExp(`(?:var|let|const)\\s+${fn}\\s*=`),
    ];
    let found = false;
    let lineNum = -1;
    for (const pat of patterns) {
      const match = pat.exec(js);
      if (match) {
        found = true;
        lineNum = js.substring(0, match.index).split('\n').length;
        break;
      }
    }
    
    // Check if it's on window
    const onWindow = js.includes(`window.${fn} = ${fn}`) || 
                     js.includes(`window.${fn}=${fn}`) ||
                     js.includes(`window.${fn} = function`);
    
    const status = found ? '✅' : '❌';
    const guard = h.isGuarded ? '🛡️ guarded' : '⚠️ unguarded';
    const win = onWindow ? '🌐 on window' : '🔒 NOT on window';
    
    if (!found) {
      problems.push({ secId: h.secId, fn, issue: 'FUNCTION NOT DEFINED' });
      console.log(`  ${status} ${h.secId} → ${fn}() — NOT DEFINED! ${guard}`);
    } else if (!onWindow && h.isGuarded) {
      problems.push({ secId: h.secId, fn, issue: 'Not on window, guard will be false' });
      console.log(`  ⚠️  ${h.secId} → ${fn}() — defined at line ${lineNum} BUT ${win} — ${guard} (guard = false!)`);
    } else {
      console.log(`  ${status} ${h.secId} → ${fn}() — line ${lineNum} — ${win} — ${guard}`);
    }
  }
  
  if (h.fns.length === 0) {
    console.log(`  ℹ️  ${h.secId} — no loader function (static content or inline)`);
  }
}

// Check for sections NOT in switchTab
console.log('\n=== Sections NOT handled in switchTab() ===\n');
const htmlFile = path.join(__dirname, '..', 'views', 'super-admin-panel.html');
const html = fs.readFileSync(htmlFile, 'utf8');

const allSections = new Set();
const secRegex = /id="(sec-[^"]+)"/g;
let sm;
while ((sm = secRegex.exec(html)) !== null) {
  allSections.add(sm[1]);
}

const unhandled = [];
for (const secId of [...allSections].sort()) {
  if (!handledSections.has(secId)) {
    unhandled.push(secId);
    console.log(`  ❌ ${secId} — NO handler in switchTab()`);
  }
}

if (unhandled.length === 0) console.log('  All sections are handled! ✅');

// Check for guarded functions that DON'T exist on window
console.log('\n=== CRITICAL: Guarded loaders NOT on window (will silently skip) ===\n');

const guardedNotOnWindow = [];
for (const h of handlers) {
  if (!h.isGuarded) continue;
  for (const fn of h.fns) {
    // Find function definition
    const defPat = new RegExp(`function\\s+${fn}\\s*\\(`);
    const defMatch = defPat.exec(js);
    if (!defMatch) continue;
    
    // Check window assignment
    const winPat = new RegExp(`window\\.${fn}\\s*=`);
    if (!winPat.test(js)) {
      guardedNotOnWindow.push({ secId: h.secId, fn });
      console.log(`  ❌ ${h.secId} → ${fn}() — defined but NOT on window — typeof window.${fn} === 'undefined' — SECTION WILL BE BLANK!`);
    }
  }
}

if (guardedNotOnWindow.length === 0) console.log('  All guarded functions are on window ✅');

// Summary
console.log('\n=== PROBLEMS SUMMARY ===\n');
if (problems.length + unhandled.length + guardedNotOnWindow.length === 0) {
  console.log('  No problems found! All sections should render correctly.');
} else {
  console.log(`  ${problems.length} loader functions with issues`);
  console.log(`  ${unhandled.length} sections without handlers`);
  console.log(`  ${guardedNotOnWindow.length} guarded functions not on window (silently skip)`);
}
