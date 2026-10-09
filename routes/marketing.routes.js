/**
 * routes/marketing.routes.js
 * Módulo de Marketing, Campanhas, Tracking de Conversão e Leads por Nicho
 * Extraído do server.js com preservação de segurança:
 * - Sanitização de IP e dados do visitante contra injeção e DoS
 * - Validação rigorosa de telefone/WhatsApp
 * - Gravação segura em masterDb para captação de vendas
 * - Eventos direcionados para Super Admin via Socket.io
 */

'use strict';

const { Router } = require('express');
const { getContext } = require('./shared/context');

function createMarketingRouter() {
  const router = Router();
  const { masterDb, getTenantDb, withTenant, io } = getContext();
  const getDb = () => getTenantDb();

  // Helper para limpar IP de requisição
  function getCleanIp(req) {
    const raw = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    return String(raw).replace('::ffff:', '').split(',')[0].trim();
  }

  // POST /api/track/visit - Registra visita nas páginas de venda e nichos
  router.post('/track/visit', (req, res) => {
    const { page } = req.body || {};
    const ip = getCleanIp(req);
    if (io) {
      io.emit('novo_visitante_site', { page: String(page || '').slice(0, 100), ip, time: new Date().toISOString() });
    }
    res.json({ ok: true });
  });

  // POST /api/track/click - Registra clique em CTAs
  router.post('/track/click', (req, res) => {
    const { page, button } = req.body || {};
    const ip = getCleanIp(req);
    if (io) {
      io.emit('clique_comecar_agora', { page: String(page || '').slice(0, 100), button: String(button || '').slice(0, 100), ip, time: new Date().toISOString() });
    }
    res.json({ ok: true });
  });

  // POST /api/leads/nicho - Captura lead qualificado
  router.post('/leads/nicho', (req, res) => {
    const { nicho, restaurante_nome, cidade, whatsapp, faturamento_estimado, roi_estimado } = req.body || {};
    const cleanWpp = String(whatsapp || '').replace(/\D/g, '');
    if (!cleanWpp || cleanWpp.length < 10) {
      return res.status(400).json({ ok: false, erro: 'Informe um número de WhatsApp válido com DDD.' });
    }
    const ip = getCleanIp(req);

    masterDb.run(
      `INSERT INTO leads_nichos (nicho, restaurante_nome, cidade, whatsapp, faturamento_estimado, roi_estimado, ip)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        String(nicho || 'geral').slice(0, 50),
        String(restaurante_nome || '').slice(0, 150),
        String(cidade || '').slice(0, 100),
        cleanWpp,
        String(faturamento_estimado || '').slice(0, 50),
        parseFloat(roi_estimado) || 0,
        ip
      ],
      function (err) {
        if (err) {
          console.error('[Lead Nicho] Erro ao salvar:', err.message);
          return res.status(500).json({ ok: false, erro: 'Erro interno ao registrar lead.' });
        }
        const leadId = this ? this.lastID : 0;
        const notifData = {
          id: leadId,
          nicho: nicho || 'geral',
          restaurante_nome: restaurante_nome || 'Restaurante Interessado',
          cidade: cidade || 'Brasil',
          whatsapp: cleanWpp,
          faturamento_estimado: faturamento_estimado || null,
          roi_estimado: parseFloat(roi_estimado) || 0,
          criado_em: new Date().toISOString()
        };
        if (io) {
          io.emit('novo_lead_nicho', notifData);
          io.to('super_admin').emit('novo_lead_vendas', notifData);
        }
        return res.json({ ok: true, lead_id: leadId, mensagem: 'Diagnóstico gerado com sucesso!' });
      }
    );
  });

  // GET /api/leads/nicho - Consulta últimos leads capturados
  router.get('/leads/nicho', (req, res) => {
    masterDb.all(`SELECT * FROM leads_nichos ORDER BY id DESC LIMIT 50`, (err, rows) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({ ok: true, leads: rows || [] });
    });
  });

  // GET /api/marketing/status - Status do módulo de marketing
  router.get('/status', (req, res) => {
    withTenant(req, () => {
      const db = getDb();
      db.get('SELECT valor FROM configuracoes WHERE chave = "modulo_marketing_ativo"', (err, row) => {
        const ativo = row && row.valor === 'true';
        db.get('SELECT COUNT(*) as total_clientes FROM clientes', (err2, countRow) => {
          res.json({
            ativo: Boolean(ativo),
            total_clientes: countRow?.total_clientes || 0,
            plano: 'Pro Marketing Push + WhatsApp'
          });
        });
      });
    });
  });

  // POST /api/marketing/ativar - Ativação do módulo
  router.post('/ativar', (req, res) => {
    withTenant(req, () => {
      const db = getDb();
      db.run(
        `INSERT INTO configuracoes (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`,
        ['modulo_marketing_ativo', 'true'],
        (err) => {
          if (err) return res.status(500).json({ success: false, error: err.message });
          res.json({ success: true, mensagem: 'Módulo Premium de Mensagens & Push ativado!' });
        }
      );
    });
  });

  // POST /api/marketing/disparo-massa - Disparo em massa de notificações
  router.post('/disparo-massa', (req, res) => {
    const { mensagem, cupom_codigo } = req.body || {};
    if (!mensagem || !String(mensagem).trim()) return res.status(400).json({ success: false, error: 'Mensagem não informada.' });

    withTenant(req, () => {
      const db = getDb();
      db.get('SELECT COUNT(*) as count FROM clientes', (err, row) => {
        const total = row?.count || 0;
        console.log(`📢 [MARKETING PUSH/WHATSAPP] Disparado para ${total} clientes: "${mensagem}" (Cupom: ${cupom_codigo || 'Nenhum'})`);
        res.json({ success: true, enviados: total, cupom: cupom_codigo });
      });
    });
  });

  // POST /api/seo/disparar-pinger - Canhão Automático de Indexação e RPC Pinger
  const { verificarToken } = getContext();
  router.post('/seo/disparar-pinger', verificarToken, (req, res) => {
    masterDb.all("SELECT chave, valor FROM configuracoes_global WHERE chave LIKE 'site_seo_%'", (err, rows) => {
      try {
        const config = {};
        if (rows) rows.forEach(r => { config[r.chave] = r.valor; });

        const dominio = config.site_seo_dominio || 'https://cheff.pro';
        const titulo = config.site_seo_titulo || 'Sistema Chef Cozinha';
        const engines = config.site_seo_search_engines || '';
        const rpc = config.site_seo_rpc_urls || '';

        try {
          const seoIndexer = require('../seo-indexer');
          if (seoIndexer && typeof seoIndexer.runAutoIndexer === 'function') {
            seoIndexer.runAutoIndexer(dominio, titulo, engines, rpc);
          }
        } catch (eSeo) {
          console.warn('[marketing] SEO Indexer não disponível ou erro local:', eSeo.message);
        }

        if (io) {
          io.of('/sync').emit('server:command', {
            payload: {
              command_id: Date.now().toString(),
              command: 'seo_ping',
              params: { dominio, titulo, engines, rpc }
            }
          });
        }

        res.json({ ok: true, msg: 'Canhão de SEO (Indexação e Ping RPC) disparado com sucesso!' });
      } catch (e) {
        res.status(500).json({ error: e.message });
      }
    });
  });

  return router;
}

module.exports = { createMarketingRouter };
