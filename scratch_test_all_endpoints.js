const http = require('http');
const fs = require('fs');

const endpoints = JSON.parse(fs.readFileSync('scratch_endpoints.json', 'utf8'));

// First login
function request(options, postData) {
  return new Promise((resolve) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, body, headers: res.headers });
      });
    });
    req.on('error', (err) => resolve({ statusCode: 0, error: err.message }));
    if (postData) req.write(postData);
    req.end();
  });
}

async function run() {
  console.log('Logging in to get Super Admin token...');
  const loginRes = await request({
    hostname: 'localhost',
    port: 8080,
    path: '/api/super/login-local',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, JSON.stringify({ senha: 'admin123' }));

  const loginData = JSON.parse(loginRes.body);
  const token = loginData.token;
  console.log('Got token:', token ? 'YES' : 'NO');

  const deadEndpoints = [];
  const serverErrors = [];
  const workingEndpoints = [];

  for (const url of endpoints) {
    // try GET first
    const getRes = await request({
      hostname: 'localhost',
      port: 8080,
      path: url,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-super-admin-token': token,
        'Authorization': 'Bearer ' + token
      }
    });

    if (getRes.statusCode === 404) {
      // Maybe it only accepts POST? Try a POST with empty body
      const postRes = await request({
        hostname: 'localhost',
        port: 8080,
        path: url,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-super-admin-token': token,
          'Authorization': 'Bearer ' + token
        }
      }, JSON.stringify({}));

      if (postRes.statusCode === 404) {
        deadEndpoints.push({ url, status: 404 });
      } else if (postRes.statusCode >= 500) {
        serverErrors.push({ url, method: 'POST', status: postRes.statusCode, body: postRes.body.slice(0, 100) });
      } else {
        workingEndpoints.push({ url, method: 'POST', status: postRes.statusCode });
      }
    } else if (getRes.statusCode >= 500) {
      serverErrors.push({ url, method: 'GET', status: getRes.statusCode, body: getRes.body.slice(0, 100) });
    } else {
      workingEndpoints.push({ url, method: 'GET', status: getRes.statusCode });
    }
  }

  console.log('\n=== AUDIT RESULTS ===');
  console.log('Total Tested:', endpoints.length);
  console.log('Working (200-4xx):', workingEndpoints.length);
  console.log('Dead 404 (Missing Routes):', deadEndpoints.length);
  console.log('Server Error 500 (Crashing Routes):', serverErrors.length);

  if (deadEndpoints.length > 0) {
    console.log('\n--- DEAD 404 ROUTES (CAUSING FALSE POSITIVES / BROKEN TABS) ---');
    deadEndpoints.forEach(d => console.log('404:', d.url));
  }

  if (serverErrors.length > 0) {
    console.log('\n--- 500 SERVER ERROR ROUTES ---');
    serverErrors.forEach(s => console.log('500:', s.method, s.url, s.body));
  }
}

run();
