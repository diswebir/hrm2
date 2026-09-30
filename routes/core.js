'use strict';
/** هسته: داشبورد، درباره سامانه، جستجوی سراسری، اعلان‌ها، دانلود فایل‌ها، پروفایل من */
const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('../src/db');
const utils = require('../src/utils');
const H = require('../src/helpers');
const FEATURES = require('../src/features');

module.exports = function (app) {
  const tz = () => parseInt(db.getSetting('tz_offset', '210'), 10) || 210;
  const currency = () => db.getSetting('currency', 'تومان');

  // ---------- درباره سامانه ----------
  app.get('/about', (req, res) => {
    let n = 0;
    const cats = FEATURES.map(c => ({
      ...c,
      items: c.items.map(it => ({ ...it, no: ++n }))
    }));
    res.render('about', { title: 'درباره سامانه', cats, total: n });
  });

  // ---------- داشبورد ----------
  app.get('/', H.authRequired, (req, res) => {
    const t = utils.todayIso(tz());
    const isEmployeeView = req.user.role === 'employee' && req.user.employee_id;
    if (isEmployeeView) {
      const emp = db.get('SELECT * FROM employees WHERE id=?', [req.user.employee_id]);
      const att = db.get('SELECT * FROM attendance WHERE employee_id=? AND date=?', [emp.id, t]);
      const balances = leaveBalances(emp.id);
      const payslip = db.get(`SELECT p.*, e.first_name, e.last_name FROM payrolls p JOIN employees e ON e.id=p.employee_id
        WHERE p.employee_id=? AND p.status='final' ORDER BY p.month DESC LIMIT 1`, [emp.id]);
      const goals = db.all(`SELECT * FROM goals WHERE employee_id=? AND status IN ('in_progress','overdue') ORDER BY due_date LIMIT 5`, [emp.id]);
      const announcements = visibleAnnouncements(req.user, 5);
      const myRequests = db.all(`SELECT 'leave' AS kind, id, status, from_date AS d1, '' AS d2 FROM leave_requests WHERE employee_id=?
        UNION ALL SELECT 'overtime', id, status, date, '' FROM overtime_requests WHERE employee_id=?
        UNION ALL SELECT 'expense', id, status, date, '' FROM expenses WHERE employee_id=? ORDER BY d1 DESC LIMIT 8`, [emp.id, emp.id, emp.id]);
      const shift = emp.shift_id ? db.get('SELECT * FROM shifts WHERE id=?', [emp.shift_id]) : null;
      const upcomingEvents = db.all('SELECT * FROM events WHERE date >= ? ORDER BY date ASC LIMIT 5', [t]);
      return res.render('dashboard_employee', {
        title: 'داشبورد', emp, att, balances, payslip, goals, announcements, myRequests, shift, upcomingEvents,
        today: t, nowTime: utils.nowTime(tz()), currency: currency()
      });
    }

    // نمای مدیریتی
    const activeEmp = db.count(`SELECT COUNT(*) AS c FROM employees WHERE status='active'`);
    const presentToday = db.count(`SELECT COUNT(*) AS c FROM attendance WHERE date=? AND status='present'`, [t]);
    const onLeaveToday = db.count(`SELECT COUNT(*) AS c FROM attendance WHERE date=? AND status='leave'`, [t]) +
      db.count(`SELECT COUNT(*) AS c FROM leave_requests WHERE status='approved' AND from_date<=? AND to_date>=? AND employee_id NOT IN (SELECT employee_id FROM attendance WHERE date=? AND status='leave')`, [t, t, t]);
    const absentToday = db.count(`SELECT COUNT(*) AS c FROM attendance WHERE date=? AND status='absent'`, [t]);
    const noRecord = Math.max(0, activeEmp - presentToday - onLeaveToday - absentToday);
    const pendingLeaves = db.count(`SELECT COUNT(*) AS c FROM leave_requests WHERE status='pending'`);
    const pendingOt = db.count(`SELECT COUNT(*) AS c FROM overtime_requests WHERE status='pending'`);
    const pendingExp = db.count(`SELECT COUNT(*) AS c FROM expenses WHERE status='pending'`);
    const openTickets = db.count(`SELECT COUNT(*) AS c FROM tickets WHERE status IN ('open','answered')`);
    const in30 = utils.addDaysIso(t, 30);
    const expiringContracts = db.all(`SELECT c.*, e.first_name, e.last_name, e.code FROM contracts c JOIN employees e ON e.id=c.employee_id
      WHERE c.status='active' AND c.end_date IS NOT NULL AND c.end_date BETWEEN ? AND ? ORDER BY c.end_date LIMIT 8`, [t, in30]);
    const expiringDocs = db.all(`SELECT d.*, e.first_name, e.last_name FROM employee_documents d JOIN employees e ON e.id=d.employee_id
      WHERE d.expiry_date IS NOT NULL AND d.expiry_date BETWEEN ? AND ? ORDER BY d.expiry_date LIMIT 8`, [t, in30]);
    const upcomingHolidays = db.all('SELECT * FROM holidays WHERE date >= ? ORDER BY date LIMIT 5', [t]);
    // تولدهای پیش‌رو (۱۵ روز آینده)
    const emps = db.all(`SELECT id, first_name, last_name, birth_date, photo, designation_id FROM employees WHERE status='active' AND birth_date IS NOT NULL AND birth_date != ''`);
    const desigs = {}; db.all('SELECT id,name FROM designations').forEach(d => desigs[d.id] = d.name);
    const birthdays = emps.map(e => {
      const b = nextBirthdayIn(e.birth_date, t);
      return b ? { ...e, inDays: b.inDays, date: b.date } : null;
    }).filter(Boolean).sort((a, b) => a.inDays - b.inDays).slice(0, 6);
    const announcements = visibleAnnouncements(req.user, 5);
    // نمودارها
    const hires = hiresLastMonths(12, tz());
    const deptDist = db.all(`SELECT d.name, COUNT(e.id) AS c FROM departments d LEFT JOIN employees e ON e.department_id=d.id AND e.status='active' GROUP BY d.id ORDER BY c DESC`);
    const week = weekAttendance(t);
    const payrollTrend = db.all(`SELECT month, SUM(net) AS net, COUNT(*) AS c FROM payrolls WHERE status='final' GROUP BY month ORDER BY month DESC LIMIT 6`);
    payrollTrend.reverse();
    const pendingApprovals = db.all(`SELECT lr.*, e.first_name, e.last_name, lt.name AS type_name, lt.color FROM leave_requests lr
      JOIN employees e ON e.id=lr.employee_id JOIN leave_types lt ON lt.id=lr.leave_type_id
      WHERE lr.status='pending' ORDER BY lr.created_at DESC LIMIT 6`);
    const recentLogs = db.all(`SELECT l.*, u.username FROM activity_logs l LEFT JOIN users u ON u.id=l.user_id ORDER BY l.id DESC LIMIT 8`);
    res.render('dashboard', {
      title: 'داشبورد مدیریتی',
      stats: { activeEmp, presentToday, onLeaveToday, absentToday, noRecord, pendingLeaves, pendingOt, pendingExp, openTickets },
      expiringContracts, expiringDocs, upcomingHolidays, birthdays, announcements,
      charts: { hires, deptDist, week, payrollTrend },
      pendingApprovals, recentLogs, today: t, desigs, currency: currency()
    });
  });

  function nextBirthdayIn(birthIso, todayIso) {
    const m = String(birthIso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    const j = utils.toJalali(+m[1], +m[2], +m[3]);
    const cm = utils.toJalali(...todayIso.split('-').map(Number));
    // تولد شمسی امسال و سال بعد
    for (const y of [cm.jy, cm.jy + 1]) {
      const g = utils.toGregorian(y, j.jm, j.jd);
      const iso = `${g.gy}-${String(g.gm).padStart(2, '0')}-${String(g.gd).padStart(2, '0')}`;
      const diff = utils.daysBetween(todayIso, iso);
      if (diff >= 0 && diff <= 30) return { inDays: diff, date: iso };
    }
    return null;
  }

  function hiresLastMonths(n, tzo) {
    const cm = utils.toJalali(...utils.todayIso(tzo).split('-').map(Number));
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
      let y = cm.jy, mo = cm.jm - i;
      while (mo <= 0) { mo += 12; y--; }
      const r1 = utils.toGregorian(y, mo, 1);
      let y2 = y, m2 = mo + 1; if (m2 > 12) { y2++; m2 = 1; }
      const r2 = utils.toGregorian(y2, m2, 1);
      const iso = d => `${d.gy}-${String(d.gm).padStart(2, '0')}-${String(d.gd).padStart(2, '0')}`;
      const endIso = utils.addDaysIso(iso(r2), -1);
      const c = db.count(`SELECT COUNT(*) AS c FROM employees WHERE hire_date BETWEEN ? AND ?`, [iso(r1), endIso]);
      out.push({ label: `${utils.FA_MONTHS[mo - 1]} ${utils.faNum(String(y).slice(2))}`, count: c });
    }
    return out;
  }

  function weekAttendance(t) {
    const out = [];
    for (let i = 6; i >= 0; i--) {
      const d = utils.addDaysIso(t, -i);
      out.push({
        date: d, label: utils.jDate(d).slice(5),
        present: db.count(`SELECT COUNT(*) AS c FROM attendance WHERE date=? AND status='present'`, [d]),
        absent: db.count(`SELECT COUNT(*) AS c FROM attendance WHERE date=? AND status='absent'`, [d]),
        leave: db.count(`SELECT COUNT(*) AS c FROM attendance WHERE date=? AND status='leave'`, [d])
      });
    }
    return out;
  }

  function visibleAnnouncements(user, limit) {
    const t = utils.todayIso(tz());
    return db.all(`SELECT a.*, d.name AS dept_name FROM announcements a LEFT JOIN departments d ON d.id=a.department_id
      WHERE (a.publish_date IS NULL OR a.publish_date <= ?) AND (a.expire_date IS NULL OR a.expire_date >= ?)
      AND (a.audience='all' OR (a.audience='department' AND a.department_id IN (SELECT department_id FROM employees WHERE id=?)))
      ORDER BY a.pinned DESC, a.publish_date DESC LIMIT ${limit}`, [t, t, user.employee_id || -1]);
  }

  function leaveBalances(empId) {
    const y = utils.toJalali(...utils.todayIso(tz()).split('-').map(Number)).jy;
    const g1 = utils.toGregorian(y, 1, 1);
    const yearStart = `${g1.gy}-${String(g1.gm).padStart(2, '0')}-${String(g1.gd).padStart(2, '0')}`;
    const types = db.all('SELECT * FROM leave_types');
    return types.map(lt => {
      const used = db.count(`SELECT COALESCE(SUM(days),0) AS s FROM leave_requests WHERE employee_id=? AND leave_type_id=? AND status='approved' AND from_date >= ?`, [empId, lt.id, yearStart]);
      const pending = db.count(`SELECT COALESCE(SUM(days),0) AS s FROM leave_requests WHERE employee_id=? AND leave_type_id=? AND status='pending'`, [empId, lt.id]);
      return { ...lt, used, pending, remaining: Math.max(0, (lt.annual_quota || 0) - used) };
    });
  }
  app.locals.leaveBalances = leaveBalances;
  app.locals.nextBirthdayIn = nextBirthdayIn;

  // ---------- جستجوی سراسری ----------
  app.get('/search', H.authRequired, (req, res) => {
    const q = (req.query.q || '').trim();
    let results = null;
    if (q.length >= 2) {
      const like = `%${q}%`;
      results = { employees: [], announcements: [], documents: [], candidates: [], tickets: [] };
      if (H.can(req.user, 'employees') || H.can(req.user, 'directory')) {
        results.employees = db.all(`SELECT id, first_name, last_name, code FROM employees WHERE (first_name LIKE ? OR last_name LIKE ? OR code LIKE ? OR national_id LIKE ?) LIMIT 10`, [like, like, like, like]);
      }
      if (H.can(req.user, 'announcements')) {
        results.announcements = db.all(`SELECT id, title FROM announcements WHERE title LIKE ? OR body LIKE ? LIMIT 8`, [like, like]);
      }
      if (H.can(req.user, 'documents')) {
        results.documents = db.all(`SELECT id, title FROM documents WHERE title LIKE ? LIMIT 8`, [like]);
      }
      if (H.can(req.user, 'recruitment')) {
        results.candidates = db.all(`SELECT id, name FROM candidates WHERE name LIKE ? OR phone LIKE ? LIMIT 8`, [like, like]);
      }
      if (H.can(req.user, 'tickets')) {
        results.tickets = db.all(`SELECT id, subject FROM tickets WHERE subject LIKE ? AND (user_id=? OR ? IN ('admin','hr')) LIMIT 8`, [like, req.user.id, req.user.role]);
      }
    }
    res.render('search', { title: 'نتایج جستجو', q, results });
  });

  // ---------- اعلان‌ها ----------
  app.get('/notifications', H.authRequired, (req, res) => {
    const rows = db.all('SELECT * FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 60', [req.user.id]);
    res.render('notifications', { title: 'اعلان‌ها', rows });
  });
  app.post('/notifications/read', H.authRequired, (req, res) => {
    db.run('UPDATE notifications SET is_read=1 WHERE user_id=?', [req.user.id]);
    res.redirect(req.body.back || '/notifications');
  });
  app.post('/notifications/:id/read', H.authRequired, (req, res) => {
    db.run('UPDATE notifications SET is_read=1 WHERE id=? AND user_id=?', [req.params.id, req.user.id]);
    res.redirect(req.body.link || '/notifications');
  });

  // ---------- پروفایل من ----------
  app.get('/profile', H.authRequired, (req, res) => {
    const emp = req.user.employee_id ? db.get('SELECT e.*, d.name AS dept_name, dg.name AS desig_name FROM employees e LEFT JOIN departments d ON d.id=e.department_id LEFT JOIN designations dg ON dg.id=e.designation_id WHERE e.id=?', [req.user.employee_id]) : null;
    res.render('profile', { title: 'پروفایل من', emp, done: req.query.saved ? true : false });
  });
  app.post('/profile/contact', H.authRequired, (req, res) => {
    if (!req.user.employee_id) return res.redirect('/profile');
    db.update('employees', req.user.employee_id, {
      phone: String(req.body.phone || '').trim(), email: String(req.body.email || '').trim(), address: String(req.body.address || '').trim()
    });
    H.log(req, 'update', 'self-profile', req.user.employee_id, '');
    res.redirect('/profile?saved=1');
  });

  // ---------- دانلود فایل‌ها با کنترل دسترسی ----------
  app.get('/files/:kind/:id', H.authRequired, (req, res) => {
    const { kind, id } = req.params;
    let row = null, filePath = '', name = 'file';
    const isHr = ['admin', 'hr'].includes(req.user.role);
    const isMine = (empId) => req.user.employee_id && req.user.employee_id === empId;
    switch (kind) {
      case 'edoc': {
        if (!H.can(req.user, 'employee_documents') && !isHr) return res.status(403).send('دسترسی غیرمجاز');
        row = db.get('SELECT * FROM employee_documents WHERE id=?', [id]);
        filePath = row && row.file_path; name = (row ? row.title : 'document');
        break;
      }
      case 'doc': {
        row = db.get('SELECT * FROM documents WHERE id=?', [id]);
        if (row && row.visibility === 'hr' && !isHr && !H.can(req.user, 'documents')) {
          return res.status(403).send('این سند فقط برای منابع انسانی قابل دسترسی است.');
        }
        filePath = row && row.file_path; name = (row ? row.title : 'document');
        if (row) { db.run('UPDATE documents SET downloads=downloads+1 WHERE id=?', [row.id]); }
        break;
      }
      case 'contract': {
        if (!H.can(req.user, 'contracts') && !isHr) return res.status(403).send('دسترسی غیرمجاز');
        row = db.get('SELECT * FROM contracts WHERE id=?', [id]);
        filePath = row && row.file_path; name = 'contract-' + id;
        break;
      }
      case 'resume': {
        if (!H.can(req.user, 'recruitment')) return res.status(403).send('دسترسی غیرمجاز');
        row = db.get('SELECT * FROM candidates WHERE id=?', [id]);
        filePath = row && row.resume_path; name = 'resume-' + (row ? row.name : id);
        break;
      }
      case 'receipt': {
        row = db.get('SELECT * FROM expenses WHERE id=?', [id]);
        if (!row || (!isHr && !isMine(row.employee_id) && !H.can(req.user, 'expenses'))) return res.status(403).send('دسترسی غیرمجاز');
        filePath = row && row.receipt_path; name = 'receipt-' + id;
        break;
      }
      case 'leave': {
        row = db.get('SELECT * FROM leave_requests WHERE id=?', [id]);
        if (!row || (!isHr && !isMine(row.employee_id))) return res.status(403).send('دسترسی غیرمجاز');
        filePath = row && row.attachment; name = 'leave-doc-' + id;
        break;
      }
      case 'cert': {
        row = db.get('SELECT * FROM training_enrollments WHERE id=?', [id]);
        if (!row || (!isHr && !isMine(row.employee_id))) return res.status(403).send('دسترسی غیرمجاز');
        filePath = row && row.certificate_path; name = 'certificate-' + id;
        break;
      }
      default: return res.status(404).send('یافت نشد');
    }
    if (!row || !filePath) return res.status(404).send('فایل یافت نشد');
    const abs = path.join(db.DATA_DIR, filePath.replace(/^uploads\//, 'uploads/'));
    if (!fs.existsSync(abs)) return res.status(404).send('فایل روی دیسک یافت نشد');
    res.download(abs, name + path.extname(abs));
  });
};
