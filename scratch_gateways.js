const fs = require('fs');
const html = fs.readFileSync('views/super-admin-panel.html', 'utf8');
const startIdx = html.indexOf('id="sec-fin-gateways"');
if (startIdx !== -1) {
  console.log(html.substring(startIdx, startIdx + 500));
} else {
  console.log('Not found');
}
