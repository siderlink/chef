// Integração real com o iFood (Merchant API) — fluxo distribuído (OAuth userCode).
// Requisitos: aplicativo registrado no Programa de Parceiros iFood (clientId/clientSecret)
// e cada restaurante autoriza sua própria conta via portal.ifood.com.br/apps/code.
const sqlite3 = require('./sqlite3-wrapper').verbose();
const fsSync = require('fs');
const path = require('path');

const IFOOD_BASE = 'https://merchant-api.ifood.com.br';
const AUTH = `${IFOOD_BASE}/authentication/v1.0`;
const EVENTS = `${IFOOD_BASE}/events/v1.0`;
const ORDER = `${IFOOD_BASE}/order/v1.0`;
const MERCHANT = `${IFOOD_BASE}/merchant/v1.0`;
const CATALOG = `${IFOOD_BASE}/catalog/v2.0`;

class IfoodApiError extends Error {
  constructor(body, status) {
    const msg = (body && body.error && body.error.message) || (body && body.message) || (body && body.error) || `Erro na API do iFood (HTTP ${status})`;
    super(typeof msg === 'string' ? msg : JSON.stringify(msg));
    this.status = status;
    this.body = body;
  }
}

async function reqJson(url, opts) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
  return { status: res.status, ok: res.ok, data };
}

async function postForm(url, params) {
  const r = await reqJson(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params).toString() });
  if (!r.ok) throw new IfoodApiError(r.data, r.status);
  return r.data;
}

function bearer(token) {
  return { Authorization: `Bearer ${token}`, 'x-api-version': '1.0' };
}

// ---------- Config do aplicativo (credenciais do integrador, master) ----------
function getAppConfig(masterDb) {
  return new Promise((resolve, reject) => {
    masterDb.all(`SELECT chave, valor FROM ifood_app_config`, [], (err, rows) => {
      if (err) return reject(err);
      const cfg = {};
      (rows || []).forEach(r => { cfg[r.chave] = r.valor; });
      resolve(cfg);
    });
  });
}

function setAppConfig(masterDb, cfg) {
  return new Promise((resolve, reject) => {
    const entries = [
      ['client_id', cfg.client_id || ''],
      ['client_secret', cfg.client_secret || '']
    ];
    masterDb.serialize(() => {
      masterDb.run('BEGIN TRANSACTION;');
      entries.forEach(([k, v]) => {
        masterDb.run(`INSERT INTO ifood_app_config (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [k, String(v)]);
      });
      masterDb.run('COMMIT;', () => resolve());
    });
  });
}

// ---------- Conexão por restaurante (tenant) ----------
function ensureConnTable(tdb) {
  return new Promise((resolve) => {
    tdb.run(`CREATE TABLE IF NOT EXISTS ifood_connections (
      restaurante_id INTEGER PRIMARY KEY,
      status TEXT DEFAULT 'disconnected',
      user_code TEXT,
      code_verifier TEXT,
      verification_url TEXT,
      authorization_code TEXT,
      access_token TEXT,
      refresh_token TEXT,
      token_expires_at INTEGER,
      merchant_id TEXT,
      merchant_name TEXT,
      last_poll_at TEXT,
      last_error TEXT,
      updated_at TEXT
    )`, () => resolve());
  });
}

function getConn(tdb, tenantId) {
  return new Promise((resolve, reject) => {
    tdb.get(`SELECT * FROM ifood_connections WHERE restaurante_id = ?`, [tenantId], (err, row) => err ? reject(err) : resolve(row));
  });
}

function upsertConn(tdb, tenantId, fields) {
  const cols = Object.keys(fields);
  const placeholders = cols.map(() => '?').join(', ');
  const vals = cols.map(k => fields[k]);
  const set = cols.map(k => `${k}=excluded.${k}`).join(', ');
  return new Promise((resolve, reject) => {
    tdb.run(`INSERT INTO ifood_connections (restaurante_id, ${cols.join(', ')}) VALUES (?, ${placeholders}) ON CONFLICT(restaurante_id) DO UPDATE SET ${set}`,
      [tenantId, ...vals], (err) => err ? reject(err) : resolve());
  });
}

function getByCanalRef(tdb, ref) {
  return new Promise((resolve, reject) => {
    tdb.get(`SELECT * FROM hub_pedidos WHERE canal_ref = ?`, [String(ref)], (e, r) => e ? reject(e) : resolve(r));
  });
}

// ---------- Fluxo OAuth (distribuído) ----------
async function requestUserCode(tdb, masterDb, tenantId) {
  await ensureConnTable(tdb);
  const cfg = await getAppConfig(masterDb);
  if (!cfg.client_id) throw new IfoodApiError({ error: { message: 'Configure o Client ID do aplicativo iFood antes de conectar.' } }, 400);
  const data = await postForm(`${AUTH}/oauth/userCode`, { clientId: cfg.client_id });
  await upsertConn(tdb, tenantId, {
    status: 'awaiting_code',
    user_code: data.userCode,
    code_verifier: data.authorizationCodeVerifier,
    verification_url: data.verificationUrl,
    authorization_code: null,
    last_error: '',
    updated_at: new Date().toISOString()
  });
  return { userCode: data.userCode, verificationUrl: data.verificationUrl, verificationUrlComplete: data.verificationUrlComplete, expiresIn: data.expiresIn };
}

async function completeAuth(tdb, masterDb, tenantId, authorizationCode) {
  await ensureConnTable(tdb);
  const cfg = await getAppConfig(masterDb);
  const conn = await getConn(tdb, tenantId);
  if (!cfg.client_id || !cfg.client_secret) throw new IfoodApiError({ error: { message: 'Configure Client ID e Client Secret do aplicativo iFood.' } }, 400);
  if (!conn || !conn.code_verifier) throw new IfoodApiError({ error: { message: 'Gere um código de conexão antes de completar a autorização.' } }, 400);
  const data = await postForm(`${AUTH}/oauth/token`, {
    grantType: 'authorization_code',
    clientId: cfg.client_id,
    clientSecret: cfg.client_secret,
    authorizationCode: String(authorizationCode).trim(),
    authorizationCodeVerifier: conn.code_verifier
  });
  const fields = {
    status: 'authorized',
    access_token: data.accessToken,
    refresh_token: data.refreshToken || conn.refresh_token || '',
    token_expires_at: Date.now() + ((data.expiresIn || 21600) * 1000),
    authorization_code: String(authorizationCode).trim(),
    last_error: '',
    updated_at: new Date().toISOString()
  };
  try {
    const r = await reqJson(`${MERCHANT}/merchants`, { headers: bearer(data.accessToken) });
    if (r.ok && Array.isArray(r.data) && r.data.length) {
      fields.merchant_id = r.data[0].id || '';
      fields.merchant_name = r.data[0].name || '';
    }
  } catch (e) { }
  await upsertConn(tdb, tenantId, fields);
  return { merchantId: fields.merchant_id, merchantName: fields.merchant_name, status: 'authorized' };
}

async function disconnect(tdb, tenantId) {
  await ensureConnTable(tdb);
  await upsertConn(tdb, tenantId, {
    status: 'disconnected', user_code: null, code_verifier: null, verification_url: null,
    authorization_code: null, access_token: null, refresh_token: null, token_expires_at: null,
    merchant_id: null, merchant_name: null, last_error: '', updated_at: new Date().toISOString()
  });
  stopPoller(tenantId);
}

async function refreshToken(tdb, masterDb, tenantId, conn) {
  const cfg = await getAppConfig(masterDb);
  if (!cfg.client_id || !cfg.client_secret || !conn.refresh_token) return null;
  try {
    const data = await postForm(`${AUTH}/oauth/token`, {
      grantType: 'refresh_token', clientId: cfg.client_id, clientSecret: cfg.client_secret, refreshToken: conn.refresh_token
    });
    await upsertConn(tdb, tenantId, {
      access_token: data.accessToken,
      refresh_token: data.refreshToken || conn.refresh_token,
      token_expires_at: Date.now() + ((data.expiresIn || 21600) * 1000),
      updated_at: new Date().toISOString()
    });
    return data.accessToken;
  } catch (e) {
    console.error('[iFood] Erro ao renovar token:', e.message || e);
    return null;
  }
}

// ---------- Polling de eventos (On-Demand por Sessão Ativa) ----------
const pollers = new Map();
const activeTenantSessions = new Map(); // tenantId -> count of active sockets

function ensurePoller(tenantId, deps) {
  if (pollers.has(tenantId)) return;
  // Poupando servidor: se a feature ifood estiver desligada para o tenant, não cria o poller
  if (deps && typeof deps.isFeatureEnabled === 'function' && !deps.isFeatureEnabled(tenantId, 'ifood')) return;
  const { io, masterDb, tenantContext, getTenantDb } = deps;
  const tick = async () => {
    try {
      const tdb = tenantContext.run(tenantId, () => getTenantDb());
      await pollOnce(tdb, masterDb, io, tenantId);
    } catch (e) {
      console.error(`[iFood] Poller tenant ${tenantId}:`, e.message || e);
    }
  };
  tick();
  const iv = setInterval(tick, 30000);
  if (iv.unref) iv.unref();
  pollers.set(tenantId, iv);
  console.log(`[iFood On-Demand] Poller INICIADO para o restaurante ID #${tenantId} (Sessão ativa detectada).`);
}

function stopPoller(tenantId) {
  const iv = pollers.get(tenantId);
  if (iv) {
    clearInterval(iv);
    pollers.delete(tenantId);
    console.log(`[iFood On-Demand] Poller PAUSADO para o restaurante ID #${tenantId} (Nenhuma sessão ativa).`);
  }
}

function notifyTenantSessionState(tenantId, activeCount, deps) {
  activeTenantSessions.set(tenantId, activeCount);
  if (activeCount > 0) {
    // Restaurante possui pelo menos 1 dispositivo/sessão conectado: verifica autorização e inicia poller
    const { getTenantDb, tenantContext } = deps || {};
    if (typeof getTenantDb === 'function' && tenantContext) {
      try {
        const tdb = tenantContext.run(tenantId, () => getTenantDb());
        tdb.get(`SELECT status FROM ifood_connections WHERE restaurante_id = ?`, [tenantId], (err, row) => {
          if (!err && row && row.status === 'authorized') {
            ensurePoller(tenantId, deps);
          }
        });
      } catch (e) {}
    }
  } else {
    // Nenhuma sessão ativa para o estabelecimento: encerra/pausa o poller do iFood imediatamente
    stopPoller(tenantId);
  }
}

function emitHub(tdb, io, tenantId) {
  tdb.all(`SELECT * FROM hub_pedidos ORDER BY criado_em DESC`, [], (err, rows) => {
    const list = rows || [];
    io.to(`restaurante_${tenantId}`).emit('hub_pedidos_atualizados', list);
    if (Number(tenantId) === 1) io.emit('hub_pedidos_atualizados', list);
  });
}

async function pollOnce(tdb, masterDb, io, tenantId) {
  await ensureConnTable(tdb);
  const conn = await getConn(tdb, tenantId);
  if (!conn || conn.status !== 'authorized' || !conn.access_token) return;
  let token = conn.access_token;
  if (!conn.token_expires_at || conn.token_expires_at - (5 * 60 * 1000) < Date.now()) {
    token = await refreshToken(tdb, masterDb, tenantId, conn);
    if (!token) return;
  }
  const headers = bearer(token);
  if (conn.merchant_id) headers['x-polling-merchants'] = conn.merchant_id;
  let res;
  try {
    res = await fetch(`${EVENTS}/events:polling`, { headers });
  } catch (e) {
    await upsertConn(tdb, tenantId, { last_error: 'Falha de rede ao consultar o iFood.', updated_at: new Date().toISOString() });
    return;
  }
  if (res.status === 401) {
    await upsertConn(tdb, tenantId, { status: 'error', last_error: 'Token iFood inválido/expirado. Reconecte a conta.', updated_at: new Date().toISOString() });
    return;
  }
  if (res.status === 204) {
    await upsertConn(tdb, tenantId, { last_poll_at: new Date().toISOString(), last_error: '' });
    return;
  }
  if (!res.ok) {
    await upsertConn(tdb, tenantId, { last_error: `Erro iFood HTTP ${res.status}`, updated_at: new Date().toISOString() });
    return;
  }
  const events = await res.json().catch(() => []);
  const ids = (events || []).map(e => e && e.id).filter(Boolean);
  for (const ev of (events || [])) {
    try {
      await handleEvent(tdb, masterDb, token, ev);
    } catch (e) {
      console.error(`[iFood] Evento ${ev && ev.id}:`, e.message || e);
    }
  }
  if (ids.length) {
    try {
      await fetch(`${EVENTS}/events/acknowledgment`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: ids })
      });
    } catch (e) { }
  }
  await upsertConn(tdb, tenantId, { last_poll_at: new Date().toISOString(), last_error: '' });
  emitHub(tdb, io, tenantId);
}

// Mapeamento de eventos iFood → status do Hub
const EV_STATUS = {
  PLC: 'Recebido',
  CFM: 'Em preparo',
  SPS: 'Em preparo',
  RTP: 'Saiu para entrega',
  DSP: 'Saiu para entrega',
  CON: 'Entregue',
  CAN: 'Cancelado',
  CANC: 'Cancelado'
};

async function handleEvent(tdb, masterDb, token, ev) {
  const hubStatus = EV_STATUS[ev && ev.code];
  if (!hubStatus) return;
  const ref = String(ev.orderId || '');
  if (!ref) return;
  const existing = await getByCanalRef(tdb, ref);
  if (existing) {
    if (existing.status !== hubStatus) {
      await new Promise((res, rej) => tdb.run(`UPDATE hub_pedidos SET status=?, atualizado_em=datetime('now','localtime') WHERE id=?`, [hubStatus, existing.id], e => e ? rej(e) : res()));
    }
    if (!existing.ifood_json) {
      const details = await fetchOrderDetails(token, ref).catch(() => null);
      if (details) await applyOrderDetails(tdb, ref, hubStatus, details);
    }
    return;
  }
  const details = await fetchOrderDetails(token, ref).catch(() => null);
  await applyOrderDetails(tdb, ref, hubStatus, details);
}

async function fetchOrderDetails(token, orderId) {
  const r = await reqJson(`${ORDER}/orders/${orderId}`, { headers: bearer(token) });
  if (!r.ok) throw new IfoodApiError(r.data, r.status);
  return r.data;
}

function mapItems(details) {
  if (!details || !Array.isArray(details.items)) return [];
  return details.items.map(it => {
    const extras = (it.options || []).map(o => o.name).filter(Boolean).join(', ');
    const obs = it.observations || '';
    let nome = it.name || '';
    if (extras) nome += ` (${extras})`;
    if (obs) nome += ` [${obs}]`;
    return { nome, qtd: it.quantity || 1, preco: (it.totalPrice != null ? it.totalPrice : it.price) || 0 };
  });
}

function fmtAddress(d) {
  if (!d) return '';
  const parts = [d.formattedAddress || (d.streetName ? `${d.streetName}${d.streetNumber ? ', ' + d.streetNumber : ''}` : '')];
  if (d.neighborhood) parts.push(d.neighborhood);
  if (d.city) parts.push(d.city);
  if (d.state) parts.push(d.state);
  return parts.filter(Boolean).join(' - ');
}

function mapPayment(payments) {
  if (!payments || !Array.isArray(payments.methods) || !payments.methods.length) return '';
  return payments.methods.map(m => {
    let label = String(m.method || '').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
    if (m.type === 'ONLINE') label += ' (pago online)';
    return label;
  }).join(' + ');
}

async function applyOrderDetails(tdb, ref, hubStatus, details) {
  const merchant = (details && details.merchant) || {};
  const customer = (details && details.customer) || {};
  const total = (details && details.total) || {};
  const delivery = (details && details.delivery) || {};
  const da = delivery.deliveryAddress || {};
  const obs = [(details && details.extraInfo) || '', delivery.observations || ''].filter(Boolean).join(' | ');
  const row = {
    canal: 'iFood',
    codigo: (details && details.displayId) ? String(details.displayId) : ref.slice(0, 8),
    cliente: customer.name || 'Cliente iFood',
    telefone: (customer.phone && customer.phone.number) || '',
    endereco: fmtAddress(da),
    referencia: da.reference || '',
    itens: JSON.stringify(mapItems(details)),
    subtotal: total.subTotal || 0,
    taxa: total.deliveryFee || 0,
    total: total.orderAmount || 0,
    pagamento: mapPayment(details && details.payments),
    status: hubStatus,
    obs,
    canal_ref: ref,
    merchant_id: merchant.id || '',
    ifood_json: details ? JSON.stringify(details) : '{}'
  };
  const existing = await getByCanalRef(tdb, ref);
  if (existing) {
    await new Promise((res, rej) => tdb.run(
      `UPDATE hub_pedidos SET canal=?, codigo=?, cliente=?, telefone=?, endereco=?, referencia=?, itens=?, subtotal=?, taxa=?, total=?, pagamento=?, status=?, obs=?, canal_ref=?, merchant_id=?, ifood_json=?, atualizado_em=datetime('now','localtime') WHERE id=?`,
      [row.canal, row.codigo, row.cliente, row.telefone, row.endereco, row.referencia, row.itens, row.subtotal, row.taxa, row.total, row.pagamento, row.status, row.obs, row.canal_ref, row.merchant_id, row.ifood_json, existing.id],
      e => e ? rej(e) : res()));
  } else {
    await new Promise((res, rej) => tdb.run(
      `INSERT INTO hub_pedidos (canal, codigo, cliente, telefone, endereco, referencia, itens, subtotal, taxa, total, pagamento, status, obs, canal_ref, merchant_id, ifood_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [row.canal, row.codigo, row.cliente, row.telefone, row.endereco, row.referencia, row.itens, row.subtotal, row.taxa, row.total, row.pagamento, row.status, row.obs, row.canal_ref, row.merchant_id, row.ifood_json],
      e => e ? rej(e) : res()));
  }
}

// ---------- Envio de status de volta ao iFood ----------
const HUB_TO_IFOOD = {
  'Recebido': 'confirmed',
  'Em preparo': 'startPreparation',
  'Saiu para entrega': 'dispatched',
  'Entregue': 'delivered',
  'Cancelado': 'cancellationRequested'
};

async function syncStatusToIfood(tdb, masterDb, tenantId, order) {
  if (!order || String(order.canal).toLowerCase() !== 'ifood' || !order.canal_ref) return { synced: false };
  const endpoint = HUB_TO_IFOOD[order.status];
  if (!endpoint) return { synced: false };
  await ensureConnTable(tdb);
  const conn = await getConn(tdb, tenantId);
  if (!conn || conn.status !== 'authorized') return { synced: false, error: 'iFood não conectado' };
  let token = conn.access_token;
  if (!conn.token_expires_at || conn.token_expires_at - (5 * 60 * 1000) < Date.now()) {
    token = await refreshToken(tdb, masterDb, tenantId, conn);
  }
  if (!token) return { synced: false, error: 'Token iFood inválido' };
  const r = await reqJson(`${ORDER}/orders/${order.canal_ref}/${endpoint}`, {
    method: 'POST', headers: { ...bearer(token), 'Content-Type': 'application/json' }, body: '{}'
  });
  if (!r.ok) throw new IfoodApiError(r.data, r.status);
  return { synced: true };
}

// ---------- Sincronização de catálogo (Catalog API v2.0) ----------
async function syncCatalog(tdb, masterDb, tenantId) {
  await ensureConnTable(tdb);
  const conn = await getConn(tdb, tenantId);
  if (!conn || conn.status !== 'authorized' || !conn.merchant_id) {
    throw new IfoodApiError({ error: { message: 'Conecte a conta iFood e aguarde a identificação da loja.' } }, 400);
  }
  let token = conn.access_token;
  if (!conn.token_expires_at || conn.token_expires_at - (5 * 60 * 1000) < Date.now()) {
    token = await refreshToken(tdb, masterDb, tenantId, conn);
  }
  if (!token) throw new IfoodApiError({ error: { message: 'Token iFood inválido.' } }, 401);

  const mid = conn.merchant_id;
  const headers = { ...bearer(token), 'Content-Type': 'application/json' };

  // 1. Catálogo (a loja já possui pelo menos um)
  let catalog = null;
  const listRes = await reqJson(`${CATALOG}/merchants/${mid}/catalogs`, { headers });
  if (listRes.ok && Array.isArray(listRes.data) && listRes.data.length) {
    catalog = listRes.data[0];
  }
  if (!catalog || !catalog.id) {
    const createRes = await reqJson(`${CATALOG}/merchants/${mid}/catalogs`, { method: 'POST', headers, body: JSON.stringify({ status: 'AVAILABLE' }) });
    if (!createRes.ok && createRes.status !== 409) throw new IfoodApiError(createRes.data, createRes.status);
    catalog = createRes.data;
  }
  const catalogId = catalog.id;

  // 2. Produtos do PDV (tenant)
  const produtos = await new Promise((resolve, reject) => {
    tdb.all(`SELECT id, categoria, nome, preco, emoji, status FROM produtos ORDER BY categoria, nome`, [], (e, r) => e ? reject(e) : resolve(r || []));
  });
  const grupos = {};
  produtos.forEach(p => {
    const c = String(p.categoria || 'Outros').trim() || 'Outros';
    (grupos[c] = grupos[c] || []).push(p);
  });

  // 3. Categorias existentes
  const catsRes = await reqJson(`${CATALOG}/merchants/${mid}/catalogs/${catalogId}/categories`, { headers });
  let cats = catsRes.ok && Array.isArray(catsRes.data) ? catsRes.data : [];

  const stats = { categorias: 0, itens: 0, atualizados: 0 };

  for (const nome of Object.keys(grupos)) {
    const slug = `chef-cat-${String(nome).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    let cat = cats.find(c => c.externalCode === slug) || cats.find(c => c.name === nome);
    if (!cat || !cat.id) {
      const cr = await reqJson(`${CATALOG}/merchants/${mid}/catalogs/${catalogId}/categories`, {
        method: 'POST', headers, body: JSON.stringify({ externalCode: slug, name: nome, status: 'AVAILABLE' })
      });
      if (!cr.ok && cr.status !== 409) throw new IfoodApiError(cr.data, cr.status);
      cat = (cr.data && (cr.data.id ? cr.data : null)) || null;
      if (!cat) {
        const again = await reqJson(`${CATALOG}/merchants/${mid}/catalogs/${catalogId}/categories`, { headers });
        cats = again.ok && Array.isArray(again.data) ? again.data : cats;
        cat = cats.find(c => c.externalCode === slug) || null;
      }
      if (cat && cat.id) stats.categorias++;
    }
    if (!cat || !cat.id) continue;
    const categoryId = cat.id;

    for (const p of grupos[nome]) {
      const itemId = `chef-item-${p.id}`;
      const payload = {
        item: {
          id: itemId,
          type: 'DEFAULT',
          categoryId,
          externalCode: `chef-${p.id}`,
          status: String(p.status || 'ativo') === 'ativo' ? 'AVAILABLE' : 'UNAVAILABLE',
          price: { value: Number(p.preco) || 0 }
        },
        products: [{
          id: `chef-prod-${p.id}`,
          name: String(p.nome || `Produto ${p.id}`),
          description: p.emoji ? `#${p.emoji}` : ''
        }],
        optionGroups: [],
        options: []
      };
      const ir = await reqJson(`${CATALOG}/merchants/${mid}/items`, { method: 'PUT', headers, body: JSON.stringify(payload) });
      if (ir.ok) stats.itens++;
      else if (ir.status === 409) stats.atualizados++;
      else throw new IfoodApiError(ir.data, ir.status);
    }
  }

  return { ...stats, merchantId: mid, merchantName: conn.merchant_name };
}

// ---------- Estado / iniciadores ----------
function publicConnState(conn) {
  if (!conn) return { status: 'disconnected', merchant_id: null, merchant_name: null, last_poll_at: null, last_error: null, user_code: null, verification_url: null };
  return {
    status: conn.status,
    merchant_id: conn.merchant_id,
    merchant_name: conn.merchant_name,
    last_poll_at: conn.last_poll_at,
    last_error: conn.last_error,
    user_code: conn.user_code,
    verification_url: conn.verification_url,
    has_refresh_token: !!conn.refresh_token
  };
}

function startAllPollers(deps) {
  const dir = deps.dir || __dirname;
  let files = [];
  try { files = fsSync.readdirSync(dir); } catch (e) { return; }
  files.forEach(f => {
    const m = String(f).match(/^database_(\d+)\.sqlite$/);
    if (!m) return;
    const tenantId = Number(m[1]);
    const dbPath = path.join(dir, f);
    if (!fsSync.existsSync(dbPath)) return;
    const probe = new sqlite3.Database(dbPath);
    probe.get(`SELECT status FROM ifood_connections WHERE restaurante_id = ?`, [tenantId], (err, row) => {
      probe.close();
      if (!err && row && row.status === 'authorized') ensurePoller(tenantId, deps);
    });
  });
}

module.exports = {
  IfoodApiError,
  getAppConfig,
  setAppConfig,
  requestUserCode,
  completeAuth,
  disconnect,
  getConn,
  publicConnState,
  syncStatusToIfood,
  syncCatalog,
  ensurePoller,
  stopPoller,
  startAllPollers,
  notifyTenantSessionState,
  pollOnce
};
