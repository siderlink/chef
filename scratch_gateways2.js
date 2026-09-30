const fs = require('fs');
const html = fs.readFileSync('views/super-admin-panel.html', 'utf8');
const startIdx = html.indexOf('id="sec-fin-gateways"');
console.log(html.substring(startIdx, startIdx + 3000));
