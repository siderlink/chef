const fs = require('fs');
const html = fs.readFileSync('views/super-admin-panel.html', 'utf8');

const regex = /<div\s+class="content-section[^"]*"\s+id="([^"]+)"([\s\S]*?)(?=(?:<div\s+class="content-section|\s*<\/main>|\s*<\/div>\s*<\/div>\s*<!--\s*Modais))/g;
let m;
while ((m = regex.exec(html)) !== null) {
  const id = m[1];
  const inner = m[2];
  const hasH = (inner.match(/<h[1-6][^>]*>/g) || []).length;
  const hasCard = (inner.match(/class="[^"]*card[^"]*"/g) || []).length;
  const hasTable = (inner.match(/<table/g) || []).length;
  const hasBtn = (inner.match(/<button/g) || []).length;
  const hasInput = (inner.match(/<input|<select/g) || []).length;
  console.log(id.padEnd(25) + ' | len: ' + String(inner.length).padStart(6) + ' | h: ' + hasH + ' | card: ' + hasCard + ' | table: ' + hasTable + ' | btn: ' + hasBtn + ' | in: ' + hasInput);
}
