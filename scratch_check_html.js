const fs = require('fs');
const html = fs.readFileSync('views/super-admin-panel.html', 'utf8');
const lines = html.split('\n');

let openDivs = 0;
let lastSectionLine = 0;
let lastSectionId = '';

for (let i = 0; i < lines.length; i++) {
  const l = lines[i];
  const m = l.match(/<div[^>]*class="[^"]*content-section[^"]*"[^>]*id="([^"]+)"/);
  if (m) {
    lastSectionLine = i + 1;
    lastSectionId = m[1];
    console.log(`Found section ${lastSectionId} at line ${lastSectionLine}. Open divs before this: ${openDivs}`);
  }
  
  openDivs += (l.match(/<div/g) || []).length;
  openDivs -= (l.match(/<\/div/g) || []).length;
}
