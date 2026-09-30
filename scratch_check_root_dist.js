const fs = require('fs');
const rootHtml = fs.readFileSync('views/super-admin-panel.html', 'utf8');
const distHtml = fs.readFileSync('dist/views/super-admin-panel.html', 'utf8');

console.log('root has sec-suporte-remoto:', rootHtml.includes('id="sec-suporte-remoto"'));
console.log('dist has sec-suporte-remoto:', distHtml.includes('id="sec-suporte-remoto"'));

console.log('root has filtro-heatmap-restaurante:', rootHtml.includes('filtro-heatmap-restaurante'));
console.log('dist has filtro-heatmap-restaurante:', distHtml.includes('filtro-heatmap-restaurante'));

console.log('root has hub-mkt-kpi-clientes:', rootHtml.includes('hub-mkt-kpi-clientes'));
console.log('dist has hub-mkt-kpi-clientes:', distHtml.includes('hub-mkt-kpi-clientes'));
