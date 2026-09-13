/**
 * plugin: caixa — Máquinas, Backup/Restore, Totem, Mesa Perfil, Sugestões, Clientes
 * Extraído de server.js: endpoints REST do módulo caixa/POS
 */
const fs = require('fs');
const fsSync = require('fs');
const path = require('path');
const sqlite3 = require('./sqlite3-wrapper').verbose();

module.exports = function({ app, db, io, options }) {
  const { verificarToken, withTenant, upload, getTenantDbPath, tenantDbs, isTenantFeatureEnabled, tenantContext } = options;

  // ── TESTE DE CONEXÃO COM MAQUININHA ──
  app.post('/api/maquininha/testar', (req, res) => {
    const { provedor } = req.body || {};
    if (!provedor || provedor === 'none') {
      return res.json({ ok: false, msg: 'Nenhum provedor selecionado.' });
    }
    withTenant(req, () => {
      db.all(`SELECT * FROM configuracoes`, async (err, rows) => {
        if (err) return res.json({ ok: false, msg: 'Erro ao carregar configurações.' });
        const config = {};
        if (rows) rows.forEach(r => config[r.chave] = r.valor);
        try {
          if (provedor === 'mercadopago') {
            const token = config.mp_access_token;
            const deviceId = config.mp_device_id;
            if (!token || !deviceId) return res.json({ ok: false, msg: 'Access Token ou Device ID não configurados.' });
            const response = await fetch(`https://api.mercadopago.com/point/integration-api/devices/${deviceId}`, {
              headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
              const data = await response.json();
              return res.json({ ok: true, msg: `Mercado Pago OK — Device: ${data.id || deviceId} | Modo: ${data.operating_mode || 'online'}` });
            } else {
              const errData = await response.json().catch(() => ({}));
              return res.json({ ok: false, msg: `Mercado Pago: ${errData.message || 'HTTP ' + response.status}` });
            }
          }
          if (provedor === 'stone') {
            const stonePorta = config.stone_porta || '8080';
            const stoneCode = config.stone_stonecode;
            if (!stoneCode) return res.json({ ok: false, msg: 'Stone Code não configurado.' });
            const response = await fetch(`http://localhost:${stonePorta}/health`, { signal: AbortSignal.timeout(5000) });
            if (response.ok) {
              return res.json({ ok: true, msg: `Stone Client TEF respondeu na porta ${stonePorta}. Stone Code: ${stoneCode}` });
            } else {
              return res.json({ ok: false, msg: `Stone Client respondeu com HTTP ${response.status}` });
            }
          }
          if (provedor === 'pagbank') {
            const pgToken = config.pagbank_token;
            const pgTerminal = config.pagbank_terminal;
            if (!pgToken) return res.json({ ok: false, msg: 'Token PagBank não configurado.' });
            const response = await fetch(`https://api.pagseguro.com/terminal/v1/terminals/${pgTerminal || ''}`, {
              headers: { 'Authorization': `Bearer ${pgToken}` }
            });
            if (response.ok) {
              const data = await response.json();
              return res.json({ ok: true, msg: `PagBank OK — Terminal: ${data.id || pgTerminal} | Status: ${data.status || 'online'}` });
            } else {
              const errData = await response.json().catch(() => ({}));
              return res.json({ ok: false, msg: `PagBank: ${errData.message || errData.error || 'HTTP ' + response.status}` });
            }
          }
          if (provedor === 'sitef') {
            const sitefIp = config.sitef_ip;
            const sitefPorta = parseInt(config.sitef_porta || '4096');
            if (!sitefIp) return res.json({ ok: false, msg: 'IP do servidor SiTef não configurado.' });
            const net = require('net');
            await new Promise((resolve) => {
              const socket = new net.Socket();
              socket.setTimeout(5000);
              socket.connect(sitefPorta, sitefIp, () => {
                socket.destroy();
                res.json({ ok: true, msg: `SiTef: conexão TCP OK com ${sitefIp}:${sitefPorta}` });
                resolve();
              });
              socket.on('timeout', () => { socket.destroy(); res.json({ ok: false, msg: `SiTef: timeout ao conectar em ${sitefIp}:${sitefPorta}` }); resolve(); });
              socket.on('error', (err) => { res.json({ ok: false, msg: `SiTef: ${err.message}` }); resolve(); });
            });
            return;
          }
          return res.json({ ok: false, msg: `Provedor desconhecido: ${provedor}` });
        } catch (e) {
          return res.json({ ok: false, msg: `Erro ao testar: ${e.message}` });
        }
      });
    });
  });

  // ── BACKUP & RESTORE ──
  app.get('/api/backup', verificarToken, (req, res) => {
    const tid = req.restaurante_id || 1;
    const tenantDbPath = getTenantDbPath(tid);
    if (!fsSync.existsSync(tenantDbPath)) {
      return res.status(404).json({ success: false, error: 'Banco do restaurante não encontrado.' });
    }
    res.download(tenantDbPath, 'backup_restaurante_' + tid + '.sqlite', (err) => {
      if (err) {
        console.error("Erro no download do backup:", err);
        if (!res.headersSent) {
          res.status(500).send("Erro ao gerar backup: " + err.message);
        }
      }
    });
  });

  app.post('/api/restore', verificarToken, upload.single('backup'), (req, res) => {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Nenhum arquivo enviado.' });
    }
    const tempFilePath = req.file.path;
    const testDb = new sqlite3(tempFilePath, sqlite3.OPEN_READONLY, (testErr) => {
      if (testErr) {
        console.error("Arquivo de backup inválido (sqlite open):", testErr);
        try { fs.unlinkSync(tempFilePath); } catch (e) { }
        return res.json({ success: false, error: 'O arquivo enviado não é um banco de dados SQLite válido.' });
      }
      testDb.get("SELECT name FROM sqlite_master WHERE type='table' LIMIT 1", [], (queryErr, row) => {
        testDb.close();
        if (queryErr) {
          console.error("Arquivo de backup inválido (sqlite query):", queryErr);
          try { fs.unlinkSync(tempFilePath); } catch (e) { }
          return res.json({ success: false, error: 'O arquivo de banco de dados enviado está corrompido ou é inválido.' });
        }
        const tid = req.restaurante_id || 1;
        const tenantDbPath = getTenantDbPath(tid);
        db.close((closeErr) => {
          if (closeErr) {
            console.error("Erro ao fechar o banco de dados para restore:", closeErr);
            try { fs.unlinkSync(tempFilePath); } catch (e) { }
            return res.json({ success: false, error: 'Erro ao fechar banco de dados atual.' });
          }
          try {
            fs.copyFileSync(tempFilePath, tenantDbPath);
            try { fs.unlinkSync(tempFilePath); } catch (e) { }
            tenantDbs.delete(tid);
            const freshDb = new sqlite3(tenantDbPath, (openErr) => {
              if (openErr) {
                console.error("Erro ao reabrir banco restaurado:", openErr);
                return res.json({ success: false, error: 'Erro ao conectar ao banco restaurado.' });
              }
              console.log("Banco de dados restaurado com sucesso!");
              io.emit('configuracoes_atualizadas');
              freshDb.all(`SELECT * FROM produtos`, (errProd, pRows) => {
                if (!errProd) io.emit('produtos_atualizados', pRows || []);
              });
              freshDb.all(`SELECT * FROM mesas`, (errMesa, mRows) => {
                if (!errMesa) io.emit('mesas_atualizadas', mRows || []);
              });
              res.json({ success: true });
            });
          } catch (copyErr) {
            console.error("Erro ao copiar arquivo restaurado:", copyErr);
            try { fs.unlinkSync(tempFilePath); } catch (e) { }
            res.json({ success: false, error: 'Erro de E/S ao substituir o banco de dados.' });
          }
        });
      });
    });
  });

  // ── TOTEM: status + personalização ──
  app.get('/api/totem/status', (req, res) => {
    withTenant(req, () => {
      const tid = tenantContext.getStore() || 1;
      const featureAtiva = isTenantFeatureEnabled(tid, 'totem');
      db.all(`SELECT chave, valor FROM configuracoes WHERE chave LIKE 'totem_%'`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Erro ao ler configurações do totem.' });
        const cfg = {};
        (rows || []).forEach(r => { cfg[r.chave] = r.valor; });
        const enabledDono = cfg.totem_enabled === 'true';
        let slides = [];
        try { slides = JSON.parse(cfg.totem_slides_json || '[]'); } catch (e) { slides = []; }
        if (!Array.isArray(slides)) slides = [];
        res.json({
          feature_ativa: !!featureAtiva,
          enabled: enabledDono,
          ativo: !!featureAtiva && enabledDono,
          mesa: cfg.totem_mesa || 'Totem 1',
          idle_timeout_min: parseInt(cfg.totem_idle_timeout, 10) || 45,
          personalizacao: {
            titulo: cfg.totem_home_titulo || 'Bem-vindo!',
            subtitulo: cfg.totem_home_subtitulo || 'Toque em qualquer lugar para montar seu pedido',
            cor: cfg.totem_home_cor || '#fc4b15',
            fundo_tipo: cfg.totem_home_fundo_tipo || 'gradiente',
            fundo_valor: cfg.totem_home_fundo_valor || '#0f172a,#293548',
            logo: cfg.totem_home_logo || '',
            layout: ['classico', 'split', 'minimal', 'vitrine'].includes(cfg.totem_home_layout) ? cfg.totem_home_layout : 'classico',
            secoes: {
              destaques: cfg.totem_sec_destaques !== 'false',
              categorias: cfg.totem_sec_categorias !== 'false',
              card: {
                emoji: cfg.totem_card_emoji || '',
                titulo: cfg.totem_card_titulo || '',
                texto: cfg.totem_card_texto || '',
                imagem: cfg.totem_card_imagem || '',
                categoria: cfg.totem_card_categoria || ''
              }
            },
            screensaver: {
              enabled: cfg.totem_screensaver_enabled !== 'false',
              segundos: Math.max(5, parseInt(cfg.totem_screensaver_segundos, 10) || 20),
              slides: slides.filter(s => s && (s.imagem || s.titulo))
            }
          }
        });
      });
    });
  });

  // ── MESA PERFIL ──
  app.get('/api/mesa-perfil/:mesa_nome', (req, res) => {
    const mesa_nome = req.params.mesa_nome;
    withTenant(req, () => {
      db.all("SELECT id, userName, productName, quantity, total, createdAt, localName, status FROM pedidos WHERE localName = ? ORDER BY id DESC LIMIT 300", [mesa_nome], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        let clientes_recentes = [];
        let itemCounts = {};
        let soma = 0;
        let clienteConsumo = {};
        let abertaEm = null;
        (rows || []).forEach(r => {
          const isPagamento = r.productName && (String(r.productName).includes('Pgto Parcial') || String(r.productName).includes('Pagamento'));
          if (isPagamento) return;
          if (r.userName && r.userName.trim() !== '' && r.userName.toLowerCase() !== 'cliente padrão') {
            if (!clientes_recentes.includes(r.userName)) clientes_recentes.push(r.userName);
          }
          soma += parseFloat(r.total) || 0;
          if (r.productName) {
            const qty = parseInt(r.quantity) || 1;
            itemCounts[r.productName] = (itemCounts[r.productName] || 0) + qty;
          }
          const cliente = (r.userName && r.userName.trim() !== '' && r.userName.toLowerCase() !== 'cliente padrão')
            ? r.userName.trim() : 'Cliente Padrão';
          if (!clienteConsumo[cliente]) clienteConsumo[cliente] = { nome: cliente, valor: 0, pedidos: 0 };
          clienteConsumo[cliente].valor += parseFloat(r.total) || 0;
          clienteConsumo[cliente].pedidos++;
        });
        let mais_pedidos = Object.keys(itemCounts).map(nome => ({ nome, qty: itemCounts[nome] }));
        mais_pedidos.sort((a, b) => b.qty - a.qty);
        mais_pedidos = mais_pedidos.slice(0, 5);
        const clientes_detalhe = Object.values(clienteConsumo)
          .sort((a, b) => b.valor - a.valor)
          .slice(0, 10);
        const count = (rows && rows.length) ? rows.length : 0;
        const media = count > 0 ? soma / count : 0;
        try {
          const abertos = (rows || []).filter(r => !['Finalizado', 'Pago', 'Cancelado', 'Entregue'].includes(r.status));
          const fonte = (abertos.length > 0 ? abertos : rows || []).slice(-1)[0];
          if (fonte && fonte.createdAt) abertaEm = fonte.createdAt;
        } catch (e) { }
        res.json({
          mesa: mesa_nome,
          clientes_recentes: clientes_recentes.slice(0, 5),
          mais_pedidos,
          media_valor: media,
          total_pedidos: count,
          aberta_em: abertaEm,
          clientes_detalhe
        });
      });
    });
  });

  // ── SUGESTÕES DE PROMOÇÕES (INTELIGÊNCIA DE VENDAS) ──
  app.get('/api/sugestoes-promocao', (req, res) => {
    withTenant(req, () => {
      db.all(`SELECT productName, SUM(quantity) as qty FROM pedidos WHERE createdAt >= datetime('now', '-7 days') GROUP BY productName`, (err, vendidos) => {
        if (err) return res.status(500).json({ error: err.message });
        let vended = {};
        (vendidos || []).forEach(r => {
          if (r.productName) vended[r.productName] = (vended[r.productName] || 0) + (parseInt(r.qty) || 1);
        });
        db.all("SELECT nome, preco FROM produtos", (err2, produtos) => {
          if (err2) return res.status(500).json({ error: err2.message });
          let obsoletos = [];
          let vendidosArr = [];
          produtos.forEach(prod => {
            if (!vended[prod.nome]) {
              obsoletos.push(prod);
            } else {
              vendidosArr.push({ nome: prod.nome, qty: vended[prod.nome], preco: prod.preco });
            }
          });
          vendidosArr.sort((a, b) => b.qty - a.qty);
          let tendencias = vendidosArr.slice(0, 5);
          let sugestoes = [];
          if (tendencias.length > 0 && obsoletos.length > 0) {
            let top = tendencias[0];
            let obs = obsoletos[0];
            sugestoes.push({
              tipo: 'combo',
              titulo: 'Combo de Alta Conversão',
              descricao: `Crie um combo oferecendo '${top.nome}' (tendência) junto com '${obs.nome}' (baixa saída) com um leve desconto. Isso ajudará a girar o estoque do item obsoleto!`
            });
          }
          if (obsoletos.length > 1) {
            sugestoes.push({
              tipo: 'obsoleto',
              titulo: 'Alerta de Baixa Saída',
              descricao: `Os itens '${obsoletos[0].nome}' e '${obsoletos[1].nome}' não tiveram saídas nos últimos 7 dias. Considere criar uma promoção de "Compre 1 e Leve 2" ou dar como brinde em pedidos acima de um valor X.`
            });
          }
          if (tendencias.length > 1) {
            sugestoes.push({
              tipo: 'tendencia',
              titulo: 'Tendência de Vendas',
              descricao: `Aproveite a alta demanda de '${tendencias[0].nome}' e '${tendencias[1].nome}'. Você pode aumentar sutilmente a margem de lucro ou criar variações Premium desses produtos.`
            });
          }
          if (sugestoes.length === 0) {
            sugestoes.push({
              tipo: 'info',
              titulo: 'Dados Insuficientes',
              descricao: 'Ainda não há dados suficientes nos últimos 7 dias para gerar sugestões precisas. Continue registrando as vendas!'
            });
          }
          res.json({ obsoletos: obsoletos.slice(0, 5), tendencias, sugestoes });
        });
      });
    });
  });

  // ── CLIENTES: preferência de mesa ──
  app.get('/api/clientes/preferencia-mesa', (req, res) => {
    const cid = parseInt(req.query.cliente_id, 10);
    if (!cid) return res.json({ ok: false });
    db.get(`SELECT visitas_mesa FROM clientes WHERE id = ?`, [cid], (err, c) => {
      if (err || !c || !c.visitas_mesa) return res.json({ ok: true, mesa: null });
      try {
        const vm = JSON.parse(c.visitas_mesa) || {};
        const top = Object.entries(vm).sort((a, b) => b[1] - a[1])[0];
        res.json({ ok: true, mesa: top ? top[0] : null, visitas: top ? top[1] : 0 });
      } catch (e) { res.json({ ok: true, mesa: null }); }
    });
  });

  // ── CLIENTES: busca rápida por CPF/telefone/nome (tela fechamento caixa) ──
  app.get('/api/clientes/buscar-doc', (req, res) => {
    const q = String(req.query.q || '').trim();
    const digitos = q.replace(/\D/g, '');
    if (!q || q.length < 3) return res.json({ ok: true, clientes: [] });
    db.all(`SELECT id, nome, telefone, cpf, pontos, nivel FROM clientes ORDER BY nome LIMIT 5000`, [], (err, rows) => {
      if (err) return res.json({ ok: false, erro: err.message, clientes: [] });
      const termo = q.toLowerCase();
      const achados = (rows || []).filter(c => {
        const telDig = String(c.telefone || '').replace(/\D/g, '');
        const cpfDig = String(c.cpf || '').replace(/\D/g, '');
        if (digitos.length >= 3 && (cpfDig.endsWith(digitos) || cpfDig.startsWith(digitos))) return true;
        if (digitos.length >= 3 && (telDig.endsWith(digitos) || telDig === digitos)) return true;
        if (!digitos && String(c.nome || '').toLowerCase().includes(termo)) return true;
        return false;
      }).slice(0, 6);
      res.json({ ok: true, clientes: achados });
    });
  });
};
