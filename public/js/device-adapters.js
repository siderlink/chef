/* ═════════════════════════════════════════════════════════════════════════
   CHEF COZINHA — CONTROLADOR JS DE ADAPTAÇÃO & MULTI-GESTOS NATIVOS
   Suporte Completo a Recursos de Hardware dos Dispositivos:
   - Pressure Touch & Force Touch (Touch, S-Pen, Apple Pencil, 3D Touch)
   - Multi-Gesture & Pinça (Pinch-to-scale para Salão de Mesas, KDS e Cardápio)
   - Toque Longo (Long-Press com feedback tátil e menus contextuais)
   - Swipe Gestures (Arrastar no KDS para Pronto/Espera e fechar modais)
   - Toque Duplo Inteligente (Double-Tap com vibração háptica)
   - Detecção Dinâmica para Z Fold 8, iPad Mini, iPad Pro, Tab S9 e Surface Pro
   ═════════════════════════════════════════════════════════════════════════ */
(function (window, document) {
  'use strict';

  var ChefDeviceAdapter = {
    version: '2026.09.27-v2-gestures',
    currentProfile: null,

    init: function () {
      this.detectAndApply();
      this.setupListeners();
      this.enhanceSpecificScreens();
      ChefGestures.init();
    },

    detectAndApply: function () {
      var w = window.innerWidth || document.documentElement.clientWidth;
      var h = window.innerHeight || document.documentElement.clientHeight;
      var ratio = w / (h || 1);
      var isPortrait = h >= w;
      var isTouch = (navigator.maxTouchPoints && navigator.maxTouchPoints > 0) ||
                    window.matchMedia('(pointer: coarse)').matches;
      var ua = navigator.userAgent || '';
      var isApple = /Macintosh|iPad|iPhone|iPod/.test(ua) && isTouch;
      var isWindows = /Windows/.test(ua);

      var doc = document.documentElement;
      var body = document.body;
      if (!body) return;

      var classPrefixes = [
        'device-touch', 'device-orientation-portrait', 'device-orientation-landscape',
        'device-fold-cover', 'device-fold-inner',
        'device-ipad-mini-portrait', 'device-ipad-mini-landscape',
        'device-ipad-pro-portrait', 'device-ipad-pro-landscape',
        'device-tab-s9-portrait', 'device-tab-s9-landscape',
        'device-surface-portrait', 'device-surface-landscape'
      ];

      for (var i = 0; i < classPrefixes.length; i++) {
        body.classList.remove(classPrefixes[i]);
        doc.classList.remove(classPrefixes[i]);
      }

      if (isTouch) {
        body.classList.add('device-touch');
        doc.classList.add('device-touch');
      }

      body.classList.add(isPortrait ? 'device-orientation-portrait' : 'device-orientation-landscape');

      var profile = 'generic';

      // 1. Z FOLD COVER (<= 400px ou aspect-ratio >= 2.0 em portrait)
      if (w <= 400 || (isPortrait && (h / w) >= 2.05 && w <= 430)) {
        profile = 'fold-cover';
        body.classList.add('device-fold-cover');
        doc.classList.add('device-fold-cover');
      }
      // 2. Z FOLD INNER (680px - 950px e quase quadrado ratio 0.80 - 1.28)
      else if (w >= 680 && w <= 950 && ratio >= 0.78 && ratio <= 1.28) {
        profile = 'fold-inner';
        body.classList.add('device-fold-inner');
        doc.classList.add('device-fold-inner');
      }
      // 3. IPAD MINI (~744 pt em portrait / ~1133 pt em landscape)
      else if (isPortrait && w >= 720 && w <= 779) {
        profile = 'ipad-mini-portrait';
        body.classList.add('device-ipad-mini-portrait');
        doc.classList.add('device-ipad-mini-portrait');
      }
      else if (!isPortrait && w >= 1080 && w <= 1180 && h <= 780) {
        profile = 'ipad-mini-landscape';
        body.classList.add('device-ipad-mini-landscape');
        doc.classList.add('device-ipad-mini-landscape');
      }
      // 4. SAMSUNG GALAXY TAB S9 (16:10 ratio: ~800x1280 ou ~1280x800)
      else if (isPortrait && w >= 780 && w <= 860 && ratio <= 0.68) {
        profile = 'tab-s9-portrait';
        body.classList.add('device-tab-s9-portrait');
        doc.classList.add('device-tab-s9-portrait');
      }
      else if (!isPortrait && w >= 1240 && w <= 1320 && h <= 840) {
        profile = 'tab-s9-landscape';
        body.classList.add('device-tab-s9-landscape');
        doc.classList.add('device-tab-s9-landscape');
      }
      // 5. MICROSOFT SURFACE PRO (3:2 ratio: ~912x1368 ou ~1368x912)
      else if (isPortrait && w >= 880 && w <= 960 && (isWindows || (ratio >= 0.63 && ratio <= 0.70))) {
        profile = 'surface-portrait';
        body.classList.add('device-surface-portrait');
        doc.classList.add('device-surface-portrait');
      }
      else if (!isPortrait && w >= 1330 && w <= 1440 && ratio >= 1.45 && ratio <= 1.55) {
        profile = 'surface-landscape';
        body.classList.add('device-surface-landscape');
        doc.classList.add('device-surface-landscape');
      }
      // 6. IPAD PRO (834px ou 1024px em portrait / 1194px ou 1366px em landscape)
      else if (isPortrait && ((w >= 820 && w <= 860) || (w >= 1000 && w <= 1040))) {
        profile = 'ipad-pro-portrait';
        body.classList.add('device-ipad-pro-portrait');
        doc.classList.add('device-ipad-pro-portrait');
      }
      else if (!isPortrait && (w >= 1180 && w <= 1400 && ratio <= 1.45)) {
        profile = 'ipad-pro-landscape';
        body.classList.add('device-ipad-pro-landscape');
        doc.classList.add('device-ipad-pro-landscape');
      }

      this.currentProfile = profile;
      doc.style.setProperty('--vh', (h * 0.01) + 'px');
    },

    setupListeners: function () {
      var self = this;
      var resizeTimer;
      window.addEventListener('resize', function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function () {
          self.detectAndApply();
        }, 100);
      }, { passive: true });

      if (window.screen && window.screen.orientation) {
        window.screen.orientation.addEventListener('change', function () {
          setTimeout(function () { self.detectAndApply(); }, 150);
        });
      } else {
        window.addEventListener('orientationchange', function () {
          setTimeout(function () { self.detectAndApply(); }, 150);
        });
      }
    },

    enhanceSpecificScreens: function () {
      var self = this;
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
          self.runScreenEnhancements();
        });
      } else {
        self.runScreenEnhancements();
      }
    },

    runScreenEnhancements: function () {
      // 1. Modais e Submenus Universais em todas as telas
      this.setupUniversalModals();
      this.setupUniversalSubmenus();

      // 2. Caixa (Ultra, v11 e Clássico)
      if (document.querySelector('.ultra-main-content') || document.querySelector('.v11-wrap')) {
        this.setupCaixaUltraTabletMode();
      }

      // 3. Garçom Mobile
      if (document.getElementById('tables-grid') || document.querySelector('.garcom-container')) {
        this.setupGarcomTabletMode();
      }

      // 4. Área do Colaborador
      if (document.getElementById('login-view') || document.getElementById('painel-colaborador') || document.getElementById('mgr-estq-tabs') || window.location.pathname.indexOf('painel-funcionario') !== -1) {
        this.setupColaboradorMode();
      }

      // 5. Área do Cliente
      if (document.getElementById('login-screen') || document.querySelector('.fidelidade-card') || document.querySelector('.bill-card') || window.location.pathname.indexOf('area-cliente') !== -1) {
        this.setupClienteMode();
      }

      // 6. Painel do Dono
      if (document.querySelector('.dono-workspace') || document.querySelector('.dashboard-dono') || window.location.pathname.indexOf('painel-dono') !== -1) {
        this.setupPainelDonoMode();
      }

      // 7. Fila de Pedidos / KDS
      if (document.getElementById('queue-list') || document.querySelector('.queue-container') || window.location.pathname.indexOf('fila-pedidos') !== -1) {
        this.setupFilaPedidosMode();
      }

      // 8. Configurações
      if (document.querySelector('.config-container') || document.getElementById('config-tabs') || window.location.pathname.indexOf('configuracoes') !== -1) {
        this.setupConfiguracoesMode();
      }

      if (document.querySelector('.container') && document.querySelector('.bill-card')) {
        document.body.classList.add('conta-cliente-page');
      }
    },

    /* ═════════════════════════════════════════════════════════════════════
       MODAIS UNIVERSAIS: SWIPE-TO-DISMISS & ALÇAS TÁTEIS
       ═════════════════════════════════════════════════════════════════════ */
    setupUniversalModals: function () {
      var self = this;

      function injectDragHandle(modalBox) {
        if (!modalBox || modalBox.querySelector('.chef-sheet-drag-handle')) return;
        var handle = document.createElement('div');
        handle.className = 'chef-sheet-drag-handle';
        handle.setAttribute('aria-label', 'Arraste para fechar');
        modalBox.insertBefore(handle, modalBox.firstChild);
      }

      // Injeta drag handle nos modais existentes
      document.querySelectorAll('.modal-content, .ultra-modal-card, .modal-box, .modal-sheet-content').forEach(injectDragHandle);

      // Observador para modais injetados dinamicamente
      if (window.MutationObserver) {
        var obs = new MutationObserver(function (mutations) {
          mutations.forEach(function (m) {
            m.addedNodes.forEach(function (node) {
              if (node.nodeType === 1) {
                if (node.matches && (node.matches('.modal-content, .ultra-modal-card, .modal-box, .modal-sheet-content'))) {
                  injectDragHandle(node);
                } else if (node.querySelectorAll) {
                  node.querySelectorAll('.modal-content, .ultra-modal-card, .modal-box, .modal-sheet-content').forEach(injectDragHandle);
                }
              }
            });
          });
        });
        obs.observe(document.body, { childList: true, subtree: true });
      }

      // SWIPE DOWN TO DISMISS NO CABEÇALHO / DRAG HANDLE DO MODAL
      var modalSwipe = {
        active: false,
        modalBox: null,
        overlay: null,
        startY: 0,
        currentY: 0,
        pointerId: null
      };

      document.addEventListener('pointerdown', function (e) {
        var handle = e.target.closest('.chef-sheet-drag-handle, .modal-header, h3, .ultra-modal-header');
        var modalBox = e.target.closest('.modal-content, .ultra-modal-card, .modal-box, .chef-action-sheet-modal');
        if (!modalBox) return;

        // Ativa o swipe se tocar na alça ou no cabeçalho superior
        var rect = modalBox.getBoundingClientRect();
        var isTopArea = (e.clientY - rect.top) < 64;

        if (handle || isTopArea) {
          var overlay = modalBox.closest('.modal-overlay, .ultra-modal-overlay, .chef-action-sheet-overlay, .modal');
          modalSwipe.active = true;
          modalSwipe.modalBox = modalBox;
          modalSwipe.overlay = overlay;
          modalSwipe.startY = e.clientY;
          modalSwipe.currentY = e.clientY;
          modalSwipe.pointerId = e.pointerId;
        }
      }, { passive: true });

      document.addEventListener('pointermove', function (e) {
        if (!modalSwipe.active || modalSwipe.pointerId !== e.pointerId) return;
        var dy = e.clientY - modalSwipe.startY;

        if (dy > 0) {
          modalSwipe.modalBox.classList.add('chef-modal-swiping');
          modalSwipe.modalBox.style.transform = 'translateY(' + dy + 'px)';
          if (modalSwipe.overlay) {
            var opacity = Math.max(0.2, 1 - (dy / 300));
            modalSwipe.overlay.style.backgroundColor = 'rgba(0,0,0,' + (0.5 * opacity) + ')';
          }
          if (e.cancelable) e.preventDefault();
        } else if (dy < 0) {
          // Resistência elástica para cima
          modalSwipe.modalBox.style.transform = 'translateY(' + (dy * 0.15) + 'px)';
        }
      }, { passive: false });

      function finishModalSwipe(e) {
        if (!modalSwipe.active || modalSwipe.pointerId !== e.pointerId) return;
        var dy = e.clientY - modalSwipe.startY;
        var box = modalSwipe.modalBox;
        var overlay = modalSwipe.overlay;

        box.classList.remove('chef-modal-swiping');
        box.classList.add('chef-modal-spring');

        if (dy > 70) {
          // FECHAR MODAL COM DESLIZAMENTO PARA BAIXO
          box.classList.add('chef-modal-dismissing');
          if (navigator.vibrate) try { navigator.vibrate([15, 20]); } catch (err) {}

          setTimeout(function () {
            box.style.transform = '';
            box.classList.remove('chef-modal-spring', 'chef-modal-dismissing');
            if (overlay) overlay.style.backgroundColor = '';

            // Tenta fechar via botão de fechar existente
            var btnClose = box.querySelector('.btn-fechar, .btn-close, .close-btn, [onclick*="fecharModal"], [onclick*="fechar"]');
            if (btnClose) {
              btnClose.click();
            } else if (overlay) {
              if (overlay.classList.contains('active')) overlay.classList.remove('active');
              else if (overlay.style.display !== 'none') overlay.style.display = 'none';
              else if (overlay.id && window.fecharModal) window.fecharModal(overlay.id);
            }
          }, 240);
        } else {
          // RETORNAR À POSIÇÃO NORMAL
          box.style.transform = 'translateY(0)';
          if (overlay) overlay.style.backgroundColor = '';
          setTimeout(function () {
            box.style.transform = '';
            box.classList.remove('chef-modal-spring');
          }, 300);
        }

        modalSwipe.active = false;
        modalSwipe.modalBox = null;
        modalSwipe.overlay = null;
        modalSwipe.pointerId = null;
      }

      document.addEventListener('pointerup', finishModalSwipe, { passive: true });
      document.addEventListener('pointercancel', finishModalSwipe, { passive: true });
    },

    /* ═════════════════════════════════════════════════════════════════════
       SUBMENUS E DROPDOWNS: AUTO-ALINHAMENTO & TOUCH-BACKDROP
       ═════════════════════════════════════════════════════════════════════ */
    setupUniversalSubmenus: function () {
      var backdrop = null;

      function createBackdrop() {
        if (backdrop) return backdrop;
        backdrop = document.createElement('div');
        backdrop.className = 'chef-touch-backdrop';
        backdrop.style.display = 'none';
        document.body.appendChild(backdrop);

        backdrop.addEventListener('click', function () {
          document.querySelectorAll('.dropdown-menu.show, .submenu.open, .nav-dropdown.active, .menu-popup.open').forEach(function (m) {
            m.classList.remove('show', 'open', 'active');
          });
          backdrop.style.display = 'none';
        });
        return backdrop;
      }

      // Ao abrir qualquer dropdown, ajusta para não ultrapassar a viewport
      document.addEventListener('click', function (e) {
        var trigger = e.target.closest('[data-toggle="dropdown"], .dropdown-trigger, .submenu-trigger');
        if (trigger) {
          setTimeout(function () {
            var menu = trigger.parentElement.querySelector('.dropdown-menu, .submenu, .menu-popup');
            if (menu) {
              var rect = menu.getBoundingClientRect();
              if (rect.right > window.innerWidth - 12) {
                menu.classList.add('chef-dropdown-align-right');
              }
              createBackdrop().style.display = 'block';
            }
          }, 50);
        }
      });
    },

    /* ═════════════════════════════════════════════════════════════════════
       ÁREA DO COLABORADOR
       ═════════════════════════════════════════════════════════════════════ */
    setupColaboradorMode: function () {
      document.body.classList.add('chef-screen-colaborador');

      // Botão de Bater Ponto: feedback tátil reforçado
      var btnPonto = document.getElementById('btn-bater-ponto') || document.querySelector('.btn-ponto');
      if (btnPonto) {
        btnPonto.classList.add('btn-ponto-touch');
        btnPonto.addEventListener('click', function () {
          if (navigator.vibrate) try { navigator.vibrate([30, 60, 30]); } catch (e) {}
        });
      }

      // Abas de navegação com touch scroll
      var tabNav = document.getElementById('tab-bar') || document.querySelector('.colab-nav') || document.querySelector('.tabs');
      if (tabNav) {
        tabNav.classList.add('colab-nav');
      }
    },

    /* ═════════════════════════════════════════════════════════════════════
       ÁREA DO CLIENTE
       ═════════════════════════════════════════════════════════════════════ */
    setupClienteMode: function () {
      document.body.classList.add('chef-screen-cliente');

      // Cartão fidelidade com animação tátil
      var cardFid = document.querySelector('.fidelidade-card') || document.getElementById('card-fidelidade');
      if (cardFid) {
        cardFid.classList.add('vip-card');
      }
    },

    /* ═════════════════════════════════════════════════════════════════════
       PAINEL DO DONO
       ═════════════════════════════════════════════════════════════════════ */
    setupPainelDonoMode: function () {
      document.body.classList.add('chef-screen-dono');

      // Organiza cards de KPI
      var kpiGrid = document.querySelector('.dono-kpis') || document.querySelector('.dashboard-kpis');
      if (kpiGrid) {
        kpiGrid.classList.add('dono-kpi-grid');
      }
    },

    /* ═════════════════════════════════════════════════════════════════════
       FILA DE PEDIDOS / KDS
       ═════════════════════════════════════════════════════════════════════ */
    setupFilaPedidosMode: function () {
      document.body.classList.add('chef-screen-fila');

      var filtrosBar = document.querySelector('.filtros-setor') || document.getElementById('kds-filtros');
      if (filtrosBar) {
        filtrosBar.classList.add('kds-filtros-bar');
      }
    },

    /* ═════════════════════════════════════════════════════════════════════
       CONFIGURAÇÕES
       ═════════════════════════════════════════════════════════════════════ */
    setupConfiguracoesMode: function () {
      document.body.classList.add('chef-screen-configuracoes');

      var tabsBar = document.querySelector('.config-tabs') || document.getElementById('config-tabs-nav');
      if (tabsBar) {
        tabsBar.classList.add('config-tabs-nav');
      }
    },

    /* ═════════════════════════════════════════════════════════════════════
       CAIXA ULTRA / V11 TABLET MODE
       ═════════════════════════════════════════════════════════════════════ */
    setupCaixaUltraTabletMode: function () {
      var mainContent = document.querySelector('.ultra-main-content');
      if (!mainContent) return;

      if (!document.getElementById('ultra-tablet-tabbar')) {
        var tabBar = document.createElement('nav');
        tabBar.id = 'ultra-tablet-tabbar';
        tabBar.className = 'ultra-tablet-tabbar';
        tabBar.setAttribute('aria-label', 'Navegação por painéis no tablet');
        tabBar.innerHTML = [
          '<button type="button" class="ultra-tablet-tab-btn active" data-view="mesas">',
          '  <i class="ph-bold ph-squares-four"></i> Salão / Mesas',
          '</button>',
          '<button type="button" class="ultra-tablet-tab-btn" data-view="pedido">',
          '  <i class="ph-bold ph-receipt"></i> Itens da Mesa',
          '</button>',
          '<button type="button" class="ultra-tablet-tab-btn" data-view="checkout">',
          '  <i class="ph-bold ph-credit-card"></i> Pagamento Express',
          '</button>'
        ].join('');

        mainContent.parentNode.insertBefore(tabBar, mainContent);

        var btns = tabBar.querySelectorAll('.ultra-tablet-tab-btn');
        btns.forEach(function (btn) {
          btn.addEventListener('click', function () {
            var targetView = this.getAttribute('data-view');
            btns.forEach(function (b) { b.classList.remove('active'); });
            btn.classList.add('active');

            document.body.classList.remove('ultra-tablet-view-mesas', 'ultra-tablet-view-pedido', 'ultra-tablet-view-checkout');
            document.body.classList.add('ultra-tablet-view-' + targetView);
          });
        });

        document.body.classList.add('ultra-tablet-view-mesas');

        mainContent.addEventListener('click', function (e) {
          var mesaCard = e.target.closest('.ultra-mesa-card, [onclick*="abrirMesa"], [onclick*="selecionarMesa"]');
          if (mesaCard && window.innerWidth <= 1080) {
            var pedidoBtn = tabBar.querySelector('[data-view="pedido"]');
            if (pedidoBtn) pedidoBtn.click();
          }
        });
      }
    },

    setupGarcomTabletMode: function () {
      var catBar = document.getElementById('garcom-categorias-bar') || document.querySelector('.categories-bar');
      if (catBar) {
        catBar.style.touchAction = 'pan-x';
      }
    }
  };

  /* ═════════════════════════════════════════════════════════════════════════
     CHEF GESTURES ENGINE: PRESSURE, PINCH, LONG-PRESS, SWIPE & DOUBLE-TAP
     ═════════════════════════════════════════════════════════════════════════ */
  var ChefGestures = {
    activePointers: new Map(),
    initialPinchDist: 0,
    currentScale: 1,
    longPressTimer: null,
    longPressEl: null,
    lastTapTime: 0,
    lastTapEl: null,
    swipeState: null,
    hudTimer: null,

    init: function () {
      if (!window.PointerEvent) return;
      this.attachGlobalListeners();
      this.createHudElement();
    },

    vibrate: function (pattern) {
      if (navigator.vibrate) {
        try { navigator.vibrate(pattern); } catch (e) {}
      }
    },

    createHudElement: function () {
      if (document.getElementById('chef-zoom-hud')) return;
      var hud = document.createElement('div');
      hud.id = 'chef-zoom-hud';
      hud.className = 'chef-zoom-hud';
      hud.innerHTML = '<i class="ph-bold ph-magnifying-glass"></i> <span id="chef-zoom-hud-text">Escala</span>';
      document.body.appendChild(hud);
    },

    showZoomHud: function (text) {
      var hud = document.getElementById('chef-zoom-hud');
      var textEl = document.getElementById('chef-zoom-hud-text');
      if (!hud || !textEl) return;
      textEl.textContent = text;
      hud.classList.add('visible');
      clearTimeout(this.hudTimer);
      this.hudTimer = setTimeout(function () {
        hud.classList.remove('visible');
      }, 1500);
    },

    attachGlobalListeners: function () {
      var self = this;

      document.addEventListener('pointerdown', function (e) {
        self.onPointerDown(e);
      }, { passive: true });

      document.addEventListener('pointermove', function (e) {
        self.onPointerMove(e);
      }, { passive: false });

      document.addEventListener('pointerup', function (e) {
        self.onPointerUp(e);
      }, { passive: true });

      document.addEventListener('pointercancel', function (e) {
        self.onPointerUp(e);
      }, { passive: true });
    },

    onPointerDown: function (e) {
      this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY, target: e.target });

      // 1. PINÇA (2 Dedos)
      if (this.activePointers.size === 2) {
        var pts = Array.from(this.activePointers.values());
        this.initialPinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        this.cancelLongPress();
        return;
      }

      // 2. PRESSURE TOUCH & FORCE TOUCH
      var targetInteractive = e.target.closest && e.target.closest('.mesa-card, .mesa-tile, .ultra-mesa-card, .queue-item, button, .btn');
      if (targetInteractive && e.pressure > 0) {
        targetInteractive.classList.add('chef-pressure-active');
        targetInteractive.style.setProperty('--touch-pressure', e.pressure);

        // Force Touch (> 0.65): Disparo imediato sem esperar o timer
        if (e.pressure > 0.65) {
          this.vibrate([15, 30]);
          this.triggerForceTouch(targetInteractive, e);
          return;
        }
      }

      // 3. TOQUE DUPLO (Double Tap)
      var now = Date.now();
      if (this.lastTapEl && this.lastTapEl === targetInteractive && (now - this.lastTapTime) < 280) {
        this.triggerDoubleTap(targetInteractive, e);
        this.lastTapTime = 0;
        this.lastTapEl = null;
        this.cancelLongPress();
        return;
      }
      this.lastTapTime = now;
      this.lastTapEl = targetInteractive;

      // 4. INICIAR LONG PRESS
      if (targetInteractive && e.pointerType !== 'mouse') {
        this.startLongPress(targetInteractive, e);
      }

      // 5. INICIAR SWIPE NO KDS
      var queueItem = e.target.closest && e.target.closest('.queue-item');
      if (queueItem && !e.target.closest('button, input, select')) {
        this.swipeState = {
          item: queueItem,
          startX: e.clientX,
          startY: e.clientY,
          currentX: e.clientX,
          pointerId: e.pointerId,
          swiping: false
        };
      }
    },

    onPointerMove: function (e) {
      if (!this.activePointers.has(e.pointerId)) return;
      this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY, target: e.target });

      // 1. GESTO DE PINÇA (Pinch-to-scale)
      if (this.activePointers.size === 2 && this.initialPinchDist > 0) {
        var pts = Array.from(this.activePointers.values());
        var dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        var ratio = dist / this.initialPinchDist;

        if (Math.abs(dist - this.initialPinchDist) > 30) {
          this.handlePinch(ratio);
          this.initialPinchDist = dist; // Atualiza âncora
          if (e.cancelable) e.preventDefault();
        }
        return;
      }

      // 2. ATUALIZAR FEEDBACK DE PRESSÃO
      var targetInteractive = e.target.closest && e.target.closest('.mesa-card, .mesa-tile, .ultra-mesa-card, .queue-item, button, .btn');
      if (targetInteractive && e.pressure > 0) {
        targetInteractive.style.setProperty('--touch-pressure', e.pressure);
        if (e.pressure > 0.65 && !targetInteractive.__chefForceFired) {
          targetInteractive.__chefForceFired = true;
          this.vibrate([15, 30]);
          this.triggerForceTouch(targetInteractive, e);
        }
      }

      // 3. CANCELAR LONG PRESS SE HOUVER MOVIMENTO RELEVANTE (> 8px)
      if (this.longPressTimer && this.activePointers.size === 1) {
        var p = this.activePointers.get(e.pointerId);
        if (p && this.longPressStartPos) {
          var moveDist = Math.hypot(e.clientX - this.longPressStartPos.x, e.clientY - this.longPressStartPos.y);
          if (moveDist > 8) {
            this.cancelLongPress();
          }
        }
      }

      // 4. MOVIMENTO DE SWIPE NO KDS
      if (this.swipeState && this.swipeState.pointerId === e.pointerId) {
        var dx = e.clientX - this.swipeState.startX;
        var dy = e.clientY - this.swipeState.startY;

        // Se movimento for predominantemente horizontal
        if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy)) {
          this.swipeState.swiping = true;
          this.cancelLongPress();
          var item = this.swipeState.item;
          item.classList.add('chef-swiping');
          item.style.transform = 'translateX(' + dx + 'px) rotate(' + (dx * 0.035) + 'deg)';

          if (dx > 45) {
            item.style.boxShadow = '0 8px 24px rgba(16, 185, 129, 0.45)';
          } else if (dx < -45) {
            item.style.boxShadow = '0 8px 24px rgba(245, 158, 11, 0.45)';
          } else {
            item.style.boxShadow = '';
          }

          if (e.cancelable) e.preventDefault();
        }
      }
    },

    onPointerUp: function (e) {
      this.activePointers.delete(e.pointerId);
      this.cancelLongPress();

      // Limpar pressão visual
      var pressed = document.querySelectorAll('.chef-pressure-active');
      pressed.forEach(function (el) {
        el.classList.remove('chef-pressure-active');
        el.style.removeProperty('--touch-pressure');
        delete el.__chefForceFired;
      });

      // FINALIZAR SWIPE NO KDS
      if (this.swipeState && this.swipeState.pointerId === e.pointerId) {
        var dx = e.clientX - this.swipeState.startX;
        var item = this.swipeState.item;

        if (this.swipeState.swiping) {
          item.classList.remove('chef-swiping');
          item.classList.add('chef-swipe-spring');

          // Arrastar para a DIREITA (> 75px) = MARCAR PRONTO
          if (dx > 75) {
            this.vibrate([20, 40]);
            item.style.transform = 'translateX(120%)';
            setTimeout(function () {
              var btnPronto = item.querySelector('.btn-pronto, [onclick*="alterarStatusPedido"], [onclick*="marcarPronto"]');
              if (btnPronto) {
                btnPronto.click();
              } else {
                var itemId = item.getAttribute('data-id');
                if (itemId && window.alterarStatusPedido) window.alterarStatusPedido(itemId, 'Pronto');
              }
              item.style.transform = '';
              item.classList.remove('chef-swipe-spring');
            }, 250);
          }
          // Arrastar para a ESQUERDA (< -75px) = HOLD / ESPERA
          else if (dx < -75) {
            this.vibrate([25, 25]);
            item.style.transform = 'translateX(-120%)';
            setTimeout(function () {
              var btnHold = item.querySelector('.btn-hold, .kds-btn-force-fire');
              if (btnHold) {
                btnHold.click();
              } else {
                var itemId = item.getAttribute('data-id');
                if (itemId && window.alterarStatusPedido) window.alterarStatusPedido(itemId, 'Em espera');
              }
              item.style.transform = '';
              item.classList.remove('chef-swipe-spring');
            }, 250);
          }
          // Retornar à posição original
          else {
            item.style.transform = 'translateX(0)';
            setTimeout(function () {
              item.style.transform = '';
              item.style.boxShadow = '';
              item.classList.remove('chef-swipe-spring');
            }, 320);
          }
        }
        this.swipeState = null;
      }
    },

    /* ── LÓGICA DE PINÇA (Pinch-to-scale) ── */
    handlePinch: function (ratio) {
      this.vibrate(10);

      // 1. Pinch no Salão de Mesas (Garçom / PDV Caixa)
      var tablesGrid = document.getElementById('tables-grid') || document.querySelector('.mesas-grid-layout');
      if (tablesGrid) {
        if (ratio > 1.1) {
          // Afastar dedos: Zoom In (Mesas Grandes e Detalhadas)
          tablesGrid.classList.remove('mesas-compactas');
          tablesGrid.classList.add('mesas-grandes');
          if (window.mudarLayoutMesas) window.mudarLayoutMesas('auto');
          this.showZoomHud('🔍 Mesas: Modo Detalhado (+120%)');
        } else if (ratio < 0.9) {
          // Aproximar dedos: Zoom Out (Modo Compacto, cabem mais mesas)
          tablesGrid.classList.remove('mesas-grandes');
          tablesGrid.classList.add('mesas-compactas');
          if (window.mudarLayoutMesas) window.mudarLayoutMesas('compacto');
          this.showZoomHud('🔍 Mesas: Modo Compacto Geral (-80%)');
        }
        return;
      }

      // 2. Pinch no KDS Cozinha
      var queueList = document.getElementById('queue-list') || document.querySelector('.queue-list');
      if (queueList) {
        if (ratio > 1.1) {
          queueList.classList.remove('card-tam-p');
          queueList.classList.add('card-tam-g');
          this.showZoomHud('🔍 KDS: Tickets Ampliados');
        } else if (ratio < 0.9) {
          queueList.classList.remove('card-tam-g');
          queueList.classList.add('card-tam-p');
          this.showZoomHud('🔍 KDS: Grade Compacta');
        }
        return;
      }

      // 3. Pinch no Cardápio Digital
      var cardapioGrid = document.getElementById('cardapio-grid') || document.querySelector('.menu-grid');
      if (cardapioGrid) {
        if (ratio > 1.1) {
          cardapioGrid.classList.add('grid-ampliado');
          this.showZoomHud('🔍 Cardápio: Fotos Grandes');
        } else if (ratio < 0.9) {
          cardapioGrid.classList.remove('grid-ampliado');
          this.showZoomHud('🔍 Cardápio: Lista Compacta');
        }
      }
    },

    /* ── LÓGICA DE LONG-PRESS ── */
    startLongPress: function (el, e) {
      var self = this;
      this.cancelLongPress();
      this.longPressEl = el;
      this.longPressStartPos = { x: e.clientX, y: e.clientY };

      // Halo visual no ponto do toque
      var halo = document.createElement('div');
      halo.className = 'chef-longpress-halo';
      halo.style.left = e.clientX + 'px';
      halo.style.top = e.clientY + 'px';
      document.body.appendChild(halo);
      this.longPressHalo = halo;

      var delay = (e.pressure > 0.4) ? 280 : 420;

      this.longPressTimer = setTimeout(function () {
        self.vibrate([20, 50, 20]);
        self.triggerLongPressAction(el, e);
        self.cancelLongPress();
      }, delay);
    },

    cancelLongPress: function () {
      if (this.longPressTimer) {
        clearTimeout(this.longPressTimer);
        this.longPressTimer = null;
      }
      if (this.longPressHalo && this.longPressHalo.parentNode) {
        this.longPressHalo.parentNode.removeChild(this.longPressHalo);
        this.longPressHalo = null;
      }
      this.longPressEl = null;
    },

    triggerLongPressAction: function (el, e) {
      // 1. Long press em Mesa (Garçom / PDV)
      var mesaEl = el.closest('.mesa-card, .mesa-tile, .ultra-mesa-card, [data-mesa]');
      if (mesaEl) {
        this.openMesaActionSheet(mesaEl);
        return;
      }

      // 2. Long press em Item da Fila do KDS
      var queueItem = el.closest('.queue-item');
      if (queueItem) {
        this.openKdsActionSheet(queueItem);
        return;
      }

      // 3. Fallback: Disparar contextmenu nativo
      var rect = el.getBoundingClientRect();
      var evt = new MouseEvent('contextmenu', {
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
        bubbles: true,
        cancelable: true
      });
      el.dispatchEvent(evt);
    },

    /* ── LÓGICA DE TOQUE DUPLO ── */
    triggerDoubleTap: function (el, e) {
      this.vibrate([10, 15]);

      // Mesa: abre diretamente
      var mesaEl = el.closest('.mesa-card, .mesa-tile, .ultra-mesa-card');
      if (mesaEl) {
        this.showZoomHud('⚡ Acesso Rápido da Mesa');
        mesaEl.click();
        return;
      }

      // KDS: marca como pronto direto
      var queueItem = el.closest('.queue-item');
      if (queueItem) {
        var btnPronto = queueItem.querySelector('.btn-pronto, [onclick*="alterarStatusPedido"]');
        if (btnPronto) {
          this.showZoomHud('✓ Item Avançado');
          btnPronto.click();
        }
      }
    },

    /* ── LÓGICA DE FORCE TOUCH (Peek & Pop) ── */
    triggerForceTouch: function (el, e) {
      var mesaEl = el.closest('.mesa-card, .mesa-tile, .ultra-mesa-card');
      if (mesaEl) {
        this.openMesaPeekCard(mesaEl);
      }
    },

    /* ── MENUS CONTEXTUAIS E ACTION SHEETS ── */
    openMesaActionSheet: function (mesaEl) {
      var mesaNome = mesaEl.querySelector('.mesa-name, .mesa-title, h3, strong')?.textContent || 'Mesa';
      mesaNome = mesaNome.trim();

      var overlay = document.createElement('div');
      overlay.className = 'chef-action-sheet-overlay';
      overlay.innerHTML = [
        '<div class="chef-action-sheet-modal">',
        '  <div class="chef-sheet-drag-handle"></div>',
        '  <div class="chef-sheet-title-box">',
        '    <div class="chef-sheet-title"><i class="ph-bold ph-table" style="color:#fc4b15;"></i> ' + mesaNome + ' — Ações Rápidas</div>',
        '    <button type="button" class="btn-fechar" style="background:none;border:none;font-size:22px;color:#94a3b8;cursor:pointer;">&times;</button>',
        '  </div>',
        '  <div class="chef-sheet-grid">',
        '    <button type="button" class="chef-sheet-btn" data-action="comanda">',
        '      <i class="ph-bold ph-receipt"></i> Lançar / Ver Comanda',
        '    </button>',
        '    <button type="button" class="chef-sheet-btn" data-action="marchar">',
        '      <i class="ph-bold ph-bell"></i> Marchar Cozinha',
        '    </button>',
        '    <button type="button" class="chef-sheet-btn" data-action="preconta">',
        '      <i class="ph-bold ph-printer"></i> Imprimir Pré-Conta',
        '    </button>',
        '    <button type="button" class="chef-sheet-btn" data-action="racha">',
        '      <i class="ph-bold ph-users-three"></i> Racha Conta',
        '    </button>',
        '    <button type="button" class="chef-sheet-btn" data-action="qr">',
        '      <i class="ph-bold ph-qr-code"></i> QR Cardápio Cliente',
        '    </button>',
        '    <button type="button" class="chef-sheet-btn" data-action="sommelier">',
        '      <i class="ph-bold ph-sparkle" style="color:#ec4899;"></i> Sommelier IA',
        '    </button>',
        '  </div>',
        '</div>'
      ].join('');

      document.body.appendChild(overlay);
      requestAnimationFrame(function () { overlay.classList.add('active'); });

      function fechar() {
        overlay.classList.remove('active');
        setTimeout(function () { overlay.remove(); }, 300);
      }

      overlay.querySelector('.btn-fechar').addEventListener('click', fechar);
      overlay.addEventListener('click', function (ev) {
        if (ev.target === overlay) fechar();
      });

      overlay.querySelectorAll('.chef-sheet-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var act = this.getAttribute('data-action');
          fechar();
          if (act === 'comanda') {
            mesaEl.click();
          } else if (act === 'marchar') {
            if (window.abrirModalMarcharGarcom) window.abrirModalMarcharGarcom(mesaNome);
            else if (window.marcharEtapaMesa) window.marcharEtapaMesa('Principal');
          } else if (act === 'preconta') {
            if (window.imprimirPreContaGarcom) window.imprimirPreContaGarcom();
            else if (window.ChefUltraApp && window.ChefUltraApp.imprimirPreConta) window.ChefUltraApp.imprimirPreConta();
          } else if (act === 'racha') {
            if (window.abrirModalRachaGarcom) window.abrirModalRachaGarcom();
            else if (window.ChefUltraApp && window.ChefUltraApp.abrirModalRacha) window.ChefUltraApp.abrirModalRacha();
          } else if (act === 'qr') {
            if (window.mostrarQrMesaCliente) window.mostrarQrMesaCliente();
          } else if (act === 'sommelier') {
            if (window.abrirModalSommelierGarcom) window.abrirModalSommelierGarcom();
          }
        });
      });
    },

    openKdsActionSheet: function (queueItem) {
      var prodNome = queueItem.querySelector('.kds-product-name, .item-nome, strong')?.textContent || 'Pedido';
      var itemId = queueItem.getAttribute('data-id');

      var overlay = document.createElement('div');
      overlay.className = 'chef-action-sheet-overlay';
      overlay.innerHTML = [
        '<div class="chef-action-sheet-modal">',
        '  <div class="chef-sheet-drag-handle"></div>',
        '  <div class="chef-sheet-title-box">',
        '    <div class="chef-sheet-title"><i class="ph-bold ph-cooking-pot" style="color:#fc4b15;"></i> ' + prodNome + '</div>',
        '    <button type="button" class="btn-fechar" style="background:none;border:none;font-size:22px;color:#94a3b8;cursor:pointer;">&times;</button>',
        '  </div>',
        '  <div class="chef-sheet-grid">',
        '    <button type="button" class="chef-sheet-btn" data-action="fogo">',
        '      <i class="ph-fill ph-fire" style="color:#ef4444;"></i> Priorizar (FOGO!)',
        '    </button>',
        '    <button type="button" class="chef-sheet-btn" data-action="hold">',
        '      <i class="ph-bold ph-pause-circle" style="color:#f59e0b;"></i> Pausar / Hold',
        '    </button>',
        '    <button type="button" class="chef-sheet-btn" data-action="ficha">',
        '      <i class="ph-bold ph-camera"></i> Ficha Técnica Visual',
        '    </button>',
        '    <button type="button" class="chef-sheet-btn" data-action="reimprimir">',
        '      <i class="ph-bold ph-printer"></i> Reimprimir Comanda',
        '    </button>',
        '  </div>',
        '</div>'
      ].join('');

      document.body.appendChild(overlay);
      requestAnimationFrame(function () { overlay.classList.add('active'); });

      function fechar() {
        overlay.classList.remove('active');
        setTimeout(function () { overlay.remove(); }, 300);
      }

      overlay.querySelector('.btn-fechar').addEventListener('click', fechar);
      overlay.addEventListener('click', function (ev) {
        if (ev.target === overlay) fechar();
      });

      overlay.querySelectorAll('.chef-sheet-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var act = this.getAttribute('data-action');
          fechar();
          if (act === 'fogo') {
            if (window.forcarInicioSmartSync) window.forcarInicioSmartSync(itemId);
          } else if (act === 'hold') {
            if (window.alterarStatusPedido) window.alterarStatusPedido(itemId, 'Em espera');
          } else if (act === 'ficha') {
            if (window.abrirFichaTecnicaKds) window.abrirFichaTecnicaKds(itemId);
          } else if (act === 'reimprimir') {
            if (window.reimprimirTicketKds) window.reimprimirTicketKds(itemId);
          }
        });
      });
    },

    openMesaPeekCard: function (mesaEl) {
      var mesaNome = mesaEl.querySelector('.mesa-name, .mesa-title, h3, strong')?.textContent || 'Mesa';
      var statusText = mesaEl.querySelector('.mesa-status, .status-pill')?.textContent || 'Ocupada';
      var valorTotal = mesaEl.querySelector('.mesa-total, .mesa-valor')?.textContent || 'R$ 0,00';

      var overlay = document.createElement('div');
      overlay.className = 'chef-peek-overlay';
      overlay.innerHTML = [
        '<div class="chef-peek-box">',
        '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">',
        '    <h3 style="margin:0;font-size:18px;font-weight:900;display:flex;align-items:center;gap:8px;">',
        '      <i class="ph-fill ph-eye" style="color:#fc4b15;"></i> ' + mesaNome,
        '    </h3>',
        '    <span style="font-size:11px;font-weight:800;padding:3px 8px;border-radius:12px;background:rgba(252,75,21,0.15);color:#fc4b15;">' + statusText + '</span>',
        '  </div>',
        '  <div style="font-size:24px;font-weight:900;color:#10b981;margin-bottom:16px;">' + valorTotal + '</div>',
        '  <div style="font-size:12px;color:#64748b;margin-bottom:16px;">Toque firme (Force Touch) detectado. Abra para gerenciar itens.</div>',
        '  <button type="button" class="btn-abrir-mesa" style="width:100%;padding:12px;border-radius:12px;background:#fc4b15;color:#fff;border:none;font-weight:800;font-size:13.5px;cursor:pointer;">Abrir Comanda Completa</button>',
        '</div>'
      ].join('');

      document.body.appendChild(overlay);
      requestAnimationFrame(function () { overlay.classList.add('active'); });

      function fechar() {
        overlay.classList.remove('active');
        setTimeout(function () { overlay.remove(); }, 250);
      }

      overlay.addEventListener('click', function (ev) {
        if (ev.target === overlay) fechar();
      });
      overlay.querySelector('.btn-abrir-mesa').addEventListener('click', function () {
        fechar();
        mesaEl.click();
      });
    }
  };

  window.ChefDeviceAdapter = ChefDeviceAdapter;
  window.ChefGestures = ChefGestures;
  ChefDeviceAdapter.init();

})(window, document);
