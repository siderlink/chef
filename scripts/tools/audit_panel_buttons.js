const fs = require('fs');
const panelHtml = fs.readFileSync('views/super-admin-panel.html', 'utf8');
const adminJs = fs.readFileSync('super-admin.js', 'utf8');

const btnRegex = /<button\b([^>]*)>(.*?)<\/button>/gis;
let m;
const idOnly = [];
while ((m = btnRegex.exec(panelHtml)) !== null) {
  const attrs = m[1];
  const innerText = m[2].replace(/<[^>]+>/g, '').trim();
  const idMatch = attrs.match(/id=["']([^"']+)["']/i);
  const onclickMatch = attrs.match(/onclick=["']([^"']+)["']/i);
  if (idMatch && !onclickMatch) {
    idOnly.push({
      id: idMatch[1],
      text: innerText.substring(0, 40)
    });
  }
}

console.log('Total buttons with ID and NO onclick:', idOnly.length);

const unhandled = [];
for (const b of idOnly) {
  const hasRef = adminJs.includes(b.id);
  if (!hasRef) {
    unhandled.push(b);
  }
}

console.log('Buttons with ID that are NEVER referenced in super-admin.js:', unhandled.length);
unhandled.forEach(u => console.log('UNHANDLED BUTTON:', u.id, '-> Text:', u.text));
