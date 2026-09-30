'use strict';
/** حضور و غیاب: ثبت روزانه، تقویم، گزارش، ثبت خودکار کارمند، اضافه‌کاری */
const express = require('express');
const db = require('../src/db');
const utils = require('../src/utils');
const H = require('../src/helpers');

module.exports = function (app) {
  const tz = () => parseInt(db.getSetting('tz_offset', '210'), 10) || 210;

  /** محاسبه تأخیر/تعجیل/کارکرد بر اساس شیفت */
  function calcShift(emp, date, checkIn, checkOut) {
    const shift = emp.shift_id ? db.get('SELECT * FROM shifts WHERE id=?', [emp.shift_id]) : null;
    const start = shift ? shift.start_time : '09:00';
    const end = shift ? shift.end_time : '17:00';
    const brk = shift ? (shift.break_minutes || 0) : 0;
    const grace = shift ? (shift.grace_minutes || 0) : 0;
    const workDays = (shift && shift.work_days ? shift.work_days : '0,1,2,3,4').split(',').map(Number);
    const wd = utils.isoWeekdaySat(date);
    const isWorkday = workDays.includes(wd);
    const holiday = db.get('SELECT id FROM holidays WHERE date=?', [date]);
    const toMin = t => { if (!t) return null; const m = String(t).match(/^(\d{1,2}):(\d{2})/); return m ? (+m[1]) * 60 + (+m[2]) : null; };
    let late = 0, early = 0, worked = 0, ot = 0;
    if (checkIn && !isWorkday) { /* روز تعطیل: بدون تأخیر */ }
    else if (checkIn && isWorkday && !holiday) {
      const inMin = toMin(checkIn), startMin = toMin(start) + grace;
      if (inMin != null && inMin > startMin) late = inMin - startMin;
    }
    if (checkIn && checkOut) {
      const inMin = toMin(checkIn), outMin = toMin(checkOut);
      if (inMin != null && outMin != null) {
        const dur = outMin - inMin - brk;
        worked = Math.max(0, dur);
        if (isWorkday && !holiday) {
          const shiftLen = Math.max(0, toMin(end) - toMin(start) - brk);
          if (outMin < toMin(end)) early = toMin(end) - outMin;
          if (worked > shiftLen) ot = worked - shiftLen;
        } else {
          ot = worked; // کار در روز تعطیل کلش اضافه‌کاری است
        }
      }
    }
    return { late, early, worked, ot, isWorkday, isHoliday: !!holiday };
  }

  // ---------- ثبت خودکار کارمند (Self check-in/out) ----------
  app.post('/attendance/self', H.authRequired, (req, res) => {
    if (!req.user.employee_id) return res.redirect('/');
    const emp = db.get('SELECT * FROM employees WHERE id=?', [req.user.employee_id]);
    const t = utils.todayIso(tz());
    const time = utils.nowTime(tz());
    let row = db.get('SELECT * FROM attendance WHERE employee_id=? AND date=?', [emp.id, t]);
    if (!row) {
      const c = calcShift(emp, t, time, null);
      db.insert('attendance', {
        employee_id: emp.id, date: t, check_in: time, check_out: null, status: 'present',
        late_minutes: c.late, early_minutes: 0, overtime_minutes: 0, worked_minutes: 0, source: 'self', note: ''
      });
      H.log(req, 'checkin', 'attendance', emp.id, time);
    } else if (row.check_in && !row.check_out) {
      const c = calcShift(emp, t, row.check_in, time);
      db.update('attendance', row.id, {
        check_out: time, overtime_minutes: c.ot, worked_minutes: c.worked, early_minutes: c.early
      });
      H.log(req, 'checkout', 'attendance', emp.id, time);
    }
    res.redirect('/?tab=attendance');
  });

  // ---------- حضور روزانه (مدیریت) ----------
  app.get('/attendance', H.authRequired, H.permRequired('attendance'), (req, res) => {
    const date = req.query.date && utils.gDate(req.query.date) ? utils.gDate(req.query.date) : utils.todayIso(tz());
    const dept = req.query.dept || '';
    let emps = db.all(`SELECT e.*, d.name AS dept_name, sh.name AS shift_name, sh.start_time AS shift_start, sh.end_time AS shift_end FROM employees e
      LEFT JOIN departments d ON d.id=e.department_id LEFT JOIN shifts sh ON sh.id=e.shift_id
      WHERE e.status='active' ${dept ? 'AND e.department_id=' + parseInt(dept, 10) : ''} ORDER BY e.last_name, e.first_name`);
    const records = db.all('SELECT * FROM attendance WHERE date=?', [date]);
    const byEmp = {}; records.forEach(r => byEmp[r.employee_id] = r);
    const holiday = db.get('SELECT * FROM holidays WHERE date=?', [date]);
    res.render('attendance/daily', {
      title: 'حضور روزانه', date, emps, byEmp, holiday, dept,
      jDateEn: utils.jDateEn, depts: db.all('SELECT id,name FROM departments ORDER BY name')
    });
  });

  app.post('/attendance/save', H.authRequired, H.permRequired('attendance'), (req, res) => {
    const { employee_id, date, check_in, check_out, status, note } = req.body;
    const emp = db.get('SELECT * FROM employees WHERE id=?', [employee_id]);
    if (!emp || !utils.gDate(date)) { req.flash = null; return res.redirect('/attendance'); }
    const d = utils.gDate(date);
    const ci = check_in || null, co = check_out || null;
    const st = status || (ci ? 'present' : 'absent');
    const c = (st === 'present') ? calcShift(emp, d, ci, co) : { late: 0, early: 0, worked: 0, ot: 0 };
    const ex = db.get('SELECT id FROM attendance WHERE employee_id=? AND date=?', [emp.id, d]);
    const data = {
      check_in: ci, check_out: co, status: st,
      late_minutes: c.late, early_minutes: c.early, overtime_minutes: c.ot, worked_minutes: c.worked,
      source: 'manual', note: note || ''
    };
    if (ex) db.update('attendance', ex.id, data);
    else db.insert('attendance', { employee_id: emp.id, date: d, ...data });
    H.log(req, 'save', 'attendance', emp.id, d);
    res.redirect('/attendance?date=' + encodeURIComponent(utils.jDateEn(d)) + '&saved=1');
  });

  app.post('/attendance/:id/delete', H.authRequired, H.permRequired('attendance'), (req, res) => {
    const row = db.get('SELECT * FROM attendance WHERE id=?', [req.params.id]);
    db.del('attendance', req.params.id);
    H.log(req, 'delete', 'attendance', req.params.id, row ? row.date : '');
    res.redirect('/attendance?date=' + encodeURIComponent(row ? utils.jDateEn(row.date) : ''));
  });

  // ---------- تقویم حضور ----------
  app.get('/attendance/calendar', H.authRequired, H.permRequired('attendance'), (req, res) => {
    const empId = parseInt(req.query.employee, 10) || (req.user.employee_id || 0);
    const emp = empId ? db.get('SELECT * FROM employees WHERE id=?', [empId]) : null;
    const today = utils.todayIso(tz());
    const cj = utils.toJalali(...today.split('-').map(Number));
    const jy = parseInt(utils.enNum(req.query.jy || ''), 10) || cj.jy;
    const jm = parseInt(utils.enNum(req.query.jm || ''), 10) || cj.jm;
    const range = utils.jMonthRange(jy, jm);
    const days = [];
    let d = range.start;
    while (d <= range.end) {
      const rec = emp ? db.get('SELECT * FROM attendance WHERE employee_id=? AND date=?', [emp.id, d]) : null;
      const isHol = !!db.get('SELECT id FROM holidays WHERE date=?', [d]);
      const wd = utils.isoWeekdaySat(d);
      days.push({ date: d, rec, weekend: wd === 6, holiday: isHol, jd: utils.toJalali(...d.split('-').map(Number)) });
      d = utils.addDaysIso(d, 1);
    }
    res.render('attendance/calendar', {
      title: 'تقویم حضور', emp, days, jy, jm, monthName: utils.FA_MONTHS[jm - 1],
      emps: db.all(`SELECT id, first_name, last_name FROM employees WHERE status='active' ORDER BY last_name`)
    });
  });

  // ---------- گزارش حضور ----------
  app.get('/attendance/report', H.authRequired, H.permRequired('attendance'), (req, res) => {
    const today = utils.todayIso(tz());
    const from = req.query.from && utils.gDate(req.query.from) ? utils.gDate(req.query.from) : utils.addDaysIso(today, -29);
    const to = req.query.to && utils.gDate(req.query.to) ? utils.gDate(req.query.to) : today;
    const empId = req.query.employee || '';
    const dept = req.query.dept || '';
    const status = req.query.status || '';
    let sql = `SELECT a.*, e.first_name, e.last_name, e.code, d.name AS dept_name FROM attendance a
      JOIN employees e ON e.id=a.employee_id LEFT JOIN departments d ON d.id=e.department_id
      WHERE a.date BETWEEN ? AND ?`;
    const params = [from, to];
    if (empId) { sql += ' AND a.employee_id=?'; params.push(empId); }
    if (dept) { sql += ' AND e.department_id=?'; params.push(dept); }
    if (status) { sql += ' AND a.status=?'; params.push(status); }
    sql += ' ORDER BY a.date DESC, e.last_name LIMIT 1000';
    const rows = db.all(sql, params);
    if (req.query.csv) {
      const csv = utils.toCsv(['تاریخ', 'کد', 'کارمند', 'واحد', 'ورود', 'خروج', 'تأخیر (دقیقه)', 'تعجیل', 'کارکرد (دقیقه)', 'اضافه‌کاری', 'وضعیت'],
        rows.map(r => [utils.jDateEn(r.date), r.code, `${r.first_name} ${r.last_name}`, r.dept_name || '', r.check_in || '', r.check_out || '', r.late_minutes, r.early_minutes, r.worked_minutes, r.overtime_minutes, utils.label(r.status)]));
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="attendance-report.csv"');
      return res.send(csv);
    }
    const summary = db.get(`SELECT COUNT(*) AS days, SUM(CASE WHEN a.status='present' THEN 1 ELSE 0 END) AS present,
      SUM(CASE WHEN a.status='absent' THEN 1 ELSE 0 END) AS absent, SUM(CASE WHEN a.status='leave' THEN 1 ELSE 0 END) AS leaves,
      SUM(a.late_minutes) AS late, SUM(a.overtime_minutes) AS ot, SUM(a.worked_minutes) AS worked FROM attendance a
      JOIN employees e ON e.id=a.employee_id WHERE a.date BETWEEN ? AND ? ${empId ? 'AND a.employee_id=' + parseInt(empId, 10) : ''}`, [from, to]);
    res.render('attendance/report', {
      title: 'گزارش حضور', rows, from, to, empId, dept, status, summary,
      jDateEn: utils.jDateEn,
      emps: db.all(`SELECT id, first_name, last_name FROM employees WHERE status='active' ORDER BY last_name`),
      depts: db.all('SELECT id,name FROM departments ORDER BY name')
    });
  });

  // ---------- اضافه‌کاری ----------
  app.get('/overtime', H.authRequired, H.permRequired('overtime'), (req, res) => {
    const mine = !['admin', 'hr'].includes(req.user.role);
    const empId = req.user.employee_id;
    const rows = mine && empId
      ? db.all(`SELECT o.*, e.first_name, e.last_name FROM overtime_requests o JOIN employees e ON e.id=o.employee_id WHERE o.employee_id=? ORDER BY o.id DESC LIMIT 100`, [empId])
      : db.all(`SELECT o.*, e.first_name, e.last_name FROM overtime_requests o JOIN employees e ON e.id=o.employee_id ORDER BY o.id DESC LIMIT 200`);
    res.render('attendance/overtime', { title: 'اضافه‌کاری', rows, mine, jDateEn: utils.jDateEn });
  });

  app.post('/overtime', H.authRequired, H.permRequired('overtime'), (req, res) => {
    if (!req.user.employee_id) return res.redirect('/overtime');
    const b = req.body;
    const date = utils.gDate(b.date);
    const hours = parseFloat(utils.enNum(b.hours || '1').replace(/,/g, '')) || 1;
    if (!date) return res.redirect('/overtime?error=date');
    const id = db.insert('overtime_requests', {
      employee_id: req.user.employee_id, date, hours, reason: b.reason || '', status: 'pending',
      approver_id: null, decision_note: '', created_at: utils.nowDateTime(tz()), decided_at: null
    });
    H.notify(H.approversOf(req.user.employee_id), 'درخواست اضافه‌کاری جدید', `${req.user.name} برای ${utils.jDate(date)} درخواست ${utils.faNum(hours)} ساعت اضافه‌کاری ثبت کرد.`, '/overtime/approvals');
    H.log(req, 'create', 'overtime_requests', id, '');
    res.redirect('/overtime?saved=1');
  });

  app.get('/overtime/approvals', H.authRequired, H.permRequired('overtime'), (req, res) => {
    const rows = db.all(`SELECT o.*, e.first_name, e.last_name, e.code FROM overtime_requests o JOIN employees e ON e.id=o.employee_id ORDER BY CASE o.status WHEN 'pending' THEN 0 ELSE 1 END, o.id DESC LIMIT 200`);
    res.render('attendance/overtime_approvals', { title: 'تایید اضافه‌کاری', rows, jDateEn: utils.jDateEn });
  });

  app.post('/overtime/:id/decide', H.authRequired, H.permRequired('overtime'), (req, res) => {
    const row = db.get('SELECT * FROM overtime_requests WHERE id=?', [req.params.id]);
    if (!row || row.status !== 'pending') return res.redirect('/overtime/approvals');
    const decision = req.body.decision === 'approve' ? 'approved' : 'rejected';
    db.update('overtime_requests', row.id, { status: decision, approver_id: req.user.id, decision_note: req.body.note || '', decided_at: utils.nowDateTime(tz()) });
    const u = db.get('SELECT id FROM users WHERE employee_id=? AND is_active=1', [row.employee_id]);
    if (u) H.notify(u.id, `درخواست اضافه‌کاری ${decision === 'approved' ? 'تایید' : 'رد'} شد`, req.body.note || '', '/overtime');
    H.log(req, decision, 'overtime_requests', row.id, '');
    res.redirect('/overtime/approvals');
  });
};
