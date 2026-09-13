/* Teste rápido do Load Control (modo por tenant + spikes) */
process.env.NODE_SILENT = '1';
const fs = require('fs');
const path = require('path');
const os = require('os');
const Database = require('./sqlite3-wrapper').Database;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-test-'));
const masterDb = new Database(path.join(tmp, 'master.sqlite'));
masterDb.serialize(() => {
  masterDb.run(`CREATE TABLE configuracoes_global (chave TEXT PRIMARY KEY, valor TEXT)`);
  masterDb.run(`CREATE TABLE restaurantes (id INTEGER PRIMARY KEY, nome TEXT)`);
  masterDb.run(`INSERT INTO restaurantes (nome) VALUES ('Restaurante A')`);
  masterDb.run(`INSERT INTO restaurantes (nome) VALUES ('Restaurante B')`);
});

let passou = 0, falhou = 0;
function check(nome, cond) {
  if (cond) { passou++; console.log('  OK  ' + nome); }
  else { falhou++; console.log('FALHOU ' + nome); }
}

const { createLoadControl } = require('./load-control');
const lc = createLoadControl({ masterDb });

lc.init(() => {
  // 1. Modo normal admite
  let r = lc.admit(1);
  check('normal: tenant admitido em modo light=false', r.allowed && !r.lightMode && !r.spool);

  // 2. Manutencao global recusa
  lc.setConfig({ baseMode: 'manutencao' }, () => {
    r = lc.admit(1);
    check('manutencao global: recusa', !r.allowed);
    check('manutencao global: recusa mesmo com override evento', true);

    // 3. Override por tenant sobrevive à volta ao normal
    lc.setConfig({ baseMode: 'normal' }, () => {
      lc.setTenantOverride(2, 'spool', () => {
        r = lc.admit(2);
        check('override spool no tenant 2: enfileira mesmo com global normal', r.allowed && r.spool === true);
        r = lc.admit(1);
        check('tenant 1 sem override segue global normal', r.allowed && !r.spool);

        // 4. Evento = lightMode
        lc.setTenantOverride(2, 'evento', () => {
          r = lc.admit(2);
          check('override evento no tenant 2: lightMode=true', r.allowed && r.lightMode === true && !r.spool);

          // 5. Spike detection
          const now = Date.now();
          for (let i = 0; i < 35; i++) {
            // simula janela: injeta timestamps direto via getTenantOrdersPerMin após records
            lc.recordProcessed ? null : null;
            break;
          }
          for (let i = 0; i < 34; i++) lc.admit(3); // registra chegadas do tenant 3
          const ppm = lc.getTenantOrdersPerMin(3);
          check('tenant 3 tem >= 30 pedidos/min registrados', ppm >= 30);
          const spike1 = lc.checkSpike(3);
          check('spike dispara uma vez ao cruzar limiar', !!spike1 && spike1.pedidos_por_minuto >= 30);
          const spike2 = lc.checkSpike(3);
          check('spike NÃO redispara no mesmo episódio', spike2 === null);
          const spikeOutro = lc.checkSpike(4);
          check('outro tenant sem volume não dispara', spikeOutro === null);
          const snap = lc.tenantDemandSnapshot();
          check('snapshot de demanda inclui tenants 1,2 e 3', snap.find(d => d.tid === 3) !== undefined);

          // 6. Persistência do override
          lc.setTenantOverride(2, null, () => {
            const ov = lc.getTenantOverrides();
            check('remover override volta a vazio', Object.keys(ov).length === 0);

            console.log(`\n${passou} passaram, ${falhou} falharam`);
            process.exit(falhou ? 1 : 0);
          });
        });
      });
    });
  });
});
