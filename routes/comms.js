'use strict';
/** ارتباطات: نمایش اطلاعیه‌ها، دایرکتوری، تقویم رویدادها */
const express = require('express');
const db = require('../src/db');
const utils = require('../src/utils');
const H = require('../src/helpers');

module.exports = function (app) {
  const tz = () => parseInt(db.getSetting('tz_offset', '210'), 10) || 210;

  // اطلاعیه‌ها برای همه کاربران
  app.get('/announcements/all', H.authRequired, (req, res) => {
    const t = utils.todayIso(tz());
    const empDept = req.user.employee_id ? db.get('SELECT department_id FROM employees WHERE id=?', [req.user.employee_id]) : null;
    const rows = db.all(`SELECT a.*, d.name AS dept_name, u.username AS author FROM announcements a
      LEFT JOIN departments d ON d.id=a.department_id LEFT JOIN users u ON u.id=a.created_by
      WHERE (a.publish_date IS NULL OR a.publish_date <= ?) AND (a.expire_date IS NULL OR a.expire_date >= ?)
      AND (a.audience='all' OR (a.audience='department' AND a.department_id=?))
      ORDER BY a.pinned DESC, a.publish_date DESC LIMIT 100`,
      [t, t, empDept ? empDept.department_id : -1]);
    res.render('comms/announcements_all', { title: 'اطلاعیه‌ها', rows });
  });

  app.get('/announcements/view/:id(\\d+)', H.authRequired, (req, res) => {
    const t = utils.todayIso(tz());
    const empDept = req.user.employee_id ? db.get('SELECT department_id FROM employees WHERE id=?', [req.user.employee_id]) : null;
    const a = db.get(`SELECT a.*, d.name AS dept_name, u.username AS author FROM announcements a
      LEFT JOIN departments d ON d.id=a.department_id LEFT JOIN users u ON u.id=a.created_by
      WHERE a.id=? AND (a.audience='all' OR (a.audience='department' AND a.department_id=?))`,
      [req.params.id, empDept ? empDept.department_id : -1]);
    if (!a) return res.redirect('/announcements/all');
    res.render('comms/announcement_view', { title: a.title, a });
  });

  // مخزن اسناد برای همه کاربران (اسناد عمومی؛ اسناد HR فقط برای مجوزدار)
  app.get('/docs', H.authRequired, (req, res) => {
    const q = (req.query.q || '').trim();
    const canManage = H.can(req.user, 'documents');
    let sql = `SELECT * FROM documents`;
    const params = [];
    if (!canManage) { sql += ` WHERE visibility='all'`; }
    if (q) { sql += (canManage ? ' WHERE' : ' AND') + ' title LIKE ?'; params.push(`%${q}%`); }
    sql += ' ORDER BY id DESC LIMIT 200';
    const rows = db.all(sql, params);
    res.render('comms/docs_public', { title: 'مخزن اسناد', rows, q, canManage });
  });

  // دایرکتوری کارکنان
  app.get('/directory', H.authRequired, H.permRequired('directory'), (req, res) => {
    const q = (req.query.q || '').trim();
    const dept = req.query.dept || '';
    let sql = `SELECT e.id, e.first_name, e.last_name, e.photo, e.phone, e.email, e.code, e.hire_date,
      d.name AS dept_name, dg.name AS desig_name FROM employees e
      LEFT JOIN departments d ON d.id=e.department_id LEFT JOIN designations dg ON dg.id=e.designation_id
      WHERE e.status='active'`;
    const params = [];
    if (q) { sql += ` AND (e.first_name LIKE ? OR e.last_name LIKE ? OR dg.name LIKE ? OR d.name LIKE ?)`; params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`); }
    if (dept) { sql += ' AND e.department_id=?'; params.push(dept); }
    sql += ' ORDER BY e.last_name';
    const rows = db.all(sql, params);
    res.render('comms/directory', {
      title: 'دایرکتوری کارکنان', rows, q, dept,
      depts: db.all('SELECT id,name FROM departments ORDER BY name')
    });
  });

  // پروفایل عمومی (اطلاعات کاری)
  app.get('/directory/:id(\\d+)', H.authRequired, H.permRequired('directory'), (req, res) => {
    const e = db.get(`SELECT e.id, e.first_name, e.last_name, e.photo, e.phone, e.email, e.code, e.hire_date, e.birth_date,
      d.name AS dept_name, dg.name AS desig_name, b.name AS branch_name, m.first_name AS mgr_first, m.last_name AS mgr_last
      FROM employees e LEFT JOIN departments d ON d.id=e.department_id LEFT JOIN designations dg ON dg.id=e.designation_id
      LEFT JOIN branches b ON b.id=e.branch_id LEFT JOIN employees m ON m.id=e.manager_id WHERE e.id=?`, [req.params.id]);
    if (!e) return res.redirect('/directory');
    const skills = db.all('SELECT * FROM employee_skills WHERE employee_id=? ORDER BY level DESC', [e.id]);
    res.render('comms/person', { title: H.fullName(e), e, skills });
  });

  // تقویم رویدادها
  app.get('/events/calendar', H.authRequired, H.permRequired('events'), (req, res) => {
    const today = utils.todayIso(tz());
    const cj = utils.toJalali(...today.split('-').map(Number));
    const jy = parseInt(utils.enNum(req.query.jy || ''), 10) || cj.jy;
    const jm = parseInt(utils.enNum(req.query.jm || ''), 10) || cj.jm;
    const range = utils.jMonthRange(jy, jm);
    const events = db.all('SELECT * FROM events WHERE date BETWEEN ? AND ? ORDER BY date, time', [range.start, range.end]);
    const birthdays = db.all(`SELECT id, first_name, last_name, birth_date, photo FROM employees WHERE status='active' AND birth_date IS NOT NULL AND birth_date != ''`);
    const days = [];
    let d = range.start;
    while (d <= range.end) {
      const jd = utils.toJalali(...d.split('-').map(Number));
      const dayEvents = events.filter(e => e.date === d);
      const dayBirths = birthdays.filter(b => {
        const bj = utils.toJalali(...b.birth_date.split('-').map(Number));
        return bj.jm === jm && bj.jd === jd.jd;
      });
      days.push({ date: d, jd, events: dayEvents, births: dayBirths, weekend: utils.isoWeekdaySat(d) === 6, holiday: !!db.get('SELECT id FROM holidays WHERE date=?', [d]) });
      d = utils.addDaysIso(d, 1);
    }
    res.render('comms/calendar', { title: 'تقویم رویدادها', days, jy, jm, monthName: utils.FA_MONTHS[jm - 1] });
  });
};
