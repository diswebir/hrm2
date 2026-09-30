'use strict';
/** احراز هویت: ورود، خروج، بازیابی رمز، تغییر رمز */
const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../src/db');
const H = require('../src/helpers');
const mailer = require('../src/mailer');
const utils = require('../src/utils');

module.exports = function (app) {
  const tz = () => parseInt(db.getSetting('tz_offset', '210'), 10) || 210;
  const maxAttempts = () => parseInt(db.getSetting('login_max_attempts', '5'), 10) || 5;
  const lockMin = () => parseInt(db.getSetting('lock_minutes', '15'), 10) || 15;
  const minLen = () => Math.max(6, parseInt(db.getSetting('min_password_length', '6'), 10) || 6);

  app.get('/login', (req, res) => {
    if (req.session.user) return res.redirect('/');
    res.render('auth/login', { title: 'ورود به سامانه', error: null, success: req.query.reset ? 'رمز عبور با موفقیت تغییر کرد؛ وارد شوید.' : null });
  });

  app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const fail = msg => res.status(401).render('auth/login', { title: 'ورود به سامانه', error: msg, success: null });
    if (!username || !password) return fail('نام کاربری و رمز عبور را وارد کنید.');
    const u = db.get('SELECT * FROM users WHERE username=? OR email=?', [username.trim(), String(username).trim().toLowerCase()]);
    if (!u) return fail('نام کاربری یا رمز عبور اشتباه است.');
    if (!u.is_active) return fail('حساب کاربری شما غیرفعال است. با مدیر سیستم تماس بگیرید.');
    if (u.locked_until && new Date(u.locked_until.replace(' ', 'T')) > new Date()) {
      return fail(`حساب شما موقتاً قفل شده است. حدود ${utils.faNum(lockMin())} دقیقه دیگر تلاش کنید.`);
    }
    if (!bcrypt.compareSync(password, u.password)) {
      const attempts = (u.failed_attempts || 0) + 1;
      if (attempts >= maxAttempts()) {
        db.update('users', u.id, { failed_attempts: 0, locked_until: utils.nowDateTime(tz().valueOf ? tz() : 210).valueOf ? null : null } && { failed_attempts: 0, locked_until: new Date(Date.now() + lockMin() * 60000).toISOString().slice(0, 19).replace('T', ' ') });
        H.log({ user: { id: u.id } }, 'locked', 'user', u.id, 'قفل حساب به دلیل تلاش‌های ناموفق');
        return fail(`رمز عبور ${utils.faNum(maxAttempts())} بار اشتباه وارد شد؛ حساب تا ${utils.faNum(lockMin())} دقیقه قفل است.`);
      }
      db.update('users', u.id, { failed_attempts: attempts });
      return fail(`نام کاربری یا رمز عبور اشتباه است. (${utils.faNum(maxAttempts() - attempts)} تلاش باقی مانده)`);
    }
    // ورود موفق
    const emp = u.employee_id ? db.get('SELECT * FROM employees WHERE id=?', [u.employee_id]) : null;
    req.session.user = {
      id: u.id, username: u.username, role: u.role, employee_id: u.employee_id || null,
      name: emp ? `${emp.first_name} ${emp.last_name}` : u.username,
      photo: emp ? emp.photo : ''
    };
    db.update('users', u.id, { failed_attempts: 0, locked_until: null, last_login: utils.nowDateTime(tz()) });
    H.log(req, 'login', 'user', u.id, u.username);
    res.redirect('/');
  });

  app.get('/logout', (req, res) => { req.session.destroy(() => res.redirect('/login')); });
  app.post('/logout', (req, res) => { req.session.destroy(() => res.redirect('/login')); });

  // ---------- فراموشی رمز ----------
  app.get('/forgot', (req, res) => {
    res.render('auth/forgot', { title: 'بازیابی رمز عبور', error: null, done: false });
  });

  app.post('/forgot', async (req, res) => {
    const { username } = req.body;
    const u = username ? db.get('SELECT * FROM users WHERE username=? OR email=?', [username.trim(), String(username).trim().toLowerCase()]) : null;
    if (u && u.is_active) {
      const token = crypto.randomBytes(24).toString('hex');
      const expires = new Date(Date.now() + 3600000).toISOString().slice(0, 19).replace('T', ' ');
      db.update('users', u.id, { reset_token: token, reset_expires: expires });
      const base = `${req.protocol}://${req.get('host')}`;
      const link = `${base}/reset/${token}`;
      const html = `<div style="font-family:Tahoma;text-align:right;direction:rtl">
        <h3>بازیابی رمز عبور — ${db.getSetting('system_name')}</h3>
        <p>برای تعیین رمز عبور جدید روی لینک زیر کلیک کنید (اعتبار ۱ ساعت):</p>
        <p><a href="${link}">${link}</a></p></div>`;
      const sent = await mailer.send(u.email, 'بازیابی رمز عبور', html);
      if (!sent.ok) {
        // بدون SMTP: لینک برای مدیران سامانه اعلان می‌شود
        const admins = db.all(`SELECT id FROM users WHERE role='admin' AND is_active=1`);
        H.notify(admins.map(a => a.id), `درخواست بازیابی رمز: ${u.username}`, `لینک تعیین رمز جدید (۱ ساعت اعتبار): ${link}`, '/users');
      }
    }
    res.render('auth/forgot', {
      title: 'بازیابی رمز عبور', error: null, done: true,
      note: 'اگر حساب با این مشخصات وجود داشته باشد، لینک بازیابی برای شما ارسال (یا برای مدیر سامانه اعلان) می‌شود.'
    });
  });

  app.get('/reset/:token', (req, res) => {
    const u = db.get('SELECT * FROM users WHERE reset_token=? AND reset_expires > ?', [req.params.token, utils.nowDateTime(tz())]);
    res.render('auth/reset', { title: 'تعیین رمز جدید', token: req.params.token, valid: !!u, error: null });
  });

  app.post('/reset/:token', (req, res) => {
    const u = db.get('SELECT * FROM users WHERE reset_token=? AND reset_expires > ?', [req.params.token, utils.nowDateTime(tz())]);
    if (!u) return res.render('auth/reset', { title: 'تعیین رمز جدید', token: req.params.token, valid: false, error: 'لینک منقضی یا نامعتبر است.' });
    const { password, password2 } = req.body;
    if (!password || password.length < minLen()) return res.render('auth/reset', { title: 'تعیین رمز جدید', token: req.params.token, valid: true, error: `رمز عبور حداقل باید ${utils.faNum(minLen())} کاراکتر باشد.` });
    if (password !== password2) return res.render('auth/reset', { title: 'تعیین رمز جدید', token: req.params.token, valid: true, error: 'تکرار رمز عبور مطابقت ندارد.' });
    db.update('users', u.id, { password: bcrypt.hashSync(password, 10), reset_token: null, reset_expires: null, failed_attempts: 0, locked_until: null });
    H.log({ user: { id: u.id } }, 'password-reset', 'user', u.id, u.username);
    res.redirect('/login?reset=1');
  });

  // ---------- تغییر رمز (کاربر واردشده) ----------
  app.get('/change-password', H.authRequired, (req, res) => {
    res.render('auth/change_password', { title: 'تغییر رمز عبور', error: null, done: false });
  });
  app.post('/change-password', H.authRequired, (req, res) => {
    const { current, password, password2 } = req.body;
    const u = db.get('SELECT * FROM users WHERE id=?', [req.user.id]);
    const bad = m => res.render('auth/change_password', { title: 'تغییر رمز عبور', error: m, done: false });
    if (!bcrypt.compareSync(current || '', u.password)) return bad('رمز عبور فعلی اشتباه است.');
    if (!password || password.length < minLen()) return bad(`رمز جدید حداقل باید ${utils.faNum(minLen())} کاراکتر باشد.`);
    if (password !== password2) return bad('تکرار رمز جدید مطابقت ندارد.');
    db.update('users', u.id, { password: bcrypt.hashSync(password, 10) });
    H.log(req, 'password-change', 'user', u.id, '');
    res.render('auth/change_password', { title: 'تغییر رمز عبور', error: null, done: true });
  });
};
