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
        const delay = (baseDelay * Math.pow(2, attempt - 1)) + jitter;
        const sab = new SharedArrayBuffer(4);
        const int32 = new Int32Array(sab);
        Atomics.wait(int32, 0, 0, delay);
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

    if (args.length === 2) {
      if (Array.isArray(args[1])) {
        params = args[1];
      } else if (typeof args[1] === 'object' && args[1] !== null) {
        params = args[1];
      } else {
        params = [args[1]];
      }
    } else if (args.length > 2) {
      params = args.slice(1);
    }

    return { sql, params, callback };
  }

  _handleTransaction(sql, callback) {
    if (typeof sql !== 'string') return false;
    const trimmed = sql.trim().toUpperCase();
    if (trimmed.startsWith('BEGIN') || trimmed.startsWith('SAVEPOINT')) {
      if (this.db && this.db.inTransaction) {
        if (typeof callback === 'function') process.nextTick(() => callback.call({ lastID: 0, changes: 0 }, null));
        return true;
      }
    } else if (trimmed.startsWith('COMMIT') || trimmed.startsWith('RELEASE')) {
      if (this.db && !this.db.inTransaction) {
        if (typeof callback === 'function') process.nextTick(() => callback.call({ lastID: 0, changes: 0 }, null));
        return true;
      }
    } else if (trimmed.startsWith('ROLLBACK')) {
      if (this.db && !this.db.inTransaction) {
        if (typeof callback === 'function') process.nextTick(() => callback.call({ lastID: 0, changes: 0 }, null));
        return true;
      }
    }
    return false;
  }

  _executeSafe(stmt, method, params) {
    return runWithRetry(() => {
      try {
        return stmt[method](params);
      } catch (err) {
        if (err instanceof RangeError && err.message.includes('Too many parameter values') && Array.isArray(params)) {
          const p = params.slice();
          while (p.length > 0) {
            p.pop();
            try {
              return stmt[method](p);
            } catch (_) {}
          }
        }
        throw err;
      }
    });
  }

  run(...args) {
    const { sql, params, callback } = this._parseArgs(args);
    if (this._handleTransaction(sql, callback)) return this;

    try {
      const stmt = this._getStatement(sql);
      const info = this._executeSafe(stmt, 'run', params);
      if (typeof callback === 'function') {
        const context = {
          lastID: info ? info.lastInsertRowid : undefined,
          changes: info ? info.changes : 0
        };
        process.nextTick(() => callback.call(context, null));
      }
    } catch (err) {
      if (typeof callback === 'function') {
        process.nextTick(() => callback(err));
      } else {
        console.error('[sqlite3-wrapper] Erro não capturado em run() sem callback:', err.message, sql ? String(sql).substring(0, 100) : '');
      }
    }
    return this;
  }

  get(...args) {
    const { sql, params, callback } = this._parseArgs(args);
    try {
      const stmt = this._getStatement(sql);
      const row = this._executeSafe(stmt, 'get', params);
      if (typeof callback === 'function') {
        process.nextTick(() => callback(null, row));
      }
    } catch (err) {
      if (typeof callback === 'function') {
        process.nextTick(() => callback(err));
      } else {
        console.error('[sqlite3-wrapper] Erro não capturado em get() sem callback:', err.message, sql ? String(sql).substring(0, 100) : '');
      }
    }
    return this;
  }

  all(...args) {
    const { sql, params, callback } = this._parseArgs(args);
    try {
      const stmt = this._getStatement(sql);
      const rows = this._executeSafe(stmt, 'all', params);
      if (typeof callback === 'function') {
        process.nextTick(() => callback(null, rows));
      }
    } catch (err) {
      if (typeof callback === 'function') {
        process.nextTick(() => callback(err));
      } else {
        console.error('[sqlite3-wrapper] Erro não capturado em all() sem callback:', err.message, sql ? String(sql).substring(0, 100) : '');
      }
    }
    return this;
  }

  each(...args) {
    const { sql, params, callback } = this._parseArgs(args);
    try {
      runWithRetry(() => {
        const stmt = this._getStatement(sql);
        let iterator;
        try {
          iterator = stmt.iterate(params);
        } catch (err) {
          if (err instanceof RangeError && err.message.includes('Too many parameter values') && Array.isArray(params)) {
            const p = params.slice();
            while (p.length > 0) {
              p.pop();
              try {
                iterator = stmt.iterate(p);
                break;
              } catch (_) {}
            }
          }
          if (!iterator) throw err;
        }
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
        console.error('[sqlite3-wrapper] Erro não capturado em each() sem callback:', err.message, sql ? String(sql).substring(0, 100) : '');
      }
    }
    return this;
  }

  exec(sql, callback) {
    try {
      if (this._handleTransaction(sql, callback)) return this;
      runWithRetry(() => {
        this.db.exec(sql);
      });
      if (typeof callback === 'function') process.nextTick(() => callback(null));
    } catch (err) {
      if (typeof callback === 'function') process.nextTick(() => callback(err));
      else console.error('[sqlite3-wrapper] Erro não capturado em exec() sem callback:', err.message, sql ? String(sql).substring(0, 100) : '');
    }
    return this;
  }

  prepare(sql, ...args) {
    let callback = null;
    let initialParams = [];
    if (args.length > 0 && typeof args[args.length - 1] === 'function') {
      callback = args.pop();
    }
    if (args.length === 1 && Array.isArray(args[0])) {
      initialParams = args[0];
    } else if (args.length > 0) {
      initialParams = args;
    }

    let stmt = null;
    try {
      stmt = this._getStatement(sql);
    } catch (err) {
      console.error('[sqlite3-wrapper] Erro ao preparar statement:', err.message, sql);
      if (typeof callback === 'function') process.nextTick(() => callback(err));
    }

    const self = this;
    const statementObj = {
      sql,
      run(...runArgs) {
        let cb = null;
        let p = initialParams.slice();
        if (runArgs.length > 0 && typeof runArgs[runArgs.length - 1] === 'function') {
          cb = runArgs.pop();
        }
        if (runArgs.length === 1 && Array.isArray(runArgs[0])) {
          p = runArgs[0];
        } else if (runArgs.length > 0) {
          p = runArgs;
        }

        try {
          const info = stmt ? self._executeSafe(stmt, 'run', p) : { changes: 0, lastInsertRowid: 0 };
          const ctx = {
            lastID: info ? info.lastInsertRowid : undefined,
            changes: info ? info.changes : 0
          };
          if (typeof cb === 'function') {
            process.nextTick(() => cb.call(ctx, null));
          }
          return Object.assign(statementObj, ctx);
        } catch (err) {
          if (typeof cb === 'function') {
            process.nextTick(() => cb(err));
          } else {
            console.error('[sqlite3-wrapper] Statement.run() erro sem callback:', err.message);
          }
          return statementObj;
        }
      },

      get(...getArgs) {
        let cb = null;
        let p = initialParams.slice();
        if (getArgs.length > 0 && typeof getArgs[getArgs.length - 1] === 'function') {
          cb = getArgs.pop();
        }
        if (getArgs.length === 1 && Array.isArray(getArgs[0])) {
          p = getArgs[0];
        } else if (getArgs.length > 0) {
          p = getArgs;
        }

        try {
          const row = stmt ? self._executeSafe(stmt, 'get', p) : null;
          if (typeof cb === 'function') {
            process.nextTick(() => cb(null, row));
          }
          return row;
        } catch (err) {
          if (typeof cb === 'function') {
            process.nextTick(() => cb(err));
          } else {
            console.error('[sqlite3-wrapper] Statement.get() erro sem callback:', err.message);
          }
          return null;
        }
      },

      all(...allArgs) {
        let cb = null;
        let p = initialParams.slice();
        if (allArgs.length > 0 && typeof allArgs[allArgs.length - 1] === 'function') {
          cb = allArgs.pop();
        }
        if (allArgs.length === 1 && Array.isArray(allArgs[0])) {
          p = allArgs[0];
        } else if (allArgs.length > 0) {
          p = allArgs;
        }

        try {
          const rows = stmt ? self._executeSafe(stmt, 'all', p) : [];
          if (typeof cb === 'function') {
            process.nextTick(() => cb(null, rows));
          }
          return rows;
        } catch (err) {
          if (typeof cb === 'function') {
            process.nextTick(() => cb(err));
          } else {
            console.error('[sqlite3-wrapper] Statement.all() erro sem callback:', err.message);
          }
          return [];
        }
      },

      each(...eachArgs) {
        let compCb = null;
        let rowCb = null;
        let p = initialParams.slice();
        if (eachArgs.length > 0 && typeof eachArgs[eachArgs.length - 1] === 'function') {
          const fn2 = eachArgs.pop();
          if (eachArgs.length > 0 && typeof eachArgs[eachArgs.length - 1] === 'function') {
            compCb = fn2;
            rowCb = eachArgs.pop();
          } else {
            rowCb = fn2;
          }
        }
        if (eachArgs.length === 1 && Array.isArray(eachArgs[0])) {
          p = eachArgs[0];
        } else if (eachArgs.length > 0) {
          p = eachArgs;
        }

        try {
          let count = 0;
          runWithRetry(() => {
            if (!stmt) return;
            let iterator;
            try {
              iterator = stmt.iterate(p);
            } catch (err) {
              if (err instanceof RangeError && err.message.includes('Too many parameter values') && Array.isArray(p)) {
                const pCopy = p.slice();
                while (pCopy.length > 0) {
                  pCopy.pop();
                  try {
                    iterator = stmt.iterate(pCopy);
                    break;
                  } catch (_) {}
                }
              }
              if (!iterator) throw err;
            }
            for (const row of iterator) {
              count++;
              if (typeof rowCb === 'function') rowCb(null, row);
            }
          });
          if (typeof compCb === 'function') process.nextTick(() => compCb(null, count));
        } catch (err) {
          if (typeof rowCb === 'function') rowCb(err);
          else if (typeof compCb === 'function') compCb(err);
          else console.error('[sqlite3-wrapper] Statement.each() erro:', err.message);
        }
        return statementObj;
      },

      finalize(cb) {
        if (typeof cb === 'function') process.nextTick(cb);
        return self;
      },

      reset(cb) {
        if (typeof cb === 'function') process.nextTick(cb);
        return statementObj;
      },

      bind(...bindArgs) {
        if (bindArgs.length === 1 && Array.isArray(bindArgs[0])) {
          initialParams = bindArgs[0];
        } else {
          initialParams = bindArgs;
        }
        return statementObj;
      }
    };

    if (typeof callback === 'function') {
      process.nextTick(() => callback.call(statementObj, null));
    }
    return statementObj;
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
      else console.error('[sqlite3-wrapper] Erro ao fechar banco:', err.message);
    }
  }
}

module.exports = {
  Database: SQLite3Wrapper,
  verbose: function() { return this; },
  OPEN_READONLY: 1,
  OPEN_READWRITE: 2,
  OPEN_CREATE: 4
};
