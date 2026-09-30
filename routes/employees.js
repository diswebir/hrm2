'use strict';
/** مدیریت کارکنان: لیست، فرم، پرونده پرسنلی، چارت سازمانی، چاپ */
const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('../src/db');
const utils = require('../src/utils');
const H = require('../src/helpers');
const { upload, empOptions, deptOptions } = require('../src/crud');

module.exports = function (app) {
  const tz = () => parseInt(db.getSetting('tz_offset', '210'), 10) || 210;
  const currency = () => db.getSetting('currency', 'تومان');
  const r = express.Router();
  r.use(H.authRequired, H.permRequired('employees'));

  // ---------- لیست کارکنان ----------
  r.get('/', (req, res) => {
    const { q = '', dept = '', status = '', page = '1' } = req.query;
    const where = []; const params = [];
    if (q) { where.push('(e.first_name LIKE ? OR e.last_name LIKE ? OR e.code LIKE ? OR e.national_id LIKE ? OR e.phone LIKE ?)'); params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`); }
    if (dept) { where.push('e.department_id=?'); params.push(dept); }
    if (status) { where.push('e.status=?'); params.push(status); }
    const W = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const total = db.count(`SELECT COUNT(*) AS c FROM employees e ${W}`, params);
    const perPage = 25;
    const pages = Math.max(1, Math.ceil(total / perPage));
    const p = Math.min(pages, Math.max(1, parseInt(page, 10) || 1));
    const rows = db.all(`SELECT e.*, d.name AS dept_name, dg.name AS desig_name FROM employees e
      LEFT JOIN departments d ON d.id=e.department_id LEFT JOIN designations dg ON dg.id=e.designation_id
      ${W} ORDER BY e.code ASC LIMIT ${perPage} OFFSET ${(p - 1) * perPage}`, params);
    res.render('employees/index', {
      title: 'کارکنان', rows, q, dept, status, page: p, pages, total,
      depts: db.all('SELECT id,name FROM departments ORDER BY name'), currency: currency()
    });
  });

  r.get('/export', (req, res) => {
    const rows = db.all(`SELECT e.*, d.name AS dept_name, dg.name AS desig_name FROM employees e
      LEFT JOIN departments d ON d.id=e.department_id LEFT JOIN designations dg ON dg.id=e.designation_id ORDER BY e.code ASC`);
    const csv = utils.toCsv(
      ['کد', 'نام', 'نام خانوادگی', 'کد ملی', 'سمت', 'دپارتمان', 'تلفن', 'تاریخ استخدام (شمسی)', 'نوع همکاری', 'حقوق پایه', 'وضعیت'],
      rows.map(e => [e.code, e.first_name, e.last_name, e.national_id, e.desig_name || '', e.dept_name || '', e.phone, utils.jDateEn(e.hire_date), utils.label(e.contract_type), e.base_salary, utils.label(e.status)])
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="employees.csv"');
    res.send(csv);
  });

  // ---------- فرم ثبت/ویرایش ----------
  const formFields = (row) => ({
    emps: empOptions(), depts: deptOptions(),
    designations: Object.fromEntries(db.all('SELECT id,name FROM designations ORDER BY name').map(x => [x.id, x.name])),
    branches: Object.fromEntries(db.all('SELECT id,name FROM branches ORDER BY name').map(x => [x.id, x.name])),
    shifts: Object.fromEntries(db.all('SELECT id,name FROM shifts ORDER BY id').map(x => [x.id, x.name])),
    empsList: db.all(`SELECT id, first_name, last_name FROM employees WHERE status!='terminated' AND id != ? ORDER BY last_name`, [row && row.id ? row.id : -1])
  });

  r.get('/new', (req, res) => {
    res.render('employees/form', { title: 'ثبت کارمند جدید', row: {}, error: null, opts: formFields(null), prefill: req.query });
  });

  r.post('/new', upload.single('photo'), (req, res) => {
    const b = req.body;
    const bad = m => res.status(400).render('employees/form', { title: 'ثبت کارمند جدید', row: b, error: m, opts: formFields(null), prefill: {} });
    if (!b.first_name || !b.last_name) return bad('نام و نام خانوادگی الزامی است.');
    let code = (b.code || '').trim();
    if (!code) {
      const mx = db.get(`SELECT MAX(CAST(code AS INTEGER)) AS m FROM employees WHERE code GLOB '[0-9]*'`);
      code = String((mx && mx.m ? mx.m : 1000) + 1);
    }
    if (db.get('SELECT id FROM employees WHERE code=?', [code])) return bad('این شماره پرسنلی قبلاً ثبت شده است.');
    if (b.national_id && db.get('SELECT id FROM employees WHERE national_id=?', [b.national_id])) return bad('این کد ملی قبلاً ثبت شده است.');
    const id = db.insert('employees', {
      code, first_name: b.first_name.trim(), last_name: b.last_name.trim(), father_name: b.father_name || '',
      national_id: b.national_id || '', gender: b.gender || 'male',
      birth_date: utils.gDate(b.birth_date), marital_status: b.marital_status || 'single',
      children_count: parseInt(utils.enNum(b.children_count || '0'), 10) || 0,
      phone: b.phone || '', email: b.email || '', address: b.address || '',
      photo: req.file ? 'uploads/' + req.file.filename : '',
      department_id: b.department_id || null, designation_id: b.designation_id || null,
      branch_id: b.branch_id || null, manager_id: b.manager_id || null, shift_id: b.shift_id || null,
      hire_date: utils.gDate(b.hire_date), contract_type: b.contract_type || 'full_time',
      contract_end: utils.gDate(b.contract_end),
      base_salary: parseFloat(utils.enNum(b.base_salary || '0').replace(/,/g, '')) || 0,
      status: b.status || 'active', bank_name: b.bank_name || '', bank_account: b.bank_account || '',
      insurance_no: b.insurance_no || '', notes: b.notes || ''
    });
    H.log(req, 'create', 'employees', id, `${b.first_name} ${b.last_name}`);
    // آیتم‌های پیش‌فرض چک‌لیست ورود
    ['تحویل کارت پرسنلی', 'ایجاد حساب کاربری سامانه', 'تحویل تجهیزات کاری', 'آشنایی با تیم و محل کار', 'آموزش قوانین سازمان'].forEach(t =>
      db.insert('onboarding_items', { employee_id: id, phase: 'onboarding', title: t, assignee: 'منابع انسانی', due_date: null, done: 0 }));
    res.redirect('/employees/' + id);
  });

  r.get('/:id(\\d+)/edit', (req, res) => {
    const row = db.get('SELECT * FROM employees WHERE id=?', [req.params.id]);
    if (!row) return res.redirect('/employees');
    res.render('employees/form', { title: `ویرایش: ${H.fullName(row)}`, row, error: null, opts: formFields(row), prefill: {} });
  });

  r.post('/:id(\\d+)/edit', upload.single('photo'), (req, res) => {
    const row = db.get('SELECT * FROM employees WHERE id=?', [req.params.id]);
    if (!row) return res.redirect('/employees');
    const b = req.body;
    const bad = m => res.status(400).render('employees/form', { title: `ویرایش: ${H.fullName(row)}`, row: { ...row, ...b }, error: m, opts: formFields(row), prefill: {} });
    if (!b.first_name || !b.last_name) return bad('نام و نام خانوادگی الزامی است.');
    if (b.code && db.get('SELECT id FROM employees WHERE code=? AND id!=?', [b.code, row.id])) return bad('این شماره پرسنلی قبلاً ثبت شده است.');
    if (b.national_id && db.get('SELECT id FROM employees WHERE national_id=? AND id!=?', [b.national_id, row.id])) return bad('این کد ملی قبلاً ثبت شده است.');
    const wasActive = row.status === 'active';
    db.update('employees', row.id, {
      code: (b.code || row.code).trim(), first_name: b.first_name.trim(), last_name: b.last_name.trim(), father_name: b.father_name || '',
      national_id: b.national_id || '', gender: b.gender || 'male',
      birth_date: utils.gDate(b.birth_date), marital_status: b.marital_status || 'single',
      children_count: parseInt(utils.enNum(b.children_count || '0'), 10) || 0,
      phone: b.phone || '', email: b.email || '', address: b.address || '',
      photo: req.file ? 'uploads/' + req.file.filename : row.photo,
      department_id: b.department_id || null, designation_id: b.designation_id || null,
      branch_id: b.branch_id || null, manager_id: b.manager_id || null, shift_id: b.shift_id || null,
      hire_date: utils.gDate(b.hire_date), contract_type: b.contract_type || 'full_time',
      contract_end: utils.gDate(b.contract_end),
      base_salary: parseFloat(utils.enNum(b.base_salary || '0').replace(/,/g, '')) || 0,
      status: b.status || 'active', bank_name: b.bank_name || '', bank_account: b.bank_account || '',
      insurance_no: b.insurance_no || '', notes: b.notes || '',
      terminated_at: b.status === 'terminated' ? (row.terminated_at || utils.todayIso(tz())) : null,
      termination_reason: b.status === 'terminated' ? (b.termination_reason || '') : ''
    });
    if (wasActive && b.status === 'terminated') {
      db.run(`UPDATE users SET is_active=0 WHERE employee_id=?`, [row.id]);
    }
    H.log(req, 'update', 'employees', row.id, `${b.first_name} ${b.last_name}`);
    res.redirect('/employees/' + row.id);
  });

  // ---------- پرونده پرسنلی ----------
  r.get('/:id(\\d+)', (req, res) => {
    const e = db.get(`SELECT e.*, d.name AS dept_name, dg.name AS desig_name, b.name AS branch_name, sh.name AS shift_name,
      m.first_name AS mgr_first, m.last_name AS mgr_last FROM employees e
      LEFT JOIN departments d ON d.id=e.department_id LEFT JOIN designations dg ON dg.id=e.designation_id
      LEFT JOIN branches b ON b.id=e.branch_id LEFT JOIN shifts sh ON sh.id=e.shift_id
      LEFT JOIN employees m ON m.id=e.manager_id WHERE e.id=?`, [req.params.id]);
    if (!e) return res.redirect('/employees');
    const education = db.all('SELECT * FROM employee_education WHERE employee_id=? ORDER BY id DESC', [e.id]);
    const skills = db.all('SELECT * FROM employee_skills WHERE employee_id=? ORDER BY id DESC', [e.id]);
    const contacts = db.all('SELECT * FROM employee_contacts WHERE employee_id=? ORDER BY is_emergency DESC, id', [e.id]);
    const documents = db.all('SELECT * FROM employee_documents WHERE employee_id=? ORDER BY id DESC', [e.id]);
    const contracts = db.all('SELECT * FROM contracts WHERE employee_id=? ORDER BY start_date DESC', [e.id]);
    const history = db.all(`SELECT j.*, d.name AS dept_name FROM job_history j LEFT JOIN departments d ON d.id=j.department_id WHERE j.employee_id=? ORDER BY j.from_date DESC`, [e.id]);
    const attendanceStats = {
      month: db.get(`SELECT COUNT(*) AS total,
        SUM(CASE WHEN status='present' THEN 1 ELSE 0 END) AS present,
        SUM(CASE WHEN status='absent' THEN 1 ELSE 0 END) AS absent,
        SUM(CASE WHEN status='leave' THEN 1 ELSE 0 END) AS leaves,
        SUM(late_minutes) AS late, SUM(overtime_minutes) AS ot
        FROM attendance WHERE employee_id=? AND date >= ?`, [e.id, utils.addDaysIso(utils.todayIso(tz()), -30)]),
      total: db.count('SELECT COUNT(*) AS c FROM attendance WHERE employee_id=?', [e.id])
    };
    const leaves = db.all(`SELECT lr.*, lt.name AS type_name, lt.color FROM leave_requests lr JOIN leave_types lt ON lt.id=lr.leave_type_id WHERE lr.employee_id=? ORDER BY lr.id DESC LIMIT 10`, [e.id]);
    const payslips = db.all(`SELECT * FROM payrolls WHERE employee_id=? ORDER BY month DESC LIMIT 12`, [e.id]);
    const myAssets = db.all(`SELECT aa.*, a.name AS asset_name, a.code AS asset_code FROM asset_assignments aa JOIN assets a ON a.id=aa.asset_id WHERE aa.employee_id=? AND aa.status='active'`, [e.id]);
    const goals = db.all('SELECT * FROM goals WHERE employee_id=? ORDER BY id DESC LIMIT 10', [e.id]);
    const trainings = db.all(`SELECT te.*, t.title AS training_title FROM training_enrollments te JOIN trainings t ON t.id=te.training_id WHERE te.employee_id=? ORDER BY te.id DESC`, [e.id]);
    const checklist = db.all(`SELECT * FROM onboarding_items WHERE employee_id=? ORDER BY phase, id`, [e.id]);
    const today = utils.todayIso(tz());
    res.render('employees/profile', {
      title: `پرونده: ${H.fullName(e)}`, e, education, skills, contacts, documents, contracts, history,
      attendanceStats, leaves, payslips, myAssets, goals, trainings, checklist,
      today, currency: currency(), jDateEn: utils.jDateEn, tab: req.query.tab || 'info'
    });
  });

  // زیر‌بخش‌های پرونده
  const sub = (table, perm) => (req, res) => {
    const e = db.get('SELECT * FROM employees WHERE id=?', [req.params.id]);
    if (!e) return res.redirect('/employees');
    const b = req.body;
    const data = { employee_id: e.id };
    const maps = {
      education: { degree: b.degree, field: b.field, institute: b.institute, year: b.year, gpa: b.gpa },
      skills: { skill: b.skill, level: parseInt(b.level || '3', 10), note: b.note || '' },
      contacts: { name: b.name, relation: b.relation || '', phone: b.phone || '', is_emergency: b.is_emergency === '1' ? 1 : 0 },
      job_history: { title: b.title, department_id: b.department_id || null, from_date: utils.gDate(b.from_date), to_date: utils.gDate(b.to_date), salary: parseFloat(utils.enNum(b.salary || '0').replace(/,/g, '')) || 0, description: b.description || '' }
    };
    Object.assign(data, maps[table]);
    if (!data.title && !data.skill && !data.name && !data.degree) return res.redirect(`/employees/${e.id}?tab=${req.body.tab}&error=empty`);
    db.insert(table, data);
    H.log(req, 'create', table, e.id, H.fullName(e));
    res.redirect(`/employees/${e.id}?tab=${req.body.tab}`);
  };
  r.post('/:id(\\d+)/education', sub('education'));
  r.post('/:id(\\d+)/skills', sub('skills'));
  r.post('/:id(\\d+)/contacts', sub('contacts'));
  r.post('/:id(\\d+)/history', sub('job_history'));

  r.post('/:id(\\d+)/:table(education|skills|contacts|history)/:rowId(\\d+)/delete', (req, res) => {
    db.run(`DELETE FROM ${req.params.table} WHERE id=? AND employee_id=?`, [req.params.rowId, req.params.id]);
    H.log(req, 'delete', req.params.table, req.params.id, '');
    res.redirect(`/employees/${req.params.id}?tab=${req.query.tab || 'info'}`);
  });

  // مدرک کارمند
  r.post('/:id(\\d+)/documents', upload.single('file'), (req, res) => {
    const e = db.get('SELECT * FROM employees WHERE id=?', [req.params.id]);
    if (!e) return res.redirect('/employees');
    if (!req.file) return res.redirect(`/employees/${e.id}?tab=documents&error=file`);
    db.insert('employee_documents', {
      employee_id: e.id, title: req.body.title || 'مدرک', category: req.body.category || 'other',
      file_path: 'uploads/' + req.file.filename, issue_date: utils.gDate(req.body.issue_date),
      expiry_date: utils.gDate(req.body.expiry_date), note: req.body.note || ''
    });
    H.log(req, 'create', 'employee_documents', e.id, req.body.title);
    res.redirect(`/employees/${e.id}?tab=documents`);
  });

  // چک‌لیست ورود/خروج
  r.post('/:id(\\d+)/checklist', (req, res) => {
    const e = db.get('SELECT * FROM employees WHERE id=?', [req.params.id]);
    if (!e) return res.redirect('/employees');
    db.insert('onboarding_items', {
      employee_id: e.id, phase: req.body.phase === 'offboarding' ? 'offboarding' : 'onboarding',
      title: req.body.title, assignee: req.body.assignee || '', due_date: utils.gDate(req.body.due_date), done: 0
    });
    res.redirect(`/employees/${e.id}?tab=checklist`);
  });
  r.post('/:id(\\d+)/checklist/:rowId(\\d+)/toggle', (req, res) => {
    const it = db.get('SELECT * FROM onboarding_items WHERE id=? AND employee_id=?', [req.params.rowId, req.params.id]);
    if (it) db.update('onboarding_items', it.id, { done: it.done ? 0 : 1, done_at: it.done ? null : utils.nowDateTime(tz()) });
    res.redirect(`/employees/${req.params.id}?tab=checklist`);
  });
  r.post('/:id(\\d+)/checklist/:rowId(\\d+)/delete', (req, res) => {
    db.run('DELETE FROM onboarding_items WHERE id=? AND employee_id=?', [req.params.rowId, req.params.id]);
    res.redirect(`/employees/${req.params.id}?tab=checklist`);
  });

  // چاپ پرونده
  r.get('/:id(\\d+)/print', (req, res) => {
    const e = db.get(`SELECT e.*, d.name AS dept_name, dg.name AS desig_name, b.name AS branch_name FROM employees e
      LEFT JOIN departments d ON d.id=e.department_id LEFT JOIN designations dg ON dg.id=e.designation_id
      LEFT JOIN branches b ON b.id=e.branch_id WHERE e.id=?`, [req.params.id]);
    if (!e) return res.redirect('/employees');
    res.render('employees/print', {
      title: 'پرونده پرسنلی', e,
      education: db.all('SELECT * FROM employee_education WHERE employee_id=?', [e.id]),
      skills: db.all('SELECT * FROM employee_skills WHERE employee_id=?', [e.id]),
      contacts: db.all('SELECT * FROM employee_contacts WHERE employee_id=?', [e.id]),
      contracts: db.all('SELECT * FROM contracts WHERE employee_id=?', [e.id]),
      history: db.all('SELECT * FROM job_history WHERE employee_id=? ORDER BY from_date DESC', [e.id]),
      currency: currency()
    });
  });

  r.post('/:id(\\d+)/delete', (req, res) => {
    const id = req.params.id;
    ['employee_education', 'employee_skills', 'employee_contacts', 'employee_documents', 'contracts', 'job_history',
      'attendance', 'leave_requests', 'overtime_requests', 'payrolls', 'goals', 'asset_assignments',
      'training_enrollments', 'onboarding_items', 'expenses'].forEach(t => db.run(`DELETE FROM ${t} WHERE employee_id=?`, [id]));
    db.run('UPDATE users SET employee_id=NULL WHERE employee_id=?', [id]);
    db.del('employees', id);
    H.log(req, 'delete', 'employees', id, '');
    res.redirect('/employees?deleted=1');
  });

  // ---------- چارت سازمانی ----------
  r.get('/orgchart', (req, res) => {
    const depts = db.all(`SELECT d.*, (SELECT COUNT(*) FROM employees e WHERE e.department_id=d.id AND e.status='active') AS emp_count,
      m.first_name AS mgr_first, m.last_name AS mgr_last FROM departments d
      LEFT JOIN employees m ON m.id=d.manager_id ORDER BY d.name`);
    res.render('employees/orgchart', { title: 'چارت سازمانی', depts });
  });

  app.use('/employees', r);
};
