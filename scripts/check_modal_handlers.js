const fs = require('fs');

const panel = fs.readFileSync('views/super-admin-panel.html', 'utf8');
const js = fs.readFileSync('super-admin.js', 'utf8');

// Find all elements with class containing modal
const tagRegex = /<([a-z0-9]+)\s+([^>]*?(?:class=["'][^"']*modal[^"']*["']|id=["']modal-[^"']*["'])[^>]*)>/gi;
let match;
const found = [];
while ((match = tagRegex.exec(panel)) !== null) {
  const attrs = match[2];
  const idM = attrs.match(/id=["']([^"']+)["']/);
  const classM = attrs.match(/class=["']([^"']+)["']/);
  const id = idM ? idM[1] : null;
  const cls = classM ? classM[1] : '';
  if (id && (id.startsWith('modal-') || cls.includes('modal'))) {
    found.push({ tag: match[1], id, class: cls });
  }
}

console.log(`Found ${found.length} modal elements in panel:`);
found.forEach(m => {
  const styleMatches = [...js.matchAll(new RegExp(`getElementById\\(['"]${m.id}['"]\\)\\.style\\.display\\s*=\\s*['"]([^'"]+)['"]`, 'g'))].map(x => x[1]);
  const activeMatches = [...js.matchAll(new RegExp(`getElementById\\(['"]${m.id}['"]\\)\\.classList\\.(add|remove)\\(['"]active['"]\\)`, 'g'))].map(x => x[1]);
  console.log(`- ${m.id} (class: "${m.class}") => display: [${styleMatches.join(', ')}], active: [${activeMatches.join(', ')}]`);
});
