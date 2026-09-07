/**
 * controllers/sistema-extra.js
 * Módulo com rotas e serviços essenciais restaurados:
 * - Modo Demonstração & Verificação de Demo Ativa (/api/auth/verificar-demo-ativa, /api/auth/entrar-modo-demo)
 * - Setup Inicial do Dono (/api/setup-dono)
 * - Modalidades de Operação & Módulos por Modalidade (/api/modalidade-modulos, /api/config/modalidade)
 * - Permissões de Estação de Colaboradores (/api/funcionarios/:id/permissoes-estacoes)
 * - Troca de Restaurante Multi-Tenant (/api/auth/trocar-restaurante)
 * - Reporte de Problemas ao Suporte (/api/support/report)
 * - Estado de Emergência & Tela de Resgate (/api/emergency-state, /rescue)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const jwt = require('jsonwebtoken');
let bcrypt;
try { bcrypt = require('bcrypt'); } catch(e) {}

const EMERGENCY_STATE_PATH = path.join(__dirname, '..', 'emergency_state.json');

const MODALIDADE_MODULOS = {
  a_la_carte:  ['reservas', 'fidelidade', 'comandas', 'cardapio_foto', 'producao', 'formas_pagamento'],
  pizzaria:    ['montaveis', 'reservas', 'fidelidade', 'delivery', 'cardapio_foto', 'producao', 'formas_pagamento'],
  a_kilo:      ['balanca', 'reservas', 'fidelidade', 'cardapio_foto', 'producao', 'formas_pagamento'],
  buffet:      ['reservas', 'fidelidade', 'comandas', 'cardapio_foto', 'formas_pagamento'],
  lanchonete:  ['montaveis', 'delivery', 'totem', 'cardapio_foto', 'producao', 'formas_pagamento'],
  bar:         ['reservas', 'fidelidade', 'comandas', 'cardapio_foto', 'formas_pagamento'],
  balada:      ['reservas', 'fidelidade', 'comandas', 'cardapio_foto', 'fila_senhas', 'formas_pagamento'],
  quiosque:    ['totem', 'fila_senhas', 'cardapio_foto', 'formas_pagamento'],
  eventos:     ['reservas', 'fidelidade', 'comandas', 'cardapio_foto', 'producao', 'formas_pagamento'],
};

module.exports = function(app, masterDb, sqlite3, options) {
  const { verificarToken, getTenantDb, io } = options || {};
  const bcryptInstance = (options && options.bcrypt) || bcrypt;
  const JWT_SECRET = (options && options.JWT_SECRET) || process.env.JWT_SECRET || 'chave-secreta-chef-cozinha';

  // 1. VERIFICAÇÃO DE DEMO ATIVA
  app.post('/api/auth/verificar-demo-ativa', (req, res) => {
  const { lat, lng, fingerprint } = req.body || {};
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();

  masterDb.all(
    `SELECT * FROM sessoes_demo_rastreio 
     WHERE (ip = ? OR (lat IS NOT NULL AND abs(lat - ?) < 0.003 AND abs(lng - ?) < 0.003))
       AND criado_em >= datetime('now', 'localtime', '-60 minutes')
       AND ativo = 1
     ORDER BY id DESC LIMIT 5`,
    [ip, parseFloat(lat) || 0, parseFloat(lng) || 0],
    (err, rows) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      
      const sessoesRecentes = rows || [];
      
      // Alerta Super Admin se o mesmo IP gerou múltiplos perfis diferentes
      if (sessoesRecentes.length >= 2) {
        io.emit('alerta_impostor_super_admin', {
          email: 'Detectado via IP/GPS',
          cargo: 'Tentativa Multi-Perfil',
          restaurante_id: 999,
          restaurante_nome: 'Multi-Perfil no mesmo local (' + ip + ')',
          ip,
          mensagem: `🚨 ALERTA MULTI-PERFIL: Usuário no IP ${ip} tentou gerar múltiplos perfis/demos no mesmo local em menos de 60 minutos!`
        });
      }

      if (sessoesRecentes.length > 0) {
        const maisRecente = sessoesRecentes[0];
        return res.json({
          ok: true,
          existe_demo: true,
          demo: {
            id: maisRecente.id,
            restaurante_nome: maisRecente.restaurante_nome || 'Demonstração em Andamento',
            criado_em: maisRecente.criado_em,
            ip: maisRecente.ip
          }
        });
      }

      res.json({ ok: true, existe_demo: false });
    }
  );
});

  // 2. ENTRAR MODO DEMO
  app.post('/api/auth/entrar-modo-demo', (req, res) => {
  const demoTenantId = 999;
  masterDb.serialize(() => {
    // 1. Garante que o restaurante demo 999 exista no masterDb
    masterDb.run(
      `INSERT INTO restaurantes (id, restaurante, responsavel, email, telefone, status, plano, login_mode, criado_em)
       VALUES (999, 'Restaurante Demonstração', 'Dono Demonstração', 'demo@chefcozinha.com', '(11) 99999-9999', 'ativo', 'pro', 'multi', datetime('now','localtime'))
       ON CONFLICT(id) DO UPDATE SET status = 'ativo', plano = 'pro'`,
      () => {
        // 2. Garante que o tenant DB do demo esteja criado e semeado
        try {
          const tdb = getTenantDb(demoTenantId);
          ensureAllTenantTablesAndColumns(tdb);
          seedTenantDb(tdb);
          tdb.run("INSERT INTO configuracoes (chave, valor) VALUES ('nome_restaurante', 'Restaurante Demonstração') ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor");
          tdb.run("INSERT INTO configuracoes (chave, valor) VALUES ('onboarding_completo', 'true') ON CONFLICT(chave) DO UPDATE SET valor = 'true'");
        } catch (e) {
          console.warn('[Demo Tenant Seed Error]', e.message);
        }

        // 3. Emite token JWT de demonstração com restaurante_id = 999
        // Sessão Demo com expiração estrita de 60 minutos
        const expiraEmMs = Date.now() + 60 * 60 * 1000;
        const ipReq = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
        const { lat, lng, restaurante_nome } = req.body || {};

        masterDb.run(
          `INSERT INTO sessoes_demo_rastreio (sessao_id, ip, lat, lng, user_agent, restaurante_nome, expira_em, ativo)
           VALUES (?, ?, ?, ?, ?, ?, datetime('now', '+60 minutes'), 1)`,
          ['demo-' + Date.now(), ipReq, parseFloat(lat) || null, parseFloat(lng) || null, req.headers['user-agent'] || '', restaurante_nome || 'Demonstração', 1],
          () => {}
        );

        const demoToken = jwt.sign(
          {
            id: 999,
            nome: 'Dono Demonstração',
            usuario: 'demo',
            role: 'admin',
            cargo: 'Dono (Demo)',
            is_dono: true,
            is_demo: true,
            demo_expira_em: expiraEmMs,
            restaurante_id: demoTenantId
          },
          JWT_SECRET,
          { expiresIn: '60m' }
        );

        res.json({
          ok: true,
          token: demoToken,
          expira_em_timestamp: expiraEmMs,
          limite_minutos: 60,
          user: {
            nome: 'Dono Demonstração',
            usuario: 'demo',
            role: 'admin',
            cargo: 'Dono (Demo)',
            is_dono: true,
            is_demo: true
          },
          restaurante_id: demoTenantId,
          mensagem: 'Modo Demonstração de 60 minutos ativado com sucesso!'
        });
      }
    );
  });
});

  // 3. SETUP DONO
  app.post('/api/setup-dono', (req, res) => {
  const { nome_restaurante, telefone_restaurante, endereco_restaurante, dono_nome, dono_usuario, dono_senha, dono_pin } = req.body || {};
  
  const restNome = String(nome_restaurante || '').trim();
  const nomeDono = String(dono_nome || '').trim();
  const usuarioDono = String(dono_usuario || '').trim().toLowerCase();
  const senhaDono = String(dono_senha || '').trim();
  const pin = String(dono_pin || '0000').replace(/\D/g, '') || '0000';

  if (!restNome || restNome.length < 3) {
    return res.status(400).json({ ok: false, erro: 'O nome do restaurante deve ter no mínimo 3 caracteres válidos.' });
  }
  if (!nomeDono || nomeDono.length < 3) {
    return res.status(400).json({ ok: false, erro: 'O nome do Dono / Responsável deve ter no mínimo 3 caracteres.' });
  }
  if (!usuarioDono || usuarioDono.length < 3 || !/^[a-z0-9._-]+$/.test(usuarioDono)) {
    return res.status(400).json({ ok: false, erro: 'O usuário do Dono deve ter no mínimo 3 caracteres (sem espaços ou caracteres especiais).' });
  }
  if (!senhaDono || senhaDono.length < 4) {
    return res.status(400).json({ ok: false, erro: 'A senha do Dono deve ter no mínimo 4 caracteres.' });
  }

  let hash;
  if (bcryptInstance && typeof bcryptInstance.hashSync === 'function') {
    const salt = bcryptInstance.genSaltSync(10);
    hash = bcryptInstance.hashSync(senhaDono, salt);
  } else {
    const crypto = require('crypto');
    hash = crypto.createHash('sha256').update(senhaDono).digest('hex');
  }

  db.serialize(() => {
    // 1. Cria ou atualiza o usuário na tabela usuarios
    db.run(
      `INSERT INTO usuarios (username, password_hash, role, ativo, pin) VALUES (?, ?, 'admin', 1, ?)
       ON CONFLICT(username) DO UPDATE SET password_hash = excluded.password_hash, role = 'admin', ativo = 1, pin = excluded.pin`,
      [usuarioDono, hash, pin]
    );

    // 2. Cria ou atualiza na tabela funcionarios como Dono / Gerente Master
    db.run(
      `INSERT INTO funcionarios (nome, usuario, cargo, role, pin, ativo, permissao_total, senha) VALUES (?, ?, 'Dono / Gerente Master', 'admin', ?, 1, 1, ?)
       ON CONFLICT(usuario) DO UPDATE SET nome = excluded.nome, cargo = 'Dono / Gerente Master', role = 'admin', pin = excluded.pin, ativo = 1, permissao_total = 1, senha = excluded.senha`,
      [nomeDono, usuarioDono, pin, hash]
    );

    // 3. Salva nas configurações do restaurante
    const cfgs = {
      dono_nome: nomeDono,
      dono_usuario: usuarioDono,
      pin_admin: pin,
      senha_admin: dono_senha
    };
    if (nome_restaurante) cfgs.nome_restaurante = nome_restaurante;
    if (telefone_restaurante) cfgs.telefone_restaurante = telefone_restaurante;
    if (endereco_restaurante) cfgs.endereco_restaurante = endereco_restaurante;
    if (req.body.restaurante_lat) cfgs.restaurante_lat = req.body.restaurante_lat;
    if (req.body.restaurante_lng) cfgs.restaurante_lng = req.body.restaurante_lng;
    if (req.body.restaurante_precisao) cfgs.restaurante_precisao = req.body.restaurante_precisao;

    Object.keys(cfgs).forEach(k => {
      db.run(`INSERT INTO configuracoes (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [k, String(cfgs[k])]);
    });

    // 4. Gera o token JWT para o dono com permissão total e 365 dias de validade
    const currentTenant = (typeof tenantContext !== 'undefined' && tenantContext.getStore()) || 1;
    const token = jwt.sign(
      {
        id: 1,
        nome: nomeDono,
        usuario: usuarioDono,
        role: 'admin',
        cargo: 'Dono',
        is_dono: true,
        restaurante_id: currentTenant
      },
      JWT_SECRET,
      { expiresIn: '365d' }
    );

    res.json({
      ok: true,
      mensagem: 'Conta de Dono e Funcionário Master criada com sucesso!',
      token,
      user: {
        nome: nomeDono,
        usuario: usuarioDono,
        role: 'admin',
        cargo: 'Dono',
        is_dono: true
      }
    });
  });
});

  // 4. PERMISSÕES DE ESTAÇÕES DE COLABORADORES
  app.post('/api/funcionarios/:id/permissoes-estacoes', (req, res) => {
  const fid = parseInt(req.params.id);
  const { estacoes, tipo, horas_validade } = req.body || {};
  if (!fid || !Array.isArray(estacoes)) return res.status(400).json({ success: false, error: 'Dados inválidos' });

  const estacoesJson = JSON.stringify(estacoes);

  if (tipo === 'turno') {
    // Permissão temporária para o turno atual
    const horas = parseInt(horas_validade) || 8;
    const expira = new Date(Date.now() + horas * 3600 * 1000).toISOString();
    db.run(`UPDATE funcionarios SET permissoes_turno_estacoes = ?, permissoes_turno_expira = ? WHERE id = ?`,
      [estacoesJson, expira, fid], (err) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, tipo: 'turno', expira });
      });
  } else {
    // Permissão permanente
    db.run(`UPDATE funcionarios SET permissoes_estacoes = ? WHERE id = ?`,
      [estacoesJson, fid], (err) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, tipo: 'permanente' });
      });
  }
});

  // 5. TROCAR RESTAURANTE
  app.post('/api/auth/trocar-restaurante', verificarToken, async (req, res) => {
  const alvoId = parseInt(req.body.restaurante_id);
  if (!alvoId) return res.status(400).json({ success: false, error: 'Restaurante inválido.' });

  masterDb.get(`SELECT * FROM usuarios WHERE id = ? AND ativo = 1`, [req.usuario_id], async (errU, user) => {
    if (errU || !user) return res.status(404).json({ success: false, error: 'Usuário não encontrado.' });
    const cargoLower = String(user.role || '').toLowerCase();
    if (!['admin', 'administrador', 'gerente', 'dono'].includes(cargoLower)) {
      return res.status(403).json({ success: false, error: 'Sem permissão para alternar restaurantes.' });
    }
    masterDb.get(`SELECT id, nome, ativo, offline_habilitado FROM restaurantes WHERE id = ?`, [alvoId], (errR, alvo) => {
      if (errR || !alvo) return res.status(404).json({ success: false, error: 'Restaurante não encontrado.' });
      if (!alvo.ativo) return res.status(403).json({ success: false, error: 'Este restaurante está inativo.' });
      const ehDonoDoAlvo = String(alvo.id) === String(user.restaurante_id) ||
        String(alvo.dono_email || '').trim().toLowerCase() === String(user.username || '').trim().toLowerCase();
      if (!ehDonoDoAlvo) return res.status(403).json({ success: false, error: 'Você não administra este restaurante.' });
      const token = jwt.sign({ id: user.id, restaurante_id: alvoId, role: user.role }, JWT_SECRET, { expiresIn: '12h' });
      res.json({ success: true, token, restaurante_id: alvoId, restaurante_nome: alvo.nome, role: user.role, offline_habilitado: alvo.offline_habilitado === 1 });
    });
  });
});

  // 6. MODALIDADE MÓDULOS (GET)
  app.get('/api/modalidade-modulos', verificarToken, (req, res) => {
  const modalidade = String(req.query.modalidade || '').trim();
  if (!modalidade || !MODALIDADE_MODULOS[modalidade]) {
    return res.json({ ok: false, erro: 'Modalidade desconhecida.', modulos: [] });
  }
  res.json({ ok: true, modalidade, modulos: MODALIDADE_MODULOS[modalidade] });
});

  // 7. CONFIG MODALIDADE (POST)
  app.post('/api/config/modalidade', verificarToken, (req, res) => {
  const tid = req.restaurante_id || 1;
  const modalidade = String((req.body && req.body.modalidade) || '').trim();
  if (!modalidade || !MODALIDADE_MODULOS[modalidade]) {
    return res.status(400).json({ ok: false, erro: 'Modalidade inválida.' });
  }
  const modulosSugeridos = MODALIDADE_MODULOS[modalidade];

  // 1. Salva rest_modalidade nas configurações do tenant
  withTenant(req, () => {
    db.run(`INSERT INTO configuracoes (chave, valor) VALUES ('rest_modalidade', ?)
            ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [modalidade], function(errCfg) {
      if (errCfg) console.error('[modalidade] Erro ao salvar config:', errCfg.message);
    });
  });

  // 2. Auto-ativa módulos sugeridos no tenant_modulos (INSERT OR REPLACE)
  let pending = modulosSugeridos.length;
  if (!pending) return res.json({ ok: true, modalidade, ativados: 0 });

  const ativados = [];
  modulosSugeridos.forEach(modId => {
    // Garante que o módulo existe na tabela global
    masterDb.run(`INSERT OR IGNORE INTO modulo_sistemas (modulo_id, nome, descricao, tipo, icone, ativo_global, obrigatorios)
                  VALUES (?, ?, ?, 'feature', 'fa-puzzle-piece', 1, 0)`,
      [modId, modId, 'Módulo ativado automaticamente por modalidade'], function() {
        // Ativa para este tenant
        masterDb.run(`INSERT INTO tenant_modulos (restaurante_id, modulo_id, ativo, atualizado_em)
                      VALUES (?, ?, 1, datetime('now','localtime'))
                      ON CONFLICT(restaurante_id, modulo_id) DO UPDATE SET ativo = 1, atualizado_em = datetime('now','localtime')`,
          [tid, modId], function(errT) {
            if (!errT) ativados.push(modId);
            if (--pending === 0) {
              console.log(`[modalidade] Tenant ${tid}: modalidade="${modalidade}" → ${ativados.length} módulos ativados`);
              if (io) io.to(`super_admin`).emit('modulo_tenant_atualizado', { restaurante_id: tid, modalidade, ativados });
              res.json({ ok: true, modalidade, ativados });
            }
          });
      });
  });
});

  // 8. SUPORTE REPORT
  app.post('/api/support/report', (req, res) => {
  const { restaurante_id, usuario, problema, page, user_agent } = req.body || {};
  if (!problema) return res.json({ ok: false, erro: 'Descreva o problema.' });
  const ts = new Date().toISOString();
  const report = `[${ts}] Reportado por: ${usuario || 'Anônimo'} (rest=${restaurante_id || '?'}) | Página: ${page || '?'} | UA: ${user_agent || '?'}\n  Problema: ${problema}\n`;
  try {
    const logDir = path.join(__dirname, 'logs');
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(path.join(logDir, 'suporte-reports.log'), report);
  } catch (e) { }
  // Cria task de suporte se existir a tabela
  masterDb.run("INSERT INTO tasks_suporte (tipo, titulo, descricao, status, criado_em) VALUES (?, ?, ?, 'aberto', ?)",
    ['report_cliente', `Report de ${usuario || 'Cliente'} (rest #${restaurante_id || '?'})`, problema, ts], () => {});
  res.json({ ok: true, mensagem: 'Reporte enviado! Nosso time será notificado.' });
});

  // 9. EMERGENCY STATE
  app.get('/api/emergency-state', (req, res) => {
  try {
    if (fs.existsSync(EMERGENCY_STATE_PATH)) {
      const data = JSON.parse(fs.readFileSync(EMERGENCY_STATE_PATH, 'utf8'));
      res.json(data);
    } else {
      res.json({ mesas: null });
    }
  } catch (e) {
    res.json({ mesas: null });
  }
});

  // 10. RESCUE HTML
  app.get('/rescue', (req, res) => {
    const rescuePath = path.join(__dirname, '..', 'rescue.html');
    if (fs.existsSync(rescuePath)) {
      res.sendFile(rescuePath);
    } else {
      res.status(404).send('Tela de resgate não encontrada.');
    }
  });

};
