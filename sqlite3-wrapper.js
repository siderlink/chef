const Database = require('better-sqlite3');

function isSqliteBusyError(err) {
  if (!err) return false;
  if (err.code === 'SQLITE_BUSY' || err.code === 'SQLITE_LOCKED') return true;
  const msg = String(err.message || '').toLowerCase();
  return msg.includes('busy') || msg.includes('locked');
}

function runWithRetry(fn, maxRetries = 6, baseDelay = 25) {
  let attempt = 0;
  while (true) {
    try {
      return fn();
    } catch (err) {
      if (isSqliteBusyError(err) && attempt < maxRetries) {
        attempt++;
        const jitter = Math.floor(Math.random() * 20);
        const delay = Math.floor(baseDelay * Math.pow(1.7, attempt)) + jitter;
        const until = Date.now() + delay;
        while (Date.now() < until) {
          // Micro-sleep síncrono para liberar a trava do SQLite no processo
        }
        continue;
      }
      throw err;
    }
  }
}

class SQLite3Wrapper {
  constructor(filename, mode, callback) {
    if (typeof mode === 'function') {
      callback = mode;
      mode = null;
    }
    
    this.stmtCache = new Map();

    try {
      this.db = new Database(filename, { timeout: 10000 });
      // Otimizações Ultra-Resilientes para Produção Concorrente
      try {
        this.db.pragma('journal_mode = WAL');
        this.db.pragma('synchronous = NORMAL');
        this.db.pragma('busy_timeout = 10000');
        this.db.pragma('temp_store = MEMORY');
        this.db.pragma('cache_size = -64000');
      } catch (pragmaErr) {
        console.warn('[sqlite3-wrapper] Aviso ao aplicar pragmas:', pragmaErr.message);
      }
      
      if (typeof callback === 'function') {
        process.nextTick(() => callback(null));
      }
    } catch (err) {
      if (typeof callback === 'function') {
        process.nextTick(() => callback(err));
      } else {
        throw err;
      }
    }
  }

  _getStatement(sql) {
    let stmt = this.stmtCache.get(sql);
    if (!stmt) {
      stmt = runWithRetry(() => this.db.prepare(sql));
      // Limite do cache de statements preparados para evitar vazamento de memória
      if (this.stmtCache.size < 500) {
        this.stmtCache.set(sql, stmt);
      }
    }
    return stmt;
  }

  _parseArgs(args) {
    while (args.length > 1 && args[args.length - 1] === undefined) {
      args.pop();
    }
    let sql = args[0];
    let params = [];
    let callback = null;

    if (args.length > 1) {
      if (typeof args[args.length - 1] === 'function') {
        callback = args.pop();
      }
    }

    if (args.length === 2 && Array.isArray(args[1])) {
      params = args[1];
    } else if (args.length > 1) {
      params = args.slice(1);
    }

    return { sql, params, callback };
  }

  run(...args) {
    const { sql, params, callback } = this._parseArgs(args);
    try {
      const info = runWithRetry(() => {
        const stmt = this._getStatement(sql);
        return stmt.run(params);
      });
      if (typeof callback === 'function') {
        const context = {
          lastID: info.lastInsertRowid,
          changes: info.changes
        };
        process.nextTick(() => callback.call(context, null));
      }
    } catch (err) {
      if (typeof callback === 'function') {
        process.nextTick(() => callback(err));
      } else {
        throw err;
      }
    }
    return this;
  }

  get(...args) {
    const { sql, params, callback } = this._parseArgs(args);
    try {
      const row = runWithRetry(() => {
        const stmt = this._getStatement(sql);
        return stmt.get(params);
      });
      if (typeof callback === 'function') {
        process.nextTick(() => callback(null, row));
      }
    } catch (err) {
      if (typeof callback === 'function') {
        process.nextTick(() => callback(err));
      } else {
        throw err;
      }
    }
    return this;
  }

  all(...args) {
    const { sql, params, callback } = this._parseArgs(args);
    try {
      const rows = runWithRetry(() => {
        const stmt = this._getStatement(sql);
        return stmt.all(params);
      });
      if (typeof callback === 'function') {
        process.nextTick(() => callback(null, rows));
      }
    } catch (err) {
      if (typeof callback === 'function') {
        process.nextTick(() => callback(err));
      } else {
        throw err;
      }
    }
    return this;
  }

  each(...args) {
    const { sql, params, callback } = this._parseArgs(args);
    try {
      runWithRetry(() => {
        const stmt = this._getStatement(sql);
        const iterator = stmt.iterate(params);
        for (const row of iterator) {
          if (typeof callback === 'function') {
            callback(null, row); 
          }
        }
      });
    } catch (err) {
      if (typeof callback === 'function') {
        callback(err);
      } else {
        throw err;
      }
    }
    return this;
  }

  exec(sql, callback) {
    try {
      runWithRetry(() => {
        this.db.exec(sql);
      });
      if (typeof callback === 'function') process.nextTick(() => callback(null));
    } catch (err) {
      if (typeof callback === 'function') process.nextTick(() => callback(err));
      else throw err;
    }
    return this;
  }

  serialize(callback) {
    if (typeof callback === 'function') callback();
    return this;
  }

  parallelize(callback) {
    if (typeof callback === 'function') callback();
    return this;
  }

  close(callback) {
    try {
      this.stmtCache.clear();
      this.db.close();
      if (typeof callback === 'function') process.nextTick(() => callback(null));
    } catch (err) {
      if (typeof callback === 'function') process.nextTick(() => callback(err));
      else throw err;
    }
  }
}

module.exports = {
  Database: SQLite3Wrapper,
  verbose: function() { return this; }
};
