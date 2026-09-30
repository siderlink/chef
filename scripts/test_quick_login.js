const http = require('http');

console.log('Sending request to http://127.0.0.1:8080/api/super/login-local...');

const postData = JSON.stringify({ senha: 'admin123' });

const req = http.request({
  hostname: '127.0.0.1',
  port: 8080,
  path: '/api/super/login-local',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  },
  timeout: 3000
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Body:', data);
    process.exit(0);
  });
});

req.on('timeout', () => {
  console.log('REQUEST TIMED OUT AFTER 3000ms');
  req.destroy();
  process.exit(1);
});

req.on('error', (e) => {
  console.log('REQUEST ERROR:', e.message);
  process.exit(1);
});

req.write(postData);
req.end();
