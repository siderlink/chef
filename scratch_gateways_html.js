const fs = require('fs');
const html = fs.readFileSync('views/super-admin-panel.html', 'utf8');
const startIdx = html.indexOf('id="sec-fin-gateways"');
const endIdx = html.indexOf('id="sec-servidor"');
console.log(html.substring(startIdx, endIdx));
