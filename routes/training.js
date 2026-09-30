'use strict';
/** آموزش: صفحه دوره با ثبت‌نام شرکت‌کنندگان */
const express = require('express');
const db = require('../src/db');
const utils = require('../src/utils');
const H = require('../src/helpers');

module.exports = function (app) {
  app.get('/trainings/:id(\\d+)/detail', H.authRequired, H.permRequired('training'), (req, res) => {
    const t = db.get('SELECT * FROM trainings WHERE id=?', [req.params.id]);
    if (!t) return res.redirect('/trainings');
    const enrollments = db.all(`SELECT te.*, e.first_name, e.last_name, e.code FROM training_enrollments te
      JOIN employees e ON e.id=te.employee_id WHERE te.training_id=? ORDER BY te.id DESC`, [t.id]);
    const enrolledIds = enrollments.map(e => e.employee_id);
    const emps = db.all(`SELECT id, first_name, last_name FROM employees WHERE status='active' ORDER BY last_name`)
      .filter(e => !enrolledIds.includes(e.id));
    res.render('training/detail', { title: t.title, t, enrollments, emps, error: req.query.error || null });
  });

  app.post('/trainings/:id(\\d+)/enroll', H.authRequired, H.permRequired('training'), (req, res) => {
    const t = db.get('SELECT * FROM trainings WHERE id=?', [req.params.id]);
    const empId = parseInt(req.body.employee_id, 10);
    if (!t || !empId) return res.redirect('/trainings');
    const exists = db.get('SELECT id FROM training_enrollments WHERE training_id=? AND employee_id=?', [t.id, empId]);
    if (exists) return res.redirect(`/trainings/${t.id}/detail?error=${encodeURIComponent('قبلاً ثبت‌نام شده')}`);
    if (t.capacity > 0) {
      const c = db.count('SELECT COUNT(*) AS c FROM training_enrollments WHERE training_id=?', [t.id]);
      if (c >= t.capacity) return res.redirect(`/trainings/${t.id}/detail?error=${encodeURIComponent('ظرفیت تکمیل است')}`);
    }
    db.insert('training_enrollments', { training_id: t.id, employee_id: empId, status: 'enrolled', score: 0, certificate_path: '', note: '' });
    H.log(req, 'enroll', 'trainings', t.id, String(empId));
    res.redirect(`/trainings/${t.id}/detail`);
  });

  app.post('/trainings/:id(\\d+)/status', H.authRequired, H.permRequired('training'), (req, res) => {
    const t = db.get('SELECT * FROM trainings WHERE id=?', [req.params.id]);
    if (t && ['planned', 'ongoing', 'completed', 'cancelled'].includes(req.body.status)) {
      db.update('trainings', t.id, { status: req.body.status });
    }
    res.redirect(`/trainings/${t.id}/detail`);
  });
};
