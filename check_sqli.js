const fs = require('fs');
const js = fs.readFileSync('server.js', 'utf8');
const lines = js.split('\n');
let vulnerabilities = [];

lines.forEach((l, i) => {
  if (l.includes('db.all(') || l.includes('db.run(') || l.includes('db.get(')) {
    if (l.includes('`') && l.includes('${') && !l.includes('?')) {
      vulnerabilities.push(i + 1 + ': ' + l.trim());
    } else if (l.includes(' + req.body.') || l.includes(' + req.query.') || l.includes(' + req.params.')) {
      vulnerabilities.push(i + 1 + ': ' + l.trim());
    }
  }
});

console.log('Potential SQLi found:', vulnerabilities.length > 0 ? vulnerabilities : 'None! The code uses parameterized queries or safe strings.');
