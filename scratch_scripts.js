const fs = require('fs');
const html = fs.readFileSync('views/super-admin-panel.html', 'utf8');
const scripts = html.match(/<script.*?src=["'](.*?)["']/g);
console.log(scripts);
