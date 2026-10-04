/**
 * src/utils/maintenance-cleaner.js
 * Rotina automatizada de manutenção do sistema Chef Cozinha:
 * - Purga arquivos do spool de impressão (spool_impressao/) com mais de 3 dias
 * - Rotaciona e compacta logs grandes (> 10 MB) para não saturar o disco
 * - Remove arquivos temporários (.TMP, .tmp) abandonados
 */
const fs = require('fs');
const path = require('path');

function purgeSpoolFiles(baseDir, maxAgeDays = 3) {
  try {
    const spoolDir = path.join(baseDir, 'spool_impressao');
    if (!fs.existsSync(spoolDir)) return 0;

    const now = Date.now();
    const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
    const files = fs.readdirSync(spoolDir);
    let purged = 0;

    for (const f of files) {
      if (!f.endsWith('.txt')) continue;
      const fullPath = path.join(spoolDir, f);
      try {
        const stats = fs.statSync(fullPath);
        if (now - stats.mtimeMs > maxAgeMs) {
          fs.unlinkSync(fullPath);
          purged++;
        }
      } catch (_) {}
    }
    return purged;
  } catch (err) {
    console.warn('[Maintenance] Erro ao limpar spool_impressao:', err.message);
    return 0;
  }
}

function rotateLargeLogs(baseDir, maxSizeBytes = 10 * 1024 * 1024) {
  try {
    const logFiles = [
      'crash-forensics.log',
      'server.log',
      'server-boot.log',
      'server-prod.log',
      'server-restart.log'
    ];
    let rotated = 0;

    for (const logName of logFiles) {
      const fullPath = path.join(baseDir, logName);
      if (!fs.existsSync(fullPath)) continue;

      try {
        const stats = fs.statSync(fullPath);
        if (stats.size > maxSizeBytes) {
          const oldPath = path.join(baseDir, `${logName}.old`);
          if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
          fs.renameSync(fullPath, oldPath);
          fs.writeFileSync(fullPath, '');
          rotated++;
        }
      } catch (_) {}
    }
    return rotated;
  } catch (err) {
    console.warn('[Maintenance] Erro ao rotacionar logs:', err.message);
    return 0;
  }
}

function cleanTempFiles(baseDir) {
  try {
    const files = fs.readdirSync(baseDir);
    let cleaned = 0;
    for (const f of files) {
      if (f.endsWith('.TMP') || f.endsWith('.tmp')) {
        try {
          fs.unlinkSync(path.join(baseDir, f));
          cleaned++;
        } catch (_) {}
      }
    }
    return cleaned;
  } catch (_) {
    return 0;
  }
}

function runMaintenanceCleanup(baseDir = path.resolve(__dirname, '../..')) {
  const spoolCount = purgeSpoolFiles(baseDir);
  const logCount = rotateLargeLogs(baseDir);
  const tempCount = cleanTempFiles(baseDir);

  if (spoolCount > 0 || logCount > 0 || tempCount > 0) {
    console.log(`[Maintenance] Limpeza concluída: ${spoolCount} spool(s), ${logCount} log(s) rotacionados, ${tempCount} temp(s) removidos.`);
  }
}

function scheduleMaintenance(baseDir, intervalHours = 24) {
  // Executa imediatamente na inicialização
  runMaintenanceCleanup(baseDir);
  // Executa a cada X horas
  const intervalMs = intervalHours * 60 * 60 * 1000;
  const timer = setInterval(() => runMaintenanceCleanup(baseDir), intervalMs);
  if (timer.unref) timer.unref();
}

module.exports = {
  runMaintenanceCleanup,
  scheduleMaintenance,
  purgeSpoolFiles,
  rotateLargeLogs
};
