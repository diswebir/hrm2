'use strict';
/** ارسال ایمیل اختیاری از طریق SMTP (قابل تنظیم در بخش تنظیمات سامانه) */
const nodemailer = require('nodemailer');
const db = require('./db');

function isEnabled() {
  return db.getSetting('smtp_enabled', '0') === '1' && db.getSetting('smtp_host', '');
}

function transporter() {
  return nodemailer.createTransport({
    host: db.getSetting('smtp_host'),
    port: parseInt(db.getSetting('smtp_port', '587'), 10) || 587,
    secure: db.getSetting('smtp_secure', '0') === '1',
    auth: { user: db.getSetting('smtp_user'), pass: db.getSetting('smtp_pass') }
  });
}

/** ارسال ایمیل — در صورت فعال نبودن SMTP بی‌صدا رد می‌شود */
async function send(to, subject, html) {
  if (!isEnabled() || !to) return { ok: false, skipped: true };
  try {
    const from = db.getSetting('smtp_from') || db.getSetting('smtp_user');
    await transporter().sendMail({ from, to, subject, html });
    return { ok: true };
  } catch (e) {
    console.error('[mailer]', e.message);
    return { ok: false, error: e.message };
  }
}

module.exports = { isEnabled, send };
