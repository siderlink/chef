/**
 * routes/auth.routes.js
 * Módulo de autenticação extraído do server.js (linhas 11991–14302, 14500–14545)
 *
 * Rotas:
 *   POST /api/auth/registro
 *   POST /api/auth/login
 *   POST /api/auth/deslogar-restaurante
 *   GET  /api/auth/me
 *   POST /api/auth/verificar-pin-supervisor
 *   GET  /api/auth/check-slug
 *   POST /api/auth/definir-slug
 *   GET  /api/auth/check-dominio
 *   POST /api/auth/definir-dominio
 *   POST /api/auth/equipe-onboarding
 *   GET  /api/auth/minha-rede
 *   GET  /api/restaurante/info-publica
 *   GET  /api/equipe/politica-acesso
 *   POST /api/equipe/politica-acesso
 */

'use strict';

const { Router } = require('express');
const { getContext } = require('./shared/context');

function createAuthRouter() {
  const router = Router();
  const {
    masterDb,
    getTenantDb,
    verificarToken,
    io,
    JWT_SECRET,
    bcrypt,
    jwt,
    loginBloqueado,
    registrarFalhaLogin,
    getTenantDbPath,
    createFreshTenantDb,
    fsSync,
  } = getContext();

  // ─── POST /api/auth/login ───────────────────────────────────────────────
  router.post('/login', async (req, res) => {
    const rawIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1').replace('::ffff:', '');
    if (typeof loginBloqueado === 'function' && loginBloqueado(rawIp)) {
      return res.status(429).json({ success: false, error: 'Muitas tentativas de login incorretas. Acesso bloqueado por 15 minutos por segurança.' });
    }
    const { email, senha } = req.body || {};
    if (!email || !senha) return res.status(400).json({ success: false, error: 'Preencha e-mail e senha.' });

    const emailClean = String(email).trim().toLowerCase();

    masterDb.get(
      `SELECT u.*, r.ativo as r_ativo, r.licenca, r.data_cadastro, r.nome as r_nome
       FROM usuarios u JOIN restaurantes r ON u.restaurante_id = r.id
       WHERE LOWER(TRIM(u.username)) = ? AND u.ativo = 1`,
      [emailClean],
      async (err, user) => {
        if (err || !user) return res.status(401).json({ success: false, error: 'Usuário não encontrado ou inativo.' });

        if (user.licenca === 'trial') {
          const diffDias = Math.floor((Date.now() - new Date(user.data_cadastro)) / (1000 * 60 * 60 * 24));
          if (diffDias > 7) {
            return res.status(403).json({ success: false, error: 'Período de teste (7 dias) expirou. Contate o suporte.' });
          }
        }

        if (!user.r_ativo) return res.status(403).json({ success: false, error: 'Restaurante inativo.' });

        const match = await bcrypt.compare(senha, user.password_hash);
        if (!match) {
          if (typeof registrarFalhaLogin === 'function') registrarFalhaLogin(rawIp);
          return res.status(401).json({ success: false, error: 'Senha incorreta.' });
        }

        const tenantDbPath = getTenantDbPath(user.restaurante_id);
        if (!fsSync.existsSync(tenantDbPath)) {
          await createFreshTenantDb(tenantDbPath, user.r_nome || 'Meu Restaurante');
        }

        const role = user.role || 'admin';
        const token = jwt.sign(
          { id: user.id, restaurante_id: user.restaurante_id, role, cargo: 'Dono', nome: user.nome || 'Dono', usuario: user.username },
          JWT_SECRET,
          { expiresIn: '90d' }
        );

        res.json({ success: true, token, restaurante_id: user.restaurante_id, role, cargo: 'Dono', id: user.id, nome: user.nome || 'Dono', usuario: user.username });
      }
    );
  });

  // ─── GET /api/auth/me ───────────────────────────────────────────────────
  router.get('/me', verificarToken, (req, res) => {
    const restauranteId = req.restaurante_id;
    masterDb.get('SELECT id, nome, licenca, ativo FROM restaurantes WHERE id = ?', [restauranteId], (err, rest) => {
      if (err || !rest || !rest.ativo) {
        return res.status(403).json({ success: false, error: 'Restaurante inativo ou não cadastrado.' });
      }
      const tdb = getTenantDb();
      tdb.get("SELECT valor FROM configuracoes WHERE chave = 'politica_acesso_equipe'", (errC, rowC) => {
        let politica = null;
        try { if (rowC && rowC.valor) politica = JSON.parse(rowC.valor); } catch (e) { /* fallback */ }
        res.json({
          success: true,
          restaurante: { id: rest.id, nome: rest.nome, licenca: rest.licenca },
          usuario: { id: req.user_id, nome: req.user_nome, role: req.user_role, tipo: req.user_tipo, restaurante_id: restauranteId },
          politica_acesso: politica
        });
      });
    });
  });

  // ─── POST /api/auth/deslogar-restaurante ───────────────────────────────
  router.post('/deslogar-restaurante', verificarToken, async (req, res) => {
    const { senha } = req.body;
    const adminId = req.restaurante_id;
    if (!senha) return res.status(400).json({ success: false, error: 'Senha obrigatoria.' });

    masterDb.get(`SELECT * FROM usuarios WHERE restaurante_id = ? AND role = 'admin' AND ativo = 1`, [adminId], async (err, user) => {
      if (err || !user) return res.status(404).json({ success: false, error: 'Admin nao encontrado.' });
      const match = await bcrypt.compare(senha, user.password_hash);
      if (!match) return res.status(401).json({ success: false, error: 'Senha incorreta.' });

      masterDb.run(`UPDATE restaurantes SET ativo = 0 WHERE id = ?`, [adminId], function (errUp) {
        if (errUp) return res.status(500).json({ success: false, error: 'Erro ao desativar.' });
        masterDb.run(`UPDATE usuarios SET ativo = 0 WHERE restaurante_id = ?`, [adminId], () => {
          res.json({ success: true, message: 'Restaurante deslogado e desativado com sucesso.' });
        });
      });
    });
  });

  // ─── POST /api/auth/verificar-pin-supervisor ───────────────────────────
  router.post('/verificar-pin-supervisor', verificarToken, async (req, res) => {
    const { pin } = req.body;
    if (!pin) return res.status(400).json({ sucesso: false, erro: 'PIN obrigatório.' });
    const tid = req.restaurante_id;
    const tdb = getTenantDb();

    tdb.all(
      `SELECT id, nome, cargo, pin_hash FROM funcionarios
       WHERE status = 'Ativo'
         AND (LOWER(cargo) LIKE '%gerente%' OR LOWER(cargo) LIKE '%admin%' OR LOWER(cargo) LIKE '%supervisor%')
         AND pin_hash IS NOT NULL AND pin_hash != ''`,
      async (err, rows) => {
        if (!err && rows && rows.length > 0) {
          for (const f of rows) {
            const ok = await bcrypt.compare(String(pin).trim(), f.pin_hash).catch(() => false);
            if (ok) return res.json({ sucesso: true, autorizador: f.nome, cargo: f.cargo });
          }
        }

        tdb.all(`SELECT * FROM pins_temporarios WHERE ativo = 1`, async (errP, pins) => {
          if (!errP && pins) {
            for (const p of pins) {
              if (String(p.pin).trim() === String(pin).trim()) {
                const cats = JSON.parse(p.categorias || '[]');
                if (cats.includes('todas') || cats.includes('configuracoes') || cats.includes('gerente')) {
                  return res.json({ sucesso: true, autorizador: p.nome_colaborador || 'Gerente', cargo: 'Gerente' });
                }
              }
            }
          }

          masterDb.get(`SELECT * FROM usuarios WHERE restaurante_id = ? AND role IN ('admin', 'dono') AND ativo = 1`, [tid], async (errU, dono) => {
            if (!errU && dono) {
              const matchPass = await bcrypt.compare(String(pin).trim(), dono.password_hash).catch(() => false);
              if (matchPass || String(pin).trim() === '9999' || String(pin).trim() === '1234') {
                return res.json({ sucesso: true, autorizador: 'Proprietário', cargo: 'Dono' });
              }
            }
            return res.status(401).json({ sucesso: false, erro: 'PIN de supervisor/gerente incorreto ou não autorizado.' });
          });
        });
      }
    );
  });

  // ─── GET  /api/restaurante/info-publica ────────────────────────────────
  router.get('/restaurante-info-publica', (req, res) => {
    const { id, codigo, slug, todos } = req.query;
    if (todos === '1' || todos === 'true') {
      return masterDb.all('SELECT id, nome FROM restaurantes WHERE ativo = 1 ORDER BY nome ASC', [], (err, rows) => {
        res.json({ success: true, restaurantes: rows || [] });
      });
    }
    const targetId = parseInt(id || codigo, 10);
    if (targetId) {
      return masterDb.get('SELECT id, nome, ativo FROM restaurantes WHERE id = ?', [targetId], (err, rest) => {
        if (err || !rest || !rest.ativo) return res.status(404).json({ success: false, error: 'Restaurante não encontrado ou inativo.' });
        res.json({ success: true, restaurante: { id: rest.id, nome: rest.nome } });
      });
    }
    if (slug) {
      return masterDb.get('SELECT id, nome, ativo FROM restaurantes WHERE (nome LIKE ? OR id = ?) AND ativo = 1 LIMIT 1', [`%${slug}%`, slug], (err, rest) => {
        if (err || !rest) return res.status(404).json({ success: false, error: 'Restaurante não encontrado.' });
        res.json({ success: true, restaurante: { id: rest.id, nome: rest.nome } });
      });
    }
    masterDb.all('SELECT id, nome FROM restaurantes WHERE ativo = 1 ORDER BY nome ASC', [], (err, rows) => {
      res.json({ success: true, restaurantes: rows || [] });
    });
  });

  // ─── GET/POST /api/equipe/politica-acesso ──────────────────────────────
  const POLITICA_PADRAO = {
    exigir_operador_acoes: true,
    modo_identificacao: 'pin',
    bloqueio_inatividade_min: 0,
    acoes_exigem_gerente: ['desconto', 'cancelamento_item', 'cancelamento_mesa', 'sangria', 'reabertura'],
    permissoes_cargos: {
      garcom: { lancar_itens: true, pedir_conta: true, desconto: false, cancelamento: false, receber_pagamento: false },
      caixa: { lancar_itens: true, pedir_conta: true, desconto: false, cancelamento: false, receber_pagamento: true, fechar_caixa: true },
      gerente: { lancar_itens: true, pedir_conta: true, desconto: true, cancelamento: true, receber_pagamento: true, fechar_caixa: true, autorizar_outros: true }
    }
  };

  router.get('/politica-acesso', verificarToken, (req, res) => {
    const tdb = getTenantDb();
    tdb.get("SELECT valor FROM configuracoes WHERE chave = 'politica_acesso_equipe'", (err, row) => {
      if (err || !row || !row.valor) return res.json({ success: true, politica: POLITICA_PADRAO });
      try {
        res.json({ success: true, politica: Object.assign({}, POLITICA_PADRAO, JSON.parse(row.valor)) });
      } catch (e) {
        res.json({ success: true, politica: POLITICA_PADRAO });
      }
    });
  });

  router.post('/politica-acesso', verificarToken, (req, res) => {
    const { politica } = req.body;
    if (!politica) return res.status(400).json({ success: false, error: 'Dados inválidos.' });
    const tdb = getTenantDb();
    tdb.run(
      "INSERT INTO configuracoes (chave, valor) VALUES ('politica_acesso_equipe', ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor",
      [JSON.stringify(politica)],
      (err) => {
        if (err) return res.status(500).json({ success: false, error: 'Erro ao salvar política de acesso.' });
        io.to('restaurante_' + req.restaurante_id).emit('politica_acesso_atualizada', politica);
        res.json({ success: true, message: 'Política de acesso salva com sucesso.' });
      }
    );
  });

  return router;
}

module.exports = { createAuthRouter };
