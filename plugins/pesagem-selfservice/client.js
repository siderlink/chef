/**
 * Client integration for pesagem-selfservice
 */
(function () {
  if (!window.ChefModules) return;

  ChefModules.register({
    id: 'pesagem-selfservice',
    name: 'Pesagem Automática & Buffet',
    icon: 'ph-scales'
  }, ({ registerNavbarAction }) => {
    // 1. Totem Balança (Autoatendimento)
    registerNavbarAction({
      id: 'navbar_totem_pesagem',
      label: 'Totem Balança',
      icon: 'ph-scales',
      onClick() {
        window.open('/plugins/pesagem-selfservice/totem', '_blank');
      }
    });

    // 2. Painel de Relatórios & Análise de Buffet
    registerNavbarAction({
      id: 'navbar_relatorios_pesagem',
      label: 'Relatórios Buffet',
      icon: 'ph-chart-bar',
      onClick() {
        window.open('/plugins/pesagem-selfservice/relatorio', '_blank');
      }
    });

    // 3. Área do Cliente (Self-Checkout no Celular)
    registerNavbarAction({
      id: 'navbar_area_cliente_comanda',
      label: 'Área Cliente',
      icon: 'ph-device-mobile-camera',
      onClick() {
        window.open('/cliente-comanda', '_blank');
      }
    });
  });
})();
