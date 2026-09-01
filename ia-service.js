/**
 * ia-service.js
 * Módulo de Inteligência Artificial para Restaurantes (Google Gemini)
 * Fornece inteligência de vendas, criação de promoções e consultoria estratégica.
 */

'use strict';

const https = require('https');

const DEFAULT_MODEL = 'gemini-2.5-flash';

/**
 * Faz requisição HTTP POST para a API do Gemini
 */
function callGeminiApi(apiKey, model, systemInstruction, prompt, isJson = false) {
  return new Promise((resolve, reject) => {
    if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
      return reject(new Error('Chave de API do Gemini não configurada para este restaurante.'));
    }

    const cleanModel = (model || DEFAULT_MODEL).trim();
    const cleanKey = apiKey.trim();

    const requestBody = {
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2048,
        topP: 0.95
      }
    };

    if (systemInstruction) {
      requestBody.systemInstruction = {
        parts: [{ text: systemInstruction }]
      };
    }

    if (isJson) {
      requestBody.generationConfig.responseMimeType = 'application/json';
    }

    const postData = JSON.stringify(requestBody);

    const options = {
      hostname: 'generativelanguage.googleapis.com',
      port: 443,
      path: `/v1beta/models/${encodeURIComponent(cleanModel)}:generateContent?key=${encodeURIComponent(cleanKey)}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 30000
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400 || parsed.error) {
            const msg = (parsed.error && parsed.error.message) || `Erro HTTP ${res.statusCode} na API Gemini.`;
            return reject(new Error(msg));
          }

          const candidate = parsed.candidates && parsed.candidates[0];
          const text = candidate?.content?.parts?.[0]?.text || '';
          resolve({ text, raw: parsed });
        } catch (err) {
          reject(new Error('Resposta inválida da API do Gemini: ' + err.message));
        }
      });
    });

    req.on('error', (err) => reject(new Error('Falha de conexão com a API do Gemini: ' + err.message)));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Tempo limite de conexão excedido ao consultar o Gemini (30s).'));
    });

    req.write(postData);
    req.end();
  });
}

/**
 * Testa se uma chave API do Gemini é válida
 */
async function testarApiKey(apiKey, model = DEFAULT_MODEL) {
  const modelsToTry = Array.from(new Set([model, 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'])).filter(Boolean);
  let lastErr = null;
  for (const m of modelsToTry) {
    try {
      const res = await callGeminiApi(apiKey, m, 'Você é um validador de chave de IA.', 'Responda apenas: OK', false);
      return { ok: true, modelo: m, resposta: res.text.trim() };
    } catch (err) {
      lastErr = err;
    }
  }
  return { ok: false, erro: lastErr ? lastErr.message : 'Falha ao validar chave API do Gemini.' };
}

/**
 * Gera sugestões inteligentes de promoções e combos com base no cardápio real e vendas
 */
async function gerarPromocoesIA({ apiKey, model, contextoRestaurante, cardapio, historicoVendas, comprasRecentes, objetivo }) {
  const systemInstruction = `Você é o Diretor Comercial e Estrategista de Vendas com IA de elite do sistema Chef Cozinha.
Seu objetivo é criar promoções e combos inteligentes para o restaurante lucrar mais, aumentar o ticket médio e fidelizar clientes.
Use dados reais de estoque, margem de lucro, validade e variação de compras para recomendar produtos certos para promoção (ex.: queimar estoque alto, priorizar alta margem, rotacionar itens perto do vencimento, proteger itens com margem baixa).
Você deve responder EXCLUSIVAMENTE em formato JSON compatível com o schema solicitado, sem markdown ao redor do json.`;

  const resumoCardapio = (cardapio || []).map(p => ({
    id: p.id,
    nome: p.nome,
    categoria: p.categoria,
    preco: p.preco,
    categoria_fiscal: p.categoria_fiscal || 'Alimentacao',
    preco_custo: p.preco_custo,
    margem_percentual: p.margem_percentual,
    estoque: p.estoque,
    status_estoque: p.status_estoque,
    validade: p.validade || null,
    ultimo_preco_compra: p.ultimo_preco_compra,
    variacao_preco_compra_90d: p.variacao_preco_compra_90d
  })).filter(p => p.nome);

  const resumoCompras = (comprasRecentes || []).slice(0, 60).map(c => ({
    produto_id: c.produto_id,
    nome: c.nome,
    valor_unitario: c.valor_unitario,
    data_nota: c.data_nota
  }));

  const prompt = `Analise o cardápio, o estoque, as margens e as vendas deste restaurante e crie 3 a 5 sugestões de PROMOÇÕES / COMBOS DE ALTO IMPACTO.

DADOS DO RESTAURANTE:
- Identidade / Contexto: ${contextoRestaurante || 'Restaurante / Bar / Lanchonete padrão'}
- Foco atual: ${objetivo || 'Aumentar faturamento e ticket médio'}
- Total de produtos no cardápio: ${resumoCardapio.length}
- Produtos cadastrados (com estoque, margem, validade e variação de compra): ${JSON.stringify(resumoCardapio.slice(0, 50))}

HISTÓRICO RECENTE DE VENDAS (se houver):
${JSON.stringify(historicoVendas || {})}

COMPRAS DOS ÚLTIMOS 90 DIAS (custo reais das notas, se houver):
${JSON.stringify(resumoCompras)}

Regras de inteligência:
1. Se o estoque de um produto está alto/'ok' e tem boa margem: ótimo candidato para combo/estímulo.
2. Se um produto está 'esgotado' ou sem estoque garantido: NUNCA promova como item principal, ou avise para reabastecer antes.
3. Se a validade/vencimento está próxima (e o produto já vence): sugira promoção de giro rápido para não perder produto.
4. Use margem_percentual para garantir que a promoção ainda dê lucro (não sugira preço abaixo do preco_custo).
5. Se ultimo_preco_compra subiu ('variacao_preco_compra_90d' positivo): atenção à margem no preço promocional.
6. Dê preferência a produtos que vendem bem (historicoVendas.mais_vendidos) e têm margem saudável.

Retorne um JSON com a seguinte estrutura:
{
  "analise_estrategica": "Breve diagnóstico do cardápio, estoque e potencial de vendas (máx 2 parágrafos)",
  "promocoes": [
    {
      "titulo": "Nome criativo e chamativo da promoção / combo",
      "tipo": "combo" | "desconto_dia" | "compre_ganhe" | "fidelidade",
      "emoji": "🍔",
      "descricao": "Descrição irresistível para o cliente final",
      "produtos_envolvidos": ["Nome do Produto 1", "Nome do Produto 2"],
      "preco_original": 50.00,
      "preco_promocional": 42.90,
      "desconto_percentual": 14,
      "motivo_estrategico": "Por que esta promoção aumenta o lucro e giro deste restaurante, citando estoque/margem/validade quando aplicável",
      "dias_recomendados": ["Terça", "Quarta", "Domingo"],
      "copy_whatsapp": "Texto curto pronto para disparar no WhatsApp com emojis chamando para pedir",
      "copy_instagram": "Legenda com hashtags para post no feed ou stories do Instagram"
    }
  ]
}`;

  const res = await callGeminiApi(apiKey, model, systemInstruction, prompt, true);
  try {
    let cleanText = res.text.trim();
    if (cleanText.startsWith('```json')) cleanText = cleanText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    else if (cleanText.startsWith('```')) cleanText = cleanText.replace(/^```\s*/, '').replace(/\s*```$/, '');
    return JSON.parse(cleanText);
  } catch (err) {
    throw new Error('Falha ao interpretar resposta estruturada da IA: ' + err.message);
  }
}

/**
 * Gera copies de marketing e mensagens de vendas para o restaurante
 */
async function gerarCopyMarketing({ apiKey, model, contextoRestaurante, produtos, promocao, canal = 'whatsapp' }) {
  const systemInstruction = `Você é um Copywriter especialista em gastronomia e delivery para o Chef Cozinha. Crie copies persuasivas, apetitosas e com gatilhos mentais para vendas imediatas.`;

  const prompt = `Crie 3 opções de mensagens de vendas para o canal: ${canal.toUpperCase()}

INFORMAÇÕES:
- Restaurante: ${contextoRestaurante || 'Nosso Restaurante'}
- Promoção / Prato: ${promocao || 'Nossos pratos especiais'}
- Produtos em destaque: ${JSON.stringify(produtos || [])}

Retorne um JSON com:
{
  "opcoes": [
    {
      "estilo": "Urgência e Fome" | "Casual e Amigável" | "Exclusivo / VIP",
      "titulo": "Título ou Linha de Assunto",
      "texto": "Texto completo formatado com quebras de linha e emojis pronto para copiar"
    }
  ]
}`;

  const res = await callGeminiApi(apiKey, model, systemInstruction, prompt, true);
  try {
    let cleanText = res.text.trim();
    if (cleanText.startsWith('```json')) cleanText = cleanText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    else if (cleanText.startsWith('```')) cleanText = cleanText.replace(/^```\s*/, '').replace(/\s*```$/, '');
    return JSON.parse(cleanText);
  } catch (err) {
    throw new Error('Falha ao formatar copies de vendas: ' + err.message);
  }
}

/**
 * Chat consultivo com o Assistente de Vendas IA
 */
async function consultarAssistenteVendas({ apiKey, model, contextoRestaurante, cardapio, historicoVendas, historicoMensagens, pergunta }) {
  const systemInstruction = `Você é o Consultor de Vendas IA do restaurante no sistema Chef Cozinha.
Você tem acesso aos produtos cadastrados e vendas do restaurante.
Seja prático, motivador, estratégico e focado em aumentar vendas, margem de lucro e fidelização.
Responda em português com formatação limpa (Markdown, listas, emojis).`;

  const produtosSimplificados = (cardapio || []).slice(0, 40).map(p => `${p.categoria}: ${p.nome} (R$ ${Number(p.preco || 0).toFixed(2)})`).join('\n');

  let prompt = `CONTEXTO DO RESTAURANTE:
${contextoRestaurante || 'Restaurante / Estabelecimento Comercial'}

CARDÁPIO ATUAL DO RESTAURANTE:
${produtosSimplificados || 'Nenhum produto cadastrado ainda.'}

HISTÓRICO RECENTE:
${JSON.stringify(historicoVendas || {})}
`;

  if (historicoMensagens && Array.isArray(historicoMensagens) && historicoMensagens.length > 0) {
    prompt += `\nCONVERSA ANTERIOR:\n` + historicoMensagens.map(m => `${m.role === 'user' ? 'Dono' : 'Consultor IA'}: ${m.text}`).join('\n');
  }

  prompt += `\n\nPERGUNTA DO DONO DO RESTAURANTE:\n${pergunta}`;

  const res = await callGeminiApi(apiKey, model, systemInstruction, prompt, false);
  return { resposta: res.text };
}


/**
 * Pesquisa inteligente de estabelecimento por geolocalização (Deep Research / OSM + Gemini)
 */

/**
 * Pesquisa inteligente de estabelecimento por geolocalização e Deep Research (Google Meu Negócio & Cardápio)
 */
function pesquisarEstabelecimentoGeo({ lat, lng, apiKey, model }) {
  return new Promise(async (resolve) => {
    try {
      if (!lat || !lng) {
        return resolve({ ok: false, erro: 'Coordenadas não informadas' });
      }

      // 1. Geocodificação reversa via OpenStreetMap Nominatim
      const osmData = await new Promise((resOsm) => {
        const https = require('https');
        const options = {
          hostname: 'nominatim.openstreetmap.org',
          path: `/reverse?format=json&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&zoom=18&addressdetails=1`,
          method: 'GET',
          headers: {
            'User-Agent': 'ChefCozinhaDeepSearch/2.0 (suporte@chefcozinha.com)'
          },
          timeout: 6000
        };
        const req = https.request(options, (res) => {
          let data = '';
          res.on('data', chunk => { data += chunk; });
          res.on('end', () => {
            try { resOsm(JSON.parse(data)); } catch (e) { resOsm(null); }
          });
        });
        req.on('error', () => resOsm(null));
        req.on('timeout', () => { req.destroy(); resOsm(null); });
        req.end();
      });

      const addr = osmData && osmData.address ? osmData.address : {};
      const road = addr.road || addr.pedestrian || addr.street || '';
      const houseNumber = addr.house_number || '';
      const suburb = addr.suburb || addr.neighbourhood || addr.city_district || '';
      const city = addr.city || addr.town || addr.municipality || 'São Paulo';
      const state = addr.state || 'SP';
      const postcode = addr.postcode || '';
      const osmName = osmData && osmData.name ? osmData.name : (addr.amenity || addr.shop || '');

      let enderecoFormatado = [road, houseNumber].filter(Boolean).join(', ');
      if (suburb) enderecoFormatado += (enderecoFormatado ? ' - ' : '') + suburb;
      if (city) enderecoFormatado += (enderecoFormatado ? ', ' : '') + city;
      if (postcode) enderecoFormatado += ' - CEP ' + postcode;

      let nomeEstabelecimento = osmName;
      let categoria = 'a_la_carte';
      let telefone = '';
      let socios = '';
      let avaliacao = '';
      let produtos = [];

      // 2. Deep Research com IA Gemini para buscar perfil do Google Meu Negócio e Cardápio
      if (apiKey) {
        try {
          const prompt = `Você é um assistente de Deep Research comercial e geográfico para restaurantes.
Um novo restaurante está sendo configurado nas coordenadas GPS: ${lat}, ${lng}.
Dados obtidos do local:
- Ponto/Nome: "${osmName}"
- Endereço: "${road}, ${houseNumber} - ${suburb}, ${city} - ${state} CEP ${postcode}"
- Tipo OSM: "${osmData?.type || ''}"

Com base nestes dados e no perfil comercial deste estabelecimento (ou no perfil gastronômico típico de restaurantes de sucesso neste bairro/cidade), pesquise/construa os dados cadastrais e o cardápio completo do restaurante para auto-preenchimento no sistema.

Retorne APENAS um JSON no seguinte formato:
{
  "nome": "Nome comercial do restaurante (ex: ${osmName || 'Restaurante & Bar ' + suburb})",
  "endereco": "${enderecoFormatado}",
  "telefone": "(11) 98888-7777",
  "socios": "Nome do sócio / proprietário responsável",
  "categoria": "a_la_carte",
  "avaliacao": "4.8 estrelas (120 avaliações no Google)",
  "produtos": [
    { "nome": "Prato Principal 1", "categoria": "Pratos Principais", "preco": 42.90, "emoji": "🍽️", "descricao": "Ingredientes e descrição" },
    { "nome": "Prato Principal 2", "categoria": "Pratos Principais", "preco": 36.90, "emoji": "🥩", "descricao": "Ingredientes e descrição" },
    { "nome": "Entrada / Porção", "categoria": "Entradas", "preco": 28.50, "emoji": "🧆", "descricao": "Porção especial da casa" },
    { "nome": "Bebida / Suco Natural", "categoria": "Bebidas", "preco": 9.90, "emoji": "🧃", "descricao": "Suco natural 500ml" },
    { "nome": "Sobremesa Especial", "categoria": "Sobremesas", "preco": 14.90, "emoji": "🍮", "descricao": "Sobremesa artesanal" }
  ]
}`;

          const rawIa = await callGeminiApi(
            apiKey,
            model || DEFAULT_MODEL,
            'Você é um assistente sênior de inteligência comercial e pesquisa de restaurantes.',
            prompt,
            true
          );

          const parsed = JSON.parse(rawIa);
          if (parsed && typeof parsed === 'object') {
            if (parsed.nome) nomeEstabelecimento = parsed.nome;
            if (parsed.endereco) enderecoFormatado = parsed.endereco;
            if (parsed.categoria) categoria = parsed.categoria;
            if (parsed.telefone) telefone = parsed.telefone;
            if (parsed.socios) socios = parsed.socios;
            if (parsed.avaliacao) avaliacao = parsed.avaliacao;
            if (Array.isArray(parsed.produtos) && parsed.produtos.length > 0) {
              produtos = parsed.produtos;
            }
          }
        } catch (errIa) {
          console.warn('[DeepResearch IA Error]', errIa.message);
        }
      }

      if (!nomeEstabelecimento && suburb) {
        nomeEstabelecimento = 'Restaurante ' + suburb;
      }

      if (produtos.length === 0) {
        produtos = [
          { nome: 'Prato Executivo Especial', categoria: 'Pratos Principais', preco: 38.90, emoji: '🍽️', descricao: 'Acompanha arroz, feijão, fritas e salada' },
          { nome: 'Porção de Batata com Queijo', categoria: 'Entradas', preco: 26.90, emoji: '🍟', descricao: 'Batata crocante com cheddar e bacon' },
          { nome: 'Suco Natural da Fruta', categoria: 'Bebidas', preco: 8.90, emoji: '🧃', descricao: 'Laranja, Limão ou Maracujá' },
          { nome: 'Sobremesa da Casa', categoria: 'Sobremesas', preco: 12.90, emoji: '🍮', descricao: 'Pudim de leite condensado artesanal' }
        ];
      }

      resolve({
        ok: true,
        dados: {
          nome: nomeEstabelecimento || 'Meu Restaurante',
          endereco: enderecoFormatado || '',
          telefone: telefone || '',
          socios: socios || '',
          avaliacao: avaliacao || '',
          categoria: categoria || 'a_la_carte',
          bairro: suburb || '',
          cidade: city || '',
          produtos: produtos,
          lat: parseFloat(lat),
          lng: parseFloat(lng)
        }
      });
    } catch (e) {
      resolve({ ok: false, erro: e.message });
    }
  });
}

module.exports = {
  pesquisarEstabelecimentoGeo,
  DEFAULT_MODEL,
  callGeminiApi,
  testarApiKey,
  gerarPromocoesIA,
  gerarCopyMarketing,
  consultarAssistenteVendas
};
