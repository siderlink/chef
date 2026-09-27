const fs = require('fs');
const panelHtml = fs.readFileSync('views/super-admin-panel.html', 'utf8');

// Find all onclick attributes
const reOnclick = /onclick=["']([^"']+)["']/gi;
let m;
const onclicks = [];
while ((m = reOnclick.exec(panelHtml)) !== null) {
  onclicks.push({
    raw: m[1],
    index: m.index
  });
}

console.log('Total onclick attributes in views/super-admin-panel.html:', onclicks.length);

// Let's parse each onclick to extract function calls or expressions
const calls = [];
for (const item of onclicks) {
  // e.g. switchTab('sec-dash')
  // or window.ChefTheme && window.ChefTheme.toggle()
  // or if(event.target===this)fecharModal()
  calls.push(item.raw);
}

// Print all unique onclick values
const uniqueCalls = Array.from(new Set(calls)).sort();
console.log('Unique onclick values:', uniqueCalls.length);
uniqueCalls.forEach(c => console.log('  ->', c));
