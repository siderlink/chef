const fs = require('fs');
const js = fs.readFileSync('super-admin.js', 'utf8');

const regexes = [
  /apiGet\(\s*[`'"]([^`'"]+)[`'"]/g,
  /apiPost\(\s*[`'"]([^`'"]+)[`'"]/g,
  /apiPut\(\s*[`'"]([^`'"]+)[`'"]/g,
  /apiDelete\(\s*[`'"]([^`'"]+)[`'"]/g,
  /fetch\(\s*[`'"]([^`'"]+)[`'"]/g
];

const urls = new Set();

regexes.forEach(r => {
  let m;
  while ((m = r.exec(js)) !== null) {
    let u = m[1].split('?')[0];
    u = u.replace(/\${[^}]+}/g, '1');
    if (u.startsWith('/')) {
      urls.add(u);
    }
  }
});

console.log('Total unique API endpoints in super-admin.js:', urls.size);

// Save to JSON for analysis
fs.writeFileSync('scratch_endpoints.json', JSON.stringify(Array.from(urls).sort(), null, 2));
console.log('Saved to scratch_endpoints.json');
