const fs = require('fs');
const js = fs.readFileSync('super-admin.js', 'utf8');
const backend = fs.readFileSync('controllers/super-admin.js', 'utf8');
const fetches = [...js.matchAll(/fetch\(['"](\/api\/super\/[^'"]+)['"]/g)].map(m => m[1]);
const uniqueFetches = [...new Set(fetches)].map(u => u.split('?')[0]);

const missing = [];
for (let f of uniqueFetches) {
  let routePath = f.replace('/api/super', '');
  if (routePath === '') routePath = '/';
  
  // Try to find it in the backend string
  if (!backend.includes("'" + routePath + "'") && !backend.includes('"' + routePath + '"') && !backend.includes('\`' + routePath + '\`') && !backend.includes("'" + routePath + "/'") && !backend.includes("'" + routePath + "/:id'")) {
    missing.push(f + ' (looking for ' + routePath + ')');
  }
}

console.log('Fetches found:', uniqueFetches.length);
console.log('Missing backend routes:');
console.log(missing);
