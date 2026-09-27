const fs = require('fs');
const panelHtml = fs.readFileSync('views/super-admin-panel.html', 'utf8');
const adminJs = fs.readFileSync('super-admin.js', 'utf8');

const lines = adminJs.split('\n');
const iifeStarts = [8585, 9433, 9732, 10110, 10330, 10461];

iifeStarts.forEach(startLine => {
  console.log(`\n=== Checking IIFE starting at line ${startLine} ===`);
  // Find where this IIFE ends
  let depth = 0;
  const fnsInIIFE = [];
  for (let i = startLine - 1; i < lines.length; i++) {
    const line = lines[i];
    const fnMatch = line.match(/(?:async\s+)?function\s+([a-zA-Z0-9_$]+)\s*\(/);
    if (fnMatch) {
      fnsInIIFE.push({ name: fnMatch[1], line: i + 1, isExplicitWindow: line.includes('window.') });
    }
    const varMatch = line.match(/(?:var|let|const)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s+)?function/);
    if (varMatch) {
      fnsInIIFE.push({ name: varMatch[1], line: i + 1, isExplicitWindow: line.includes('window.') });
    }

    for (const ch of line) {
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
    }
    if (depth <= 0 && i > startLine - 1) {
      console.log(`IIFE ended at line ${i + 1}`);
      break;
    }
  }

  fnsInIIFE.forEach(f => {
    // Check if referenced in views/super-admin-panel.html
    const re = new RegExp(`\\b${f.name}\\s*\\(`, 'g');
    const inPanel = panelHtml.match(re);
    const winAssigned = adminJs.includes(`window.${f.name} =`);
    if (inPanel) {
      console.log(`  Function ${f.name} (line ${f.line}): in panel: ${inPanel.length} times, windowAssigned: ${winAssigned}`);
    }
  });
});
