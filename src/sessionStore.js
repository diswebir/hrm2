'use strict';
/** فروشگاه نشست (Session) مبتنی بر SQLite — نشست‌ها بعد از ری‌استارت سرور هم باقی می‌مانند */
const db = require('./db');

module.exports = function (session) {
  const Store = session.Store;

  class SqliteStore extends Store {
    get(sid, cb) {
      try {
        const row = db.get('SELECT data FROM sessions WHERE sid=? AND expires > ?', [sid, Date.now()]);
        cb(null, row ? JSON.parse(row.data) : null);
      } catch (e) { cb(e); }
    }
    set(sid, data, cb) {
      try {
        const expires = (data.cookie && data.cookie.expires ? new Date(data.cookie.expires).getTime() : Date.now() + 86400000);
        db.run('INSERT INTO sessions (sid,data,expires) VALUES (?,?,?) ON CONFLICT(sid) DO UPDATE SET data=excluded.data, expires=excluded.expires',
          [sid, JSON.stringify(data), expires]);
        if (cb) cb(null);
      } catch (e) { if (cb) cb(e); }
    }
    destroy(sid, cb) {
      try { db.run('DELETE FROM sessions WHERE sid=?', [sid]); if (cb) cb(null); }
      catch (e) { if (cb) cb(e); }
    }
    touch(sid, data, cb) {
      const expires = (data.cookie && data.cookie.expires ? new Date(data.cookie.expires).getTime() : Date.now() + 86400000);
      try { db.run('UPDATE sessions SET expires=? WHERE sid=?', [expires, sid]); if (cb) cb(null); }
      catch (e) { if (cb) cb(e); }
    }
  }
  return SqliteStore;
};
