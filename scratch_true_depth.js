const fs = require('fs');
const html = fs.readFileSync('views/super-admin-panel.html', 'utf8');

// A very simple DOM structure checker without comments
const cleaned = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<script[\s\S]*?<\/script>/g, '');

const lines = cleaned.split('\n');
let open = 0;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const divsOpen = (line.match(/<div[^>]*>/g) || []).length;
  const divsClose = (line.match(/<\/div>/g) || []).length;
  
  open += divsOpen;
  open -= divsClose;
  
  if (line.includes('sec-fin-gateways')) {
    console.log('sec-fin-gateways depth:', open);
  }
}
