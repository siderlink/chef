/**
 * routes/hardware.routes.js
 * Módulo de Integração com Hardware (Impressão Térmica ESC/POS e Maquininhas TEF/POS)
 * Extraído do server.js com blindagem rigorosa de autenticação e isolamento multi-tenant.
 *
 * Rotas:
 *   POST /api/imprimir/cupom-raw   — Despacho silencioso de impressão térmica ESC/POS
 *   POST /api/maquininha/testar    — Diagnóstico e teste de conectividade com terminal TEF/POS
 */
'use strict';

const express = require('express');
const { Router } = express;
const path = require('path');
const fs = require('fs');
const net = require('net');
const { getContext } = require('./shared/context');

function createHardwareRouter() {
  const router = Router();
  const { verificarToken, withTenant } = getContext();
  const getDb = () => getContext().getTenantDb();

  // ── POST /imprimir/cupom-raw — Impressão térmica ESC/POS (TCP ou Spool) ─────
  router.post('/imprimir/cupom-raw', verificarToken, (req, res) => {
    withTenant(req, () => {
      const db = getDb();
      const { tipo = 'raw', conteudo, mesa, items, total, subtotal, impressora } = req.body || {};

      let textoEscPos = typeof conteudo === 'string' ? conteudo : '';

      // Se não veio texto raw pronto, monta a estrutura ESC/POS padrão
      if (!textoEscPos && (items || mesa)) {
        const ESC = '\x1B';
        const linha = (txt = '') => txt + '\n';
        const divisor = '--------------------------------\n';
        const centrar = (txt) => {
          const pad = Math.max(0, Math.floor((32 - txt.length) / 2));
          return ' '.repeat(pad) + txt + '\n';
        };

        let txt = '';
        txt += `${ESC}!0`; // Inicializa fonte normal
        txt += centrar('CONFERÊNCIA DE MESA');
        if (mesa) txt += centrar(`Mesa: ${String(mesa).slice(0, 20)}`);
        txt += divisor;

        if (Array.isArray(items)) {
          items.forEach(it => {
            const rawNome = it.productName || it.nome || 'Produto';
            const nome = String(rawNome).substring(0, 18);
            const qtd = String(it.quantity || it.quantidade || 1);
            const val = parseFloat(String(it.total || 0).replace(',', '.')).toFixed(2);
            const espaco = 32 - qtd.length - 1 - nome.length - val.length - 1;
            txt += `${qtd}x ${nome}${' '.repeat(Math.max(1, espaco))}${val}\n`;
          });
        }

        txt += divisor;
        if (subtotal != null) txt += linha(`Subtotal:         R$ ${parseFloat(subtotal || 0).toFixed(2)}`);
        if (total != null) txt += linha(`TOTAL:            R$ ${parseFloat(total || 0).toFixed(2)}`);
        txt += '\n\n\n';
        textoEscPos = txt;
      }

      if (!textoEscPos.trim()) {
        return res.status(400).json({ ok: false, erro: 'Nenhum conteúdo para imprimir.' });
      }

      // Tenta usar sync-local-engine para despacho TCP direto
      let syncEngine = null;
      try {
        syncEngine = require('../sync-local-engine');
      } catch (e) {
        // Fallback para spool
      }

      if (syncEngine && typeof syncEngine.despacharImpressaoLocal === 'function') {
        const cfgImpressora = impressora || { tipo: 'TCP', ip: '127.0.0.1', porta: 9100, setor: 'CAIXA' };

        db.get(`SELECT valor FROM configuracoes WHERE chave = 'impressora_caixa_ip'`, (err, row) => {
          if (!err && row && row.valor && !impressora) cfgImpressora.ip = row.valor;

          db.get(`SELECT valor FROM configuracoes WHERE chave = 'impressora_caixa_porta'`, (errP, rowP) => {
            if (!errP && rowP && rowP.valor && !impressora) {
              cfgImpressora.porta = parseInt(rowP.valor, 10) || 9100;
            }

            syncEngine.despacharImpressaoLocal(cfgImpressora, textoEscPos)
              .then(result => res.json(result))
              .catch(err2 => res.json({ ok: false, erro: String(err2.message || err2) }));
          });
        });
      } else {
        // Fallback: grava no diretório de spool local
        try {
          const spoolDir = path.join(__dirname, '..', 'spool_impressao');
          if (!fs.existsSync(spoolDir)) {
            fs.mkdirSync(spoolDir, { recursive: true });
          }
          const safeTimestamp = Date.now();
          const spoolFile = path.join(spoolDir, `print_caixa_${safeTimestamp}.txt`);
          fs.writeFileSync(spoolFile, textoEscPos, 'utf-8');
          res.json({
            ok: true,
            tipo: 'SPOOL',
            arquivo: path.basename(spoolFile),
            mensagem: 'Arquivo gravado no spooler com sucesso.'
          });
        } catch (e) {
          res.status(500).json({ ok: false, erro: 'Erro ao gravar arquivo de impressão no spool: ' + e.message });
        }
      }
    });
  });

  // ── POST /maquininha/testar — Diagnóstico e teste de comunicação com TEF/POS ──
  router.post('/maquininha/testar', verificarToken, (req, res) => {
    const { provedor } = req.body || {};
    if (!provedor || provedor === 'none') {
      return res.status(400).json({ ok: false, msg: 'Nenhum provedor selecionado.' });
    }

    withTenant(req, () => {
      const db = getDb();
      db.all(`SELECT chave, valor FROM configuracoes`, async (err, rows) => {
        if (err) return res.status(500).json({ ok: false, msg: 'Erro ao carregar configurações do tenant.' });

        const config = {};
        if (rows) rows.forEach(r => { config[r.chave] = r.valor; });

        try {
          // ── Provedor: Mercado Pago Point
          if (provedor === 'mercadopago') {
            const token = config.mp_access_token;
            const deviceId = config.mp_device_id;
            if (!token || !deviceId) {
              return res.json({ ok: false, msg: 'Access Token ou Device ID do Mercado Pago não configurados.' });
            }

            const response = await fetch(`https://api.mercadopago.com/point/integration-api/devices/${encodeURIComponent(deviceId)}`, {
              headers: { 'Authorization': `Bearer ${token}` },
              signal: AbortSignal.timeout(5000)
            });

            if (response.ok) {
              const data = await response.json();
              return res.json({ ok: true, msg: `Mercado Pago OK — Device: ${data.id || deviceId} | Modo: ${data.operating_mode || 'online'}` });
            } else {
              const errData = await response.json().catch(() => ({}));
              return res.json({ ok: false, msg: `Mercado Pago: ${errData.message || 'HTTP ' + response.status}` });
            }
          }

          // ── Provedor: Stone TEF
          if (provedor === 'stone') {
            const stonePorta = parseInt(config.stone_porta, 10) || 8080;
            const stoneCode = config.stone_stonecode;
            if (!stoneCode) {
              return res.json({ ok: false, msg: 'Stone Code não configurado.' });
            }

            const response = await fetch(`http://127.0.0.1:${stonePorta}/health`, { signal: AbortSignal.timeout(5000) });
            if (response.ok) {
              return res.json({ ok: true, msg: `Stone Client TEF respondeu na porta ${stonePorta}. Stone Code: ${stoneCode}` });
            } else {
              return res.json({ ok: false, msg: `Stone Client respondeu com HTTP ${response.status}` });
            }
          }

          // ── Provedor: PagBank Terminal
          if (provedor === 'pagbank') {
            const pgToken = config.pagbank_token;
            const pgTerminal = config.pagbank_terminal;
            if (!pgToken) {
              return res.json({ ok: false, msg: 'Token PagBank não configurado.' });
            }

            const response = await fetch(`https://api.pagseguro.com/terminal/v1/terminals/${encodeURIComponent(pgTerminal || '')}`, {
              headers: { 'Authorization': `Bearer ${pgToken}` },
              signal: AbortSignal.timeout(5000)
            });

            if (response.ok) {
              const data = await response.json();
              return res.json({ ok: true, msg: `PagBank OK — Terminal: ${data.id || pgTerminal} | Status: ${data.status || 'online'}` });
            } else {
              const errData = await response.json().catch(() => ({}));
              return res.json({ ok: false, msg: `PagBank: ${errData.message || errData.error || 'HTTP ' + response.status}` });
            }
          }

          // ── Provedor: SiTef (Software Express)
          if (provedor === 'sitef') {
            const sitefIp = config.sitef_ip;
            const sitefPorta = parseInt(config.sitef_porta, 10) || 4096;
            if (!sitefIp) {
              return res.json({ ok: false, msg: 'IP do servidor SiTef não configurado.' });
            }

            await new Promise((resolve) => {
              const socket = new net.Socket();
              socket.setTimeout(5000);
              socket.connect(sitefPorta, sitefIp, () => {
                socket.destroy();
                res.json({ ok: true, msg: `SiTef: conexão TCP OK com ${sitefIp}:${sitefPorta}` });
                resolve();
              });
              socket.on('timeout', () => {
                socket.destroy();
                res.json({ ok: false, msg: `SiTef: timeout ao conectar em ${sitefIp}:${sitefPorta}` });
                resolve();
              });
              socket.on('error', (errSocket) => {
                res.json({ ok: false, msg: `SiTef: ${errSocket.message}` });
                resolve();
              });
            });
            return;
          }

          return res.status(400).json({ ok: false, msg: `Provedor desconhecido: ${provedor}` });
        } catch (e) {
          return res.status(500).json({ ok: false, msg: `Erro ao testar conectividade: ${e.message}` });
        }
      });
    });
  });

  return router;
}

module.exports = { createHardwareRouter };
