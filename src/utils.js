'use strict';
/** ابزارهای عمومی: تاریخ شمسی، اعداد فارسی، فرمت پول، CSV و ... */

// ---------- تبدیل تاریخ میلادی/شمسی (الگوریتم jalaali) ----------
function div(a, b) { return ~~(a / b); }
function mod(a, b) { return a - ~~(a / b) * b; }
function jalCal(jy) {
  const breaks = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
  let bl = breaks.length, gy = jy + 621, leapJ = -14, jp = breaks[0], jm, jump = 0, n, i;
  for (i = 1; i < bl; i += 1) {
    jm = breaks[i]; jump = jm - jp;
    if (jy < jm) break;
    leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }
  n = jy - jp;
  leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;
  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
  let leap = mod(mod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;
  return { leap, gy, march };
}
function j2d(jy, jm, jd) {
  const r = jalCal(jy);
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
}
function d2j(jdn) {
  const gy = d2g(jdn).gy;
  let jy = gy - 621;
  const r = jalCal(jy);
  const jdn1f = g2d(gy, 3, r.march);
  let jd, jm, k;
  k = jdn - jdn1f;
  if (k >= 0) {
    if (k <= 185) { jm = 1 + div(k, 31); jd = mod(k, 31) + 1; return { jy, jm, jd }; }
    k -= 186;
  } else {
    jy -= 1; k += 179;
    if (r.leap === 1) k += 1;
  }
  jm = 7 + div(k, 30); jd = mod(k, 30) + 1;
  return { jy, jm, jd };
}
function g2d(gy, gm, gd) {
  let d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) + div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408;
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
  return d;
}
function d2g(jdn) {
  let j = 4 * jdn + 139361631;
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const gd = div(mod(i, 153), 5) + 1;
  const gm = mod(div(i, 153), 12) + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy, gm, gd };
}
function toJalali(gy, gm, gd) { return d2j(g2d(gy, gm, gd)); }
function toGregorian(jy, jm, jd) { return d2g(j2d(jy, jm, jd)); }

const FA_MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

function faNum(v) {
  return String(v == null ? '' : v).replace(/[0-9]/g, d => FA_DIGITS[+d]);
}
function enNum(v) {
  return String(v == null ? '' : v).replace(/[۰-۹]/g, d => String(FA_DIGITS.indexOf(d))).replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

/** 'YYYY-MM-DD' میلادی → رشته شمسی خوانا */
function jDate(iso, { withWeekday = false } = {}) {
  if (!iso) return '—';
  const m = String(iso).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return String(iso);
  const j = toJalali(+m[1], +m[2], +m[3]);
  const s = `${faNum(j.jy)}/${faNum(String(j.jm).padStart(2, '0'))}/${faNum(String(j.jd).padStart(2, '0'))}`;
  if (!withWeekday) return s;
  const wd = new Date(+m[1], +m[2] - 1, +m[3]).getDay();
  const names = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'];
  return `${names[wd]} ${s}`;
}

/** 'YYYY-MM-DD' میلادی → 'YYYY/MM/DD' شمسی با ارقام لاتین (برای ورودی‌ها) */
function jDateEn(iso) {
  if (!iso) return '';
  const m = String(iso).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  const j = toJalali(+m[1], +m[2], +m[3]);
  return `${j.jy}/${String(j.jm).padStart(2, '0')}/${String(j.jd).padStart(2, '0')}`;
}

/** 'YYYY/MM/DD' شمسی → 'YYYY-MM-DD' میلادی */
function gDate(jStr) {
  if (!jStr) return null;
  const parts = enNum(String(jStr).trim()).split(/[\/\-]/).map(p => parseInt(p, 10));
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  let [jy, jm, jd] = parts;
  if (jy < 200) jy += 1400; // ورود سال دو رقمی
  if (jm < 1 || jm > 12 || jd < 1 || jd > 31) return null;
  const g = toGregorian(jy, jm, jd);
  return `${g.gy}-${String(g.gm).padStart(2, '0')}-${String(g.gd).padStart(2, '0')}`;
}

/** تاریخ امروز به وقت منطقه زمانی سامانه — 'YYYY-MM-DD' میلادی */
function todayIso(tzOffsetMinutes = 210) {
  const now = new Date(Date.now() + tzOffsetMinutes * 60000);
  return now.toISOString().slice(0, 10);
}
function nowTime(tzOffsetMinutes = 210) {
  const now = new Date(Date.now() + tzOffsetMinutes * 60000);
  return now.toISOString().slice(11, 16);
}
function nowDateTime(tzOffsetMinutes = 210) {
  const now = new Date(Date.now() + tzOffsetMinutes * 60000);
  return now.toISOString().slice(0, 16).replace('T', ' ');
}

/** ماه شمسی جاری و ماه‌های اخیر برای فیلترها */
function currentJMonth(tzOffset = 210) {
  const j = toJalali(...(todayIso(tzOffset).split('-').map(Number)));
  return { jy: j.jy, jm: j.jm, label: `${FA_MONTHS[j.jm - 1]} ${faNum(j.jy)}` };
}
function jMonthRange(jy, jm) {
  const g1 = toGregorian(jy, jm, 1);
  let jy2 = jy, jm2 = jm + 1;
  if (jm2 > 12) { jy2++; jm2 = 1; }
  const g2 = toGregorian(jy2, jm2, 1);
  const iso = d => `${d.gy}-${String(d.gm).padStart(2, '0')}-${String(d.gd).padStart(2, '0')}`;
  const end = new Date(new Date(iso(g2)).getTime() - 86400000);
  return { start: iso(g1), end: end.toISOString().slice(0, 10) };
}
function jMonthOfIso(iso) {
  const m = String(iso).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const j = toJalali(+m[1], +m[2], +m[3]);
  return { jy: j.jy, jm: j.jm };
}

// ---------- پول ----------
function money(v, currency = 'تومان') {
  if (v == null || v === '') return '—';
  const n = Number(v);
  if (isNaN(n)) return String(v);
  const s = n.toLocaleString('en-US').replace(/,/g, '٬');
  return `${faNum(s)} ${currency}`;
}
function moneyPlain(v) {
  const n = Number(v || 0);
  return faNum(n.toLocaleString('en-US').replace(/,/g, '٬'));
}

// ---------- CSV ----------
function toCsv(headers, rows) {
  const esc = c => {
    const s = String(c == null ? '' : c);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [headers.map(esc).join(',')];
  rows.forEach(r => lines.push(r.map(esc).join(',')));
  return '\ufeff' + lines.join('\r\n'); // BOM برای نمایش درست فارسی در Excel
}

// ---------- کمکی‌های متن ----------
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function nl2br(s) { return esc(s).replace(/\n/g, '<br>'); }

function daysBetween(a, b) {
  const d1 = new Date(a + 'T00:00:00Z'), d2 = new Date(b + 'T00:00:00Z');
  return Math.round((d2 - d1) / 86400000);
}
function addDaysIso(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/** شماره روز هفته با مبنای شنبه = 0 */
function isoWeekdaySat(iso) {
  const d = new Date(iso + 'T00:00:00Z').getUTCDay(); // 0=Sunday
  return (d + 1) % 7; // Saturday=0 ... Friday=6
}

const LABELS = {
  male: 'مرد', female: 'زن',
  single: 'مجرد', married: 'متأهل',
  full_time: 'تمام‌وقت', part_time: 'پاره‌وقت', contract: 'قراردادی', intern: 'کارآموز', project: 'پروژه‌ای',
  active: 'شاغل', suspended: 'تعلیق', terminated: 'خاتمه همکاری',
  pending: 'در انتظار تایید', approved: 'تایید شده', rejected: 'رد شده', cancelled: 'لغو شده',
  draft: 'پیش‌نویس', final: 'نهایی',
  open: 'باز', closed: 'بسته', answered: 'پاسخ داده شده',
  present: 'حاضر', absent: 'غایب', leave: 'مرخصی', mission: 'مأموریت', holiday: 'تعطیل',
  new: 'جدید', screening: 'بررسی رزومه', interview: 'مصاحبه', offer: 'پیشنهاد همکاری', hired: 'استخدام شده',
  enrolled: 'ثبت‌نام شده', completed: 'تکمیل شده', failed: 'ناتمام',
  available: 'آزاد', assigned: 'تحویل داده شده', retired: 'اسقاط',
  in_progress: 'در حال انجام', done: 'انجام شده', overdue: 'عقب‌افتاده',
  planned: 'برنامه‌ریزی شده', ongoing: 'در حال اجرا',
  low: 'کم', normal: 'متوسط', high: 'زیاد', urgent: 'فوری',
  onboarding: 'ورود (Onboarding)', offboarding: 'خروج (Offboarding)',
  it: 'فناوری اطلاعات', furniture: 'لوازم اداری', vehicle: 'خودرو', other: 'سایر',
  all: 'همه',
  travel: 'سفر', office: 'دفتر', transport: 'ایاب و ذهاب', welfare: 'رفاهی',
  support: 'پشتیبانی', it_ticket: 'فناوری اطلاعات', hr_ticket: 'منابع انسانی', admin_ticket: 'اداری',
  meeting: 'جلسه', event: 'رویداد', birthday: 'تولد',
 passed: 'قبول', 
};

function label(v) { return LABELS[v] || (v == null || v === '' ? '—' : v); }

module.exports = {
  toJalali, toGregorian, jDate, jDateEn, gDate, todayIso, nowTime, nowDateTime,
  currentJMonth, jMonthRange, jMonthOfIso, faNum, enNum, money, moneyPlain,
  toCsv, esc, nl2br, daysBetween, addDaysIso, isoWeekdaySat, label, FA_MONTHS
};
