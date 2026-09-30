'use strict';
/** ساختار منوی کناری — فیلتر بر اساس مجوزهای کاربر انجام می‌شود */
const MENU = [
  { label: 'داشبورد', icon: 'bi-speedometer2', url: '/', perm: 'dashboard' },
  {
    section: 'منابع انسانی', items: [
      { label: 'کارکنان', icon: 'bi-people', url: '/employees', perm: 'employees' },
      { label: 'دپارتمان‌ها', icon: 'bi-diagram-3', url: '/departments', perm: 'departments' },
      { label: 'چارت سازمانی', icon: 'bi-diagram-2', url: '/orgchart', perm: 'departments' },
      { label: 'سمت‌های سازمانی', icon: 'bi-person-badge', url: '/designations', perm: 'designations' },
      { label: 'شعب', icon: 'bi-buildings', url: '/branches', perm: 'branches' },
      { label: 'قراردادها', icon: 'bi-file-earmark-text', url: '/contracts', perm: 'contracts' },
      { label: 'مدارک کارکنان', icon: 'bi-folder2', url: '/employee-documents', perm: 'employee_documents' }
    ]
  },
  {
    section: 'حضور و غیاب', items: [
      { label: 'حضور روزانه', icon: 'bi-clock-history', url: '/attendance', perm: 'attendance' },
      { label: 'تقویم حضور', icon: 'bi-calendar3', url: '/attendance/calendar', perm: 'attendance' },
      { label: 'گزارش حضور', icon: 'bi-journal-text', url: '/attendance/report', perm: 'attendance' },
      { label: 'تایید اضافه‌کاری', icon: 'bi-stopwatch', url: '/overtime/approvals', perm: 'overtime' },
      { label: 'شیفت‌ها', icon: 'bi-alarm', url: '/shifts', perm: 'shifts' },
      { label: 'تعطیلات رسمی', icon: 'bi-flag', url: '/holidays', perm: 'holidays' }
    ]
  },
  {
    section: 'مرخصی', items: [
      { label: 'درخواست‌های مرخصی', icon: 'bi-calendar2-check', url: '/leave', perm: 'leave' },
      { label: 'مانده مرخصی‌ها', icon: 'bi-calculator', url: '/leave/balances', perm: 'leave' },
      { label: 'تقویم تیمی', icon: 'bi-calendar-week', url: '/leave/team-calendar', perm: 'leave' },
      { label: 'انواع مرخصی', icon: 'bi-list-check', url: '/leave-types', perm: 'leave' }
    ]
  },
  {
    section: 'حقوق و دستمزد', items: [
      { label: 'لیست حقوق', icon: 'bi-cash-stack', url: '/payroll', perm: 'payroll' },
      { label: 'وام و مساعده', icon: 'bi-bank', url: '/loans', perm: 'loans' }
    ]
  },
  {
    section: 'عملکرد', items: [
      { label: 'اهداف (KPI)', icon: 'bi-bullseye', url: '/goals', perm: 'goals' },
      { label: 'ارزیابی‌ها', icon: 'bi-clipboard-data', url: '/appraisals', perm: 'appraisals' },
      { label: 'دوره‌های ارزیابی', icon: 'bi-calendar-range', url: '/appraisal-cycles', perm: 'appraisals' }
    ]
  },
  {
    section: 'جذب و استخدام', items: [
      { label: 'آگهی‌های شغلی', icon: 'bi-megaphone', url: '/postings', perm: 'recruitment' },
      { label: 'کاندیداها', icon: 'bi-person-plus', url: '/candidates', perm: 'recruitment' },
      { label: 'مصاحبه‌ها', icon: 'bi-clipboard2-check', url: '/interviews', perm: 'recruitment' }
    ]
  },
  {
    section: 'آموزش و اموال', items: [
      { label: 'دوره‌های آموزشی', icon: 'bi-mortarboard', url: '/trainings', perm: 'training' },
      { label: 'ثبت‌نام‌های دوره', icon: 'bi-person-check', url: '/enrollments', perm: 'training' },
      { label: 'دارایی‌ها', icon: 'bi-box-seam', url: '/assets', perm: 'assets' },
      { label: 'تحویل اموال', icon: 'bi-arrow-left-right', url: '/asset-assignments', perm: 'assets' }
    ]
  },
  {
    section: 'مالی و پشتیبانی', items: [
      { label: 'هزینه‌ها', icon: 'bi-receipt', url: '/expenses', perm: 'expenses' },
      { label: 'تیکت‌ها', icon: 'bi-life-preserver', url: '/tickets', perm: 'tickets' }
    ]
  },
  {
    section: 'ارتباطات', items: [
      { label: 'اطلاعیه‌ها', icon: 'bi-megaphone-fill', url: '/announcements', perm: 'announcements' },
      { label: 'رویدادها و تقویم', icon: 'bi-calendar-event', url: '/events', perm: 'events' },
      { label: 'مخزن اسناد', icon: 'bi-archive', url: '/docs', perm: null },
      { label: 'دایرکتوری کارکنان', icon: 'bi-person-vcard', url: '/directory', perm: 'directory' }
    ]
  },
  { label: 'گزارش‌ها', icon: 'bi-bar-chart-line', url: '/reports', perm: 'reports' },
  {
    section: 'مدیریت سامانه', items: [
      { label: 'کاربران', icon: 'bi-person-gear', url: '/users', perm: 'users' },
      { label: 'نقش‌ها و دسترسی‌ها', icon: 'bi-shield-lock', url: '/roles', perm: 'roles' },
      { label: 'تنظیمات', icon: 'bi-gear', url: '/settings', perm: 'settings' },
      { label: 'پشتیبان‌گیری', icon: 'bi-cloud-arrow-down', url: '/backup', perm: 'backup' },
      { label: 'لاگ فعالیت‌ها', icon: 'bi-list-columns-reverse', url: '/activity', perm: 'activity' }
    ]
  },
  { label: 'درباره سامانه', icon: 'bi-info-circle', url: '/about', perm: null, free: true }
];

function menuFor(user) {
  if (!user) return [];
  const H = require('./helpers');
  const out = [];
  for (const item of MENU) {
    if (item.section) {
      const items = item.items.filter(i => !i.perm || H.can(user, i.perm));
      if (items.length) out.push({ section: item.section, items });
    } else if (item.free || H.can(user, item.perm)) {
      out.push(item);
    }
  }
  return out;
}

module.exports = { MENU, menuFor };
