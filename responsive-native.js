/* ═════════════════════════════════════════════════════════════════════
   CHEF COZINHA — CONTROLE RESPONSIVO "NATIVE APP"
   Mantém 100% a lógica original das barras laterais (recolher no mouse /
   expandir ao clicar no pino ou na alça). Em toque, os FABs apenas
   acionam o mesmo expandir nativo (toggleLeftPanel / toggleRightPanel).
   ═════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var mqWide = window.matchMedia('(min-width: 1600px)');

  /* FABs flutuantes (visíveis só em toque via CSS) */
  function makeFab() { return null; }

  // fabs removidos
  // fabs removidos

  var fabAcoes = document.getElementById('chef-fab-acoes');
  var fabResumo = document.getElementById('chef-fab-resumo');

  /* Reutiliza a lógica nativa de expandir/recolher (in-place) */
  if (fabAcoes) {
    fabAcoes.addEventListener('click', function (e) {
      e.stopPropagation();
      if (window.toggleLeftPanel) window.toggleLeftPanel(e);
    });
  }
  if (fabResumo) {
    fabResumo.addEventListener('click', function (e) {
      e.stopPropagation();
      if (window.toggleRightPanel) window.toggleRightPanel(e);
    });
  }

  /* Framing ultrawide */
  function apply() {
    document.body.classList.toggle('chef-ui-wide', mqWide.matches);
  }

  apply();

  var t;
  window.addEventListener('resize', function () {
    clearTimeout(t);
    t = setTimeout(apply, 120);
  });

  if (mqWide && mqWide.addEventListener) {
    try { mqWide.addEventListener('change', apply); } catch (e) {}
  }

  /* ── Arraste a tab bar (mobile) para baixo e oculta ──
     A barra INTEIRA é arrastável de qualquer ponto próximo dela;
     o grip é apenas a dica visual. Toques curtos ainda clicam as abas. */
  (function () {
    var tabs = document.getElementById('mobile-workspace-tabs');
    if (!tabs) return;

    var grip = document.createElement('div');
    grip.className = 'mobile-tabs-grip';
    grip.setAttribute('aria-label', 'Arraste para baixo para ocultar as abas');
    tabs.insertBefore(grip, tabs.firstChild);

    var restore = document.createElement('button');
    restore.id = 'chef-tabs-restore';
    restore.type = 'button';
    restore.style.display = 'none';
    restore.style.position = 'fixed';
    restore.style.bottom = '8px';
    restore.style.left = '50%';
    restore.style.transform = 'translateX(-50%)';
    restore.style.zIndex = '10002';
    restore.innerHTML = '<i class="ph ph-caret-up"></i> Mostrar abas';
    document.body.appendChild(restore);

    var dragging = false, moved = false, startY = 0, dy = 0, pointerId = null;

    function onDown(e) {
      if (e.target === restore) return;
      dragging = true;
      moved = false;
      startY = e.clientY;
      dy = 0;
      pointerId = e.pointerId;
      tabs.style.transition = 'none';
    }

    function onMove(e) {
      if (!dragging || e.pointerId !== pointerId) return;
      dy = Math.max(0, e.clientY - startY);
      if (dy > 8) moved = true;
      // Segue o dedo/mouse enquanto arrasta para baixo
      tabs.style.transform = 'translateY(' + Math.min(dy, 140) + 'px)';
      if (moved && e.cancelable) e.preventDefault();
    }

    function end(e) {
      if (!dragging || (e && e.pointerId !== pointerId)) return;
      dragging = false;
      tabs.style.transition = '';
      tabs.style.transform = '';
      if (dy > 40) document.body.classList.add('tabs-collapsed');
      // Suprime o clique residual depois de um arraste real
      if (moved) {
        var suppress = function (ev) {
          ev.preventDefault();
          ev.stopPropagation();
        };
        tabs.addEventListener('click', suppress, { capture: true, once: true });
        setTimeout(function () {
          tabs.removeEventListener('click', suppress, { capture: true });
        }, 350);
      }
    }

    tabs.addEventListener('pointerdown', onDown);
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', end);
    document.addEventListener('pointercancel', end);

    restore.addEventListener('click', function () {
      document.body.classList.remove('tabs-collapsed');
      tabs.style.transform = '';
    });
  })();

  /* ── MULTI-GESTOS & PRESSURE TOUCH (Pointer Events) ─────────────
     - Pinch com 2 dedos → zoom nos canvases (sintetiza wheel, reaproveitando
       o zoom ancorado já existente nos motores de mapa).
     - Enquanto pincha, sinaliza cv.__chefPinch para os motores pausarem
       o arraste de 1 dedo (sem conflito de gestos).
     - Pressure touch: feedback visual (.chef-pressure) + vibração leve em
       pressionadas fortes em telas que reportam pressão (caneta/dedo).
     - Long-press forte (= botão direito): abre contextmenu em toque. */
  (function () {
    if (!window.PointerEvent) return;

    var estados = new WeakMap(); // canvas -> estado dos ponteiros

    function estadoDe(cv) {
      var st = estados.get(cv);
      if (!st) {
        st = { ponteiros: new Map(), distInicial: 0, distUltima: 0, centro: null };
        estados.set(cv, st);
      }
      return st;
    }

    function distancia(a, b) {
      var dx = a.clientX - b.clientX, dy = a.clientY - b.clientY;
      return Math.hypot(dx, dy);
    }

    function centro(a, b) {
      return { clientX: (a.clientX + b.clientX) / 2, clientY: (a.clientY + b.clientY) / 2 };
    }

    /* Sintetiza um evento wheel no canvas → motores fazem zoom ancorado */
    function rodarZoom(cv, fator, pos) {
      try {
        var ev = new WheelEvent('wheel', {
          deltaY: fator > 1 ? -100 : 100,
          clientX: pos.clientX,
          clientY: pos.clientY,
          bubbles: true,
          cancelable: true
        });
        cv.dispatchEvent(ev);
      } catch (e) {}
    }

    function onDown(e) {
      var alvo = e.target.closest ? e.target.closest('canvas') : null;
      if (!alvo) { pressaoFeedback(e); return; }
      var st = estadoDe(alvo);
      st.ponteiros.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
      if (st.ponteiros.size === 2) {
        var pts = Array.from(st.ponteiros.values());
        st.distInicial = st.distUltima = distancia(pts[0], pts[1]);
        st.centro = centro(pts[0], pts[1]);
        alvo.__chefPinch = true;
      }
      pressaoFeedback(e);
      iniciarLongPress(alvo, e);
    }

    function onMove(e) {
      var alvo = e.target.closest ? e.target.closest('canvas') : null;
      if (!alvo) return;
      var st = estadoDe(alvo);
      if (!st.ponteiros.has(e.pointerId)) return;
      st.ponteiros.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });

      if (st.ponteiros.size >= 2) {
        var pts = Array.from(st.ponteiros.values());
        var d = distancia(pts[0], pts[1]);
        var c = centro(pts[0], pts[1]);
        if (st.distUltima > 0 && Math.abs(d - st.distUltima) > 2) {
          rodarZoom(alvo, d / st.distUltima, c);
          if (e.cancelable) e.preventDefault();
        }
        st.distUltima = d;
        if (e.cancelable) e.preventDefault();
      }
    }

    function onUpCancel(e) {
      var alvo = e.target.closest ? e.target.closest('canvas') : null;
      cancelarLongPress();
      removerPressao();
      if (!alvo) return;
      var st = estadoDe(alvo);
      st.ponteiros.delete(e.pointerId);
      if (st.ponteiros.size < 2) {
        alvo.__chefPinch = false;
        st.distInicial = st.distUltima = 0;
      }
    }

    /* ── Pressure feedback ── */
    var elPressionado = null;

    function pressaoFeedback(e) {
      if (e.pointerType === 'mouse' || !(e.pressure > 0)) return;
      var t = e.target.closest ? e.target.closest('button, .btn-row-action, .menu-item, .mesa-tile, a') : null;
      if (!t) return;
      removerPressao();
      elPressionado = t;
      t.classList.add('chef-pressure');
      if (e.pressure > 0.55 && navigator.vibrate) {
        try { navigator.vibrate(10); } catch (err) {}
      }
    }

    function removerPressao() {
      if (elPressionado) {
        elPressionado.classList.remove('chef-pressure');
        elPressionado = null;
      }
    }

    document.addEventListener('pointerup', removerPressao);
    document.addEventListener('pointercancel', removerPressao);

    /* ── Long-press forte = clique direito (toque) ── */
    var lpTimer = null, lpEl = null;

    function iniciarLongPress(el, e) {
      cancelarLongPress();
      if (e.pointerType === 'mouse') return;
      lpEl = el;
      var pressaoAlvo = e.pressure || 0;
      var delay = pressaoAlvo > 0.4 ? 420 : 560; // mais pressão = mais rápido
      lpTimer = setTimeout(function () {
        if (!lpEl) return;
        try { navigator.vibrate && navigator.vibrate([12, 40, 18]); } catch (err) {}
        var rect = lpEl.getBoundingClientRect();
        var evt = new MouseEvent('contextmenu', {
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2,
          bubbles: true,
          cancelable: true
        });
        lpEl.dispatchEvent(evt);
      }, delay);
    }

    function cancelarLongPress() {
      if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; }
      lpEl = null;
    }

    document.addEventListener('pointermove', function (e) {
      // Movimento relevante cancela o long-press
      if (lpTimer && (e.movementX > 6 || e.movementY > 6)) cancelarLongPress();
    }, { passive: true });

    document.addEventListener('pointerdown', onDown, { passive: true });
    document.addEventListener('pointermove', onMove, { passive: false });
    document.addEventListener('pointerup', onUpCancel);
    document.addEventListener('pointercancel', onUpCancel);

    /* Canvases não deixam o navegador capturar o gesto (pinch nativo da página) */
    try {
      var estilo = document.createElement('style');
      estilo.textContent = 'canvas{touch-action:none;-webkit-user-select:none;user-select:none;}';
      document.head.appendChild(estilo);
    } catch (e) {}
  })();
})();
