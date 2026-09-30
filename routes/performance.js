'use strict';
/** ارزیابی عملکرد: فرم ارزیابی با معیارهای دوره */
const express = require('express');
const db = require('../src/db');
const utils = require('../src/utils');
const H = require('../src/helpers');

module.exports = function (app) {
  const tz = () => parseInt(db.getSetting('tz_offset', '210'), 10) || 210;

  app.get('/appraisals', H.authRequired, H.permRequired('appraisals'), (req, res) => {
    const rows = db.all(`SELECT a.*, e.first_name, e.last_name, e.code, c.title AS cycle_title, u.username AS reviewer
      FROM appraisals a JOIN employees e ON e.id=a.employee_id JOIN appraisal_cycles c ON c.id=a.cycle_id
      LEFT JOIN users u ON u.id=a.reviewer_id ORDER BY a.id DESC LIMIT 200`);
    const mine = req.user.employee_id ? db.all(`SELECT a.*, c.title AS cycle_title FROM appraisals a JOIN appraisal_cycles c ON c.id=a.cycle_id WHERE a.employee_id=? ORDER BY a.id DESC`, [req.user.employee_id]) : [];
    res.render('performance/index', { title: 'ارزیابی عملکرد', rows, mine });
  });

  app.get('/appraisals/new', H.authRequired, H.permRequired('appraisals'), (req, res) => {
    const cycles = db.all(`SELECT * FROM appraisal_cycles WHERE status='open' ORDER BY id DESC`);
    const emps = db.all(`SELECT id, first_name, last_name, code FROM employees WHERE status='active' ORDER BY last_name`);
    res.render('performance/form', {
      title: 'ثبت ارزیابی جدید', error: null, cycles, emps,
      cycleId: req.query.cycle || '', empId: req.query.employee || ''
    });
  });

  app.get('/appraisals/criteria/:cycleId(\\d+)', H.authRequired, H.permRequired('appraisals'), (req, res) => {
    const c = db.get('SELECT * FROM appraisal_cycles WHERE id=?', [req.params.cycleId]);
    res.json({ criteria: c ? JSON.parse(c.criteria || '[]') : [] });
  });

  app.post('/appraisals/new', H.authRequired, H.permRequired('appraisals'), (req, res) => {
    const b = req.body;
    const cycle = db.get('SELECT * FROM appraisal_cycles WHERE id=?', [b.cycle_id]);
    const empId = parseInt(b.employee_id, 10);
    if (!cycle || !empId) {
      return res.status(400).render('performance/form', {
        title: 'ثبت ارزیابی جدید', error: 'دوره و کارمند را انتخاب کنید.', cycles: db.all(`SELECT * FROM appraisal_cycles WHERE status='open'`),
        emps: db.all(`SELECT id, first_name, last_name, code FROM employees WHERE status='active' ORDER BY last_name`),
        cycleId: b.cycle_id, empId: b.employee_id
      });
    }
    const criteria = JSON.parse(cycle.criteria || '[]');
    const scores = {};
    let total = 0;
    criteria.forEach(cname => {
      const key = 'score_' + Buffer.from(cname).toString('hex').slice(0, 12);
      const v = parseInt(b[cname] || b[key], 10) || 0;
      const clamped = Math.min(5, Math.max(1, v || 3));
      scores[cname] = clamped;
      total += clamped;
    });
    const avg = criteria.length ? total / criteria.length : 0;
    const id = db.insert('appraisals', {
      cycle_id: cycle.id, employee_id: empId, reviewer_id: req.user.id,
      scores: JSON.stringify(scores), total: Math.round(avg * 100) / 100,
      strengths: b.strengths || '', improvements: b.improvements || '', final_comment: b.final_comment || '',
      status: 'submitted', created_at: utils.nowDateTime(tz())
    });
    H.log(req, 'create', 'appraisals', id, '');
    res.redirect('/appraisals/' + id);
  });

  app.get('/appraisals/:id(\\d+)', H.authRequired, H.permRequired('appraisals'), (req, res) => {
    const a = db.get(`SELECT a.*, e.first_name, e.last_name, e.code, c.title AS cycle_title FROM appraisals a
      JOIN employees e ON e.id=a.employee_id JOIN appraisal_cycles c ON c.id=a.cycle_id WHERE a.id=?`, [req.params.id]);
    if (!a) return res.redirect('/appraisals');
    res.render('performance/view', { title: 'نتیجه ارزیابی', a, scores: JSON.parse(a.scores || '{}') });
  });

  app.post('/appraisals/:id(\\d+)/delete', H.authRequired, H.permRequired('appraisals'), (req, res) => {
    db.del('appraisals', req.params.id);
    res.redirect('/appraisals');
  });
};
