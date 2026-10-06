/**
 * apple-transitions.js — Apple iOS & macOS Desktop Pro Transition Engine
 * 
 * Modos Inteligentes:
 *   1. macOS Desktop Pro: Ativado em telas Desktop (FullHD+ ou >= 1024px) com >= 6GB RAM.
 *      - Foco em continuidade visual, Split-Views persistentes, Cross-Fade sutil e Sheets suspensos.
 *   2. iOS Mobile: Ativado em telas Mobile/Tablet com >= 4GB RAM.
 *      - Foco em empilhamento Push/Pop, Bottom Sheets estilo iOS 13+ e Matched Geometry.
 */
(function (window) {
  'use strict';

  function detectarHardware() {
    try {
      const ram = navigator.deviceMemory !== undefined ? navigator.deviceMemory : 6;
      const cores = navigator.hardwareConcurrency !== undefined ? navigator.hardwareConcurrency : 6;
      const larguraTela = window.innerWidth || document.documentElement.clientWidth || screen.width;
      const ehDesktopFullHD = larguraTela >= 1024 && (screen.width >= 1920 || larguraTela >= 1440 || ram >= 6);
      const semPreferenciaReduzida = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      return {
        ram,
        cores,
        ehDesktopFullHD: ehDesktopFullHD && semPreferenciaReduzida && ram >= 6,
        ehMobileAltaPerformance: (ram >= 4 || cores >= 4) && semPreferenciaReduzida
      };
    } catch (e) {
      return { ram: 6, cores: 6, ehDesktopFullHD: true, ehMobileAltaPerformance: true };
    }
  }

  const hw = detectarHardware();

  // Aplica classes de aceleração gráfica por hardware
  if (hw.ehDesktopFullHD) {
    document.documentElement.classList.add('macos-pro-motion');
    document.documentElement.classList.add('ios-fluid-motion');
    console.log('🖥️ [macOS Pro Engine] Ativado: Navegação Contínua, Split-View Cross-Fade & Sheets Suspensos (>= 6GB RAM & FullHD)');
  } else if (hw.ehMobileAltaPerformance) {
    document.documentElement.classList.add('ios-fluid-motion');
    console.log('📱 [iOS Mobile Engine] Ativado: Push/Pop Hierárquico & Modal Bottom Sheets (> 4GB RAM)');
  }

  const AppleTransitions = {
    isDesktopPro: hw.ehDesktopFullHD,
    isMobileFluid: hw.ehMobileAltaPerformance,

    /**
     * Transição de Conteúdo macOS Desktop (Cross-Fade Suave de Painel / Split View)
     */
    crossFadeView(container, newContentFn) {
      if (!hw.ehDesktopFullHD || !container) {
        if (newContentFn) newContentFn();
        return;
      }

      container.classList.add('macos-crossfade-enter');
      if (newContentFn) newContentFn();

      setTimeout(() => {
        container.classList.remove('macos-crossfade-enter');
      }, 200);
    },

    /**
     * Revelação Lateral de Coluna (Miller Columns / macOS Finder Style)
     */
    revealColumn(columnEl, onDone) {
      if (!hw.ehDesktopFullHD || !columnEl) {
        if (columnEl) columnEl.style.display = 'block';
        if (onDone) onDone();
        return;
      }

      columnEl.classList.add('macos-column-reveal-enter');
      columnEl.style.display = 'block';

      setTimeout(() => {
        columnEl.classList.remove('macos-column-reveal-enter');
        if (onDone) onDone();
      }, 320);
    },

    /**
     * Apresentação de Sheet macOS (Preso ao Topo da Janela / Barra de Título)
     */
    presentMacSheet(sheetEl, backdropEl) {
      if (!sheetEl) return;

      if (hw.ehDesktopFullHD) {
        sheetEl.classList.add('macos-window-sheet');
        sheetEl.style.display = 'block';
        if (backdropEl) backdropEl.style.display = 'block';
      } else {
        // Fallback para Bottom Sheet no mobile
        this.presentSheet(sheetEl, backdropEl, null);
      }
    },

    dismissMacSheet(sheetEl, backdropEl, onDone) {
      if (!sheetEl) return;

      if (hw.ehDesktopFullHD) {
        sheetEl.style.animation = 'macosSheetDetach 240ms cubic-bezier(0.16, 1, 0.3, 1) forwards';
        setTimeout(() => {
          sheetEl.style.animation = '';
          sheetEl.classList.remove('macos-window-sheet');
          sheetEl.style.display = 'none';
          if (backdropEl) backdropEl.style.display = 'none';
          if (onDone) onDone();
        }, 240);
      } else {
        this.dismissSheet(sheetEl, backdropEl, null, onDone);
      }
    },

    /**
     * Navegação Push (Mobile / iOS)
     */
    pushView(container, newViewEl, oldViewEl, onComplete) {
      if (hw.ehDesktopFullHD) {
        // No Desktop, substitui por Cross-Fade suave em vez de deslizar a tela inteira
        this.crossFadeView(newViewEl, () => {
          if (oldViewEl) oldViewEl.style.display = 'none';
          if (newViewEl) newViewEl.style.display = 'block';
        });
        if (onComplete) onComplete();
        return;
      }

      if (!hw.ehMobileAltaPerformance || !newViewEl) {
        if (oldViewEl) oldViewEl.style.display = 'none';
        if (newViewEl) newViewEl.style.display = 'block';
        if (onComplete) onComplete();
        return;
      }

      newViewEl.classList.add('ios-view-push-enter');
      newViewEl.style.display = 'block';
      if (oldViewEl) oldViewEl.classList.add('ios-view-push-exit');

      setTimeout(() => {
        newViewEl.classList.remove('ios-view-push-enter');
        if (oldViewEl) {
          oldViewEl.classList.remove('ios-view-push-exit');
          oldViewEl.style.display = 'none';
        }
        if (onComplete) onComplete();
      }, 160);
    },

    /**
     * Navegação Pop (Mobile / iOS)
     */
    popView(container, currentViewEl, previousViewEl, onComplete) {
      if (hw.ehDesktopFullHD) {
        this.crossFadeView(previousViewEl, () => {
          if (currentViewEl) currentViewEl.style.display = 'none';
          if (previousViewEl) previousViewEl.style.display = 'block';
        });
        if (onComplete) onComplete();
        return;
      }

      if (!hw.ehMobileAltaPerformance || !currentViewEl) {
        if (currentViewEl) currentViewEl.style.display = 'none';
        if (previousViewEl) previousViewEl.style.display = 'block';
        if (onComplete) onComplete();
        return;
      }

      currentViewEl.classList.add('ios-view-pop-exit');
      if (previousViewEl) {
        previousViewEl.style.display = 'block';
        previousViewEl.classList.add('ios-view-pop-enter');
      }

      setTimeout(() => {
        currentViewEl.classList.remove('ios-view-pop-exit');
        currentViewEl.style.display = 'none';
        if (previousViewEl) previousViewEl.classList.remove('ios-view-pop-enter');
        if (onComplete) onComplete();
      }, 160);
    },

    presentSheet(modalCardEl, backdropEl, backgroundAppEl) {
      if (hw.ehDesktopFullHD) {
        this.presentMacSheet(modalCardEl, backdropEl);
        return;
      }
      if (!modalCardEl) return;
      modalCardEl.classList.add('ios-sheet-card');
      modalCardEl.style.display = 'block';
      if (backdropEl) backdropEl.style.display = 'block';
      if (backgroundAppEl) backgroundAppEl.classList.add('ios-sheet-backdrop-active');
    },

    dismissSheet(modalCardEl, backdropEl, backgroundAppEl, onDone) {
      if (hw.ehDesktopFullHD) {
        this.dismissMacSheet(modalCardEl, backdropEl, onDone);
        return;
      }
      if (!modalCardEl) return;
      modalCardEl.style.animation = 'iosSheetExit 180ms cubic-bezier(0.32, 0.72, 0, 1) forwards';
      if (backgroundAppEl) backgroundAppEl.classList.remove('ios-sheet-backdrop-active');

      setTimeout(() => {
        modalCardEl.style.animation = '';
        modalCardEl.classList.remove('ios-sheet-card');
        modalCardEl.style.display = 'none';
        if (backdropEl) backdropEl.style.display = 'none';
        if (onDone) onDone();
      }, 180);
    }
  };

  window.AppleTransitions = AppleTransitions;

  // Intercepta e aplica transições automáticas no Garçom e Telas
  document.addEventListener('DOMContentLoaded', function () {
    if (typeof window.showView === 'function' && !window._origShowView) {
      window._origShowView = window.showView;
      window.showView = function (name, title) {
        const currentActive = document.querySelector('.view.active');
        const targetView = document.getElementById('view-' + name);

        // Abas principais do rodapé e telas raiz (Mesas, Esteira, Atalhos, Login):
        // NUNCA aplicar atraso ou animações 3D pesadas entre abas primárias.
        // A resposta deve ser 100% instantânea (0ms lag) para feedback tátil imediato!
        const rootTabs = ['tables', 'mesas', 'esteira', 'atalhos', 'login'];
        const currentName = currentActive ? (currentActive.id || '').replace('view-', '') : '';
        const isRootNav = rootTabs.includes(name) || rootTabs.includes(currentName);

        if (isRootNav || !currentActive || !targetView || currentActive === targetView) {
          window._origShowView(name, title);
          return;
        }

        const isPop = name === 'tables' || (name === 'table-options' && currentActive.id === 'view-menu');
        if (isPop) {
          AppleTransitions.popView(document.body, currentActive, targetView, () => {
            window._origShowView(name, title);
          });
        } else {
          AppleTransitions.pushView(document.body, targetView, currentActive, () => {
            window._origShowView(name, title);
          });
        }
      };
    }
  });

})(window);
