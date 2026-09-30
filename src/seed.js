'use strict';
/** داده‌های پایه نصب + داده‌های نمونه (دمو) */
const bcrypt = require('bcryptjs');
const db = require('./db');
const utils = require('./utils');
const H = require('./helpers');

const DEFAULT_PERMS = {
  hr: ['dashboard','employees','departments','designations','branches','contracts','employee_documents','attendance','overtime','shifts','holidays','leave','payroll','loans','goals','appraisals','recruitment','training','assets','expenses','tickets','announcements','events','documents','directory','reports','activity'],
  manager: ['dashboard','employees','attendance','overtime','leave','goals','appraisals','recruitment','training','expenses','tickets','announcements','events','directory','reports'],
  employee: ['dashboard','attendance','overtime','leave','payroll','goals','expenses','tickets','announcements','events','directory']
};

function seedBase({ company, adminUser, adminPass, adminName, adminFamily }) {
  // نقش‌ها
  Object.entries(DEFAULT_PERMS).forEach(([k, perms]) => {
    if (!db.get('SELECT id FROM roles WHERE name=?', [k])) {
      db.insert('roles', { name: k, permissions: JSON.stringify(perms) });
    }
  });
  // تنظیمات پیش‌فرض
  const defaults = {
    installed: '1',
    system_name: 'سامانه جامع منابع انسانی',
    company_name: company || 'شرکت نمونه',
    currency: 'تومان',
    tz_offset: '210',
    ot_hourly_rate: '',
    insurance_percent: '7',
    tax_percent: '0',
    min_password_length: '6',
    login_max_attempts: '5',
    lock_minutes: '15',
    session_hours: '10',
    version: '1.0.0',
    seeded: '0'
  };
  Object.entries(defaults).forEach(([k, v]) => { if (db.getSetting(k, '') === '') db.setSetting(k, v); });
  if (!db.getSetting('session_secret')) db.setSetting('session_secret', 'hrm-' + Math.random().toString(36).slice(2) + Date.now().toString(36));
  // حساب مدیر
  const hash = bcrypt.hashSync(adminPass, 10);
  const uid = db.insert('users', {
    username: adminUser, email: '', password: hash, role: 'admin',
    employee_id: null, is_active: 1, created_at: utils.nowDateTime(210)
  });
  return uid;
}

function seedDemo(tz = 210) {
  const rand = (seed => () => (seed = (seed * 9301 + 49297) % 233280) / 233280)(42);
  const pick = arr => arr[Math.floor(rand() * arr.length)];

  // ساختار سازمانی
  const depts = {};
  [['مدیریت', null], ['فناوری اطلاعات', null], ['مالی و اداری', null], ['فروش و بازاریابی', null], ['منابع انسانی', null], ['توسعه نرم‌افزار', 'فناوری اطلاعات'], ['پشتیبانی فنی', 'فناوری اطلاعات']].forEach(([name, parent]) => {
    const pid = parent ? (depts[parent] || null) : null;
    depts[name] = db.insert('departments', { name, parent_id: pid, manager_id: null, description: '' });
  });
  const desigs = {};
  ['مدیرعامل', 'مدیر واحد', 'سرپرست', 'کارشناس ارشد', 'کارشناس', 'کاربر', 'کارآموز'].forEach(n => {
    desigs[n] = db.insert('designations', { name: n, department_id: null, description: '' });
  });
  const br1 = db.insert('branches', { name: 'دفتر مرکزی', city: 'تهران', address: 'خیابان ولیعصر، برج نگین', phone: '021-12345678', is_active: 1 });
  const br2 = db.insert('branches', { name: 'شعبه اصفهان', city: 'اصفهان', address: 'خیابان چهارباغ', phone: '031-87654321', is_active: 1 });
  const shift = db.insert('shifts', { name: 'شیفت اداری', start_time: '09:00', end_time: '17:00', break_minutes: 60, grace_minutes: 15, work_days: '0,1,2,3,4' });
  const shift2 = db.insert('shifts', { name: 'شیفت گردشی', start_time: '15:00', end_time: '23:00', break_minutes: 45, grace_minutes: 10, work_days: '0,1,2,3,4,5' });

  // انواع مرخصی
  const ltA = db.insert('leave_types', { name: 'استحقاقی', annual_quota: 26, is_paid: 1, color: '#198754', requires_doc: 0 });
  const ltS = db.insert('leave_types', { name: 'استعلاجی', annual_quota: 10, is_paid: 1, color: '#0d6efd', requires_doc: 1 });
  const ltU = db.insert('leave_types', { name: 'بدون حقوق', annual_quota: 15, is_paid: 0, color: '#6c757d', requires_doc: 0 });

  // تعطیلات نمونه (سال جاری شمسی)
  const cm = utils.currentJMonth(tz);
  const g1 = utils.toGregorian(cm.jy, 1, 1);
  const iso1 = d => `${d.gy}-${String(d.gm).padStart(2, '0')}-${String(d.gd).padStart(2, '0')}`;
  db.insert('holidays', { title: 'نوروز - فروردین', date: iso1(g1), description: 'جشن نوروز' });
  db.insert('holidays', { title: 'روز کارگر', date: iso1(utils.toGregorian(cm.jy, 2, 11)), description: '۱۱ اردیبهشت' });

  // کارکنان
  const people = [
    ['علی', 'رضایی', 'مدیرعامل', 'مدیریت', 'male', 1403000, 60000000],
    ['مریم', 'احمدی', 'مدیر واحد', 'منابع انسانی', 'female', 1402200, 35000000],
    ['حسین', 'کریمی', 'مدیر واحد', 'فناوری اطلاعات', 'male', 1401100, 38000000],
    ['زهرا', 'موسوی', 'کارشناس ارشد', 'توسعه نرم‌افزار', 'female', 1403500, 32000000],
    ['رضا', 'حیدری', 'کارشناس ارشد', 'توسعه نرم‌افزار', 'male', 1404200, 28000000],
    ['فاطمه', 'نوری', 'کارشناس', 'مالی و اداری', 'female', 1405100, 24000000],
    ['محمد', 'صادقی', 'سرپرست', 'پشتیبانی فنی', 'male', 1403300, 26000000],
    ['نرگس', 'قاسمی', 'کارشناس', 'فروش و بازاریابی', 'female', 1406200, 22000000],
    ['امیر', 'عباسی', 'کاربر', 'پشتیبانی فنی', 'male', 1407500, 18000000],
    ['سارا', 'طاهری', 'کارشناس', 'منابع انسانی', 'female', 1406400, 21000000],
    ['مهدی', 'اسماعیلی', 'کاربر', 'فروش و بازاریابی', 'male', 1408300, 16000000],
    ['نگار', 'جعفری', 'کارآموز', 'توسعه نرم‌افزار', 'female', 1410000, 9000000]
  ];
  const today = utils.todayIso(tz);
  const year = today.slice(0, 4);
  const empIds = [];
  people.forEach((p, i) => {
    const [fn, ln, des, dept, gender, hireJ, salary] = p;
    const hire = iso1(utils.toGregorian(Math.floor(hireJ / 1000), Math.floor(hireJ / 100) % 10, hireJ % 100));
    const id = db.insert('employees', {
      code: String(1001 + i), first_name: fn, last_name: ln, father_name: '', national_id: '00' + (12345670 + i * 137),
      gender, birth_date: `${1970 + Math.floor(rand() * 25)}-${String(1 + Math.floor(rand() * 12)).padStart(2, '0')}-${String(1 + Math.floor(rand() * 28)).padStart(2, '0')}`,
      marital_status: rand() > 0.4 ? 'married' : 'single', children_count: Math.floor(rand() * 3),
      phone: '0912' + String(1000000 + Math.floor(rand() * 8999999)), email: `user${1001 + i}@example.com`,
      address: '', photo: '', department_id: depts[dept], designation_id: desigs[des], branch_id: rand() > 0.8 ? br2 : br1,
      manager_id: null, shift_id: des === 'سرپرست' ? shift2 : shift,
      hire_date: hire, contract_type: pick(['full_time', 'full_time', 'contract']), contract_end: iso1(utils.toGregorian(cm.jy + (rand() > 0.7 ? 0 : 1), Math.max(1, cm.jm + (rand() > 0.8 ? 1 : 3)), 28)),
      base_salary: salary, status: 'active', bank_name: 'بانک ملت', bank_account: 'IR' + String(120000000000000000000000 + i), insurance_no: '', notes: '', terminated_at: null, termination_reason: ''
    });
    empIds.push(id);
  });
  // مدیران
  db.update('employees', empIds[0], { manager_id: null });
  [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].forEach(i => {
    const mgr = [2, 1, 1, 3, 3, 6, 3, 8, 7, 2, 4][i - 1];
    db.update('employees', empIds[i], { manager_id: empIds[mgr] });
  });
  db.update('departments', depts['فناوری اطلاعات'], { manager_id: empIds[2] });
  db.update('departments', depts['منابع انسانی'], { manager_id: empIds[1] });

  // کاربران نمونه
  const pass = bcrypt.hashSync('123456', 10);
  db.insert('users', { username: 'hr', email: 'hr@example.com', password: pass, role: 'hr', employee_id: empIds[1], is_active: 1 });
  db.insert('users', { username: 'manager', email: 'manager@example.com', password: pass, role: 'manager', employee_id: empIds[2], is_active: 1 });
  db.insert('users', { username: 'employee', email: 'employee@example.com', password: pass, role: 'employee', employee_id: empIds[4], is_active: 1 });

  // تحصیلات/مهارت/خانواده نمونه
  db.insert('employee_education', { employee_id: empIds[4], degree: 'کارشناسی', field: 'مهندسی کامپیوتر', institute: 'دانشگاه تهران', year: '1400', gpa: '17.5' });
  db.insert('employee_skills', { employee_id: empIds[4], skill: 'JavaScript', level: 5, note: '' });
  db.insert('employee_skills', { employee_id: empIds[4], skill: 'Node.js', level: 4, note: '' });
  db.insert('employee_contacts', { employee_id: empIds[4], name: 'سمیرا حیدری', relation: 'همسر', phone: '09121112233', is_emergency: 1 });

  // حضور یک ماه اخیر (روزهای کاری)
  for (let d = 30; d >= 0; d--) {
    const iso = utils.addDaysIso(today, -d);
    const wd = utils.isoWeekdaySat(iso);
    if (wd === 5 || wd === 6) continue;
    empIds.forEach((eid, i) => {
      if (rand() < 0.06) { db.insert('attendance', { employee_id: eid, date: iso, check_in: null, check_out: null, status: rand() > 0.5 ? 'leave' : 'absent', late_minutes: 0, early_minutes: 0, overtime_minutes: 0, worked_minutes: 0, source: 'manual', note: '' }); return; }
      const late = rand() < 0.25 ? Math.floor(rand() * 40) : 0;
      const inH = 9 + (late > 15 ? Math.floor(late / 60) : 0), inM = (late % 60);
      const ot = rand() < 0.15 ? Math.floor(rand() * 90) : 0;
      const outTotal = 17 * 60 + ot;
      db.insert('attendance', {
        employee_id: eid, date: iso,
        check_in: `${String(inH).padStart(2, '0')}:${String(inM).padStart(2, '0')}`,
        check_out: `${String(Math.floor(outTotal / 60)).padStart(2, '0')}:${String(outTotal % 60).padStart(2, '0')}`,
        status: 'present', late_minutes: late > 15 ? late : 0, early_minutes: 0,
        overtime_minutes: ot, worked_minutes: 8 * 60 - 60 + ot, source: 'demo', note: ''
      });
    });
  }

  // مرخصی‌ها
  db.insert('leave_requests', { employee_id: empIds[4], leave_type_id: ltA, from_date: utils.addDaysIso(today, -10), to_date: utils.addDaysIso(today, -11), days: 2, reason: 'امور شخصی', status: 'approved', approver_id: null, decision_note: '', created_at: utils.nowDateTime(tz), decided_at: utils.nowDateTime(tz) });
  db.insert('leave_requests', { employee_id: empIds[5], leave_type_id: ltS, from_date: utils.addDaysIso(today, 5), to_date: utils.addDaysIso(today, 6), days: 2, reason: 'بیماری', status: 'pending', approver_id: null, decision_note: '', created_at: utils.nowDateTime(tz), decided_at: null });

  // لیست حقوق ماه قبل
  const lastM = (() => { const j = utils.jMonthOfIso(utils.addDaysIso(today, -35)); return `${j.jy}-${String(j.jm).padStart(2, '0')}`; })();
  empIds.slice(0, 8).forEach((eid, i) => {
    const e = db.get('SELECT * FROM employees WHERE id=?', [eid]);
    const base = e.base_salary, ot = 0, net = base - Math.round(base * 0.07);
    const pid = db.insert('payrolls', {
      month: lastM, employee_id: eid, base, worked_days: 22, overtime_hours: ot, overtime_amount: 0,
      allowances: 0, deductions: 0, insurance: Math.round(base * 0.07), tax: 0, loan_deduction: 0, net,
      status: 'final', note: '', created_by: 1, created_at: utils.nowDateTime(tz), finalized_at: utils.nowDateTime(tz)
    });
    db.insert('payroll_items', { payroll_id: pid, label: 'بن خواروبار', amount: 2200000, kind: 'allowance' });
  });

  // دارایی‌ها
  const a1 = db.insert('assets', { code: 'AST-1001', name: 'لپ‌تاپ لنوو T14', category: 'it', brand: 'Lenovo', serial: 'SN-99881', purchase_date: utils.addDaysIso(today, -400), value: 45000000, condition: 'good', status: 'available', location: 'دفتر مرکزی', note: '' });
  db.insert('assets', { code: 'AST-1002', name: 'مانیتور سامسونگ ۲۴', category: 'it', brand: 'Samsung', serial: 'SN-77221', purchase_date: utils.addDaysIso(today, -300), value: 12000000, condition: 'new', status: 'available', location: 'دفتر مرکزی', note: '' });
  db.insert('asset_assignments', { asset_id: a1, employee_id: empIds[4], assigned_date: utils.addDaysIso(today, -100), due_date: null, returned_date: null, condition_out: 'سالم', condition_in: '', note: '', status: 'active' });
  db.update('assets', a1, { status: 'assigned' });

  // اطلاعیه/رویداد/هدف/آگهی/دوره
  db.insert('announcements', { title: 'خوش آمدید به سامانه منابع انسانی', body: 'این یک اطلاعیه نمونه است. اطلاعیه‌های واقعی خود را از بخش ارتباطات ثبت کنید.', audience: 'all', department_id: null, publish_date: today, expire_date: utils.addDaysIso(today, 30), pinned: 1, created_by: 1 });
  db.insert('events', { title: 'جلسه ماهانه مدیران', type: 'meeting', date: utils.addDaysIso(today, 3), time: '10:00', location: 'اتاق جلسات', description: '', created_by: 1 });
  db.insert('goals', { employee_id: empIds[4], title: 'کاهش زمان پاسخ API', description: 'بهبود عملکرد سرویس‌ها', weight: 40, due_date: utils.addDaysIso(today, 60), progress: 45, status: 'in_progress', period: 'سه‌ماهه', created_by: 1 });
  db.insert('job_postings', { title: 'کارشناس فرانت‌اند', department_id: depts['فناوری اطلاعات'], location: 'تهران', employment_type: 'full_time', vacancies: 2, description: 'توسعه رابط کاربری محصولات', requirements: 'React، تسلط به CSS', salary_min: 20000000, salary_max: 35000000, status: 'open', open_date: today, close_date: utils.addDaysIso(today, 30) });
  db.insert('candidates', { posting_id: 1, name: 'پیمان شریفی', email: 'p@example.com', phone: '09351112233', source: 'linkedin', stage: 'interview', rating: 4, expected_salary: 28000000, resume_path: '', cover_note: '', note: '' });
  const tr = db.insert('trainings', { title: 'دوره امنیت اطلاعات', provider: 'آکادمی فنی', category: 'امنیت', from_date: utils.addDaysIso(today, 10), to_date: utils.addDaysIso(today, 12), cost: 15000000, capacity: 20, location: 'سالن آموزش', description: '', status: 'planned' });
  db.insert('training_enrollments', { training_id: tr, employee_id: empIds[4], status: 'enrolled', score: 0, certificate_path: '', note: '' });

  db.setSetting('seeded', '1');
  H.log({ user: { id: 1 } }, 'seed-demo', 'system', 0, 'داده‌های نمونه ایجاد شد');
}

module.exports = { seedBase, seedDemo, DEFAULT_PERMS };
