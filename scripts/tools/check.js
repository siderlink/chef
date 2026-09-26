const fs = require('fs');
const content = fs.readFileSync('caixa-classico.html', 'utf8');
console.log('socket.io:', content.indexOf('socket.io.js'));
console.log('main.js:', content.indexOf('main.js'));
