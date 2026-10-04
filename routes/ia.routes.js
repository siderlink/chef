/**
 * routes/ia.routes.js
 * Módulo de Inteligência Artificial extraído do server.js (linhas 9924–10430, 13648–13710)
 *
 * Depende de:
 *   - iaService  (./ia-service.js)  — injetado via context.iaService
 *   - lerConfigIa / enriquecerCardapio / montarHistoricoVendas — helpers internos
 *
 * Rotas:
 *   GET  /api/ia/config
 *   POST /api/ia/config
 *   POST /api/ia/test-key
 *   POST /api/ia/gerar-promocoes
 *   POST /api/ia/aplicar-promocao
 *   POST /api/ia/gerar-copy
 *   POST /api/ia/consultor
 *   POST /api/ia/pesquisar-estabelecimento-geo
 *   POST /api/ia/extrair-cardapio-fotos  (multipart)
 *   POST /api/ia/cadastrar-produtos-lote
 *   POST /api/ia/pesquisar-google-negocio
 *   POST /api/ia/aplicar-dados-google
 *   POST /api/ia/cupom-rapido
 *   POST /api/ia/interpretar-comando-voz
 */
'use strict';

const { Router } = require('express');
const { getContext } = require('./shared/context');

// ── Helpers de negócio puros ──────────────────────────────────────────────

function lerConfigIa(rows) {
  const m = {};
  (rows || []).forEach(r => { m[r.chave] = r.valor; });
  const apiKey = (m.ia_api_key || process.env.GEMINI_API_KEY || process.env.ANTIGRAVITY_AI_KEY || '').trim();
  return {
    api_key:    apiKey,
    has_key:    apiKey.length > 0,
    ia_model:   m.ia_model || 'gemini-2.0-flash',
    ia_tom_voz: m.ia_tom_voz || 'profissional',
    ia_ativa:   m.ia_ativa !== 'false'
  };
}

function enriquecerCardapio(produtos, compras) {
  return (produtos || []).map(p => {
    const preco  = parseFloat(p.preco)  || 0;
    const custo  = parseFloat(p.preco_custo) || 0;
    const estoque = p.estoque != null ? parseFloat(p.estoque) : null;
    const comprasProd = (compras || []).filter(c => c.produto_id === p.id).sort((a, b) => new Date(b.data_nota) - new Date(a.data_nota));
    const ultimaCompra = comprasProd.length > 0 ? parseFloat(comprasProd[0].valor_unitario) || null : null;
    const variacaoCompra = comprasProd.length > 1
      ? Math.round(((comprasProd[0].valor_unitario - comprasProd[comprasProd.length - 1].valor_unitario) / comprasProd[comprasProd.length - 1].valor_unitario) * 100)
      : null;
    return {
      id: p.id, nome: p.nome, categoria: p.categoria, preco,
      categoria_fiscal: p.categoria_fiscal || 'Alimentacao',
      preco_custo: Math.round(custo * 100) / 100,
      margem_percentual: preco > 0 ? Math.round(((preco - custo) / preco) * 100) : null,
      estoque,
      status_estoque: estoque === null ? 'sem_controle' : (estoque <= 0 ? 'esgotado' : (estoque < 10 ? 'baixo' : 'ok')),
      validade: p.validade || null,
      ultimo_preco_compra: ultimaCompra,
      variacao_preco_compra_90d: variacaoCompra
    };
  });
}

function montarHistoricoVendas(pedidos) {
  const mapa = {};
  let receita = 0;
  (pedidos || []).forEach(p => {
    const nome = p.productName || '';
    if (!nome || nome.includes('Pgto Parcial') || nome.includes('Pagamento') || nome.includes('Pgto QR')) return;
    mapa[nome] = (mapa[nome] || 0) + (parseInt(p.quantity) || 1);
    receita += Math.abs(parseFloat(String(p.total || '0').replace(/[R$\s]/g, '').replace(',', '.')) || 0);
  });
  return {
    total_pedidos:    (pedidos || []).length,
    receita_total_30d: Math.round(receita * 100) / 100,
    mais_vendidos:     Object.entries(mapa).map(([produto, quantidade]) => ({ produto, quantidade })).sort((a, b) => b.quantidade - a.quantidade).slice(0, 8)
  };
}

// ── Router Factory ────────────────────────────────────────────────────────

function createIaRouter() {
  const router = Router();
  const { verificarToken, io, upload, withTenant, masterDb } = getContext();
  const getDb      = () => getContext().getTenantDb();
  const iaService  = getContext().iaService;

  // ── GET /api/ia/config ────────────────────────────────────────────────
  router.get('/config', (req, res) => {
    withTenant(req, () => {
      getDb().all("SELECT chave, valor FROM configuracoes WHERE chave IN ('ia_api_key','ia_model','ia_tom_voz','ia_ativa')", [], (err, rows) => {
        if (err) return res.status(500).json({ ok: false, erro: err.message });
        const cfg = lerConfigIa(rows);
        res.json({ ok: true, config: { has_key: cfg.has_key, masked_key: cfg.has_key ? '••••' + cfg.api_key.slice(-4) : '', ia_model: cfg.ia_model, ia_tom_voz: cfg.ia_tom_voz, ia_ativa: cfg.ia_ativa } });
      });
    });
  });

  // ── POST /api/ia/config ───────────────────────────────────────────────
  router.post('/config', verificarToken, (req, res) => {
    const payload = req.body || {};
    withTenant(req, () => {
      const valores = {};
      if (payload.ia_model) valores.ia_model = String(payload.ia_model);
      if (payload.ia_tom_voz !== undefined) valores.ia_tom_voz = String(payload.ia_tom_voz);
      if (payload.ia_ativa !== undefined) valores.ia_ativa = payload.ia_ativa ? 'true' : 'false';
      const novaChave = (payload.ia_api_key || '').trim();
      if (novaChave && !novaChave.includes('••••')) valores.ia_api_key = novaChave;
      if (!Object.keys(valores).length) return res.json({ ok: false, erro: 'Nenhuma configuração para salvar.' });
      const db = getDb();
      db.serialize(() => {
        db.run('BEGIN TRANSACTION;');
        Object.entries(valores).forEach(([chave, valor]) => {
          db.run('INSERT INTO configuracoes (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor', [chave, valor]);
        });
        db.run('COMMIT;', (err) => {
          if (err) return res.status(500).json({ ok: false, erro: err.message });
          res.json({ ok: true, mensagem: 'Configuração de IA salva com sucesso!' });
        });
      });
    });
  });

  // ── POST /api/ia/test-key ─────────────────────────────────────────────
  router.post('/test-key', verificarToken, (req, res) => {
    const body = req.body || {};
    withTenant(req, () => {
      getDb().all("SELECT chave, valor FROM configuracoes WHERE chave IN ('ia_api_key','ia_model')", [], (err, rows) => {
        if (err) return res.status(500).json({ ok: false, erro: err.message });
        const cfg    = lerConfigIa(rows);
        const apiKey = (body.apiKey && !body.apiKey.includes('••••')) ? String(body.apiKey).trim() : cfg.api_key;
        if (!apiKey) return res.json({ ok: false, erro: 'Informe a chave de API do Gemini para testar.' });
        const model  = (body.model && String(body.model).trim()) || cfg.ia_model;
        iaService.testarApiKey(apiKey, model).then(r => res.json(r.ok ? { ok: true, modelo: r.modelo } : { ok: false, erro: r.erro }));
      });
    });
  });

  // ── POST /api/ia/gerar-promocoes ──────────────────────────────────────
  router.post('/gerar-promocoes', verificarToken, (req, res) => {
    const objetivo = (req.body && req.body.objetivo) || 'Aumentar faturamento e ticket médio';
    withTenant(req, () => {
      const db = getDb();
      db.all('SELECT chave, valor FROM configuracoes', [], (eCfg, rows) => {
        if (eCfg) return res.status(500).json({ ok: false, erro: eCfg.message });
        const cfg = lerConfigIa(rows);
        if (!cfg.has_key) return res.json({ ok: false, erro: 'Chave de API do Gemini não configurada. Salve sua chave na aba "Inteligência de Vendas".' });
        const keys = {};
        (rows || []).forEach(r => { keys[r.chave] = r.valor; });
        const contexto = (keys.nome_restaurante || '').trim() || 'Restaurante / Bar / Lanchonete padrão';
        db.all("SELECT id, nome, categoria, preco, categoria_fiscal, estoque, preco_custo, validade FROM produtos WHERE status != 'inativo'", [], (eP, produtos) => {
          if (eP) return res.status(500).json({ ok: false, erro: eP.message });
          db.all("SELECT productName, quantity, total FROM pedidos WHERE createdAt >= datetime('now','-30 days')", [], (eH, pedidos) => {
            if (eH) return res.status(500).json({ ok: false, erro: eH.message });
            db.all("SELECT ni.produto_id, ni.nome, ni.valor_unitario, nc.data_nota FROM nota_itens ni LEFT JOIN notas_compra nc ON ni.nota_id = nc.id WHERE nc.data_nota >= date('now','-90 days')", [], (eN, compras) => {
              if (eN) return res.status(500).json({ ok: false, erro: eN.message });
              iaService.gerarPromocoesIA({
                apiKey: cfg.api_key, model: cfg.ia_model,
                contextoRestaurante: contexto,
                cardapio: enriquecerCardapio(produtos || [], compras || []),
                historicoVendas: montarHistoricoVendas(pedidos || []),
                comprasRecentes: compras || [], objetivo
              }).then(r => res.json({ ok: true, resultado: r })).catch(e => res.json({ ok: false, erro: e.message }));
            });
          });
        });
      });
    });
  });

  // ── POST /api/ia/aplicar-promocao ─────────────────────────────────────
  router.post('/aplicar-promocao', verificarToken, (req, res) => {
    const p = req.body || {};
    const titulo = String(p.titulo || '').trim();
    if (!titulo) return res.json({ ok: false, erro: 'Título da promoção obrigatório.' });
    const desconto   = Math.round(Math.abs(parseFloat(p.desconto_percentual)) || 0);
    const precoPromo = Math.abs(parseFloat(p.preco)) || 0;
    const envolvidos = Array.isArray(p.produtos_envolvidos) ? p.produtos_envolvidos.filter(Boolean) : [];
    withTenant(req, () => {
      const db = getDb();
      db.all("SELECT nome FROM produtos WHERE status != 'inativo'", [], (eP, prods) => {
        const nomes = (prods || []).map(x => x.nome);
        const alvo  = envolvidos.find(n => nomes.includes(n)) || (nomes.includes(titulo) ? titulo : null);
        const regra = alvo ? 'preco_promocional' : 'combo';
        const config = JSON.stringify({ tipo_promocao: regra, titulo, produto_alvo_nome: alvo, produtos_envolvidos: envolvidos, preco_promocional: precoPromo, desconto_percentual: desconto });
        db.run('INSERT INTO promocoes (nome, regra, desconto, ativo, config) VALUES (?, ?, ?, 1, ?)', [titulo, regra, desconto, config], (errIns) => {
          if (errIns) return res.status(500).json({ ok: false, erro: errIns.message });
          db.all('SELECT * FROM promocoes', [], (eR, rows) => {
            io.emit('promocoes_atualizadas', rows || []);
            io.emit('configuracoes_atualizadas');
            res.json({ ok: true, mensagem: `Promoção "${titulo}" cadastrada no cardápio!` });
          });
        });
      });
    });
  });

  // ── POST /api/ia/gerar-copy ───────────────────────────────────────────
  router.post('/gerar-copy', verificarToken, (req, res) => {
    const body    = req.body || {};
    const canal   = String(body.canal || 'whatsapp');
    const promocao = String(body.promocao || 'Nossos pratos especiais');
    withTenant(req, () => {
      getDb().all("SELECT chave, valor FROM configuracoes WHERE chave IN ('ia_api_key','ia_model','nome_restaurante')", [], (eCfg, rows) => {
        if (eCfg) return res.status(500).json({ ok: false, erro: eCfg.message });
        const cfg  = lerConfigIa(rows);
        const keys = {};
        (rows || []).forEach(r => { keys[r.chave] = r.valor; });
        if (!cfg.has_key) return res.json({ ok: false, erro: 'Chave de API do Gemini não configurada.' });
        getDb().all("SELECT id, nome, categoria, preco FROM produtos WHERE status != 'inativo'", [], (eP, produtos) => {
          if (eP) return res.status(500).json({ ok: false, erro: eP.message });
          iaService.gerarCopyMarketing({ apiKey: cfg.api_key, model: cfg.ia_model, contextoRestaurante: keys.nome_restaurante || '', produtos: (produtos || []).slice(0, 12), promocao, canal })
            .then(r => res.json({ ok: true, resultado: r })).catch(e => res.json({ ok: false, erro: e.message }));
        });
      });
    });
  });

  // ── POST /api/ia/consultor ────────────────────────────────────────────
  router.post('/consultor', verificarToken, (req, res) => {
    const body     = req.body || {};
    const pergunta = String(body.pergunta || '').trim();
    const historico = Array.isArray(body.historico) ? body.historico : [];
    if (!pergunta) return res.json({ ok: false, erro: 'Digite uma pergunta.' });
    withTenant(req, () => {
      const db = getDb();
      db.all("SELECT chave, valor FROM configuracoes WHERE chave IN ('ia_api_key','ia_model','nome_restaurante')", [], (eCfg, rows) => {
        if (eCfg) return res.status(500).json({ ok: false, erro: eCfg.message });
        const cfg  = lerConfigIa(rows);
        const keys = {};
        (rows || []).forEach(r => { keys[r.chave] = r.valor; });
        if (!cfg.has_key) return res.json({ ok: false, erro: 'Chave de API do Gemini não configurada.' });
        db.all("SELECT id, nome, categoria, preco, categoria_fiscal FROM produtos WHERE status != 'inativo'", [], (eP, produtos) => {
          if (eP) return res.status(500).json({ ok: false, erro: eP.message });
          db.all("SELECT productName, quantity, total FROM pedidos WHERE createdAt >= datetime('now','-30 days')", [], (eH, pedidos) => {
            if (eH) return res.status(500).json({ ok: false, erro: eH.message });
            iaService.consultarAssistenteVendas({ apiKey: cfg.api_key, model: cfg.ia_model, contextoRestaurante: keys.nome_restaurante || '', cardapio: produtos || [], historicoVendas: montarHistoricoVendas(pedidos || []), historicoMensagens: historico, pergunta })
              .then(r => res.json({ ok: true, resposta: r.resposta })).catch(e => res.json({ ok: false, erro: e.message }));
          });
        });
      });
    });
  });

  // ── POST /api/ia/pesquisar-estabelecimento-geo ─────────────────────────
  router.post('/pesquisar-estabelecimento-geo', (req, res) => {
    const body = req.body || {};
    const lat  = parseFloat(body.lat);
    const lng  = parseFloat(body.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ ok: false, erro: 'Coordenadas inválidas (lat/lng obrigatórios).' });
    }
    withTenant(req, () => {
      getDb().all("SELECT chave, valor FROM configuracoes WHERE chave IN ('ia_api_key','ia_model')", [], (eCfg, rows) => {
        if (eCfg) return res.status(500).json({ ok: false, erro: eCfg.message });
        const cfg = lerConfigIa(rows || []);
        let apiKey = cfg.api_key;
        let model  = cfg.ia_model;
        const proceed = (k) => {
          if (!apiKey && k) apiKey = k;
          if (!model) {
            masterDb.get("SELECT valor FROM configuracoes_global WHERE chave = 'ia_model'", [], (eMg, rowMg) => {
              iaService.pesquisarEstabelecimentoGeo({ lat, lng, apiKey, model: model || (rowMg && rowMg.valor) })
                .then(r => res.json({ ok: r.ok, tem_ia: !!apiKey, dados: r.dados, erro: r.erro }));
            });
          } else {
            iaService.pesquisarEstabelecimentoGeo({ lat, lng, apiKey, model })
              .then(r => res.json({ ok: r.ok, tem_ia: !!apiKey, dados: r.dados, erro: r.erro }));
          }
        };
        if (!apiKey) {
          masterDb.get("SELECT valor FROM configuracoes_global WHERE chave = 'ia_api_key'", [], (eG, rowG) => proceed(rowG && rowG.valor));
        } else {
          proceed(apiKey);
        }
      });
    });
  });

  // ── POST /api/ia/extrair-cardapio-fotos ──────────────────────────────
  router.post('/extrair-cardapio-fotos', upload.array('fotos', 10), (req, res) => {
    withTenant(req, async () => {
      try {
        const fs   = require('fs');
        const fotos = [];
        if (Array.isArray(req.files) && req.files.length > 0) {
          for (const f of req.files) {
            try {
              const buf = fs.readFileSync(f.path);
              fotos.push({ mimeType: f.mimetype || 'image/jpeg', data: buf.toString('base64') });
              try { fs.unlinkSync(f.path); } catch (_) {}
            } catch (_) {}
          }
        } else if (Array.isArray(req.body && req.body.fotos) && req.body.fotos.length > 0) {
          req.body.fotos.forEach(f => {
            if (typeof f === 'string') fotos.push({ mimeType: 'image/jpeg', data: f });
            else if (f && f.data) fotos.push(f);
          });
        }
        if (!fotos.length) return res.status(400).json({ ok: false, erro: 'Nenhuma foto enviada.' });
        getDb().all("SELECT chave, valor FROM configuracoes WHERE chave IN ('ia_api_key','ia_model')", [], (eCfg, rows) => {
          const cfg = lerConfigIa(rows || []);
          let apiKey = cfg.api_key;
          const model = cfg.ia_model;
          masterDb.get("SELECT valor FROM configuracoes_global WHERE chave = 'ia_api_key'", [], async (eG, rowG) => {
            if (!apiKey && rowG && rowG.valor) apiKey = rowG.valor;
            if (!apiKey) apiKey = process.env.GEMINI_API_KEY || process.env.ANTIGRAVITY_AI_KEY;
            try {
              const resultado = await iaService.extrairCardapioDeFotos({ apiKey, model, fotos });
              res.json({ ok: true, ...resultado });
            } catch (err) {
              res.status(500).json({ ok: false, erro: err.message || 'Falha ao processar imagens.' });
            }
          });
        });
      } catch (e) {
        res.status(500).json({ ok: false, erro: e.message });
      }
    });
  });

  // ── POST /api/ia/cadastrar-produtos-lote ─────────────────────────────
  router.post('/cadastrar-produtos-lote', verificarToken, (req, res) => {
    const body      = req.body || {};
    const produtos  = Array.isArray(body.produtos) ? body.produtos : [];
    const substituir = !!body.substituir;
    if (!produtos.length) return res.status(400).json({ ok: false, erro: 'Nenhum produto para cadastrar.' });
    withTenant(req, () => {
      const db = getDb();
      db.serialize(() => {
        if (substituir) db.run("UPDATE produtos SET ativo = 0, status = 'inativo'");
        let inseridos = 0, erros = 0;
        const stmt = db.prepare(`INSERT INTO produtos (categoria, nome, preco, emoji, hasAddons, setor, status_inicial, status, categoria_fiscal, descricao, preco_custo, unidade, visibilidade, ativo) VALUES (?, ?, ?, ?, 0, ?, 'Em espera', 'ativo', 'Alimentacao', ?, 0, 'UN', 'todos', 1)`);
        produtos.forEach(p => {
          const nome = String(p.nome || '').trim();
          if (!nome) return;
          const categoria = String(p.categoria || 'Geral').trim();
          const preco = Math.abs(parseFloat(String(p.preco || '0').replace(',', '.'))) || 0;
          const setor = (categoria.toLowerCase().includes('bebida') || categoria.toLowerCase().includes('drink') || categoria.toLowerCase().includes('suco') || categoria.toLowerCase().includes('chopp')) ? 'Bar' : 'Cozinha 1';
          stmt.run([categoria, nome, preco, String(p.emoji || '🍽️').trim(), setor, String(p.descricao || '').trim()], err => { if (err) erros++; else inseridos++; });
        });
        stmt.finalize(() => {
          io.emit('produtos_atualizados');
          res.json({ ok: true, inseridos, erros, total: produtos.length, mensagem: `${inseridos} produto(s) cadastrado(s) com sucesso no cardápio!` });
        });
      });
    });
  });

  // ── POST /api/ia/pesquisar-google-negocio ─────────────────────────────
  router.post('/pesquisar-google-negocio', (req, res) => {
    const body  = req.body || {};
    const query = String(body.query || '').trim();
    const lat   = parseFloat(body.lat);
    const lng   = parseFloat(body.lng);
    withTenant(req, () => {
      getDb().all("SELECT chave, valor FROM configuracoes WHERE chave IN ('ia_api_key','ia_model')", [], (eCfg, rows) => {
        const cfg = lerConfigIa(rows || []);
        let apiKey = cfg.api_key;
        const model = cfg.ia_model;
        masterDb.get("SELECT valor FROM configuracoes_global WHERE chave = 'ia_api_key'", [], async (eG, rowG) => {
          if (!apiKey && rowG && rowG.valor) apiKey = rowG.valor;
          if (!apiKey) apiKey = process.env.GEMINI_API_KEY || process.env.ANTIGRAVITY_AI_KEY;
          try {
            const r = await iaService.pesquisarGoogleMeuNegocio({ query, lat, lng, apiKey, model });
            res.json({ ok: r.ok, dados: r.dados, erro: r.erro });
          } catch (err) {
            res.status(500).json({ ok: false, erro: err.message });
          }
        });
      });
    });
  });

  // ── POST /api/ia/aplicar-dados-google ────────────────────────────────
  router.post('/aplicar-dados-google', verificarToken, (req, res) => {
    const body = req.body || {};
    const dados = body.dados || {};
    const importarProdutos = body.importar_produtos !== false;
    withTenant(req, () => {
      const db = getDb();
      db.serialize(() => {
        const configsMap = {};
        const campos = { nome: 'nome_restaurante', endereco: 'rest_endereco', bairro: 'rest_bairro', cidade: 'rest_cidade', telefone: 'rest_telefone', horario_funcionamento: 'rest_horario_funcionamento', avaliacao: 'avaliacao_google', categoria_culinaria: 'rest_modalidade', google_maps_url: 'rest-cupom-google-review' };
        Object.entries(campos).forEach(([src, dest]) => { if (dados[src]) configsMap[dest] = dados[src]; });
        const keys = Object.keys(configsMap);
        if (keys.length > 0) {
          const s = db.prepare('INSERT OR REPLACE INTO configuracoes (chave, valor) VALUES (?, ?)');
          keys.forEach(k => s.run([k, String(configsMap[k])]));
          s.finalize();
        }
        const produtos = importarProdutos && Array.isArray(dados.produtos) ? dados.produtos : [];
        if (produtos.length > 0) {
          const sp = db.prepare(`INSERT INTO produtos (categoria, nome, preco, emoji, hasAddons, setor, status_inicial, status, categoria_fiscal, descricao, preco_custo, unidade, visibilidade, ativo) VALUES (?, ?, ?, ?, 0, ?, 'Em espera', 'ativo', 'Alimentacao', ?, 0, 'UN', 'todos', 1)`);
          let prodsInseridos = 0;
          produtos.forEach(p => {
            const nome = String(p.nome || '').trim();
            if (!nome) return;
            const categoria = String(p.categoria || 'Pratos Principais').trim();
            const preco = Math.abs(parseFloat(String(p.preco || '0').replace(',', '.'))) || 0;
            const setor = (categoria.toLowerCase().includes('bebida') || categoria.toLowerCase().includes('drink')) ? 'Bar' : 'Cozinha 1';
            sp.run([categoria, nome, preco, String(p.emoji || '🍽️'), setor, String(p.descricao || '')], e => { if (!e) prodsInseridos++; });
          });
          sp.finalize(() => {
            io.emit('produtos_atualizados');
            res.json({ ok: true, mensagem: 'Dados e produtos do Google Meu Negócio importados!', produtos_inseridos: prodsInseridos, dados_aplicados: keys.length });
          });
        } else {
          res.json({ ok: true, mensagem: 'Dados do Google Meu Negócio aplicados com sucesso!', dados_aplicados: keys.length });
        }
      });
    });
  });

  // ── POST /api/ia/cupom-rapido ─────────────────────────────────────────
  router.post('/cupom-rapido', verificarToken, (req, res) => {
    const p = req.body || {};
    const titulo = String(p.titulo || 'Promo IA').trim().slice(0, 90);
    const precoOrig   = Math.abs(parseFloat(p.preco_original) || 0);
    const precoPromo  = Math.abs(parseFloat(p.preco_promocional) || 0);
    const valoresDesconto = precoOrig > 0 && precoPromo < precoOrig ? precoOrig - precoPromo : 0;
    const descontoPct = Math.round(Math.abs(parseFloat(p.desconto_percentual) || 0));
    const valorCupom  = valoresDesconto > 0 ? Math.round(valoresDesconto * 100) / 100 : (precoPromo || descontoPct);
    const valorTipo   = valoresDesconto > 0 ? 'desconto_fixo' : (precoPromo > 0 ? 'preco_fixo' : 'percentual');
    const validadeDias = Math.max(parseInt(p.validade_dias, 10) || 7, 1);
    const produtos = Array.isArray(p.produtos_envolvidos) ? p.produtos_envolvidos.filter(Boolean).slice(0, 12) : [];
    const codigo  = ('PROMO-' + (String(p.codigo || '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 12) || Math.random().toString(36).substring(2, 8).toUpperCase()));
    withTenant(req, () => {
      const validade = new Date(Date.now() + validadeDias * 86400000).toISOString().slice(0, 10);
      const itens = produtos.map(nome => ({ nome, emoji: '🎁', sector: 'IA', quantity: 1 }));
      getDb().run(
        `INSERT INTO cupons (codigo, titulo, valor_tipo, valor, validade, limite_usos, itens_json, dias_horarios_json, data_criacao) VALUES (?, ?, ?, ?, ?, 1, ?, '{}', datetime('now', 'localtime')) ON CONFLICT(codigo) DO NOTHING`,
        [codigo, titulo, valorTipo, valorCupom, validade, JSON.stringify(itens)],
        function (errIns) {
          if (errIns) return res.status(500).json({ ok: false, erro: errIns.message });
          if (this.changes === 0) return res.json({ ok: false, erro: `Já existe um cupom com o código ${codigo}.` });
          io.emit('cupons_atualizados');
          res.json({ ok: true, mensagem: `Cupom ${codigo} criado com QR Code!`, codigo, titulo, valor_tipo: valorTipo, valor: valorCupom });
        }
      );
    });
  });

  // ── POST /api/ia/interpretar-comando-voz ─────────────────────────────
  router.post('/interpretar-comando-voz', (req, res) => {
    const { texto, audio_transcrito } = req.body || {};
    const fala = (texto || audio_transcrito || '').trim();
    if (!fala) return res.status(400).json({ ok: false, erro: 'Texto do comando de voz obrigatório.' });
    withTenant(req, () => {
      const db = getDb();
      db.all("SELECT chave, valor FROM configuracoes WHERE chave IN ('ia_api_key','ia_model')", [], (eCfg, rows) => {
        const cfg = lerConfigIa(rows || []);
        let apiKey = cfg.api_key;
        const model = cfg.ia_model;
        masterDb.get("SELECT valor FROM configuracoes_global WHERE chave = 'ia_api_key'", [], async (eG, rowG) => {
          if (!apiKey && rowG && rowG.valor) apiKey = rowG.valor;
          if (!apiKey) apiKey = process.env.GEMINI_API_KEY || process.env.ANTIGRAVITY_AI_KEY;
          db.all("SELECT id, nome, categoria, preco FROM produtos WHERE status != 'inativo'", [], async (eP, produtos) => {
            try {
              const r = await iaService.interpretarComandoVoz({ fala, apiKey, model, produtos: produtos || [] });
              res.json({ ok: true, ...r });
            } catch (err) {
              res.status(500).json({ ok: false, erro: err.message });
            }
          });
        });
      });
    });
  });

  return router;
}

module.exports = { createIaRouter, lerConfigIa, enriquecerCardapio, montarHistoricoVendas };
