'use strict';
/**
 * سامانه جامع مدیریت منابع انسانی — HRM Pro v1.0
 * نقطه ورود برنامه (Application startup file برای cPanel/Passenger)
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const session = require('express-session');
const db = require('./src/db');
const utils = require('./src/utils');
const H = require('./src/helpers');
const { menuFor } = require('./src/menu');

async function main() {
  await db.init();

  const app = express();
  app.set('trust proxy', true);
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));
  app.disable('x-powered-by');

  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
  app.use(express.static(path.join(__dirname, 'public'), { maxAge: '7d', immutable: true }));
  // فایل‌های آپلودی (نیازمند ورود)
  app.use('/uploads', express.static(path.join(db.DATA_DIR, 'uploads')));

  app.use(express.urlencoded({ extended: true, limit: '8mb' }));

  // نشست‌ها
  const SqliteStore = require('./src/sessionStore')(session);
  const secret = process.env.HRM_SECRET || db.getSetting('session_secret') || ('hrm-tmp-' + Math.random().toString(36).slice(2));
  app.use(session({
    name: 'hrm.sid',
    secret,
    store: new SqliteStore(),
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 12 },
    rolling: false
  }));

  // دروازه نصب
  app.use((req, res, next) => {
    const installed = db.isInstalled();
    if (!installed && !req.path.startsWith('/install')) return res.redirect('/install');
    if (installed && req.path === '/install') return res.redirect('/');
    next();
  });

  // متغیرهای عمومی ویو
  app.use((req, res, next) => {
    const s = db.allSettings();
    res.locals.s = s;
    res.locals.tz = parseInt(s.tz_offset || '210', 10) || 210;
    res.locals.U = utils;
    res.locals.HH = H;
    res.locals.user = req.session.user || null;
    res.locals.menu = req.session.user ? menuFor(req.session.user) : [];
    res.locals.currentPath = req.path;
    res.locals.q = req.query;
    res.locals.notifCount = 0;
    if (req.session.user) {
      req.user = req.session.user;
      res.locals.notifCount = db.count('SELECT COUNT(*) AS c FROM notifications WHERE user_id=? AND is_read=0', [req.user.id]);
    }
    next();
  });

  // محافظت CSRF روی همه POSTها
  app.use(H.csrf);

  // روت‌ها
  require('./routes/install')(app);
  require('./routes/auth')(app);
  require('./routes/core')(app);        // داشبورد، جستجو، اعلان‌ها، فایل‌ها، پروفایل من، درباره
  require('./routes/setupCrud')(app);   // ماژول‌های CRUD استاندارد
  require('./routes/employees')(app);
  require('./routes/attendance')(app);
  require('./routes/leave')(app);
  require('./routes/payroll')(app);
  require('./routes/performance')(app);
  require('./routes/recruitment')(app);
  require('./routes/training')(app);
  require('./routes/assets')(app);
  require('./routes/finance')(app);     // هزینه‌ها
  require('./routes/tickets')(app);
  require('./routes/comms')(app);       // اطلاعیه، رویداد، اسناد، دایرکتوری
  require('./routes/reports')(app);
  require('./routes/admin')(app);       // کاربران، نقش‌ها، تنظیمات، پشتیبان، لاگ

  // 404
  app.use((req, res) => {
    res.status(404).render('error', {
      title: 'صفحه یافت نشد', message: 'آدرس مورد نظر وجود ندارد.',
      user: req.user || null, can: m => req.user ? H.can(req.user, m) : false, HH: H, U: utils, s: db.allSettings(), menu: []
    });
  });
  // خطاها
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error('[error]', err);
    if (res.headersSent) return;
    res.status(500).render('error', {
      title: 'خطای سرور', message: 'خطایی رخ داد: ' + err.message,
      user: req.user || null, can: m => req.user ? H.can(req.user, m) : false, HH: H, U: utils, s: db.allSettings(), menu: []
    });
  });

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ سامانه منابع انسانی روی پورت ${PORT} اجرا شد`);
  });
}

main().catch(e => { console.error('خطای راه‌اندازی:', e); process.exit(1); });
