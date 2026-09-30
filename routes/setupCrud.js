'use strict';
/** تعریف ماژول‌های استاندارد CRUD سامانه */
const { defineCrud, empOptions, deptOptions } = require('../src/crud');
const db = require('../src/db');
const utils = require('../src/utils');
const H = require('../src/helpers');

module.exports = function (app) {
  const today = () => utils.todayIso(parseInt(db.getSetting('tz_offset', '210'), 10) || 210);

  defineCrud(app, {
    base: '/departments', table: 'departments', permission: 'departments',
    title: 'دپارتمان‌ها', singular: 'دپارتمان', icon: 'bi-diagram-3',
    subtitle: 'ساختار واحدهای سازمانی (قابل تعریف سلسله‌مراتبی)',
    orderBy: 'name ASC', searchable: ['name'],
    fields: [
      { name: 'name', label: 'نام دپارتمان', type: 'text', required: true, col: 6 },
      { name: 'parent_id', label: 'واحد والد', type: 'select', options: () => { const o = { '': '— بدون والد —' }; db.all('SELECT id,name FROM departments ORDER BY name').forEach(r => o[r.id] = r.name); return o; }, col: 6 },
      { name: 'manager_id', label: 'مدیر واحد', type: 'employee', options: empOptions, col: 6 },
      { name: 'description', label: 'توضیحات', type: 'textarea', col: 6 }
    ]
  });

  defineCrud(app, {
    base: '/designations', table: 'designations', permission: 'designations',
    title: 'سمت‌های سازمانی', singular: 'سمت', icon: 'bi-person-badge',
    orderBy: 'name ASC', searchable: ['name'],
    fields: [
      { name: 'name', label: 'عنوان شغلی', type: 'text', required: true, col: 6 },
      { name: 'department_id', label: 'دپارتمان مرتبط', type: 'department', options: deptOptions, col: 6 },
      { name: 'description', label: 'توضیحات', type: 'textarea', col: 12 }
    ]
  });

  defineCrud(app, {
    base: '/branches', table: 'branches', permission: 'branches',
    title: 'شعب و مکان‌ها', singular: 'شعبه', icon: 'bi-buildings',
    orderBy: 'name ASC', searchable: ['name', 'city'],
    fields: [
      { name: 'name', label: 'نام شعبه', type: 'text', required: true, col: 6 },
      { name: 'city', label: 'شهر', type: 'text', col: 6 },
      { name: 'phone', label: 'تلفن', type: 'text', col: 6 },
      { name: 'address', label: 'آدرس', type: 'textarea', col: 6 },
      { name: 'is_active', label: 'فعال', type: 'toggle', col: 12 }
    ]
  });

  defineCrud(app, {
    base: '/shifts', table: 'shifts', permission: 'shifts',
    title: 'شیفت‌های کاری', singular: 'شیفت', icon: 'bi-alarm',
    subtitle: 'ساعت کاری، استراحت، گریس‌تایم و روزهای کاری هفته',
    orderBy: 'id ASC', searchable: ['name'],
    fields: [
      { name: 'name', label: 'نام شیفت', type: 'text', required: true, col: 6 },
      { name: 'start_time', label: 'ساعت شروع', type: 'time', required: true, col: 3 },
      { name: 'end_time', label: 'ساعت پایان', type: 'time', required: true, col: 3 },
      { name: 'break_minutes', label: 'استراحت (دقیقه)', type: 'number', col: 6 },
      { name: 'grace_minutes', label: 'گریس‌تایم تأخیر (دقیقه)', type: 'number', col: 6 },
      { name: 'work_days', label: 'روزهای کاری هفته', type: 'weekdays', required: true, col: 12, help: 'روزهای انتخاب‌نشده تعطیل محسوب می‌شوند.' }
    ]
  });

  defineCrud(app, {
    base: '/holidays', table: 'holidays', permission: 'holidays',
    title: 'تعطیلات رسمی', singular: 'تعطیلی', icon: 'bi-flag',
    subtitle: 'در محاسبه روزهای مرخصی و تقویم‌ها لحاظ می‌شود',
    orderBy: 'date DESC', searchable: ['title'],
    fields: [
      { name: 'title', label: 'عنوان', type: 'text', required: true, col: 6 },
      { name: 'date', label: 'تاریخ', type: 'date', required: true, col: 6 },
      { name: 'description', label: 'توضیحات', type: 'textarea', col: 12 }
    ]
  });

  defineCrud(app, {
    base: '/leave-types', table: 'leave_types', permission: 'leave',
    title: 'انواع مرخصی', singular: 'نوع مرخصی', icon: 'bi-list-check',
    orderBy: 'id ASC', searchable: ['name'],
    fields: [
      { name: 'name', label: 'نوع مرخصی', type: 'text', required: true, col: 6 },
      { name: 'annual_quota', label: 'سقف روزانه سالانه', type: 'number', col: 3 },
      { name: 'color', label: 'رنگ نمایش', type: 'color', col: 3 },
      { name: 'is_paid', label: 'حقوق‌دار', type: 'toggle', col: 6 },
      { name: 'requires_doc', label: 'الزام پیوست مدرک', type: 'toggle', col: 6 }
    ]
  });

  defineCrud(app, {
    base: '/contracts', table: 'contracts', permission: 'contracts',
    title: 'قراردادهای کاری', singular: 'قرارداد', icon: 'bi-file-earmark-text',
    searchable: ['title'],
    fields: [
      { name: 'employee_id', label: 'کارمند', type: 'employee', options: empOptions, required: true, col: 6 },
      { name: 'title', label: 'عنوان قرارداد', type: 'text', required: true, col: 6 },
      { name: 'type', label: 'نوع', type: 'select', options: { full_time: 'تمام‌وقت', part_time: 'پاره‌وقت', contract: 'قراردادی', project: 'پروژه‌ای', intern: 'کارآموزی' }, col: 4 },
      { name: 'start_date', label: 'شروع', type: 'date', col: 4 },
      { name: 'end_date', label: 'پایان', type: 'date', col: 4 },
      { name: 'salary', label: 'مبلغ (ماهانه)', type: 'money', col: 4 },
      { name: 'status', label: 'وضعیت', type: 'select', options: { active: 'فعال', expired: 'منقضی', terminated: 'فسخ شده' }, col: 4 },
      { name: 'file', label: 'فایل قرارداد', type: 'file', col: 4 },
      { name: 'note', label: 'توضیحات', type: 'textarea', col: 12 }
    ]
  });

  defineCrud(app, {
    base: '/employee-documents', table: 'employee_documents', permission: 'employee_documents',
    title: 'مدارک کارکنان', singular: 'مدرک', icon: 'bi-folder2',
    subtitle: 'مدارک با تاریخ انقضا در گزارش‌های هشدار نمایش داده می‌شوند',
    searchable: ['title'],
    fields: [
      { name: 'employee_id', label: 'کارمند', type: 'employee', options: empOptions, required: true, col: 6 },
      { name: 'title', label: 'عنوان مدرک', type: 'text', required: true, col: 6 },
      { name: 'category', label: 'دسته', type: 'select', options: { id: 'هویتی', edu: 'تحصیلی', cert: 'گواهینامه', job: 'شغلی', other: 'سایر' }, col: 4 },
      { name: 'issue_date', label: 'تاریخ صدور', type: 'date', col: 4 },
      { name: 'expiry_date', label: 'تاریخ انقضا', type: 'date', col: 4 },
      { name: 'file', label: 'فایل مدرک', type: 'file', required: true, col: 12 },
      { name: 'note', label: 'توضیحات', type: 'textarea', col: 12 }
    ],
    fieldsRenderExtras: {
      employee_id: (row) => { const e = db.get('SELECT first_name,last_name FROM employees WHERE id=?', [row.employee_id]); return e ? `${e.first_name} ${e.last_name}` : null; }
    }
  });

  defineCrud(app, {
    base: '/postings', table: 'job_postings', permission: 'recruitment',
    title: 'آگهی‌های شغلی', singular: 'آگهی', icon: 'bi-megaphone',
    searchable: ['title', 'location'],
    fields: [
      { name: 'title', label: 'عنوان شغلی', type: 'text', required: true, col: 6 },
      { name: 'department_id', label: 'دپارتمان', type: 'department', options: deptOptions, col: 6 },
      { name: 'location', label: 'محل', type: 'text', col: 4 },
      { name: 'employment_type', label: 'نوع همکاری', type: 'select', options: { full_time: 'تمام‌وقت', part_time: 'پاره‌وقت', contract: 'قراردادی', intern: 'کارآموزی' }, col: 4 },
      { name: 'vacancies', label: 'تعداد نفرات', type: 'number', col: 4 },
      { name: 'salary_min', label: 'حداقل حقوق', type: 'money', col: 6 },
      { name: 'salary_max', label: 'حداکثر حقوق', type: 'money', col: 6 },
      { name: 'open_date', label: 'تاریخ شروع', type: 'date', col: 6 },
      { name: 'close_date', label: 'تاریخ پایان', type: 'date', col: 6 },
      { name: 'status', label: 'وضعیت', type: 'select', options: { open: 'باز', closed: 'بسته' }, col: 12 },
      { name: 'description', label: 'شرح شغل', type: 'textarea', col: 6 },
      { name: 'requirements', label: 'شرایط احراز', type: 'textarea', col: 6 }
    ]
  });

  defineCrud(app, {
    base: '/interviews', table: 'interviews', permission: 'recruitment',
    title: 'مصاحبه‌ها', singular: 'مصاحبه', icon: 'bi-clipboard2-check',
    searchable: ['location'],
    fields: [
      { name: 'candidate_id', label: 'کاندیدا', type: 'select', options: () => { const o = {}; db.all('SELECT id,name FROM candidates ORDER BY id DESC').forEach(r => o[r.id] = r.name); return o; }, required: true, col: 6 },
      { name: 'stage', label: 'مرحله', type: 'select', options: { screening: 'بررسی رزومه', interview: 'مصاحبه', offer: 'پیشنهاد همکاری', final: 'مصاحبه نهایی' }, col: 6 },
      { name: 'date', label: 'تاریخ', type: 'date', required: true, col: 4 },
      { name: 'time', label: 'ساعت', type: 'time', col: 4 },
      { name: 'interviewer_id', label: 'مصاحبه‌کننده', type: 'employee', options: empOptions, col: 4 },
      { name: 'location', label: 'مکان / لینک', type: 'text', col: 6 },
      { name: 'result', label: 'نتیجه', type: 'select', options: { pending: 'در انتظار', passed: 'قبول', failed: 'رد' }, col: 3 },
      { name: 'score', label: 'امتیاز (۰-۱۰۰)', type: 'number', col: 3 },
      { name: 'note', label: 'یادداشت ارزیاب', type: 'textarea', col: 12 }
    ]
  });

  defineCrud(app, {
    base: '/trainings', table: 'trainings', permission: 'training',
    title: 'دوره‌های آموزشی', singular: 'دوره', icon: 'bi-mortarboard',
    searchable: ['title', 'provider'],
    fields: [
      { name: 'title', label: 'عنوان دوره', type: 'text', required: true, col: 6 },
      { name: 'provider', label: 'برگزارکننده', type: 'text', col: 6 },
      { name: 'category', label: 'دسته', type: 'text', col: 4 },
      { name: 'from_date', label: 'شروع', type: 'date', col: 4 },
      { name: 'to_date', label: 'پایان', type: 'date', col: 4 },
      { name: 'cost', label: 'هزینه کل', type: 'money', col: 4 },
      { name: 'capacity', label: 'ظرفیت', type: 'number', col: 4 },
      { name: 'location', label: 'محل برگزاری', type: 'text', col: 4 },
      { name: 'status', label: 'وضعیت', type: 'select', options: { planned: 'برنامه‌ریزی شده', ongoing: 'در حال اجرا', completed: 'تکمیل شده', cancelled: 'لغو شده' }, col: 6 },
      { name: 'description', label: 'توضیحات', type: 'textarea', col: 6 }
    ]
  });

  defineCrud(app, {
    base: '/enrollments', table: 'training_enrollments', permission: 'training',
    title: 'ثبت‌نام‌های دوره', singular: 'ثبت‌نام', icon: 'bi-person-check',
    fields: [
      { name: 'training_id', label: 'دوره', type: 'select', options: () => { const o = {}; db.all('SELECT id,title FROM trainings ORDER BY id DESC').forEach(r => o[r.id] = r.title); return o; }, required: true, col: 6 },
      { name: 'employee_id', label: 'کارمند', type: 'employee', options: empOptions, required: true, col: 6 },
      { name: 'status', label: 'وضعیت', type: 'select', options: { enrolled: 'ثبت‌نام شده', completed: 'تکمیل شده', failed: 'ناتمام' }, col: 4 },
      { name: 'score', label: 'نمره', type: 'number', col: 4 },
      { name: 'certificate', label: 'گواهینامه', type: 'file', col: 4 },
      { name: 'note', label: 'توضیحات', type: 'textarea', col: 12 }
    ],
    beforeSave: (data, req, id) => {
      if (!id) {
        const exists = db.get('SELECT id FROM training_enrollments WHERE training_id=? AND employee_id=?', [data.training_id, data.employee_id]);
        if (exists) return { error: 'این کارمند قبلاً در این دوره ثبت‌نام شده است.' };
        const t = db.get('SELECT capacity FROM trainings WHERE id=?', [data.training_id]);
        if (t && t.capacity > 0) {
          const c = db.count('SELECT COUNT(*) AS c FROM training_enrollments WHERE training_id=?', [data.training_id]);
          if (c >= t.capacity) return { error: `ظرفیت دوره تکمیل است (${utils.faNum(t.capacity)} نفر).` };
        }
      }
    }
  });

  defineCrud(app, {
    base: '/assets', table: 'assets', permission: 'assets',
    title: 'دارایی‌های سازمانی', singular: 'دارایی', icon: 'bi-box-seam',
    searchable: ['name', 'code', 'serial'],
    fields: [
      { name: 'name', label: 'نام دارایی', type: 'text', required: true, col: 6 },
      { name: 'code', label: 'کد (خالی = خودکار)', type: 'text', col: 6 },
      { name: 'category', label: 'دسته', type: 'select', options: { it: 'فناوری اطلاعات', furniture: 'لوازم اداری', vehicle: 'خودرو', other: 'سایر' }, col: 4 },
      { name: 'brand', label: 'برند', type: 'text', col: 4 },
      { name: 'serial', label: 'شماره سریال', type: 'text', col: 4 },
      { name: 'purchase_date', label: 'تاریخ خرید', type: 'date', col: 4 },
      { name: 'value', label: 'ارزش (تومان)', type: 'money', col: 4 },
      { name: 'condition', label: 'وضعیت فیزیکی', type: 'select', options: { new: 'نو', good: 'سالم', repair: 'نیاز به تعمیر', bad: 'فرسوده' }, col: 4 },
      { name: 'status', label: 'وضعیت', type: 'select', options: { available: 'آزاد', assigned: 'تحویل‌شده', retired: 'اسقاط' }, col: 4 },
      { name: 'location', label: 'محل نگهداری', type: 'text', col: 4 },
      { name: 'note', label: 'توضیحات', type: 'textarea', col: 12 }
    ],
    beforeSave: (data) => {
      if (!data.code) {
        const mx = db.get('SELECT MAX(CAST(REPLACE(code,"AST-","") AS INTEGER)) AS m FROM assets');
        data.code = 'AST-' + ((mx && mx.m ? mx.m : 1000) + 1);
      }
    }
  });

  defineCrud(app, {
    base: '/announcements', table: 'announcements', permission: 'announcements',
    title: 'اطلاعیه‌ها', singular: 'اطلاعیه', icon: 'bi-megaphone-fill',
    searchable: ['title'],
    fields: [
      { name: 'title', label: 'عنوان', type: 'text', required: true, col: 12 },
      { name: 'body', label: 'متن اطلاعیه', type: 'textarea', required: true, col: 12, rows: 6 },
      { name: 'audience', label: 'مخاطب', type: 'select', options: { all: 'همه کارکنان', department: 'یک دپارتمان' }, col: 4 },
      { name: 'department_id', label: 'دپارتمان هدف', type: 'department', options: deptOptions, col: 4 },
      { name: 'pinned', label: 'سنجاق در بالا', type: 'toggle', col: 4 },
      { name: 'publish_date', label: 'تاریخ انتشار', type: 'date', col: 6 },
      { name: 'expire_date', label: 'تاریخ انقضا', type: 'date', col: 6 }
    ],
    afterSave: (row, req, isNew) => {
      if (!isNew) return;
      let userIds = db.all('SELECT id FROM users WHERE is_active=1').map(r => r.id);
      if (row.audience === 'department' && row.department_id) {
        userIds = db.all('SELECT id FROM users WHERE employee_id IN (SELECT id FROM employees WHERE department_id=?)', [row.department_id]).map(r => r.id);
      }
      H.notify(userIds, 'اطلاعیه جدید: ' + row.title, String(row.body || '').slice(0, 120), '/announcements/view/' + row.id);
    }
  });

  defineCrud(app, {
    base: '/events', table: 'events', permission: 'events',
    title: 'رویدادها و تقویم', singular: 'رویداد', icon: 'bi-calendar-event',
    orderBy: 'date DESC', searchable: ['title'],
    fields: [
      { name: 'title', label: 'عنوان', type: 'text', required: true, col: 6 },
      { name: 'type', label: 'نوع', type: 'select', options: { meeting: 'جلسه', event: 'رویداد', birthday: 'تولد', other: 'سایر' }, col: 3 },
      { name: 'date', label: 'تاریخ', type: 'date', required: true, col: 3 },
      { name: 'time', label: 'ساعت', type: 'time', col: 3 },
      { name: 'location', label: 'مکان', type: 'text', col: 3 },
      { name: 'description', label: 'توضیحات', type: 'textarea', col: 12 }
    ]
  });

  defineCrud(app, {
    base: '/documents', table: 'documents', permission: 'documents',
    title: 'مخزن اسناد', singular: 'سند', icon: 'bi-archive',
    subtitle: 'آیین‌نامه‌ها، فرم‌ها و دستورالعمل‌های سازمانی',
    searchable: ['title'],
    fields: [
      { name: 'title', label: 'عنوان سند', type: 'text', required: true, col: 6 },
      { name: 'category', label: 'دسته', type: 'select', options: { policy: 'آیین‌نامه', form: 'فرم', guide: 'دستورالعمل', other: 'سایر' }, col: 3 },
      { name: 'version', label: 'نسخه', type: 'text', col: 3 },
      { name: 'expiry_date', label: 'تاریخ بازنگری', type: 'date', col: 6 },
      { name: 'visibility', label: 'سطح نمایش', type: 'select', options: { all: 'عمومی (همه کارکنان)', hr: 'فقط منابع انسانی' }, col: 6 },
      { name: 'file', label: 'فایل سند', type: 'file', required: true, col: 12 }
    ]
  });

  defineCrud(app, {
    base: '/loans', table: 'loans', permission: 'loans',
    title: 'وام و مساعده', singular: 'وام', icon: 'bi-bank',
    subtitle: 'قسط هر ماه هنگام نهایی‌سازی لیست حقوق به‌صورت خودکار کسر می‌شود',
    searchable: ['title'],
    fields: [
      { name: 'employee_id', label: 'کارمند', type: 'employee', options: empOptions, required: true, col: 6 },
      { name: 'title', label: 'عنوان', type: 'text', required: true, col: 6 },
      { name: 'total_amount', label: 'مبلغ کل', type: 'money', required: true, col: 4 },
      { name: 'installment_count', label: 'تعداد اقساط', type: 'number', required: true, col: 4 },
      { name: 'installment_amount', label: 'مبلغ هر قسط (خالی = خودکار)', type: 'money', col: 4 },
      { name: 'start_month', label: 'ماه شروع کسر', type: 'month', required: true, col: 6 },
      { name: 'status', label: 'وضعیت', type: 'select', options: { active: 'فعال', finished: 'تسویه‌شده', cancelled: 'لغو شده' }, col: 6 },
      { name: 'note', label: 'توضیحات', type: 'textarea', col: 12 }
    ],
    beforeSave: (data) => {
      if (!data.installment_amount && data.installment_count > 0) {
        data.installment_amount = Math.round(data.total_amount / data.installment_count);
      }
    }
  });

  defineCrud(app, {
    base: '/goals', table: 'goals', permission: 'goals',
    title: 'اهداف عملکردی (KPI)', singular: 'هدف', icon: 'bi-bullseye',
    searchable: ['title'],
    fields: [
      { name: 'employee_id', label: 'کارمند', type: 'employee', options: empOptions, required: true, col: 6 },
      { name: 'title', label: 'عنوان هدف', type: 'text', required: true, col: 6 },
      { name: 'description', label: 'توضیحات', type: 'textarea', col: 12 },
      { name: 'weight', label: 'وزن (٪)', type: 'number', col: 3 },
      { name: 'progress', label: 'پیشرفت (٪)', type: 'number', col: 3 },
      { name: 'due_date', label: 'مهلت', type: 'date', col: 3 },
      { name: 'period', label: 'دوره', type: 'text', col: 3 },
      { name: 'status', label: 'وضعیت', type: 'select', options: { in_progress: 'در حال انجام', done: 'انجام شده', overdue: 'عقب‌افتاده', cancelled: 'لغو' }, col: 12 }
    ]
  });

  defineCrud(app, {
    base: '/appraisal-cycles', table: 'appraisal_cycles', permission: 'appraisals',
    title: 'دوره‌های ارزیابی', singular: 'دوره ارزیابی', icon: 'bi-calendar-range',
    searchable: ['title'],
    fields: [
      { name: 'title', label: 'عنوان دوره', type: 'text', required: true, col: 6 },
      { name: 'status', label: 'وضعیت', type: 'select', options: { open: 'باز', closed: 'بسته' }, col: 6 },
      { name: 'from_date', label: 'از تاریخ', type: 'date', col: 6 },
      { name: 'to_date', label: 'تا تاریخ', type: 'date', col: 6 },
      { name: 'criteria', label: 'معیارهای ارزیابی (هر خط یک معیار)', type: 'lines', required: true, col: 12, rows: 6, help: 'مثال: کیفیت کار / تعهد و مسئولیت‌پذیری / کار تیمی / خلاقیت' }
    ]
  });
};
