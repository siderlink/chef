const fs = require('fs');

function addCacheBust(file) {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(/<script src="\/super-admin\.js.*?"><\/script>/g, '<script src="/super-admin.js?v=202609292212"></script>');
  fs.writeFileSync(file, content);
}

addCacheBust('public/super-admin.html');
addCacheBust('views/super-admin-panel.html');
console.log('Cache busting applied.');
