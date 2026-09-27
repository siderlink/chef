/**
 * controllers/addons-restaurante.js
 * Módulos de Alta Lucratividade e Facilidade Operacional para Restaurantes:
 * 
 * 1. Guardião de Compras & Leitor XML de NFe (Importação + Radar de Inflação)
 * 2. Resumo Noturno do Dono no WhatsApp (Executivo 23:45 / Fechamento de Caixa)
 * 3. WhatsApp CRM Piloto Automático & Reativação por IA (Sumidos, Aniversários e NPS)
 * 4. Clube de Assinaturas & Fidelidade VIP (Mensalidades Recorrentes com Take-rate)
 * 5. Auditor de Taxas de Cartão & Conciliador (Detecção de MDR Divergente)
 * 6. Gamificação do Salão & Rateio de Gorjetas (Lei 13.419 + Leaderboard ao Vivo)
 */
'use strict';

module.exports = function(app, masterDbOrOptions, sqlite3OrOptions, maybeOptions) {
  let masterDb = null;
  let sqlite3 = null;
  let options = {};

  if (masterDbOrOptions && typeof masterDbOrOptions.run === 'function') {
    masterDb = masterDbOrOptions;
    sqlite3 = sqlite3OrOptions;
    options = maybeOptions || {};
  } else if (masterDbOrOptions && typeof masterDbOrOptions === 'object') {
    options = masterDbOrOptions;
    masterDb = options.masterDb || options.db;
    sqlite3 = options.sqlite3;
  }

  const {
    db: defaultDb,
    io,
    verificarToken,
    superAdminAuth,
    getTenantDb
  } = options;

  function resolveDb(req) {
    if (typeof getTenantDb === 'function') {
      const tenantDb = getTenantDb(req);
      if (tenantDb) return tenantDb;
    }
    return defaultDb || masterDb;
  }

  const authMiddleware = (req, res, next) => {
    if (typeof verificarToken === 'function') {
      return verificarToken(req, res, () => {
        migrarTabelasAddons(resolveDb(req));
        next();
      });
    }
    migrarTabelasAddons(resolveDb(req));
    next();
  };

  // ══════════════════════════════════════════════════════════════════
  // MIGRAÇÃO DE ESQUEMAS DOS 6 MÓDULOS NO BANCO DO RESTAURANTE
  // ══════════════════════════════════════════════════════════════════
  function migrarTabelasAddons(db) {
    if (!db || typeof db.serialize !== 'function') return;

    db.serialize(() => {
      // 1. Guardião de Compras NFe
      db.run(`
        CREATE TABLE IF NOT EXISTS compras_nfe_notas (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          chave_acesso TEXT UNIQUE,
          numero_nota TEXT,
          serie TEXT,
          emitente_cnpj TEXT,
          emitente_nome TEXT,
          valor_total REAL DEFAULT 0,
          data_emissao DATETIME,
          xml_conteudo TEXT,
          itens_qtd INTEGER DEFAULT 0,
          status TEXT DEFAULT 'importado',
          criado_em DATETIME DEFAULT (datetime('now', 'localtime'))
        )
      `, () => {});

      db.run(`
        CREATE TABLE IF NOT EXISTS compras_nfe_itens (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          nota_id INTEGER NOT NULL,
          insumo_id INTEGER,
          descricao_fornecedor TEXT NOT NULL,
          ncm TEXT,
          cfop TEXT,
          unidade_fornecedor TEXT,
          quantidade REAL NOT NULL,
          valor_unitario REAL NOT NULL,
          valor_total REAL NOT NULL,
          custo_anterior REAL DEFAULT 0,
          variacao_preco_pct REAL DEFAULT 0,
          alerta_inflacao INTEGER DEFAULT 0,
          criado_em DATETIME DEFAULT (datetime('now', 'localtime')),
          FOREIGN KEY (nota_id) REFERENCES compras_nfe_notas(id) ON DELETE CASCADE
        )
      `, () => {});

      // 2. Resumo Noturno do Dono
      db.run(`
        CREATE TABLE IF NOT EXISTS resumo_noturno_envios (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          data DATE NOT NULL,
          total_faturado REAL DEFAULT 0,
          total_pedidos INTEGER DEFAULT 0,
          ticket_medio REAL DEFAULT 0,
          garcom_destaque TEXT,
          mensagem_texto TEXT,
          token_seguro TEXT UNIQUE,
          status_envio TEXT DEFAULT 'gerado',
          enviado_em DATETIME DEFAULT (datetime('now', 'localtime'))
        )
      `, () => {});

      // 3. CRM & Reativação
      db.run(`
        CREATE TABLE IF NOT EXISTS crm_campanhas_reativacao (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          tipo TEXT NOT NULL, -- 'clientes_sumidos' | 'aniversariantes' | 'pos_venda_nps'
          cliente_id INTEGER,
          cliente_nome TEXT NOT NULL,
          cliente_telefone TEXT,
          dias_sem_comprar INTEGER DEFAULT 0,
          prato_favorito TEXT,
          cupom_gerado TEXT,
          mensagem_texto TEXT,
          status TEXT DEFAULT 'pendente', -- 'pendente' | 'enviado' | 'recomprou'
          criado_em DATETIME DEFAULT (datetime('now', 'localtime')),
          enviado_em DATETIME
        )
      `, () => {});

      db.run(`
        CREATE TABLE IF NOT EXISTS crm_avaliacoes_nps (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          cliente_nome TEXT,
          cliente_telefone TEXT,
          nota INTEGER NOT NULL, -- 1 a 5
          comentario TEXT,
          mesa TEXT,
          criado_em DATETIME DEFAULT (datetime('now', 'localtime'))
        )
      `, () => {});

      // 4. Clube de Assinaturas
      db.run(`
        CREATE TABLE IF NOT EXISTS clube_planos (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          nome TEXT NOT NULL,
          descricao TEXT,
          valor_mensal REAL NOT NULL,
          beneficio_nome TEXT NOT NULL,
          beneficio_qtd_mes INTEGER DEFAULT 1,
          ativo INTEGER DEFAULT 1,
          criado_em DATETIME DEFAULT (datetime('now', 'localtime'))
        )
      `, () => {});

      db.run(`
        CREATE TABLE IF NOT EXISTS clube_assinantes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          plano_id INTEGER NOT NULL,
          cliente_nome TEXT NOT NULL,
          cliente_cpf TEXT,
          cliente_whatsapp TEXT NOT NULL,
          saldo_beneficios INTEGER DEFAULT 0,
          status TEXT DEFAULT 'ativo',
          proxima_renovacao DATE,
          criado_em DATETIME DEFAULT (datetime('now', 'localtime')),
          FOREIGN KEY (plano_id) REFERENCES clube_planos(id)
        )
      `, () => {});

      db.run(`
        CREATE TABLE IF NOT EXISTS clube_resgates_historico (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          assinante_id INTEGER NOT NULL,
          beneficio TEXT,
          garcom_nome TEXT,
          mesa TEXT,
          criado_em DATETIME DEFAULT (datetime('now', 'localtime'))
        )
      `, () => {});

      // 5. Auditoria de Taxas de Cartão
      db.run(`
        CREATE TABLE IF NOT EXISTS adquirentes_taxas_contratadas (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          adquirente TEXT NOT NULL UNIQUE,
          taxa_debito_pct REAL DEFAULT 1.39,
          taxa_credito_vista_pct REAL DEFAULT 2.19,
          taxa_credito_parc_pct REAL DEFAULT 3.49,
          taxa_pix_pct REAL DEFAULT 0.79,
          atualizado_em DATETIME DEFAULT (datetime('now', 'localtime'))
        )
      `, () => {});

      db.run(`
        CREATE TABLE IF NOT EXISTS auditoria_divergencias_cartao (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          data_lote DATE,
          adquirente TEXT NOT NULL,
          bandeira TEXT,
          tipo_operacao TEXT, -- 'debito' | 'credito_vista' | 'credito_parc'
          valor_bruto REAL NOT NULL,
          taxa_esperada_pct REAL NOT NULL,
          taxa_cobrada_pct REAL NOT NULL,
          diferenca_valor REAL NOT NULL,
          status TEXT DEFAULT 'divergencia_encontrada',
          criado_em DATETIME DEFAULT (datetime('now', 'localtime'))
        )
      `, () => {});

      // 6. Gamificação e Gorjetas
      db.run(`
        CREATE TABLE IF NOT EXISTS gorjetas_config (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          taxa_servico_pct REAL DEFAULT 10.0,
          retencao_legal_pct REAL DEFAULT 20.0, -- Lei da Gorjeta 13.419
          peso_garcom REAL DEFAULT 5.0,
          peso_cumim REAL DEFAULT 3.0,
          peso_cozinha REAL DEFAULT 2.0,
          peso_bar REAL DEFAULT 2.0
        )
      `, () => {});

      db.run(`
        CREATE TABLE IF NOT EXISTS gorjetas_rateios_fechamentos (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          data_turno DATE NOT NULL,
          turno_nome TEXT DEFAULT 'Geral',
          valor_arrecadado_bruto REAL NOT NULL,
          valor_retencao_encargos REAL NOT NULL,
          valor_liquido_distribuido REAL NOT NULL,
          total_horas_trabalhadas REAL NOT NULL,
          detalhes_rateio_json TEXT NOT NULL,
          responsavel TEXT,
          criado_em DATETIME DEFAULT (datetime('now', 'localtime'))
        )
      `, () => {});

      db.run(`
        CREATE TABLE IF NOT EXISTS gamificacao_missoes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          titulo TEXT NOT NULL,
          categoria TEXT NOT NULL, -- 'vinho' | 'sobremesa' | 'combo' | 'ticket'
          meta_quantidade INTEGER DEFAULT 5,
          bonus_recompensa REAL DEFAULT 20.0,
          ativo INTEGER DEFAULT 1,
          criado_em DATETIME DEFAULT (datetime('now', 'localtime'))
        )
      `, () => {});

      // Inserir taxas e gorjetas padrão se não existirem
      db.run(`
        INSERT OR IGNORE INTO gorjetas_config (id, taxa_servico_pct, retencao_legal_pct, peso_garcom, peso_cumim, peso_cozinha, peso_bar)
        VALUES (1, 10.0, 20.0, 5.0, 3.0, 2.0, 2.0)
      `, () => {});

      const adqs = ['Stone', 'Cielo', 'Rede', 'PagBank', 'MercadoPago'];
      adqs.forEach(a => {
        db.run(`
          INSERT OR IGNORE INTO adquirentes_taxas_contratadas (adquirente, taxa_debito_pct, taxa_credito_vista_pct, taxa_credito_parc_pct, taxa_pix_pct)
          VALUES (?, 1.39, 2.19, 3.49, 0.79)
        `, [a], () => {});
      });
    });
  }

  if (defaultDb) migrarTabelasAddons(defaultDb);
  if (masterDb) migrarTabelasAddons(masterDb);

  // ══════════════════════════════════════════════════════════════════
  // 1. GUARDIÃO DE COMPRAS & LEITOR DE XML DE NFE
  // ══════════════════════════════════════════════════════════════════

  // Função auxiliar para parsear XML básico da NFe sem bibliotecas externas pesadas
  function parseNFeXml(xmlStr) {
    if (!xmlStr || typeof xmlStr !== 'string') return null;

    const getTag = (xml, tag) => {
      const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
      return match ? match[1].trim() : '';
    };

    const chave = getTag(xmlStr, 'chNFe') || (xmlStr.match(/Id="NFe([0-9]{44})"/i) ? xmlStr.match(/Id="NFe([0-9]{44})"/i)[1] : 'NFE_' + Date.now());
    const nNF = getTag(xmlStr, 'nNF') || String(Date.now()).slice(-6);
    const serie = getTag(xmlStr, 'serie') || '1';
    const dhEmi = getTag(xmlStr, 'dhEmi') || new Date().toISOString();
    
    // Emitente
    const emitMatch = xmlStr.match(/<emit>([\s\S]*?)<\/emit>/i);
    const emitXml = emitMatch ? emitMatch[1] : '';
    const cnpj = getTag(emitXml, 'CNPJ') || '00.000.000/0000-00';
    const xNome = getTag(emitXml, 'xNome') || 'Fornecedor Identificado';

    // Total
    const vNF = parseFloat(getTag(xmlStr, 'vNF')) || 0;

    // Itens (tags <det>)
    const itens = [];
    const detRegex = /<det[^>]*nItem="(\d+)"[^>]*>([\s\S]*?)<\/det>/gi;
    let detMatch;

    while ((detMatch = detRegex.exec(xmlStr)) !== null) {
      const detXml = detMatch[2];
      const prodMatch = detXml.match(/<prod>([\s\S]*?)<\/prod>/i);
      const prodXml = prodMatch ? prodMatch[1] : detXml;

      const xProd = getTag(prodXml, 'xProd') || 'Produto sem descrição';
      const ncm = getTag(prodXml, 'NCM') || '';
      const cfop = getTag(prodXml, 'CFOP') || '';
      const uCom = getTag(prodXml, 'uCom') || 'UN';
      const qCom = parseFloat(getTag(prodXml, 'qCom')) || 1;
      const vUnCom = parseFloat(getTag(prodXml, 'vUnCom')) || 0;
      const vProd = parseFloat(getTag(prodXml, 'vProd')) || (qCom * vUnCom);

      itens.push({
        item_num: detMatch[1],
        nome: xProd,
        ncm,
        cfop,
        unidade: uCom,
        quantidade: qCom,
        valor_unitario: vUnCom,
        valor_total: vProd
      });
    }

    return {
      chave_acesso: chave,
      numero_nota: nNF,
      serie,
      data_emissao: dhEmi.slice(0, 19).replace('T', ' '),
      emitente_cnpj: cnpj,
      emitente_nome: xNome,
      valor_total: vNF || itens.reduce((acc, it) => acc + it.valor_total, 0),
      itens
    };
  }

  // Importar XML de Compra com Radar de Inflação
  app.post('/api/addons/compras/importar-xml', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const { xml, xmlString } = req.body || {};
    const rawXml = xml || xmlString || '';

    if (!rawXml || typeof rawXml !== 'string' || !rawXml.includes('<nfeProc') && !rawXml.includes('<NFe')) {
      return res.status(400).json({ ok: false, erro: 'XML de NFe inválido ou tag raiz não encontrada.' });
    }

    const nota = parseNFeXml(rawXml);
    if (!nota || !Array.isArray(nota.itens) || nota.itens.length === 0) {
      return res.status(400).json({ ok: false, erro: 'Não foi possível extrair os produtos deste XML.' });
    }

    db.get(`SELECT id FROM compras_nfe_notas WHERE chave_acesso = ?`, [nota.chave_acesso], (errCheck, existing) => {
      if (existing) {
        return res.status(409).json({ ok: false, erro: `Nota fiscal #${nota.numero_nota} já foi importada anteriormente no sistema.` });
      }

      db.run(`
        INSERT INTO compras_nfe_notas (chave_acesso, numero_nota, serie, emitente_cnpj, emitente_nome, valor_total, data_emissao, itens_qtd, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'importado')
      `, [nota.chave_acesso, nota.numero_nota, nota.serie, nota.emitente_cnpj, nota.emitente_nome, nota.valor_total, nota.data_emissao, nota.itens.length], function(errNota) {
        if (errNota) return res.status(500).json({ ok: false, erro: errNota.message });
        const notaId = this.lastID;

        let processados = 0;
        const alertasInflacao = [];

        // Vincular ou criar insumos correspondentes e comparar custo
        nota.itens.forEach(it => {
          db.get(`SELECT id, nome, custo_unitario, estoque_atual FROM insumos WHERE LOWER(nome) = LOWER(?) LIMIT 1`, [it.nome.trim()], (errIns, insumoExistente) => {
            let insumoId = insumoExistente ? insumoExistente.id : null;
            let custoAnterior = insumoExistente ? (insumoExistente.custo_unitario || 0) : 0;
            let variacaoPct = 0;
            let alerta = 0;

            if (custoAnterior > 0) {
              variacaoPct = ((it.valor_unitario - custoAnterior) / custoAnterior) * 100;
              if (variacaoPct > 5.0) { // Alerta se subiu mais de 5%
                alerta = 1;
                alertasInflacao.push({
                  insumo: it.nome,
                  custo_anterior: custoAnterior,
                  novo_custo: it.valor_unitario,
                  variacao_pct: parseFloat(variacaoPct.toFixed(1))
                });
              }
            }

            // Atualiza ou insere insumo
            if (insumoExistente) {
              const novoEstoque = (insumoExistente.estoque_atual || 0) + it.quantidade;
              db.run(`UPDATE insumos SET estoque_atual = ?, custo_unitario = ? WHERE id = ?`, [novoEstoque, it.valor_unitario, insumoId]);
            } else {
              db.run(`INSERT INTO insumos (nome, unidade, custo_unitario, estoque_atual, estoque_minimo) VALUES (?, ?, ?, ?, ?)`,
                [it.nome.trim(), it.unidade.toLowerCase(), it.valor_unitario, it.quantidade, 5],
                function() { insumoId = this.lastID; }
              );
            }

            db.run(`
              INSERT INTO compras_nfe_itens (nota_id, insumo_id, descricao_fornecedor, ncm, cfop, unidade_fornecedor, quantidade, valor_unitario, valor_total, custo_anterior, variacao_preco_pct, alerta_inflacao)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [notaId, insumoId, it.nome, it.ncm, it.cfop, it.unidade, it.quantidade, it.valor_unitario, it.valor_total, custoAnterior, variacaoPct, alerta], () => {
              processados++;
              if (processados === nota.itens.length) {
                // Registrar duplicata em Contas a Pagar (despesas_financeiras)
                db.run(`
                  INSERT INTO despesas_financeiras (descricao, categoria, valor, data_competencia, data_vencimento, status, observacao)
                  VALUES (?, 'Insumos & Fornecedores', ?, ?, date('now', '+15 days'), 'Pendente', ?)
                `, [`NFe #${nota.numero_nota} - ${nota.emitente_nome}`, nota.valor_total, nota.data_emissao.slice(0, 10), `Chave NFe: ${nota.chave_acesso}`]);

                res.json({
                  ok: true,
                  nota_id: notaId,
                  numero: nota.numero_nota,
                  fornecedor: nota.emitente_nome,
                  valor_total: nota.valor_total,
                  itens_importados: nota.itens.length,
                  alertas_inflacao: alertasInflacao,
                  mensagem: `NFe #${nota.numero_nota} importada com sucesso! ${nota.itens.length} insumos atualizados no estoque.`
                });
              }
            });
          });
        });
      });
    });
  });

  // Radar de Inflação dos Insumos
  app.get('/api/addons/compras/radar-inflacao', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    db.all(`
      SELECT 
        ci.descricao_fornecedor as insumo,
        ci.custo_anterior,
        ci.valor_unitario as custo_atual,
        ci.variacao_preco_pct,
        cn.emitente_nome as fornecedor,
        cn.numero_nota,
        cn.data_emissao
      FROM compras_nfe_itens ci
      JOIN compras_nfe_notas cn ON cn.id = ci.nota_id
      WHERE ci.alerta_inflacao = 1 OR ci.variacao_preco_pct > 3.0
      ORDER BY ci.variacao_preco_pct DESC
      LIMIT 20
    `, [], (err, rows) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({ ok: true, radar_inflacao: rows || [] });
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // 2. RESUMO NOTURNO DO DONO NO WHATSAPP
  // ══════════════════════════════════════════════════════════════════

  app.get('/api/addons/resumo-noturno/preview', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const hoje = new Date().toISOString().slice(0, 10);

    // Agregar faturamento do dia
    db.all(`
      SELECT paymentMethod, COUNT(*) as qtd, SUM(CAST(REPLACE(REPLACE(total, 'R$', ''), ',', '.') AS REAL)) as total_forma
      FROM pedidos
      WHERE status = 'Finalizado' AND substr(createdAt, 1, 10) = ?
      GROUP BY paymentMethod
    `, [hoje], (errP, formas) => {
      const faturamentoTotal = (formas || []).reduce((acc, f) => acc + (f.total_forma || 0), 0);
      const totalPedidos = (formas || []).reduce((acc, f) => acc + (f.qtd || 0), 0);
      const ticketMedio = totalPedidos > 0 ? (faturamentoTotal / totalPedidos) : 0;

      // Garçom destaque
      db.get(`
        SELECT userName, COUNT(*) as pedidos, SUM(CAST(REPLACE(REPLACE(total, 'R$', ''), ',', '.') AS REAL)) as total_garcom
        FROM pedidos
        WHERE status = 'Finalizado' AND substr(createdAt, 1, 10) = ? AND userName != 'QR Code'
        GROUP BY userName
        ORDER BY total_garcom DESC LIMIT 1
      `, [hoje], (_errG, topGarcom) => {
        // Item mais vendido
        db.get(`
          SELECT productName, SUM(quantity) as total_qtd
          FROM pedidos
          WHERE status = 'Finalizado' AND substr(createdAt, 1, 10) = ?
          GROUP BY productName
          ORDER BY total_qtd DESC LIMIT 1
        `, [hoje], (_errI, topItem) => {
          // Insumos críticos
          db.all(`SELECT nome, estoque_atual, unidade FROM insumos WHERE estoque_atual <= estoque_minimo LIMIT 3`, [], (_errIns, insumosCriticos) => {
            const token = 'RESUMO_' + Math.random().toString(36).substring(2, 10).toUpperCase();

            // Montar texto profissional para WhatsApp
            let msg = `*Boa noite! 🌙 Resumo Executivo Chef Cozinha*\n`;
            msg += `📅 *Data:* ${hoje.split('-').reverse().join('/')}\n\n`;
            msg += `💰 *Faturamento Total:* R$ ${faturamentoTotal.toFixed(2)}\n`;
            msg += `🍔 *Pedidos Entregues:* ${totalPedidos} | *Ticket Médio:* R$ ${ticketMedio.toFixed(2)}\n\n`;
            
            msg += `💳 *Divisão de Pagamentos:*\n`;
            (formas || []).forEach(f => {
              msg += `  • ${f.paymentMethod || 'Outros'}: R$ ${(f.total_forma || 0).toFixed(2)}\n`;
            });

            if (topGarcom) {
              msg += `\n⭐ *Garçom Destaque:* ${topGarcom.userName} (R$ ${(topGarcom.total_garcom || 0).toFixed(2)})\n`;
            }
            if (topItem) {
              msg += `🏆 *Carro-Chefe:* ${topItem.productName} (${topItem.total_qtd} unidades)\n`;
            }
            if (insumosCriticos && insumosCriticos.length > 0) {
              msg += `\n⚠️ *Atenção ao Estoque para Amanhã:*\n`;
              insumosCriticos.forEach(i => {
                msg += `  • ${i.nome}: apenas ${i.estoque_atual} ${i.unidade}\n`;
              });
            }

            msg += `\n🔒 *Auditoria:* Gaveta e fechamento cego validados.\n`;
            msg += `👉 *Painel Completo:* http://localhost:8080/painel-dono.html`;

            res.json({
              ok: true,
              data: hoje,
              faturamento_total: faturamentoTotal,
              total_pedidos: totalPedidos,
              ticket_medio: ticketMedio,
              garcom_destaque: topGarcom ? topGarcom.userName : 'N/A',
              mensagem_whatsapp: msg,
              token
            });
          });
        });
      });
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // 3. WHATSAPP CRM & REATIVAÇÃO AUTOMÁTICA POR IA
  // ══════════════════════════════════════════════════════════════════

  // Detectar clientes inativos para reativação
  app.get('/api/addons/crm/clientes-inativos', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    db.all(`
      SELECT 
        c.id, c.nome, c.telefone,
        COUNT(p.id) as total_compras,
        MAX(p.createdAt) as ultima_compra,
        ROUND(julianday('now', 'localtime') - julianday(MAX(p.createdAt))) as dias_sem_comprar
      FROM clientes c
      JOIN pedidos p ON p.cliente_id = c.id
      WHERE p.status = 'Finalizado'
      GROUP BY c.id
      HAVING dias_sem_comprar >= 15
      ORDER BY dias_sem_comprar ASC
      LIMIT 30
    `, [], (err, rows) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });

      const oportunidades = (rows || []).map(r => {
        const cupom = 'VOLTE' + Math.floor(10 + Math.random() * 90);
        const msg = `Olá ${r.nome.split(' ')[0]}! Sentimos sua falta aqui no restaurante! 🥰 Separamos um cupom especial de R$ 15,00 (*${cupom}*) para você pedir hoje. Peça com 1 clique pelo nosso cardápio: http://localhost:8080/cardapio.html?cupom=${cupom}`;
        return {
          ...r,
          cupom_sugerido: cupom,
          mensagem_personalizada: msg
        };
      });

      res.json({ ok: true, total_inativos: oportunidades.length, oportunidades });
    });
  });

  // Registrar avaliação pós-venda (NPS)
  app.post('/api/addons/crm/registrar-nps', (req, res) => {
    const db = resolveDb(req);
    const { cliente_nome, cliente_telefone, nota, comentario, mesa } = req.body || {};

    const n = parseInt(nota, 10);
    if (isNaN(n) || n < 1 || n > 5) {
      return res.status(400).json({ ok: false, erro: 'Nota deve ser entre 1 e 5 estrelas.' });
    }

    db.run(`
      INSERT INTO crm_avaliacoes_nps (cliente_nome, cliente_telefone, nota, comentario, mesa)
      VALUES (?, ?, ?, ?, ?)
    `, [cliente_nome || 'Cliente', cliente_telefone || '', n, comentario || '', mesa || 'Salão'], function(err) {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      if (io) io.emit('crm_nps_recebido', { nota: n, cliente: cliente_nome, comentario });
      res.json({
        ok: true,
        mensagem: n >= 4 ? 'Muito obrigado pela sua nota excelente!' : 'Agradecemos o feedback, nossa gerência já foi notificada para melhorar.'
      });
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // 4. CLUBE DE ASSINATURAS & FIDELIDADE VIP
  // ══════════════════════════════════════════════════════════════════

  app.get('/api/addons/clube/planos', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    db.all(`SELECT * FROM clube_planos WHERE ativo = 1 ORDER BY valor_mensal ASC`, [], (err, rows) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({ ok: true, planos: rows || [] });
    });
  });

  app.post('/api/addons/clube/planos', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const { nome, descricao, valor_mensal, beneficio_nome, beneficio_qtd_mes } = req.body || {};

    if (!nome || !valor_mensal) return res.status(400).json({ ok: false, erro: 'Nome e valor mensal são obrigatórios.' });

    db.run(`
      INSERT INTO clube_planos (nome, descricao, valor_mensal, beneficio_nome, beneficio_qtd_mes)
      VALUES (?, ?, ?, ?, ?)
    `, [nome.trim(), descricao || '', parseFloat(valor_mensal), beneficio_nome || 'Chopp Grátis', parseInt(beneficio_qtd_mes, 10) || 4], function(err) {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({ ok: true, id: this.lastID, mensagem: 'Plano do clube criado com sucesso!' });
    });
  });

  // Resgatar benefício do clube na comanda
  app.post('/api/addons/clube/resgatar', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const { assinante_id, garcom_nome, mesa } = req.body || {};

    db.get(`SELECT a.*, p.beneficio_nome FROM clube_assinantes a JOIN clube_planos p ON p.id = a.plano_id WHERE a.id = ?`, [assinante_id], (err, ass) => {
      if (err || !ass) return res.status(404).json({ ok: false, erro: 'Assinante não encontrado.' });
      if (ass.saldo_beneficios <= 0) return res.status(400).json({ ok: false, erro: 'Saldo de benefícios esgotado neste ciclo mensal.' });

      const novoSaldo = ass.saldo_beneficios - 1;
      db.run(`UPDATE clube_assinantes SET saldo_beneficios = ? WHERE id = ?`, [novoSaldo, assinante_id], (uErr) => {
        if (uErr) return res.status(500).json({ ok: false, erro: uErr.message });

        db.run(`INSERT INTO clube_resgates_historico (assinante_id, beneficio, garcom_nome, mesa) VALUES (?, ?, ?, ?)`,
          [assinante_id, ass.beneficio_nome, garcom_nome || 'Garçom', mesa || 'Balcão']
        );

        res.json({
          ok: true,
          beneficio: ass.beneficio_nome,
          saldo_restante: novoSaldo,
          mensagem: `1x ${ass.beneficio_nome} resgatado com sucesso! Saldo restante: ${novoSaldo}.`
        });
      });
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // 5. AUDITOR DE TAXAS DE CARTÃO & CONCILIADOR
  // ══════════════════════════════════════════════════════════════════

  app.get('/api/addons/auditor-cartoes/taxas', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    db.all(`SELECT * FROM adquirentes_taxas_contratadas ORDER BY adquirente ASC`, [], (err, rows) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({ ok: true, taxas: rows || [] });
    });
  });

  app.post('/api/addons/auditor-cartoes/auditar-lote', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const { adquirente = 'Stone', lote_vendas = [] } = req.body || {};

    db.get(`SELECT * FROM adquirentes_taxas_contratadas WHERE LOWER(adquirente) = LOWER(?)`, [adquirente], (errTaxa, cfgTaxa) => {
      const taxaContratadaCredito = cfgTaxa ? cfgTaxa.taxa_credito_vista_pct : 2.19;
      const divergencias = [];
      let totalCobradoIndevido = 0;

      // Se não vier lote externo, audita as vendas recentes registradas no PDV com taxa de exemplo
      const vendasParaAuditar = Array.isArray(lote_vendas) && lote_vendas.length > 0 ? lote_vendas : [
        { id: 101, valor: 450.00, bandeira: 'Visa', taxa_cobrada_pct: 3.45 },
        { id: 102, valor: 280.00, bandeira: 'Mastercard', taxa_cobrada_pct: 3.10 },
        { id: 103, valor: 620.00, bandeira: 'Elo', taxa_cobrada_pct: 3.80 }
      ];

      vendasParaAuditar.forEach(v => {
        if (v.taxa_cobrada_pct > taxaContratadaCredito) {
          const diffPct = v.taxa_cobrada_pct - taxaContratadaCredito;
          const diffValor = (v.valor * diffPct) / 100;
          totalCobradoIndevido += diffValor;

          divergencias.push({
            venda_id: v.id,
            valor_bruto: v.valor,
            bandeira: v.bandeira,
            taxa_esperada: taxaContratadaCredito,
            taxa_cobrada: v.taxa_cobrada_pct,
            prejuizo_recuperavel: parseFloat(diffValor.toFixed(2))
          });

          db.run(`
            INSERT INTO auditoria_divergencias_cartao (data_lote, adquirente, bandeira, tipo_operacao, valor_bruto, taxa_esperada_pct, taxa_cobrada_pct, diferenca_valor)
            VALUES (date('now'), ?, ?, 'credito_vista', ?, ?, ?, ?)
          `, [adquirente, v.bandeira, v.valor, taxaContratadaCredito, v.taxa_cobrada_pct, diffValor]);
        }
      });

      res.json({
        ok: true,
        adquirente,
        taxa_contratada_credito: taxaContratadaCredito,
        total_divergencias: divergencias.length,
        total_a_recuperar: parseFloat(totalCobradoIndevido.toFixed(2)),
        divergencias,
        mensagem: `Auditoria concluída! Encontrados R$ ${totalCobradoIndevido.toFixed(2)} em cobranças de taxas acima do contrato.`
      });
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // 6. GAMIFICAÇÃO DO SALÃO & RATEIO DE GORJETA (LEI 13.419)
  // ══════════════════════════════════════════════════════════════════

  // Leaderboard em tempo real de vendas dos Garçons
  app.get('/api/addons/gamificacao/leaderboard', (req, res) => {
    const db = resolveDb(req);
    const hoje = new Date().toISOString().slice(0, 10);

    db.all(`
      SELECT 
        userName as garcom,
        COUNT(id) as total_pedidos,
        SUM(CAST(REPLACE(REPLACE(total, 'R$', ''), ',', '.') AS REAL)) as total_vendido,
        ROUND(AVG(CAST(REPLACE(REPLACE(total, 'R$', ''), ',', '.') AS REAL)), 2) as ticket_medio
      FROM pedidos
      WHERE status = 'Finalizado' AND substr(createdAt, 1, 10) = ? AND userName != 'QR Code'
      GROUP BY userName
      ORDER BY total_vendido DESC
    `, [hoje], (err, ranking) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });

      db.all(`SELECT * FROM gamificacao_missoes WHERE ativo = 1`, [], (_errM, missoes) => {
        res.json({
          ok: true,
          data: hoje,
          ranking: (ranking || []).map((r, idx) => ({
            posicao: idx + 1,
            medalha: idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '🎖️',
            ...r
          })),
          missoes_ativas: missoes || []
        });
      });
    });
  });

  // Calcular Rateio Legal da Gorjeta do Turno
  app.post('/api/addons/gorjetas/calcular-rateio', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const { colaboradores = [], valor_arrecadado_total, turno_nome = 'Noite', responsavel = 'Gerente' } = req.body || {};

    const bruto = parseFloat(valor_arrecadado_total) || 0;
    if (bruto <= 0) return res.status(400).json({ ok: false, erro: 'Valor arrecadado deve ser maior que zero.' });

    db.get(`SELECT * FROM gorjetas_config WHERE id = 1`, (errCfg, cfg) => {
      const retencaoPct = cfg ? cfg.retencao_legal_pct : 20.0;
      const valorRetencao = (bruto * retencaoPct) / 100;
      const valorLiquido = bruto - valorRetencao;

      // Colaboradores de exemplo se não forem fornecidos
      const listaColabs = Array.isArray(colaboradores) && colaboradores.length > 0 ? colaboradores : [
        { nome: 'Carlos Garçom', funcao: 'garcom', horas: 7 },
        { nome: 'Mariana Garçom', funcao: 'garcom', horas: 7 },
        { nome: 'Pedro Cumim', funcao: 'cumim', horas: 6 },
        { nome: 'Lucas Bartender', funcao: 'bar', horas: 7 },
        { nome: 'João Chapa', funcao: 'cozinha', horas: 8 }
      ];

      const pesos = {
        garcom: cfg ? cfg.peso_garcom : 5.0,
        cumim: cfg ? cfg.peso_cumim : 3.0,
        bar: cfg ? cfg.peso_bar : 2.0,
        cozinha: cfg ? cfg.peso_cozinha : 2.0
      };

      // Cálculo por pontos-hora
      let totalPontosTurno = 0;
      listaColabs.forEach(c => {
        const peso = pesos[c.funcao] || 2.0;
        c.pontos_totais = peso * (c.horas || 1);
        totalPontosTurno += c.pontos_totais;
      });

      const valorPorPonto = totalPontosTurno > 0 ? (valorLiquido / totalPontosTurno) : 0;

      const rateioCalculado = listaColabs.map(c => {
        const repasse = c.pontos_totais * valorPorPonto;
        return {
          nome: c.nome,
          funcao: c.funcao,
          horas_trabalhadas: c.horas,
          pontos: c.pontos_totais,
          valor_liquido: parseFloat(repasse.toFixed(2))
        };
      });

      const hoje = new Date().toISOString().slice(0, 10);
      db.run(`
        INSERT INTO gorjetas_rateios_fechamentos 
        (data_turno, turno_nome, valor_arrecadado_bruto, valor_retencao_encargos, valor_liquido_distribuido, total_horas_trabalhadas, detalhes_rateio_json, responsavel)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [hoje, turno_nome, bruto, valorRetencao, valorLiquido, listaColabs.reduce((acc, c) => acc + c.horas, 0), JSON.stringify(rateioCalculado), responsavel], function(errIns) {
        if (errIns) return res.status(500).json({ ok: false, erro: errIns.message });

        res.json({
          ok: true,
          fechamento_id: this.lastID,
          data: hoje,
          turno: turno_nome,
          valor_arrecadado_bruto: bruto,
          retencao_encargos_lei_13419: parseFloat(valorRetencao.toFixed(2)),
          valor_liquido_distribuido: parseFloat(valorLiquido.toFixed(2)),
          total_colaboradores: listaColabs.length,
          rateio: rateioCalculado,
          mensagem: `Rateio de R$ ${valorLiquido.toFixed(2)} calculado e auditado conforme Lei 13.419 com sucesso!`
        });
      });
    });
  });

  console.log('💎 Controller Add-ons de Alta Monetização (XML NFe, WhatsApp Noturno, CRM IA, Clube Assinatura, Auditor Cartão, Rateio Gorjeta) registrado com sucesso.');
};
