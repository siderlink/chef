const Database = require('better-sqlite3');

class SQLite3Wrapper {
  constructor(filename, mode, callback) {
    if (typeof mode === 'function') {
      callback = mode;
      mode = null;
    }
    
    try {
      this.db = new Database(filename);
      // Otimizações Inquebráveis para Resiliência (Evitar travamento em leitura/escrita simultânea)
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('synchronous = NORMAL');
      this.db.pragma('busy_timeout = 5000');
      
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

  _parseArgs(args) {
    let sql = args[0];
    let params = [];
    let callback = null;

    if (args.length > 1) {
      if (typeof args[args.length - 1] === 'function') {
        callback = args.pop();
      }
    }

    // args[1] pode ser um array de parametros
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
      const stmt = this.db.prepare(sql);
      const info = stmt.run(params);
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
      const stmt = this.db.prepare(sql);
      const row = stmt.get(params);
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
      const stmt = this.db.prepare(sql);
      const rows = stmt.all(params);
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
      const stmt = this.db.prepare(sql);
      const iterator = stmt.iterate(params);
      for (const row of iterator) {
        if (typeof callback === 'function') {
          callback(null, row); 
        }
      }
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
      this.db.exec(sql);
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
