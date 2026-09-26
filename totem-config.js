/* Chef Cozinha — Personalização do Módulo Totem (upsell SaaS)
   Layouts, seções/cartões, slides de tempo ocioso e aparência.
   Grava as chaves totem_* na tabela configuracoes via /api/config. */
(function () {
  'use strict';

  var params = new URLSearchParams(window.location.search);
  var restauranteId = params.get('restaurante_id') || localStorage.getItem('restaurante_id') || '1';
  try { localStorage.setItem('restaurante_id', String(restauranteId)); } catch (e) { }
  var token = localStorage.getItem('chef_token') || '';

  function $id(id) { return document.getElementById(id); }

  function authHeaders() {
    return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token };
  }

  var LAYOUTS = ['classico', 'split', 'minimal', 'vitrine'];
  var layoutAtual = 'classico';
  var slides = [];

  /* ── Carga inicial ── */

  function carregar() {
    fetch('/api/totem/status?restaurante_id=' + encodeURIComponent(restauranteId))
      .then(function (r) { return r.json(); })
      .then(function (st) {
        if (st && st.feature_ativa === false) {
          $id('banner-upsell').style.display = 'flex';
        }
        preencher(st || {});
      })
      .catch(function () { preencher({}); });
  }

  function preencher(st) {
    var p = st.personalizacao || {};
    var sec = p.secoes || {};
    var card = sec.card || {};
    var ss = p.screensaver || {};

    $id('cfg-enabled').checked = !!(st && st.enabled);
    $id('cfg-mesa').value = st.mesa || 'Totem 1';
    $id('cfg-idle').value = st.idle_timeout_min || 45;

    layoutAtual = LAYOUTS.indexOf(p.layout) !== -1 ? p.layout : 'classico';
    marcarLayout(layoutAtual);

    $id('cfg-sec-destaques').checked = sec.destaques !== false;
    $id('cfg-sec-categorias').checked = sec.categorias !== false;
    $id('cfg-card-emoji').value = card.emoji || '';
    $id('cfg-card-titulo').value = card.titulo || '';
    $id('cfg-card-texto').value = card.texto || '';
    $id('cfg-card-imagem').value = card.imagem || '';
    $id('cfg-card-categoria').value = card.categoria || '';

    $id('cfg-ss-enabled').checked = ss.enabled !== false;
    $id('cfg-ss-segundos').value = Math.max(5, parseInt(ss.segundos, 10) || 20);
    slides = Array.isArray(ss.slides) ? ss.slides.slice(0, 10) : [];
    renderizarSlides();

    $id('cfg-logo').value = p.logo || '';
    $id('cfg-titulo').value = p.titulo || 'Bem-vindo!';
    $id('cfg-subtitulo').value = p.subtitulo || '';
    $id('cfg-cor').value = normalizarHex(p.cor) || '#fc4b15';
    $id('cfg-cor-texto').value = $id('cfg-cor').value;
    $id('cfg-fundo-tipo').value = p.fundo_tipo || 'gradiente';
    $id('cfg-fundo-valor').value = p.fundo_valor || '#0f172a,#293548';

    atualizarEstadoTexto();
    atualizarHintFundo();
    recarregarPreview();
  }

  function normalizarHex(v) {
    var s = String(v || '').trim();
    if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
    return null;
  }

  /* ── Layout ── */

  window.escolherLayout = function (l) {
    if (LAYOUTS.indexOf(l) === -1) return;
    layoutAtual = l;
    marcarLayout(l);
  };

  function marcarLayout(l) {
    document.querySelectorAll('#layout-grid .layout-opt').forEach(function (el) {
      el.classList.toggle('selected', el.dataset.layout === l);
    });
  }

  /* ── Slides do tempo ocioso ── */

  window.adicionarSlide = function () {
    if (slides.length >= 10) { alert('Máximo de 10 slides.'); return; }
    slides.push({ imagem: '', titulo: '', subtitulo: '' });
    renderizarSlides();
  };

  window.removerSlide = function (i) {
    slides.splice(i, 1);
    renderizarSlides();
  };

  function aoDigitarSlide(i, campo, valor) {
    if (!slides[i]) return;
    slides[i][campo] = valor;
  }

  function renderizarSlides() {
    var cont = $id('slides-lista');
    cont.innerHTML = '';
    if (!slides.length) {
      cont.innerHTML = '<div style="text-align:center; color:var(--text-muted); font-size:12.5px; padding:14px; border:1.5px dashed var(--border); border-radius:12px; margin-bottom:10px;">Nenhum slide ainda — adicione o primeiro (ex: foto do hambúrguer da casa + "Novidade na chapa!").</div>';
      return;
    }
    slides.forEach(function (s, i) {
      var row = document.createElement('div');
      row.className = 'slide-row';
      row.innerHTML =
        '<div class="sr-top"><strong>Slide ' + (i + 1) + '</strong>' +
        '<button type="button" class="btn-del-slide" title="Remover slide"><i class="ph-bold ph-trash"></i></button></div>' +
        '<div class="field" style="margin-bottom:8px;"><label>Imagem (URL)</label>' +
        '<input type="url" data-campo="imagem" placeholder="https://.../foto.jpg (opcional)" value="' + escAttr(s.imagem || '') + '" /></div>' +
        '<div class="field" style="margin-bottom:8px;"><label>Título</label>' +
        '<input type="text" data-campo="titulo" placeholder="Ex: Nova chapa dupla!" value="' + escAttr(s.titulo || '') + '" /></div>' +
        '<div class="field" style="margin-bottom:0;"><label>Frase de convite</label>' +
        '<input type="text" data-campo="subtitulo" placeholder="Ex: Peça agora pelo totem e retire no balcão" value="' + escAttr(s.subtitulo || '') + '" /></div>';
      row.querySelector('.btn-del-slide').onclick = function () { removerSlide(i); };
      row.querySelectorAll('input[data-campo]').forEach(function (inp) {
        inp.addEventListener('input', function () { aoDigitarSlide(i, inp.dataset.campo, inp.value); });
      });
      cont.appendChild(row);
    });
  }

  function escAttr(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  /* ── Estado / hints ── */

  window.atualizarEstadoTexto = function () {
    var ligado = $id('cfg-enabled').checked;
    $id('estado-totem-txt').textContent = ligado
      ? 'Ativo — dispositivos em Modo Totem exibem o autoatendimento.'
      : 'Desligado — os dispositivos ficam livres para outra função.';
  };

  window.atualizarHintFundo = function () {
    var tipo = $id('cfg-fundo-tipo').value;
    var lbl = $id('lbl-fundo-valor');
    var hint = $id('hint-fundo');
    if (tipo === 'cor') {
      lbl.textContent = 'Cor do fundo';
      hint.textContent = 'Uma cor hex. Ex: #0f172a';
    } else if (tipo === 'imagem') {
      lbl.textContent = 'URL da imagem de fundo';
      hint.textContent = 'Link direto de uma imagem (.jpg/.png).';
    } else {
      lbl.textContent = 'Cores do gradiente';
      hint.textContent = 'Duas cores hex separadas por vírgula. Ex: #0f172a,#293548';
    }
  };

  $id('cfg-cor').addEventListener('input', function () {
    $id('cfg-cor-texto').value = this.value;
  });
  $id('cfg-cor-texto').addEventListener('change', function () {
    var hex = normalizarHex(this.value);
    if (hex) { this.value = hex; $id('cfg-cor').value = hex; }
  });

  /* ── Salvar ── */

  window.salvarTotemConfig = function () {
    var slidesLimpos = slides
      .map(function (s) {
        return { imagem: String(s.imagem || '').trim(), titulo: String(s.titulo || '').trim(), subtitulo: String(s.subtitulo || '').trim() };
      })
      .filter(function (s) { return s.imagem || s.titulo; });

    var payload = {
      totem_enabled: $id('cfg-enabled').checked ? 'true' : 'false',
      mod_totem: $id('cfg-enabled').checked ? 'true' : 'false',
      totem_mesa: ($id('cfg-mesa').value || 'Totem 1').trim(),
      totem_idle_timeout: String(parseInt($id('cfg-idle').value, 10) || 45),
      totem_home_layout: layoutAtual,
      totem_sec_destaques: $id('cfg-sec-destaques').checked ? 'true' : 'false',
      totem_sec_categorias: $id('cfg-sec-categorias').checked ? 'true' : 'false',
      totem_card_emoji: ($id('cfg-card-emoji').value || '').trim(),
      totem_card_titulo: ($id('cfg-card-titulo').value || '').trim(),
      totem_card_texto: ($id('cfg-card-texto').value || '').trim(),
      totem_card_imagem: ($id('cfg-card-imagem').value || '').trim(),
      totem_card_categoria: ($id('cfg-card-categoria').value || '').trim(),
      totem_screensaver_enabled: $id('cfg-ss-enabled').checked ? 'true' : 'false',
      totem_screensaver_segundos: String(Math.max(5, parseInt($id('cfg-ss-segundos').value, 10) || 20)),
      totem_slides_json: JSON.stringify(slidesLimpos),
      totem_home_titulo: ($id('cfg-titulo').value || 'Bem-vindo!').trim(),
      totem_home_subtitulo: ($id('cfg-subtitulo').value || '').trim(),
      totem_home_cor: normalizarHex($id('cfg-cor-texto').value) || '#fc4b15',
      totem_home_fundo_tipo: $id('cfg-fundo-tipo').value,
      totem_home_fundo_valor: ($id('cfg-fundo-valor').value || '#0f172a,#293548').trim(),
      totem_home_logo: ($id('cfg-logo').value || '').trim()
    };

    fetch('/api/config?restaurante_id=' + encodeURIComponent(restauranteId), {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload)
    })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res && res.success) {
          alert('Configurações do Totem salvas! Os totens conectados atualizam sozinhos.');
          recarregarPreview();
        } else {
          alert('Não foi possível salvar. Verifique se você está logado como administrador.');
        }
      })
      .catch(function () { alert('Erro de conexão ao salvar.'); });
  };

  window.recarregarPreview = function () {
    $id('preview-frame').src = '/totem.html?restaurante_id=' + encodeURIComponent(restauranteId) + '&t=' + Date.now();
  };

  window.abrirTotemNesteDispositivo = function () {
    window.location.href = '/totem.html?restaurante_id=' + encodeURIComponent(restauranteId);
  };

  carregar();
})();
