'use strict';
/** مدیریت سامانه: کاربران، نقش‌ها، تنظیمات، پشتیبان‌گیری، لاگ فعالیت */
const express = require('express');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const db = require('../src/db');
const utils = require('../src/utils');
const H = require('../src/helpers');
const { MODULES, ROLE_NAMES } = H;
const { upload } = require('../src/crud');

module.exports = function (app) {
  const tz = () => parseInt(db.getSetting('tz_offset', '210'), 10) || 210;
  const r = express.Router();
  r.use(H.authRequired);

  // ---------- کاربران ----------
  r.get('/users', H.permRequired('users'), (req, res) => {
    const rows = db.all(`SELECT u.*, e.first_name, e.last_name, e.code FROM users u LEFT JOIN employees e ON e.id=u.employee_id ORDER BY u.id`);
    res.render('admin/users', {
      title: 'کاربران سامانه', rows, roleNames: ROLE_NAMES,
      emps: db.all(`SELECT id, first_name, last_name, code FROM employees WHERE status='active' ORDER BY last_name`),
      error: req.query.error || null
    });
  });

  r.post('/users', H.permRequired('users'), (req, res) => {
    const b = req.body;
    const bad = m => res.redirect('/users?error=' + encodeURIComponent(m));
    if (!b.username || !b.password) return bad('نام کاربری و رمز عبور الزامی است.');
    if (!/^[a-zA-Z0-9_.@-]{3,40}$/.test(b.username)) return bad('نام کاربری فقط حروف انگلیسی، عدد و ._@- مجاز است.');
    if (db.get('SELECT id FROM users WHERE username=?', [b.username])) return bad('این نام کاربری تکراری است.');
    const minLen = Math.max(6, parseInt(db.getSetting('min_password_length', '6'), 10) || 6);
    if (b.password.length < minLen) return bad(`رمز عبور حداقل ${utils.faNum(minLen)} کاراکتر باشد.`);
    if (b.role === 'admin' && req.user.role !== 'admin') return bad('فقط مدیر سیستم می‌تواند مدیر جدید بسازد.');
    const id = db.insert('users', {
      username: b.username.trim(), email: b.email || '', password: bcrypt.hashSync(b.password, 10),
      role: ['admin', 'hr', 'manager', 'employee'].includes(b.role) ? b.role : 'employee',
      employee_id: b.employee_id ? parseInt(b.employee_id, 10) : null, is_active: 1
    });
    H.log(req, 'create', 'users', id, b.username);
    res.redirect('/users');
  });

  r.post('/users/:id(\\d+)/reset-password', H.permRequired('users'), (req, res) => {
    const u = db.get('SELECT * FROM users WHERE id=?', [req.params.id]);
    if (!u) return res.redirect('/users');
    if (u.role === 'admin' && req.user.role !== 'admin') return res.redirect('/users?error=' + encodeURIComponent('فقط مدیر سیستم مجاز است.'));
    const newPass = (req.body.password || '').trim();
    const minLen = Math.max(6, parseInt(db.getSetting('min_password_length', '6'), 10) || 6);
    if (newPass.length < minLen) return res.redirect('/users?error=' + encodeURIComponent(`رمز حداقل ${minLen} کاراکتر باشد.`));
    db.update('users', u.id, { password: bcrypt.hashSync(newPass, 10), failed_attempts: 0, locked_until: null, reset_token: null });
    H.log(req, 'reset-password', 'users', u.id, u.username);
    res.redirect('/users');
  });

  r.post('/users/:id(\\d+)/toggle', H.permRequired('users'), (req, res) => {
    const u = db.get('SELECT * FROM users WHERE id=?', [req.params.id]);
    if (!u) return res.redirect('/users');
    if (u.id === req.user.id) return res.redirect('/users?error=' + encodeURIComponent('نمی‌توانید حساب خودتان را غیرفعال کنید.'));
    if (u.role === 'admin' && req.user.role !== 'admin') return res.redirect('/users?error=' + encodeURIComponent('فقط مدیر سیستم مجاز است.'));
    db.update('users', u.id, { is_active: u.is_active ? 0 : 1 });
    H.log(req, 'toggle', 'users', u.id, u.is_active ? 'غیرفعال' : 'فعال');
    res.redirect('/users');
  });

  r.post('/users/:id(\\d+)/delete', H.permRequired('users'), (req, res) => {
    const u = db.get('SELECT * FROM users WHERE id=?', [req.params.id]);
    if (!u) return res.redirect('/users');
    if (u.id === req.user.id) return res.redirect('/users?error=' + encodeURIComponent('حذف حساب خودتان ممکن نیست.'));
    if (u.role === 'admin' && req.user.role !== 'admin') return res.redirect('/users?error=' + encodeURIComponent('فقط مدیر سیستم مجاز است.'));
    db.del('users', u.id);
    H.log(req, 'delete', 'users', u.id, u.username);
    res.redirect('/users');
  });

  // ---------- نقش‌ها ----------
  r.get('/roles', H.permRequired('roles'), (req, res) => {
    const rows = db.all('SELECT * FROM roles ORDER BY id');
    const userCounts = {};
    db.all('SELECT role, COUNT(*) AS c FROM users GROUP BY role').forEach(x => userCounts[x.role] = x.c);
    res.render('admin/roles', { title: 'نقش‌ها و دسترسی‌ها', rows, modules: MODULES, roleNames: ROLE_NAMES, userCounts, saved: req.query.saved });
  });

  r.post('/roles/:name', H.permRequired('roles'), (req, res) => {
    const name = req.params.name;
    if (!['hr', 'manager', 'employee'].includes(name)) return res.status(403).send('نقش مدیر سیستم همیشه دسترسی کامل دارد.');
    const perms = Object.keys(MODULES).filter(m => req.body['perm_' + m] === '1');
    const ex = db.get('SELECT id FROM roles WHERE name=?', [name]);
    if (ex) db.update('roles', ex.id, { permissions: JSON.stringify(perms) });
    else db.insert('roles', { name, permissions: JSON.stringify(perms) });
    H.log(req, 'update', 'roles', 0, name);
    res.redirect('/roles?saved=1');
  });

  // ---------- تنظیمات ----------
  r.get('/settings', H.permRequired('settings'), (req, res) => {
    res.render('admin/settings', {
      title: 'تنظیمات سامانه', s: db.allSettings(), saved: req.query.saved,
      hasSmtp: require('../src/mailer').isEnabled()
    });
  });

  r.post('/settings', H.permRequired('settings'), (req, res) => {
    const allowed = ['system_name', 'company_name', 'currency', 'tz_offset', 'ot_hourly_rate', 'insurance_percent', 'tax_percent', 'min_password_length', 'login_max_attempts', 'lock_minutes', 'session_hours'];
    allowed.forEach(k => {
      if (req.body[k] !== undefined) db.setSetting(k, String(req.body[k]).trim());
    });
    // SMTP
    ['smtp_enabled', 'smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_from'].forEach(k => {
      if (req.body[k] !== undefined) db.setSetting(k, String(req.body[k]).trim());
    });
    db.setSetting('smtp_secure', req.body.smtp_secure === '1' ? '1' : '0');
    H.log(req, 'update', 'settings', 0, '');
    res.redirect('/settings?saved=1');
  });

  // بازنشانی کامل سامانه
  r.post('/settings/reset', H.permRequired('settings'), (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).send('فقط مدیر سیستم.');
    if (req.body.confirm !== 'RESET') return res.redirect('/settings?error=' + encodeURIComponent('برای بازنشانی عبارت RESET را دقیقاً وارد کنید.'));
    const tables = ['settings', 'roles', 'users', 'sessions', 'branches', 'departments', 'designations', 'employees',
      'employee_education', 'employee_skills', 'employee_contacts', 'employee_documents', 'contracts', 'job_history',
      'shifts', 'attendance', 'overtime_requests', 'leave_types', 'leave_requests', 'holidays', 'payrolls', 'payroll_items',
      'loans', 'loan_payments', 'goals', 'appraisal_cycles', 'appraisals', 'job_postings', 'candidates', 'interviews',
      'trainings', 'training_enrollments', 'assets', 'asset_assignments', 'expenses', 'tickets', 'ticket_replies',
      'announcements', 'events', 'documents', 'notifications', 'activity_logs', 'onboarding_items'];
    tables.forEach(t => db.run(`DELETE FROM ${t}`));
    const { seedBase } = require('../src/seed');
    seedBase({ company: req.body.company_name || 'شرکت من', adminUser: req.body.username || req.user.username, adminPass: req.body.new_admin_pass || 'admin123', adminName: '', adminFamily: '' });
    H.log(req, 'reset', 'system', 0, 'بازنشانی کامل');
    req.session.destroy(() => res.redirect('/login'));
  });

  // ---------- پشتیبان‌گیری ----------
  r.get('/backup', H.permRequired('backup'), (req, res) => {
    const files = [];
    try {
      fs.readdirSync(db.DATA_DIR).filter(f => f.endsWith('.sqlite')).forEach(f => {
        const st = fs.statSync(path.join(db.DATA_DIR, f));
        files.push({ name: f, size: st.size, mtime: st.mtime });
      });
    } catch (e) {}
    res.render('admin/backup', { title: 'پشتیبان‌گیری و بازیابی', files, dbFile: 'hrm.sqlite', error: req.query.error || null });
  });

  r.get('/backup/download', H.permRequired('backup'), (req, res) => {
    db.flushSync();
    res.download(db.DB_FILE, `hrm-backup-${utils.todayIso(tz())}.sqlite`);
  });

  r.post('/backup/restore', H.permRequired('backup'), upload.single('backup'), (req, res) => {
    if (!req.file) return res.redirect('/backup?error=' + encodeURIComponent('فایلی انتخاب نشده است.'));
    const tmpPath = req.file.path;
    // اعتبارسنجی: بررسی امضای فایل SQLite
    const buf = fs.readFileSync(tmpPath);
    const header = buf.slice(0, 16).toString('utf8');
    if (!header.startsWith('SQLite format 3')) {
      fs.unlinkSync(tmpPath);
      return res.redirect('/backup?error=' + encodeURIComponent('فایل انتخاب‌شده یک دیتابیس SQLite معتبر نیست.'));
    }
    db.flushSync();
    try { fs.copyFileSync(db.DB_FILE, db.DB_FILE + '.before-restore'); } catch (e) {}
    fs.copyFileSync(tmpPath, db.DB_FILE);
    fs.unlinkSync(tmpPath);
    H.log(req, 'restore', 'backup', 0, '');
    res.send(`<meta charset="utf-8"><script>alert('بازگشایی نسخه پشتیبان انجام شد. برای اعمال، از حساب کاربری خارج می‌شوید و اپ را ری‌استارت کنید (در cPanel دکمه Restart).'); location.href='/logout';</script>`);
  });

  // ---------- لاگ فعالیت ----------
  r.get('/activity', H.permRequired('activity'), (req, res) => {
    const { q = '', action = '', page = '1' } = req.query;
    const where = []; const params = [];
    if (q) { where.push('(u.username LIKE ? OR l.details LIKE ? OR l.entity LIKE ?)'); params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
    if (action) { where.push('l.action=?'); params.push(action); }
    const W = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const total = db.count(`SELECT COUNT(*) AS c FROM activity_logs l LEFT JOIN users u ON u.id=l.user_id ${W}`, params);
    const perPage = 40;
    const pages = Math.max(1, Math.ceil(total / perPage));
    const p = Math.min(pages, Math.max(1, parseInt(page, 10) || 1));
    const rows = db.all(`SELECT l.*, u.username FROM activity_logs l LEFT JOIN users u ON u.id=l.user_id ${W} ORDER BY l.id DESC LIMIT ${perPage} OFFSET ${(p - 1) * perPage}`, params);
    const actions = db.all('SELECT DISTINCT action FROM activity_logs ORDER BY action').map(x => x.action);
    if (req.query.csv) {
      const csv = utils.toCsv(['زمان', 'کاربر', 'عملیات', 'موجودیت', 'شناسه', 'جزئیات', 'IP'],
        db.all(`SELECT l.*, u.username FROM activity_logs l LEFT JOIN users u ON u.id=l.user_id ${W} ORDER BY l.id DESC`, params)
          .map(x => [x.created_at, x.username || '', x.action, x.entity, x.entity_id || '', x.details, x.ip]));
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="activity-log.csv"');
      return res.send(csv);
    }
    res.render('admin/activity', { title: 'لاگ فعالیت‌ها', rows, q, action, page: p, pages, total, actions });
  });

  app.use(r);
};
