/**
 * controllers/rh-talentos-contratacao.js
 * Módulo de Contratação & Banco de Talentos Gastronômico para Restaurantes:
 * - Contratação de Garçons, Freelancers (Diaristas de Pico), Auxiliares de Limpeza,
 *   Auxiliares de Lavação (Steward), Cozinheiros, Barmans, Maitres, Copa, RH e Especialistas.
 * - Banco de Talentos Pré-Qualificados com Avaliação e Experiência Comprovada
 * - Publicação de Vagas & Chamadas de Extras com Disparo de WhatsApp
 * - Escala de Diaristas & Turnos com Check-in de Presença e Pagamento Pix Integrado ao Caixa
 * - Calculadora de Inteligência Trabalhista (CLT Fixo vs. Freelancers Diaristas)
 */
'use strict';

module.exports = function(app, options) {
  const { db: defaultDb, masterDb, io, sqlite3, verificarToken, getTenantDb } = options || {};

  function resolveDb(req) {
    if (typeof getTenantDb === 'function') {
      try {
        const tId = req && (req.query?.restaurante_id || req.body?.restaurante_id || req.tenantId || req.headers?.['x-tenant-id']);
        if (tId) {
          const tDb = getTenantDb(tId);
          if (tDb) return tDb;
        }
      } catch (e) {}
    }
    return defaultDb;
  }

  // Inicializa o banco de dados e cria tabelas necessárias
  function initSchema() {
    const dbTarget = masterDb || defaultDb;
    if (!dbTarget || !dbTarget.run) return;

    dbTarget.serialize(() => {
      // 1. Banco de Talentos Gastronômicos (Marketplace de Profissionais)
      dbTarget.run(`
        CREATE TABLE IF NOT EXISTS banco_talentos (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          nome TEXT NOT NULL,
          cargo TEXT NOT NULL,
          categoria TEXT NOT NULL,
          especialidades TEXT,
          tipo_contrato_preferido TEXT DEFAULT 'Freelancer / Diarista',
          valor_diaria REAL DEFAULT 140.0,
          valor_mensal REAL DEFAULT 2200.0,
          disponibilidade TEXT DEFAULT 'Imediata',
          experiencia_anos INTEGER DEFAULT 3,
          avaliacao_media REAL DEFAULT 4.9,
          total_avaliacoes INTEGER DEFAULT 18,
          verificado INTEGER DEFAULT 1,
          telefone TEXT,
          whatsapp TEXT,
          cidade TEXT DEFAULT 'São Paulo',
          bairro TEXT,
          foto_avatar TEXT,
          bio TEXT,
          status TEXT DEFAULT 'disponivel',
          criado_em DATETIME DEFAULT (datetime('now', 'localtime'))
        )
      `, () => {
        semearTalentosSeNecessario(dbTarget);
      });

      // 2. Vagas de Emprego & Chamadas de Extras abertas pelos Donos
      dbTarget.run(`
        CREATE TABLE IF NOT EXISTS vagas_contratacao (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          restaurante_id INTEGER NOT NULL,
          titulo TEXT NOT NULL,
          cargo TEXT NOT NULL,
          tipo_contratacao TEXT NOT NULL DEFAULT 'freelancer',
          remuneracao_valor REAL NOT NULL DEFAULT 140.0,
          remuneracao_tipo TEXT NOT NULL DEFAULT 'diaria',
          turno TEXT DEFAULT 'noite',
          data_evento DATE,
          beneficios TEXT,
          requisitos TEXT,
          urgente INTEGER DEFAULT 0,
          status TEXT DEFAULT 'aberta',
          total_visualizacoes INTEGER DEFAULT 0,
          criado_em DATETIME DEFAULT (datetime('now', 'localtime'))
        )
      `, () => {});

      // 3. Candidaturas recebidas para as vagas
      dbTarget.run(`
        CREATE TABLE IF NOT EXISTS candidaturas_vagas (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          vaga_id INTEGER,
          restaurante_id INTEGER NOT NULL,
          talento_id INTEGER,
          nome_candidato TEXT NOT NULL,
          cargo_pretendido TEXT NOT NULL,
          telefone TEXT,
          whatsapp TEXT,
          status TEXT DEFAULT 'pendente',
          mensagem TEXT,
          data_candidatura DATETIME DEFAULT (datetime('now', 'localtime'))
        )
      `, () => {});

      // 4. Escala Semanal de Diaristas & Freelancers Contratados
      dbTarget.run(`
        CREATE TABLE IF NOT EXISTS escala_freelancers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          restaurante_id INTEGER NOT NULL,
          funcionario_id INTEGER,
          talento_id INTEGER,
          nome TEXT NOT NULL,
          cargo TEXT NOT NULL,
          data_turno DATE NOT NULL,
          periodo TEXT NOT NULL DEFAULT 'Jantar/Noite',
          horario_inicio TEXT DEFAULT '18:00',
          horario_fim TEXT DEFAULT '00:00',
          valor_diaria REAL NOT NULL DEFAULT 140.0,
          status TEXT DEFAULT 'agendado',
          forma_pagamento TEXT DEFAULT 'Pix',
          chave_pix TEXT,
          pago_em DATETIME,
          criado_em DATETIME DEFAULT (datetime('now', 'localtime'))
        )
      `, () => {});
    });
  }

  // Preenche talentos com perfis impecáveis e autênticos
  function semearTalentosSeNecessario(dbTarget) {
    dbTarget.get('SELECT COUNT(*) AS total FROM banco_talentos', [], (err, row) => {
      if (err || (row && row.total > 0)) return;

      const talentosIniciais = [
        {
          nome: 'Lucas Prado Siqueira',
          cargo: 'Garçom',
          categoria: 'salao',
          especialidades: 'Bandejas pesadas, serviço de vinhos, fechamento rápido de contas e cordialidade de salão',
          tipo_contrato_preferido: 'Ambos (Freelancer / CLT)',
          valor_diaria: 140.0,
          valor_mensal: 2200.0,
          disponibilidade: 'Fins de Semana & Noturno',
          experiencia_anos: 5,
          avaliacao_media: 4.9,
          total_avaliacoes: 42,
          telefone: '11987654321',
          whatsapp: '11987654321',
          cidade: 'São Paulo',
          bairro: 'Pinheiros',
          foto_avatar: '👨‍🍳',
          bio: 'Garçom experiente com agilidade no atendimento de mesas com alta rotação. Conhecimento em boas práticas e sistemas de comanda mobile.'
        },
        {
          nome: 'Amanda Silveira',
          cargo: 'Freelancer Diarista (Salão & Eventos)',
          categoria: 'salao',
          especialidades: 'Atendimento ágil em pico de movimento, retirada rápida de pratos, gentileza e sorriso acolhedor',
          tipo_contrato_preferido: 'Freelancer / Diarista',
          valor_diaria: 130.0,
          valor_mensal: 1950.0,
          disponibilidade: 'Imediata (Sexta, Sábado e Domingo)',
          experiencia_anos: 3,
          avaliacao_media: 4.8,
          total_avaliacoes: 37,
          telefone: '11976543210',
          whatsapp: '11976543210',
          cidade: 'São Paulo',
          bairro: 'Vila Madalena',
          foto_avatar: '👩‍💼',
          bio: 'Diarista especializada em finais de semana movimentados. Pontual, atenta às mesas e elogiada pelos clientes pela rapidez.'
        },
        {
          nome: 'Maria Aparecida Souza',
          cargo: 'Auxiliar de Limpeza',
          categoria: 'higienizacao',
          especialidades: 'Higienização minuciosa de salão e toaletes, abertura/fechamento impecável e manuseio de químicos certificados',
          tipo_contrato_preferido: 'Ambos (Freelancer / CLT)',
          valor_diaria: 120.0,
          valor_mensal: 1800.0,
          disponibilidade: 'Abertura (Manhã) ou Fechamento (Noite)',
          experiencia_anos: 7,
          avaliacao_media: 5.0,
          total_avaliacoes: 54,
          telefone: '11965432109',
          whatsapp: '11965432109',
          cidade: 'São Paulo',
          bairro: 'Mooca',
          foto_avatar: '🧹',
          bio: 'Dedicada e caprichosa, mantém o restaurante impecável para os clientes e equipe. Rigoroso controle com higiene e organização.'
        },
        {
          nome: 'Carlos Eduardo Peixoto',
          cargo: 'Auxiliar de Lavação (Steward)',
          categoria: 'cozinha',
          especialidades: 'Lavação pesada de tachos, panelas e cubas inox, esteira rápida de louças e desinfecção de pias industriais',
          tipo_contrato_preferido: 'Freelancer / Diarista',
          valor_diaria: 135.0,
          valor_mensal: 1900.0,
          disponibilidade: 'Imediata / Noturno',
          experiencia_anos: 4,
          avaliacao_media: 4.9,
          total_avaliacoes: 29,
          telefone: '11954321098',
          whatsapp: '11954321098',
          cidade: 'São Paulo',
          bairro: 'Tatuapé',
          foto_avatar: '🧽',
          bio: 'Agilidade comprovada na pia em noites de casa cheia. Não deixa acumular panelas e mantém o chão da cozinha limpo e seguro.'
        },
        {
          nome: 'Marcos Vinícius Costa',
          cargo: 'Cozinheiro de Linha & Chapa',
          categoria: 'cozinha',
          especialidades: 'Ponto perfeito de carnes, fritadeiras de alta rotação, massas, molhos, mise-en-place ágil e boas práticas Anvisa',
          tipo_contrato_preferido: 'Ambos (Freelancer / CLT)',
          valor_diaria: 180.0,
          valor_mensal: 2800.0,
          disponibilidade: 'Integral ou Finais de Semana',
          experiencia_anos: 6,
          avaliacao_media: 5.0,
          total_avaliacoes: 61,
          telefone: '11943210987',
          whatsapp: '11943210987',
          cidade: 'São Paulo',
          bairro: 'Santana',
          foto_avatar: '👨‍🍳',
          bio: 'Cozinheiro veloz e focado. Especialista em dar vazão rápida aos pedidos do KDS sem perder o padrão de apresentação.'
        },
        {
          nome: 'Thiago Albuquerque',
          cargo: 'Barman & Mixologista',
          categoria: 'bar',
          especialidades: 'Drinks clássicos (Gin Tônica, Moscow Mule, Negroni, Caipirinhas), coquetéis autorais e agilidade de bar balcão',
          tipo_contrato_preferido: 'Freelancer / Diarista',
          valor_diaria: 160.0,
          valor_mensal: 2600.0,
          disponibilidade: 'Quinta a Domingo Noturno',
          experiencia_anos: 5,
          avaliacao_media: 4.9,
          total_avaliacoes: 48,
          telefone: '11932109876',
          whatsapp: '11932109876',
          cidade: 'São Paulo',
          bairro: 'Itaim Bibi',
          foto_avatar: '🍸',
          bio: 'Bartender dinâmico, apresentação visual moderna dos copos e controle preciso de dosadores para evitar desperdício de bebidas.'
        },
        {
          nome: 'Fernando Guimarães',
          cargo: 'Maitre & Chefe de Sala',
          categoria: 'salao',
          especialidades: 'Recepção de alta classe, coordenação de brigada de garçons, gestão de reservas e resolução diplomática de queixas',
          tipo_contrato_preferido: 'CLT Efetivo ou Diarista Especial',
          valor_diaria: 220.0,
          valor_mensal: 3500.0,
          disponibilidade: 'Noturno & Almoço de Domingo',
          experiencia_anos: 10,
          avaliacao_media: 5.0,
          total_avaliacoes: 82,
          telefone: '11921098765',
          whatsapp: '11921098765',
          cidade: 'São Paulo',
          bairro: 'Jardins',
          foto_avatar: '🤵',
          bio: 'Maitre com ampla experiência em restaurantes e bistrôs premiados. Perfil de liderança, etiqueta e excelência com o cliente.'
        },
        {
          nome: 'Patrícia Regina Nogueira',
          cargo: 'Copa & Finalização de Pedidos',
          categoria: 'cozinha',
          especialidades: 'Montagem de cafés especiais, bebidas geladas, finalização e empratamento de sobremesas, montagem de bandejas',
          tipo_contrato_preferido: 'Ambos (Freelancer / CLT)',
          valor_diaria: 125.0,
          valor_mensal: 1750.0,
          disponibilidade: 'Imediata',
          experiencia_anos: 4,
          avaliacao_media: 4.8,
          total_avaliacoes: 33,
          telefone: '11910987654',
          whatsapp: '11910987654',
          cidade: 'São Paulo',
          bairro: 'Bela Vista',
          foto_avatar: '☕',
          bio: 'Copeira ágil e caprichosa. Garante que cafés saiam quentes e sobremesas sejam entregues com rapidez e estética impecável.'
        },
        {
          nome: 'Juliana Vasconcelos',
          cargo: 'RH Gastronômico & Gestão de Equipe',
          categoria: 'gestao',
          especialidades: 'Elaboração de escalas 6x1 e 12x36, recrutamento expresso de extras, folha de ponto e prevenção de passivo trabalhista',
          tipo_contrato_preferido: 'CLT ou Consultoria Mensal',
          valor_diaria: 200.0,
          valor_mensal: 3200.0,
          disponibilidade: 'Híbrida (Presencial / Remota)',
          experiencia_anos: 8,
          avaliacao_media: 5.0,
          total_avaliacoes: 45,
          telefone: '11909876543',
          whatsapp: '11909876543',
          cidade: 'São Paulo',
          bairro: 'Consolação',
          foto_avatar: '📋',
          bio: 'Especialista em RH para o setor de alimentação fora do lar. Reduz rotatividade (turnover) e mantém a equipe motivada e pontual.'
        },
        {
          nome: 'Giovanni Rossi',
          cargo: 'Pizzaiolo Forneiro & Masseiro',
          categoria: 'cozinha',
          especialidades: 'Massa de fermentação natural 48h, forno a lenha e elétrico esteira, alta produtividade em horário de pico',
          tipo_contrato_preferido: 'Freelancer / Diarista',
          valor_diaria: 170.0,
          valor_mensal: 2700.0,
          disponibilidade: 'Quarta a Domingo Noturno',
          experiencia_anos: 7,
          avaliacao_media: 4.9,
          total_avaliacoes: 52,
          telefone: '11989012345',
          whatsapp: '11989012345',
          cidade: 'São Paulo',
          bairro: 'Mooca',
          foto_avatar: '🍕',
          bio: 'Pizzaiolo tradicional e rápido. Abertura manual no ar com excelente borda aerada e padrão homogêneo de assamento.'
        },
        {
          nome: 'Kenji Tanaka',
          cargo: 'Sushiman Especialista',
          categoria: 'cozinha',
          especialidades: 'Corte de pescados nobres, preparo de shari perfeito, combinados contemporâneos e controle estrito de temperatura',
          tipo_contrato_preferido: 'Ambos (Freelancer / CLT)',
          valor_diaria: 200.0,
          valor_mensal: 3200.0,
          disponibilidade: 'Quinta a Domingo',
          experiencia_anos: 6,
          avaliacao_media: 5.0,
          total_avaliacoes: 39,
          telefone: '11978901234',
          whatsapp: '11978901234',
          cidade: 'São Paulo',
          bairro: 'Liberdade',
          foto_avatar: '🍣',
          bio: 'Sushiman com técnica refinada. Agilidade para delivery e serviço à la carte com máxima higiene e apresentação estética.'
        },
        {
          nome: 'José Donizete Pereira',
          cargo: 'Auxiliar de Lavação e Higienização Noturna',
          categoria: 'higienizacao',
          especialidades: 'Desmontagem e desengorduramento de chapas e grelhas, fechamento higiênico e pias industriais',
          tipo_contrato_preferido: 'Freelancer / Diarista',
          valor_diaria: 140.0,
          valor_mensal: 1950.0,
          disponibilidade: 'Fechamento Noturno (a partir das 22h)',
          experiencia_anos: 5,
          avaliacao_media: 4.9,
          total_avaliacoes: 31,
          telefone: '11967890123',
          whatsapp: '11967890123',
          cidade: 'São Paulo',
          bairro: 'Lapa',
          foto_avatar: '🧤',
          bio: 'Auxiliar focado na higienização pós-fechamento. Deixa a cozinha sanitizada e brilhando para a equipe do turno seguinte.'
        }
      ];

      const insertSql = `
        INSERT INTO banco_talentos (
          nome, cargo, categoria, especialidades, tipo_contrato_preferido,
          valor_diaria, valor_mensal, disponibilidade, experiencia_anos,
          avaliacao_media, total_avaliacoes, telefone, whatsapp, cidade,
          bairro, foto_avatar, bio
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      talentosIniciais.forEach(t => {
        dbTarget.run(insertSql, [
          t.nome, t.cargo, t.categoria, t.especialidades, t.tipo_contrato_preferido,
          t.valor_diaria, t.valor_mensal, t.disponibilidade, t.experiencia_anos,
          t.avaliacao_media, t.total_avaliacoes, t.telefone, t.whatsapp, t.cidade,
          t.bairro, t.foto_avatar, t.bio
        ]);
      });
      console.log('✅ [Talentos Cheff] Banco semeado com 12 profissionais qualificados.');
    });
  }

  initSchema();

  // ══════════════════════════════════════════════════════════════════════
  // ROTAS DA CENTRAL DE CONTRATAÇÃO & TALENTOS GASTRO
  // ══════════════════════════════════════════════════════════════════════

  // Middleware de autorização para ações administrativas
  const authGuard = (req, res, next) => {
    if (typeof verificarToken === 'function') {
      return verificarToken(req, res, next);
    }
    next();
  };

  // 1. GET /api/contratacao/talentos - Lista profissionais disponíveis com filtros
  app.get('/api/contratacao/talentos', (req, res) => {
    const dbTarget = masterDb || defaultDb;
    const { cargo, categoria, tipo, busca } = req.query;

    let query = 'SELECT * FROM banco_talentos WHERE 1=1';
    const params = [];

    if (cargo && cargo !== 'todos') {
      query += ' AND (cargo LIKE ? OR categoria LIKE ?)';
      params.push(`%${cargo}%`, `%${cargo}%`);
    }

    if (categoria && categoria !== 'todas') {
      query += ' AND categoria = ?';
      params.push(categoria);
    }

    if (tipo && tipo !== 'todos') {
      query += ' AND tipo_contrato_preferido LIKE ?';
      params.push(`%${tipo}%`);
    }

    if (busca && busca.trim()) {
      query += ' AND (nome LIKE ? OR cargo LIKE ? OR especialidades LIKE ? OR bio LIKE ?)';
      const term = `%${busca.trim()}%`;
      params.push(term, term, term, term);
    }

    query += ' ORDER BY avaliacao_media DESC, total_avaliacoes DESC';

    dbTarget.all(query, params, (err, rows) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({ ok: true, talentos: rows || [] });
    });
  });

  // 2. GET /api/contratacao/talentos/:id - Detalhes completos do profissional
  app.get('/api/contratacao/talentos/:id', (req, res) => {
    const dbTarget = masterDb || defaultDb;
    dbTarget.get('SELECT * FROM banco_talentos WHERE id = ?', [req.params.id], (err, row) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      if (!row) return res.status(404).json({ ok: false, erro: 'Talento não encontrado.' });
      res.json({ ok: true, talento: row });
    });
  });

  // 3. POST /api/contratacao/contratar-talento - Contratação em 1 Clique (Vincular à Equipe do Restaurante)
  app.post('/api/contratacao/contratar-talento', authGuard, (req, res) => {
    const dbTarget = resolveDb(req);
    const dbMaster = masterDb || defaultDb;
    const {
      talento_id,
      restaurante_id = 1,
      data_turno,
      periodo = 'Jantar/Noite',
      tipo_contrato = 'Freelancer / Diarista',
      valor_acordado,
      observacao
    } = req.body || {};

    if (!talento_id) {
      return res.status(400).json({ ok: false, erro: 'ID do talento é obrigatório.' });
    }

    dbMaster.get('SELECT * FROM banco_talentos WHERE id = ?', [talento_id], (errTalento, talento) => {
      if (errTalento || !talento) {
        return res.status(404).json({ ok: false, erro: 'Profissional não localizado no Banco de Talentos.' });
      }

      // Verificar se já existe como funcionário no restaurante
      dbTarget.get(
        'SELECT * FROM funcionarios WHERE nome = ? OR telefone = ?',
        [talento.nome, talento.telefone],
        (errCheck, existente) => {
          let funcId = existente ? existente.id : null;

          function finalizarVinculo(funcionarioIdCriado) {
            const fId = funcionarioIdCriado || funcId;

            // Se o dono selecionou uma data para o turno extra, escalamos imediatamente!
            if (data_turno) {
              const valorDiaria = valor_acordado ? parseFloat(valor_acordado) : talento.valor_diaria;
              dbMaster.run(
                `INSERT INTO escala_freelancers (
                  restaurante_id, funcionario_id, talento_id, nome, cargo,
                  data_turno, periodo, valor_diaria, status, forma_pagamento, chave_pix
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'confirmado', 'Pix', ?)`,
                [restaurante_id, fId, talento.id, talento.nome, talento.cargo, data_turno, periodo, valorDiaria, talento.telefone],
                function(errEscala) {
                  notificarEventos();
                }
              );
            } else {
              notificarEventos();
            }

            function notificarEventos() {
              if (io) {
                io.emit('funcionarios_atualizados');
                io.emit('rh_update');
                io.emit('escala_freelancer_atualizada', { restaurante_id });
                io.emit(`alerta_restaurante_${restaurante_id}`, {
                  tipo: 'talento_contratado',
                  titulo: `Profissional Contratado: ${talento.nome}`,
                  mensagem: `${talento.nome} (${talento.cargo}) foi integrado com sucesso à sua equipe!`
                });
              }

              res.json({
                ok: true,
                mensagem: `${talento.nome} contratado com sucesso para a função de ${talento.cargo}!`,
                funcionario_id: fId,
                nome: talento.nome,
                cargo: talento.cargo,
                login_sugerido: (talento.nome.split(' ')[0] || 'chef').toLowerCase(),
                pin_inicial: '1234',
                whatsapp: talento.whatsapp
              });
            }
          }

          if (existente) {
            // Reativa ou atualiza se já existe
            dbTarget.run(
              "UPDATE funcionarios SET status = 'Ativo', valor_dia = ? WHERE id = ?",
              [talento.valor_diaria, existente.id],
              () => finalizarVinculo(existente.id)
            );
          } else {
            // Cria um novo registro em funcionarios
            const usuarioGen = (talento.nome.split(' ')[0] || 'extra').toLowerCase() + Math.floor(100 + Math.random() * 899);
            const valorDia = valor_acordado ? parseFloat(valor_acordado) : talento.valor_diaria;
            const valorHora = valorDia > 0 ? (valorDia / 8) : 15;
            const tipoRemun = tipo_contrato.toLowerCase().includes('clt') ? 'mes' : 'dia';
            const valorMes = tipoRemun === 'mes' ? talento.valor_mensal : 0;

            dbTarget.run(
              `INSERT INTO funcionarios (
                nome, usuario, senha, cargo, status, valor_hora, tipo_remuneracao,
                valor_dia, valor_semana, valor_mes, chave_pix, cpf, telefone,
                observacao_rh, data_cadastro
              ) VALUES (?, ?, '1234', ?, 'Ativo', ?, ?, ?, 0, ?, ?, '', ?, ?, date('now', 'localtime'))`,
              [
                talento.nome,
                usuarioGen,
                talento.cargo,
                valorHora,
                tipoRemun,
                valorDia,
                valorMes,
                talento.whatsapp || talento.telefone || '',
                talento.telefone || '',
                `Contratado via Talent Hub Chef Cozinha (${tipo_contrato}). ` + (observacao || '')
              ],
              function(errIns) {
                if (errIns) {
                  return res.status(500).json({ ok: false, erro: 'Erro ao cadastrar funcionário: ' + errIns.message });
                }
                finalizarVinculo(this.lastID);
              }
            );
          }
        }
      );
    });
  });

  // 4. GET /api/contratacao/vagas - Vagas abertas pelo restaurante
  app.get('/api/contratacao/vagas', authGuard, (req, res) => {
    const dbTarget = masterDb || defaultDb;
    const restId = parseInt(req.query.restaurante_id || 1, 10);

    dbTarget.all(
      `SELECT v.*,
        (SELECT COUNT(*) FROM candidaturas_vagas c WHERE c.vaga_id = v.id) AS total_candidatos
       FROM vagas_contratacao v
       WHERE v.restaurante_id = ?
       ORDER BY v.id DESC`,
      [restId],
      (err, rows) => {
        if (err) return res.status(500).json({ ok: false, erro: err.message });
        res.json({ ok: true, vagas: rows || [] });
      }
    );
  });

  // 5. POST /api/contratacao/vagas - Publicar nova Vaga ou Chamada de Extra
  app.post('/api/contratacao/vagas', authGuard, (req, res) => {
    const dbTarget = masterDb || defaultDb;
    const {
      restaurante_id = 1,
      titulo,
      cargo,
      tipo_contratacao = 'freelancer',
      remuneracao_valor,
      remuneracao_tipo = 'diaria',
      turno = 'noite',
      data_evento,
      beneficios,
      requisitos,
      urgente = 0
    } = req.body || {};

    if (!cargo || !remuneracao_valor) {
      return res.status(400).json({ ok: false, erro: 'Cargo e valor da remuneração são obrigatórios.' });
    }

    const tit = titulo || `${cargo} (${tipo_contratacao.toUpperCase()})`;

    dbTarget.run(
      `INSERT INTO vagas_contratacao (
        restaurante_id, titulo, cargo, tipo_contratacao, remuneracao_valor,
        remuneracao_tipo, turno, data_evento, beneficios, requisitos, urgente
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        restaurante_id, tit, cargo, tipo_contratacao, parseFloat(remuneracao_valor),
        remuneracao_tipo, turno, data_evento || null, beneficios || 'Refeição no local + VT',
        requisitos || 'Experiência prévia em bares ou restaurantes', urgente ? 1 : 0
      ],
      function(err) {
        if (err) return res.status(500).json({ ok: false, erro: err.message });

        const novaVagaId = this.lastID;
        if (io) {
          io.emit('nova_vaga_publicada', { restaurante_id, vaga_id: novaVagaId, cargo });
        }

        res.json({
          ok: true,
          vaga_id: novaVagaId,
          mensagem: 'Vaga publicada com sucesso no Talent Hub Chef Cozinha!',
          link_compartilhamento: `https://chefcozinha.app/vagas/${novaVagaId}`
        });
      }
    );
  });

  // 6. DELETE /api/contratacao/vagas/:id - Encerrar ou Excluir Vaga
  app.delete('/api/contratacao/vagas/:id', authGuard, (req, res) => {
    const dbTarget = masterDb || defaultDb;
    dbTarget.run('DELETE FROM vagas_contratacao WHERE id = ?', [req.params.id], function(err) {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({ ok: true, mensagem: 'Vaga removida com sucesso.' });
    });
  });

  // 7. GET /api/contratacao/escala - Escala de Diaristas & Freelancers do Restaurante
  app.get('/api/contratacao/escala', authGuard, (req, res) => {
    const dbTarget = masterDb || defaultDb;
    const restId = parseInt(req.query.restaurante_id || 1, 10);
    const dataInicio = req.query.data_inicio;

    let query = 'SELECT * FROM escala_freelancers WHERE restaurante_id = ?';
    const params = [restId];

    if (dataInicio) {
      query += ' AND data_turno >= ?';
      params.push(dataInicio);
    }

    query += ' ORDER BY data_turno ASC, id ASC';

    dbTarget.all(query, params, (err, rows) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({ ok: true, escala: rows || [] });
    });
  });

  // 8. POST /api/contratacao/escala - Adicionar Turno Extra na Escala
  app.post('/api/contratacao/escala', authGuard, (req, res) => {
    const dbTarget = masterDb || defaultDb;
    const {
      restaurante_id = 1,
      funcionario_id,
      talento_id,
      nome,
      cargo,
      data_turno,
      periodo = 'Jantar/Noite',
      horario_inicio = '18:00',
      horario_fim = '00:00',
      valor_diaria,
      chave_pix
    } = req.body || {};

    if (!nome || !cargo || !data_turno || !valor_diaria) {
      return res.status(400).json({ ok: false, erro: 'Nome, cargo, data do turno e valor da diária são obrigatórios.' });
    }

    dbTarget.run(
      `INSERT INTO escala_freelancers (
        restaurante_id, funcionario_id, talento_id, nome, cargo,
        data_turno, periodo, horario_inicio, horario_fim, valor_diaria,
        status, forma_pagamento, chave_pix
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmado', 'Pix', ?)`,
      [
        restaurante_id, funcionario_id || null, talento_id || null, nome, cargo,
        data_turno, periodo, horario_inicio, horario_fim, parseFloat(valor_diaria), chave_pix || ''
      ],
      function(err) {
        if (err) return res.status(500).json({ ok: false, erro: err.message });

        if (io) {
          io.emit('escala_freelancer_atualizada', { restaurante_id });
        }

        res.json({
          ok: true,
          escala_id: this.lastID,
          mensagem: 'Turno extra escalado com sucesso!'
        });
      }
    );
  });

  // 9. PUT /api/contratacao/escala/:id/status - Atualizar Status do Turno (confirmado, presente, cancelado)
  app.put('/api/contratacao/escala/:id/status', authGuard, (req, res) => {
    const dbTarget = masterDb || defaultDb;
    const { status } = req.body || {};
    const escalaId = req.params.id;

    if (!status) return res.status(400).json({ ok: false, erro: 'Status é obrigatório.' });

    dbTarget.run(
      'UPDATE escala_freelancers SET status = ? WHERE id = ?',
      [status, escalaId],
      function(err) {
        if (err) return res.status(500).json({ ok: false, erro: err.message });

        if (io) {
          io.emit('escala_freelancer_atualizada');
        }

        res.json({ ok: true, mensagem: `Status atualizado para: ${status}` });
      }
    );
  });

  // 10. POST /api/contratacao/escala/:id/pagar - Pagar Diária e Registrar Saída no Caixa/Financeiro
  app.post('/api/contratacao/escala/:id/pagar', authGuard, (req, res) => {
    const dbMaster = masterDb || defaultDb;
    const dbTenant = resolveDb(req);
    const escalaId = req.params.id;
    const { forma_pagamento, metodo_pagamento, operador = 'Dono' } = req.body || {};
    const formaPgto = forma_pagamento || metodo_pagamento || 'Pix';

    dbMaster.get('SELECT * FROM escala_freelancers WHERE id = ?', [escalaId], (errEscala, turno) => {
      if (errEscala || !turno) {
        return res.status(404).json({ ok: false, erro: 'Turno da escala não encontrado.' });
      }

      dbMaster.run(
        "UPDATE escala_freelancers SET status = 'pago', forma_pagamento = ?, pago_em = datetime('now', 'localtime') WHERE id = ?",
        [formaPgto, escalaId],
        function(errUp) {
          if (errUp) return res.status(500).json({ ok: false, erro: errUp.message });

          const fId = turno.funcionario_id || 0;
          const valorDiaria = parseFloat(turno.valor_diaria) || 0;
          const obsDesc = `Diária Freelancer (${turno.cargo}): ${turno.nome} - Turno ${turno.data_turno}`;

          // 1. Registrar em funcionarios_pagamentos no RH do restaurante
          dbTenant.run(
            `INSERT INTO funcionarios_pagamentos (
              funcionario_id, data_pagamento, valor_bruto, total_vales_abatidos, total_consumo_abatido, valor_liquido, observacao
            ) VALUES (?, datetime('now', 'localtime'), ?, 0, 0, ?, ?)`,
            [fId || null, valorDiaria, valorDiaria, `${obsDesc} (Pago via ${formaPgto} por ${operador})`],
            (errPag) => {
              if (errPag) console.error('Erro ao registrar funcionarios_pagamentos:', errPag.message);
            }
          );

          // 2. Registrar em despesas_financeiras para integração com DRE & BI
          dbTenant.run(
            `INSERT INTO despesas_financeiras (
              descricao, categoria, valor, data_competencia, data_vencimento, data_pagamento, status, forma_pagamento, recorrente, observacao
            ) VALUES (?, 'Mão de Obra / Freelancers', ?, ?, date('now', 'localtime'), date('now', 'localtime'), 'Pago', ?, 0, ?)`,
            [
              `Diária Freelancer: ${turno.nome} (${turno.cargo})`,
              valorDiaria,
              turno.data_turno || new Date().toISOString().slice(0, 10),
              formaPgto,
              `Turno ${turno.data_turno} (${turno.periodo}). Quitado via ${formaPgto} por ${operador}.`
            ],
            () => {}
          );

          // 3. Registrar saída na tabela movimentacoes do Caixa (se houver turno aberto ou registro geral)
          dbTenant.get(`SELECT id FROM turnos_caixa WHERE aberto = 1 ORDER BY id DESC LIMIT 1`, [], (errTurno, shift) => {
            const turnoCaixaId = shift ? shift.id : null;
            dbTenant.run(
              `INSERT INTO movimentacoes (
                turno_id, tipo, valor, forma_pagamento, descricao, data
              ) VALUES (?, 'Saída', ?, ?, ?, datetime('now', 'localtime'))`,
              [
                turnoCaixaId,
                valorDiaria,
                formaPgto,
                `Pagamento Freelancer: ${turno.nome} (${turno.cargo})`
              ],
              () => {
                // 4. Integração Super-Admin: Pagamento aprovado imediatamente com custódia de 15 dias para segurança operacional
                dbMaster.run(
                  `INSERT INTO super_admin_custodia_repasses (
                    restaurante_id, restaurante_nome, origem_tipo, origem_id, descricao,
                    beneficiario_tipo, beneficiario_id, beneficiario_nome, beneficiario_chave_pix,
                    valor_bruto, taxa_plataforma, valor_liquido, gateway, status_aprovacao, status,
                    dias_custodia, data_aprovacao, data_liberacao_prevista
                  ) VALUES (
                    ?, (SELECT nome FROM restaurantes WHERE id = ?), 'escala_freelancer', ?, ?,
                    'freelancer', ?, ?, ?,
                    ?, ?, ?, 'asaas', 'aprovado_imediato', 'em_custodia',
                    15, datetime('now', 'localtime'), datetime('now', 'localtime', '+15 days')
                  )`,
                  [
                    turno.restaurante_id,
                    turno.restaurante_id,
                    escalaId,
                    `Diária Freelancer (${turno.cargo}): ${turno.nome} - Turno ${turno.data_turno}`,
                    turno.talento_id || turno.funcionario_id || null,
                    turno.nome,
                    turno.chave_pix || null,
                    valorDiaria,
                    parseFloat((valorDiaria * 0.10).toFixed(2)),
                    parseFloat((valorDiaria * 0.90).toFixed(2))
                  ],
                  (errCust) => {
                    if (errCust) console.warn('[Custódia RH Freelancer] Info:', errCust.message);
                  }
                );

                if (io) {
                  io.emit('escala_freelancer_atualizada');
                  io.emit('rh_update');
                  io.emit('financeiro_atualizado');
                  io.emit('movimentacoes_atualizadas');
                  io.emit('caixa_atualizado');
                  io.emit('super_admin_custodia_atualizada');
                }
                res.json({
                  ok: true,
                  mensagem: `Diária de R$ ${valorDiaria.toFixed(2)} para ${turno.nome} aprovada imediatamente, lançada no Caixa e sob custódia de 15 dias!`
                });
              }
            );
          });
        }
      );
    });
  });

  // 11. GET /api/contratacao/calculadora-custos - Inteligência Trabalhista (CLT Fixo vs. Freelancers Diaristas)
  app.get('/api/contratacao/calculadora-custos', (req, res) => {
    const salarioBase = parseFloat(req.query.salario || 1800);
    const diariaFreelancer = parseFloat(req.query.diaria || 135);
    const diasPicoMes = parseInt(req.query.dias_pico || 8, 10); // Ex: 8 sextas e sábados
    const regime = req.query.regime || 'simples'; // simples, presumido

    // Encargos CLT Gastronomia:
    // FGTS: 8%
    // Provisão 13º: 8.33%
    // Provisão Férias + 1/3 Constitucional: 11.11%
    // Encargo Patronal Previdenciário (Simples Nacional Anexo I/III é embutido no DAS, mas há RAT/FAP ~3% e benefícios)
    // Benefícios médios: VT (R$ 220) + Alimentação local (R$ 220) + Uniforme/EPIs (R$ 40)
    const fgts = salarioBase * 0.08;
    const decimoTerceiro = salarioBase * (1 / 12);
    const feriasMaisTerco = salarioBase * (1.3333 / 12);
    const encargosSociais = regime === 'simples' ? (salarioBase * 0.03) : (salarioBase * 0.28);
    const beneficios = 220 + 220 + 40; // VT + Alimentação + Custos Operacionais
    const custoTotalCLT = salarioBase + fgts + decimoTerceiro + feriasMaisTerco + encargosSociais + beneficios;

    // Custo Diaristas / Freelancers de Pico
    const custoTotalFreelancer = diariaFreelancer * diasPicoMes;
    const economiaMensal = Math.max(0, custoTotalCLT - custoTotalFreelancer);
    const economiaAnual = economiaMensal * 12;

    res.json({
      ok: true,
      comparativo: {
        clt: {
          salario_base: salarioBase,
          fgts,
          provisao_13o: decimoTerceiro,
          provisao_ferias: feriasMaisTerco,
          encargos_sociais: encargosSociais,
          beneficios,
          custo_total_mes: custoTotalCLT
        },
        freelancer: {
          valor_diaria: diariaFreelancer,
          dias_pico_mes: diasPicoMes,
          custo_total_mes: custoTotalFreelancer
        },
        inteligencia: {
          economia_mensal: economiaMensal,
          economia_anual: economiaAnual,
          ponto_equilibrio_diarias: Math.floor(custoTotalCLT / diariaFreelancer),
          parecer_contador: economiaMensal > 0
            ? `Contratar diaristas nos ${diasPicoMes} dias de maior pico economiza R$ ${economiaMensal.toFixed(2)}/mês mantendo a brigada enxuta no restante da semana.`
            : `Para operações com mais de ${Math.floor(custoTotalCLT / diariaFreelancer)} turnos/mês, a contratação CLT torna-se financeiramente mais vantajosa e fideliza o profissional.`
        }
      }
    });
  });

  console.log('✅ [Talent Hub] Módulo de Contratação & Freelancers gastronômicos pronto.');
};
