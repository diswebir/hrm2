'use strict';
/** نصب‌کننده وب سامانه — در اولین اجرا به‌صورت خودکار فعال می‌شود */
const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../src/db');
const { seedBase, seedDemo } = require('../src/seed');
const H = require('../src/helpers');

module.exports = function (app) {
  function checks() {
    const c = [];
    const nodeOk = parseInt(process.versions.node, 10) >= 16;
    c.push({ label: `نسخه Node.js (${process.versions.node}) — حداقل ۱۶`, ok: nodeOk, fix: 'از cPanel > Setup Node.js App نسخه بالاتری انتخاب کنید.' });
    let dbOk = false;
    try { db.count('SELECT COUNT(*) AS c FROM settings'); dbOk = true; } catch (e) {}
    c.push({ label: 'موتور دیتابیس SQLite (sql.js)', ok: dbOk, fix: 'دستور npm install را در پوشه برنامه اجرا کنید.' });
    let wrOk = false;
    try { fs.accessSync(db.DATA_DIR, fs.constants.W_OK); wrOk = true; } catch (e) {
      try { fs.mkdirSync(db.DATA_DIR, { recursive: true }); fs.accessSync(db.DATA_DIR, fs.constants.W_OK); wrOk = true; } catch (e2) {}
    }
    c.push({ label: 'قابل‌نوشته‌بودن پوشه data', ok: wrOk, fix: 'دسترسی نوشتن (۷۵۵ یا ۷۵۰) به پوشه data در پوشه برنامه بدهید.' });
    let lockOk = false;
    try { fs.writeFileSync(path.join(db.DATA_DIR, '.locktest'), 'x'); fs.unlinkSync(path.join(db.DATA_DIR, '.locktest')); lockOk = true; } catch (e) {}
    c.push({ label: 'آزمون نوشتن فایل روی دیسک', ok: lockOk, fix: 'مجوز پوشه data را بررسی کنید.' });
    return c;
  }

  app.get('/install', (req, res) => {
    if (db.isInstalled()) return res.redirect('/');
    res.render('install', { title: 'نصب سامانه', checks: checks(), error: null });
  });

  app.post('/install', (req, res) => {
    if (db.isInstalled()) return res.redirect('/');
    const { company_name, system_name, admin_username, admin_email, admin_pass, admin_pass2, first_name, last_name, demo } = req.body;
    const bad = msg => res.render('install', { title: 'نصب سامانه', checks: checks(), error: msg });
    if (!company_name || !admin_username || !admin_pass) return bad('همه فیلدهای ستاره‌دار الزامی است.');
    if (admin_pass !== admin_pass2) return bad('تکرار رمز عبور با رمز عبور یکسان نیست.');
    const minLen = parseInt(req.body.min_len || '6', 10) || 6;
    if (admin_pass.length < Math.max(6, minLen)) return bad('رمز عبور حداقل باید ۶ کاراکتر باشد.');
    if (!/^[a-zA-Z0-9_.@-]{3,40}$/.test(admin_username)) return bad('نام کاربری فقط حروف انگلیسی، عدد و ._@- مجاز است.');

    try {
      seedBase({ company: company_name, adminUser: admin_username, adminPass: admin_pass });
      db.setSetting('company_name', company_name);
      if (system_name) db.setSetting('system_name', system_name);
      if (admin_email) db.run('UPDATE users SET email=? WHERE username=?', [admin_email, admin_username]);
      if (demo === '1') seedDemo();
      H.log({ user: { id: 1 } }, 'install', 'system', 0, `نصب توسط ${admin_username}`);
      res.render('install_done', { title: 'نصب تکمیل شد', admin_username });
    } catch (e) {
      console.error(e);
      bad('خطا در نصب: ' + e.message);
    }
  });
};
