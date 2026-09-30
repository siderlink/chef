const http = require('http');

function request(options, postData) {
  return new Promise((resolve) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, body });
      });
    });
    req.on('error', (err) => resolve({ statusCode: 0, error: err.message }));
    if (postData) req.write(postData);
    req.end();
  });
}

async function run() {
  const loginRes = await request({
    hostname: 'localhost',
    port: 8080,
    path: '/api/super/login-local',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, JSON.stringify({ senha: 'admin123' }));

  const token = JSON.parse(loginRes.body).token;

  const testList = [
    { url: '/api/super/backup/export-tenant/1', methods: ['GET', 'POST'] },
    { url: '/api/super/image-providers/test/1', methods: ['POST'] },
    { url: '/api/super/notificacoes/marcar-lida/1', methods: ['POST'] },
    { url: '/api/super/restaurante/1', methods: ['GET', 'PUT', 'DELETE'] },
    { url: '/api/super/suporte/1', methods: ['GET', 'PUT', 'DELETE'] },
    { url: '/api/super/tuneis/config/1', methods: ['GET', 'POST'] },
    { url: '/api/super/tuneis/start/1', methods: ['POST'] },
    { url: '/api/super/tuneis/stop/1', methods: ['POST'] },
    { url: '/api/super/usuario/1', methods: ['GET', 'PUT', 'DELETE'] },
    { url: '/api/support/sessions/1', methods: ['GET', 'POST'] },
    { url: '/api/support/sessions', methods: ['GET'] }
  ];

  for (const item of testList) {
    for (const m of item.methods) {
      const res = await request({
        hostname: 'localhost',
        port: 8080,
        path: item.url,
        method: m,
        headers: {
          'Content-Type': 'application/json',
          'x-super-admin-token': token,
          'Authorization': 'Bearer ' + token
        }
      }, m !== 'GET' ? JSON.stringify({}) : null);

      console.log(`[${m}] ${item.url} -> Status: ${res.statusCode}`);
      if (res.statusCode !== 404) {
        console.log('   Response preview:', res.body.slice(0, 100));
      }
    }
  }
}

run();
