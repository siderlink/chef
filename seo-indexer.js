const http = require('http');
const https = require('https');
const url = require('url');

// Lista de motores de busca que aceitam ping de sitemap
const SEARCH_ENGINES = [
  'http://www.google.com/ping?sitemap=',
  'http://www.bing.com/ping?sitemap=',
];

// Lista de serviços de Ping RPC (Mass Pinging / Diretórios)
// Gera pequenos links indexadores e sinais de atualização pela web (Blacklinks orgânicos automatizados)
const RPC_PING_URLS = [
  'http://rpc.pingomatic.com',
  'http://ping.feedburner.com',
  'http://rpc.twingly.com',
  'http://ping.syndic8.com/xmlrpc.php',
  'http://blogsearch.google.com/ping/RPC2'
];

function pingSearchEngines(sitemapUrl, engines = SEARCH_ENGINES) {
  console.log(`\n[SEO Indexer] Disparando notificação de Sitemap para Motores de Busca: ${sitemapUrl}`);
  
  engines.forEach(engine => {
    const pingUrl = engine + encodeURIComponent(sitemapUrl);
    https.get(pingUrl, (res) => {
      console.log(`[SEO Indexer] -> Ping ${engine.split('.')[1]} - Status: ${res.statusCode === 200 ? '200 OK (Aceito)' : res.statusCode}`);
    }).on('error', (e) => {
      console.error(`[SEO Indexer] -> Falha ao pingar ${engine}: ${e.message}`);
    });
  });
}

function xmlRpcPing(siteName, siteUrl, rpcUrls = RPC_PING_URLS) {
  const xmlPayload = `<?xml version="1.0"?>
<methodCall>
  <methodName>weblogUpdates.ping</methodName>
  <params>
    <param><value><string>${siteName}</string></value></param>
    <param><value><string>${siteUrl}</string></value></param>
  </params>
</methodCall>`;

  console.log(`[SEO Indexer] Disparando Mass RPC Pinging para ${rpcUrls.length} diretórios...`);

  rpcUrls.forEach(rpcUrl => {
    try {
      const parsed = url.parse(rpcUrl);
      const reqModule = parsed.protocol === 'https:' ? https : http;
      const options = {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.path,
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml',
          'Content-Length': Buffer.byteLength(xmlPayload)
        }
      };

      const req = reqModule.request(options, (res) => {
         // Silencioso no sucesso para não poluir o log
      });
      req.on('error', (e) => {});
      req.setTimeout(5000, () => req.abort());
      req.write(xmlPayload);
      req.end();
    } catch (e) {}
  });
}

/**
 * Função principal que será chamada pelo servidor.
 * @param {string} domain Domínio base do site (ex: https://cheff.pro)
 * @param {string} title Título do site para enviar aos diretórios
 */
function runAutoIndexer(domain, title, enginesStr, rpcUrlsStr) {
  let engines = SEARCH_ENGINES;
  let rpcUrls = RPC_PING_URLS;
  if (enginesStr) engines = enginesStr.split('\n').map(s=>s.trim()).filter(Boolean);
  if (rpcUrlsStr) rpcUrls = rpcUrlsStr.split('\n').map(s=>s.trim()).filter(Boolean);

  if (!domain || !domain.startsWith('http')) {
     console.log('[SEO Indexer] Domínio inválido (vazio ou sem http). O SEO Indexer foi pulado.');
     return;
  }
  const baseUrl = domain.replace(/\/+$/, '');
  const sitemapUrl = baseUrl + '/sitemap.xml';
  
  pingSearchEngines(sitemapUrl, engines);
  xmlRpcPing(title || 'Sistema Chef Cozinha', baseUrl, rpcUrls);
}

module.exports = {
  runAutoIndexer
};
