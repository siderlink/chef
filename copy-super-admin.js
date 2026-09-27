const fs = require('fs');

for (const f of ['super-admin.html', 'super-admin.js', 'hub-marketing.html']) {
  if (fs.existsSync(f)) {
    fs.copyFileSync(f, 'dist/' + f);
  }
}
