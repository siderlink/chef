/**
 * ══════════════════════════════════════════════════════════════════════════════
 * CHEF COZINHA 3D ULTRA ENGINE & AR EXPERIENCE (Three.js 6GB+ Pro Tier)
 *
 * 1. REALIDADE AUMENTADA (AR "Ver Prato na Minha Mesa"):
 *    - Câmera traseira nativa via WebRTC passthrough
 *    - Projeção tridimensional com sombra projetada na toalha da mesa
 *    - Toque 1-dedo para mover, pinça 2-dedos para escala 100% real e rotação
 *    - Captura de foto holográfica para salvar/compartilhar (Instagram/WhatsApp)
 *
 * 2. ÁUDIO SENSORIAL GASTRONÔMICO (ASMR WebAudio) & HÁPTICA:
 *    - Efervescência procedural de cerveja, chopp e refrigerante
 *    - Chiado de brasa e chapa quente para carnes e filés
 *    - Brisa marinha harmônica para frutos do mar e peixes
 *    - Cristal doce para sobremesas e pudim
 *    - Arpeggio harmônico ao adicionar ao pedido
 *    - Vibração háptica tátil (navigator.vibrate) em rotações e ações
 *
 * 3. AURA GASTRONÔMICA 3D & FLY-TO-CART:
 *    - Fundo ambiente fluido reativo às categorias
 *    - Arco parabólico de partículas do botão até o carrinho
 *    - Tilt 3D com reflexo especular nos cards
 * ══════════════════════════════════════════════════════════════════════════════
 */

(function () {
  'use strict';

  // ══════════════════════════════════════════════════════════════════════════
  // MÓDULO 1: ÁUDIO SENSORIAL GASTRONÔMICO (ASMR WebAudio Procedural)
  // ══════════════════════════════════════════════════════════════════════════
  const ChefGastronomicAudio = {
    ctx: null,
    isMuted: localStorage.getItem('chef_3d_asmr') === 'false',
    lastSoundTime: 0,

    init: function () {
      if (this.ctx) return;
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) this.ctx = new AudioCtx();
      } catch (e) { }
    },

    resume: function () {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    },

    toggle: function () {
      this.isMuted = !this.isMuted;
      localStorage.setItem('chef_3d_asmr', String(!this.isMuted));
      return !this.isMuted;
    },

    // Efervescência de chopp, cerveja gelada e refrigerante
    playFizz: function () {
      if (this.isMuted) return;
      this.init();
      this.resume();
      if (!this.ctx) return;

      const now = Date.now();
      if (now - this.lastSoundTime < 80) return;
      this.lastSoundTime = now;

      const t = this.ctx.currentTime;
      const dur = 0.14;
      const bufferSize = Math.floor(this.ctx.sampleRate * dur);
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);

      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.45));
      }

      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(4500 + Math.random() * 1400, t);
      filter.Q.setValueAtTime(4.5, t);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.08, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      noise.start(t);
    },

    // Chiado de chapa quente e carnes grelhadas
    playSizzle: function () {
      if (this.isMuted) return;
      this.init();
      this.resume();
      if (!this.ctx) return;

      const now = Date.now();
      if (now - this.lastSoundTime < 100) return;
      this.lastSoundTime = now;

      const t = this.ctx.currentTime;
      const dur = 0.16;
      const bufferSize = Math.floor(this.ctx.sampleRate * dur);
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);

      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * (Math.random() > 0.4 ? 1 : 0.25);
      }

      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(2800, t);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.07, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      noise.start(t);
    },

    // Brisa marinha / chime límpido para peixes e frutos do mar
    playOceanChime: function () {
      if (this.isMuted) return;
      this.init();
      this.resume();
      if (!this.ctx) return;

      const now = Date.now();
      if (now - this.lastSoundTime < 220) return;
      this.lastSoundTime = now;

      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      const freqs = [659.25, 783.99, 880.0, 987.77];
      const freq = freqs[Math.floor(Math.random() * freqs.length)];

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0.045, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.32);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(t);
      osc.stop(t + 0.34);
    },

    // Cristal doce suave para sobremesas e pudim
    playDessertChime: function () {
      if (this.isMuted) return;
      this.init();
      this.resume();
      if (!this.ctx) return;

      const now = Date.now();
      if (now - this.lastSoundTime < 200) return;
      this.lastSoundTime = now;

      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1046.50 + Math.random() * 180, t);

      gain.gain.setValueAtTime(0.055, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.38);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(t);
      osc.stop(t + 0.4);
    },

    // Arpeggio harmônico ao adicionar ao pedido
    playAddToCart: function () {
      if (this.isMuted) return;
      this.init();
      this.resume();
      if (!this.ctx) return;

      const t = this.ctx.currentTime;
      const notes = [523.25, 659.25, 783.99, 1046.50];

      notes.forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t + idx * 0.045);

        gain.gain.setValueAtTime(0.1, t + idx * 0.045);
        gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.045 + 0.22);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(t + idx * 0.045);
        osc.stop(t + idx * 0.045 + 0.24);
      });
    },

    // Som de obturador de foto em AR
    playShutter: function () {
      this.init();
      this.resume();
      if (!this.ctx) return;

      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'square';
      osc.frequency.setValueAtTime(880, t);
      osc.frequency.exponentialRampToValueAtTime(220, t + 0.08);

      gain.gain.setValueAtTime(0.12, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(t);
      osc.stop(t + 0.1);
    }
  };

  // ══════════════════════════════════════════════════════════════════════════
  // MÓDULO 2: FEEDBACK HÁPTICO (Vibração Tátil no Celular)
  // ══════════════════════════════════════════════════════════════════════════
  const ChefHaptics = {
    canVibrate: typeof navigator !== 'undefined' && 'vibrate' in navigator,

    tick: function () {
      if (this.canVibrate) {
        try { navigator.vibrate(8); } catch (e) { }
      }
    },

    switchToggle: function () {
      if (this.canVibrate) {
        try { navigator.vibrate(14); } catch (e) { }
      }
    },

    pop: function () {
      if (this.canVibrate) {
        try { navigator.vibrate([15, 30, 20]); } catch (e) { }
      }
    },

    arPlace: function () {
      if (this.canVibrate) {
        try { navigator.vibrate(30); } catch (e) { }
      }
    }
  };

  // ══════════════════════════════════════════════════════════════════════════
  // MÓDULO 3: MOTOR CHEF CARDÁPIO 3D
  // ══════════════════════════════════════════════════════════════════════════
  const ChefCardapio3D = {
    version: '3.0.0-ultra-ar-asmr',
    isSupported: false,
    isEnabled: false,
    threeLoaded: false,
    deviceMemory: navigator.deviceMemory || 8,
    hardwareConcurrency: navigator.hardwareConcurrency || 4,

    ambient: null,
    dishStage: null,
    flyEffect: null,

    detectCapability: function () {
      const saved = localStorage.getItem('chef_3d_mode');
      if (saved === 'false') return false;
      if (saved === 'true') return true;

      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        return false;
      }

      const mem = navigator.deviceMemory || 8;
      const cores = navigator.hardwareConcurrency || 4;

      const hasWebGL = (function () {
        try {
          const canvas = document.createElement('canvas');
          return !!(window.WebGLRenderingContext && (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
        } catch (e) {
          return false;
        }
      })();

      if (!hasWebGL) return false;
      if (mem >= 6) return true;
      if (mem >= 4 && cores >= 8 && window.devicePixelRatio >= 2) return true;

      return false;
    },

    init: function () {
      this.isSupported = this.detectCapability();
      console.log(`[ChefCardapio3D] Dispositivo: ${this.deviceMemory}GB RAM, ${this.hardwareConcurrency} Cores. Suporte 3D/AR: ${this.isSupported}`);

      this.injectUiControls();

      if (this.isSupported) {
        this.enable();
      }
    },

    loadThree: function (callback) {
      if (typeof THREE !== 'undefined') {
        this.threeLoaded = true;
        callback();
        return;
      }

      const script = document.createElement('script');
      script.src = '/vendor/three/three.min.js';
      script.async = true;

      script.onload = () => {
        this.threeLoaded = true;
        callback();
      };

      script.onerror = () => {
        const cdnScript = document.createElement('script');
        cdnScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
        cdnScript.async = true;
        cdnScript.onload = () => {
          this.threeLoaded = true;
          callback();
        };
        document.head.appendChild(cdnScript);
      };

      document.head.appendChild(script);
    },

    enable: function () {
      this.isEnabled = true;
      localStorage.setItem('chef_3d_mode', 'true');
      this.updateUiBadge();

      this.loadThree(() => {
        this.initAmbientAura();
        this.initDishStage();
        this.initFlyToCart();
        this.initCard3DTilt();
      });
    },

    disable: function () {
      this.isEnabled = false;
      localStorage.setItem('chef_3d_mode', 'false');
      this.updateUiBadge();

      if (this.ambient) this.ambient.destroy();
      if (this.dishStage) this.dishStage.destroy();
      const ambCanvas = document.getElementById('cardapio-ambient-canvas');
      if (ambCanvas) ambCanvas.style.opacity = '0';
    },

    toggleManual: function () {
      if (this.isEnabled) {
        this.disable();
        if (typeof showToast === 'function') showToast('Modo 3D desativado (Modo Leve)', 'info');
      } else {
        this.enable();
        if (typeof showToast === 'function') showToast('✨ Experiência 3D Ultra Ativada!', 'success');
      }
    },

    toggleAudio: function () {
      const isNowActive = ChefGastronomicAudio.toggle();
      ChefHaptics.switchToggle();
      const icon = document.getElementById('icon-sound-status');
      const label = document.getElementById('label-sound-status');
      if (icon) icon.className = isNowActive ? 'ph-bold ph-speaker-high' : 'ph-bold ph-speaker-slash';
      if (label) label.innerText = isNowActive ? 'ASMR On' : 'ASMR Mudo';
      if (typeof showToast === 'function') {
        showToast(isNowActive ? '🔊 Áudio ASMR Ativado' : '🔇 Áudio ASMR Silenciado', 'info');
      }
    },

    injectUiControls: function () {
      const headerRight = document.querySelector('.header-right') || document.querySelector('.header-info');
      if (!headerRight || document.getElementById('btn-toggle-3d-mode')) return;

      const btn = document.createElement('button');
      btn.id = 'btn-toggle-3d-mode';
      btn.type = 'button';
      btn.title = 'Alternar Experiência 3D Ultra (Otimizado para 6GB+ RAM)';
      btn.style.cssText = `
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: linear-gradient(135deg, rgba(252,75,21,0.12), rgba(245,158,11,0.16));
        border: 1px solid rgba(252,75,21,0.3);
        color: var(--primary, #fc4b15);
        font-size: 11px;
        font-weight: 800;
        padding: 5px 11px;
        border-radius: 20px;
        cursor: pointer;
        transition: all 0.25s ease;
        box-shadow: 0 2px 8px rgba(0,0,0,0.04);
        margin-left: 6px;
      `;
      btn.onclick = () => this.toggleManual();
      headerRight.appendChild(btn);
      this.updateUiBadge();
    },

    updateUiBadge: function () {
      const btn = document.getElementById('btn-toggle-3d-mode');
      if (!btn) return;
      if (this.isEnabled) {
        btn.innerHTML = `
          <span style="width:7px; height:7px; border-radius:50%; background:#10b981; box-shadow:0 0 8px #10b981; display:inline-block; animation:pulse3d 2s infinite;"></span>
          <span>✨ 3D Pro</span>
        `;
        btn.style.borderColor = 'rgba(16, 185, 129, 0.4)';
        btn.style.color = '#10b981';
      } else {
        btn.innerHTML = `
          <span style="width:7px; height:7px; border-radius:50%; background:#94a3b8; display:inline-block;"></span>
          <span style="color:var(--text-muted, #64748b);">3D Off</span>
        `;
        btn.style.borderColor = 'var(--border, #e2e8f0)';
        btn.style.color = 'var(--text-muted, #64748b)';
      }
    },

    // ─── AURA GASTRONÔMICA 3D (Fundo Ambiente Fluido) ───
    initAmbientAura: function () {
      let canvas = document.getElementById('cardapio-ambient-canvas');
      if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.id = 'cardapio-ambient-canvas';
        canvas.style.cssText = `
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          pointer-events: none;
          z-index: 0;
          opacity: 0;
          transition: opacity 1.5s cubic-bezier(0.16, 1, 0.3, 1);
        `;
        document.body.prepend(canvas);
      }

      const self = this;
      const width = window.innerWidth;
      const height = window.innerHeight;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(65, width / height, 1, 1000);
      camera.position.z = 320;

      const renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance'
      });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

      const pCanvas = document.createElement('canvas');
      pCanvas.width = 64;
      pCanvas.height = 64;
      const pCtx = pCanvas.getContext('2d');
      const grad = pCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
      grad.addColorStop(0.3, 'rgba(255, 220, 180, 0.85)');
      grad.addColorStop(0.7, 'rgba(252, 75, 21, 0.35)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      pCtx.fillStyle = grad;
      pCtx.fillRect(0, 0, 64, 64);
      const particleTexture = new THREE.CanvasTexture(pCanvas);

      const count = 650;
      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array(count * 3);
      const velocities = new Float32Array(count * 3);

      for (let i = 0; i < count; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 550;
        positions[i * 3 + 1] = (Math.random() - 0.5) * 450;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 200;

        velocities[i * 3] = (Math.random() - 0.5) * 0.2;
        velocities[i * 3 + 1] = Math.random() * 0.4 + 0.15;
        velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.15;
      }

      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

      const material = new THREE.PointsMaterial({
        size: 16,
        map: particleTexture,
        transparent: true,
        opacity: 0.45,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        color: new THREE.Color(0xfc4b15)
      });

      const particleSystem = new THREE.Points(geometry, material);
      scene.add(particleSystem);

      let mouseX = 0;
      let mouseY = 0;
      const onPointerMove = (e) => {
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        mouseX = (clientX / window.innerWidth - 0.5) * 40;
        mouseY = (clientY / window.innerHeight - 0.5) * 40;
      };
      window.addEventListener('mousemove', onPointerMove, { passive: true });
      window.addEventListener('touchmove', onPointerMove, { passive: true });

      let animId = null;
      let isVisible = true;
      let clock = new THREE.Clock();

      document.addEventListener('visibilitychange', () => {
        isVisible = !document.hidden;
      });

      function animate() {
        animId = requestAnimationFrame(animate);
        if (!isVisible || !self.isEnabled) return;

        const time = clock.getElapsedTime();
        const pos = geometry.attributes.position.array;

        for (let i = 0; i < count; i++) {
          pos[i * 3 + 1] += velocities[i * 3 + 1];
          pos[i * 3] += Math.sin(time * 0.6 + i) * 0.15;

          if (pos[i * 3 + 1] > 230) {
            pos[i * 3 + 1] = -230;
            pos[i * 3] = (Math.random() - 0.5) * 550;
          }
        }
        geometry.attributes.position.needsUpdate = true;

        camera.position.x += (mouseX - camera.position.x) * 0.04;
        camera.position.y += (-mouseY - camera.position.y) * 0.04;
        camera.lookAt(scene.position);

        renderer.render(scene, camera);
      }

      animate();
      canvas.style.opacity = '1';

      const onResize = () => {
        if (!renderer) return;
        const w = window.innerWidth;
        const h = window.innerHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      };
      window.addEventListener('resize', onResize);

      this.ambient = {
        scene,
        camera,
        renderer,
        material,
        destroy: () => {
          cancelAnimationFrame(animId);
          window.removeEventListener('resize', onResize);
          window.removeEventListener('mousemove', onPointerMove);
          window.removeEventListener('touchmove', onPointerMove);
          geometry.dispose();
          material.dispose();
          particleTexture.dispose();
          renderer.dispose();
        },
        updateCategoryColor: (cat) => {
          let targetHex = 0xfc4b15;
          const c = (cat || '').toLowerCase();
          if (c.includes('cerveja') || c.includes('chopp')) targetHex = 0xf59e0b;
          else if (c.includes('bebida') || c.includes('drink')) targetHex = 0x06b6d4;
          else if (c.includes('peixe') || c.includes('marisco') || c.includes('camar')) targetHex = 0x0ea5e9;
          else if (c.includes('sobremesa')) targetHex = 0xf43f5e;
          else if (c.includes('chapa') || c.includes('prato') || c.includes('carne')) targetHex = 0xea580c;

          material.color.setHex(targetHex);
        }
      };
    },

    // ─── PALCO 3D INTERATIVO (Modal de Detalhes) ───
    initDishStage: function () {
      const modalContent = document.querySelector('#modal-item-details .modal-content');
      if (!modalContent || document.getElementById('modal-3d-stage')) return;

      const isMuted = ChefGastronomicAudio.isMuted;
      const stageHtml = `
        <div id="modal-3d-stage" class="modal-3d-stage" style="display:none; position:relative; width:100%; height:215px; border-radius:18px; margin:10px 0 12px 0; overflow:hidden; background:radial-gradient(circle at 50% 50%, rgba(252,75,21,0.08) 0%, rgba(15,23,42,0.03) 80%); border:1.5px solid rgba(252,75,21,0.22); box-shadow:inset 0 2px 14px rgba(0,0,0,0.06);">
          <canvas id="dish-3d-canvas" style="width:100%; height:100%; display:block; outline:none; cursor:grab;"></canvas>
          
          <!-- Controles Superiores: Botão AR + Botão Som ASMR -->
          <div style="position:absolute; top:8px; left:8px; right:8px; display:flex; justify-content:space-between; align-items:center; z-index:2; pointer-events:none;">
            <button type="button" id="btn-open-ar-mode" onclick="window.ChefCardapio3D.openAR()" style="pointer-events:auto; background:linear-gradient(135deg, #fc4b15, #f59e0b); border:none; color:#fff; font-size:10.5px; font-weight:800; padding:5px 12px; border-radius:14px; cursor:pointer; display:inline-flex; align-items:center; gap:5px; box-shadow:0 3px 10px rgba(252,75,21,0.35); transition:transform 0.15s ease;">
              <i class="ph-bold ph-camera"></i> <span>Ver na Mesa (AR)</span>
            </button>

            <div style="display:flex; gap:6px; align-items:center;">
              <button type="button" id="btn-toggle-sound-3d" onclick="window.ChefCardapio3D.toggleAudio()" style="pointer-events:auto; background:rgba(15,23,42,0.72); backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px); border:1px solid rgba(255,255,255,0.2); color:#fff; font-size:10px; font-weight:700; padding:4px 9px; border-radius:12px; cursor:pointer; display:inline-flex; align-items:center; gap:4px;">
                <i class="ph-bold ${isMuted ? 'ph-speaker-slash' : 'ph-speaker-high'}" id="icon-sound-status"></i>
                <span id="label-sound-status">${isMuted ? 'ASMR Mudo' : 'ASMR On'}</span>
              </button>
              <span style="background:rgba(15,23,42,0.72); backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px); color:#f59e0b; font-size:10px; font-weight:800; padding:4px 8px; border-radius:12px; display:inline-flex; align-items:center; gap:3px; border:1px solid rgba(245,158,11,0.3);">
                <i class="ph-fill ph-sparkle"></i> 3D Ultra
              </span>
            </div>
          </div>

          <!-- Controles Inferiores: Dica de Toque + Vapor -->
          <div style="position:absolute; bottom:8px; left:8px; right:8px; display:flex; justify-content:space-between; align-items:center; z-index:2; pointer-events:none;">
            <span style="background:rgba(15,23,42,0.72); backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px); color:#fff; font-size:10px; font-weight:600; padding:4px 10px; border-radius:20px; display:inline-flex; align-items:center; gap:5px;">
              <i class="ph-bold ph-hand-pointing" style="color:#f59e0b;"></i> Gire para ouvir o ASMR
            </span>
            <button type="button" id="btn-toggle-steam-3d" onclick="window.ChefCardapio3D.toggleSteam()" style="pointer-events:auto; background:rgba(15,23,42,0.72); backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px); border:1px solid rgba(255,255,255,0.2); color:#fff; font-size:10px; font-weight:700; padding:4px 9px; border-radius:12px; cursor:pointer; display:inline-flex; align-items:center; gap:4px; transition:all 0.2s ease;">
              <i class="ph-bold ph-wind"></i> <span id="label-steam-status">Vapor On</span>
            </button>
          </div>
        </div>
      `;

      const titleWrapper = document.getElementById('modal-item-description');
      if (titleWrapper) {
        titleWrapper.insertAdjacentHTML('afterend', stageHtml);
      } else {
        const modalHeader = modalContent.querySelector('div[style*="display: flex"]');
        if (modalHeader) modalHeader.insertAdjacentHTML('afterend', stageHtml);
      }

      this.dishStage = new DishRenderer();
    },

    showDish3D: function (item) {
      if (!this.isEnabled || !this.dishStage) return;
      const stage = document.getElementById('modal-3d-stage');
      if (stage) stage.style.display = 'block';

      this.dishStage.loadItem(item);
    },

    hideDish3D: function () {
      const stage = document.getElementById('modal-3d-stage');
      if (stage) stage.style.display = 'none';
      if (this.dishStage) this.dishStage.pause();
    },

    toggleSteam: function () {
      ChefHaptics.switchToggle();
      if (this.dishStage) this.dishStage.toggleSteam();
    },

    // ─── ABERTURA DA REALIDADE AUMENTADA (AR) ───
    openAR: function () {
      ChefHaptics.switchToggle();
      if (!this.dishStage || !this.dishStage.currentItem) {
        if (typeof showToast === 'function') showToast('Selecione um prato para ver em AR.', 'info');
        return;
      }
      ChefARSession.start(this.dishStage.currentItem, this.dishStage);
    },

    closeAR: function () {
      ChefHaptics.switchToggle();
      ChefARSession.stop();
    },

    resetARScale: function () {
      ChefHaptics.tick();
      ChefARSession.resetScale();
    },

    takeARSnapshot: function () {
      ChefARSession.takeSnapshot();
    },

    addFromAR: function () {
      this.closeAR();
      window.adicionarItemAoCarrinho && window.adicionarItemAoCarrinho();
    },

    // ─── FLY-TO-CART 3D ───
    initFlyToCart: function () {
      this.flyEffect = new FlyToCartManager();
    },

    triggerAddToCartFly: function (startEl) {
      ChefGastronomicAudio.playAddToCart();
      ChefHaptics.pop();

      if (!this.isEnabled || !this.flyEffect) return;
      const cartFab = document.getElementById('fab-cart');
      if (!cartFab) return;
      this.flyEffect.spawn(startEl || document.querySelector('.btn-submit'), cartFab);
    },

    // ─── TILT 3D NOS CARDS ───
    initCard3DTilt: function () {
      if (window.matchMedia('(hover: none)').matches) return;

      document.addEventListener('mousemove', (e) => {
        if (!this.isEnabled) return;
        const card = e.target.closest('.menu-card');
        if (!card) return;

        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;

        const rotateX = ((y - centerY) / centerY) * -7;
        const rotateY = ((x - centerX) / centerX) * 7;

        card.style.transform = `perspective(1000px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) translateY(-3px) scale(1.015)`;
        card.style.boxShadow = `0 12px 28px rgba(0, 0, 0, 0.12), 0 4px 10px rgba(252, 75, 21, 0.08)`;
      });

      document.addEventListener('mouseout', (e) => {
        const card = e.target.closest('.menu-card');
        if (card && (!e.relatedTarget || !card.contains(e.relatedTarget))) {
          card.style.transform = '';
          card.style.boxShadow = '';
        }
      });
    }
  };

  // ══════════════════════════════════════════════════════════════════════════
  // MÓDULO 4: PALCO 3D DO PRATO (DishRenderer)
  // ══════════════════════════════════════════════════════════════════════════
  function DishRenderer() {
    this.canvas = document.getElementById('dish-3d-canvas');
    if (!this.canvas) return;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, this.canvas.clientWidth / this.canvas.clientHeight, 0.1, 100);
    this.camera.position.set(0, 3.2, 5.2);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.setupLighting();

    this.dishGroup = new THREE.Group();
    this.scene.add(this.dishGroup);

    this.steamEnabled = true;
    this.steamParticles = [];
    this.initSteamSystem();

    this.isDragging = false;
    this.prevMouseX = 0;
    this.prevMouseY = 0;
    this.autoRotate = true;
    this.rotVelocityX = 0;
    this.rotDegreeAccumulator = 0;
    this.currentItem = null;

    this.setupInteraction();

    this.active = false;
    this.animId = null;
    this.clock = new THREE.Clock();
  }

  DishRenderer.prototype.setupLighting = function () {
    const amb = new THREE.AmbientLight(0xfff7ed, 0.9);
    this.scene.add(amb);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
    keyLight.position.set(4, 7, 5);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    this.scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xf59e0b, 1.1);
    rimLight.position.set(-4, 3, -4);
    this.scene.add(rimLight);

    const fillLight = new THREE.PointLight(0x38bdf8, 0.6, 10);
    fillLight.position.set(0, -1, 3);
    this.scene.add(fillLight);
  };

  DishRenderer.prototype.setupInteraction = function () {
    const el = this.canvas;
    const self = this;

    const onStart = (clientX, clientY) => {
      self.isDragging = true;
      self.autoRotate = false;
      self.prevMouseX = clientX;
      self.prevMouseY = clientY;
      el.style.cursor = 'grabbing';
      ChefGastronomicAudio.init();
      ChefGastronomicAudio.resume();
    };

    const onMove = (clientX, clientY) => {
      if (!self.isDragging) return;
      const dx = clientX - self.prevMouseX;
      const dy = clientY - self.prevMouseY;

      self.dishGroup.rotation.y += dx * 0.009;
      self.dishGroup.rotation.x = Math.max(-0.25, Math.min(0.5, self.dishGroup.rotation.x + dy * 0.007));

      self.rotVelocityX = dx * 0.004;
      self.prevMouseX = clientX;
      self.prevMouseY = clientY;

      // Gatilho de Áudio ASMR & Háptica a cada rotação
      if (Math.abs(dx) > 3) {
        self.rotDegreeAccumulator += Math.abs(dx);
        if (self.rotDegreeAccumulator > 32) {
          self.rotDegreeAccumulator = 0;
          ChefHaptics.tick();

          if (self.currentItem) {
            const n = (self.currentItem.nome || '').toLowerCase();
            const c = (self.currentItem.categoria || '').toLowerCase();
            if (c.includes('cerveja') || c.includes('bebida') || n.includes('chopp')) {
              ChefGastronomicAudio.playFizz();
            } else if (n.includes('filé') || n.includes('picanha') || c.includes('chapa') || c.includes('prato')) {
              ChefGastronomicAudio.playSizzle();
            } else if (n.includes('camar') || n.includes('peixe') || n.includes('ostra') || n.includes('siri')) {
              ChefGastronomicAudio.playOceanChime();
            } else if (c.includes('sobremesa') || n.includes('pudim')) {
              ChefGastronomicAudio.playDessertChime();
            }
          }
        }
      }
    };

    const onEnd = () => {
      self.isDragging = false;
      el.style.cursor = 'grab';
    };

    el.addEventListener('mousedown', (e) => onStart(e.clientX, e.clientY));
    window.addEventListener('mousemove', (e) => onMove(e.clientX, e.clientY));
    window.addEventListener('mouseup', onEnd);

    el.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) onStart(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      if (e.touches.length === 1) onMove(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });

    window.addEventListener('touchend', onEnd);
  };

  DishRenderer.prototype.initSteamSystem = function () {
    const sCanvas = document.createElement('canvas');
    sCanvas.width = 32;
    sCanvas.height = 32;
    const ctx = sCanvas.getContext('2d');
    const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.45)');
    grad.addColorStop(0.5, 'rgba(255, 255, 255, 0.15)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 32, 32);
    const steamTex = new THREE.CanvasTexture(sCanvas);

    const count = 35;
    const geom = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    this.steamData = [];

    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 1.2;
      pos[i * 3 + 1] = 0.4 + Math.random() * 1.8;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 1.2;

      this.steamData.push({
        origY: pos[i * 3 + 1],
        speedY: 0.012 + Math.random() * 0.015,
        wobble: Math.random() * Math.PI * 2
      });
    }

    geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));

    const mat = new THREE.PointsMaterial({
      size: 0.55,
      map: steamTex,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    this.steamMesh = new THREE.Points(geom, mat);
    this.dishGroup.add(this.steamMesh);
  };

  DishRenderer.prototype.toggleSteam = function () {
    this.steamEnabled = !this.steamEnabled;
    if (this.steamMesh) this.steamMesh.visible = this.steamEnabled;
    const lbl = document.getElementById('label-steam-status');
    if (lbl) lbl.innerText = this.steamEnabled ? 'Vapor On' : 'Vapor Off';
  };

  DishRenderer.prototype.loadItem = function (item) {
    this.currentItem = item;

    while (this.dishGroup.children.length > 0) {
      const obj = this.dishGroup.children[0];
      this.dishGroup.remove(obj);
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
        else obj.material.dispose();
      }
    }

    this.initSteamSystem();

    const nome = (item.nome || '').toLowerCase();
    const cat = (item.categoria || '').toLowerCase();

    if (nome.includes('camar') || cat.includes('camar') || nome.includes('peixe') || nome.includes('ostra') || nome.includes('marisco') || nome.includes('siri')) {
      this.buildSeafoodPlate();
    } else if (cat.includes('cerveja') || cat.includes('bebida') || nome.includes('chopp') || nome.includes('heineken') || nome.includes('stella') || nome.includes('spaten') || nome.includes('refrigerante') || nome.includes('coca')) {
      this.buildDrinkModel();
    } else if (cat.includes('caipirinha') || cat.includes('drink') || cat.includes('dose') || nome.includes('caipir')) {
      this.buildCocktailModel();
    } else if (cat.includes('sobremesa') || nome.includes('pudim') || nome.includes('doce')) {
      this.buildDessertModel();
    } else if (nome.includes('filé') || nome.includes('file') || nome.includes('picanha') || nome.includes('frango') || cat.includes('prato') || cat.includes('chapa')) {
      this.buildMeatSkillet();
    } else {
      this.buildSnackBasket();
    }

    this.dishGroup.rotation.set(0.18, 0, 0);
    this.start();
  };

  DishRenderer.prototype.buildSeafoodPlate = function () {
    const plateGeom = new THREE.CylinderGeometry(2.1, 1.6, 0.22, 48);
    const plateMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.35, metalness: 0.15 });
    const plate = new THREE.Mesh(plateGeom, plateMat);
    plate.position.y = -0.11;
    plate.receiveShadow = true;
    this.dishGroup.add(plate);

    const baseGeom = new THREE.CylinderGeometry(1.65, 1.7, 0.12, 32);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.8 });
    const base = new THREE.Mesh(baseGeom, baseMat);
    base.position.y = 0.05;
    this.dishGroup.add(base);

    const shrimpMat = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.25, metalness: 0.1 });
    const shrimpAngles = [0, 1.25, 2.5, 3.75, 5.0];
    shrimpAngles.forEach((ang) => {
      const sGeom = new THREE.TorusGeometry(0.42, 0.15, 14, 28, Math.PI * 1.35);
      const shrimp = new THREE.Mesh(sGeom, shrimpMat);
      shrimp.rotation.x = Math.PI / 2.1;
      shrimp.rotation.z = ang;
      shrimp.position.set(Math.cos(ang) * 0.85, 0.22, Math.sin(ang) * 0.85);
      shrimp.castShadow = true;
      this.dishGroup.add(shrimp);
    });

    const lemonGeom = new THREE.CylinderGeometry(0.35, 0.35, 0.06, 18);
    const lemonMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.4 });
    const lemon = new THREE.Mesh(lemonGeom, lemonMat);
    lemon.position.set(0, 0.22, 0);
    lemon.rotation.x = 0.2;
    this.dishGroup.add(lemon);

    const herbGeom = new THREE.DodecahedronGeometry(0.06);
    const herbMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.9 });
    for (let i = 0; i < 14; i++) {
      const herb = new THREE.Mesh(herbGeom, herbMat);
      herb.position.set((Math.random() - 0.5) * 1.4, 0.22, (Math.random() - 0.5) * 1.4);
      this.dishGroup.add(herb);
    }
  };

  DishRenderer.prototype.buildDrinkModel = function () {
    const glassGeom = new THREE.CylinderGeometry(0.95, 0.85, 2.3, 32, 1, true);
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.38,
      roughness: 0.1,
      metalness: 0.05,
      transmission: 0.9,
      ior: 1.5
    });
    const glass = new THREE.Mesh(glassGeom, glassMat);
    glass.position.y = 1.15;
    this.dishGroup.add(glass);

    const bottomGeom = new THREE.CylinderGeometry(0.85, 0.88, 0.2, 32);
    const bottom = new THREE.Mesh(bottomGeom, glassMat);
    bottom.position.y = 0.1;
    this.dishGroup.add(bottom);

    const beerGeom = new THREE.CylinderGeometry(0.9, 0.82, 1.9, 32);
    const beerMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.15, metalness: 0.2 });
    const beer = new THREE.Mesh(beerGeom, beerMat);
    beer.position.y = 1.05;
    this.dishGroup.add(beer);

    const foamGeom = new THREE.CylinderGeometry(0.97, 0.92, 0.42, 32);
    const foamMat = new THREE.MeshStandardMaterial({ color: 0xfffbeb, roughness: 0.85 });
    const foam = new THREE.Mesh(foamGeom, foamMat);
    foam.position.y = 2.18;
    this.dishGroup.add(foam);

    const handleGeom = new THREE.TorusGeometry(0.55, 0.12, 16, 32, Math.PI);
    const handle = new THREE.Mesh(handleGeom, glassMat);
    handle.position.set(0.98, 1.25, 0);
    handle.rotation.z = -Math.PI / 2;
    this.dishGroup.add(handle);

    const bCount = 20;
    const bGeom = new THREE.SphereGeometry(0.04, 8, 8);
    const bMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (let i = 0; i < bCount; i++) {
      const bubble = new THREE.Mesh(bGeom, bMat);
      bubble.position.set((Math.random() - 0.5) * 1.3, 0.3 + Math.random() * 1.5, (Math.random() - 0.5) * 1.3);
      this.dishGroup.add(bubble);
    }
  };

  DishRenderer.prototype.buildCocktailModel = function () {
    const glassGeom = new THREE.CylinderGeometry(1.05, 0.95, 1.8, 28);
    const glassMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, roughness: 0.1 });
    const glass = new THREE.Mesh(glassGeom, glassMat);
    glass.position.y = 0.9;
    this.dishGroup.add(glass);

    const liquidGeom = new THREE.CylinderGeometry(0.98, 0.9, 1.45, 28);
    const liquidMat = new THREE.MeshStandardMaterial({ color: 0x84cc16, transparent: true, opacity: 0.75, roughness: 0.2 });
    const liquid = new THREE.Mesh(liquidGeom, liquidMat);
    liquid.position.y = 0.75;
    this.dishGroup.add(liquid);

    const iceMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, roughness: 0.05, metalness: 0.1 });
    const iceGeom = new THREE.BoxGeometry(0.48, 0.48, 0.48);

    const ice1 = new THREE.Mesh(iceGeom, iceMat);
    ice1.position.set(0.2, 0.9, 0.1);
    ice1.rotation.set(0.3, 0.5, 0.2);
    this.dishGroup.add(ice1);

    const ice2 = new THREE.Mesh(iceGeom, iceMat);
    ice2.position.set(-0.25, 1.1, -0.15);
    ice2.rotation.set(0.6, -0.3, 0.4);
    this.dishGroup.add(ice2);

    const limeGeom = new THREE.CylinderGeometry(0.4, 0.4, 0.07, 16);
    const limeMat = new THREE.MeshStandardMaterial({ color: 0x65a30d, roughness: 0.35 });
    const lime = new THREE.Mesh(limeGeom, limeMat);
    lime.position.set(0, 1.4, 0.1);
    lime.rotation.set(0.7, 0.2, 0.5);
    this.dishGroup.add(lime);
  };

  DishRenderer.prototype.buildDessertModel = function () {
    const plateGeom = new THREE.CylinderGeometry(2.0, 1.5, 0.18, 48);
    const plateMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2, metalness: 0.05 });
    const plate = new THREE.Mesh(plateGeom, plateMat);
    plate.position.y = -0.09;
    this.dishGroup.add(plate);

    const puddingGeom = new THREE.CylinderGeometry(1.0, 1.35, 0.8, 36);
    const puddingMat = new THREE.MeshStandardMaterial({ color: 0xfef08a, roughness: 0.4 });
    const pudding = new THREE.Mesh(puddingGeom, puddingMat);
    pudding.position.y = 0.4;
    this.dishGroup.add(pudding);

    const caramelGeom = new THREE.CylinderGeometry(1.02, 1.05, 0.16, 36);
    const caramelMat = new THREE.MeshStandardMaterial({ color: 0x9a3412, roughness: 0.15, metalness: 0.3 });
    const caramel = new THREE.Mesh(caramelGeom, caramelMat);
    caramel.position.y = 0.82;
    this.dishGroup.add(caramel);

    const syrupPoolGeom = new THREE.CylinderGeometry(1.7, 1.7, 0.04, 32);
    const pool = new THREE.Mesh(syrupPoolGeom, caramelMat);
    pool.position.y = 0.02;
    this.dishGroup.add(pool);

    const mintGeom = new THREE.ConeGeometry(0.18, 0.35, 8);
    const mintMat = new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.5 });
    const mint = new THREE.Mesh(mintGeom, mintMat);
    mint.position.set(0, 0.98, 0);
    mint.rotation.x = -0.3;
    this.dishGroup.add(mint);
  };

  DishRenderer.prototype.buildMeatSkillet = function () {
    const panGeom = new THREE.CylinderGeometry(1.9, 1.7, 0.35, 36);
    const panMat = new THREE.MeshStandardMaterial({ color: 0x27272a, roughness: 0.6, metalness: 0.5 });
    const pan = new THREE.Mesh(panGeom, panMat);
    pan.position.y = 0.17;
    this.dishGroup.add(pan);

    const handleGeom = new THREE.BoxGeometry(0.28, 0.14, 1.6);
    const handle = new THREE.Mesh(handleGeom, panMat);
    handle.position.set(0, 0.22, 2.3);
    this.dishGroup.add(handle);

    const steakGeom = new THREE.CylinderGeometry(1.1, 1.15, 0.32, 24);
    const steakMat = new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.7 });
    const steak = new THREE.Mesh(steakGeom, steakMat);
    steak.position.y = 0.42;
    this.dishGroup.add(steak);

    const butterGeom = new THREE.CylinderGeometry(0.3, 0.35, 0.12, 16);
    const butterMat = new THREE.MeshStandardMaterial({ color: 0xfef08a, roughness: 0.25 });
    const butter = new THREE.Mesh(butterGeom, butterMat);
    butter.position.set(0.1, 0.62, -0.05);
    this.dishGroup.add(butter);

    const fryMat = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.5 });
    const fryGeom = new THREE.BoxGeometry(0.18, 0.18, 0.7);
    for (let i = 0; i < 5; i++) {
      const fry = new THREE.Mesh(fryGeom, fryMat);
      const ang = (i / 5) * Math.PI * 2;
      fry.position.set(Math.cos(ang) * 1.35, 0.42, Math.sin(ang) * 1.35);
      fry.rotation.set(0.2, ang, 0.4);
      this.dishGroup.add(fry);
    }
  };

  DishRenderer.prototype.buildSnackBasket = function () {
    const boardGeom = new THREE.CylinderGeometry(1.9, 1.9, 0.18, 36);
    const boardMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.75 });
    const board = new THREE.Mesh(boardGeom, boardMat);
    board.position.y = 0.09;
    this.dishGroup.add(board);

    const pastelMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.4, metalness: 0.1 });
    const pastelGeom = new THREE.BoxGeometry(1.1, 0.14, 0.8);

    for (let i = 0; i < 3; i++) {
      const pastel = new THREE.Mesh(pastelGeom, pastelMat);
      pastel.position.set((i - 1) * 0.45, 0.35 + i * 0.08, 0.1);
      pastel.rotation.set(0.25, (i - 1) * 0.2, 0.1);
      pastel.castShadow = true;
      this.dishGroup.add(pastel);
    }

    const ramekinGeom = new THREE.CylinderGeometry(0.45, 0.35, 0.32, 24);
    const ramekinMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 });
    const ramekin = new THREE.Mesh(ramekinGeom, ramekinMat);
    ramekin.position.set(0, 0.3, -1.05);
    this.dishGroup.add(ramekin);

    const sauceGeom = new THREE.CylinderGeometry(0.4, 0.4, 0.06, 24);
    const sauceMat = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.2 });
    const sauce = new THREE.Mesh(sauceGeom, sauceMat);
    sauce.position.set(0, 0.42, -1.05);
    this.dishGroup.add(sauce);
  };

  DishRenderer.prototype.start = function () {
    if (this.active) return;
    this.active = true;
    const self = this;

    function render() {
      if (!self.active) return;
      self.animId = requestAnimationFrame(render);

      if (self.autoRotate && !self.isDragging) {
        self.dishGroup.rotation.y += 0.007;
      } else if (!self.isDragging) {
        self.dishGroup.rotation.y += self.rotVelocityX;
        self.rotVelocityX *= 0.92;
        if (Math.abs(self.rotVelocityX) < 0.0005) self.autoRotate = true;
      }

      if (self.steamEnabled && self.steamMesh && self.steamData) {
        const pos = self.steamMesh.geometry.attributes.position.array;
        for (let i = 0; i < self.steamData.length; i++) {
          const d = self.steamData[i];
          pos[i * 3 + 1] += d.speedY;
          pos[i * 3] += Math.sin(pos[i * 3 + 1] * 2.5 + d.wobble) * 0.004;

          if (pos[i * 3 + 1] > 2.3) {
            pos[i * 3 + 1] = 0.35;
            pos[i * 3] = (Math.random() - 0.5) * 0.9;
          }
        }
        self.steamMesh.geometry.attributes.position.needsUpdate = true;
      }

      self.renderer.render(self.scene, self.camera);
    }

    render();
  };

  DishRenderer.prototype.pause = function () {
    this.active = false;
    if (this.animId) cancelAnimationFrame(this.animId);
  };

  DishRenderer.prototype.destroy = function () {
    this.pause();
    this.renderer.dispose();
  };

  // ══════════════════════════════════════════════════════════════════════════
  // MÓDULO 5: SESSÃO DE REALIDADE AUMENTADA (ChefARSession)
  // ══════════════════════════════════════════════════════════════════════════
  const ChefARSession = {
    overlay: null,
    video: null,
    canvas: null,
    stream: null,
    scene: null,
    camera: null,
    renderer: null,
    dishGroup: null,
    reticle: null,
    animId: null,
    dishScale: 1.0,
    item: null,

    start: function (item, sourceStage) {
      this.item = item;
      this.createOverlay();

      const constraints = {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      };

      navigator.mediaDevices.getUserMedia(constraints)
        .then((stream) => {
          this.stream = stream;
          this.video.srcObject = stream;
          this.video.play();
          this.overlay.style.display = 'flex';
          this.initARScene(item, sourceStage);
          ChefHaptics.arPlace();
        })
        .catch((err) => {
          console.error('[ChefARSession] Erro ao acessar câmera:', err);
          if (typeof showToast === 'function') {
            showToast('Permissão de câmera necessária para projetar o prato na mesa.', 'warning');
          } else {
            alert('Não foi possível acessar a câmera. Verifique as permissões do navegador.');
          }
          this.stop();
        });
    },

    createOverlay: function () {
      if (this.overlay) return;

      const div = document.createElement('div');
      div.id = 'chef-ar-overlay';
      div.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        z-index: 999999;
        background: #000;
        display: none;
        flex-direction: column;
        overflow: hidden;
      `;

      div.innerHTML = `
        <video id="chef-ar-video" autoplay playsinline muted style="position:absolute; top:0; left:0; width:100%; height:100%; object-fit:cover;"></video>
        <canvas id="chef-ar-canvas" style="position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:auto; outline:none; touch-action:none;"></canvas>

        <!-- Barra Superior -->
        <div style="position:absolute; top:calc(env(safe-area-inset-top, 16px) + 12px); left:16px; right:16px; display:flex; justify-content:space-between; align-items:center; z-index:10; pointer-events:none;">
          <div style="background:rgba(15,23,42,0.82); backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px); border:1px solid rgba(255,255,255,0.18); border-radius:16px; padding:8px 14px; color:#fff; pointer-events:auto; box-shadow:0 4px 14px rgba(0,0,0,0.25);">
            <div id="ar-dish-name" style="font-weight:800; font-size:13.5px; color:#fff; max-width:210px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">Prato em AR</div>
            <div id="ar-dish-price" style="font-size:12px; font-weight:700; color:#fc4b15;">R$ 0,00</div>
          </div>

          <div style="display:flex; gap:8px; pointer-events:auto;">
            <button type="button" id="btn-ar-reset-scale" onclick="window.ChefCardapio3D.resetARScale()" style="background:rgba(15,23,42,0.82); backdrop-filter:blur(12px); border:1px solid rgba(255,255,255,0.18); color:#f59e0b; font-size:11px; font-weight:800; padding:8px 12px; border-radius:14px; cursor:pointer;">
              <span id="ar-scale-label">100% Real</span>
            </button>
            <button type="button" onclick="window.ChefCardapio3D.closeAR()" style="background:rgba(15,23,42,0.85); backdrop-filter:blur(12px); border:1px solid rgba(255,255,255,0.2); color:#fff; width:38px; height:38px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:19px; font-weight:bold; cursor:pointer;">
              &times;
            </button>
          </div>
        </div>

        <!-- Banner Central de Orientação -->
        <div id="ar-hint-banner" style="position:absolute; top:86px; left:50%; transform:translateX(-50%); background:rgba(15,23,42,0.78); backdrop-filter:blur(10px); color:#fff; padding:6px 14px; border-radius:20px; font-size:11.5px; font-weight:600; display:flex; align-items:center; gap:6px; z-index:10; pointer-events:none; border:1px solid rgba(255,255,255,0.12); white-space:nowrap;">
          <i class="ph-bold ph-hand-pointing" style="color:#f59e0b;"></i> Aponte para a mesa e arraste para posicionar
        </div>

        <!-- Barra Inferior com Captura de Foto e Adicionar -->
        <div style="position:absolute; bottom:calc(env(safe-area-inset-bottom, 16px) + 16px); left:16px; right:16px; display:flex; justify-content:space-between; align-items:center; z-index:10;">
          <button type="button" onclick="window.ChefCardapio3D.takeARSnapshot()" style="flex:1; margin-right:10px; padding:12px 16px; border-radius:16px; background:linear-gradient(135deg, #fc4b15, #f59e0b); color:#fff; border:none; font-weight:800; font-size:13px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px; box-shadow:0 4px 16px rgba(252,75,21,0.4);">
            <i class="ph-bold ph-camera" style="font-size:17px;"></i> Tirar Foto na Mesa
          </button>
          <button type="button" onclick="window.ChefCardapio3D.addFromAR()" style="padding:12px 18px; border-radius:16px; background:#10b981; color:#fff; border:none; font-weight:800; font-size:13px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px; box-shadow:0 4px 16px rgba(16,185,129,0.35);">
            <i class="ph-bold ph-plus-circle" style="font-size:17px;"></i> Pedir
          </button>
        </div>
      `;

      document.body.appendChild(div);
      this.overlay = div;
      this.video = div.querySelector('#chef-ar-video');
      this.canvas = div.querySelector('#chef-ar-canvas');
    },

    initARScene: function (item) {
      const w = window.innerWidth;
      const h = window.innerHeight;

      document.getElementById('ar-dish-name').innerText = item.nome || 'Prato Especial';
      document.getElementById('ar-dish-price').innerText = `R$ ${parseFloat(item.preco || 0).toFixed(2).replace('.', ',')}`;

      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(55, w / h, 0.1, 100);
      this.camera.position.set(0, 2.5, 4.2);
      this.camera.lookAt(0, 0, 0);

      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: true
      });
      this.renderer.setSize(w, h);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

      // Iluminação com sombra de mesa realista
      const ambLight = new THREE.AmbientLight(0xffffff, 1.2);
      this.scene.add(ambLight);

      const dirLight = new THREE.DirectionalLight(0xfffbeb, 1.5);
      dirLight.position.set(2, 6, 3);
      dirLight.castShadow = true;
      dirLight.shadow.mapSize.width = 1024;
      dirLight.shadow.mapSize.height = 1024;
      this.scene.add(dirLight);

      // Plano de Sombra Invisível na Superfície da Mesa
      const shadowPlaneGeo = new THREE.PlaneGeometry(12, 12);
      const shadowPlaneMat = new THREE.ShadowMaterial({ opacity: 0.45 });
      const shadowPlane = new THREE.Mesh(shadowPlaneGeo, shadowPlaneMat);
      shadowPlane.rotation.x = -Math.PI / 2;
      shadowPlane.position.y = -0.01;
      shadowPlane.receiveShadow = true;
      this.scene.add(shadowPlane);

      // Retículo circular indicador da mesa
      const reticleGeo = new THREE.RingGeometry(1.6, 1.68, 36);
      const reticleMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b, side: THREE.DoubleSide, transparent: true, opacity: 0.6 });
      this.reticle = new THREE.Mesh(reticleGeo, reticleMat);
      this.reticle.rotation.x = -Math.PI / 2;
      this.reticle.position.y = 0.01;
      this.scene.add(this.reticle);

      // Grupo do Prato em AR
      this.dishGroup = new THREE.Group();
      this.scene.add(this.dishGroup);

      // Clona o prato ativo usando o builder correspondente
      const tempStage = new DishRenderer();
      tempStage.dishGroup = this.dishGroup;
      tempStage.loadItem(item);
      tempStage.pause();

      this.dishScale = 1.0;
      this.dishGroup.scale.set(1.0, 1.0, 1.0);
      this.dishGroup.position.set(0, 0, 0);

      this.setupARGestures();

      const self = this;
      function renderLoop() {
        self.animId = requestAnimationFrame(renderLoop);

        // Pulso do retículo
        if (self.reticle) {
          const s = 1.0 + Math.sin(Date.now() * 0.003) * 0.05;
          self.reticle.scale.set(s, s, s);
        }

        self.renderer.render(self.scene, self.camera);
      }
      renderLoop();
    },

    setupARGestures: function () {
      const el = this.canvas;
      const self = this;

      let isDragging = false;
      let startX = 0;
      let startY = 0;
      let initialDist = 0;
      let initialScale = 1.0;

      const getTouchDist = (t1, t2) => {
        const dx = t1.clientX - t2.clientX;
        const dy = t1.clientY - t2.clientY;
        return Math.sqrt(dx * dx + dy * dy);
      };

      el.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
          isDragging = true;
          startX = e.touches[0].clientX;
          startY = e.touches[0].clientY;
        } else if (e.touches.length === 2) {
          isDragging = false;
          initialDist = getTouchDist(e.touches[0], e.touches[1]);
          initialScale = self.dishScale;
        }
      }, { passive: true });

      el.addEventListener('touchmove', (e) => {
        if (isDragging && e.touches.length === 1) {
          const dx = e.touches[0].clientX - startX;
          const dy = e.touches[0].clientY - startY;

          self.dishGroup.position.x += dx * 0.006;
          self.dishGroup.position.z += dy * 0.006;
          self.reticle.position.x = self.dishGroup.position.x;
          self.reticle.position.z = self.dishGroup.position.z;

          startX = e.touches[0].clientX;
          startY = e.touches[0].clientY;
        } else if (e.touches.length === 2) {
          const currentDist = getTouchDist(e.touches[0], e.touches[1]);
          const ratio = currentDist / initialDist;
          self.dishScale = Math.max(0.5, Math.min(1.8, initialScale * ratio));
          self.dishGroup.scale.set(self.dishScale, self.dishScale, self.dishScale);

          const lbl = document.getElementById('ar-scale-label');
          if (lbl) lbl.innerText = `${Math.round(self.dishScale * 100)}% Real`;
        }
      }, { passive: true });

      el.addEventListener('touchend', () => {
        isDragging = false;
        ChefHaptics.tick();
      });

      // Mouse drag no desktop
      let isMouseDown = false;
      el.addEventListener('mousedown', (e) => {
        isMouseDown = true;
        startX = e.clientX;
        startY = e.clientY;
      });
      window.addEventListener('mousemove', (e) => {
        if (!isMouseDown) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        self.dishGroup.position.x += dx * 0.006;
        self.dishGroup.position.z += dy * 0.006;
        self.reticle.position.x = self.dishGroup.position.x;
        self.reticle.position.z = self.dishGroup.position.z;
        startX = e.clientX;
        startY = e.clientY;
      });
      window.addEventListener('mouseup', () => { isMouseDown = false; });
    },

    resetScale: function () {
      this.dishScale = 1.0;
      if (this.dishGroup) this.dishGroup.scale.set(1, 1, 1);
      const lbl = document.getElementById('ar-scale-label');
      if (lbl) lbl.innerText = '100% Real';
    },

    takeSnapshot: function () {
      ChefGastronomicAudio.playShutter();
      ChefHaptics.pop();

      const w = window.innerWidth;
      const h = window.innerHeight;
      const snapCanvas = document.createElement('canvas');
      snapCanvas.width = w;
      snapCanvas.height = h;
      const ctx = snapCanvas.getContext('2d');

      // Desenha frame da câmera
      if (this.video) ctx.drawImage(this.video, 0, 0, w, h);
      // Sobrepõe o prato 3D renderizado
      if (this.canvas) ctx.drawImage(this.canvas, 0, 0, w, h);

      // Marca d'água gastronômica elegante
      ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
      ctx.roundRect(16, h - 54, 230, 38, 12);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12px Inter, sans-serif';
      ctx.fillText(this.item ? this.item.nome : 'Chef Cozinha AR', 28, h - 35);
      ctx.fillStyle = '#fc4b15';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.fillText('✨ Experiência 3D Realidade Aumentada', 28, h - 22);

      snapCanvas.toBlob((blob) => {
        if (!blob) return;
        const file = new File([blob], 'Prato_ChefCozinha_AR.jpg', { type: 'image/jpeg' });

        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          navigator.share({
            title: this.item ? this.item.nome : 'Prato Chef Cozinha em AR',
            text: 'Veja esse prato na minha mesa pelo cardápio digital do Chef Cozinha!',
            files: [file]
          }).catch(() => { });
        } else {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `ChefCozinha_AR_${Date.now()}.jpg`;
          a.click();
          if (typeof showToast === 'function') {
            showToast('📸 Foto salva com sucesso!', 'success');
          }
        }
      }, 'image/jpeg', 0.95);
    },

    stop: function () {
      if (this.animId) cancelAnimationFrame(this.animId);
      if (this.stream) {
        this.stream.getTracks().forEach(t => t.stop());
        this.stream = null;
      }
      if (this.overlay) {
        this.overlay.style.display = 'none';
      }
      if (this.renderer) {
        this.renderer.dispose();
      }
    }
  };

  // ══════════════════════════════════════════════════════════════════════════
  // MÓDULO 6: VÓRTICE DE ADIÇÃO AO CARRINHO (Fly-to-Cart)
  // ══════════════════════════════════════════════════════════════════════════
  function FlyToCartManager() {
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'cart-fly-canvas';
    this.canvas.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      pointer-events: none;
      z-index: 9999;
    `;
    document.body.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.particles = [];
    this.animId = null;

    const onResize = () => {
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', onResize);
    onResize();
  }

  FlyToCartManager.prototype.spawn = function (startEl, endEl) {
    if (!startEl || !endEl) return;
    const r1 = startEl.getBoundingClientRect();
    const r2 = endEl.getBoundingClientRect();

    const startX = r1.left + r1.width / 2;
    const startY = r1.top + r1.height / 2;
    const targetX = r2.left + r2.width / 2;
    const targetY = r2.top + r2.height / 2;

    const count = 30;
    for (let i = 0; i < count; i++) {
      const delay = Math.random() * 0.25;
      const controlX = (startX + targetX) / 2 + (Math.random() - 0.5) * 160;
      const controlY = Math.min(startY, targetY) - 120 - Math.random() * 100;

      this.particles.push({
        startX,
        startY,
        targetX,
        targetY,
        controlX,
        controlY,
        progress: -delay,
        speed: 0.024 + Math.random() * 0.015,
        size: Math.random() * 6 + 3,
        color: Math.random() > 0.4 ? '#fc4b15' : '#f59e0b'
      });
    }

    if (!this.animId) this.animate();
  };

  FlyToCartManager.prototype.animate = function () {
    const self = this;
    const ctx = this.ctx;

    function loop() {
      ctx.clearRect(0, 0, self.canvas.width, self.canvas.height);

      for (let i = self.particles.length - 1; i >= 0; i--) {
        const p = self.particles[i];
        p.progress += p.speed;

        if (p.progress >= 1) {
          self.particles.splice(i, 1);
          continue;
        }

        if (p.progress < 0) continue;

        const t = p.progress;
        const mt = 1 - t;
        const x = mt * mt * p.startX + 2 * mt * t * p.controlX + t * t * p.targetX;
        const y = mt * mt * p.startY + 2 * mt * t * p.controlY + t * t * p.targetY;

        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, p.size * (1 - t * 0.5), 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.restore();
      }

      if (self.particles.length > 0) {
        self.animId = requestAnimationFrame(loop);
      } else {
        self.animId = null;
        const cartFab = document.getElementById('fab-cart');
        if (cartFab) {
          cartFab.style.transform = 'scale(1.22)';
          setTimeout(() => { cartFab.style.transform = ''; }, 260);
        }
      }
    }

    loop();
  };

  // ══════════════════════════════════════════════════════════════════════════
  // INICIALIZAÇÃO AUTOMÁTICA
  // ══════════════════════════════════════════════════════════════════════════
  window.ChefCardapio3D = ChefCardapio3D;
  window.ChefGastronomicAudio = ChefGastronomicAudio;
  window.ChefHaptics = ChefHaptics;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => ChefCardapio3D.init());
  } else {
    ChefCardapio3D.init();
  }

})();
