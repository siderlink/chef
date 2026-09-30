const fs = require('fs');

async function run() {
  // 1. Login
  const loginRes = await fetch('http://127.0.0.1:8080/api/super/login-local', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ senha: '1234' })
  });
  const loginData = await loginRes.json();
  console.log('Login result:', loginData);
  if (!loginData.ok) {
    console.error('Failed to log in!');
    return;
  }
  const token = loginData.token;

  // 2. Test panel template
  const panelRes = await fetch('http://127.0.0.1:8080/api/super/panel-template', {
    headers: { 'x-super-admin-token': token }
  });
  console.log('panel-template response status:', panelRes.status, 'len:', (await panelRes.text()).length);

  // 3. Extract all GET endpoints called in super-admin.js
  const js = fs.readFileSync('super-admin.js', 'utf8');
  const getEndpoints = [...new Set(Array.from(js.matchAll(/apiGet\(['"]([^'"]+)['"]/g)).map(m => m[1]))];
  console.log(`\nTesting ${getEndpoints.length} GET endpoints called by super-admin.js:`);
  
  for (const ep of getEndpoints) {
    // If endpoint has dynamic placeholders like + id, ignore
    if (ep.includes('${') || ep.includes("' +") || ep.includes('" +')) continue;
    try {
      const res = await fetch('http://127.0.0.1:8080' + ep, {
        headers: { 'x-super-admin-token': token }
      });
      const txt = await res.text();
      let parsed = null;
      try { parsed = JSON.parse(txt); } catch(e) {}
      if (res.status === 200 && parsed && parsed.ok !== false) {
        console.log(`  ✅ ${ep.padEnd(45)} -> 200 OK`);
      } else {
        console.log(`  ❌ ${ep.padEnd(45)} -> ${res.status} (ok=${parsed?.ok}, erro=${parsed?.erro || txt.slice(0, 60)})`);
      }
    } catch(err) {
      console.log(`  💥 ${ep.padEnd(45)} -> FETCH ERROR: ${err.message}`);
    }
  }
}

run();
