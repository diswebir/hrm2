'use strict';
/** مرکز گزارش‌ها */
const express = require('express');
const db = require('../src/db');
const utils = require('../src/utils');
const H = require('../src/helpers');

module.exports = function (app) {
  const tz = () => parseInt(db.getSetting('tz_offset', '210'), 10) || 210;
  const currency = () => db.getSetting('currency', 'تومان');
  const r = express.Router();
  r.use(H.authRequired, H.permRequired('reports'));

  r.get('/', (req, res) => {
    const counts = {
      employees: db.count(`SELECT COUNT(*) AS c FROM employees WHERE status='active'`),
      attendance: db.count('SELECT COUNT(*) AS c FROM attendance'),
      leaves: db.count('SELECT COUNT(*) AS c FROM leave_requests'),
      payrolls: db.count('SELECT COUNT(*) AS c FROM payrolls'),
      candidates: db.count('SELECT COUNT(*) AS c FROM candidates'),
      expenses: db.count('SELECT COUNT(*) AS c FROM expenses')
    };
    res.render('reports/index', { title: 'مرکز گزارش', counts });
  });

  // گزارش حضور ماهانه خلاصه
  r.get('/attendance-summary', (req, res) => {
    const today = utils.todayIso(tz());
    const from = req.query.from && utils.gDate(req.query.from) ? utils.gDate(req.query.from) : utils.addDaysIso(today, -29);
    const to = req.query.to && utils.gDate(req.query.to) ? utils.gDate(req.query.to) : today;
    const dept = req.query.dept || '';
    let sql = `SELECT e.id, e.code, e.first_name, e.last_name, d.name AS dept_name,
      SUM(CASE WHEN a.status='present' THEN 1 ELSE 0 END) AS present,
      SUM(CASE WHEN a.status='absent' THEN 1 ELSE 0 END) AS absent,
      SUM(CASE WHEN a.status='leave' THEN 1 ELSE 0 END) AS leaves,
      SUM(CASE WHEN a.status='mission' THEN 1 ELSE 0 END) AS mission,
      SUM(a.late_minutes) AS late, SUM(a.overtime_minutes) AS ot, SUM(a.worked_minutes) AS worked
      FROM employees e LEFT JOIN attendance a ON a.employee_id=e.id AND a.date BETWEEN ? AND ?
      LEFT JOIN departments d ON d.id=e.department_id WHERE e.status='active'`;
    const params = [from, to];
    if (dept) { sql += ' AND e.department_id=?'; params.push(dept); }
    sql += ' GROUP BY e.id ORDER BY e.last_name';
    const rows = db.all(sql, params);
    if (req.query.csv) {
      const csv = utils.toCsv(['کد', 'کارمند', 'واحد', 'حاضر', 'غایب', 'مرخصی', 'مأموریت', 'جمع تأخیر (دقیقه)', 'جمع اضافه‌کاری (دقیقه)', 'جمع کارکرد (دقیقه)'],
        rows.map(x => [x.code, `${x.first_name} ${x.last_name}`, x.dept_name || '', x.present, x.absent, x.leaves, x.mission, x.late, x.ot, x.worked]));
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="attendance-summary.csv"');
      return res.send(csv);
    }
    res.render('reports/attendance_summary', { title: 'خلاصه حضور و غیاب', rows, from, to, dept, jDateEn: utils.jDateEn, depts: db.all('SELECT id,name FROM departments ORDER BY name') });
  });

  // گزارش تولدها
  r.get('/birthdays', (req, res) => {
    const today = utils.todayIso(tz());
    const emps = db.all(`SELECT id, first_name, last_name, birth_date, photo, phone, department_id FROM employees WHERE status='active' AND birth_date IS NOT NULL AND birth_date != ''`);
    const depts = {}; db.all('SELECT id,name FROM departments').forEach(d => depts[d.id] = d.name);
    const cj = utils.toJalali(...today.split('-').map(Number));
    const rows = emps.map(e => {
      const bj = utils.toJalali(...e.birth_date.split('-').map(Number));
      let nextYear = cj.jy;
      const gThis = utils.toGregorian(cj.jy, bj.jm, bj.jd);
      const isoThis = `${gThis.gy}-${String(gThis.gm).padStart(2, '0')}-${String(gThis.gd).padStart(2, '0')}`;
      let diff = utils.daysBetween(today, isoThis);
      if (diff < 0) {
        const gNext = utils.toGregorian(cj.jy + 1, bj.jm, bj.jd);
        const isoNext = `${gNext.gy}-${String(gNext.gm).padStart(2, '0')}-${String(gNext.gd).padStart(2, '0')}`;
        diff = utils.daysBetween(today, isoNext);
      }
      return { ...e, dept_name: depts[e.department_id] || '', jd: bj.jd, jm: bj.jm, inDays: diff };
    }).filter(x => x.inDays <= 45).sort((a, b) => a.inDays - b.inDays);
    res.render('reports/birthdays', { title: 'تولدها و مناسبت‌ها', rows, today });
  });

  // موارد در حال انقضا (قرارداد + مدرک)
  r.get('/expiring', (req, res) => {
    const today = utils.todayIso(tz());
    const within = parseInt(req.query.within || '30', 10) || 30;
    const until = utils.addDaysIso(today, within);
    const contracts = db.all(`SELECT c.*, e.first_name, e.last_name, e.code FROM contracts c JOIN employees e ON e.id=c.employee_id
      WHERE c.status='active' AND c.end_date IS NOT NULL AND c.end_date BETWEEN ? AND ? ORDER BY c.end_date`, [today, until]);
    const docs = db.all(`SELECT d.*, e.first_name, e.last_name, e.code FROM employee_documents d JOIN employees e ON e.id=d.employee_id
      WHERE d.expiry_date IS NOT NULL AND d.expiry_date BETWEEN ? AND ? ORDER BY d.expiry_date`, [today, until]);
    const empContracts = db.all(`SELECT e.*, e.contract_end AS end_date FROM employees e WHERE e.status='active' AND e.contract_end IS NOT NULL AND e.contract_end BETWEEN ? AND ?`, [today, until]);
    if (req.query.csv) {
      const all = [
        ...contracts.map(c => ['قرارداد', `${c.first_name} ${c.last_name}`, c.title, utils.jDateEn(c.end_date), utils.daysBetween(today, c.end_date)]),
        ...docs.map(d => ['مدرک', `${d.first_name} ${d.last_name}`, d.title, utils.jDateEn(d.expiry_date), utils.daysBetween(today, d.expiry_date)]),
        ...empContracts.map(e => ['قرارداد کارمند', `${e.first_name} ${e.last_name}`, 'پایان همکاری ثبت‌شده', utils.jDateEn(e.contract_end), utils.daysBetween(today, e.contract_end)])
      ];
      const csv = utils.toCsv(['نوع', 'کارمند', 'عنوان', 'تاریخ انقضا', 'روز باقی‌مانده'], all);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="expiring.csv"');
      return res.send(csv);
    }
    res.render('reports/expiring', { title: 'موارد در حال انقضا', contracts, docs, empContracts, within, today });
  });

  // گزارش عملکرد
  r.get('/performance', (req, res) => {
    const emps = db.all(`SELECT id, first_name, last_name, code FROM employees WHERE status='active' ORDER BY last_name`);
    const rows = emps.map(e => {
      const avgScore = db.get(`SELECT AVG(total) AS s FROM appraisals WHERE employee_id=?`, [e.id]);
      const goalStats = db.get(`SELECT COUNT(*) AS total, AVG(progress) AS avg_progress, SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) AS done FROM goals WHERE employee_id=?`, [e.id]);
      return { ...e, avgScore: avgScore && avgScore.s ? Math.round(avgScore.s * 100) / 100 : null, goals: goalStats };
    }).filter(x => x.avgScore != null || (x.goals && x.goals.total > 0));
    res.render('reports/performance', { title: 'گزارش عملکرد', rows });
  });

  // گزارش آموزش
  r.get('/training', (req, res) => {
    const rows = db.all(`SELECT t.*,
      (SELECT COUNT(*) FROM training_enrollments te WHERE te.training_id=t.id) AS enrolled,
      (SELECT COUNT(*) FROM training_enrollments te WHERE te.training_id=t.id AND te.status='completed') AS completed
      FROM trainings t ORDER BY t.id DESC`);
    const totalCost = db.count('SELECT COALESCE(SUM(cost),0) AS s FROM trainings');
    res.render('reports/training', { title: 'گزارش آموزش', rows, totalCost, currency: currency() });
  });

  // هزینه حقوق ماهانه
  r.get('/payroll-cost', (req, res) => {
    const rows = db.all(`SELECT month, COUNT(*) AS c, SUM(base) AS base, SUM(overtime_amount) AS ot, SUM(allowances) AS allowances,
      SUM(insurance) AS insurance, SUM(tax) AS tax, SUM(loan_deduction) AS loan, SUM(net) AS net
      FROM payrolls WHERE status='final' GROUP BY month ORDER BY month DESC LIMIT 24`);
    res.render('reports/payroll_cost', { title: 'گزارش هزینه حقوق', rows, currency: currency() });
  });

  // ترکیب اشتغال و پرسنل
  r.get('/headcount', (req, res) => {
    const byDept = db.all(`SELECT d.name, COUNT(e.id) AS c FROM departments d LEFT JOIN employees e ON e.department_id=d.id AND e.status='active' GROUP BY d.id ORDER BY c DESC`);
    const byType = db.all(`SELECT contract_type, COUNT(*) AS c FROM employees WHERE status='active' GROUP BY contract_type`);
    const byStatus = db.all(`SELECT status, COUNT(*) AS c FROM employees GROUP BY status`);
    const byGender = db.all(`SELECT gender, COUNT(*) AS c FROM employees WHERE status='active' GROUP BY gender`);
    const byBranch = db.all(`SELECT b.name, COUNT(e.id) AS c FROM branches b LEFT JOIN employees e ON e.branch_id=b.id AND e.status='active' GROUP BY b.id ORDER BY c DESC`);
    if (req.query.csv) {
      const csv = utils.toCsv(['دپارتمان', 'تعداد کارکنان فعال'], byDept.map(x => [x.name, x.c]));
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="headcount.csv"');
      return res.send(csv);
    }
    res.render('reports/headcount', { title: 'ترکیب نیروی انسانی', byDept, byType, byStatus, byGender, byBranch });
  });

  app.use('/reports', r);
};
