'use strict';
/**
 * لایه دیتابیس — SQLite (sql.js / WebAssembly)
 * چرا sql.js؟ کاملاً جاوااسکریپت است و نیاز به کامپایل بومی ندارد؛
 * بنابراین روی هر هاستی (از جمله cPanel اشتراکی) با `npm install` ساده نصب می‌شود.
 * کل دیتابیس در حافظه بارگذاری و هر تغییر به‌صورت خودکار (debounce) روی فایل ذخیره می‌شود.
 */
const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const DATA_DIR = process.env.HRM_DATA_DIR || path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'hrm.sqlite');

let SQL = null;
let db = null;
let saveTimer = null;
let _dirty = false;

/** ذخیره اتمیک دیتابیس روی دیسک (tmp + rename) */
function flushSync() {
  if (!db || !_dirty) return;
  const data = Buffer.from(db.export());
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, DB_FILE);
  _dirty = false;
}

function scheduleSave() {
  _dirty = true;
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try { flushSync(); } catch (e) { console.error('[db] flush error:', e.message); }
  }, 400);
}

/** اجرای کوئری نوشتاری */
function run(sql, params = []) {
  db.run(sql, params);
  scheduleSave();
}

/** چند کوئری پشت‌سرهم */
function exec(sql) {
  db.exec(sql);
  scheduleSave();
}

/** یک ردیف */
function get(sql, params = []) {
  const stmt = db.prepare(sql);
  try {
    stmt.bind(params);
    if (stmt.step()) return stmt.getAsObject();
    return undefined;
  } finally { stmt.free(); }
}

/** همه ردیف‌ها */
function all(sql, params = []) {
  const stmt = db.prepare(sql);
  const rows = [];
  try {
    stmt.bind(params);
    while (stmt.step()) rows.push(stmt.getAsObject());
    return rows;
  } finally { stmt.free(); }
}

/** آخرین id درج‌شده */
function lastId() {
  return get('SELECT last_insert_rowid() AS id').id;
}

/** شمارش */
function count(sql, params = []) {
  const r = get(sql, params);
  return r ? Object.values(r)[0] : 0;
}

/** درج یک رکورد از آبجکت — برمی‌گرداند id */
function insert(table, obj) {
  const keys = Object.keys(obj);
  const placeholders = keys.map(() => '?').join(',');
  run(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${placeholders})`, keys.map(k => obj[k]));
  return lastId();
}

/** به‌روزرسانی بر اساس id */
function update(table, id, obj) {
  const keys = Object.keys(obj);
  const sets = keys.map(k => `${k}=?`).join(',');
  run(`UPDATE ${table} SET ${sets} WHERE id=?`, [...keys.map(k => obj[k]), id]);
}

/** حذف بر اساس id */
function del(table, id) {
  run(`DELETE FROM ${table} WHERE id=?`, [id]);
}

async function init({ fresh = false } = {}) {
  if (db) return;
  SQL = await initSqlJs();
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const uploadsDir = path.join(DATA_DIR, 'uploads', 'avatars');
  fs.mkdirSync(uploadsDir, { recursive: true });
  if (!fresh && fs.existsSync(DB_FILE)) {
    db = new SQL.Database(fs.readFileSync(DB_FILE));
  } else {
    db = new SQL.Database();
  }
  // اجرای اسکیما (idempotent)
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);
  // مهاجرت‌های امن برای دیتابیس‌های قدیمی
  const migrations = [
    'ALTER TABLE leave_requests ADD COLUMN attachment TEXT DEFAULT \'\''
  ];
  migrations.forEach(m => { try { db.exec(m); } catch (e) { /* ستون از قبل هست */ } });
  // پاک‌سازی نشست‌های منقضی
  db.run('DELETE FROM sessions WHERE expires < ?', [Date.now()]);
  flushSync();
  process.on('SIGTERM', () => { try { flushSync(); } catch (e) {} process.exit(0); });
  process.on('SIGINT', () => { try { flushSync(); } catch (e) {} process.exit(0); });
  process.on('exit', () => { try { flushSync(); } catch (e) {} });
}

function isInstalled() {
  try {
    const r = get(`SELECT value FROM settings WHERE key='installed'`);
    return r && r.value === '1';
  } catch (e) { return false; }
}

function getSetting(key, dflt = '') {
  const r = get('SELECT value FROM settings WHERE key=?', [key]);
  return r ? r.value : dflt;
}

function setSetting(key, value) {
  run('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [key, String(value)]);
}

function allSettings() {
  const rows = all('SELECT key,value FROM settings');
  const o = {};
  rows.forEach(r => { o[r.key] = r.value; });
  return o;
}

module.exports = { init, run, exec, get, all, count, insert, update, del, lastId, flushSync, isInstalled, getSetting, setSetting, allSettings, DATA_DIR, DB_FILE };
