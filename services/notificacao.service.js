/**
 * services/notificacao.service.js
 * Serviço centralizado de Notificações em Tempo Real (Socket.io Rooms & Web Push).
 *
 * Garante que:
 * 1. Todos os eventos sejam enviados estritamente para a Room do respectivo restaurante (ex: 'restaurante_123').
 * 2. Eventos administrativos sejam direcionados para a Room 'super_admin'.
 * 3. Evita tráfego broadcast global desnecessário entre estabelecimentos diferentes (privacidade & escala).
 */

'use strict';

/**
 * Emite evento em tempo real para todos os clientes conectados do restaurante.
 * @param {Object} io - Instância do Socket.io
 * @param {number|string} restauranteId - ID do estabelecimento
 * @param {string} event - Nome do evento Socket
 * @param {Object|Array} [payload] - Dados a transmitir
 */
function notificarRestaurante(io, restauranteId, event, payload = {}) {
  if (!io) return;
  const tid = parseInt(restauranteId, 10);
  if (tid && tid > 0) {
    const room = 'restaurante_' + tid;
    io.to(room).emit(event, payload);
  } else {
    io.emit(event, payload);
  }
}

/**
 * Emite evento exclusivo para o painel Super Admin.
 * @param {Object} io - Instância do Socket.io
 * @param {string} event - Nome do evento
 * @param {Object} [payload] - Dados
 */
function notificarSuperAdmin(io, event, payload = {}) {
  if (!io) return;
  io.to('super_admin').emit(event, payload);
}

/**
 * Notifica atualização de pedidos na cozinha (KDS) e salão (Garçom/Caixa).
 */
function notificarPedidosAtualizados(io, restauranteId, pedidos = []) {
  notificarRestaurante(io, restauranteId, 'pedidos_atualizados', pedidos);
}

/**
 * Notifica atualização do mapa de mesas.
 */
function notificarMesasAtualizadas(io, restauranteId, mesas = []) {
  notificarRestaurante(io, restauranteId, 'mesas_atualizadas', mesas);
}

/**
 * Notifica atualização das configurações da loja.
 */
function notificarConfiguracoesAtualizadas(io, restauranteId) {
  notificarRestaurante(io, restauranteId, 'configuracoes_atualizadas');
}

module.exports = {
  notificarRestaurante,
  notificarSuperAdmin,
  notificarPedidosAtualizados,
  notificarMesasAtualizadas,
  notificarConfiguracoesAtualizadas
};
