const fs = require('fs');
const html = fs.readFileSync('views/super-admin-panel.html', 'utf8');
const sectionMatches = Array.from(html.matchAll(/id="(sec-[^"]+)"/g)).map(m => m[1]);
const sectionRegex = /<div\s+class="content-section[^"]*"\s+id="([^"]+)"([\s\S]*?)(?=(?:<div\s+class="content-section|\s*<\/main>))/g;
const foundSections = [];
let match;
while ((match = sectionRegex.exec(html)) !== null) {
  foundSections.push(match[1]);
}
console.log('In sectionMatches but not foundSections:');
console.log(sectionMatches.filter(s => !foundSections.includes(s)));
