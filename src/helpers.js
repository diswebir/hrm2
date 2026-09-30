'use strict';
/** میان‌افزارها و کمکی‌های احراز هویت، دسترسی‌ها، اعلان‌ها و لاگ */
const db = require('./db');
const utils = require('./utils');
const { esc } = utils;

// ---------- مجوزها ----------
const MODULES = {
  dashboard: 'داشبورد',
  employees: 'کارکنان',
  departments: 'دپارتمان‌ها',
  designations: 'سمت‌های سازمانی',
  branches: 'شعب',
  contracts: 'قراردادها',
  employee_documents: 'مدارک کارکنان',
  attendance: 'حضور و غیاب',
  overtime: 'اضافه‌کاری',
  shifts: 'شیفت‌ها',
  holidays: 'تعطیلات رسمی',
  leave: 'مرخصی',
  payroll: 'حقوق و دستمزد',
  loans: 'وام و مساعده',
  goals: 'اهداف عملکردی',
  appraisals: 'ارزیابی عملکرد',
  recruitment: 'جذب و استخدام',
  training: 'آموزش',
  assets: 'اموال و دارایی‌ها',
  expenses: 'هزینه‌ها',
  tickets: 'تیکت پشتیبانی',
  announcements: 'اطلاعیه‌ها',
  events: 'رویدادها و تقویم',
  documents: 'مخزن اسناد',
  directory: 'دایرکتوری کارکنان',
  reports: 'گزارش‌ها',
  users: 'مدیریت کاربران',
  roles: 'مدیریت نقش‌ها',
  settings: 'تنظیمات سامانه',
  backup: 'پشتیبان‌گیری',
  activity: 'لاگ فعالیت‌ها'
};

const ROLE_NAMES = { admin: 'مدیر سیستم', hr: 'کارشناس منابع انسانی', manager: 'مدیر واحد', employee: 'کارمند' };

function userPermissions(user) {
  if (!user) return {};
  if (user.role === 'admin') {
    const o = {}; Object.keys(MODULES).forEach(k => o[k] = 1); return o;
  }
  try {
    const r = db.get('SELECT permissions FROM roles WHERE name=?', [user.role]);
    if (r) {
      const p = JSON.parse(r.permissions);
      if (Array.isArray(p)) { const o = {}; p.forEach(k => { o[k] = 1; }); return o; }
      return p || {};
    }
  } catch (e) {}
  const defaults = { hr: ['dashboard','employees','departments','designations','branches','contracts','employee_documents','attendance','overtime','shifts','holidays','leave','payroll','loans','goals','appraisals','recruitment','training','assets','expenses','tickets','announcements','events','documents','directory','reports','activity'],
    manager: ['dashboard','employees','attendance','overtime','leave','goals','appraisals','recruitment','training','expenses','tickets','announcements','events','directory','reports','directory'],
    employee: ['dashboard','attendance','overtime','leave','payroll','goals','expenses','tickets','announcements','events','directory'] };
  return defaults[user.role] || [];
}

function can(user, mod) {
  if (!user) return false;
  return !!userPermissions(user)[mod];
}

// ---------- محافظت CSRF ----------
function csrf(req, res, next) {
  if (!req.session.csrf) req.session.csrf = Math.random().toString(36).slice(2) + Date.now().toString(36);
  if (req.method === 'POST') {
    const token = (req.body && req.body._csrf) || req.get('x-csrf-token');
    if (!token || token !== req.session.csrf) {
      return res.status(403).send('توکن CSRF نامعتبر است. لطفاً صفحه را رفرش کنید.');
    }
  }
  res.locals.csrf = req.session.csrf;
  next();
}

// ---------- احراز هویت ----------
function authRequired(req, res, next) {
  if (!req.session.user) {
    if (req.xhr || req.path.startsWith('/api')) return res.status(401).json({ error: 'unauthorized' });
    return res.redirect('/login');
  }
  req.user = req.session.user;
  res.locals.user = req.user;
  res.locals.can = (m) => can(req.user, m);
  next();
}

function permRequired(mod) {
  return (req, res, next) => {
    if (can(req.user, mod)) return next();
    res.status(403).render('error', { title: 'دسترسی غیرمجاز', message: 'شما به این بخش دسترسی ندارید.', user: req.user, can: () => false });
  };
}

// ---------- لاگ فعالیت ----------
function log(req, action, entity, entityId, details = '') {
  try {
    db.insert('activity_logs', {
      user_id: req && req.user ? req.user.id : null,
      action, entity: entity || '', entity_id: entityId || null,
      details: String(details).slice(0, 500),
      ip: (req && req.headers ? (req.headers['x-forwarded-for'] || req.socket && req.socket.remoteAddress || '') : '').toString().slice(0, 60)
    });
  } catch (e) { console.error('[log]', e.message); }
}

// ---------- اعلان داخلی ----------
function notify(userIds, title, body, link = '') {
  const ids = Array.isArray(userIds) ? userIds : [userIds];
  ids.forEach(uid => {
    if (uid == null) return;
    db.insert('notifications', { user_id: uid, title, body: String(body).slice(0, 300), link });
  });
}

function notifyRole(role, title, body, link = '') {
  const rows = db.all('SELECT id FROM users WHERE role=? AND is_active=1', [role]);
  notify(rows.map(r => r.id), title, body, link);
}

/** شناسه‌های کاربری مدیران یک کارمند (مدیر مستقیم + hr + admin) */
function approversOf(employeeId) {
  const emp = db.get('SELECT manager_id FROM employees WHERE id=?', [employeeId]);
  const ids = [];
  if (emp && emp.manager_id) {
    const u = db.get('SELECT id FROM users WHERE employee_id=? AND is_active=1', [emp.manager_id]);
    if (u) ids.push(u.id);
  }
  db.all(`SELECT id FROM users WHERE role IN ('hr','admin') AND is_active=1`).forEach(r => ids.push(r.id));
  return [...new Set(ids)];
}

// ---------- کمکی‌های نمایش ----------
function fullName(e) { return e ? `${e.first_name || ''} ${e.last_name || ''}`.trim() : '—'; }

function badgeClass(v) {
  const map = {
    pending: 'warning', approved: 'success', rejected: 'danger', cancelled: 'secondary',
    draft: 'secondary', final: 'success', active: 'success', suspended: 'warning', terminated: 'danger',
    present: 'success', absent: 'danger', leave: 'info', mission: 'primary', holiday: 'dark',
    open: 'success', closed: 'secondary', answered: 'info',
    new: 'primary', screening: 'info', interview: 'warning', offer: 'primary', hired: 'success',
    enrolled: 'primary', completed: 'success', failed: 'danger',
    available: 'success', assigned: 'warning', retired: 'secondary',
    in_progress: 'primary', done: 'success', overdue: 'danger',
    planned: 'info', ongoing: 'warning',
    low: 'secondary', normal: 'info', high: 'warning', urgent: 'danger',
    passed: 'success', onboarding: 'info', offboarding: 'secondary'
  };
  return map[v] || 'secondary';
}

module.exports = { MODULES, ROLE_NAMES, can, userPermissions, csrf, authRequired, permRequired, log, notify, notifyRole, approversOf, fullName, badgeClass };
