const bcrypt = require('bcrypt');
const hash = '$2b$10$6TEe5MXrULoQ7NU715MJxeXM3ITd8Ng/D4dFMhPYbsfaYhPOGJ07a';
const passwords = ['admin', 'admin123', '123456', 'chef', 'chef2026', 'password', 'chef123', 'admin@chef.com', 'mestre', 'root'];

async function test() {
  for (const p of passwords) {
    if (await bcrypt.compare(p, hash)) {
      console.log('MATCH FOUND:', p);
      return;
    }
  }
  console.log('No match in basic list.');
}
test();
