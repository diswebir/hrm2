'use strict';
/**
 * موتور CRUD عمومی — با یک تعریف میدانی، روت‌های کامل لیست/ایجاد/ویرایش/حذف/خروجی CSV
 * به همراه فیلدهای سفارشی را تولید می‌کند.
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('./db');
const utils = require('./utils');
const H = require('./helpers');
const { gDate, jDate, faNum, money, label, badgeClass, toCsv, enNum, todayIso, esc } = utils;

const multer = require('multer');
const UPLOAD_DIR = path.join(db.DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || '').toLowerCase().slice(0, 10);
    cb(null, Date.now().toString(36) + Math.random().toString(36).slice(2, 8) + ext);
  }
});
const upload = multer({ storage, limits: { fileSize: 15 * 1024 * 1024 } });

function empOptions() {
  const rows = db.all(`SELECT id, first_name, last_name, code FROM employees WHERE status != 'terminated' ORDER BY last_name, first_name`);
  const o = {};
  rows.forEach(r => { o[r.id] = `${r.first_name} ${r.last_name} (${r.code || faNum(r.id)})`; });
  return o;
}
function deptOptions() {
  const o = {}; db.all('SELECT id,name FROM departments ORDER BY name').forEach(r => o[r.id] = r.name);
  return o;
}

/** مقدار خام فرم را به مقدار آماده ذخیره تبدیل می‌کند */
function parseField(f, raw) {
  switch (f.type) {
    case 'date': {
      if (!raw) return null;
      const g = gDate(raw);
      return g; // null اگر نامعتبر
    }
    case 'number':
    case 'money':
      if (raw === '' || raw == null) return f.nullable ? null : 0;
      return parseFloat(enNum(String(raw)).replace(/,/g, '')) || 0;
    case 'toggle':
      return raw === '1' || raw === 'on' ? 1 : 0;
    case 'weekdays': {
      const arr = Array.isArray(raw) ? raw : String(raw || '').split(',');
      return arr.filter(d => d !== '').map(Number).filter(n => !isNaN(n)).sort().join(',');
    }
    case 'lines': {
      const arr = (Array.isArray(raw) ? raw : String(raw || '').split(/\r?\n/)).map(s => s.trim()).filter(Boolean);
      return JSON.stringify(arr);
    }
    case 'month':
      return String(raw || '').trim();
    case 'color':
      return String(raw || '#0d6efd');
    case 'select':
    case 'employee':
    case 'department':
      return raw === '' ? null : parseInt(raw, 10);
    default:
      return raw == null ? '' : String(raw).trim();
  }
}

function validateFields(fields, body, fileId) {
  const data = {};
  for (const f of fields) {
    let raw = body[f.name];
    if (f.type === 'file') raw = fileId || '';
    const v = parseField(f, raw);
    if (f.required && (v === '' || v == null)) {
      return { error: `پر کردن فیلد «${f.label}» الزامی است.` };
    }
    if (f.type === 'date' && raw && !v) return { error: `تاریخ فیلد «${f.label}» نامعتبر است.` };
    if (f.min != null && typeof v === 'number' && v < f.min) return { error: `«${f.label}» نمی‌تواند کمتر از ${faNum(f.min)} باشد.` };
    data[f.name] = v;
  }
  return { data };
}

/** رندر سلول‌های جدول لیست بر اساس نوع فیلد */
function cellHtml(f, row, settings) {
  const v = row[f.name];
  if (f.render) return f.render(row, settings);
  if (v == null || v === '') return '—';
  switch (f.type) {
    case 'date': return jDate(v);
    case 'money': return money(v, settings.currency || 'تومان');
    case 'number': return faNum(v);
    case 'toggle': return v == 1 ? '<span class="badge bg-success">فعال</span>' : '<span class="badge bg-secondary">غیرفعال</span>';
    case 'select':
    case 'employee':
    case 'department': {
      if (f.options && f.options[v] != null) {
        const txt = f.options[v];
        return f.badge ? `<span class="badge bg-${f.badge(v)}">${H.badgeClass(v) !== 'secondary' ? label(v) : esc(txt)}</span>` : esc(txt);
      }
      return '—';
    }
    default: return esc(String(v).slice(0, 120));
  }
}

/**
 * تعریف یک منبع CRUD کامل
 */
function defineCrud(app, opts) {
  const router = express.Router();
  const base = opts.base; // مثل '/departments'
  const P = () => H.permRequired(opts.permission);

  router.use((req, res, next) => {
    // کش کردن گزینه‌های پویا برای رندر
    req._crudFields = opts.fields.map(f => {
      const fld = { ...f };
      if (typeof f.options === 'function' && f.type !== 'select') fld.resolvedOptions = f.options;
      return fld;
    });
    next();
  });

  function resolveFields() {
    return opts.fields.map(f => {
      const fld = { ...f };
      if (typeof f.options === 'function') fld.options = f.options();
      return fld;
    });
  }

  function listWhere(req) {
    let sql = opts.listQuery || `SELECT * FROM ${opts.table}`;
    const params = [];
    if (opts.listParams) params.push(...opts.listParams(req));
    const q = (req.query.q || '').trim();
    if (q && opts.searchable && opts.searchable.length) {
      const like = opts.searchable.map(s => `${s} LIKE ?`).join(' OR ');
      sql += (sql.toLowerCase().includes('where') ? ' AND ' : ' WHERE ') + `(${like})`;
      opts.searchable.forEach(() => params.push(`%${q}%`));
    }
    sql += ` ORDER BY ${opts.orderBy || 'id DESC'}`;
    return { sql, params, q };
  }

  router.get('/', P(), (req, res) => {
    const { sql, params, q } = listWhere(req);
    const total = db.count(`SELECT COUNT(*) FROM (${sql})`, params);
    const perPage = 25;
    const pages = Math.max(1, Math.ceil(total / perPage));
    const page = Math.min(pages, Math.max(1, parseInt(req.query.page, 10) || 1));
    const rows = db.all(`${sql} LIMIT ${perPage} OFFSET ${(page - 1) * perPage}`, params);
    const settings = db.allSettings();
    const fields = resolveFields();
    const listFields = fields.filter(f => f.list !== false);
    res.render(opts.listView || 'crud/list', {
      title: opts.title, icon: opts.icon || 'bi-grid',
      singular: opts.singular || title,
      fields, listFields, rows, page, pages, total, q,
      base, canCreate: opts.canCreate !== false, canExport: opts.canExport !== false,
      subtitle: opts.subtitle || '', settings,
      cell: (f, row) => cellHtml(f, row, settings),
      extraActions: opts.extraActions || null,
      rowActions: opts.rowActions || null,
      headExtra: opts.headExtra || null,
      listClass: opts.listClass || ''
    });
  });

  router.get('/export', P(), (req, res) => {
    const { sql, params } = listWhere(req);
    const rows = db.all(sql, params);
    const settings = db.allSettings();
    const fields = resolveFields().filter(f => f.list !== false);
    const headers = fields.map(f => f.label);
    const data = rows.map(r => fields.map(f => {
      const v = r[f.name];
      if (f.type === 'date') return v ? jDate(v) : '';
      if (f.type === 'toggle') return v == 1 ? 'فعال' : 'غیرفعال';
      if (f.options && f.options[v] != null) return String(f.options[v]);
      if (f.render) { /* مقدار خام */ }
      return v;
    }));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${opts.table}.csv"`);
    res.send(toCsv(headers, data));
  });

  function renderForm(req, res, row, errors) {
    const settings = db.allSettings();
    res.render('crud/form', {
      title: row && row.id ? `ویرایش ${opts.singular}` : `ثبت ${opts.singular} جدید`,
      icon: opts.icon || 'bi-grid',
      fields: resolveFields(), row: row || {}, errors,
      base, backUrl: req.query.back || base, settings,
      jDateEn: utils.jDateEn
    });
  }

  router.get('/new', P(), (req, res) => renderForm(req, res, null));
  router.get('/:id/edit', P(), (req, res) => {
    const row = db.get(`SELECT * FROM ${opts.table} WHERE id=?`, [req.params.id]);
    if (!row) return res.status(404).render('error', { title: 'یافت نشد', message: 'رکورد مورد نظر یافت نشد.', user: req.user, can: m => H.can(req.user, m) });
    renderForm(req, res, row);
  });

  const save = (req, res) => {
    const fields = resolveFields();
    const fileId = req.file ? `uploads/${req.file.filename}` : (req.body.existing_file || '');
    const { data, error } = validateFields(fields, req.body, fileId);
    if (error) return renderForm(req, res, { ...req.body }, error);
    if (opts.beforeSave) {
      const r = opts.beforeSave(data, req, null);
      if (r && r.error) return renderForm(req, res, { ...req.body }, r.error);
      if (r) Object.assign(data, r);
    }
    const isNew = !req.params.id;
    let id;
    if (isNew) { id = db.insert(opts.table, data); }
    else { id = req.params.id; db.update(opts.table, id, data); }
    const row = db.get(`SELECT * FROM ${opts.table} WHERE id=?`, [id]);
    if (opts.afterSave) opts.afterSave(row, req, isNew);
    H.log(req, isNew ? 'create' : 'update', opts.table, id, data.title || data.name || '');
    if (opts.redirectTo) return res.redirect(typeof opts.redirectTo === 'function' ? opts.redirectTo(row, req) : opts.redirectTo);
    res.redirect(base + '?saved=1');
  };

  router.post('/new', P(), upload.single('file'), save);
  router.post('/:id/edit', P(), upload.single('file'), save);

  router.post('/:id/delete', P(), (req, res) => {
    const row = db.get(`SELECT * FROM ${opts.table} WHERE id=?`, [req.params.id]);
    if (row && opts.beforeDelete) {
      const r = opts.beforeDelete(row, req);
      if (r && r.error) { require('./db'); return res.redirect(base + '?error=' + encodeURIComponent(r.error)); }
    }
    db.del(opts.table, req.params.id);
    if (row) H.log(req, 'delete', opts.table, req.params.id, row.title || row.name || '');
    res.redirect(base + '?deleted=1');
  });

  app.use(base, router);
  return router;
}

module.exports = { defineCrud, upload, empOptions, deptOptions, cellHtml, validateFields, parseField, UPLOAD_DIR };
