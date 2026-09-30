'use strict';
/** جذب و استخدام: کاندیداها، پیپ‌لاین، تبدیل به کارمند */
const express = require('express');
const db = require('../src/db');
const utils = require('../src/utils');
const H = require('../src/helpers');
const { upload } = require('../src/crud');

module.exports = function (app) {
  const STAGES = ['new', 'screening', 'interview', 'offer', 'hired', 'rejected'];

  app.get('/candidates', H.authRequired, H.permRequired('recruitment'), (req, res) => {
    const view = req.query.view === 'kanban' ? 'kanban' : 'list';
    const posting = req.query.posting || '';
    let sql = `SELECT c.*, p.title AS posting_title FROM candidates c JOIN job_postings p ON p.id=c.posting_id`;
    const params = [];
    if (posting) { sql += ' WHERE c.posting_id=?'; params.push(posting); }
    sql += ' ORDER BY c.id DESC';
    const rows = db.all(sql, params);
    res.render('recruitment/candidates', {
      title: 'کاندیداها', rows, view, stages: STAGES, posting,
      postings: db.all('SELECT id, title FROM job_postings ORDER BY id DESC')
    });
  });

  app.get('/candidates/new', H.authRequired, H.permRequired('recruitment'), (req, res) => {
    res.render('recruitment/candidate_form', {
      title: 'ثبت کاندیدای جدید', error: null, row: {},
      postings: db.all(`SELECT id, title FROM job_postings WHERE status='open' ORDER BY id DESC`)
    });
  });

  app.post('/candidates/new', H.authRequired, H.permRequired('recruitment'), upload.single('resume'), (req, res) => {
    const b = req.body;
    if (!b.name || !b.posting_id) {
      return res.status(400).render('recruitment/candidate_form', {
        title: 'ثبت کاندیدای جدید', error: 'نام و آگهی الزامی است.', row: b,
        postings: db.all(`SELECT id, title FROM job_postings WHERE status='open' ORDER BY id DESC`)
      });
    }
    const id = db.insert('candidates', {
      posting_id: parseInt(b.posting_id, 10), name: b.name.trim(), email: b.email || '', phone: b.phone || '',
      source: b.source || 'website', stage: 'new', rating: parseInt(b.rating || '0', 10) || 0,
      expected_salary: parseFloat(utils.enNum(b.expected_salary || '0').replace(/,/g, '')) || 0,
      resume_path: req.file ? 'uploads/' + req.file.filename : '', cover_note: b.cover_note || '', note: ''
    });
    H.log(req, 'create', 'candidates', id, b.name);
    res.redirect('/candidates/' + id);
  });

  app.get('/candidates/:id(\\d+)', H.authRequired, H.permRequired('recruitment'), (req, res) => {
    const c = db.get(`SELECT c.*, p.title AS posting_title FROM candidates c JOIN job_postings p ON p.id=c.posting_id WHERE c.id=?`, [req.params.id]);
    if (!c) return res.redirect('/candidates');
    const interviews = db.all(`SELECT i.*, e.first_name, e.last_name FROM interviews i LEFT JOIN employees e ON e.id=i.interviewer_id WHERE i.candidate_id=? ORDER BY i.date DESC`, [c.id]);
    res.render('recruitment/candidate_view', { title: c.name, c, interviews, stages: STAGES });
  });

  app.get('/candidates/:id(\\d+)/edit', H.authRequired, H.permRequired('recruitment'), (req, res) => {
    const c = db.get('SELECT * FROM candidates WHERE id=?', [req.params.id]);
    if (!c) return res.redirect('/candidates');
    res.render('recruitment/candidate_form', {
      title: 'ویرایش کاندیدا', error: null, row: c,
      postings: db.all('SELECT id, title FROM job_postings ORDER BY id DESC')
    });
  });

  app.post('/candidates/:id(\\d+)/edit', H.authRequired, H.permRequired('recruitment'), upload.single('resume'), (req, res) => {
    const c = db.get('SELECT * FROM candidates WHERE id=?', [req.params.id]);
    if (!c) return res.redirect('/candidates');
    const b = req.body;
    db.update('candidates', c.id, {
      posting_id: parseInt(b.posting_id, 10) || c.posting_id, name: b.name || c.name, email: b.email || '', phone: b.phone || '',
      source: b.source || c.source, stage: b.stage || c.stage, rating: parseInt(b.rating || '0', 10) || 0,
      expected_salary: parseFloat(utils.enNum(b.expected_salary || '0').replace(/,/g, '')) || 0,
      resume_path: req.file ? 'uploads/' + req.file.filename : c.resume_path,
      cover_note: b.cover_note || '', note: b.note || ''
    });
    H.log(req, 'update', 'candidates', c.id, b.name);
    res.redirect('/candidates/' + c.id);
  });

  app.post('/candidates/:id(\\d+)/stage', H.authRequired, H.permRequired('recruitment'), (req, res) => {
    const c = db.get('SELECT * FROM candidates WHERE id=?', [req.params.id]);
    const stage = req.body.stage;
    if (c && STAGES.includes(stage)) {
      db.update('candidates', c.id, { stage });
      H.log(req, 'stage', 'candidates', c.id, stage);
    }
    res.redirect(req.body.back || '/candidates/' + c.id);
  });

  app.post('/candidates/:id(\\d+)/delete', H.authRequired, H.permRequired('recruitment'), (req, res) => {
    db.run('DELETE FROM interviews WHERE candidate_id=?', [req.params.id]);
    db.del('candidates', req.params.id);
    res.redirect('/candidates');
  });

  // تبدیل به کارمند
  app.get('/candidates/:id(\\d+)/convert', H.authRequired, H.permRequired('recruitment'), (req, res) => {
    const c = db.get('SELECT * FROM candidates WHERE id=?', [req.params.id]);
    if (!c) return res.redirect('/candidates');
    const posting = db.get('SELECT * FROM job_postings WHERE id=?', [c.posting_id]);
    res.redirect(`/employees/new?prefill_name=${encodeURIComponent(c.name)}&prefill_phone=${encodeURIComponent(c.phone || '')}&prefill_email=${encodeURIComponent(c.email || '')}&prefill_dept=${posting ? posting.department_id || '' : ''}&from_candidate=${c.id}`);
  });

  // گزارش قیف جذب
  app.get('/reports/recruitment', H.authRequired, H.permRequired('recruitment'), (req, res) => {
    const byStage = STAGES.map(s => ({ stage: s, c: db.count('SELECT COUNT(*) AS c FROM candidates WHERE stage=?', [s]) }));
    const byPosting = db.all(`SELECT p.title, COUNT(c.id) AS c, SUM(CASE WHEN c.stage='hired' THEN 1 ELSE 0 END) AS hired
      FROM job_postings p LEFT JOIN candidates c ON c.posting_id=p.id GROUP BY p.id ORDER BY c DESC`);
    res.render('reports/recruitment', { title: 'گزارش جذب و استخدام', byStage, byPosting, stages: STAGES });
  });
};
