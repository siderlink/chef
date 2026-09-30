const fs = require('fs');
const js = fs.readFileSync('super-admin.js', 'utf8');

const checkList = [
  'switchTab', 'carregarRestaurantes', 'enviarCertificado', 'carregarUsuariosRecovery',
  'resetarCredenciais', 'carregarClientes', 'popularAlvosTerminal', 'executarComando',
  'limparOutput', 'salvarTunnelConfig', 'testarTunnel', 'pararTunnel',
  'abrirModalNovaMetaAfiliado', 'abrirModalNovoAfiliado', 'filtrarTabelaAfiliados',
  'carregarConfigSeguranca', 'salvarConfigSeguranca', 'adicionarIpBlacklist',
  'adicionarFaq', 'salvarSiteConteudo', 'salvarSiteBlocos', 'salvarSiteSEO',
  'salvarSiteIndexacao', 'adicionarPlano', 'salvarSitePlanos', 'salvarSiteGateways',
  'salvarTrackingConfig', 'gerarCopyAnuncio', 'exportarAudienciaCSV', 'copiarTextoAnuncio',
  'salvarSiteDesign', 'salvarSiteConsultor', 'criarUsuarioNovo', 'fecharModalAfiliado',
  'salvarAfiliado', 'fecharModalAfiliadoDetalhes', 'fecharModalNovaMetaAfiliado',
  'salvarNovaMetaAfiliado', 'confirmarPagamentoPixBonificacao',
  'carregarDashboard', 'carregarUsuarios', 'carregarCerts', 'carregarConfig',
  'carregarSupabase', 'carregarInfraCloud', 'carregarTuneis',
  'abrirModalNovoRestaurante', 'abrirModalNovoUsuario',
  'filtrarRestaurantes', 'filtrarUsuarios', 'filtrarClientes',
  'exportarUsuariosCSV', 'exportarRestaurantesCSV', 'exportarClientesCSV',
  'fecharModalPagarBonificacao', 'abrirModalSuporte', 'abrirModalNovoSuporte',
  'editarSuporte', 'excluirSuporte', 'atribuirRestaurantes', 'abrirPerfilCliente',
  'editarRestaurante', 'toggleBloquearRest', 'excluirRestaurante',
  'editarUsuario', 'excluirUsuario'
];

const missing = [];
checkList.forEach(fn => {
  const hasFn = js.includes('function ' + fn) || js.includes(fn + ' =');
  if (!hasFn) missing.push(fn);
});

console.log('Missing functions from super-admin.js:', missing);
