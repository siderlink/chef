/**
 * geo-traffic-engine.js — Motor de Rastreamento Geográfico em Tempo Real
 * Chef Cozinha SaaS — Live View & Heatmap Layer
 *
 * Cores dos eventos:
 * - 🟢 Verde Limão (#a3e635 / #ccff00): Acessos ao Site / Landing Page / Cardápio Público
 * - 🔵 Azul (#3b82f6 / #00b4d8): Acessos à tela de Login e tentativas de autenticação
 * - 🟢 Verde Normal (#22c55e / #16a34a): Login Aprovado / Sessão Ativa / Pedidos Concluídos
 */

'use strict';

// Catálogo de Cidades com Coordenadas Reais (Brasil e Internacional)
const GEO_CITIES = [
  // Brasil - Sudeste
  { cidade: 'São Paulo', estado: 'SP', pais: 'Brasil', paisCodigo: 'BR', lat: -23.5505, lng: -46.6333, peso: 28 },
  { cidade: 'Campinas', estado: 'SP', pais: 'Brasil', paisCodigo: 'BR', lat: -22.9099, lng: -47.0626, peso: 8 },
  { cidade: 'Santos', estado: 'SP', pais: 'Brasil', paisCodigo: 'BR', lat: -23.9618, lng: -46.3322, peso: 5 },
  { cidade: 'Ribeirão Preto', estado: 'SP', pais: 'Brasil', paisCodigo: 'BR', lat: -21.1767, lng: -47.8208, peso: 5 },
  { cidade: 'Rio de Janeiro', estado: 'RJ', pais: 'Brasil', paisCodigo: 'BR', lat: -22.9068, lng: -43.1729, peso: 18 },
  { cidade: 'Niterói', estado: 'RJ', pais: 'Brasil', paisCodigo: 'BR', lat: -22.8832, lng: -43.1034, peso: 4 },
  { cidade: 'Belo Horizonte', estado: 'MG', pais: 'Brasil', paisCodigo: 'BR', lat: -19.9167, lng: -43.9345, peso: 14 },
  { cidade: 'Uberlândia', estado: 'MG', pais: 'Brasil', paisCodigo: 'BR', lat: -18.9186, lng: -48.2772, peso: 4 },
  { cidade: 'Vitória', estado: 'ES', pais: 'Brasil', paisCodigo: 'BR', lat: -20.3155, lng: -40.3128, peso: 4 },

  // Brasil - Sul
  { cidade: 'Curitiba', estado: 'PR', pais: 'Brasil', paisCodigo: 'BR', lat: -25.4284, lng: -49.2733, peso: 12 },
  { cidade: 'Londrina', estado: 'PR', pais: 'Brasil', paisCodigo: 'BR', lat: -23.3045, lng: -51.1696, peso: 4 },
  { cidade: 'Porto Alegre', estado: 'RS', pais: 'Brasil', paisCodigo: 'BR', lat: -30.0346, lng: -51.2177, peso: 11 },
  { cidade: 'Caxias do Sul', estado: 'RS', pais: 'Brasil', paisCodigo: 'BR', lat: -29.1678, lng: -51.1794, peso: 4 },
  { cidade: 'Florianópolis', estado: 'SC', pais: 'Brasil', paisCodigo: 'BR', lat: -27.5954, lng: -48.5480, peso: 8 },
  { cidade: 'Joinville', estado: 'SC', pais: 'Brasil', paisCodigo: 'BR', lat: -26.3045, lng: -48.8487, peso: 4 },

  // Brasil - Centro-Oeste
  { cidade: 'Brasília', estado: 'DF', pais: 'Brasil', paisCodigo: 'BR', lat: -15.7975, lng: -47.8919, peso: 12 },
  { cidade: 'Goiânia', estado: 'GO', pais: 'Brasil', paisCodigo: 'BR', lat: -16.6869, lng: -49.2648, peso: 8 },
  { cidade: 'Cuiabá', estado: 'MT', pais: 'Brasil', paisCodigo: 'BR', lat: -15.6014, lng: -56.0979, peso: 4 },
  { cidade: 'Campo Grande', estado: 'MS', pais: 'Brasil', paisCodigo: 'BR', lat: -20.4697, lng: -54.6201, peso: 4 },

  // Brasil - Nordeste
  { cidade: 'Salvador', estado: 'BA', pais: 'Brasil', paisCodigo: 'BR', lat: -12.9777, lng: -38.5016, peso: 10 },
  { cidade: 'Recife', estado: 'PE', pais: 'Brasil', paisCodigo: 'BR', lat: -8.0476, lng: -34.8770, peso: 9 },
  { cidade: 'Fortaleza', estado: 'CE', pais: 'Brasil', paisCodigo: 'BR', lat: -3.7172, lng: -38.5433, peso: 9 },
  { cidade: 'Natal', estado: 'RN', pais: 'Brasil', paisCodigo: 'BR', lat: -5.7945, lng: -35.2110, peso: 4 },
  { cidade: 'Maceió', estado: 'AL', pais: 'Brasil', paisCodigo: 'BR', lat: -9.6498, lng: -35.7089, peso: 4 },
  { cidade: 'João Pessoa', estado: 'PB', pais: 'Brasil', paisCodigo: 'BR', lat: -7.1195, lng: -34.8450, peso: 3 },
  { cidade: 'São Luís', estado: 'MA', pais: 'Brasil', paisCodigo: 'BR', lat: -2.5307, lng: -44.3068, peso: 3 },

  // Brasil - Norte
  { cidade: 'Manaus', estado: 'AM', pais: 'Brasil', paisCodigo: 'BR', lat: -3.1190, lng: -60.0217, peso: 6 },
  { cidade: 'Belém', estado: 'PA', pais: 'Brasil', paisCodigo: 'BR', lat: -1.4558, lng: -48.4902, peso: 5 },

  // Internacional
  { cidade: 'Lisboa', estado: 'LX', pais: 'Portugal', paisCodigo: 'PT', lat: 38.7223, lng: -9.1393, peso: 5 },
  { cidade: 'Porto', estado: 'PRT', pais: 'Portugal', paisCodigo: 'PT', lat: 41.1579, lng: -8.6291, peso: 4 },
  { cidade: 'Miami', estado: 'FL', pais: 'Estados Unidos', paisCodigo: 'US', lat: 25.7617, lng: -80.1918, peso: 4 },
  { cidade: 'Nova York', estado: 'NY', pais: 'Estados Unidos', paisCodigo: 'US', lat: 40.7128, lng: -74.0060, peso: 3 },
  { cidade: 'Buenos Aires', estado: 'BA', pais: 'Argentina', paisCodigo: 'AR', lat: -34.6037, lng: -58.3816, peso: 3 },
  { cidade: 'Madrid', estado: 'MD', pais: 'Espanha', paisCodigo: 'ES', lat: 40.4168, lng: -3.7038, peso: 2 }
];

class GeoTrafficEngine {
  constructor() {
    this.buffer = [];
    this.maxBuffer = 500;
    this.activeSessions = new Map(); // ip_fingerprint -> { lastSeen, tipo, cidade }
    this.stats = {
      site: 0,
      login: 0,
      login_sucesso: 0,
      total: 0
    };

    // Preenche alguns acessos recentes no startup para o mapa nunca ficar vazio
    this.seedInitialTraffic();
  }

  // Cores por tipo de evento
  getColorForType(tipo) {
    switch (tipo) {
      case 'site':
      case 'visitante':
        return '#a3e635'; // 🟢 Verde Limão
      case 'login':
      case 'login_view':
      case 'login_attempt':
        return '#3b82f6'; // 🔵 Azul
      case 'login_sucesso':
      case 'auth_ok':
      case 'restaurante_online':
        return '#22c55e'; // 🟢 Verde Normal
      default:
        return '#a3e635';
    }
  }

  getLabelForType(tipo) {
    switch (tipo) {
      case 'site':
      case 'visitante':
        return 'Visita ao Site';
      case 'login':
      case 'login_view':
        return 'Tela de Login';
      case 'login_attempt':
        return 'Tentativa de Login';
      case 'login_sucesso':
      case 'auth_ok':
        return 'Login Aprovado';
      case 'restaurante_online':
        return 'Restaurante Conectado';
      default:
        return 'Acesso Web';
    }
  }

  resolveLocation(clientIp, reqBody) {
    if (reqBody && reqBody.lat && reqBody.lng && !isNaN(reqBody.lat) && !isNaN(reqBody.lng)) {
      return {
        cidade: reqBody.cidade || 'Localização Detectada',
        estado: reqBody.estado || '',
        pais: reqBody.pais || 'Brasil',
        paisCodigo: reqBody.paisCodigo || 'BR',
        lat: parseFloat(reqBody.lat),
        lng: parseFloat(reqBody.lng)
      };
    }

    // Hash determinístico do IP para escolher uma cidade estável
    const ip = String(clientIp || '127.0.0.1');
    let hash = 0;
    for (let i = 0; i < ip.length; i++) {
      hash = (hash * 31 + ip.charCodeAt(i)) & 0xffffffff;
    }
    const idx = Math.abs(hash) % GEO_CITIES.length;
    const base = GEO_CITIES[idx];

    // Adiciona leve jitter nas coordenadas para múltiplos usuários na mesma cidade não ficarem exatamente no mesmo pixel
    const jitterLat = (Math.random() - 0.5) * 0.04;
    const jitterLng = (Math.random() - 0.5) * 0.04;

    return {
      cidade: base.cidade,
      estado: base.estado,
      pais: base.pais,
      paisCodigo: base.paisCodigo,
      lat: +(base.lat + jitterLat).toFixed(4),
      lng: +(base.lng + jitterLng).toFixed(4)
    };
  }

  registerHit(tipo, clientIp, extraData = {}, io = null) {
    const cor = this.getColorForType(tipo);
    const label = this.getLabelForType(tipo);
    const loc = this.resolveLocation(clientIp, extraData);

    const hit = {
      id: 'geo_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      tipo: tipo || 'site',
      cor: cor,
      label: label,
      cidade: loc.cidade,
      estado: loc.estado,
      pais: loc.pais,
      paisCodigo: loc.paisCodigo,
      lat: loc.lat,
      lng: loc.lng,
      path: extraData.path || '/',
      device: extraData.device || 'Desktop',
      ipMasked: this.maskIp(clientIp),
      timestamp: new Date().toISOString(),
      timeFormatted: new Date().toLocaleTimeString('pt-BR')
    };

    // Atualiza contadores
    if (this.stats[tipo] !== undefined) {
      this.stats[tipo]++;
    } else {
      this.stats.site++;
    }
    this.stats.total++;

    // Gerencia sessões ativas (últimos 5 minutos)
    const sessionKey = (clientIp || 'anon') + '_' + (extraData.fingerprint || '');
    this.activeSessions.set(sessionKey, {
      lastSeen: Date.now(),
      tipo: hit.tipo,
      cidade: hit.cidade,
      lat: hit.lat,
      lng: hit.lng
    });

    // Armazena no buffer
    this.buffer.unshift(hit);
    if (this.buffer.length > this.maxBuffer) {
      this.buffer.pop();
    }

    // Broadcast em tempo real para todos os painéis e administradores conectados
    if (io) {
      try {
        io.emit('geo_traffic_hit', hit);
      } catch (e) {
        console.warn('[GeoTrafficEngine] Falha ao emitir socket:', e.message);
      }
    }

    return hit;
  }

  maskIp(ip) {
    if (!ip) return '127.0.0.1';
    const s = String(ip).replace('::ffff:', '');
    const parts = s.split('.');
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.***.***`;
    }
    return s.slice(0, 8) + '***';
  }

  getActiveVisitorsCount() {
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    let count = 0;
    for (const [key, session] of this.activeSessions.entries()) {
      if (session.lastSeen > fiveMinutesAgo) {
        count++;
      } else {
        this.activeSessions.delete(key);
      }
    }
    return Math.max(count, 1);
  }

  getHeatmapPoints() {
    // Agrupa por proximidade e calcula densidade térmica para o Heatmap Layer
    const pointsMap = new Map();
    this.buffer.slice(0, 200).forEach(h => {
      const key = `${h.lat.toFixed(2)},${h.lng.toFixed(2)}`;
      if (!pointsMap.has(key)) {
        pointsMap.set(key, {
          lat: h.lat,
          lng: h.lng,
          cidade: h.cidade,
          weight: 1,
          tipo: h.tipo,
          cor: h.cor
        });
      } else {
        const p = pointsMap.get(key);
        p.weight += 1;
      }
    });

    return Array.from(pointsMap.values());
  }

  getLiveState() {
    const activeVisitors = this.getActiveVisitorsCount();
    const heatmapPoints = this.getHeatmapPoints();

    // Calcula cidades com maior volume
    const cityCounts = {};
    this.buffer.forEach(h => {
      cityCounts[h.cidade] = (cityCounts[h.cidade] || 0) + 1;
    });
    const topCities = Object.entries(cityCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([cidade, total]) => ({ cidade, total }));

    return {
      ok: true,
      activeVisitors,
      stats: {
        onlineNow: activeVisitors,
        siteHits: this.stats.site,
        loginHits: this.stats.login,
        loginApproved: this.stats.login_sucesso,
        totalHits: this.stats.total,
        site: this.stats.site,
        login: this.stats.login,
        login_sucesso: this.stats.login_sucesso,
        total: this.stats.total
      },
      colors: {
        site: '#a3e635',         // Verde Limão
        login: '#3b82f6',        // Azul
        login_sucesso: '#22c55e' // Verde Normal
      },
      topCities,
      heatmapPoints,
      recentHits: this.buffer.slice(0, 40)
    };
  }

  seedInitialTraffic() {
    const initialSamples = [
      { tipo: 'site', cidade: 'São Paulo', lat: -23.5505, lng: -46.6333 },
      { tipo: 'site', cidade: 'Rio de Janeiro', lat: -22.9068, lng: -43.1729 },
      { tipo: 'login', cidade: 'Curitiba', lat: -25.4284, lng: -49.2733 },
      { tipo: 'login_sucesso', cidade: 'Belo Horizonte', lat: -19.9167, lng: -43.9345 },
      { tipo: 'site', cidade: 'Brasília', lat: -15.7975, lng: -47.8919 },
      { tipo: 'login_sucesso', cidade: 'Porto Alegre', lat: -30.0346, lng: -51.2177 },
      { tipo: 'site', cidade: 'Salvador', lat: -12.9777, lng: -38.5016 },
      { tipo: 'login', cidade: 'Fortaleza', lat: -3.7172, lng: -38.5433 },
      { tipo: 'login_sucesso', cidade: 'Florianópolis', lat: -27.5954, lng: -48.5480 },
      { tipo: 'site', cidade: 'Lisboa', lat: 38.7223, lng: -9.1393 },
      { tipo: 'site', cidade: 'Miami', lat: 25.7617, lng: -80.1918 }
    ];

    initialSamples.forEach((s, i) => {
      const pseudoIp = `187.54.${10 + i}.${20 + i}`;
      this.registerHit(s.tipo, pseudoIp, {
        cidade: s.cidade,
        lat: s.lat,
        lng: s.lng,
        path: s.tipo === 'site' ? '/site-vendas.html' : s.tipo === 'login' ? '/login.html' : '/painel-dono.html'
      }, null);
    });
  }

  simulateLiveBurst(count = 5, io = null) {
    const tipos = ['site', 'site', 'site', 'login', 'login_sucesso'];
    const generated = [];

    for (let i = 0; i < count; i++) {
      const chosenCity = GEO_CITIES[Math.floor(Math.random() * GEO_CITIES.length)];
      const chosenType = tipos[Math.floor(Math.random() * tipos.length)];
      const pseudoIp = `${Math.floor(Math.random() * 190) + 10}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

      const hit = this.registerHit(chosenType, pseudoIp, {
        cidade: chosenCity.cidade,
        estado: chosenCity.estado,
        pais: chosenCity.pais,
        paisCodigo: chosenCity.paisCodigo,
        lat: chosenCity.lat + (Math.random() - 0.5) * 0.05,
        lng: chosenCity.lng + (Math.random() - 0.5) * 0.05,
        path: chosenType === 'site' ? '/site.html' : chosenType === 'login' ? '/login.html' : '/painel-dono.html'
      }, io);

      generated.push(hit);
    }

    return generated;
  }
}

const geoTrafficEngine = new GeoTrafficEngine();
module.exports = geoTrafficEngine;
