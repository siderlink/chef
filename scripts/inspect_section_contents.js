const fs = require('fs');

const html = fs.readFileSync('views/super-admin-panel.html', 'utf8');

const regex = /<div\s+class="content-section[^"]*"\s+id="([^"]+)"([\s\S]*?)(?=(?:<div\s+class="content-section|\s*<\/main>|\s*<\/div>\s*<\/div>\s*<!--\s*Modais))/g;
let m;
while ((m = regex.exec(html)) !== null) {
  const id = m[1];
  const inner = m[2].trim();
  
  // Check if first child has display:none or if main container is hidden
  const first100 = inner.replace(/\s+/g, ' ').slice(0, 140);
  const hiddenContainers = Array.from(inner.matchAll(/style="[^"]*display:\s*none[^"]*"/gi)).length;
  const tables = Array.from(inner.matchAll(/<table/gi)).length;
  const tbodies = Array.from(inner.matchAll(/<tbody\s+id="([^"]+)"/gi)).map(x => x[1]);
  const grids = Array.from(inner.matchAll(/class="[^"]*(?:stats-grid|grid)[^"]*"/gi)).length;
  const cards = Array.from(inner.matchAll(/class="[^"]*(?:card|stat-card)[^"]*"/gi)).length;
  
  console.log(`\nSection: [${id}] (length: ${inner.length})`);
  console.log(`  Cards: ${cards} | Grids: ${grids} | Tables: ${tables} (tbodies: ${tbodies.join(', ') || 'none'}) | display:none count: ${hiddenContainers}`);
  console.log(`  Preview: ${first100}`);
}
