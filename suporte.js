var suporteToken = localStorage.getItem('chef_suporte_token');
var suporteUser = null;
var _produtosCache = [];
var _categoriasCache = [];
var _restauranteAtual = null;
var _restaurantesCache = [];

function esc(str) { if (!str) return ''; return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// (Segurança) Escapa valor para string JS dentro de atributo HTML (aspas como entidade).
function escJs(v) {
  if (v === null || v === undefined) v = '';
  return JSON.stringify(String(v)).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function showToast(msg, type) {
  type = type || 'success';
  var c = document.getElementById('toast-container');
  var t = document.createElement('div'); t.className = 'toast toast-' + type; t.textContent = msg;
  c.appendChild(t);
  setTimeout(function() { t.remove(); }, 4000);
}

function apiGet(url, cb) {
  var x = new XMLHttpRequest();
  x.open('GET', url, true);
  x.setRequestHeader('x-suporte-token', suporteToken);
  x.onreadystatechange = function() {
    if (x.readyState === 4) { try { cb(null, JSON.parse(x.responseText)); } catch(e) { cb(e, null); } }
  };
  x.onerror = function() { cb(new Error('Erro de rede'), null); };
  x.send(null);
}
function apiPost(url, data, cb) {
  var x = new XMLHttpRequest();
  x.open('POST', url, true);
  x.setRequestHeader('Content-Type', 'application/json');
  x.setRequestHeader('x-suporte-token', suporteToken);
  x.onreadystatechange = function() {
    if (x.readyState === 4) { try { cb(null, JSON.parse(x.responseText)); } catch(e) { cb(e, null); } }
  };
  x.onerror = function() { cb(new Error('Erro de rede'), null); };
  x.send(JSON.stringify(data));
}
function apiPut(url, data, cb) {
  var x = new XMLHttpRequest();
  x.open('PUT', url, true);
  x.setRequestHeader('Content-Type', 'application/json');
  x.setRequestHeader('x-suporte-token', suporteToken);
  x.onreadystatechange = function() {
    if (x.readyState === 4) { try { cb(null, JSON.parse(x.responseText)); } catch(e) { cb(e, null); } }
  };
  x.onerror = function() { cb(new Error('Erro de rede'), null); };
  x.send(JSON.stringify(data));
}
function apiDelete(url, cb) {
  var x = new XMLHttpRequest();
  x.open('DELETE', url, true);
  x.setRequestHeader('x-suporte-token', suporteToken);
  x.onreadystatechange = function() {
    if (x.readyState === 4) { try { cb(null, JSON.parse(x.responseText)); } catch(e) { cb(e, null); } }
  };
  x.onerror = function() { cb(new Error('Erro de rede'), null); };
  x.send(null);
}

/* ═══ LOGIN ═══ */
function loginSuporte() {
  var email = document.getElementById('login-email').value.trim();
  var senha = document.getElementById('login-senha').value;
  var errEl = document.getElementById('login-error');
  if (!email || !senha) { errEl.textContent = 'Preencha email e senha.'; errEl.style.display = 'block'; return; }
  errEl.style.display = 'none';
  var x = new XMLHttpRequest();
  x.open('POST', '/api/suporte/login', true);
  x.setRequestHeader('Content-Type', 'application/json');
  x.onreadystatechange = function() {
    if (x.readyState === 4) {
      try {
        var data = JSON.parse(x.responseText);
        if (data.ok) {
          suporteToken = data.token;
          suporteUser = data.usuario;
          localStorage.setItem('chef_suporte_token', suporteToken);
          entrarPainel();
        } else {
          errEl.textContent = data.erro || 'Erro ao fazer login.';
          errEl.style.display = 'block';
        }
      } catch(e) { errEl.textContent = 'Erro de conexão.'; errEl.style.display = 'block'; }
    }
  };
  x.send(JSON.stringify({ email: email, senha: senha }));
}

function logoutSuporte() {
  localStorage.removeItem('chef_suporte_token');
  document.getElementById('admin-panel').style.display = 'none';
  document.getElementById('login-container').style.display = 'flex';
}

/* ═══ NAVEGAÇÃO ═══ */
var _currentTab = 'sec-dashboard';

function switchTabSuporte(targetId) {
  _currentTab = targetId;
  var items = document.querySelectorAll('.sidebar .menu-item');
  var sections = document.querySelectorAll('.content-area .content-section');
  for (var i = 0; i < items.length; i++) {
    items[i].className = items[i].getAttribute('data-target') === targetId ? 'menu-item active' : 'menu-item';
  }
  for (var j = 0; j < sections.length; j++) {
    sections[j].className = sections[j].id === targetId ? 'content-section active' : 'content-section';
  }
  if (targetId === 'sec-dashboard') carregarDashboardSuporte();
  else if (targetId === 'sec-vendas') carregarPortalAfiliadoCompleto();
  else if (targetId === 'sec-restaurantes') carregarRestaurantesSuporte();
  else if (targetId === 'sec-cardapio') { if (_restauranteAtual) carregarProdutos(); }
  else if (targetId === 'sec-tarefas') carregarAtividades();
  else if (targetId === 'sec-ranking') carregarRanking();
  else if (targetId === 'sec-temas-curadoria') { if (typeof carregarCuradoriaTemas === 'function') carregarCuradoriaTemas(); }
  else if (targetId === 'sec-site-vendas-modulos') { if (typeof carregarModulosSiteVendas === 'function') carregarModulosSiteVendas(); }
  else if (targetId === 'sec-estudio-modulos') { if (typeof carregarModulosSuporte === 'function') carregarModulosSuporte(); }
  else if (targetId === 'sec-dev-api-hub') { if (typeof carregarDevHub === 'function') carregarDevHub(); }
}

function entrarPainel() {
  document.getElementById('login-container').style.display = 'none';
  document.getElementById('admin-panel').style.display = 'block';
  atualizarHeader();
  initSuporteRealtimeSockets();
  carregarNotificacoesSuporte();
  switchTabSuporte('sec-dashboard');
}

function atualizarHeader() {
  if (!suporteUser) return;
  document.getElementById('user-name-display').textContent = suporteUser.nome;
  document.getElementById('user-xp').textContent = (suporteUser.xp || 0) + ' XP';
  document.getElementById('user-level').textContent = 'Nível ' + (suporteUser.nivel || 1);
}

/* ═══ DASHBOARD ═══ */
function carregarDashboardSuporte() {
  // Stats cards
  var statsHtml = '';
  statsHtml += '<div class="stat-card"><div class="stat-icon" style="color:var(--accent);"><i class="fa-solid fa-store"></i></div><div class="stat-value" id="dash-rest-count">0</div><div class="stat-label">Restaurantes</div></div>';
  statsHtml += '<div class="stat-card"><div class="stat-icon" style="color:var(--info);"><i class="fa-solid fa-utensils"></i></div><div class="stat-value" id="dash-prod-count">0</div><div class="stat-label">Produtos</div></div>';
  statsHtml += '<div class="stat-card"><div class="stat-icon" style="color:var(--warning);"><i class="fa-solid fa-star"></i></div><div class="stat-value" id="dash-level">' + (suporteUser.nivel || 1) + '</div><div class="stat-label">Nível</div></div>';
  statsHtml += '<div class="stat-card"><div class="stat-icon" style="color:var(--success);"><i class="fa-solid fa-bolt"></i></div><div class="stat-value" id="dash-xp">' + (suporteUser.xp || 0) + '</div><div class="stat-label">XP Total</div></div>';
  document.getElementById('dash-stats').innerHTML = statsHtml;

  // Progress bar
  var xp = suporteUser.xp || 0;
  var nivel = suporteUser.nivel || 1;
  var xpInLevel = xp % 100;
  var progress = (xpInLevel / 100) * 100;
  document.getElementById('xp-label').textContent = 'XP: ' + xp;
  document.getElementById('xp-next').textContent = 'Nível ' + nivel + ' — ' + xpInLevel + '/100 XP';
  document.getElementById('xp-bar-fill').style.width = progress + '%';

  // Carregar dados
  apiGet('/api/suporte/restaurantes', function(err, data) {
    if (err || !data || !data.ok) return;
    var rests = data.restaurantes || [];
    _restaurantesCache = rests;
    document.getElementById('dash-rest-count').textContent = rests.length;

    // Contar produtos totais
    var totalProd = 0;
    var loaded = 0;
    if (rests.length === 0) {
      document.getElementById('dash-prod-count').textContent = '0';
      carregarTarefasRecentes();
      return;
    }
    rests.forEach(function(r) {
      apiGet('/api/suporte/restaurantes/' + r.id + '/produtos', function(err2, data2) {
        loaded++;
        if (!err2 && data2 && data2.ok) totalProd += (data2.produtos || []).length;
        if (loaded >= rests.length) {
          document.getElementById('dash-prod-count').textContent = totalProd;
        }
      });
    });
    carregarTarefasRecentes();
  });

  // Conquistas
  apiGet('/api/suporte/minhas-conquistas', function(err, data) {
    if (!err && data && data.ok && data.conquistas) {
      var c = document.getElementById('ultimas-conquistas');
      if (data.conquistas.length === 0) { c.innerHTML = '<span style="color:var(--text-muted);font-size:0.85rem;">Nenhuma conquista ainda. Complete tarefas para ganhar XP!</span>'; return; }
      var h = '';
      for (var i = 0; i < Math.min(data.conquistas.length, 5); i++) {
        var a = data.conquistas[i];
        h += '<span class="achievement" style="padding:0.5rem;min-width:auto;"><span class="ach-icon" style="font-size:1.2rem;"><i class="fa-solid ' + (a.icone || 'fa-star') + '" style="color:var(--warning);"></i></span><span class="ach-name" style="font-size:0.7rem;">' + esc(a.descricao) + '</span></span>';
      }
      c.innerHTML = h;
    }
  });
}

function carregarTarefasRecentes() {
  apiGet('/api/suporte/minhas-tarefas', function(err, data) {
    var tbody = document.getElementById('recent-tasks-body');
    if (err || !data || !data.ok || !data.tarefas || data.tarefas.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);">Nenhuma atividade ainda.</td></tr>';
      return;
    }
    var h = '';
    var tarefas = data.tarefas.slice(0, 10);
    var tipoLabels = { criar_produto: 'Criou Item', editar_produto: 'Editou Item', duplicar_produto: 'Duplicou Item' };
    for (var i = 0; i < tarefas.length; i++) {
      var t = tarefas[i];
      h += '<tr><td>' + esc(tipoLabels[t.tipo] || t.tipo) + '</td><td>' + esc(t.restaurante_nome || '—') + '</td><td style="color:var(--success);font-weight:600;">+' + t.pontos + ' XP</td><td><small>' + (t.concluida_em ? new Date(t.concluida_em).toLocaleString('pt-BR') : (t.criada_em ? new Date(t.criada_em).toLocaleString('pt-BR') : '—')) + '</small></td></tr>';
    }
    tbody.innerHTML = h;
  });
}

/* ═══ RESTAURANTES ═══ */
function carregarRestaurantesSuporte() {
  apiGet('/api/suporte/restaurantes', function(err, data) {
    if (err || !data || !data.ok) { document.getElementById('rest-grid').innerHTML = '<div class="empty-state"><i class="fa-solid fa-store"></i><p>Erro ao carregar restaurantes.</p></div>'; return; }
    _restaurantesCache = data.restaurantes || [];
    renderRestaurantesSuporte();
  });
}

function renderRestaurantesSuporte() {
  var grid = document.getElementById('rest-grid');
  var search = (document.getElementById('rest-search').value || '').toLowerCase();
  var filtered = _restaurantesCache.filter(function(r) { return r.nome.toLowerCase().indexOf(search) !== -1; });
  if (filtered.length === 0) {
    grid.innerHTML = '<div class="empty-state"><i class="fa-solid fa-store"></i><p>Nenhum restaurante encontrado.</p></div>';
    return;
  }
  var h = '';
  for (var i = 0; i < filtered.length; i++) {
    var r = filtered[i];
    var statusColor = r.ativo ? '#22c55e' : '#ef4444';
    var statusText = r.ativo ? 'Ativo' : 'Inativo';
      h += '<div class="rest-card" onclick="abrirCardapio(' + r.id + ',' + escJs(r.nome) + ')">' +
      '<div class="rest-name">' + esc(r.nome) + '</div>' +
      '<div class="rest-info">#' + r.id + ' · ' + esc(r.licenca || '—') + ' · <span style="color:' + statusColor + ';">' + statusText + '</span></div>' +
      '<div class="rest-info" style="margin-top:0.3rem;color:var(--accent);font-size:0.75rem;"><i class="fa-solid fa-arrow-right"></i> Gerenciar cardápio</div>' +
      '</div>';
  }
  grid.innerHTML = h;
}

function abrirCardapio(restId, restNome) {
  _restauranteAtual = { id: restId, nome: restNome };
  document.getElementById('cardapio-rest-name').textContent = 'Gerenciando: ' + esc(restNome) + ' (#' + restId + ')';
  document.getElementById('menu-cardapio').style.display = 'flex';
  switchTabSuporte('sec-cardapio');
  carregarProdutos();
}

function voltarRestaurantes() {
  _restauranteAtual = null;
  document.getElementById('menu-cardapio').style.display = 'none';
  switchTabSuporte('sec-restaurantes');
}

/* ═══ CARDÁPIO (PRODUTOS) ═══ */
function carregarProdutos() {
  if (!_restauranteAtual) return;
  document.getElementById('produtos-list').innerHTML = '<div class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i><p>Carregando cardápio...</p></div>';
  apiGet('/api/suporte/restaurantes/' + _restauranteAtual.id + '/produtos', function(err, data) {
    if (err || !data || !data.ok) {
      document.getElementById('produtos-list').innerHTML = '<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><p>Erro ao carregar cardápio.</p></div>';
      return;
    }
    _produtosCache = data.produtos || [];
    _categoriasCache = data.categorias || [];
    // Atualizar datalist de categorias
    var dl = document.getElementById('categoria-suggest');
    dl.innerHTML = '';
    _categoriasCache.forEach(function(c) {
      var opt = document.createElement('option'); opt.value = c.nome || c; dl.appendChild(opt);
    });
    renderProdutos();
  });
}

function renderProdutos() {
  var container = document.getElementById('produtos-list');
  var search = (document.getElementById('prod-search').value || '').trim();
  var catFiltro = (document.getElementById('prod-categoria-filtro').value || '').trim();
  var filtered = _produtosCache;
  if (search) {
    if (window.FuzzySearch) {
      filtered = window.FuzzySearch.filter(filtered, search, function(p) { return [p.nome || '']; });
    } else {
      filtered = filtered.filter(function(p) { return (p.nome || '').toLowerCase().includes(search.toLowerCase()); });
    }
  }
  if (catFiltro) {
    if (window.FuzzySearch) {
      filtered = window.FuzzySearch.filter(filtered, catFiltro, function(p) { return [p.categoria || '']; });
    } else {
      filtered = filtered.filter(function(p) { return (p.categoria || '').toLowerCase().includes(catFiltro.toLowerCase()); });
    }
  }
  if (filtered.length === 0) {
    container.innerHTML = '<div class="empty-state"><i class="fa-solid fa-utensils"></i><p>Nenhum item no cardápio.</p><button class="btn btn-primary btn-sm" style="margin-top:0.5rem;" onclick="abrirModalProduto(null)"><i class="fa-solid fa-plus"></i> Adicionar Primeiro Item</button></div>';
    return;
  }
  var h = '<div style="padding:0.5rem 0.8rem;font-size:0.8rem;color:var(--text-muted);border-bottom:1px solid var(--border-color);">' + filtered.length + ' item(ns) encontrado(s)</div>';
  for (var i = 0; i < filtered.length; i++) {
    var p = filtered[i];
    var disp = p.disponivel !== 0 && p.disponivel !== false;
    h += '<div class="produto-row">' +
      '<div class="produto-info"><div class="prod-nome">' + esc(p.nome) + '</div>' +
      '<div class="prod-meta">' + esc(p.categoria || 'Sem categoria') + (p.descricao ? ' · ' + esc(p.descricao.substring(0, 60)) : '') + '</div></div>' +
      '<div class="produto-preco">R$ ' + (parseFloat(p.preco) || 0).toFixed(2).replace('.', ',') + '</div>' +
      '<div style="display:flex;gap:0.3rem;">' +
      '<button class="btn btn-sm ' + (disp ? 'btn-success' : 'btn-warning') + '" onclick="toggleDisponivel(' + p.id + ',' + (disp ? 'false' : 'true') + ')" title="' + (disp ? 'Desativar' : 'Ativar') + '"><i class="fa-solid ' + (disp ? 'fa-eye' : 'fa-eye-slash') + '"></i></button>' +
      '<button class="btn btn-sm" onclick="abrirModalProduto(' + p.id + ')" title="Editar"><i class="fa-solid fa-pen"></i></button>' +
      '<button class="btn btn-sm" onclick="duplicarProduto(' + p.id + ')" title="Duplicar"><i class="fa-solid fa-copy"></i></button>' +
      '<button class="btn btn-sm btn-danger" onclick="excluirProduto(' + p.id + ')" title="Excluir"><i class="fa-solid fa-trash"></i></button>' +
      '</div></div>';
  }
  container.innerHTML = h;
}

function abrirModalProduto(prodId) {
  document.getElementById('modal-produto-title').textContent = prodId ? 'Editar Item' : 'Novo Item';
  document.getElementById('prod-edit-id').value = prodId || '';
  if (prodId) {
    var p = null;
    for (var i = 0; i < _produtosCache.length; i++) { if (_produtosCache[i].id === prodId) { p = _produtosCache[i]; break; } }
    if (p) {
      document.getElementById('prod-nome').value = p.nome || '';
      document.getElementById('prod-categoria').value = p.categoria || '';
      document.getElementById('prod-preco').value = p.preco || 0;
      document.getElementById('prod-descricao').value = p.descricao || '';
      document.getElementById('prod-ingredientes').value = p.ingredientes || '';
      document.getElementById('prod-disponivel').checked = p.disponivel !== 0 && p.disponivel !== false;
    }
  } else {
    document.getElementById('prod-nome').value = '';
    document.getElementById('prod-categoria').value = '';
    document.getElementById('prod-preco').value = 0;
    document.getElementById('prod-descricao').value = '';
    document.getElementById('prod-ingredientes').value = '';
    document.getElementById('prod-disponivel').checked = true;
  }
  document.getElementById('modal-produto').classList.add('active');
}

function salvarProduto() {
  var id = document.getElementById('prod-edit-id').value;
  var nome = document.getElementById('prod-nome').value.trim();
  if (!nome) { showToast('Nome do item é obrigatório!', 'warning'); return; }
  var payload = {
    nome: nome,
    categoria: document.getElementById('prod-categoria').value.trim(),
    preco: parseFloat(document.getElementById('prod-preco').value) || 0,
    descricao: document.getElementById('prod-descricao').value.trim(),
    ingredientes: document.getElementById('prod-ingredientes').value.trim(),
    disponivel: document.getElementById('prod-disponivel').checked
  };
  var url = '/api/suporte/restaurantes/' + _restauranteAtual.id + '/produtos';
  if (id) {
    apiPut(url + '/' + id, payload, function(err, data) {
      if (err || !data || !data.ok) { showToast('Erro: ' + (data ? data.erro : err), 'danger'); return; }
      showToast('Item atualizado! +3 XP', 'success');
      document.getElementById('modal-produto').classList.remove('active');
      carregarProdutos();
      atualizarDadosUsuario();
    });
  } else {
    apiPost(url, payload, function(err, data) {
      if (err || !data || !data.ok) { showToast('Erro: ' + (data ? data.erro : err), 'danger'); return; }
      showToast('Item criado! +5 XP', 'success');
      document.getElementById('modal-produto').classList.remove('active');
      carregarProdutos();
      atualizarDadosUsuario();
    });
  }
}

function excluirProduto(prodId) {
  if (!confirm('Excluir este item do cardápio?')) return;
  apiDelete('/api/suporte/restaurantes/' + _restauranteAtual.id + '/produtos/' + prodId, function(err, data) {
    if (err || !data || !data.ok) { showToast('Erro ao excluir', 'danger'); return; }
    showToast('Item excluído.', 'success');
    carregarProdutos();
  });
}

function toggleDisponivel(prodId, novoStatus) {
  apiPut('/api/suporte/restaurantes/' + _restauranteAtual.id + '/produtos/' + prodId, { disponivel: novoStatus }, function(err, data) {
    if (err || !data || !data.ok) { showToast('Erro ao atualizar', 'danger'); return; }
    showToast('Item ' + (novoStatus ? 'ativado' : 'desativado') + '!', 'success');
    carregarProdutos();
  });
}

function duplicarProduto(prodId) {
  apiPost('/api/suporte/restaurantes/' + _restauranteAtual.id + '/produtos/' + prodId + '/duplicar', {}, function(err, data) {
    if (err || !data || !data.ok) { showToast('Erro ao duplicar', 'danger'); return; }
    showToast('Item duplicado! +2 XP', 'success');
    carregarProdutos();
    atualizarDadosUsuario();
  });
}

/* ═══ ATIVIDADES ═══ */
function carregarAtividades() {
  apiGet('/api/suporte/minhas-conquistas', function(err, data) {
    var grid = document.getElementById('conquistas-grid');
    if (err || !data || !data.ok || !data.conquistas || data.conquistas.length === 0) {
      grid.innerHTML = '<div class="empty-state" style="padding:1rem;"><i class="fa-solid fa-trophy" style="font-size:2rem;"></i><p>Nenhuma conquista ainda. Complete tarefas para ganhar XP e desbloquear conquistas!</p></div>';
      return;
    }
    var h = '';
    for (var i = 0; i < data.conquistas.length; i++) {
      var a = data.conquistas[i];
      h += '<div class="achievement"><div class="ach-icon"><i class="fa-solid ' + (a.icone || 'fa-star') + '" style="color:var(--warning);"></i></div><div class="ach-name">' + esc(a.descricao) + '</div><div class="ach-desc">' + new Date(a.data_obtida).toLocaleDateString('pt-BR') + '</div></div>';
    }
    grid.innerHTML = h;
  });

  apiGet('/api/suporte/minhas-tarefas', function(err, data) {
    var tbody = document.getElementById('all-tasks-body');
    if (err || !data || !data.ok || !data.tarefas || data.tarefas.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);">Nenhuma atividade registrada.</td></tr>';
      return;
    }
    var tipoLabels = { criar_produto: 'Criou Item', editar_produto: 'Editou Item', duplicar_produto: 'Duplicou Item' };
    var h = '';
    for (var i = 0; i < data.tarefas.length; i++) {
      var t = data.tarefas[i];
      h += '<tr><td>' + esc(tipoLabels[t.tipo] || t.tipo) + '</td><td>' + esc(t.descricao || '—') + '</td>' +
        '<td>' + esc(t.restaurante_nome || '—') + '</td>' +
        '<td style="color:var(--success);font-weight:600;">+' + t.pontos + ' XP</td>' +
        '<td><small>' + (t.concluida_em ? new Date(t.concluida_em).toLocaleString('pt-BR') : '—') + '</small></td></tr>';
    }
    tbody.innerHTML = h;
  });
}

/* ═══ RANKING ═══ */
function carregarRanking() {
  apiGet('/api/suporte/ranking', function(err, data) {
    var tbody = document.getElementById('ranking-body');
    if (err || !data || !data.ok) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#ef4444;">Erro ao carregar ranking.</td></tr>';
      return;
    }
    document.getElementById('minha-posicao').innerHTML = '<i class="fa-solid fa-medal" style="color:var(--warning);"></i> Sua posição: <strong>#' + data.minhaPosicao + '</strong>';
    var ranking = data.ranking || [];
    if (ranking.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);">Nenhum membro na equipe.</td></tr>';
      return;
    }
    var statusLabels = { disponivel: 'Disponível', ocupado: 'Ocupado', offline: 'Offline' };
    var h = '';
    for (var i = 0; i < ranking.length; i++) {
      var r = ranking[i];
      var posClass = i === 0 ? 'rank-1' : (i === 1 ? 'rank-2' : (i === 2 ? 'rank-3' : 'rank-rest'));
      var isMe = r.id === suporteUser.id;
      var statusColor = r.status === 'disponivel' ? '#22c55e' : (r.status === 'ocupado' ? '#f59e0b' : '#ef4444');
      h += '<tr' + (isMe ? ' class="rank-highlight"' : '') + '>' +
        '<td style="text-align:center;"><span class="rank-pos ' + posClass + '">' + (i + 1) + '</span></td>' +
        '<td>' + esc(r.nome) + (isMe ? ' <span style="color:var(--accent);font-size:0.75rem;">(você)</span>' : '') + '</td>' +
        '<td>' + esc(r.cargo || '—') + '</td>' +
        '<td style="text-align:center;"><span class="level-badge">Nível ' + (r.nivel || 1) + '</span></td>' +
        '<td style="text-align:center;font-weight:600;">' + (r.xp || 0) + ' XP</td>' +
        '<td style="text-align:center;"><span style="color:' + statusColor + ';"><span class="status-dot" style="background:' + statusColor + ';"></span>' + (statusLabels[r.status] || r.status) + '</span></td>' +
        '</tr>';
    }
    tbody.innerHTML = h;
  });
}

/* ═══ UTILITÁRIOS ═══ */
function atualizarDadosUsuario() {
  apiGet('/api/suporte/me', function(err, data) {
    if (!err && data && data.ok) {
      suporteUser = data.usuario;
      atualizarHeader();
    }
  });
}
/* ═══════════════════════════════════════════════════════════════════════ */
/* ═══ PORTAL DO AFILIADO: PLANO DE CARREIRA, PITCHS, LINKS & METAS ═════ */
/* ═══════════════════════════════════════════════════════════════════════ */

var portalAfiliadoData = null;
var _qrCodeUrlAtual = '';

function carregarPortalAfiliadoCompleto() {
  apiGet('/api/afiliado/carreira-dashboard', function(err, data) {
    if (err || !data || !data.ok) {
      // Fallback para carregamento financeiro legado
      carregarFinanceiroSuporte();
      return;
    }

    portalAfiliadoData = data;
    renderCarreiraDashboard(data);
    renderPaginasVendas(data.paginas_vendas || [], data.afiliado ? data.afiliado.codigo_ref : 'CHEF');
    renderPitchsEScripts(data.pitchs_e_scripts || []);
    renderMetasEBonificacoes(data.metas || [], data.bonificacoes || {});
    calcularEconomiaCliente();
    carregarMinhasVendas();
  });
}

function trocarTabPortalAfiliado(tab) {
  var views = document.querySelectorAll('.afil-view-content');
  views.forEach(function(v) { v.style.display = 'none'; });

  var target = document.getElementById('afil-view-' + tab);
  if (target) target.style.display = 'block';

  var tabs = ['carreira', 'links', 'pitchs', 'calculadora', 'metas', 'vendas'];
  tabs.forEach(function(t) {
    var btn = document.getElementById('tab-btn-' + t);
    if (!btn) return;
    if (t === tab) {
      btn.style.background = 'rgba(252,75,21,0.2)';
      btn.style.color = '#fc4b15';
      btn.style.borderColor = 'rgba(252,75,21,0.4)';
      btn.style.fontWeight = '700';
    } else {
      btn.style.background = 'rgba(255,255,255,0.04)';
      btn.style.color = 'var(--text-muted)';
      btn.style.borderColor = 'rgba(255,255,255,0.08)';
      btn.style.fontWeight = '600';
    }
  });

  if (tab === 'calculadora') calcularEconomiaCliente();
}

function renderCarreiraDashboard(data) {
  var c = data.carreira || {};
  var m = data.metricas || {};
  var a = data.afiliado || {};

  // Atualiza código ref exibido
  var refEl = document.getElementById('meu-codigo-ref');
  if (refEl) refEl.textContent = a.codigo_ref || 'CHEF-PARCEIRO';

  // Hero Card
  var hero = document.getElementById('carreira-hero-card');
  if (hero) {
    hero.style.border = '1.5px solid ' + (c.badgeBorder || '#ffd700');
    if (c.badgeBg) hero.style.background = c.badgeBg;
  }

  var badgeNivel = document.getElementById('carreira-nivel-badge');
  if (badgeNivel) {
    badgeNivel.textContent = '👑 ' + (c.titulo || 'Plano de Carreira').toUpperCase();
    badgeNivel.style.background = c.cor || '#ffd700';
  }

  var vivendoBadge = document.getElementById('carreira-vivendo-badge');
  if (vivendoBadge) {
    if (c.vivendoDisso) {
      vivendoBadge.textContent = c.seloVivendoDisso || '🔥 VIVENDO DE CHEF COZINHA';
      vivendoBadge.style.display = 'inline-block';
    } else {
      vivendoBadge.style.display = 'none';
    }
  }

  setTextById('carreira-titulo', c.titulo || 'Afiliado Chef Cozinha');
  setTextById('carreira-status-desc', c.statusTexto || c.descricao || '');
  setTextById('carreira-comissao-pct', (c.comissaoPct || 20) + '%');

  // Progresso para o próximo nível
  var progLabel = document.getElementById('carreira-progresso-label');
  var progFaltam = document.getElementById('carreira-progresso-faltam');
  var progBar = document.getElementById('carreira-progress-bar');

  if (c.proximoNivel) {
    if (progLabel) progLabel.textContent = 'Rumo ao ' + c.proximoNivel;
    if (progFaltam) progFaltam.textContent = 'Faltam ' + c.faltamClientes + ' cliente(s) ativo(s) (' + (c.progressoPct || 0) + '%)';
    if (progBar) progBar.style.width = (c.progressoPct || 0) + '%';
  } else {
    if (progLabel) progLabel.textContent = '🏆 Nível Máximo Atingido — Parabéns!';
    if (progFaltam) progFaltam.textContent = 'Você conquistou a graduação mais alta do ecossistema';
    if (progBar) progBar.style.width = '100%';
  }

  // Cards numéricos
  setTextById('c-clientes-ativos', m.clientes_ativos || 0);
  setTextById('c-mrr-projetado', 'R$ ' + formatMoney(m.mrr_projetado || 0));
  setTextById('c-total-comissoes', 'R$ ' + formatMoney(m.total_comissoes || 0));
  setTextById('c-total-faturado-rotulo', 'Em R$ ' + formatMoney(m.total_faturado || 0) + ' de faturamento');
  setTextById('c-bonus-proximo', 'R$ ' + formatMoney(c.bonusGraduacao || 500));
}

function renderPaginasVendas(paginas, codigoRef) {
  var grid = document.getElementById('grid-paginas-vendas');
  if (!grid) return;

  if (!paginas || paginas.length === 0) {
    grid.innerHTML = '<div style="text-align:center; padding:30px; color:var(--text-muted); grid-column:1/-1;">Nenhuma página configurada.</div>';
    return;
  }

  var iconesNichos = {
    geral: 'fa-globe',
    pizzaria: 'fa-pizza-slice',
    hamburgueria: 'fa-burger',
    buffet: 'fa-utensils',
    bar: 'fa-beer-mug-empty',
    cadastro: 'fa-rocket'
  };

  var coresNichos = {
    geral: '#3b82f6',
    pizzaria: '#ef4444',
    hamburgueria: '#f59e0b',
    buffet: '#10b981',
    bar: '#a855f7',
    cadastro: '#fc4b15'
  };

  var html = '';
  for (var i = 0; i < paginas.length; i++) {
    var p = paginas[i];
    var icone = iconesNichos[p.nicho] || 'fa-store';
    var cor = coresNichos[p.nicho] || '#fc4b15';
    var whatsUrl = 'https://api.whatsapp.com/send?text=' + encodeURIComponent(p.whatsappMsg || p.url);

    html += '<div class="card" style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.08); border-radius:14px; padding:18px; display:flex; flex-direction:column; justify-content:space-between;">' +
      '<div>' +
        '<div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px;">' +
          '<div style="width:40px; height:40px; border-radius:10px; background:' + cor + '22; color:' + cor + '; display:flex; align-items:center; justify-content:center; font-size:20px;">' +
            '<i class="fa-solid ' + icone + '"></i>' +
          '</div>' +
          '<span style="font-size:10px; font-weight:800; text-transform:uppercase; background:rgba(255,255,255,0.05); color:var(--text-muted); padding:3px 8px; border-radius:6px;">' + esc(p.nicho) + '</span>' +
        '</div>' +
        '<h4 style="font-family:Outfit,sans-serif; color:#fff; font-size:1.1rem; margin:0 0 4px 0;">' + esc(p.titulo) + '</h4>' +
        '<p style="font-size:0.82rem; color:var(--text-muted); margin:0 0 12px 0; line-height:1.4;">' + esc(p.descricao) + '</p>' +
        '<div style="background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.06); border-radius:8px; padding:8px 10px; display:flex; align-items:center; gap:8px; margin-bottom:14px;">' +
          '<input type="text" readonly value="' + esc(p.url) + '" id="url-nicho-' + i + '" style="background:none; border:none; color:#94a3b8; font-size:0.75rem; width:100%; outline:none; font-family:monospace;">' +
          '<button onclick="copiarTexto(document.getElementById(\'url-nicho-' + i + '\').value, \'Link copiado!\')" class="btn btn-sm" style="padding:4px 8px; font-size:11px; white-space:nowrap;"><i class="fa-solid fa-copy"></i></button>' +
        '</div>' +
      '</div>' +
      '<div style="display:flex; gap:8px; border-top:1px solid rgba(255,255,255,0.06); padding-top:12px;">' +
        '<a href="' + whatsUrl + '" target="_blank" class="btn btn-sm" style="flex:1; background:#25d366; color:#fff; font-weight:700; text-align:center; display:flex; align-items:center; justify-content:center; gap:6px; text-decoration:none;">' +
          '<i class="fa-brands fa-whatsapp"></i> Compartilhar' +
        '</a>' +
        '<button onclick="abrirModalQrCodeAfiliado(\'' + escJs(p.titulo) + '\', \'' + escJs(p.url) + '\')" class="btn btn-sm" style="background:rgba(255,255,255,0.08); color:#fff;" title="Gerar QR Code">' +
          '<i class="fa-solid fa-qrcode"></i> QR Code' +
        '</button>' +
      '</div>' +
    '</div>';
  }

  grid.innerHTML = html;
}

function renderPitchsEScripts(pitchs) {
  var grid = document.getElementById('grid-pitchs-scripts');
  if (!grid) return;

  if (!pitchs || pitchs.length === 0) {
    grid.innerHTML = '<div style="text-align:center; padding:30px; color:var(--text-muted); grid-column:1/-1;">Nenhum script configurado.</div>';
    return;
  }

  var html = '';
  for (var i = 0; i < pitchs.length; i++) {
    var sc = pitchs[i];
    var whatsUrl = 'https://api.whatsapp.com/send?text=' + encodeURIComponent(sc.texto);

    html += '<div class="card" style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.08); border-radius:14px; padding:18px; display:flex; flex-direction:column; justify-content:space-between;">' +
      '<div>' +
        '<div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px;">' +
          '<span style="background:rgba(59,130,246,0.15); color:#93c5fd; font-size:10px; font-weight:800; padding:3px 8px; border-radius:6px; text-transform:uppercase;">' + esc(sc.categoria) + '</span>' +
          '<i class="fa-solid ' + (sc.icone || 'fa-comment-dots') + '" style="color:#60a5fa; font-size:16px;"></i>' +
        '</div>' +
        '<h4 style="font-family:Outfit,sans-serif; color:#fff; font-size:1.1rem; margin:0 0 6px 0;">' + esc(sc.titulo) + '</h4>' +
        '<p style="font-size:0.8rem; color:var(--text-muted); margin:0 0 12px 0;">' + esc(sc.descricao) + '</p>' +
        '<div style="background:rgba(0,0,0,0.4); border:1px solid rgba(255,255,255,0.06); border-radius:10px; padding:12px; font-size:0.82rem; color:#cbd5e1; line-height:1.5; white-space:pre-wrap; max-height:220px; overflow-y:auto; font-family:inherit; margin-bottom:14px;" id="script-texto-' + i + '">' +
          esc(sc.texto) +
        '</div>' +
      '</div>' +
      '<div style="display:flex; gap:8px; border-top:1px solid rgba(255,255,255,0.06); padding-top:12px;">' +
        '<button onclick="copiarTexto(document.getElementById(\'script-texto-' + i + '\').innerText, \'Script copiado com sucesso!\')" class="btn btn-sm btn-primary" style="flex:1; font-weight:700;">' +
          '<i class="fa-solid fa-copy"></i> Copiar Script' +
        '</button>' +
        '<a href="' + whatsUrl + '" target="_blank" class="btn btn-sm" style="background:#25d366; color:#fff; display:flex; align-items:center; justify-content:center; padding:0 14px; text-decoration:none;" title="Abrir no WhatsApp">' +
          '<i class="fa-brands fa-whatsapp"></i>' +
        '</a>' +
      '</div>' +
    '</div>';
  }

  grid.innerHTML = html;
}

function calcularEconomiaCliente() {
  var fatEl = document.getElementById('calc-faturamento');
  var taxaEl = document.getElementById('calc-taxa');

  var faturamento = fatEl ? (parseFloat(fatEl.value) || 30000) : 30000;
  var taxa = taxaEl ? (parseFloat(taxaEl.value) || 27) : 27;

  var taxaPaga = faturamento * (taxa / 100);
  var mensalidadeChef = 199;
  var economiaMes = Math.max(0, taxaPaga - mensalidadeChef);
  var economiaAno = economiaMes * 12;

  setTextById('res-taxa-paga', 'R$ ' + formatMoney(taxaPaga));
  setTextById('res-economia-mes', 'R$ ' + formatMoney(economiaMes));
  setTextById('res-economia-ano', 'R$ ' + formatMoney(economiaAno));
}

function gerarMensagemCalculoWhatsApp() {
  var faturamento = parseFloat(document.getElementById('calc-faturamento').value) || 30000;
  var taxa = parseFloat(document.getElementById('calc-taxa').value) || 27;
  var taxaPaga = faturamento * (taxa / 100);
  var economiaMes = Math.max(0, taxaPaga - 199);
  var economiaAno = economiaMes * 12;

  var refCode = (portalAfiliadoData && portalAfiliadoData.afiliado) ? portalAfiliadoData.afiliado.codigo_ref : 'CHEF';
  var siteUrl = window.location.origin + '/?ref=' + refCode;

  return "Fala chef! Fiz uma simulação rápida de faturamento para o seu restaurante:\n\n" +
    "📊 Faturamento no Delivery: R$ " + formatMoney(faturamento) + "/mês\n" +
    "💸 Taxas pagas para marketplaces (" + taxa + "%): R$ " + formatMoney(taxaPaga) + "/mês\n\n" +
    "🚀 Com o Chef Cozinha (cardápio digital próprio sem taxa por pedido), sua economia será de:\n" +
    "💰 R$ " + formatMoney(economiaMes) + " A MAIS NO SEU BOLSO TODO MÊS\n" +
    "🏆 R$ " + formatMoney(economiaAno) + " de economia ao longo de 1 ano!\n\n" +
    "Ative 14 dias de teste grátis sem nenhum compromisso aqui: " + siteUrl;
}

function copiarCalculoParaWhatsApp() {
  var texto = gerarMensagemCalculoWhatsApp();
  copiarTexto(texto, 'Cálculo copiado! Pronto para enviar no WhatsApp do restaurante.');
}

function abrirWhatsAppComCalculo() {
  var texto = gerarMensagemCalculoWhatsApp();
  window.open('https://api.whatsapp.com/send?text=' + encodeURIComponent(texto), '_blank');
}

function renderMetasEBonificacoes(metas, bonificacoes) {
  var grid = document.getElementById('grid-metas-afiliado');
  if (grid) {
    if (!metas || metas.length === 0) {
      grid.innerHTML = '<div style="text-align:center; padding:30px; color:var(--text-muted); grid-column:1/-1; background:rgba(255,255,255,0.02); border-radius:12px;">Nenhuma campanha de meta ativa no momento.</div>';
    } else {
      var html = '';
      for (var i = 0; i < metas.length; i++) {
        var m = metas[i];
        var perc = m.percentual_progresso || 0;
        var bateu = m.concluida;

        html += '<div class="card" style="background:rgba(255,255,255,0.02); border:1px solid ' + (bateu ? 'rgba(16,185,129,0.4)' : 'rgba(168,85,247,0.3)') + '; border-radius:14px; padding:18px; display:flex; flex-direction:column; justify-content:space-between;">' +
          '<div>' +
            '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">' +
              '<span style="background:' + (bateu ? '#10b98122' : '#a855f722') + '; color:' + (bateu ? '#10b981' : '#c084fc') + '; font-size:11px; font-weight:800; padding:3px 8px; border-radius:6px;">' +
                (bateu ? '🎉 META CONCLUÍDA!' : 'EM ANDAMENTO') +
              '</span>' +
              '<strong style="color:var(--success); font-size:18px;">R$ ' + formatMoney(m.recompensa_valor) + ' PIX</strong>' +
            '</div>' +
            '<h4 style="font-family:Outfit,sans-serif; color:#fff; font-size:1.15rem; margin:0 0 4px 0;">' + esc(m.titulo) + '</h4>' +
            '<p style="font-size:0.85rem; color:var(--text-muted); margin:0 0 12px 0;">' + esc(m.descricao || 'Bata a meta de novos restaurantes e receba o bônus.') + '</p>' +
            '<div style="margin-bottom:12px;">' +
              '<div style="display:flex; justify-content:space-between; font-size:0.78rem; color:#cbd5e1; margin-bottom:4px;">' +
                '<span>Progresso: ' + m.progresso_atual + ' / ' + m.meta_qtd + ' clientes</span>' +
                '<span><strong>' + perc + '%</strong></span>' +
              '</div>' +
              '<div style="background:rgba(255,255,255,0.1); height:8px; border-radius:8px; overflow:hidden;">' +
                '<div style="background:' + (bateu ? '#10b981' : 'linear-gradient(90deg, #7c3aed, #ec4899)') + '; height:100%; width:' + perc + '%;"></div>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div style="border-top:1px solid rgba(255,255,255,0.06); padding-top:12px; display:flex; justify-content:space-between; align-items:center;">' +
            '<small style="color:var(--text-muted); font-size:0.75rem;">' + (m.data_fim ? 'Até ' + new Date(m.data_fim).toLocaleDateString('pt-BR') : 'Campanha contínua') + '</small>' +
            (bateu 
              ? '<button onclick="abrirModalResgateBonusComMeta(' + m.id + ', ' + m.recompensa_valor + ', \'' + escJs(m.titulo) + '\')" class="btn btn-sm" style="background:#10b981; color:#fff; font-weight:800;"><i class="fa-solid fa-money-bill-wave"></i> Resgatar Bônus</button>'
              : '<button class="btn btn-sm" style="opacity:0.6; cursor:not-allowed;" disabled>Acelere as vendas</button>') +
          '</div>' +
        '</div>';
      }
      grid.innerHTML = html;
    }
  }

  // Histórico de Bonificações
  var tbody = document.getElementById('bonificacoes-afiliado-body');
  if (tbody) {
    var hist = (bonificacoes && bonificacoes.historico) ? bonificacoes.historico : [];
    setTextById('bonificacoes-total-pago', 'R$ ' + formatMoney(bonificacoes.total_pago || 0));

    if (hist.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:24px; color:var(--text-muted);">Nenhum bônus resgatado ainda.</td></tr>';
    } else {
      var hHist = '';
      for (var j = 0; j < hist.length; j++) {
        var bh = hist[j];
        var isPago = bh.status === 'pago';
        var statusBadge = isPago 
          ? '<span class="badge" style="background:#10b98122; color:#10b981; border:1px solid #10b98144; font-weight:700;">Pago via PIX ✓</span>'
          : '<span class="badge" style="background:#f59e0b22; color:#f59e0b; border:1px solid #f59e0b44; font-weight:700;">Em Processamento</span>';

        hHist += '<tr>' +
          '<td><code>#' + bh.id + '</code></td>' +
          '<td><strong style="color:#fff;">' + esc(bh.descricao || 'Bônus de Meta') + '</strong></td>' +
          '<td><strong style="color:var(--success);">R$ ' + formatMoney(bh.valor) + '</strong></td>' +
          '<td><code style="background:#000; color:#10b981; padding:2px 6px; border-radius:4px;">' + esc(bh.comprovante_pix ? 'PIX' : 'Pendente') + '</code></td>' +
          '<td><small>' + (bh.criada_em ? new Date(bh.criada_em).toLocaleDateString('pt-BR') : '—') + '</small></td>' +
          '<td>' + statusBadge + '</td>' +
          '<td><small style="color:var(--text-muted);">' + esc(bh.comprovante_pix || 'Aguardando TED/PIX') + '</small></td>' +
        '</tr>';
      }
      tbody.innerHTML = hHist;
    }
  }
}

function abrirModalQrCodeAfiliado(titulo, url) {
  _qrCodeUrlAtual = url;
  document.getElementById('modal-qrcode-titulo').textContent = 'QR Code — ' + titulo;
  document.getElementById('modal-qrcode-link-texto').textContent = url;

  var qrApi = 'https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=10&data=' + encodeURIComponent(url);
  var container = document.getElementById('qrcode-img-container');
  if (container) {
    container.innerHTML = '<img src="' + qrApi + '" alt="QR Code" style="width:260px; height:260px; display:block; border-radius:8px;">';
  }

  var dlBtn = document.getElementById('btn-download-qrcode');
  if (dlBtn) dlBtn.href = qrApi;

  document.getElementById('modal-qrcode-afiliado').classList.add('active');
}

function fecharModalQrCodeAfiliado() {
  document.getElementById('modal-qrcode-afiliado').classList.remove('active');
}

function copiarTextoQrCodeAtual() {
  if (_qrCodeUrlAtual) copiarTexto(_qrCodeUrlAtual, 'Link do QR Code copiado!');
}

function abrirModalResgateBonus() {
  var sel = document.getElementById('resgate-meta-id');
  if (sel) {
    var opts = '<option value="">🎁 Bônus de Carreira / Meta Batida</option>';
    if (portalAfiliadoData && portalAfiliadoData.metas) {
      portalAfiliadoData.metas.forEach(function(m) {
        opts += '<option value="' + m.id + '" data-val="' + m.recompensa_valor + '">' + (m.concluida ? '✓ ' : '') + esc(m.titulo) + ' (R$ ' + formatMoney(m.recompensa_valor) + ')</option>';
      });
    }
    sel.innerHTML = opts;
  }

  var pixInput = document.getElementById('resgate-pix-chave');
  if (pixInput && portalAfiliadoData && portalAfiliadoData.afiliado) {
    pixInput.value = portalAfiliadoData.afiliado.pix_chave || '';
  }

  document.getElementById('modal-resgate-bonus-afiliado').classList.add('active');
}

function abrirModalResgateBonusComMeta(metaId, valor, titulo) {
  abrirModalResgateBonus();
  var sel = document.getElementById('resgate-meta-id');
  if (sel) sel.value = metaId;
  var valInput = document.getElementById('resgate-valor');
  if (valInput) valInput.value = valor;
}

function fecharModalResgateBonus() {
  document.getElementById('modal-resgate-bonus-afiliado').classList.remove('active');
}

function enviarSolicitacaoResgateBonus() {
  var metaId = document.getElementById('resgate-meta-id').value;
  var valor = parseFloat(document.getElementById('resgate-valor').value) || 0;
  var pixChave = document.getElementById('resgate-pix-chave').value.trim();

  if (valor <= 0) return showToast('Informe um valor válido de bônus.', 'warning');
  if (!pixChave) return showToast('Informe sua chave PIX para transferência.', 'warning');

  apiPost('/api/afiliado/resgatar-bonus', {
    meta_id: metaId ? parseInt(metaId) : null,
    valor: valor,
    tipo: 'meta_atingida',
    descricao: 'Resgate de Bônus de Meta de Vendas'
  }, function(err, data) {
    if (err || !data || !data.ok) return showToast(data && data.erro ? data.erro : 'Erro ao solicitar bônus.', 'danger');
    showToast(data.mensagem || 'Solicitação de bonificação enviada com sucesso!', 'success');
    fecharModalResgateBonus();
    carregarPortalAfiliadoCompleto();
  });
}

function copiarTexto(texto, msgToast) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(texto).then(function() {
      showToast(msgToast || 'Copiado para a área de transferência!', 'success');
    });
  } else {
    var ta = document.createElement('textarea');
    ta.value = texto;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast(msgToast || 'Copiado!', 'success');
  }
}

function formatMoney(num) {
  return parseFloat(num || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function setTextById(id, val) {
  var el = document.getElementById(id);
  if (el) el.textContent = val;
}

/* ═══ VENDAS & ONBOARDING ═══ */
function carregarMinhasVendas() {
  apiGet('/api/suporte/minhas-vendas', function(err, data) {
    var tbody = document.getElementById('minhas-vendas-body');
    if (!tbody) return;
    if (err || !data || !data.ok || !data.vendas || data.vendas.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);">Nenhuma venda registrada ainda. Clique em "Registrar Nova Venda" para começar.</td></tr>';
      return;
    }
    var h = '';
    var fatoresLabels = {
      facilidade_interface: 'Interface / Facilidade',
      pedido_qrcode: 'Cardápio QR Code',
      controle_financeiro: 'Controle Financeiro',
      integracao_ifood: 'Integração iFood',
      suporte_humanizado: 'Suporte Humanizado',
      preco_competitivo: 'Custo-Benefício',
      estabilidade_offline: 'Modo Offline',
      outro: 'Outro'
    };
    for (var i = 0; i < data.vendas.length; i++) {
      var v = data.vendas[i];
      var stColor = v.status_venda === 'fechado' ? 'var(--success)' : (v.status_venda === 'negociacao' ? 'var(--warning)' : 'var(--danger)');
      var stIcon = v.status_venda === 'fechado' ? 'fa-circle-check' : (v.status_venda === 'negociacao' ? 'fa-clock' : 'fa-circle-xmark');
      h += '<tr>' +
        '<td><code style="color:var(--accent);font-weight:bold;">' + esc(v.chave_ativacao) + '</code></td>' +
        '<td><strong style="color:white;">' + esc(v.restaurante_nome) + '</strong><br><small style="color:var(--text-muted);">#' + (v.restaurante_id || '—') + '</small></td>' +
        '<td>' + esc(v.contato_nome || '—') + '<br><small style="color:var(--text-muted);">' + esc(v.contato_telefone || '') + '</small></td>' +
        '<td><span style="color:var(--warning);font-weight:bold;">' + esc(v.plano.toUpperCase()) + '</span><br><small>R$ ' + parseFloat(v.valor_venda || 0).toFixed(2) + '</small></td>' +
        '<td><span class="level-badge" style="font-size:0.75rem;">' + esc(fatoresLabels[v.fator_decisao] || v.fator_decisao || '—') + '</span></td>' +
        '<td><small style="color:var(--text-muted);">Objeção: ' + esc(v.objeção_nao_fecho || 'Nenhuma') + '<br>Ajudas: ' + esc(v.ajudas_usabilidade || 'Nenhuma') + '</small></td>' +
        '<td><small>' + (v.data_venda ? new Date(v.data_venda).toLocaleDateString('pt-BR') : '—') + '</small></td>' +
        '</tr>';
    }
    tbody.innerHTML = h;
  });
}

function abrirModalNovaVenda() {
  document.getElementById('venda-restaurante-nome').value = '';
  document.getElementById('venda-contato-nome').value = '';
  document.getElementById('venda-contato-telefone').value = '';
  document.getElementById('venda-valor').value = '299';
  document.getElementById('venda-objecao').value = '';
  document.getElementById('venda-ajudas').value = '';
  document.getElementById('modal-nova-venda').classList.add('active');
}

function fecharModalNovaVenda() {
  document.getElementById('modal-nova-venda').classList.remove('active');
}

function salvarVendaSuporte() {
  var restNome = document.getElementById('venda-restaurante-nome').value.trim();
  var contatoNome = document.getElementById('venda-contato-nome').value.trim();
  var contatoTel = document.getElementById('venda-contato-telefone').value.trim();
  var plano = document.getElementById('venda-plano').value;
  var valor = document.getElementById('venda-valor').value;
  var statusVenda = document.getElementById('venda-status').value;
  var fatorDecisao = document.getElementById('venda-fator-decisao').value;
  var objecao = document.getElementById('venda-objecao').value.trim();
  var ajudas = document.getElementById('venda-ajudas').value.trim();

  if (!restNome) { alert('Digite o nome do restaurante.'); return; }

  apiPost('/api/suporte/vendas', {
    restaurante_nome: restNome,
    contato_nome: contatoNome,
    contato_telefone: contatoTel,
    plano: plano,
    valor_venda: valor,
    status_venda: statusVenda,
    fator_decisao: fatorDecisao,
    objecao_nao_fecho: objecao,
    ajudas_usabilidade: ajudas
  }, function(err, data) {
    if (err || !data || !data.ok) {
      alert(err || (data && data.erro) || 'Erro ao registrar venda.');
      return;
    }
    alert(data.mensagem || 'Venda realizada com sucesso!');
    fecharModalNovaVenda();
    carregarFinanceiroSuporte();
    carregarRestaurantesSuporte();
  });
}

function carregarFinanceiroSuporte() {
  carregarMissoesSurpresa();
  apiGet('/api/suporte/financeiro', function(err, data) {
    if (err || !data || !data.ok) { carregarMinhasVendas(); return; }

    var f = data.financeiro || {};
    if (document.getElementById('v-saldo-liquido')) {
      document.getElementById('v-saldo-liquido').textContent = 'R$ ' + parseFloat(f.saldoLiquido || 0).toFixed(2);
    }
    if (document.getElementById('v-total-comissoes')) {
      document.getElementById('v-total-comissoes').textContent = 'R$ ' + parseFloat(f.totalComissoes || 0).toFixed(2);
    }
    if (document.getElementById('v-total-vendas-valor')) {
      document.getElementById('v-total-vendas-valor').textContent = 'Em R$ ' + parseFloat(f.totalVendasValor || 0).toFixed(2) + ' em vendas';
    }
    if (document.getElementById('v-meta-status')) {
      document.getElementById('v-meta-status').textContent = (f.vendasFechadasCount || 0) + ' / ' + (f.metaVendas || 5);
    }
    if (document.getElementById('v-meta-progress-bar')) {
      document.getElementById('v-meta-progress-bar').style.width = (f.progressoMetaPct || 0) + '%';
    }
    if (document.getElementById('v-bonificacao-label')) {
      document.getElementById('v-bonificacao-label').textContent = f.atingiuMeta ? '🎉 Bônus de R$ ' + parseFloat(f.bonificacaoMeta || 200).toFixed(2) + ' CONQUISTADO!' : 'Bônus Meta: R$ ' + parseFloat(f.bonificacaoMeta || 200).toFixed(2);
    }
    if (document.getElementById('v-eficiencia')) {
      document.getElementById('v-eficiencia').textContent = f.eficienciaConversao || '0%';
    }

    // Renderizar tabela de vendas com comissões
    var tbody = document.getElementById('minhas-vendas-body');
    if (!tbody) return;
    var vendas = data.vendas || [];
    if (vendas.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);">Nenhuma venda registrada ainda. Clique em "Registrar Nova Venda" para começar.</td></tr>';
      return;
    }

    var h = '';
    var fatoresLabels = {
      facilidade_interface: 'Interface / Facilidade',
      pedido_qrcode: 'Cardápio QR Code',
      controle_financeiro: 'Controle Financeiro',
      integracao_ifood: 'Integração iFood',
      suporte_humanizado: 'Suporte Humanizado',
      preco_competitivo: 'Custo-Benefício',
      estabilidade_offline: 'Modo Offline',
      outro: 'Outro'
    };
    for (var i = 0; i < vendas.length; i++) {
      var v = vendas[i];
      var stColor = v.status_venda === 'fechado' ? 'var(--success)' : (v.status_venda === 'negociacao' ? 'var(--warning)' : 'var(--danger)');
      h += '<tr>' +
        '<td><code style="color:var(--accent);font-weight:bold;">' + esc(v.chave_ativacao) + '</code></td>' +
        '<td><strong style="color:white;">' + esc(v.restaurante_nome) + '</strong><br><small style="color:var(--text-muted);">#' + (v.restaurante_id || '—') + '</small></td>' +
        '<td><span style="color:var(--warning);font-weight:bold;">' + esc(v.plano.toUpperCase()) + '</span><br><small>R$ ' + parseFloat(v.valor_venda || 0).toFixed(2) + '</small></td>' +
        '<td><span class="level-badge" style="font-size:0.75rem;">' + (v.comissao_percentual || 10) + '%</span></td>' +
        '<td><strong style="color:var(--success);">R$ ' + parseFloat(v.comissao_valor || 0).toFixed(2) + '</strong></td>' +
        '<td><small style="color:var(--text-muted);">Fator: ' + esc(fatoresLabels[v.fator_decisao] || v.fator_decisao || '—') + '<br>Objeção: ' + esc(v.objeção_nao_fecho || 'Nenhuma') + '</small></td>' +
        '<td><small>' + (v.data_venda ? new Date(v.data_venda).toLocaleDateString('pt-BR') : '—') + '</small></td>' +
        '</tr>';
    }
    tbody.innerHTML = h;
  });
}

function abrirModalAdiantamento() {
  document.getElementById('adiantamento-valor').value = '';
  document.getElementById('adiantamento-desc').value = '';
  document.getElementById('modal-adiantamento').classList.add('active');
}

function fecharModalAdiantamento() {
  document.getElementById('modal-adiantamento').classList.remove('active');
}

function confirmarSolicitarAdiantamento() {
  var val = parseFloat(document.getElementById('adiantamento-valor').value);
  var desc = document.getElementById('adiantamento-desc').value.trim();

  if (!val || val <= 0) { alert('Informe um valor válido para o adiantamento.'); return; }

  apiPost('/api/suporte/adiantamentos', { valor: val, descricao: desc }, function(err, data) {
    if (err || !data || !data.ok) {
      alert(err || (data && data.erro) || 'Erro ao solicitar adiantamento.');
      return;
    }
    alert(data.mensagem || 'Adiantamento registrado!');
    fecharModalAdiantamento();
    carregarFinanceiroSuporte();
  });
}

function abrirModalCadastroParceiro() {
  document.getElementById('cad-nome').value = '';
  document.getElementById('cad-email').value = '';
  document.getElementById('cad-telefone').value = '';
  document.getElementById('cad-senha').value = '';
  document.getElementById('cad-cpf').value = '';
  document.getElementById('cad-pix').value = '';
  document.getElementById('cad-motivacao').value = '';
  document.getElementById('modal-cadastro-parceiro').classList.add('active');
}

function fecharModalCadastroParceiro() {
  document.getElementById('modal-cadastro-parceiro').classList.remove('active');
}

function salvarCadastroParceiro() {
  var nome = document.getElementById('cad-nome').value.trim();
  var email = document.getElementById('cad-email').value.trim();
  var tel = document.getElementById('cad-telefone').value.trim();
  var senha = document.getElementById('cad-senha').value;
  var cpf = document.getElementById('cad-cpf').value.trim();
  var pix = document.getElementById('cad-pix').value.trim();
  var motivacao = document.getElementById('cad-motivacao').value.trim();

  if (!nome || !email || !senha) {
    alert('Preencha nome, email e senha para o cadastro.');
    return;
  }

  apiPost('/api/suporte/cadastro', {
    nome: nome,
    email: email,
    telefone: tel,
    senha: senha,
    cpf_cnpj: cpf,
    pix_chave: pix,
    motivacao: motivacao
  }, function(err, data) {
    if (err || !data || !data.ok) {
      alert(err || (data && data.erro) || 'Erro ao realizar cadastro.');
      return;
    }
    alert(data.mensagem || 'Cadastro realizado! Aguarde a aprovação da equipe.');
    fecharModalCadastroParceiro();
  });
}

/* ═══ CENTRAL DE NOTIFICAÇÕES EM TEMPO REAL & MISSÕES SURPRESA ═══ */


// ── Relatos de Restaurantes ─────────────────────────────────
function escHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) { return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]; }); }

function carregarRelatosRestaurantes() {
  apiGet('/api/suporte/tarefas-relatadas', function(err, data) {
    var lista = document.getElementById('relatos-lista');
    var badge = document.getElementById('relatos-count-badge');
    if (err || !data || !data.ok) {
      if (lista) lista.innerHTML = '<div class="empty-state" style="padding:1rem;"><p>Não foi possível carregar os relatos.</p></div>';
      return;
    }
    var relatos = data.relatos || [];
    if (badge) {
      badge.textContent = relatos.length;
      badge.style.display = relatos.length > 0 ? 'inline-block' : 'none';
    }
    if (!lista) return;
    if (relatos.length === 0) {
      lista.innerHTML = '<div class="empty-state" style="padding:1rem;"><p>Nenhum relato pendente. Tudo tranquilo! 🎉</p></div>';
      return;
    }
    var h = '';
    relatos.forEach(function(r) {
      var desc = String(r.descricao || '');
      var linhas = desc.split('\n');
      var tituloRelato = linhas[0] || 'Relato';
      var corpo = linhas.slice(1).join('\n').trim();
      var priAlta = /\bprioridade ALTA\b/i.test(linhas[0] || '');
      var borda = priAlta ? 'border-left:4px solid #ef4444;' : 'border-left:4px solid var(--warning,#f59e0b);';
      var seloTipo = '';
      if (r.tipo === 'falha_automatica') seloTipo = ' <span style="background:#ef4444;color:#fff;font-size:0.68rem;font-weight:800;padding:1px 8px;border-radius:10px;">🚨 FALHA AUTOMÁTICA</span>';
      else if (r.tipo === 'design_tema') seloTipo = ' <span style="background:#ec4899;color:#fff;font-size:0.68rem;font-weight:800;padding:1px 8px;border-radius:10px;">🎨 DESIGN DE TEMA</span>';
      else if (r.tipo === 'delegacao_super') seloTipo = ' <span style="background:#0ea5e9;color:#fff;font-size:0.68rem;font-weight:800;padding:1px 8px;border-radius:10px;">📌 DELEGAÇÃO SUPER ADMIN</span>';
      h += '<div class="relato-item card" style="' + borda + 'padding:12px 14px;margin-bottom:10px;">'
        + '<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap;">'
        + '<div style="flex:1;min-width:220px;">'
        + '<strong style="font-size:0.9rem;">' + escHtml(tituloRelato) + '</strong>' + seloTipo
        + (r.restaurante_nome ? ' <span style="color:var(--text-muted);font-size:0.78rem;">• ' + escHtml(r.restaurante_nome) + '</span>' : '')
        + '<div style="color:var(--text-sub);font-size:0.8rem;white-space:pre-wrap;margin-top:6px;">' + escHtml(corpo) + '</div>'
        + '<small style="color:var(--text-muted);">' + (r.criada_em ? new Date(r.criada_em.replace(' ','T')).toLocaleString('pt-BR') : '') + '</small>'
        + '</div>'
        + '<button class="btn btn-primary" style="white-space:nowrap;" onclick="assumirRelato(' + r.id + ')"><i class="fa-solid fa-hand"></i> Assumir</button>'
        + '</div></div>';
    });
    lista.innerHTML = h;
  });
}

window.assumirRelato = function(id) {
  apiPost('/api/suporte/assumir-relato', { id: id }, function(err, data) {
    if ((err || !data.ok)) { showToast((data && data.erro) || 'Erro ao assumir relato', 'error'); return; }
    showToast(data.mensagem || 'Relato assumido!', 'success');
    carregarRelatosRestaurantes();
    carregarAtividades();
  });
};

window.concluirMinhaTarefa = function(id) {
  apiPost('/api/suporte/concluir-tarefa', { id: id }, function(err, data) {
    if (err || !data || !data.ok) { showToast((data && data.erro) || 'Erro ao concluir tarefa', 'error'); return; }
    showToast(data.mensagem || 'Tarefa concluída!', 'success');
    carregarAtividades();
  });
};

var _suporteSocket = null;
function initSuporteRealtimeSockets() {
  if (typeof io === 'undefined') return;
  if (_suporteSocket) return;
  try {
    _suporteSocket = io();
    _suporteSocket.on('nova_missao_surpresa', function(data) {
      showToast('?? PROMOÇÃO SURPRESA: ' + data.titulo + ' (Bônus R$ ' + parseFloat(data.recompensa_valor || 0).toFixed(2) + ')', 'warning');
      carregarMissoesSurpresa();
      carregarNotificacoesSuporte();
    });
    _suporteSocket.on('nova_tarefa_suporte', function(data) {
      showToast('Novo relato de ' + (data.restaurante_nome || 'restaurante') + ': ' + data.titulo, 'warning');
      carregarRelatosRestaurantes();
    });
    _suporteSocket.on('nova_meta_afiliados', function(data) {
      showToast('🎯 NOVA META LANÇADA: ' + (data.titulo || 'Meta') + ' (Bônus R$ ' + parseFloat(data.recompensa_valor || 0).toFixed(2) + ' PIX)', 'info');
      if (_currentTab === 'sec-vendas') carregarPortalAfiliadoCompleto();
    });
    _suporteSocket.on('bonificacao_paga_pix', function(data) {
      if (suporteUser && data.suporte_id === suporteUser.id) {
        showToast('🎉 SEU PIX CHEGOU! Bônus de R$ ' + parseFloat(data.valor || 0).toFixed(2) + ' pago com sucesso!', 'success');
        if (_currentTab === 'sec-vendas') carregarPortalAfiliadoCompleto();
      }
    });
  } catch(e) { console.error('Erro ao conectar socket de suporte:', e); }
}

function carregarNotificacoesSuporte() {
  apiGet('/api/suporte/notificacoes', function(err, data) {
    var badge = document.getElementById('notif-badge');
    var list = document.getElementById('central-notificacoes-list');
    if (!data || !data.ok || !data.notificacoes) return;

    var notifs = data.notificacoes || [];
    if (badge) {
      if (notifs.length > 0) {
        badge.textContent = notifs.length;
        badge.style.display = 'inline-block';
      } else {
        badge.style.display = 'none';
      }
    }

    if (list) {
      if (notifs.length === 0) {
        list.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:20px;">Nenhuma notificação recebida.</div>';
        return;
      }
      var h = '';
      notifs.forEach(function(n) {
        var icon = n.tipo === 'urgente' ? 'fa-bell-slash' : (n.tipo === 'importante' ? 'fa-triangle-exclamation' : 'fa-bullhorn');
        var color = n.tipo === 'urgente' ? 'var(--danger)' : (n.tipo === 'importante' ? 'var(--warning)' : 'var(--accent)');
        h += '<div style="background:var(--bg-tertiary);border:1px solid var(--border-color);border-radius:10px;padding:12px;">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
            '<strong style="color:white;font-size:0.9rem;"><i class="fa-solid ' + icon + '" style="color:' + color + ';margin-right:6px;"></i> ' + esc(n.titulo) + '</strong>' +
            '<small style="color:var(--text-muted);font-size:0.75rem;">' + (n.criado_em ? new Date(n.criado_em).toLocaleString('pt-BR') : '—') + '</small>' +
          '</div>' +
          '<p style="color:var(--text-secondary);font-size:0.85rem;margin:0;">' + esc(n.corpo) + '</p>' +
          '</div>';
      });
      list.innerHTML = h;
    }
  });
}

function toggleCentralNotificacoesSuporte() {
  var modal = document.getElementById('modal-central-notificacoes');
  if (!modal) return;
  if (modal.classList.contains('active')) {
    modal.classList.remove('active');
  } else {
    modal.classList.add('active');
    carregarNotificacoesSuporte();
  }
}

function carregarMissoesSurpresa() {
  apiGet('/api/suporte/missoes', function(err, data) {
    var container = document.getElementById('container-missoes-surpresa');
    if (!container) return;
    if (err || !data || !data.ok || !data.missoes || data.missoes.length === 0) {
      container.innerHTML = '<div style="background:rgba(255,255,255,0.05);padding:1rem;border-radius:12px;border:1px dashed #6366f1;text-align:center;color:#94a3b8;font-size:0.85rem;">Nenhuma promoção relâmpago ativa no momento. Fique atento às notificações!</div>';
      return;
    }
    var h = '';
    data.missoes.forEach(function(m) {
      h += '<div style="background:rgba(99,102,241,0.15);border:1px solid #6366f1;padding:12px;border-radius:12px;">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">' +
          '<h4 style="color:#fbbf24;font-size:0.95rem;margin:0;"><i class="fa-solid fa-bolt" style="color:#f59e0b;"></i> ' + esc(m.titulo) + '</h4>' +
          '<span style="background:var(--success);color:white;font-weight:800;padding:2px 8px;border-radius:10px;font-size:0.75rem;">+ R$ ' + parseFloat(m.recompensa_valor || 0).toFixed(2) + '</span>' +
        '</div>' +
        '<p style="color:#e2e8f0;font-size:0.8rem;margin-bottom:8px;">' + esc(m.descricao) + '</p>' +
        '<div style="display:flex;justify-content:space-between;font-size:0.75rem;color:#94a3b8;">' +
          '<span>Meta: <strong>' + (m.meta_qtd || 1) + ' vendas</strong></span>' +
          '<span>Prazo: <strong>' + (m.data_limite ? new Date(m.data_limite).toLocaleString('pt-BR') : 'Hoje / Esporádico') + '</strong></span>' +
        '</div>' +
        '</div>';
    });
    container.innerHTML = h;
  });
}
/* ═══ SIDEBAR EVENTS ═══ */
document.addEventListener('DOMContentLoaded', function() {
  var savedToken = localStorage.getItem('chef_suporte_token');
  if (savedToken) {
    suporteToken = savedToken;
    apiGet('/api/suporte/me', function(err, data) {
      if (!err && data && data.ok) {
        suporteUser = data.usuario;
        entrarPainel();
      } else {
        localStorage.removeItem('chef_suporte_token');
      }
    });
  }

  var menuItems = document.querySelectorAll('.sidebar .menu-item');
  for (var i = 0; i < menuItems.length; i++) {
    menuItems[i].addEventListener('click', function() {
      switchTabSuporte(this.getAttribute('data-target'));
    });
  }

  document.getElementById('login-senha').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') loginSuporte();
  });

  if (typeof suporteToken !== 'undefined' && suporteToken && typeof carregarRelatosRestaurantes === 'function') {
    carregarRelatosRestaurantes();
  }
});

// ── ESTÚDIO DE CRIAÇÃO DE MÓDULOS (CAIXA V1.1) ──
async function carregarModulosSuporte() {
  const tbody = document.getElementById('lista-modulos-suporte-body');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:1.5rem; color:var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Carregando módulos...</td></tr>';

  try {
    const res = await fetch('/api/suporte/modulos/listar');
    const data = await res.json();
    if (!data.sucesso || !data.modulos) throw new Error(data.erro || 'Falha ao carregar');

    if (data.modulos.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:2rem; color:var(--text-muted);">Nenhum módulo encontrado. Clique em Criar Novo Módulo acima!</td></tr>';
      return;
    }

    tbody.innerHTML = data.modulos.map(m => `
      <tr>
        <td style="font-size:1.3rem; text-align:center; color:#fc4b15;"><i class="${m.icon || 'fa-solid fa-puzzle-piece'}"></i></td>
        <td><strong>${m.name || m.id}</strong><br><small style="color:var(--text-muted);">${m.description || 'Sem descrição'}</small></td>
        <td><code style="background:var(--bg-tertiary); padding:2px 6px; border-radius:4px; font-size:0.8rem;">plugins/${m.id}</code></td>
        <td><span class="badge" style="background:rgba(56,189,248,0.15); color:#38bdf8;">${m.category || 'Geral'}</span></td>
        <td><span class="badge">${m.defaultSize || 'sz-m'}</span></td>
        <td>
          <small style="color:var(--text-muted);">
            ${m.temWidget ? '🟢 Widget ' : '⚪ '}
            ${m.temServer ? '🟢 Server ' : '⚪ '}
            ${m.temStyle ? '🟢 CSS ' : '⚪ '}
          </small>
        </td>
        <td>
          <span class="badge ${m.enabled !== false ? 'badge-success' : 'badge-danger'}">
            ${m.enabled !== false ? 'Ativo' : 'Inativo'}
          </span>
        </td>
        <td>
          <button class="btn btn-sm" onclick="toggleStatusModulo('${m.id}', ${m.enabled === false})">
            ${m.enabled !== false ? '<i class="fa-solid fa-pause"></i> Desativar' : '<i class="fa-solid fa-play"></i> Ativar'}
          </button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:1.5rem; color:var(--danger);">Erro: ${err.message}</td></tr>`;
  }
}

async function toggleStatusModulo(id, novoStatus) {
  try {
    const res = await fetch('/api/suporte/modulos/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, enabled: novoStatus })
    });
    const data = await res.json();
    if (data.sucesso) {
      if (typeof showToast === 'function') showToast('Status do módulo atualizado!', 'success');
      carregarModulosSuporte();
    }
  } catch (e) {
    alert('Erro ao alterar status: ' + e.message);
  }
}

window.abrirModalCriarModulo = function() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay active';
  modal.id = 'modal-criar-modulo-suporte';
  modal.innerHTML = `
    <div class="modal-content" style="max-width:620px;">
      <div class="modal-header">
        <h3><i class="fa-solid fa-wand-magic-sparkles" style="color:#fc4b15;"></i> Criar Novo Módulo para Caixa v1.1</h3>
        <button class="btn btn-sm" onclick="document.getElementById('modal-criar-modulo-suporte').remove()"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="modal-body" style="max-height:75vh; overflow-y:auto; padding:1.5rem;">
        <div class="form-row">
          <div class="form-group" style="flex:1;">
            <label>ID do Módulo (slug único) *</label>
            <input type="text" id="novo-mod-id" placeholder="ex: gorjetas, reservas-vip, couvert">
          </div>
          <div class="form-group" style="flex:1;">
            <label>Nome Visual do Módulo *</label>
            <input type="text" id="novo-mod-nome" placeholder="ex: Gestão de Gorjetas">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group" style="flex:1;">
            <label>Ícone Phosphor / FontAwesome</label>
            <input type="text" id="novo-mod-icone" placeholder="ph-hand-coins ou fa-solid fa-coins" value="ph-puzzle-piece">
          </div>
          <div class="form-group" style="flex:1;">
            <label>Categoria</label>
            <select id="novo-mod-cat">
              <option value="operacao">Operação</option>
              <option value="financeiro">Financeiro</option>
              <option value="hardware">Hardware / Balança</option>
              <option value="marketing">Marketing & Fidelidade</option>
              <option value="delivery">Delivery</option>
              <option value="atendimento">Atendimento</option>
            </select>
          </div>
          <div class="form-group" style="flex:1;">
            <label>Tamanho Inicial</label>
            <select id="novo-mod-size">
              <option value="sz-m">M (Médio)</option>
              <option value="sz-s">P (Pequeno)</option>
              <option value="sz-l">G (Grande)</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label>Descrição do Módulo</label>
          <input type="text" id="novo-mod-desc" placeholder="Breve explicação da utilidade do bloco">
        </div>
        <div class="form-group">
          <label>Código do Widget (HTML/JS)</label>
          <textarea id="novo-mod-widget" rows="4" placeholder="Código customizado do widget (deixe em branco para usar o template padrão)"></textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn" onclick="document.getElementById('modal-criar-modulo-suporte').remove()">Cancelar</button>
        <button class="btn btn-primary" onclick="salvarNovoModuloSuporte()"><i class="fa-solid fa-check"></i> Gerar e Publicar Módulo</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
};

window.salvarNovoModuloSuporte = async function() {
  const id = document.getElementById('novo-mod-id').value.trim();
  const name = document.getElementById('novo-mod-nome').value.trim();
  const icon = document.getElementById('novo-mod-icone').value.trim();
  const category = document.getElementById('novo-mod-cat').value;
  const defaultSize = document.getElementById('novo-mod-size').value;
  const description = document.getElementById('novo-mod-desc').value.trim();
  const widgetCode = document.getElementById('novo-mod-widget').value.trim();

  if (!id || !name) return alert('Preencha o ID e o Nome do módulo.');

  try {
    const res = await fetch('/api/suporte/modulos/salvar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name, icon, category, defaultSize, description, widgetCode: widgetCode || null })
    });
    const data = await res.json();
    if (data.sucesso) {
      alert('Módulo criado e publicado com sucesso!');
      document.getElementById('modal-criar-modulo-suporte').remove();
      carregarModulosSuporte();
    } else {
      alert('Erro: ' + data.erro);
    }
  } catch (e) {
    alert('Erro de conexão: ' + e.message);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.menu-item').forEach(item => {
    item.addEventListener('click', () => {
      if (item.getAttribute('data-target') === 'sec-estudio-modulos') {
        carregarModulosSuporte();
      }
    });
  });
});


// ══════════════════════════════════════════════════════════════════
// STUDIO UI & LIVE COMPONENT PREVIEW LOGIC
// ══════════════════════════════════════════════════════════════════
let _currentStudioComponent = 'btn-primario';
let _canvasTheme = 'dark';

window.trocarComponentePreview = function(compType) {
  _currentStudioComponent = compType;
  const target = document.getElementById('studio-live-target');
  if (!target) return;

  const bgCtrl = document.getElementById('ctrl-bg-color');
  const textCtrl = document.getElementById('ctrl-text-color');
  const borderCtrl = document.getElementById('ctrl-border-color');
  const widthCtrl = document.getElementById('ctrl-border-width');
  const radCtrl = document.getElementById('ctrl-border-radius');
  const padX = document.getElementById('ctrl-padding-x');
  const padY = document.getElementById('ctrl-padding-y');

  if (compType === 'btn-primario') {
    if (bgCtrl) bgCtrl.value = '#fc4b15';
    if (textCtrl) textCtrl.value = '#ffffff';
    if (borderCtrl) borderCtrl.value = '#e03e0a';
    if (widthCtrl) widthCtrl.value = '0';
    if (radCtrl) radCtrl.value = '12';
    if (padX) padX.value = '24';
    if (padY) padY.value = '14';
    target.innerHTML = '<button id="studio-element" type="button"><i class="fa-solid fa-bolt"></i> Finalizar Pedido</button>';
  } else if (compType === 'btn-sucesso') {
    if (bgCtrl) bgCtrl.value = '#10b981';
    if (textCtrl) textCtrl.value = '#ffffff';
    if (borderCtrl) borderCtrl.value = '#059669';
    if (widthCtrl) widthCtrl.value = '0';
    if (radCtrl) radCtrl.value = '12';
    if (padX) padX.value = '20';
    if (padY) padY.value = '12';
    target.innerHTML = '<button id="studio-element" type="button"><i class="fa-solid fa-check"></i> Salvar e Confirmar</button>';
  } else if (compType === 'btn-kds') {
    if (bgCtrl) bgCtrl.value = '#fc4b15';
    if (textCtrl) textCtrl.value = '#ffffff';
    if (widthCtrl) widthCtrl.value = '0';
    if (radCtrl) radCtrl.value = '14';
    if (padX) padX.value = '28';
    if (padY) padY.value = '16';
    target.innerHTML = '<button id="studio-element" type="button"><i class="fa-solid fa-fire"></i> Iniciar Preparo KDS</button>';
  } else if (compType === 'btn-outline') {
    if (bgCtrl) bgCtrl.value = '#1e293b';
    if (textCtrl) textCtrl.value = '#38bdf8';
    if (borderCtrl) borderCtrl.value = '#38bdf8';
    if (widthCtrl) widthCtrl.value = '2';
    if (radCtrl) radCtrl.value = '10';
    if (padX) padX.value = '18';
    if (padY) padY.value = '10';
    target.innerHTML = '<button id="studio-element" type="button"><i class="fa-solid fa-eye"></i> Visualizar Comanda</button>';
  } else if (compType === 'modal-checkout') {
    if (bgCtrl) bgCtrl.value = '#1e293b';
    if (textCtrl) textCtrl.value = '#f8fafc';
    if (borderCtrl) borderCtrl.value = '#334155';
    if (widthCtrl) widthCtrl.value = '1';
    if (radCtrl) radCtrl.value = '20';
    if (padX) padX.value = '24';
    if (padY) padY.value = '24';
    target.innerHTML = `
      <div id="studio-element" style="min-width:340px; text-align:left;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
          <h3 style="margin:0; font-size:18px; font-weight:800; color:#fc4b15;">Fechamento de Conta</h3>
          <span style="background:#3b82f6; color:#fff; padding:2px 8px; border-radius:8px; font-size:11px; font-weight:700;">Mesa 04</span>
        </div>
        <div style="font-size:28px; font-weight:900; margin-bottom:12px; color:#10b981;">R$ 142,50</div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:16px;">
          <button style="padding:10px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1); border-radius:10px; color:#fff; font-weight:700; cursor:pointer;"><i class="fa-solid fa-qrcode"></i> PIX</button>
          <button style="padding:10px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1); border-radius:10px; color:#fff; font-weight:700; cursor:pointer;"><i class="fa-solid fa-credit-card"></i> Cartão</button>
        </div>
        <button style="width:100%; padding:12px; background:#10b981; color:#fff; border:none; border-radius:10px; font-weight:800; cursor:pointer;">Confirmar Recebimento</button>
      </div>
    `;
  } else if (compType === 'card-widget-v11') {
    if (bgCtrl) bgCtrl.value = '#1e293b';
    if (textCtrl) textCtrl.value = '#f8fafc';
    if (borderCtrl) borderCtrl.value = '#334155';
    if (widthCtrl) widthCtrl.value = '1';
    if (radCtrl) radCtrl.value = '18';
    if (padX) padX.value = '20';
    if (padY) padY.value = '18';
    target.innerHTML = `
      <div id="studio-element" style="min-width:300px; text-align:left;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <span style="font-weight:800; font-size:15px; color:#fc4b15;"><i class="fa-solid fa-chart-line"></i> Vendas do Turno</span>
          <span style="font-size:11px; background:rgba(252,75,21,0.15); color:#fc4b15; padding:2px 8px; border-radius:10px; font-weight:700;">Live</span>
        </div>
        <div style="font-size:24px; font-weight:900; margin-bottom:6px;">R$ 2.840,00</div>
        <div style="font-size:12px; color:#94a3b8;">18 pedidos finalizados • Ticket médio R$ 85,00</div>
      </div>
    `;
  } else if (compType === 'tab-segmented') {
    if (bgCtrl) bgCtrl.value = '#0f172a';
    if (textCtrl) textCtrl.value = '#f8fafc';
    if (borderCtrl) borderCtrl.value = '#334155';
    if (widthCtrl) widthCtrl.value = '1';
    if (radCtrl) radCtrl.value = '14';
    if (padX) padX.value = '6';
    if (padY) padY.value = '6';
    target.innerHTML = `
      <div id="studio-element" style="display:inline-flex; gap:4px;">
        <button style="padding:8px 16px; border-radius:10px; border:none; background:#fc4b15; color:#fff; font-weight:800; font-size:13px; cursor:pointer;">Em Espera (5)</button>
        <button style="padding:8px 16px; border-radius:10px; border:none; background:transparent; color:#94a3b8; font-weight:700; font-size:13px; cursor:pointer;">Em Preparo (12)</button>
        <button style="padding:8px 16px; border-radius:10px; border:none; background:transparent; color:#94a3b8; font-weight:700; font-size:13px; cursor:pointer;">Prontos (8)</button>
      </div>
    `;
  } else {
    target.innerHTML = '<div id="studio-element" style="padding:16px;">Componente Customizado</div>';
  }

  window.atualizarEstiloAoVivo();
};

window.atualizarEstiloAoVivo = function() {
  const el = document.getElementById('studio-element');
  if (!el) return;

  const fSize = document.getElementById('ctrl-font-size')?.value || '15';
  const fWeight = document.getElementById('ctrl-font-weight')?.value || '700';
  const bgColor = document.getElementById('ctrl-bg-color')?.value || '#fc4b15';
  const textColor = document.getElementById('ctrl-text-color')?.value || '#ffffff';
  const borderColor = document.getElementById('ctrl-border-color')?.value || '#e03e0a';
  const borderWidth = document.getElementById('ctrl-border-width')?.value || '0';
  const borderRadius = document.getElementById('ctrl-border-radius')?.value || '12';
  const padX = document.getElementById('ctrl-padding-x')?.value || '24';
  const padY = document.getElementById('ctrl-padding-y')?.value || '14';
  const bShadow = document.getElementById('ctrl-box-shadow')?.value || 'none';

  el.style.fontSize = fSize + 'px';
  el.style.fontWeight = fWeight;
  el.style.backgroundColor = bgColor;
  el.style.color = textColor;
  el.style.borderColor = borderColor;
  el.style.borderWidth = borderWidth + 'px';
  el.style.borderStyle = borderWidth > 0 ? 'solid' : 'none';
  el.style.borderRadius = borderRadius + 'px';
  el.style.padding = padY + 'px ' + padX + 'px';
  el.style.boxShadow = bShadow;
  el.style.cursor = 'pointer';
  el.style.display = el.tagName === 'BUTTON' ? 'inline-flex' : el.style.display;
  el.style.alignItems = 'center';
  el.style.gap = '8px';
  el.style.transition = 'all 0.15s ease';

  const cssOutput = `#custom-${_currentStudioComponent} {
  font-size: ${fSize}px;
  font-weight: ${fWeight};
  background: ${bgColor};
  color: ${textColor};
  border: ${borderWidth}px solid ${borderColor};
  border-radius: ${borderRadius}px;
  padding: ${padY}px ${padX}px;
  box-shadow: ${bShadow};
}`;
  const cssEl = document.getElementById('studio-css-output');
  if (cssEl) cssEl.innerText = cssOutput;
};

window.setDevicePreview = function(device) {
  const container = document.getElementById('studio-canvas-container');
  if (!container) return;
  ['desktop', 'tablet', 'mobile'].forEach(d => {
    const btn = document.getElementById('btn-device-' + d);
    if (btn) btn.classList.toggle('btn-primary', d === device);
  });

  if (device === 'mobile') container.style.maxWidth = '380px';
  else if (device === 'tablet') container.style.maxWidth = '768px';
  else container.style.maxWidth = '100%';
};

window.toggleCanvasTheme = function() {
  _canvasTheme = _canvasTheme === 'dark' ? 'light' : 'dark';
  const container = document.getElementById('studio-canvas-container');
  if (container) {
    container.style.background = _canvasTheme === 'dark' ? '#0e1320' : '#f1f5f9';
    container.style.borderColor = _canvasTheme === 'dark' ? '#243048' : '#cbd5e1';
  }
};

window.exportarLayoutCSS = function() {
  const cssEl = document.getElementById('studio-css-output');
  if (cssEl && cssEl.innerText) {
    navigator.clipboard.writeText(cssEl.innerText).then(() => {
      alert('CSS copiado para a área de transferência com sucesso!');
    });
  }
};

window.salvarPresetLayout = function() {
  alert('Preset de layout salvo com sucesso no banco de dados do suporte!');
};

window.resetarEstilosStudio = function() {
  window.trocarComponentePreview(_currentStudioComponent);
};

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('sec-ui-component-studio')) {
    window.trocarComponentePreview('btn-primario');
  }
});


// ─── LÓGICA DE INJEÇÃO DE LAYOUT (GLOBAL VS TENANT) NO STUDIO UI ───
window.carregarRestaurantesParaStudio = async function() {
  try {
    const res = await fetch('/api/suporte/restaurantes-list');
    const data = await res.json();
    const select = document.getElementById('studio-restaurant-select');
    if (select && data.success && Array.isArray(data.restaurantes)) {
      select.innerHTML = data.restaurantes.map(r => 
        `<option value="${r.id}">🏢 ${r.nome} (ID ${r.id}${r.slug ? ' - /' + r.slug : ''})</option>`
      ).join('');
    }
  } catch(e) {}
};

window.onTargetScopeChanged = function(val) {
  const wrap = document.getElementById('studio-tenant-selector-wrap');
  if (wrap) wrap.style.display = (val === 'tenant') ? 'block' : 'none';
  if (val === 'tenant') window.carregarRestaurantesParaStudio();
};

window.salvarPresetLayout = async function() {
  const targetScope = document.getElementById('studio-target-scope')?.value || 'global';
  const restId = document.getElementById('studio-restaurant-select')?.value || 1;
  const comp = _currentStudioComponent || 'btn-primario';
  const cssEl = document.getElementById('studio-css-output');
  const cssContent = cssEl ? cssEl.innerText : '';

  if (!cssContent || cssContent.includes('/* CSS gerado')) {
    return alert('Faça algum ajuste no componente antes de injetar.');
  }

  const fSize = document.getElementById('ctrl-font-size')?.value;
  const fWeight = document.getElementById('ctrl-font-weight')?.value;
  const bgColor = document.getElementById('ctrl-bg-color')?.value;
  const textColor = document.getElementById('ctrl-text-color')?.value;
  const borderColor = document.getElementById('ctrl-border-color')?.value;
  const borderWidth = document.getElementById('ctrl-border-width')?.value;
  const borderRadius = document.getElementById('ctrl-border-radius')?.value;
  const padX = document.getElementById('ctrl-padding-x')?.value;
  const padY = document.getElementById('ctrl-padding-y')?.value;
  const bShadow = document.getElementById('ctrl-box-shadow')?.value;

  const payload = {
    targetType: targetScope,
    restaurante_id: targetScope === 'tenant' ? parseInt(restId) : null,
    component: comp,
    cssContent: cssContent,
    configJson: { fSize, fWeight, bgColor, textColor, borderColor, borderWidth, borderRadius, padX, padY, bShadow }
  };

  try {
    const res = await fetch('/api/suporte/injetar-layout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (result.success) {
      alert('🚀 ' + result.message);
    } else {
      alert('Erro: ' + (result.error || 'Não foi possível injetar o layout.'));
    }
  } catch(e) {
    alert('Erro de conexão ao injetar layout: ' + e.message);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  window.carregarRestaurantesParaStudio();
});

// ═══════════════════════════════════════════════════════════════════════════
// DEV STUDIO & HUB DE APIS INTERNAS (SUPORTE & ENGENHARIA)
// ═══════════════════════════════════════════════════════════════════════════

var _devCatalogCache = [];
var _devSelectedCat = 'todos';
var _devTemplatesCache = [];
var _devActiveTemplate = null;
var _devActiveScaffoldFileType = 'json';
var _devScaffoldFiles = {};

window.carregarDevHub = function() {
  window.carregarCatalogoDev();
  window.carregarTemplatesDev();
  window.popularTenantsSandbox();
};

window.switchDevHubTab = function(tabName) {
  var tabs = ['catalog', 'sandbox', 'scaffolder', 'sdk'];
  tabs.forEach(function(t) {
    var view = document.getElementById('dev-view-' + t);
    var btn = document.getElementById('dev-tab-btn-' + t);
    if (view) view.style.display = (t === tabName) ? 'block' : 'none';
    if (btn) {
      if (t === tabName) {
        btn.style.background = 'rgba(0,242,254,0.15)';
        btn.style.borderColor = '#00f2fe';
        btn.style.color = '#00f2fe';
        btn.style.fontWeight = '700';
      } else {
        btn.style.background = 'var(--bg-tertiary)';
        btn.style.borderColor = 'var(--border-color)';
        btn.style.color = 'var(--text-primary)';
        btn.style.fontWeight = '600';
      }
    }
  });
};

window.popularTenantsSandbox = function() {
  var sel = document.getElementById('dev-sb-tenant');
  if (!sel) return;
  if (_restaurantesCache && _restaurantesCache.length > 0) {
    sel.innerHTML = '<option value="">Nenhum (Global / Master)</option>' +
      _restaurantesCache.map(function(r) {
        return '<option value="' + r.id + '">#' + r.id + ' - ' + esc(r.nome) + '</option>';
      }).join('');
  } else {
    apiGet('/api/suporte/restaurantes', function(err, data) {
      if (!err && data && data.ok && Array.isArray(data.restaurantes)) {
        _restaurantesCache = data.restaurantes;
        sel.innerHTML = '<option value="">Nenhum (Global / Master)</option>' +
          _restaurantesCache.map(function(r) {
            return '<option value="' + r.id + '">#' + r.id + ' - ' + esc(r.nome) + '</option>';
          }).join('');
      }
    });
  }
};

// ── 1. CATÁLOGO DE APIS & ROTAS ──

window.carregarCatalogoDev = async function() {
  var container = document.getElementById('dev-catalog-list');
  var catsContainer = document.getElementById('dev-catalog-categories');
  if (!container) return;

  try {
    var res = await fetch('/api/dev/catalog');
    var data = await res.json();
    if (!data.sucesso || !Array.isArray(data.endpoints)) throw new Error(data.error || 'Erro ao carregar catálogo');

    _devCatalogCache = data.endpoints;

    // Categorias
    if (catsContainer && data.categories) {
      var h = '<button class="btn btn-sm" onclick="selecionarCategoriaDev(\'todos\')" id="dev-cat-todos" style="font-size:0.75rem; background:#0284c7; color:#fff;">Todos (' + data.endpoints.length + ')</button>';
      data.categories.forEach(function(cat) {
        var count = data.endpoints.filter(function(e) { return e.category === cat; }).length;
        h += '<button class="btn btn-sm" onclick="selecionarCategoriaDev(\'' + esc(cat) + '\')" id="dev-cat-' + cat.replace(/[^a-zA-Z0-9]/g, '-') + '" style="font-size:0.75rem;">' + esc(cat) + ' (' + count + ')</button>';
      });
      catsContainer.innerHTML = h;
    }

    window.filtrarCatalogoDev();
  } catch (err) {
    container.innerHTML = '<div class="empty-state" style="padding:2rem; color:var(--danger);"><i class="fa-solid fa-triangle-exclamation"></i><p>' + esc(err.message) + '</p></div>';
  }
};

window.selecionarCategoriaDev = function(cat) {
  _devSelectedCat = cat;
  var btns = document.querySelectorAll('#dev-catalog-categories .btn');
  btns.forEach(function(b) {
    b.style.background = 'var(--bg-tertiary)';
    b.style.borderColor = 'var(--border-color)';
    b.style.color = 'var(--text-primary)';
  });
  var activeBtn = document.getElementById('dev-cat-' + (cat === 'todos' ? 'todos' : cat.replace(/[^a-zA-Z0-9]/g, '-')));
  if (activeBtn) {
    activeBtn.style.background = '#0284c7';
    activeBtn.style.color = '#fff';
  }
  window.filtrarCatalogoDev();
};

window.filtrarCatalogoDev = function() {
  var container = document.getElementById('dev-catalog-list');
  if (!container) return;

  var q = (document.getElementById('dev-catalog-search')?.value || '').toLowerCase().trim();
  var filtered = _devCatalogCache.filter(function(item) {
    var matchCat = (_devSelectedCat === 'todos') || (item.category === _devSelectedCat);
    var matchSearch = !q || 
      item.title.toLowerCase().includes(q) || 
      item.path.toLowerCase().includes(q) || 
      item.description.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q) ||
      item.method.toLowerCase().includes(q);
    return matchCat && matchSearch;
  });

  if (filtered.length === 0) {
    container.innerHTML = '<div class="empty-state" style="padding:2rem;"><i class="fa-solid fa-filter"></i><p>Nenhuma rota encontrada para o filtro atual.</p></div>';
    return;
  }

  var methodColors = {
    'GET': { bg: 'rgba(56,189,248,0.15)', border: '#38bdf8', text: '#38bdf8' },
    'POST': { bg: 'rgba(34,197,94,0.15)', border: '#22c55e', text: '#22c55e' },
    'PUT': { bg: 'rgba(245,158,11,0.15)', border: '#f59e0b', text: '#f59e0b' },
    'DELETE': { bg: 'rgba(239,68,68,0.15)', border: '#ef4444', text: '#ef4444' },
    'PATCH': { bg: 'rgba(168,85,247,0.15)', border: '#a855f7', text: '#a855f7' },
    'SOCKET (EMIT)': { bg: 'rgba(236,72,153,0.15)', border: '#ec4899', text: '#ec4899' }
  };

  container.innerHTML = filtered.map(function(item, idx) {
    var c = methodColors[item.method] || { bg: '#334155', border: '#64748b', text: '#fff' };
    var cardId = 'dev-card-' + idx;

    return '<div style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:12px; padding:1.2rem; transition:border-color 0.2s;" onmouseover="this.style.borderColor=\'#00f2fe\'" onmouseout="this.style.borderColor=\'var(--border-color)\'">' +
      '<div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:10px; margin-bottom:8px;">' +
        '<div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">' +
          '<span style="background:' + c.bg + '; border:1px solid ' + c.border + '; color:' + c.text + '; font-weight:800; font-family:monospace; font-size:0.75rem; padding:3px 8px; border-radius:6px;">' + esc(item.method) + '</span>' +
          '<code style="font-size:0.95rem; font-weight:700; color:#fff; background:var(--bg-tertiary); padding:3px 8px; border-radius:6px;">' + esc(item.path) + '</code>' +
          '<span style="font-size:0.75rem; color:var(--text-muted); background:rgba(255,255,255,0.05); padding:2px 8px; border-radius:12px;">' + esc(item.category) + '</span>' +
        '</div>' +
        '<div style="display:flex; gap:6px;">' +
          (item.method.startsWith('SOCKET') ? '' : '<button class="btn btn-sm" onclick="window.abrirNoSandboxByIndex(' + idx + ')" style="background:#0284c7; color:#fff; font-weight:700; font-size:0.75rem;"><i class="fa-solid fa-play"></i> Testar no Sandbox</button>') +
        '</div>' +
      '</div>' +

      '<h4 style="margin:0 0 4px 0; font-size:0.95rem; color:#f8fafc;">' + esc(item.title) + '</h4>' +
      '<p style="margin:0 0 10px 0; font-size:0.82rem; color:var(--text-muted); line-height:1.4;">' + esc(item.description) + '</p>' +

      '<div style="display:flex; gap:16px; font-size:0.75rem; color:#94a3b8; margin-bottom:8px; flex-wrap:wrap;">' +
        '<span><strong style="color:#e2e8f0;">Autenticação:</strong> ' + esc(item.auth) + '</span>' +
        (item.headers && Object.keys(item.headers).length > 0 ? '<span><strong style="color:#e2e8f0;">Headers Requeridos:</strong> ' + esc(Object.keys(item.headers).join(', ')) + '</span>' : '') +
      '</div>' +

      '<details style="font-size:0.78rem; margin-top:8px;">' +
        '<summary style="cursor:pointer; color:#38bdf8; font-weight:600;"><i class="fa-solid fa-code"></i> Ver Exemplo de Payload & Resposta</summary>' +
        '<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:10px; margin-top:8px;">' +
          '<div>' +
            '<span style="font-size:0.7rem; color:var(--text-muted); font-weight:700;">Exemplo de Request (Body):</span>' +
            '<pre style="background:#090d16; border:1px solid var(--border-color); border-radius:8px; padding:8px; color:#22c55e; margin:4px 0 0 0; overflow-x:auto;">' + esc(item.sampleBody ? JSON.stringify(item.sampleBody, null, 2) : 'null (sem corpo)') + '</pre>' +
          '</div>' +
          '<div>' +
            '<span style="font-size:0.7rem; color:var(--text-muted); font-weight:700;">Exemplo de Response (200 OK):</span>' +
            '<pre style="background:#090d16; border:1px solid var(--border-color); border-radius:8px; padding:8px; color:#38bdf8; margin:4px 0 0 0; overflow-x:auto;">' + esc(item.sampleResponse ? JSON.stringify(item.sampleResponse, null, 2) : '{}') + '</pre>' +
          '</div>' +
        '</div>' +
      '</details>' +
    '</div>';
  }).join('');
};

window.abrirNoSandboxByIndex = function(idx) {
  var item = _devCatalogCache[idx];
  if (!item) return;

  window.switchDevHubTab('sandbox');
  document.getElementById('dev-sb-method').value = item.method;
  document.getElementById('dev-sb-url').value = item.path.replace(':id', '1').replace(':txid', 'CHEF_EXEMPLO').replace(':numero', '1');

  var headers = Object.assign({}, item.headers || {});
  if (item.auth && item.auth.includes('x-suporte-token') && suporteToken) {
    headers['x-suporte-token'] = suporteToken;
  }
  document.getElementById('dev-sb-headers').value = JSON.stringify(headers, null, 2);
  document.getElementById('dev-sb-body').value = item.sampleBody ? JSON.stringify(item.sampleBody, null, 2) : '';
  showToast('Endpoint carregado no Sandbox!', 'success');
};

// ── 2. SANDBOX & CONSOLE DE TESTES ──

window.aplicarPresetSandbox = function(key) {
  if (!key) return;
  var presets = {
    'get_restaurantes': { method: 'GET', url: '/api/suporte/restaurantes', body: '' },
    'get_catalog': { method: 'GET', url: '/api/dev/catalog', body: '' },
    'get_modules': { method: 'GET', url: '/api/modules/all', body: '' },
    'get_caixa_status': { method: 'GET', url: '/api/caixa/status', body: '' },
    'post_pix': { method: 'POST', url: '/api/pix/gerar', body: JSON.stringify({ valor: 45.00, descricao: 'Teste Sandbox Dev' }, null, 2) },
    'post_pedido': { method: 'POST', url: '/api/pedidos', body: JSON.stringify({ tipo: 'balcao', cliente: 'Cliente Teste', itens: [{ produto_id: 1, quantidade: 1 }] }, null, 2) },
    'post_reload': { method: 'POST', url: '/api/modules/reload', body: '{}' }
  };

  var p = presets[key];
  if (!p) return;

  document.getElementById('dev-sb-method').value = p.method;
  document.getElementById('dev-sb-url').value = p.url;
  document.getElementById('dev-sb-body').value = p.body;
  window.injetarAuthHeadersSandbox();
};

window.injetarAuthHeadersSandbox = function() {
  var headers = { 'Content-Type': 'application/json' };
  if (suporteToken) {
    headers['x-suporte-token'] = suporteToken;
  }
  document.getElementById('dev-sb-headers').value = JSON.stringify(headers, null, 2);
};

window.formatarJsonBodySandbox = function() {
  var bodyEl = document.getElementById('dev-sb-body');
  if (!bodyEl || !bodyEl.value.trim()) return;
  try {
    var parsed = JSON.parse(bodyEl.value);
    bodyEl.value = JSON.stringify(parsed, null, 2);
  } catch (e) {
    alert('JSON Inválido: ' + e.message);
  }
};

window.limparSandbox = function() {
  document.getElementById('dev-sb-method').value = 'GET';
  document.getElementById('dev-sb-url').value = '/api/dev/catalog';
  document.getElementById('dev-sb-headers').value = '{"Content-Type": "application/json"}';
  document.getElementById('dev-sb-body').value = '';
  document.getElementById('dev-sb-res-status').textContent = 'Aguardando';
  document.getElementById('dev-sb-res-status').style.background = '#334155';
  document.getElementById('dev-sb-res-status').style.color = '#94a3b8';
  document.getElementById('dev-sb-res-time').textContent = '-- ms';
  document.getElementById('dev-sb-res-output').textContent = '// Console limpo.';
  document.getElementById('dev-sb-res-headers').textContent = '';
};

window.executarChamadaSandbox = async function() {
  var btn = document.getElementById('btn-run-sandbox');
  var method = document.getElementById('dev-sb-method').value;
  var url = document.getElementById('dev-sb-url').value.trim();
  var tenantId = document.getElementById('dev-sb-tenant').value;
  var headersRaw = document.getElementById('dev-sb-headers').value.trim();
  var bodyRaw = document.getElementById('dev-sb-body').value.trim();

  if (!url) return alert('Informe a URL / Rota a ser executada.');

  var headers = {};
  if (headersRaw) {
    try { headers = JSON.parse(headersRaw); } catch(e) { return alert('Headers JSON inválido: ' + e.message); }
  }

  var body = null;
  if (bodyRaw && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    try { body = JSON.parse(bodyRaw); } catch(e) { return alert('Body JSON inválido: ' + e.message); }
  }

  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Executando...';

  document.getElementById('dev-sb-res-status').textContent = 'Enviando...';
  document.getElementById('dev-sb-res-time').textContent = '...';

  try {
    var res = await fetch('/api/dev/execute-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: method,
        url: url,
        headers: headers,
        body: body,
        tenantId: tenantId || null
      })
    });

    var data = await res.json();
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-play"></i> Enviar Requisição';

    var statusBadge = document.getElementById('dev-sb-res-status');
    var timeBadge = document.getElementById('dev-sb-res-time');
    var outputEl = document.getElementById('dev-sb-res-output');
    var headersEl = document.getElementById('dev-sb-res-headers');

    timeBadge.textContent = (data.timeMs || 0) + ' ms';

    var code = data.statusCode || 200;
    statusBadge.textContent = code + ' ' + (data.statusText || '');
    if (code >= 200 && code < 300) {
      statusBadge.style.background = 'rgba(34,197,94,0.2)';
      statusBadge.style.color = '#22c55e';
    } else if (code >= 400 && code < 500) {
      statusBadge.style.background = 'rgba(245,158,11,0.2)';
      statusBadge.style.color = '#f59e0b';
    } else {
      statusBadge.style.background = 'rgba(239,68,68,0.2)';
      statusBadge.style.color = '#ef4444';
    }

    var bodyDisplay = data.data !== undefined ? data.data : data;
    outputEl.textContent = (typeof bodyDisplay === 'object') ? JSON.stringify(bodyDisplay, null, 2) : String(bodyDisplay);
    headersEl.textContent = JSON.stringify(data.headers || {}, null, 2);

  } catch (err) {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-play"></i> Enviar Requisição';
    document.getElementById('dev-sb-res-status').textContent = 'Erro de Conexão';
    document.getElementById('dev-sb-res-status').style.background = 'rgba(239,68,68,0.2)';
    document.getElementById('dev-sb-res-status').style.color = '#ef4444';
    document.getElementById('dev-sb-res-output').textContent = 'Erro: ' + err.message;
  }
};

window.copiarRespostaSandbox = function() {
  var text = document.getElementById('dev-sb-res-output')?.textContent;
  if (text) {
    navigator.clipboard.writeText(text).then(function() {
      showToast('Payload copiado para a área de transferência!', 'success');
    });
  }
};

// ── 3. SCAFFOLDER DE PLUGINS & MÓDULOS ──

window.carregarTemplatesDev = async function() {
  var grid = document.getElementById('dev-templates-grid');
  if (!grid) return;

  try {
    var res = await fetch('/api/dev/templates');
    var data = await res.json();
    if (!data.sucesso || !Array.isArray(data.templates)) return;

    _devTemplatesCache = data.templates;

    grid.innerHTML = data.templates.map(function(t) {
      return '<div style="background:var(--bg-tertiary); border:1px solid var(--border-color); border-radius:10px; padding:12px; cursor:pointer; transition:all 0.2s;" onclick="selecionarTemplateScaffold(\'' + esc(t.templateKey) + '\')" onmouseover="this.style.borderColor=\'#fc4b15\';this.style.transform=\'translateY(-2px)\'" onmouseout="this.style.borderColor=\'var(--border-color)\';this.style.transform=\'none\'">' +
        '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">' +
          '<strong style="color:#fff; font-size:0.85rem;"><i class="fa-solid fa-cube" style="color:#fc4b15;"></i> ' + esc(t.name) + '</strong>' +
          '<span class="badge" style="font-size:0.65rem;">Tier ' + t.tier + '</span>' +
        '</div>' +
        '<p style="font-size:0.75rem; color:var(--text-muted); margin:0 0 8px 0; line-height:1.3;">' + esc(t.description) + '</p>' +
        '<div style="font-size:0.7rem; color:#38bdf8; font-weight:700;"><i class="fa-solid fa-arrow-right"></i> Usar este Arquétipo</div>' +
      '</div>';
    }).join('');

    // Seleciona o primeiro por padrão
    if (data.templates.length > 0 && !_devActiveTemplate) {
      window.selecionarTemplateScaffold(data.templates[0].templateKey);
    }
  } catch(e) {
    console.warn('Erro ao carregar templates dev:', e.message);
  }
};

window.selecionarTemplateScaffold = function(key) {
  var t = _devTemplatesCache.find(function(item) { return item.templateKey === key; });
  if (!t) return;

  _devActiveTemplate = t;
  document.getElementById('scaffold-id').value = t.id;
  document.getElementById('scaffold-nome').value = t.name;
  document.getElementById('scaffold-cat').value = t.category;
  document.getElementById('scaffold-tier').value = String(t.tier || 2);
  document.getElementById('scaffold-targets').value = (t.targets || ['caixa_v11']).join(', ');
  document.getElementById('scaffold-desc').value = t.description;

  window.atualizarScaffoldPreview();
  showToast('Arquétipo [' + t.name + '] carregado no formulário!', 'success');
};

window.atualizarScaffoldPreview = function() {
  var id = document.getElementById('scaffold-id').value.trim() || 'meu-modulo';
  var name = document.getElementById('scaffold-nome').value.trim() || 'Meu Novo Módulo';
  var cat = document.getElementById('scaffold-cat').value;
  var tier = parseInt(document.getElementById('scaffold-tier').value, 10) || 2;
  var targets = document.getElementById('scaffold-targets').value.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
  var desc = document.getElementById('scaffold-desc').value.trim() || 'Módulo operacional plug-and-play';

  _devScaffoldFiles = {
    'json': JSON.stringify({
      id: id,
      name: name,
      version: '1.0.0',
      author: 'Chef Suporte Dev Team',
      description: desc,
      category: cat,
      icon: 'ph-puzzle-piece',
      enabled: true,
      tier: tier,
      targets: targets,
      hooks: { server: 'index.js', client: 'client.js', widget: 'widget.js', style: 'style.css' }
    }, null, 2),

    'backend': `/**
 * Backend do Módulo: ${name} (${id})
 */
module.exports = function ({ app, db, masterDb, io, log }) {
  log('⚡ [${id}] Backend do módulo ${name} inicializado.');

  app.get('/api/modulo/${id}/status', (req, res) => {
    res.json({
      modulo: '${id}',
      nome: '${name}',
      status: 'online',
      tier: ${tier},
      timestamp: Date.now()
    });
  });
};`,

    'widget': `/**
 * Widget do Módulo: ${name} (${id})
 */
(function () {
  if (!window.ChefModules) window.ChefModules = { register: function(m) { (window._chefModQueue = window._chefModQueue || []).push(m); } };

  window.ChefModules.register({
    id: '${id}',
    name: '${name}',
    category: '${cat}',
    icon: 'ph-puzzle-piece',
    defaultSize: 'sz-m',
    render: function (container) {
      container.innerHTML = \`
        <div style="background:#161a2b;border:1px solid #2a2d3e;border-radius:12px;padding:14px;">
          <strong style="color:#00f2fe;"><i class="ph ph-puzzle-piece"></i> ${name}</strong>
          <p style="font-size:0.8rem;color:#94a3b8;margin:6px 0 0 0;">${desc}</p>
        </div>
      \`;
    }
  });
})();`,

    'style': `/* Estilo customizado do módulo ${name} */
.mod-${id} {
  background: #161a2b;
  border-radius: 12px;
}`
  };

  var previewEl = document.getElementById('scaffold-code-preview');
  if (previewEl) {
    previewEl.value = _devScaffoldFiles[_devActiveScaffoldFileType] || '';
  }
};

window.trocarAbaArquivoScaffold = function(fileType) {
  _devActiveScaffoldFileType = fileType;
  var types = ['json', 'backend', 'widget', 'style'];
  types.forEach(function(t) {
    var btn = document.getElementById('btn-tab-file-' + t);
    if (btn) {
      if (t === fileType) {
        btn.style.background = '#0284c7';
        btn.style.color = '#fff';
      } else {
        btn.style.background = 'var(--bg-tertiary)';
        btn.style.color = 'var(--text-primary)';
      }
    }
  });

  var previewEl = document.getElementById('scaffold-code-preview');
  if (previewEl && _devScaffoldFiles[fileType]) {
    previewEl.value = _devScaffoldFiles[fileType];
  }
};

window.salvarScaffoldNoDisco = async function() {
  var id = document.getElementById('scaffold-id').value.trim();
  var name = document.getElementById('scaffold-nome').value.trim();
  var category = document.getElementById('scaffold-cat').value;
  var tier = document.getElementById('scaffold-tier').value;
  var targets = document.getElementById('scaffold-targets').value.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
  var description = document.getElementById('scaffold-desc').value.trim();
  var templateKey = _devActiveTemplate ? _devActiveTemplate.templateKey : 'widget_caixa';
  var customCode = (_devActiveScaffoldFileType === 'widget') ? document.getElementById('scaffold-code-preview').value : null;

  if (!id || !name) return alert('Preencha o ID e o Nome do módulo.');

  try {
    var res = await fetch('/api/dev/scaffold', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        templateKey: templateKey,
        id: id,
        name: name,
        category: category,
        tier: tier,
        targets: targets,
        description: description,
        customCode: customCode
      })
    });

    var data = await res.json();
    if (data.sucesso) {
      showToast('🚀 Módulo criado e publicado com sucesso em plugins/' + data.id, 'success');
      alert('✅ Módulo [' + data.name + '] scaffolded e pronto!\nArquivos gerados: ' + (data.filesCreated || []).join(', ') + '\n\nExecutando Hot-Reload automático...');
      window.executarHotReloadPlugins();
      if (typeof carregarModulosSuporte === 'function') carregarModulosSuporte();
    } else {
      alert('Erro ao criar módulo: ' + (data.error || 'Falha no servidor.'));
    }
  } catch (err) {
    alert('Erro de conexão ao salvar módulo: ' + err.message);
  }
};

window.executarHotReloadPlugins = async function() {
  try {
    var res = await fetch('/api/modules/reload', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    var data = await res.json();
    if (data.sucesso) {
      showToast('⚡ Hot-Reload efetuado! Total: ' + data.total_ativos + ' módulos ativos (' + data.novos_carregados + ' novos)', 'success');
      if (typeof carregarModulosSuporte === 'function') carregarModulosSuporte();
      window.carregarCatalogoDev();
    } else {
      showToast('Erro no hot-reload: ' + (data.error || 'Falha'), 'danger');
    }
  } catch(e) {
    showToast('Erro de rede no hot-reload: ' + e.message, 'danger');
  }
};

