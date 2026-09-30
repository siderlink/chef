const fs = require('fs');

const html = fs.readFileSync('views/super-admin-panel.html', 'utf8') + '\n' + fs.readFileSync('super-admin.html', 'utf8');
const js = fs.readFileSync('super-admin.js', 'utf8');

// Find all patterns: var/let/const varName = document.getElementById('someId');
const varRegex = /(?:var|let|const)\s+([a-zA-Z0-9_$]+)\s*=\s*document\.getElementById\(['"]([^'"]+)['"]\);/g;
let m;
const missingAssignments = [];
while ((m = varRegex.exec(js)) !== null) {
  const varName = m[1];
  const id = m[2];
  const existsInHtml = html.includes(`id="${id}"`) || html.includes(`id='${id}'`);
  if (!existsInHtml) {
    // Check if within the next 300 chars varName is used without checking if (varName)
    const afterCode = js.substring(m.index + m[0].length, m.index + m[0].length + 400);
    const hasIf = new RegExp(`if\\s*\\(\\s*!?${varName}\\b`).test(afterCode);
    const line = js.substring(0, m.index).split('\n').length;
    missingAssignments.push({ varName, id, line, hasIf, afterSnippet: afterCode.trim().split('\n')[0] });
  }
}

console.log(`Assignments to missing IDs (${missingAssignments.length}):`);
for (const item of missingAssignments) {
  console.log(`  Line ${item.line}: var ${item.varName} = document.getElementById('${item.id}'); [has if check: ${item.hasIf}]`);
  if (!item.hasIf) {
    console.log(`    ⚠️ NEXT LINE: ${item.afterSnippet}`);
  }
}
