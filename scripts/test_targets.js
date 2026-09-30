const fs = require('fs');
const html = fs.readFileSync('views/super-admin-panel.html', 'utf8');
const js = fs.readFileSync('super-admin.js', 'utf8');

const regex = /data-target=["']([^"']+)["']/g;
let m;
const targets = new Set();
while ((m = regex.exec(html)) !== null) {
  targets.add(m[1]);
}

console.log('Total sidebar/mob-nav targets found:', targets.size);
for (const t of targets) {
  const sectionExists = html.includes(`id="${t}"`) || html.includes(`id='${t}'`);
  const handledInSwitch = js.includes(`'${t}'`);
  console.log(`Target: ${t.padEnd(26)} -> Section in HTML: ${sectionExists} | Handled in switchTab: ${handledInSwitch}`);
}
