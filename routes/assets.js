'use strict';
/** اموال: تحویل و بازپس‌گیری دارایی */
const express = require('express');
const db = require('../src/db');
const utils = require('../src/utils');
const H = require('../src/helpers');

module.exports = function (app) {
  const tz = () => parseInt(db.getSetting('tz_offset', '210'), 10) || 210;

  app.get('/asset-assignments', H.authRequired, H.permRequired('assets'), (req, res) => {
    const rows = db.all(`SELECT aa.*, a.name AS asset_name, a.code AS asset_code, e.first_name, e.last_name, e.code AS emp_code
      FROM asset_assignments aa JOIN assets a ON a.id=aa.asset_id JOIN employees e ON e.id=aa.employee_id
      ORDER BY CASE aa.status WHEN 'active' THEN 0 ELSE 1 END, aa.id DESC LIMIT 300`);
    const available = db.all(`SELECT id, name, code FROM assets WHERE status='available' ORDER BY name`);
    const emps = db.all(`SELECT id, first_name, last_name FROM employees WHERE status='active' ORDER BY last_name`);
    res.render('assets/assignments', { title: 'تحویل اموال', rows, available, emps, jDateEn: utils.jDateEn, error: req.query.error || null });
  });

  app.post('/asset-assignments', H.authRequired, H.permRequired('assets'), (req, res) => {
    const assetId = parseInt(req.body.asset_id, 10);
    const empId = parseInt(req.body.employee_id, 10);
    const asset = db.get('SELECT * FROM assets WHERE id=?', [assetId]);
    const emp = db.get('SELECT * FROM employees WHERE id=?', [empId]);
    if (!asset || !emp) return res.redirect('/asset-assignments');
    if (asset.status !== 'available') return res.redirect('/asset-assignments?error=' + encodeURIComponent('این دارایی در دسترس نیست (تحویل‌شده یا اسقاط).'));
    const id = db.insert('asset_assignments', {
      asset_id: assetId, employee_id: empId,
      assigned_date: utils.gDate(req.body.assigned_date) || utils.todayIso(tz()),
      due_date: utils.gDate(req.body.due_date), returned_date: null,
      condition_out: req.body.condition_out || '', condition_in: '', note: req.body.note || '', status: 'active'
    });
    db.update('assets', assetId, { status: 'assigned' });
    H.log(req, 'assign', 'assets', assetId, emp.first_name + ' ' + emp.last_name);
    res.redirect('/asset-assignments');
  });

  app.post('/asset-assignments/:id(\\d+)/return', H.authRequired, H.permRequired('assets'), (req, res) => {
    const aa = db.get('SELECT * FROM asset_assignments WHERE id=?', [req.params.id]);
    if (!aa || aa.status !== 'active') return res.redirect('/asset-assignments');
    db.update('asset_assignments', aa.id, {
      returned_date: utils.todayIso(tz()), condition_in: req.body.condition_in || '', status: 'returned'
    });
    db.update('assets', aa.asset_id, { status: 'available' });
    H.log(req, 'return', 'assets', aa.asset_id, '');
    res.redirect('/asset-assignments');
  });
};
