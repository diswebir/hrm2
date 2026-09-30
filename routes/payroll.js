'use strict';
/** حقوق و دستمزد: صدور لیست ماهانه، ویرایش ردیف‌ها، نهایی‌سازی، فیش حقوقی */
const express = require('express');
const db = require('../src/db');
const utils = require('../src/utils');
const H = require('../src/helpers');

module.exports = function (app) {
  const tz = () => parseInt(db.getSetting('tz_offset', '210'), 10) || 210;
  const currency = () => db.getSetting('currency', 'تومان');

  function computeMonth(month) {
    const { start, end } = monthGregRange(month);
    const ins = parseFloat(db.getSetting('insurance_percent', '7')) || 0;
    const taxRate = parseFloat(db.getSetting('tax_percent', '0')) || 0;
    const otRateSetting = db.getSetting('ot_hourly_rate', '');
    const emps = db.all(`SELECT * FROM employees WHERE status='active' ORDER BY last_name`);
    const rows = [];
    emps.forEach(e => {
      const shift = e.shift_id ? db.get('SELECT * FROM shifts WHERE id=?', [e.shift_id]) : null;
      const workDays = ((shift && shift.work_days) || '0,1,2,3,4').split(',').map(Number);
      const att = db.all('SELECT date, status FROM attendance WHERE employee_id=? AND date BETWEEN ? AND ?', [e.id, start, end]);
      const attByDate = {}; att.forEach(a => { attByDate[a.date] = a.status; });
      // روزهای غیبت بدون حقوق و روزهای کارکرد
      let worked = 0, unpaidAbsent = 0;
      let d = start;
      const today = utils.todayIso(tz());
      while (d <= end) {
        const wd = utils.isoWeekdaySat(d);
        const isHol = !!db.get('SELECT id FROM holidays WHERE date=?', [d]);
        if (workDays.includes(wd) && !isHol) {
          const st = attByDate[d];
          if (st === 'present' || st === 'mission' || st === 'leave') worked++;
          else if (st === 'absent') unpaidAbsent++;
          else if (!st && d < today) unpaidAbsent++; // روز کاری گذشته بدون ثبت
        }
        d = utils.addDaysIso(d, 1);
      }
      // مرخصی بدون حقوق تاییدشده در ماه
      const unpaidLeaves = db.all(`SELECT lr.from_date, lr.to_date FROM leave_requests lr JOIN leave_types lt ON lt.id=lr.leave_type_id
        WHERE lr.employee_id=? AND lr.status='approved' AND lt.is_paid=0 AND lr.from_date <= ? AND lr.to_date >= ?`, [e.id, end, start]);
      unpaidLeaves.forEach(l => {
        let dd = l.from_date < start ? start : l.from_date;
        const de = l.to_date > end ? end : l.to_date;
        while (dd <= de) { const wd = utils.isoWeekdaySat(dd); if (workDays.includes(wd) && !db.get('SELECT id FROM holidays WHERE date=?', [dd])) unpaidAbsent++; dd = utils.addDaysIso(dd, 1); }
      });
      // اضافه‌کاری تاییدشده
      const otHours = db.count(`SELECT COALESCE(SUM(hours),0) AS s FROM overtime_requests WHERE employee_id=? AND status='approved' AND date BETWEEN ? AND ?`, [e.id, start, end]);
      const otRate = otRateSetting ? parseFloat(otRateSetting) : Math.round(e.base_salary / 220);
      const otAmount = Math.round(otHours * otRate);
      const basePay = Math.max(0, Math.round(e.base_salary * (1 - Math.min(unpaidAbsent, 30) / 30)));
      const insurance = Math.round(basePay * ins / 100);
      const taxBase = Math.max(0, basePay + otAmount - insurance);
      const tax = Math.round(taxBase * taxRate / 100);
      rows.push({
        employee: e, month, base: e.base_salary, worked_days: worked, unpaid_absent: unpaidAbsent,
        base_pay: basePay, overtime_hours: otHours, overtime_amount: otAmount,
        allowances: 0, deductions: 0, insurance, tax, loan_deduction: 0,
        net: basePay + otAmount - insurance - tax
      });
    });
    return rows;
  }

  function monthGregRange(month) {
    const [jy, jm] = month.split('-').map(Number);
    return utils.jMonthRange(jy, jm);
  }

  app.get('/payroll', H.authRequired, H.permRequired('payroll'), (req, res) => {
    const months = db.all(`SELECT month, COUNT(*) AS c, SUM(net) AS net, SUM(CASE WHEN status='final' THEN 1 ELSE 0 END) AS finals FROM payrolls GROUP BY month ORDER BY month DESC`);
    const today = utils.todayIso(tz());
    const cj = utils.jMonthOfIso(today);
    res.render('payroll/index', {
      title: 'لیست حقوق', months, currency: currency(),
      currentMonth: `${cj.jy}-${String(cj.jm).padStart(2, '0')}`,
      currentLabel: `${utils.FA_MONTHS[cj.jm - 1]} ${utils.faNum(cj.jy)}`
    });
  });

  // صدور/محاسبه مجدد لیست ماه
  app.post('/payroll/generate', H.authRequired, H.permRequired('payroll'), (req, res) => {
    const month = String(req.body.month || '').trim();
    if (!/^\d{4}-\d{2}$/.test(month)) return res.redirect('/payroll');
    const computed = computeMonth(month);
    // حذف پیش‌نویس‌های قبلی ماه
    db.run(`DELETE FROM payroll_items WHERE payroll_id IN (SELECT id FROM payrolls WHERE month=? AND status='draft')`, [month]);
    db.run(`DELETE FROM payrolls WHERE month=? AND status='draft'`, [month]);
    computed.forEach(r => {
      db.insert('payrolls', {
        month: r.month, employee_id: r.employee.id, base: r.base, worked_days: r.worked_days,
        overtime_hours: r.overtime_hours, overtime_amount: r.overtime_amount,
        allowances: r.allowances, deductions: r.deductions, insurance: r.insurance, tax: r.tax,
        loan_deduction: r.loan_deduction, net: r.net, status: 'draft',
        note: r.unpaid_absent ? `غیبت بدون حقوق: ${utils.faNum(r.unpaid_absent)} روز` : '',
        created_by: req.user.id, created_at: utils.nowDateTime(tz()), finalized_at: null
      });
    });
    H.log(req, 'generate', 'payrolls', 0, month);
    res.redirect('/payroll/' + month);
  });

  // جزئیات لیست یک ماه
  app.get('/payroll/:month(\\d{4}-\\d{2})', H.authRequired, H.permRequired('payroll'), (req, res) => {
    const month = req.params.month;
    const rows = db.all(`SELECT p.*, e.first_name, e.last_name, e.code, e.bank_name, e.bank_account FROM payrolls p
      JOIN employees e ON e.id=p.employee_id WHERE p.month=? ORDER BY e.last_name`, [month]);
    if (!rows.length) return res.redirect('/payroll');
    const allFinal = rows.every(r => r.status === 'final');
    const totals = rows.reduce((a, r) => ({
      base: a.base + r.base, ot: a.ot + r.overtime_amount, allowances: a.allowances + r.allowances,
      deductions: a.deductions + r.deductions, insurance: a.insurance + r.insurance,
      tax: a.tax + r.tax, loan: a.loan + r.loan_deduction, net: a.net + r.net
    }), { base: 0, ot: 0, allowances: 0, deductions: 0, insurance: 0, tax: 0, loan: 0, net: 0 });
    const { start, end } = monthGregRange(month);
    const j = month.split('-').map(Number);
    res.render('payroll/month', {
      title: `لیست حقوق ${utils.FA_MONTHS[j[1] - 1]} ${utils.faNum(j[0])}`, month, rows, totals, allFinal,
      monthNameStr: `${utils.FA_MONTHS[j[1] - 1]} ${utils.faNum(j[0])}`,
      currency: currency(), start, end, jy: j[0], jm: j[1]
    });
  });

  // ویرایش یک ردیف
  app.get('/payroll/row/:id(\\d+)/edit', H.authRequired, H.permRequired('payroll'), (req, res) => {
    const row = db.get(`SELECT p.*, e.first_name, e.last_name, e.code FROM payrolls p JOIN employees e ON e.id=p.employee_id WHERE p.id=?`, [req.params.id]);
    if (!row) return res.redirect('/payroll');
    if (row.status === 'final') return res.redirect('/payroll/' + row.month);
    const items = db.all('SELECT * FROM payroll_items WHERE payroll_id=? ORDER BY kind, id', [row.id]);
    res.render('payroll/row_edit', { title: 'ویرایش ردیف حقوق', row, items, currency: currency(), jDateEn: utils.jDateEn });
  });

  app.post('/payroll/row/:id(\\d+)/edit', H.authRequired, H.permRequired('payroll'), (req, res) => {
    const row = db.get('SELECT * FROM payrolls WHERE id=?', [req.params.id]);
    if (!row || row.status === 'final') return res.redirect('/payroll');
    const num = v => parseFloat(utils.enNum(v || '0').replace(/,/g, '')) || 0;
    const overtime_amount = num(req.body.overtime_amount);
    const allowances = num(req.body.allowances);
    const deductions = num(req.body.deductions);
    const insurance = num(req.body.insurance);
    const tax = num(req.body.tax);
    const base_pay = num(req.body.base_pay);
    const net = base_pay + overtime_amount + allowances - deductions - insurance - tax;
    db.update('payrolls', row.id, { base: base_pay, overtime_amount, allowances, deductions, insurance, tax, net, note: req.body.note || '' });
    H.log(req, 'update', 'payrolls', row.id, row.month);
    res.redirect('/payroll/' + row.month);
  });

  // آیتم‌های مزایا/کسورات
  app.post('/payroll/row/:id(\\d+)/items', H.authRequired, H.permRequired('payroll'), (req, res) => {
    const row = db.get('SELECT * FROM payrolls WHERE id=?', [req.params.id]);
    if (!row || row.status === 'final') return res.redirect('/payroll/row/' + row.id + '/edit');
    const amount = parseFloat(utils.enNum(req.body.amount || '0').replace(/,/g, '')) || 0;
    if (req.body.label && amount) {
      db.insert('payroll_items', { payroll_id: row.id, label: req.body.label, amount, kind: req.body.kind === 'deduction' ? 'deduction' : 'allowance' });
      recalcRow(row.id);
    }
    res.redirect('/payroll/row/' + row.id + '/edit');
  });
  app.post('/payroll/items/:id(\\d+)/delete', H.authRequired, H.permRequired('payroll'), (req, res) => {
    const it = db.get('SELECT * FROM payroll_items WHERE id=?', [req.params.id]);
    if (it) { db.del('payroll_items', it.id); recalcRow(it.payroll_id); }
    res.redirect('/payroll/row/' + (it ? it.payroll_id : '') + '/edit');
  });

  function recalcRow(id) {
    const row = db.get('SELECT * FROM payrolls WHERE id=?', [id]);
    if (!row) return;
    const sums = db.get(`SELECT COALESCE(SUM(CASE WHEN kind='allowance' THEN amount END),0) AS a,
      COALESCE(SUM(CASE WHEN kind='deduction' THEN amount END),0) AS d FROM payroll_items WHERE payroll_id=?`, [id]);
    const net = row.base + row.overtime_amount + sums.a - sums.d - row.insurance - row.tax;
    db.update('payrolls', id, { allowances: sums.a, deductions: sums.d, net });
  }

  // نهایی‌سازی (با کسر اقساط وام)
  app.post('/payroll/:month(\\d{4}-\\d{2})/finalize', H.authRequired, H.permRequired('payroll'), (req, res) => {
    const month = req.params.month;
    const rows = db.all(`SELECT * FROM payrolls WHERE month=? AND status='draft'`, [month]);
    rows.forEach(r => {
      // اقساط وام فعال با ماه شروع <= ماه جاری
      const loans = db.all(`SELECT * FROM loans WHERE employee_id=? AND status='active'`, [r.employee_id]);
      let loanCut = 0;
      loans.forEach(l => {
        if (l.start_month && l.start_month <= month && l.paid_installments < l.installment_count) {
          const cut = Math.min(l.installment_amount, l.total_amount - l.paid_installments * l.installment_amount);
          loanCut += cut;
          db.insert('loan_payments', { loan_id: l.id, month, amount: cut });
          const paid = l.paid_installments + 1;
          db.update('loans', l.id, { paid_installments: paid, status: paid >= l.installment_count ? 'finished' : 'active' });
        }
      });
      const net = r.net - loanCut;
      db.update('payrolls', r.id, { loan_deduction: loanCut, net, status: 'final', finalized_at: utils.nowDateTime(tz()) });
    });
    H.log(req, 'finalize', 'payrolls', 0, month);
    res.redirect('/payroll/' + month);
  });

  app.post('/payroll/:month(\\d{4}-\\d{2})/reopen', H.authRequired, H.permRequired('payroll'), (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).send('فقط مدیر سیستم می‌تواند لیست نهایی را بازگشایی کند.');
    db.run(`UPDATE payrolls SET status='draft', finalized_at=NULL WHERE month=?`, [req.params.month]);
    H.log(req, 'reopen', 'payrolls', 0, req.params.month);
    res.redirect('/payroll/' + req.params.month);
  });

  app.post('/payroll/:month(\\d{4}-\\d{2})/delete', H.authRequired, H.permRequired('payroll'), (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).send('فقط مدیر سیستم مجاز است.');
    const month = req.params.month;
    db.run(`DELETE FROM payroll_items WHERE payroll_id IN (SELECT id FROM payrolls WHERE month=?)`, [month]);
    db.run(`DELETE FROM payrolls WHERE month=?`, [month]);
    res.redirect('/payroll');
  });

  // خروجی CSV
  app.get('/payroll/:month(\\d{4}-\\d{2})/export', H.authRequired, H.permRequired('payroll'), (req, res) => {
    const rows = db.all(`SELECT p.*, e.first_name, e.last_name, e.code FROM payrolls p JOIN employees e ON e.id=p.employee_id WHERE p.month=? ORDER BY e.last_name`, [req.params.month]);
    const csv = utils.toCsv(['ماه', 'کد', 'کارمند', 'حقوق پایه', 'ساعت اضافه‌کاری', 'مبلغ اضافه‌کاری', 'مزایا', 'کسورات', 'بیمه', 'مالیات', 'قسط وام', 'خالص پرداختی', 'وضعیت'],
      rows.map(r => [r.month, r.code, `${r.first_name} ${r.last_name}`, r.base, r.overtime_hours, r.overtime_amount, r.allowances, r.deductions, r.insurance, r.tax, r.loan_deduction, r.net, r.status === 'final' ? 'نهایی' : 'پیش‌نویس']));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="payroll-${req.params.month}.csv"`);
    res.send(csv);
  });

  // فیش حقوقی (چاپ)
  app.get('/payroll/slip/:id(\\d+)', H.authRequired, H.permRequired('payroll'), (req, res) => {
    const row = db.get(`SELECT p.*, e.first_name, e.last_name, e.code, e.national_id, e.bank_name, e.bank_account,
      d.name AS dept_name, dg.name AS desig_name FROM payrolls p JOIN employees e ON e.id=p.employee_id
      LEFT JOIN departments d ON d.id=e.department_id LEFT JOIN designations dg ON dg.id=e.designation_id WHERE p.id=?`, [req.params.id]);
    if (!row) return res.redirect('/payroll');
    const isSelf = req.user.employee_id === row.employee_id;
    const isFinal = row.status === 'final';
    if (!isFinal && !['admin', 'hr'].includes(req.user.role) && !isSelf) return res.status(403).send('دسترسی غیرمجاز');
    const items = db.all('SELECT * FROM payroll_items WHERE payroll_id=? ORDER BY kind, id', [row.id]);
    const j = row.month.split('-').map(Number);
    res.render('payroll/slip', {
      title: 'فیش حقوقی', row, items, currency: currency(),
      monthLabel: `${utils.FA_MONTHS[j[1] - 1]} ${utils.faNum(j[0])}`
    });
  });

  // فیش‌های من (کارمند)
  app.get('/my-payslips', H.authRequired, (req, res) => {
    if (!req.user.employee_id) return res.redirect('/');
    const rows = db.all(`SELECT p.*, e.first_name, e.last_name FROM payrolls p JOIN employees e ON e.id=p.employee_id
      WHERE p.employee_id=? AND p.status='final' ORDER BY p.month DESC`, [req.user.employee_id]);
    res.render('payroll/my_payslips', { title: 'فیش‌های حقوقی من', rows, currency: currency() });
  });
};
