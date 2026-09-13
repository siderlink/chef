const fs = require('fs');
const path = require('path');

function walk(dir) {
  fs.readdirSync(dir, {withFileTypes: true}).forEach(ent => {
    if (ent.name === 'node_modules' || ent.name === 'dist' || ent.name === 'sqlite3-wrapper.js' || ent.name === 'replace.js') return;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      walk(full);
    } else if (ent.isFile() && ent.name.endsWith('.js')) {
      let content = fs.readFileSync(full, 'utf8');
      if (content.includes("require('sqlite3')")) {
        fs.writeFileSync(full, content.replace(/require\('sqlite3'\)/g, "require('./sqlite3-wrapper')"));
        console.log('Updated ' + full);
      }
    }
  });
}
walk('.');
