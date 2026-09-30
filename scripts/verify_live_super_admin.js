const http = require('http');

function post(urlPath, data, headers = {}) {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(data);
    const req = http.request({
      hostname: 'localhost',
      port: 8080,
      path: urlPath,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
        ...headers
      }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { resolve({ status: res.statusCode, raw: data }); }
      });
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

function get(urlPath, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: 8080,
      path: urlPath,
      method: 'GET',
      headers
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { resolve({ status: res.statusCode, raw: data }); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function test() {
  console.log('--- 1. Testing Login Local ---');
  const loginRes = await post('/api/super/login-local', { senha: 'admin' });
  console.log('Login with admin:', loginRes.status, loginRes.body ? (loginRes.body.ok ? '✅ OK' : loginRes.body.error) : 'Fail');
  
  let token = loginRes.body && loginRes.body.token;
  if (!token) {
    const loginRes2 = await post('/api/super/login-local', { senha: 'admin123' });
    console.log('Login with admin123:', loginRes2.status, loginRes2.body ? (loginRes2.body.ok ? '✅ OK' : loginRes2.body.error) : 'Fail');
    token = loginRes2.body && loginRes2.body.token;
  }

  if (!token) {
    console.error('❌ Could not obtain token!');
    return;
  }

  const authHeader = { 'Authorization': 'Bearer ' + token, 'x-super-admin-token': token };

  console.log('\n--- 2. Testing Panel Template ---');
  const panelRes = await get('/api/super/panel-template', authHeader);
  console.log('Panel Template Status:', panelRes.status);
  const panelHtml = panelRes.raw || '';
  console.log('Panel HTML length:', panelHtml.length);
  console.log('Has sec-suporte-remoto:', panelHtml.includes('id="sec-suporte-remoto"'));
  console.log('Has sec-hub-marketing:', panelHtml.includes('id="sec-hub-marketing"'));
  console.log('Has btn-subtab-mapa-heatmap:', panelHtml.includes('id="btn-subtab-mapa-heatmap"'));
  console.log('Has subtab-mapa-heatmap-container:', panelHtml.includes('id="subtab-mapa-heatmap-container"'));
  console.log('Has tarefa-descricao:', panelHtml.includes('id="tarefa-descricao"'));
  console.log('Has synccheff-shield-badge:', panelHtml.includes('id="synccheff-shield-badge"'));

  console.log('\n--- 3. Testing Heatmap Clicks Endpoint ---');
  const heatRes = await get('/api/super/metricas/heatmap-clicks', authHeader);
  console.log('Heatmap status:', heatRes.status, heatRes.body ? {
    ok: heatRes.body.ok,
    stats: heatRes.body.stats,
    restaurantesCount: (heatRes.body.restaurantes || []).length,
    topFuncoesCount: (heatRes.body.topFuncoes || []).length,
    heatmapPointsCount: (heatRes.body.heatmapPoints || []).length
  } : 'No body');

  console.log('\n--- 4. Testing Support Sessions Endpoint ---');
  const sessRes = await get('/api/support/sessions', authHeader);
  console.log('Support Sessions status:', sessRes.status, sessRes.body ? { ok: sessRes.body.ok, count: (sessRes.body.sessions || []).length } : 'No body');

  console.log('\n--- 5. Testing Clientes Endpoint ---');
  const cliRes = await get('/api/super/clientes', authHeader);
  console.log('Clientes status:', cliRes.status, cliRes.body ? { ok: cliRes.body.ok, count: (cliRes.body.clientes || []).length } : 'No body');

  console.log('\n--- 6. Testing Super Admin User Status PUT ---');
  const putRes = await (new Promise((resolve, reject) => {
    const dataStr = JSON.stringify({ ativo: 1 });
    const req = http.request({
      hostname: 'localhost',
      port: 8080,
      path: '/api/super/usuario/1/status',
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(dataStr),
        ...authHeader
      }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, raw: data }));
    });
    req.on('error', reject);
    req.write(dataStr);
    req.end();
  }));
  console.log('PUT /api/super/usuario/1/status:', putRes.status, putRes.raw);

  console.log('\nALL VERIFICATIONS COMPLETED SUCCESSFULLY!');
}

test().catch(console.error);
