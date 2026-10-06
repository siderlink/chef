/**
 * tracking-loader.js — Script global de inicialização dinâmica de Google Tag (GTAG) e Meta Pixel
 * Injeta pixels de rastreamento de acordo com o contexto da página (Site de Vendas, Cardápio, Colaborador/Garçom, Home/PDV)
 * e fornece utilitários para disparo de eventos e público-alvo (dono, funcionário, cliente, visitante).
 *
 * Além disso, registra acessos geográficos em tempo real para o Live View (Globo 3D / Heatmap) do Super Admin:
 * - 🟢 Verde Limão (#a3e635 / #ccff00): Acessos ao Site / Landing Page / Cardápio Público
 * - 🔵 Azul (#3b82f6 / #00b4d8): Acessos à tela de Login e tentativas de autenticação
 * - 🟢 Verde Normal (#22c55e / #16a34a): Login Aprovado / Sessão Ativa / Pedidos Concluídos
 */
(function () {
  'use strict';

  window.ChefTracking = {
    config: null,
    context: 'home',

    init: function (pageContext) {
      this.context = pageContext || 'home';
      var self = this;

      // Dispara ping de tráfego geográfico em tempo real
      var defaultTipo = 'site';
      var pathname = (window.location.pathname || '').toLowerCase();
      if (self.context === 'login' || pathname.indexOf('login') !== -1 || pathname.indexOf('entrar') !== -1) {
        defaultTipo = 'login';
      } else if (self.context === 'site' || self.context === 'cardapio' || self.context === 'home') {
        defaultTipo = 'site';
      }
      self.trackGeoHit(defaultTipo);

      fetch('/api/public/tracking-config')
        .then(function (res) { return res.json(); })
        .then(function (data) {
          if (data && data.ok && data.config) {
            self.config = data.config;
            self.injectScripts();
          }
        })
        .catch(function (err) {
          console.warn('[Tracking] Não foi possível carregar configurações de rastreamento:', err);
        });
    },

    // Envia beacon geográfico ao servidor para alimentar o Live View 3D / Heatmap
    trackGeoHit: function (tipoOverride, extra) {
      try {
        var tipo = tipoOverride || 'site';
        var payload = {
          tipo: tipo,
          path: window.location.pathname || '/',
          referrer: document.referrer || '',
          userAgent: navigator.userAgent || ''
        };
        if (extra && typeof extra === 'object') {
          for (var k in extra) {
            if (Object.prototype.hasOwnProperty.call(extra, k)) {
              payload[k] = extra[k];
            }
          }
        }

        fetch('/api/public/geo-hit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          keepalive: true
        }).catch(function () {
          if (navigator.sendBeacon) {
            var blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
            navigator.sendBeacon('/api/public/geo-hit', blob);
          }
        });
      } catch (e) {}
    },

    injectScripts: function () {
      var cfg = this.config;
      if (!cfg) return;

      var ctx = this.context; // 'site', 'cardapio', 'colaborador', 'home', 'login'
      
      var gtagId = cfg['gtag_' + ctx] || cfg['gtag_global'];
      var pixelId = cfg['pixel_' + ctx] || cfg['pixel_global'];

      // 1. Google Tag Manager / GTAG Injection
      if (gtagId && gtagId.trim() && !window._gtagInjected) {
        window._gtagInjected = true;
        var gScript = document.createElement('script');
        gScript.async = true;
        gScript.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(gtagId.trim());
        document.head.appendChild(gScript);

        window.dataLayer = window.dataLayer || [];
        function gtag() { window.dataLayer.push(arguments); }
        window.gtag = gtag;
        gtag('js', new Date());
        gtag('config', gtagId.trim(), { page_path: window.location.pathname });

        console.log('✅ [Tracking] Google Tag (' + gtagId + ') ativado para [' + ctx + ']');
      }

      // 2. Meta Pixel Injection
      if (pixelId && pixelId.trim() && !window._pixelInjected) {
        window._pixelInjected = true;
        (function (f, b, e, v, n, t, s) {
          if (f.fbq) return; n = f.fbq = function () {
            n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
          };
          if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0';
          n.queue = []; t = b.createElement(e); t.async = !0;
          t.src = v; s = b.getElementsByTagName(e)[0];
          s.parentNode.insertBefore(t, s);
        })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');

        window.fbq('init', pixelId.trim());
        window.fbq('track', 'PageView');

        console.log('✅ [Tracking] Meta Pixel (' + pixelId + ') ativado para [' + ctx + ']');
      }
    },

    // Disparo de evento personalizado (compatível com GTAG e Meta Pixel)
    trackEvent: function (eventName, eventParams, customRole) {
      var params = eventParams || {};
      if (customRole) {
        params.user_role = customRole; // 'dono', 'funcionario', 'cliente', 'afiliado'
      }

      if (window.gtag) {
        window.gtag('event', eventName, params);
      }
      if (window.fbq) {
        window.fbq('trackCustom', eventName, params);
      }
    }
  };
})();
