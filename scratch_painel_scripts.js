const fs = require('fs');
const html = fs.readFileSync('painel-dono.html', 'utf8');
const scripts = html.match(/<script.*?src=["'](.*?)["']/g);
console.log(scripts);
