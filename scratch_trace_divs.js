const fs = require('fs');
const html = fs.readFileSync('views/super-admin-panel.html', 'utf8');
const lines = html.split('\n');

let openDivs = 0;
let lastSectionLine = 0;
let lastSectionId = '';
let currentSection = '';

for (let i = 0; i < lines.length; i++) {
  const l = lines[i];
  
  const m = l.match(/<div[^>]*class="[^"]*content-section[^"]*"[^>]*id="([^"]+)"/);
  if (m) {
    if (openDivs > 3) {
      console.log(`WARNING: When starting section ${m[1]}, openDivs is ${openDivs}. Last section was ${lastSectionId}.`);
    }
    lastSectionLine = i + 1;
    lastSectionId = m[1];
  }
  
  openDivs += (l.match(/<div/g) || []).length;
  openDivs -= (l.match(/<\/div/g) || []).length;
}

console.log(`Final open divs: ${openDivs}`);
