const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const htmlFiles = fs.readdirSync(rootDir).filter(f => f.endsWith('.html'));

const missingAssets = [];

htmlFiles.forEach(htmlFile => {
  const html = fs.readFileSync(path.join(rootDir, htmlFile), 'utf8');
  
  // Find all src and href
  const srcRegex = /src=["'](.*?)["']/g;
  const hrefRegex = /href=["'](.*?)["']/g;
  
  let match;
  while ((match = srcRegex.exec(html)) !== null) {
    checkAsset(htmlFile, match[1]);
  }
  
  while ((match = hrefRegex.exec(html)) !== null) {
    checkAsset(htmlFile, match[1]);
  }
});

function checkAsset(htmlFile, url) {
  // Ignore external URLs, hashes, and data URIs
  if (url.startsWith('http') || url.startsWith('//') || url.startsWith('#') || url.startsWith('data:') || url.startsWith('mailto:')) return;
  if (url.includes('socket.io')) return; // handled by server
  
  // Clean query strings ?v=...
  let cleanUrl = url.split('?')[0];
  if (cleanUrl.startsWith('/')) cleanUrl = cleanUrl.substring(1);
  if (!cleanUrl) return;

  // Check in root
  let exists = fs.existsSync(path.join(rootDir, cleanUrl));
  // Check in public
  if (!exists) {
    exists = fs.existsSync(path.join(rootDir, 'public', cleanUrl));
  }
  
  if (!exists) {
    missingAssets.push({ file: htmlFile, asset: url });
  }
}

fs.writeFileSync('diagnostic_missing_assets.json', JSON.stringify(missingAssets, null, 2));
console.log(`Diagnostic complete. Found ${missingAssets.length} missing assets.`);
