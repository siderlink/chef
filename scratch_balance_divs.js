const fs = require('fs');
const html = fs.readFileSync('views/super-admin-panel.html', 'utf8');
const lines = html.split('\n');

let openDivs = 0;
let sections = [];
let currentSection = null;

for (let i = 0; i < lines.length; i++) {
  const l = lines[i];
  
  const m = l.match(/<div[^>]*class="[^"]*content-section[^"]*"[^>]*id="([^"]+)"/);
  if (m) {
    if (currentSection) {
      sections.push({ id: currentSection, endLine: i, endOpenDivs: openDivs });
    }
    currentSection = m[1];
  }
  
  openDivs += (l.match(/<div/g) || []).length;
  openDivs -= (l.match(/<\/div/g) || []).length;
}

if (currentSection) {
  sections.push({ id: currentSection, endLine: lines.length, endOpenDivs: openDivs });
}

let expected = 2; // base HTML might have 2 open divs for body/wrapper before sections
for (let s of sections) {
  if (s.endOpenDivs !== expected) {
    console.log(`Mismatch at end of ${s.id}: expected ${expected}, got ${s.endOpenDivs}`);
    expected = s.endOpenDivs; // update expected to avoid cascading warnings
  }
}
