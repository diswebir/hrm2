'use strict';
/** تیکت پشتیبانی داخلی */
const express = require('express');
const db = require('../src/db');
const utils = require('../src/utils');
const H = require('../src/helpers');

module.exports = function (app) {
  const tz = () => parseInt(db.getSetting('tz_offset', '210'), 10) || 210;
  const CATEGORIES = { support: 'پشتیبانی عمومی', it_ticket: 'فناوری اطلاعات', hr_ticket: 'منابع انسانی', admin_ticket: 'اداری', other: 'سایر' };

  app.get('/tickets', H.authRequired, H.permRequired('tickets'), (req, res) => {
    const status = req.query.status || '';
    const isStaff = ['admin', 'hr'].includes(req.user.role);
    let sql = `SELECT t.*, u.username FROM tickets t LEFT JOIN users u ON u.id=t.user_id WHERE 1=1`;
    const params = [];
    if (!isStaff) { sql += ' AND t.user_id=?'; params.push(req.user.id); }
    if (status) { sql += ' AND t.status=?'; params.push(status); }
    sql += ` ORDER BY CASE t.status WHEN 'open' THEN 0 WHEN 'answered' THEN 1 ELSE 2 END, t.updated_at DESC LIMIT 200`;
    const rows = db.all(sql, params);
    res.render('tickets/index', { title: 'تیکت‌های پشتیبانی', rows, status, isStaff, categories: CATEGORIES });
  });

  app.get('/tickets/new', H.authRequired, H.permRequired('tickets'), (req, res) => {
    res.render('tickets/form', { title: 'ثبت تیکت جدید', error: null, categories: CATEGORIES });
  });

  app.post('/tickets/new', H.authRequired, H.permRequired('tickets'), (req, res) => {
    const b = req.body;
    if (!b.subject) return res.status(400).render('tickets/form', { title: 'ثبت تیکت جدید', error: 'موضوع الزامی است.', categories: CATEGORIES });
    const code = 'TK-' + String(1000 + db.count('SELECT COUNT(*) AS c FROM tickets'));
    const id = db.insert('tickets', {
      code, user_id: req.user.id, employee_id: req.user.employee_id || null,
      subject: b.subject.trim(), category: b.category || 'other', priority: b.priority || 'normal',
      status: 'open', updated_at: utils.nowDateTime(tz())
    });
    db.insert('ticket_replies', { ticket_id: id, user_id: req.user.id, message: b.message || '' });
    if (!isStaffCheck(req)) H.notifyRole('hr', 'تیکت جدید: ' + b.subject, `${req.user.name} — اولویت ${utils.label(b.priority)}`, '/tickets/' + id);
    H.log(req, 'create', 'tickets', id, code);
    res.redirect('/tickets/' + id);
  });

  function isStaffCheck(req) { return ['admin', 'hr'].includes(req.user.role); }

  app.get('/tickets/:id(\\d+)', H.authRequired, H.permRequired('tickets'), (req, res) => {
    const t = db.get(`SELECT t.*, u.username, u.role FROM tickets t LEFT JOIN users u ON u.id=t.user_id WHERE t.id=?`, [req.params.id]);
    if (!t) return res.redirect('/tickets');
    if (!isStaffCheck(req) && t.user_id !== req.user.id) return res.status(403).send('دسترسی غیرمجاز');
    const replies = db.all(`SELECT tr.*, u.username, u.role FROM ticket_replies tr LEFT JOIN users u ON u.id=tr.user_id WHERE tr.ticket_id=? ORDER BY tr.id`, [t.id]);
    res.render('tickets/view', { title: 'تیکت ' + t.code, t, replies, isStaff: isStaffCheck(req), categories: CATEGORIES });
  });

  app.post('/tickets/:id(\\d+)/reply', H.authRequired, H.permRequired('tickets'), (req, res) => {
    const t = db.get('SELECT * FROM tickets WHERE id=?', [req.params.id]);
    if (!t) return res.redirect('/tickets');
    if (!isStaffCheck(req) && t.user_id !== req.user.id) return res.status(403).send('دسترسی غیرمجاز');
    const msg = (req.body.message || '').trim();
    if (msg) {
      db.insert('ticket_replies', { ticket_id: t.id, user_id: req.user.id, message: msg });
      db.update('tickets', t.id, { status: isStaffCheck(req) ? 'answered' : 'open', updated_at: utils.nowDateTime(tz()) });
      if (isStaffCheck(req) && t.user_id !== req.user.id) {
        H.notify(t.user_id, `پاسخ به تیکت ${t.code}`, msg.slice(0, 120), '/tickets/' + t.id);
      } else if (!isStaffCheck(req)) {
        H.notifyRole('hr', `پاسخ جدید در تیکت ${t.code}`, req.user.name, '/tickets/' + t.id);
      }
    }
    res.redirect('/tickets/' + t.id);
  });

  app.post('/tickets/:id(\\d+)/status', H.authRequired, H.permRequired('tickets'), (req, res) => {
    const t = db.get('SELECT * FROM tickets WHERE id=?', [req.params.id]);
    if (!t) return res.redirect('/tickets');
    const isStaff = isStaffCheck(req);
    if (!isStaff && t.user_id !== req.user.id) return res.status(403).send('دسترسی غیرمجاز');
    const st = ['open', 'answered', 'closed'].includes(req.body.status) ? req.body.status : null;
    if (st) {
      db.update('tickets', t.id, { status: st, updated_at: utils.nowDateTime(tz()) });
      H.log(req, 'status', 'tickets', t.id, st);
    }
    res.redirect('/tickets/' + t.id);
  });
};
