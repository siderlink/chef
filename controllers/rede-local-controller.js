/**
 * controllers/rede-local-controller.js
 * ═══════════════════════════════════════════════════════════════════════
 * HUB DE REDE LOCAL (LAN ORCHESTRATOR) — CHEF COZINHA
 * ═══════════════════════════════════════════════════════════════════════
 * Permite que toda a operação do restaurante (Garçom Mobile, KDS Cozinha,
 * Impressora Térmica e Caixa PDV) funcione de forma 100% offline na LAN,
 * autodescobindo interfaces de rede e gerando links e QR codes de acesso.
 */

'use strict';

const os = require('os');

/**
 * Obtém os endereços IPv4 locais de todas as interfaces ativas (Wi-Fi e Ethernet)
 */
function getLocalIpAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Pula endereços internos (127.0.0.1) e que não sejam IPv4
      if (iface.family === 'IPv4' && !iface.internal) {
        // Prioriza Wi-Fi e Ethernet comuns
        const isWifi = name.toLowerCase().includes('wi-fi') || name.toLowerCase().includes('wlan') || name.toLowerCase().includes('wireless');
        const isEthernet = name.toLowerCase().includes('eth') || name.toLowerCase().includes('rede local') || name.toLowerCase().includes('local area');
        
        addresses.push({
          interface: name,
          ip: iface.address,
          netmask: iface.netmask,
          isWifi: isWifi,
          isEthernet: isEthernet,
          priority: isWifi ? 1 : (isEthernet ? 2 : 3)
        });
      }
    }
  }

  // Ordena por prioridade (Wi-Fi primeiro para facilidade de conexão mobile)
  addresses.sort((a, b) => a.priority - b.priority);
  return addresses;
}

/**
 * Retorna o IP primário recomendado para os celulares dos garçons conectarem
 */
function getPrimaryLocalIp() {
  const addrs = getLocalIpAddresses();
  if (addrs.length > 0) {
    return addrs[0].ip;
  }
  return '127.0.0.1';
}

/**
 * Monta o resumo da rede local com todas as URLs do sistema
 */
function getLocalNetworkSummary(port = 8080) {
  const addresses = getLocalIpAddresses();
  const primaryIp = getPrimaryLocalIp();
  const hostname = os.hostname();

  const baseUrl = `http://${primaryIp}:${port}`;

  return {
    hostname,
    port,
    primary_ip: primaryIp,
    all_ips: addresses,
    urls: {
      caixa: `http://localhost:${port}/index.html`,
      caixa_lan: `${baseUrl}/index.html`,
      garcom_mobile: `${baseUrl}/garcom.html`,
      garcom_mobile_alt: `${baseUrl}/index.html?view=mobile`,
      cozinha_kds: `${baseUrl}/cozinha.html`,
      cardapio_digital: `${baseUrl}/cardapio.html`,
      status: `${baseUrl}/api/status`
    },
    servicos_locais: {
      http_server: 'online',
      websockets: 'online',
      sqlite_local: 'online',
      offline_first_pronto: true
    },
    instrucoes_conexao: [
      '1. Conecte o celular do garçom ou tablet na mesma rede Wi-Fi deste computador.',
      `2. No navegador do celular, acesse: ${baseUrl}/garcom.html`,
      '3. Todos os pedidos enviados aparecerão instantaneamente na Cozinha e no Caixa.'
    ]
  };
}

/**
 * Registra rotas de Rede Local no Express
 */
function initRoutes(app, port = 8080) {
  if (!app) return;

  // GET /api/rede-local/info — retorna informações de IP, URLs e conexões
  app.get('/api/rede-local/info', (req, res) => {
    try {
      const summary = getLocalNetworkSummary(port);
      res.json({ ok: true, ...summary });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // GET /api/rede-local/ping — teste de conectividade rápida de dispositivos mobile
  app.get('/api/rede-local/ping', (req, res) => {
    res.json({
      ok: true,
      servidor: 'Chef Cozinha Local Hub',
      timestamp: new Date().toISOString(),
      cliente_ip: req.ip
    });
  });
}

module.exports = {
  getLocalIpAddresses,
  getPrimaryLocalIp,
  getLocalNetworkSummary,
  initRoutes
};
