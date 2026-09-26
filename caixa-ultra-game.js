/**
 * ═════════════════════════════════════════════════════════════════════════
 * CHEF COZINHA ULTRA 3D — GAMIFICATION & ARCADE ENGINE (TYCOON SIMULATOR)
 * Web Audio Retro Synth • Particle Emitter • Player Progression • Rush Hour
 * ═════════════════════════════════════════════════════════════════════════
 */

(function () {
  'use strict';

  window.ChefUltraGame = {
    // ─── 1. ESTADO DE PROGRESSÃO DO JOGADOR / OPERADOR ───
    state: {
      xp: 0,
      level: 1,
      combo: 0,
      comboTimer: null,
      comboMaxTime: 45, // segundos para manter o combo
      comboTimeLeft: 0,
      comboInterval: null,
      salesCount: 0,
      totalRevenue: 0,
      satisfaction: 98,
      isRushHour: false,
      isMuted: false,
      operatorName: 'Chef Mestre',
      operatorAvatar: '👨‍🍳'
    },

    // Títulos de Carreira / Ranks no Restaurante Tycoon
    RANKS: [
      { lvl: 1, title: 'Ajudante de Cozinha', icon: '🍳', minXp: 0 },
      { lvl: 2, title: 'Atendente Ágil', icon: '⚡', minXp: 150 },
      { lvl: 3, title: 'Mestre dos Pedidos', icon: '📋', minXp: 400 },
      { lvl: 4, title: 'Caixa Relâmpago', icon: '⚡', minXp: 800 },
      { lvl: 5, title: 'Chefe do Salão', icon: '🎩', minXp: 1400 },
      { lvl: 6, title: 'Sous Chef do Caixa', icon: '🥘', minXp: 2200 },
      { lvl: 7, title: 'Mestre Cuca Pro', icon: '👨‍🍳', minXp: 3200 },
      { lvl: 8, title: 'Gerente Supremo', icon: '🌟', minXp: 4500 },
      { lvl: 9, title: 'Magnata Gastronômico', icon: '💎', minXp: 6200 },
      { lvl: 10, title: 'Lenda da Culinária', icon: '👑', minXp: 8500 }
    ],

    // ─── 2. SINTETIZADOR DE ÁUDIO RETRO / ARCADE (WEB AUDIO API) ───
    audioCtx: null,

    initAudio: function () {
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext && !this.audioCtx) {
          this.audioCtx = new AudioContext();
        }
      } catch (e) {
        console.warn('[ChefUltraGame] Web Audio API não suportada:', e);
      }
    },

    ensureAudioContext: function () {
      if (!this.audioCtx) this.initAudio();
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
    },

    sfx: {
      playTone: function (freq, type, duration, gainLevel = 0.2, destFreq = null) {
        if (ChefUltraGame.state.isMuted) return;
        ChefUltraGame.ensureAudioContext();
        const ctx = ChefUltraGame.audioCtx;
        if (!ctx) return;

        try {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = type || 'sine';
          osc.frequency.setValueAtTime(freq, ctx.currentTime);

          if (destFreq !== null) {
            osc.frequency.exponentialRampToValueAtTime(Math.max(1, destFreq), ctx.currentTime + duration);
          }

          gain.gain.setValueAtTime(gainLevel, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

          osc.connect(gain);
          gain.connect(ctx.destination);

          osc.start();
          osc.stop(ctx.currentTime + duration);
        } catch (e) { }
      },

      // Efeito de Moeda Arcade (Mario / Sonic style chimes)
      playCoin: function () {
        this.playTone(987.77, 'sine', 0.08, 0.25); // B5
        setTimeout(() => {
          this.playTone(1318.51, 'sine', 0.25, 0.3); // E6
        }, 65);
      },

      // Caixa Registradora Retrô (Sino clássico de dinheiro)
      playCashRegister: function () {
        this.playTone(1046.50, 'triangle', 0.12, 0.28); // C6
        setTimeout(() => this.playTone(2093.00, 'sine', 0.35, 0.35), 80);
      },

      // Blip de interface arcade (teclas e cliques)
      playBlip: function (pitch = 850) {
        this.playTone(pitch, 'triangle', 0.04, 0.12);
      },

      // Seleção de mesa (acorde macio de sino)
      playTableSelect: function () {
        this.playTone(523.25, 'sine', 0.1, 0.18); // C5
        setTimeout(() => this.playTone(659.25, 'sine', 0.18, 0.18), 50); // E5
      },

      // Combo Streak Chime (arpeggio ascendente acelerado)
      playCombo: function (streak = 1) {
        const base = 440 * Math.pow(1.08, Math.min(streak, 12));
        this.playTone(base, 'triangle', 0.08, 0.22);
        setTimeout(() => this.playTone(base * 1.25, 'triangle', 0.08, 0.22), 60);
        setTimeout(() => this.playTone(base * 1.5, 'sine', 0.22, 0.28), 120);
      },

      // Vitória / Level Up Fanfarra (Triunfo RPG)
      playLevelUp: function () {
        const ctx = ChefUltraGame.audioCtx;
        if (!ctx) return;
        const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51];
        notes.forEach((freq, idx) => {
          setTimeout(() => {
            ChefUltraGame.sfx.playTone(freq, 'sine', 0.25, 0.3);
          }, idx * 90);
        });
      },

      // Sirene de Hora do Rush (Power-up frenzy)
      playRushHour: function () {
        this.playTone(300, 'sawtooth', 0.4, 0.22, 880);
        setTimeout(() => {
          this.playTone(400, 'sawtooth', 0.5, 0.25, 1200);
        }, 220);
      },

      // Som de Erro / Alerta
      playError: function () {
        this.playTone(220, 'sawtooth', 0.15, 0.2, 110);
      }
    },

    // ─── 3. MOTOR DE PARTÍCULAS E FX CANVAS (CANVAS 2D OVERLAY) ───
    fxCanvas: null,
    fxCtx: null,
    particles: [],
    floatingTexts: [],
    fxAnimId: null,

    initFxCanvas: function () {
      let canvas = document.getElementById('ultra-game-fx-canvas');
      if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.id = 'ultra-game-fx-canvas';
        canvas.style.position = 'fixed';
        canvas.style.inset = '0';
        canvas.style.width = '100vw';
        canvas.style.height = '100vh';
        canvas.style.pointerEvents = 'none';
        canvas.style.zIndex = '99999';
        document.body.appendChild(canvas);
      }

      this.fxCanvas = canvas;
      this.fxCtx = canvas.getContext('2d');

      const resize = () => {
        if (!this.fxCanvas) return;
        this.fxCanvas.width = window.innerWidth;
        this.fxCanvas.height = window.innerHeight;
      };
      window.addEventListener('resize', resize);
      resize();

      this.startFxLoop();
    },

    startFxLoop: function () {
      const render = () => {
        this.fxAnimId = requestAnimationFrame(render);
        if (!this.fxCtx) return;

        this.fxCtx.clearRect(0, 0, this.fxCanvas.width, this.fxCanvas.height);

        // 1. Atualizar e desenhar partículas (moedas, estrelas, confetes)
        for (let i = this.particles.length - 1; i >= 0; i--) {
          const p = this.particles[i];
          p.x += p.vx;
          p.y += p.vy;
          p.vy += p.gravity;
          p.rotation += p.vRot;
          p.alpha -= p.fade;
          p.scale = Math.max(0.01, p.scale - p.scaleFade);

          if (p.alpha <= 0 || p.y > this.fxCanvas.height + 50) {
            this.particles.splice(i, 1);
            continue;
          }

          this.fxCtx.save();
          this.fxCtx.globalAlpha = Math.max(0, p.alpha);
          this.fxCtx.translate(p.x, p.y);
          this.fxCtx.rotate(p.rotation);
          this.fxCtx.scale(p.scale, p.scale);

          if (p.type === 'coin') {
            // Desenha moeda dourada brilhante
            this.fxCtx.beginPath();
            this.fxCtx.arc(0, 0, p.radius, 0, Math.PI * 2);
            this.fxCtx.fillStyle = '#fbbf24';
            this.fxCtx.fill();
            this.fxCtx.lineWidth = 3;
            this.fxCtx.strokeStyle = '#d97706';
            this.fxCtx.stroke();

            // Símbolo de cifrão no centro da moeda
            this.fxCtx.fillStyle = '#92400e';
            this.fxCtx.font = `bold ${p.radius * 1.1}px sans-serif`;
            this.fxCtx.textAlign = 'center';
            this.fxCtx.textBaseline = 'middle';
            this.fxCtx.fillText('$', 0, 1);
          } else if (p.type === 'star') {
            // Desenha estrela brilhante
            this.fxCtx.fillStyle = p.color || '#fef08a';
            this.fxCtx.beginPath();
            const r = p.radius;
            for (let s = 0; s < 5; s++) {
              this.fxCtx.lineTo(Math.cos((18 + s * 72) * Math.PI / 180) * r, -Math.sin((18 + s * 72) * Math.PI / 180) * r);
              this.fxCtx.lineTo(Math.cos((54 + s * 72) * Math.PI / 180) * (r / 2), -Math.sin((54 + s * 72) * Math.PI / 180) * (r / 2));
            }
            this.fxCtx.closePath();
            this.fxCtx.fill();
          } else if (p.type === 'confetti') {
            // Confete retangular festivo
            this.fxCtx.fillStyle = p.color;
            this.fxCtx.fillRect(-p.radius, -p.radius / 2, p.radius * 2, p.radius);
          }

          this.fxCtx.restore();
        }

        // 2. Atualizar e desenhar textos flutuantes (+R$ 120, +80 XP, COMBO X3!)
        for (let j = this.floatingTexts.length - 1; j >= 0; j--) {
          const ft = this.floatingTexts[j];
          ft.y += ft.vy;
          ft.vy *= 0.94; // desaceleração suave
          ft.alpha -= ft.fade;
          ft.scale = Math.min(ft.maxScale, ft.scale + 0.08);

          if (ft.alpha <= 0) {
            this.floatingTexts.splice(j, 1);
            continue;
          }

          this.fxCtx.save();
          this.fxCtx.globalAlpha = Math.max(0, ft.alpha);
          this.fxCtx.translate(ft.x, ft.y);
          this.fxCtx.scale(ft.scale, ft.scale);

          // Sombra de brilho neon arcade
          this.fxCtx.shadowColor = ft.glowColor || 'rgba(252, 75, 21, 0.8)';
          this.fxCtx.shadowBlur = 14;

          this.fxCtx.font = ft.font || '900 24px "Outfit", sans-serif';
          this.fxCtx.textAlign = 'center';
          this.fxCtx.textBaseline = 'middle';

          // Borda preta de texto de jogo
          this.fxCtx.lineWidth = 5;
          this.fxCtx.strokeStyle = 'rgba(0,0,0,0.85)';
          this.fxCtx.strokeText(ft.text, 0, 0);

          // Preenchimento gradiente ou sólido
          this.fxCtx.fillStyle = ft.color || '#fef08a';
          this.fxCtx.fillText(ft.text, 0, 0);

          this.fxCtx.restore();
        }
      };
      render();
    },

    // Explosão de moedas ao finalizar venda
    spawnCoinBurst: function (originX, originY, count = 28) {
      const x = originX || window.innerWidth / 2;
      const y = originY || window.innerHeight / 2;

      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 6 + Math.random() * 12;
        this.particles.push({
          type: 'coin',
          x: x,
          y: y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 6, // impulso inicial para cima
          gravity: 0.45,
          radius: 12 + Math.random() * 6,
          rotation: Math.random() * Math.PI * 2,
          vRot: (Math.random() - 0.5) * 0.3,
          alpha: 1,
          fade: 0.012 + Math.random() * 0.008,
          scale: 1,
          scaleFade: 0.002
        });
      }

      // Estrelas cintilantes adicionais
      for (let s = 0; s < 18; s++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 4 + Math.random() * 8;
        this.particles.push({
          type: 'star',
          x: x,
          y: y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 4,
          gravity: 0.25,
          radius: 8 + Math.random() * 6,
          color: ['#fef08a', '#67e8f9', '#f472b6', '#34d399'][Math.floor(Math.random() * 4)],
          rotation: 0,
          vRot: (Math.random() - 0.5) * 0.2,
          alpha: 1,
          fade: 0.018,
          scale: 1,
          scaleFade: 0.005
        });
      }
    },

    // Chuva de confetes no Level Up
    spawnLevelUpConfetti: function () {
      const colors = ['#f43f5e', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899'];
      for (let i = 0; i < 90; i++) {
        this.particles.push({
          type: 'confetti',
          x: window.innerWidth * Math.random(),
          y: -20 - Math.random() * 100,
          vx: (Math.random() - 0.5) * 6,
          vy: 3 + Math.random() * 6,
          gravity: 0.15,
          radius: 8 + Math.random() * 6,
          color: colors[Math.floor(Math.random() * colors.length)],
          rotation: Math.random() * Math.PI,
          vRot: (Math.random() - 0.5) * 0.2,
          alpha: 1,
          fade: 0.008,
          scale: 1,
          scaleFade: 0.001
        });
      }
    },

    // Adiciona texto flutuante estilo damage/score popup de RPG
    spawnFloatingText: function (text, x, y, color = '#fef08a', glowColor = 'rgba(252,75,21,0.8)', size = 26) {
      this.floatingTexts.push({
        text: text,
        x: x || window.innerWidth / 2,
        y: y || window.innerHeight / 2,
        vy: -3.8,
        alpha: 1,
        fade: 0.018,
        scale: 0.4,
        maxScale: 1.15,
        color: color,
        glowColor: glowColor,
        font: `900 ${size}px "Outfit", sans-serif`
      });
    },

    // ─── 4. MECÂNICAS DO JOGO: XP, NÍVEL, COMBOS & RUSH HOUR ───
    init: function () {
      this.loadProgress();
      this.initAudio();
      this.initFxCanvas();
      this.renderHud();
      this.startComboLoop();
      console.log('🎮 [ChefUltraGame] Motor de Jogo Tycoon Restaurante Ativo! Nível:', this.state.level);
    },

    loadProgress: function () {
      try {
        const savedXp = parseInt(localStorage.getItem('chef_ultra_game_xp') || '280', 10);
        const savedSales = parseInt(localStorage.getItem('chef_ultra_game_sales') || '0', 10);
        const savedRev = parseFloat(localStorage.getItem('chef_ultra_game_rev') || '0');
        const savedMute = localStorage.getItem('chef_ultra_game_muted') === 'true';

        this.state.xp = isNaN(savedXp) ? 0 : savedXp;
        this.state.salesCount = isNaN(savedSales) ? 0 : savedSales;
        this.state.totalRevenue = isNaN(savedRev) ? 0 : savedRev;
        this.state.isMuted = savedMute;
        this.state.level = this.calculateLevel(this.state.xp);
      } catch (e) {
        this.state.xp = 0;
        this.state.level = 1;
      }
    },

    saveProgress: function () {
      try {
        localStorage.setItem('chef_ultra_game_xp', this.state.xp);
        localStorage.setItem('chef_ultra_game_sales', this.state.salesCount);
        localStorage.setItem('chef_ultra_game_rev', this.state.totalRevenue);
        localStorage.setItem('chef_ultra_game_muted', this.state.isMuted);
      } catch (e) { }
    },

    calculateLevel: function (xp) {
      let lvl = 1;
      for (let i = this.RANKS.length - 1; i >= 0; i--) {
        if (xp >= this.RANKS[i].minXp) {
          lvl = this.RANKS[i].lvl;
          break;
        }
      }
      return lvl;
    },

    getRankInfo: function (level) {
      return this.RANKS.find(r => r.lvl === level) || this.RANKS[this.RANKS.length - 1];
    },

    getNextRankInfo: function (level) {
      const idx = this.RANKS.findIndex(r => r.lvl === level);
      if (idx >= 0 && idx < this.RANKS.length - 1) {
        return this.RANKS[idx + 1];
      }
      return null;
    },

    addXp: function (amount, reason = '') {
      const oldLevel = this.state.level;
      // Multiplicador de Rush Hour (2x XP)
      const multiplier = this.state.isRushHour ? 2 : 1;
      const finalAmount = amount * multiplier;

      this.state.xp += finalAmount;
      const newLevel = this.calculateLevel(this.state.xp);
      this.state.level = newLevel;

      this.saveProgress();
      this.renderHud();

      // Se subiu de nível, celebração épica!
      if (newLevel > oldLevel) {
        this.onLevelUp(newLevel);
      }
    },

    onLevelUp: function (newLevel) {
      const rank = this.getRankInfo(newLevel);
      this.sfx.playLevelUp();
      this.spawnLevelUpConfetti();

      // Mostra Banner / Modal de Vitória Estilo RPG
      this.showLevelUpModal(rank);
    },

    showLevelUpModal: function (rank) {
      const modal = document.createElement('div');
      modal.className = 'ultra-levelup-overlay';
      modal.innerHTML = `
        <div class="ultra-levelup-card">
          <div class="ultra-levelup-crown">👑</div>
          <div class="ultra-levelup-tag">PARABÉNS, OPERADOR!</div>
          <h2 class="ultra-levelup-title">NÍVEL ${rank.lvl} ALCANÇADO!</h2>
          <div class="ultra-levelup-badge-row">
            <span class="ultra-levelup-icon">${rank.icon}</span>
            <div class="ultra-levelup-details">
              <span class="ultra-levelup-subtitle">NOVO TÍTULO DESBLOQUEADO:</span>
              <strong class="ultra-levelup-rank">${rank.title}</strong>
            </div>
          </div>
          <p class="ultra-levelup-desc">Sua velocidade e atendimento elevaram o padrão do restaurante! Você ganhou multiplicador de agilidade e gorjeta nos próximos atendimentos.</p>
          <button class="ultra-levelup-btn" onclick="this.closest('.ultra-levelup-overlay').remove()">
            <span>CONTINUAR JOGANDO</span> <i class="ph-bold ph-arrow-right"></i>
          </button>
        </div>
      `;
      document.body.appendChild(modal);

      setTimeout(() => {
        if (modal.parentNode) modal.remove();
      }, 9000);
    },

    // ─── 5. SISTEMA DE COMBOS (SEQUÊNCIA RÁPIDA DE FECHAMENTO) ───
    incrementCombo: function () {
      this.state.combo++;
      this.state.comboTimeLeft = this.state.comboMaxTime;
      this.sfx.playCombo(this.state.combo);

      const bonusXp = 25 * this.state.combo;
      this.addXp(bonusXp);

      const comboText = `🔥 COMBO x${this.state.combo}! (+${bonusXp} XP)`;
      this.spawnFloatingText(comboText, window.innerWidth / 2, window.innerHeight * 0.38, '#f97316', 'rgba(249, 115, 22, 0.9)', 30);

      this.renderHud();
    },

    resetCombo: function () {
      if (this.state.combo > 0) {
        this.state.combo = 0;
        this.state.comboTimeLeft = 0;
        this.renderHud();
      }
    },

    startComboLoop: function () {
      setInterval(() => {
        if (this.state.comboTimeLeft > 0) {
          this.state.comboTimeLeft--;
          this.updateComboBar();
          if (this.state.comboTimeLeft <= 0) {
            this.resetCombo();
          }
        }
      }, 1000);
    },

    updateComboBar: function () {
      const comboBar = document.getElementById('ultra-game-combo-bar');
      if (comboBar) {
        const pct = Math.max(0, (this.state.comboTimeLeft / this.state.comboMaxTime) * 100);
        comboBar.style.width = `${pct}%`;
      }
    },

    // ─── 6. HORA DO RUSH (EVENTO DINÂMICO DE PICO) ───
    toggleRushHour: function () {
      this.state.isRushHour = !this.state.isRushHour;
      const rushBanner = document.getElementById('ultra-rush-banner');
      const appShell = document.querySelector('.ultra-app-shell');

      if (this.state.isRushHour) {
        this.sfx.playRushHour();
        if (rushBanner) rushBanner.classList.add('active');
        if (appShell) appShell.classList.add('rush-active');

        this.spawnFloatingText('⚡ HORA DO RUSH ATIVADA! 2X XP & GORJETAS!', window.innerWidth / 2, window.innerHeight * 0.3, '#f59e0b', 'rgba(245, 158, 11, 0.9)', 32);
      } else {
        if (rushBanner) rushBanner.classList.remove('active');
        if (appShell) appShell.classList.remove('rush-active');
      }
      this.renderHud();
    },

    // ─── 7. EVENTOS DE GAMEPLAY DISPARADOS PELO CAIXA ───
    onVendaConcluida: function (valorTotal, metodo = 'Dinheiro', originEvent = null) {
      const val = parseFloat(valorTotal) || 0;
      this.state.salesCount++;
      this.state.totalRevenue += val;

      // Base XP da venda + combo
      const baseEarnedXp = Math.max(60, Math.floor(val * 1.5));
      this.addXp(baseEarnedXp);

      // Avança o combo
      this.incrementCombo();

      // Som épico de moedas e caixa registradora
      this.sfx.playCashRegister();
      setTimeout(() => this.sfx.playCoin(), 120);

      // Coordenadas da explosão (onde clicou ou centro da tela)
      let clickX = window.innerWidth / 2;
      let clickY = window.innerHeight / 2;
      if (originEvent && originEvent.clientX) {
        clickX = originEvent.clientX;
        clickY = originEvent.clientY;
      } else {
        const btn = document.getElementById('ultra-btn-concluir-venda');
        if (btn) {
          const rect = btn.getBoundingClientRect();
          clickX = rect.left + rect.width / 2;
          clickY = rect.top + rect.height / 2;
        }
      }

      // Efeitos visuais vibrantes
      this.spawnCoinBurst(clickX, clickY, 32);
      this.spawnFloatingText(`+R$ ${val.toFixed(2).replace('.', ',')} 🪙`, clickX, clickY - 20, '#34d399', 'rgba(16, 185, 129, 0.9)', 30);
      this.spawnFloatingText(`+${baseEarnedXp} XP ⭐`, clickX, clickY - 60, '#fef08a', 'rgba(251, 191, 36, 0.9)', 24);

      // Ajusta satisfação do cliente
      this.state.satisfaction = Math.min(100, this.state.satisfaction + 0.5);
      this.saveProgress();
      this.renderHud();
    },

    onItemLaunched: function (itemNome, preco) {
      this.sfx.playTone(784, 'sine', 0.08, 0.2);
      this.addXp(15);
      this.spawnFloatingText(`+15 XP 🍽️`, window.innerWidth * 0.72, window.innerHeight * 0.5, '#67e8f9', 'rgba(6, 182, 212, 0.8)', 20);
    },

    toggleMute: function () {
      this.state.isMuted = !this.state.isMuted;
      this.saveProgress();
      this.renderHud();
      if (!this.state.isMuted) {
        this.sfx.playCoin();
      }
    },

    // ─── 8. RENDERIZAÇÃO DO HUD DO JOGADOR NO TOPO DO CAIXA ───
    renderHud: function () {
      const hudEl = document.getElementById('ultra-game-hud-bar');
      if (!hudEl) return;

      const rank = this.getRankInfo(this.state.level);
      const nextRank = this.getNextRankInfo(this.state.level);

      const currentBaseXp = rank.minXp;
      const nextTargetXp = nextRank ? nextRank.minXp : rank.minXp * 1.5;
      const xpIntoLevel = Math.max(0, this.state.xp - currentBaseXp);
      const xpLevelRange = Math.max(1, nextTargetXp - currentBaseXp);
      const xpPct = Math.min(100, Math.floor((xpIntoLevel / xpLevelRange) * 100));

      const comboActive = this.state.combo > 0;
      const rushActive = this.state.isRushHour;

      hudEl.innerHTML = `
        <div class="ultra-player-card">
          <!-- Avatar Animado com Aura de Nível -->
          <div class="ultra-player-avatar-wrap" title="Operador: ${this.state.operatorName} (${rank.title})">
            <div class="ultra-player-avatar">${this.state.operatorAvatar}</div>
            <div class="ultra-player-level-badge">LV ${this.state.level}</div>
          </div>

          <!-- Informações de XP e Rank -->
          <div class="ultra-player-meta">
            <div class="ultra-player-topline">
              <span class="ultra-player-title">${rank.title}</span>
              <span class="ultra-player-xp-text">${this.state.xp.toLocaleString('pt-BR')} XP</span>
            </div>

            <!-- Barra de XP Gamificada com Shimmer Neon -->
            <div class="ultra-xp-track" title="${xpIntoLevel} / ${xpLevelRange} XP para o Nível ${this.state.level + 1}">
              <div class="ultra-xp-fill" style="width: ${xpPct}%;"></div>
            </div>
          </div>
        </div>

        <!-- Combo Streak Badge (Fogo Ativo) -->
        <div class="ultra-combo-widget ${comboActive ? 'active' : ''}" title="Multiplicador de Atendimento Rápido">
          <div class="ultra-combo-flame">🔥</div>
          <div class="ultra-combo-info">
            <span class="ultra-combo-label">COMBO</span>
            <span class="ultra-combo-val">x${this.state.combo || 1}</span>
          </div>
          <div class="ultra-combo-timer-track">
            <div id="ultra-game-combo-bar" class="ultra-combo-timer-fill" style="width: ${Math.max(0, (this.state.comboTimeLeft / this.state.comboMaxTime) * 100)}%;"></div>
          </div>
        </div>

        <!-- Termômetro de Satisfação dos Clientes (Overcooked / Tycoon Stars) -->
        <div class="ultra-satisfaction-widget" title="Índice de Clientes Felizes e Encantados">
          <div class="ultra-sat-stars">⭐⭐⭐⭐⭐</div>
          <span class="ultra-sat-score">${this.state.satisfaction.toFixed(0)}% Satisfeitos</span>
        </div>

        <!-- Botão de Ativação Modo Rush Hour -->
        <button id="btn-toggle-rush" class="ultra-rush-toggle-btn ${rushActive ? 'active' : ''}" onclick="ChefUltraGame.toggleRushHour()" title="Ativar/Desativar Frenzy de Horário de Pico (2x XP)">
          <i class="ph-bold ph-lightning"></i>
          <span>${rushActive ? 'RUSH ATIVO!' : 'HORA DO RUSH'}</span>
        </button>

        <!-- Botão de Áudio Arcade (Mute / Unmute) -->
        <button class="ultra-btn-icon ultra-sfx-btn" onclick="ChefUltraGame.toggleMute()" title="${this.state.isMuted ? 'Ativar Efeitos Sonoros Retro' : 'Desativar Sons'}">
          <i class="ph-bold ${this.state.isMuted ? 'ph-speaker-slash' : 'ph-speaker-high'}" style="color:${this.state.isMuted ? 'var(--ultra-coral)' : 'var(--ultra-emerald)'};"></i>
        </button>
      `;
    }
  };

  // Inicializar quando o DOM estiver pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.ChefUltraGame.init());
  } else {
    window.ChefUltraGame.init();
  }

})();
