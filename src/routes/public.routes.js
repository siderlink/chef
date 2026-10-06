const express = require('express');
const path = require('path');
const router = express.Router();

module.exports = function (appContext) {
  const { readGlobalConfig, getIo, BASE_DIR, buildSitemapXml, buildRobotsTxt, buildLlmTxt, deploymentConfig } = appContext;

  router.get('/api/public/site-config', (req, res) => {
    readGlobalConfig(cfg => {
      const out = { ok: true, configs: {} };
      Object.keys(cfg).forEach(k => { if (k.indexOf('site_') === 0) out.configs[k] = cfg[k]; });
      res.json(out);
    });
  });

  router.get('/api/public/tracking-config', (req, res) => {
    readGlobalConfig(cfg => {
      res.json({
        ok: true,
        config: {
          gtag_global: cfg.site_gtag_global || cfg.gtag_global || '',
          pixel_global: cfg.site_pixel_global || cfg.pixel_global || ''
        }
      });
    });
  });

  router.get(['/api/public/features', '/api/public/site-vendas/addons', '/api/public/site-vendas/features'], (req, res) => {
    try {
      const featurePlans = require('../../feature-plans');
      res.json({
        ok: true,
        features: featurePlans.FEATURES || [],
        planos: featurePlans.FEATURE_PLANS || {},
        limites: featurePlans.PLAN_LIMITS || {}
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  router.post('/api/public/geo-hit', express.json({ limit: '1mb' }), (req, res) => {
    let payload = req.body || {};
    if (typeof payload === 'string') {
      try { payload = JSON.parse(payload); } catch(e) {}
    }
    const clientIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1').split(',')[0].trim();
    const ioObj = typeof getIo === 'function' ? getIo() : null;

    let hit = null;
    try {
      const geoTrafficEngine = require('../../geo-traffic-engine');
      hit = geoTrafficEngine.registerHit(payload.tipo || 'site', clientIp, {
        path: payload.path || '/',
        device: payload.userAgent ? (payload.userAgent.includes('Mobi') ? 'Mobile' : 'Desktop') : 'Desktop',
        cidade: payload.cidade,
        estado: payload.estado,
        lat: payload.lat,
        lng: payload.lng
      }, ioObj);
    } catch (e) {
      // Fallback simples se houver falha no módulo
      const baseLat = -14.2350;
      const baseLng = -51.9253;
      hit = {
        id: Date.now().toString() + Math.floor(Math.random() * 1000),
        lat: baseLat + (Math.random() * 15 - 7.5),
        lng: baseLng + (Math.random() * 15 - 7.5),
        tipo: payload.tipo || 'site',
        path: payload.path || '/',
        cidade: 'São Paulo',
        estado: 'SP',
        label: 'Acesso Público',
        timestamp: new Date().toISOString()
      };
      if (ioObj) ioObj.emit('geo_traffic_hit', hit);
    }
    res.json({ ok: true, hit: hit });
  });

  router.post('/api/monitor/cadastro-progresso', express.json(), (req, res) => {
    const progresso = req.body || {};
    const ioObj = typeof getIo === 'function' ? getIo() : null;
    if (ioObj) {
      ioObj.emit('cadastro_progresso', { ...progresso, timestamp: Date.now() });
    }
    res.json({ ok: true });
  });

  router.get('/sitemap.xml', (req, res) => {
    readGlobalConfig(cfg => {
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      res.send(buildSitemapXml(cfg));
    });
  });

  router.get('/robots.txt', (req, res) => {
    readGlobalConfig(cfg => {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.send(buildRobotsTxt(cfg));
    });
  });

  router.get('/llm.txt', (req, res) => {
    readGlobalConfig(cfg => {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.send(buildLlmTxt(cfg));
    });
  });

  router.post('/api/telemetria/clicks', express.json({ limit: '1mb' }), (req, res) => {
    const clicks = (req.body && req.body.clicks) || [];
    if (Array.isArray(clicks) && clicks.length > 0) {
      clicks.forEach(c => {
        console.log(`👆 [CLIQUE/AÇÃO] ${c.restaurante_nome || 'Restaurante'} | ${c.colaborador_nome || 'Colaborador'} (${c.colaborador_cargo || 'Op'}) -> "${c.funcao_nome || c.elemento_id}" em [${c.tela}] (${c.dispositivo || 'Web'})`);
      });
    }
    res.json({ ok: true, count: clicks.length });
  });

  router.get('/api/version', (req, res) => {
    res.json({
      ok: true,
      version: deploymentConfig.getSoftwareVersion(),
      timestamp: Date.now()
    });
  });

  router.get('/api/update/features', (req, res) => {
    res.json({
      ok: true,
      version: deploymentConfig.getSoftwareVersion(),
      features: [],
      message: ''
    });
  });

  router.get('/', (req, res) => {
    res.sendFile(path.join(BASE_DIR, 'site.html'));
  });

  router.get('/site', (req, res) => {
    res.sendFile(path.join(BASE_DIR, 'site.html'));
  });

  router.get('/sistema', (req, res) => {
    res.sendFile(path.join(BASE_DIR, 'index.html'));
  });

  router.get('/login', (req, res) => {
    res.sendFile(path.join(BASE_DIR, 'index.html'));
  });

  router.get('/login.html', (req, res) => {
    res.sendFile(path.join(BASE_DIR, 'index.html'));
  });

  router.get('/app', (req, res) => {
    res.sendFile(path.join(BASE_DIR, 'index.html'));
  });

  return router;
};
