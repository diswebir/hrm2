'use strict';
/** مرخصی: درخواست، تایید، مانده‌ها، تقویم تیمی */
const express = require('express');
const db = require('../src/db');
const utils = require('../src/utils');
const H = require('../src/helpers');
const { upload } = require('../src/crud');

module.exports = function (app) {
  const tz = () => parseInt(db.getSetting('tz_offset', '210'), 10) || 210;

  function workdaysBetween(from, to) {
    let n = 0, d = from;
    let guard = 0;
    while (d <= to && guard++ < 400) {
      const wd = utils.isoWeekdaySat(d);
      const hol = db.get('SELECT id FROM holidays WHERE date=?', [d]);
      if (wd !== 6 && !hol) n++;
      d = utils.addDaysIso(d, 1);
    }
    return n;
  }

  // لیست درخواست‌ها
  app.get('/leave', H.authRequired, H.permRequired('leave'), (req, res) => {
    const status = req.query.status || '';
    const empId = req.query.employee || '';
    const mine = req.query.mine === '1' || !['admin', 'hr'].includes(req.user.role);
    let sql = `SELECT lr.*, e.first_name, e.last_name, e.code, lt.name AS type_name, lt.color FROM leave_requests lr
      JOIN employees e ON e.id=lr.employee_id JOIN leave_types lt ON lt.id=lr.leave_type_id WHERE 1=1`;
    const params = [];
    if (mine && req.user.employee_id) { sql += ' AND lr.employee_id=?'; params.push(req.user.employee_id); }
    if (status) { sql += ' AND lr.status=?'; params.push(status); }
    if (empId) { sql += ' AND lr.employee_id=?'; params.push(empId); }
    sql += ' ORDER BY CASE lr.status WHEN \'pending\' THEN 0 ELSE 1 END, lr.id DESC LIMIT 300';
    const rows = db.all(sql, params);
    const stats = {
      pending: db.count(`SELECT COUNT(*) AS c FROM leave_requests WHERE status='pending'`),
      approved: db.count(`SELECT COUNT(*) AS c FROM leave_requests WHERE status='approved'`),
      rejected: db.count(`SELECT COUNT(*) AS c FROM leave_requests WHERE status='rejected'`)
    };
    res.render('leave/index', {
      title: 'درخواست‌های مرخصی', rows, status, empId, mine, stats, jDateEn: utils.jDateEn,
      emps: db.all(`SELECT id, first_name, last_name FROM employees WHERE status='active' ORDER BY last_name`)
    });
  });

  // فرم درخواست
  app.get('/leave/new', H.authRequired, H.permRequired('leave'), (req, res) => {
    const empId = req.query.employee ? parseInt(req.query.employee, 10) : (req.user.employee_id || 0);
    res.render('leave/form', {
      title: 'ثبت درخواست مرخصی', error: null, old: {}, types: db.all('SELECT * FROM leave_types ORDER BY id'),
      emps: db.all(`SELECT id, first_name, last_name FROM employees WHERE status='active' ORDER BY last_name`),
      empId, isHr: ['admin', 'hr'].includes(req.user.role), jDateEn: utils.jDateEn,
      today: utils.todayIso(tz())
    });
  });

  app.post('/leave/new', H.authRequired, H.permRequired('leave'), upload.single('file'), (req, res) => {
    const b = req.body;
    const isHr = ['admin', 'hr'].includes(req.user.role);
    const empId = isHr && b.employee_id ? parseInt(b.employee_id, 10) : (req.user.employee_id || 0);
    const render = (error) => res.status(400).render('leave/form', {
      title: 'ثبت درخواست مرخصی', error, types: db.all('SELECT * FROM leave_types ORDER BY id'),
      emps: db.all(`SELECT id, first_name, last_name FROM employees WHERE status='active' ORDER BY last_name`),
      empId, isHr, jDateEn: utils.jDateEn, today: utils.todayIso(tz()), old: b
    });
    if (!empId) return render('کارمند مشخص نیست.');
    const from = utils.gDate(b.from_date), to = utils.gDate(b.to_date);
    if (!from || !to) return render('تاریخ‌ها نامعتبر است.');
    if (to < from) return render('تاریخ پایان نمی‌تواند قبل از شروع باشد.');
    const lt = db.get('SELECT * FROM leave_types WHERE id=?', [b.leave_type_id]);
    if (!lt) return render('نوع مرخصی را انتخاب کنید.');
    if (lt.requires_doc && !req.file) return render(`برای مرخصی «${lt.name}» پیوست مدرک الزامی است.`);
    // تداخل
    const overlap = db.get(`SELECT id FROM leave_requests WHERE employee_id=? AND status IN ('pending','approved') AND from_date <= ? AND to_date >= ?`, [empId, to, from]);
    if (overlap) return render('برای این بازه یک درخواست مرخصی دیگر وجود دارد (تداخل).');
    // تعداد روز (تعطیلات و روزهای غیرکاری شمرده نمی‌شود)
    const days = workdaysBetween(from, to);
    if (days <= 0) return render('بازه انتخابی شامل روز کاری نیست.');
    const id = db.insert('leave_requests', {
      employee_id: empId, leave_type_id: lt.id, from_date: from, to_date: to,
      days: b.days && parseFloat(utils.enNum(b.days)) ? parseFloat(utils.enNum(b.days)) : days,
      reason: b.reason || '', status: 'pending', approver_id: null, decision_note: '',
      created_at: utils.nowDateTime(tz()), decided_at: null,
      attachment: req.file ? 'uploads/' + req.file.filename : ''
    });
    H.notify(H.approversOf(empId), 'درخواست مرخصی جدید', `${req.user.name}: ${lt.name} از ${utils.jDate(from)} تا ${utils.jDate(to)}`, '/leave/approvals');
    H.log(req, 'create', 'leave_requests', id, '');
    res.redirect('/leave?saved=1');
  });

  // تاییدها
  app.get('/leave/approvals', H.authRequired, H.permRequired('leave'), (req, res) => {
    const rows = db.all(`SELECT lr.*, e.first_name, e.last_name, e.code, lt.name AS type_name, lt.color FROM leave_requests lr
      JOIN employees e ON e.id=lr.employee_id JOIN leave_types lt ON lt.id=lr.leave_type_id
      WHERE lr.status='pending' ORDER BY lr.created_at ASC`);
    res.render('leave/approvals', { title: 'تایید مرخصی‌ها', rows, jDateEn: utils.jDateEn });
  });

  app.post('/leave/:id/decide', H.authRequired, H.permRequired('leave'), (req, res) => {
    const row = db.get('SELECT * FROM leave_requests WHERE id=?', [req.params.id]);
    if (!row || row.status !== 'pending') return res.redirect('/leave/approvals');
    const decision = req.body.decision === 'approve' ? 'approved' : 'rejected';
    db.update('leave_requests', row.id, { status: decision, approver_id: req.user.id, decision_note: req.body.note || '', decided_at: utils.nowDateTime(tz()) });
    // رکورد حضور برای روزهای تاییدشده
    if (decision === 'approved') {
      let d = row.from_date, guard = 0;
      while (d <= row.to_date && guard++ < 60) {
        const ex = db.get('SELECT id FROM attendance WHERE employee_id=? AND date=?', [row.employee_id, d]);
        if (!ex) db.insert('attendance', { employee_id: row.employee_id, date: d, check_in: null, check_out: null, status: 'leave', late_minutes: 0, early_minutes: 0, overtime_minutes: 0, worked_minutes: 0, source: 'auto-leave', note: 'مرخصی تاییدشده' });
        d = utils.addDaysIso(d, 1);
      }
    }
    const u = db.get('SELECT id FROM users WHERE employee_id=? AND is_active=1', [row.employee_id]);
    if (u) H.notify(u.id, `درخواست مرخصی شما ${decision === 'approved' ? 'تایید' : 'رد'} شد`, req.body.note || '', '/leave?mine=1');
    H.log(req, decision, 'leave_requests', row.id, '');
    res.redirect('/leave/approvals');
  });

  app.post('/leave/:id/cancel', H.authRequired, (req, res) => {
    const row = db.get('SELECT * FROM leave_requests WHERE id=?', [req.params.id]);
    if (!row) return res.redirect('/leave');
    const isOwner = req.user.employee_id === row.employee_id;
    if (!isOwner && !H.can(req.user, 'leave')) return res.status(403).send('دسترسی غیرمجاز');
    if (row.status === 'pending' || (row.status === 'approved' && (isOwner || ['admin', 'hr'].includes(req.user.role)))) {
      db.update('leave_requests', row.id, { status: 'cancelled', decided_at: utils.nowDateTime(tz()) });
      db.run(`DELETE FROM attendance WHERE employee_id=? AND status='leave' AND source='auto-leave' AND date BETWEEN ? AND ?`, [row.employee_id, row.from_date, row.to_date]);
    }
    res.redirect('/leave?mine=1');
  });

  // مانده‌ها
  app.get('/leave/balances', H.authRequired, H.permRequired('leave'), (req, res) => {
    const jy = parseInt(utils.enNum(req.query.jy || ''), 10) || utils.toJalali(...utils.todayIso(tz()).split('-').map(Number)).jy;
    const g1 = utils.toGregorian(jy, 1, 1);
    const yearStart = `${g1.gy}-${String(g1.gm).padStart(2, '0')}-${String(g1.gd).padStart(2, '0')}`;
    const types = db.all('SELECT * FROM leave_types ORDER BY id');
    const emps = db.all(`SELECT id, first_name, last_name, code FROM employees WHERE status='active' ORDER BY last_name`);
    const rows = emps.map(e => {
      const used = {};
      types.forEach(lt => {
        used[lt.id] = db.count(`SELECT COALESCE(SUM(days),0) AS s FROM leave_requests WHERE employee_id=? AND leave_type_id=? AND status='approved' AND from_date >= ?`, [e.id, lt.id, yearStart]);
      });
      return { ...e, used };
    });
    if (req.query.csv) {
      const csv = utils.toCsv(['کد', 'کارمند', ...types.map(t => `مصرف ${t.name} (از ${t.annual_quota})`)],
        rows.map(r => [r.code, `${r.first_name} ${r.last_name}`, ...types.map(t => r.used[t.id])]));
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="leave-balances.csv"');
      return res.send(csv);
    }
    res.render('leave/balances', { title: 'مانده مرخصی‌ها', rows, types, jy });
  });

  // تقویم تیمی
  app.get('/leave/team-calendar', H.authRequired, H.permRequired('leave'), (req, res) => {
    const today = utils.todayIso(tz());
    const cj = utils.toJalali(...today.split('-').map(Number));
    const jy = parseInt(utils.enNum(req.query.jy || ''), 10) || cj.jy;
    const jm = parseInt(utils.enNum(req.query.jm || ''), 10) || cj.jm;
    const range = utils.jMonthRange(jy, jm);
    const leaves = db.all(`SELECT lr.*, e.first_name, e.last_name, lt.name AS type_name, lt.color FROM leave_requests lr
      JOIN employees e ON e.id=lr.employee_id JOIN leave_types lt ON lt.id=lr.leave_type_id
      WHERE lr.status='approved' AND lr.from_date <= ? AND lr.to_date >= ?`, [range.end, range.start]);
    const days = [];
    let d = range.start;
    while (d <= range.end) {
      const list = leaves.filter(l => l.from_date <= d && l.to_date >= d);
      days.push({ date: d, jd: utils.toJalali(...d.split('-').map(Number)), list, weekend: utils.isoWeekdaySat(d) === 6, holiday: !!db.get('SELECT id FROM holidays WHERE date=?', [d]) });
      d = utils.addDaysIso(d, 1);
    }
    res.render('leave/team_calendar', { title: 'تقویم تیمی مرخصی', days, jy, jm, monthName: utils.FA_MONTHS[jm - 1] });
  });
};
