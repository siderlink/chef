const fs = require('fs');
const html = fs.readFileSync('views/super-admin-panel.html', 'utf8');
const tags = ['table', 'ul', 'select', 'form'];

for (let tag of tags) {
  const openCount = (html.match(new RegExp(`<${tag}[>\\s]`, 'g')) || []).length;
  const closeCount = (html.match(new RegExp(`</${tag}>`, 'g')) || []).length;
  if (openCount !== closeCount) {
    console.log(`Mismatch for <${tag}>: open=${openCount}, close=${closeCount}`);
  }
}
