'use strict';
/** هزینه‌های کارکنان: درخواست و تایید */
const express = require('express');
const db = require('../src/db');
const utils = require('../src/utils');
const H = require('../src/helpers');
const { upload, empOptions } = require('../src/crud');

module.exports = function (app) {
  const tz = () => parseInt(db.getSetting('tz_offset', '210'), 10) || 210;
  const CATEGORIES = { travel: 'سفر و مأموریت', transport: 'ایاب و ذهاب', office: 'ملزومات اداری', welfare: 'پذیرایی و رفاهی', training: 'آموزش', other: 'سایر' };

  app.get('/expenses', H.authRequired, H.permRequired('expenses'), (req, res) => {
    const status = req.query.status || '';
    const mine = !['admin', 'hr'].includes(req.user.role);
    let sql = `SELECT ex.*, e.first_name, e.last_name, e.code FROM expenses ex JOIN employees e ON e.id=ex.employee_id WHERE 1=1`;
    const params = [];
    if (mine && req.user.employee_id) { sql += ' AND ex.employee_id=?'; params.push(req.user.employee_id); }
    if (status) { sql += ' AND ex.status=?'; params.push(status); }
    sql += ' ORDER BY CASE ex.status WHEN \'pending\' THEN 0 ELSE 1 END, ex.id DESC LIMIT 300';
    const rows = db.all(sql, params);
    const totals = { pending: 0, approved: 0, paid: 0 };
    rows.forEach(r => { if (totals[r.status] != null) totals[r.status] += r.amount; });
    res.render('expenses/index', {
      title: 'هزینه‌ها', rows, status, mine, totals, categories: CATEGORIES,
      currency: db.getSetting('currency', 'تومان'), jDateEn: utils.jDateEn
    });
  });

  app.get('/expenses/new', H.authRequired, H.permRequired('expenses'), (req, res) => {
    res.render('expenses/form', { title: 'ثبت درخواست هزینه', error: null, old: {}, categories: CATEGORIES, today: utils.todayIso(tz()), jDateEn: utils.jDateEn });
  });

  app.post('/expenses/new', H.authRequired, H.permRequired('expenses'), upload.single('receipt'), (req, res) => {
    const b = req.body;
    const empId = req.user.employee_id;
    if (!empId) return res.redirect('/expenses');
    const bad = m => res.status(400).render('expenses/form', { title: 'ثبت درخواست هزینه', error: m, categories: CATEGORIES, today: utils.todayIso(tz()), jDateEn: utils.jDateEn, old: b });
    if (!b.title) return bad('عنوان الزامی است.');
    const amount = parseFloat(utils.enNum(b.amount || '0').replace(/,/g, '')) || 0;
    if (amount <= 0) return bad('مبلغ باید بزرگ‌تر از صفر باشد.');
    const id = db.insert('expenses', {
      employee_id: empId, title: b.title.trim(), category: b.category || 'other', amount,
      date: utils.gDate(b.date) || utils.todayIso(tz()), description: b.description || '',
      receipt_path: req.file ? 'uploads/' + req.file.filename : '', status: 'pending'
    });
    H.notify(H.approversOf(empId), 'درخواست هزینه جدید', `${req.user.name}: ${b.title}`, '/expenses');
    H.log(req, 'create', 'expenses', id, b.title);
    res.redirect('/expenses?saved=1');
  });

  app.post('/expenses/:id(\\d+)/decide', H.authRequired, H.permRequired('expenses'), (req, res) => {
    const row = db.get('SELECT * FROM expenses WHERE id=?', [req.params.id]);
    if (!row) return res.redirect('/expenses');
    const map = { approve: 'approved', reject: 'rejected', paid: 'paid' };
    const st = map[req.body.decision];
    if (!st || row.status === 'paid') return res.redirect('/expenses');
    db.update('expenses', row.id, { status: st, approver_id: req.user.id, decided_at: utils.nowDateTime(tz()), decision_note: req.body.note || '' });
    const u = db.get('SELECT id FROM users WHERE employee_id=? AND is_active=1', [row.employee_id]);
    if (u) H.notify(u.id, `درخواست هزینه شما ${H.badgeClass(st) === 'success' ? 'تایید' : 'بررسی'} شد`, `${row.title} — وضعیت: ${utils.label(st)}`, '/expenses');
    H.log(req, st, 'expenses', row.id, '');
    res.redirect('/expenses');
  });

  // گزارش هزینه‌ها
  app.get('/reports/expenses', H.authRequired, H.permRequired('expenses'), (req, res) => {
    const byCategory = Object.keys(CATEGORIES).map(k => ({
      key: k, label: CATEGORIES[k],
      total: db.count(`SELECT COALESCE(SUM(amount),0) AS s FROM expenses WHERE category=? AND status IN ('approved','paid')`, [k])
    })).filter(x => x.total > 0);
    const total = db.count(`SELECT COALESCE(SUM(amount),0) AS s FROM expenses WHERE status IN ('approved','paid')`);
    const byEmp = db.all(`SELECT e.first_name, e.last_name, SUM(ex.amount) AS total FROM expenses ex JOIN employees e ON e.id=ex.employee_id WHERE ex.status IN ('approved','paid') GROUP BY ex.employee_id ORDER BY total DESC LIMIT 15`);
    res.render('reports/expenses', { title: 'گزارش هزینه‌ها', byCategory, total, byEmp, categories: CATEGORIES, currency: db.getSetting('currency', 'تومان') });
  });
};
