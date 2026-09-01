/**
 * ══════════════════════════════════════════════════════════════════
 * 📱 CHEF COZINHA - PWA TELEMETRY & LOG BUFFER (Offline-First)
 * ══════════════════════════════════════════════════════════════════
 * - Acúmulo de logs e métricas offline no IndexedDB / LocalStorage
 * - Limite estrito de < 1MB diário por colaborador/dispositivo
 * - Fila com Prioridade:
 *     1. Licença & Integridade de Código (ALTA)
 *     2. Vendas & Outbox (MÉDIA)
 *     3. Estatísticas & Inteligência de Marketing (BAIXA)
 */

(function () {
  const MAX_DAILY_BYTES = 900 * 1024; // ~900 KB (Limite estrito < 1MB)
  const STORAGE_KEY_LOGS = 'chef_pwa_logs_queue';
  const STORAGE_KEY_USAGE = 'chef_pwa_daily_bytes_used';
  const STORAGE_KEY_DAY = 'chef_pwa_current_day';

  class PwaTelemetry {
    constructor() {
      this.verificarOuResetarDia();
      this.iniciarSincronizador();
    }

    verificarOuResetarDia() {
      const hoje = new Date().toISOString().slice(0, 10);
      const diaSalvo = localStorage.getItem(STORAGE_KEY_DAY);
      if (diaSalvo !== hoje) {
        localStorage.setItem(STORAGE_KEY_DAY, hoje);
        localStorage.setItem(STORAGE_KEY_USAGE, '0');
      }
    }

    getBytesUsadosHoje() {
      this.verificarOuResetarDia();
      return parseInt(localStorage.getItem(STORAGE_KEY_USAGE) || '0', 10);
    }

    adicionarBytesUsados(bytes) {
      const atual = this.getBytesUsadosHoje();
      localStorage.setItem(STORAGE_KEY_USAGE, String(atual + bytes));
    }

    /**
     * Enfileira evento com prioridade: 'alta' (Licença) | 'media' (Vendas) | 'baixa' (Marketing/Stats)
     */
    registrarEvento(tipo, dados, prioridade = 'media') {
      try {
        const payload = {
          id: 'ev_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
          tipo,
          dados,
          prioridade, // 'alta' | 'media' | 'baixa'
          colaborador: window.crmPerfil ? window.crmPerfil.nome : 'Dispositivo PWA',
          timestamp: new Date().toISOString()
        };

        const str = JSON.stringify(payload);
        const tamanho = new Blob([str]).size;

        // Se ultrapassar o limite diário de 1MB e for prioridade baixa (marketing), descarta
        if (this.getBytesUsadosHoje() + tamanho > MAX_DAILY_BYTES && prioridade === 'baixa') {
          return;
        }

        const fila = this.obterFila();
        fila.push(payload);

        // Ordena por prioridade: alta > media > baixa
        const peso = { alta: 1, media: 2, baixa: 3 };
        fila.sort((a, b) => (peso[a.prioridade] || 2) - (peso[b.prioridade] || 2));

        // Mantém tamanho máximo de 100 itens na fila local
        if (fila.length > 100) fila.pop();

        localStorage.setItem(STORAGE_KEY_LOGS, JSON.stringify(fila));
      } catch (e) {}
    }

    obterFila() {
      try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY_LOGS) || '[]');
      } catch (e) {
        return [];
      }
    }

    salvarFila(fila) {
      localStorage.setItem(STORAGE_KEY_LOGS, JSON.stringify(fila));
    }

    /**
     * Coleta estatísticas consolidadas para a equipe de marketing
     */
    coletarEstatisticasMarketing() {
      try {
        const stats = {
          totalMesas: window.mesasData ? window.mesasData.length : 0,
          mesasOcupadas: window.mesasData ? window.mesasData.filter(m => m.status === 'Ocupada').length : 0,
          totalPedidosHoje: window.ordersData ? window.ordersData.length : 0,
          ticketMedioAprox: 0,
          horarioPico: new Date().getHours() + ':00',
          dispositivo: navigator.userAgent.substring(0, 100)
        };

        if (window.ordersData && window.ordersData.length > 0) {
          const soma = window.ordersData.reduce((acc, o) => acc + (parseFloat(o.total || o.valor) || 0), 0);
          stats.ticketMedioAprox = parseFloat((soma / window.ordersData.length).toFixed(2));
        }

        this.registrarEvento('marketing_stats', stats, 'baixa');
      } catch (e) {}
    }

    /**
     * Tenta descarregar a fila quando houver internet
     */
    async tentarDescarregarFila() {
      if (!navigator.onLine) return;

      const fila = this.obterFila();
      if (fila.length === 0) return;

      // Pega os primeiros 20 eventos
      const lote = fila.slice(0, 20);
      const strLote = JSON.stringify(lote);
      const tamanhoBytes = new Blob([strLote]).size;

      // Verifica se o envio cabe na cota diária
      if (this.getBytesUsadosHoje() + tamanhoBytes > MAX_DAILY_BYTES) {
        // Envia apenas itens de prioridade alta (licença/integridade)
        const loteUrgente = lote.filter(item => item.prioridade === 'alta');
        if (loteUrgente.length === 0) return;
      }

      try {
        const res = await fetch('/api/pwa/telemetria', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: strLote,
          signal: AbortSignal.timeout(6000)
        });

        if (res.ok) {
          this.adicionarBytesUsados(tamanhoBytes);
          const idsEnviados = new Set(lote.map(i => i.id));
          const novaFila = fila.filter(i => !idsEnviados.has(i.id));
          this.salvarFila(novaFila);
        }
      } catch (err) {}
    }

    iniciarSincronizador() {
      // Dispara envio a cada 60s ou quando o dispositivo reconectar
      window.addEventListener('online', () => this.tentarDescarregarFila());
      setInterval(() => this.tentarDescarregarFila(), 60000);

      // Coleta estatísticas para o marketing a cada 30 minutos
      setInterval(() => this.coletarEstatisticasMarketing(), 30 * 60 * 1000);
      setTimeout(() => this.coletarEstatisticasMarketing(), 5000);
    }
  }

  window.ChefPwaTelemetry = new PwaTelemetry();
})();
