/* تقویم شمسی (جلالی) — ویجت انتخاب تاریخ و ماه، بدون وابستگی خارجی */
(function () {
  'use strict';
  const FA_MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
  const DOW = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];

  // ---------- تبدیل تاریخ (الگوریتم jalaali) ----------
  function div(a, b) { return ~~(a / b); }
  function mod(a, b) { return a - ~~(a / b) * b; }
  function jalCal(jy) {
    const breaks = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
    let bl = breaks.length, gy = jy + 621, leapJ = -14, jp = breaks[0], jm, jump = 0, n, i;
    for (i = 1; i < bl; i++) { jm = breaks[i]; jump = jm - jp; if (jy < jm) break; leapJ += div(jump, 33) * 8 + div(mod(jump, 33), 4); jp = jm; }
    n = jy - jp;
    leapJ += div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
    if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
    const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
    const march = 20 + leapJ - leapG;
    if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
    let leap = mod(mod(n + 1, 33) - 1, 4);
    if (leap === -1) leap = 4;
    return { leap, gy, march };
  }
  function g2d(gy, gm, gd) {
    let d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) + div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408;
    return d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
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
  function j2d(jy, jm, jd) { const r = jalCal(jy); return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1; }
  function d2j(jdn) {
    const gy = d2g(jdn).gy;
    let jy = gy - 621;
    const r = jalCal(jy);
    const jdn1f = g2d(gy, 3, r.march);
    let k = jdn - jdn1f, jm, jd;
    if (k >= 0) {
      if (k <= 185) { jm = 1 + div(k, 31); jd = mod(k, 31) + 1; return { jy, jm, jd }; }
      k -= 186;
    } else { jy -= 1; k += 179; if (r.leap === 1) k += 1; }
    jm = 7 + div(k, 30); jd = mod(k, 30) + 1;
    return { jy, jm, jd };
  }
  const toJalali = (gy, gm, gd) => d2j(g2d(gy, gm, gd));
  const toGregorian = (jy, jm, jd) => d2g(j2d(jy, jm, jd));
  function monthLength(jy, jm) {
    const g1 = toGregorian(jy, jm, 1);
    let jy2 = jy, jm2 = jm + 1; if (jm2 > 12) { jy2++; jm2 = 1; }
    const g2 = toGregorian(jy2, jm2, 1);
    return Math.round((Date.UTC(g2.gy, g2.gm - 1, g2.gd) - Date.UTC(g1.gy, g1.gm - 1, g1.gd)) / 86400000);
  }
  function satBase(jy, jm) {
    const g = toGregorian(jy, jm, 1);
    const dow = new Date(Date.UTC(g.gy, g.gm - 1, g.gd)).getUTCDay(); // 0=یکشنبه
    return (dow + 1) % 7; // شنبه=0
  }

  let picker = null, currentInput = null, viewMode = 'days';

  function ensurePicker() {
    if (picker) return picker;
    picker = document.createElement('div');
    picker.className = 'jdp';
    document.body.appendChild(picker);
    document.addEventListener('click', function (e) {
      if (picker.classList.contains('show') && !picker.contains(e.target) && e.target !== currentInput && !(currentInput && currentInput.contains(e.target))) hide();
    });
    window.addEventListener('resize', hide);
    return picker;
  }
  function hide() { if (picker) picker.classList.remove('show'); currentInput = null; }
  function showAt(input) {
    const p = ensurePicker();
    const r = input.getBoundingClientRect();
    p.style.top = (window.scrollY + r.bottom + 6) + 'px';
    const left = Math.max(8, Math.min(window.scrollX + r.left, document.documentElement.clientWidth - 280));
    p.style.left = left + 'px';
    p.classList.add('show');
  }

  function parseVal(input) {
    const v = input.value.replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).trim();
    const m = v.match(/^(\d{4})[\/\-.](\d{1,2})(?:[\/\-.](\d{1,2}))?$/);
    if (!m) return null;
    const jy = +m[1], jm = +m[2], jd = m[3] ? +m[3] : null;
    if (jm < 1 || jm > 12) return null;
    if (jd && (jd < 1 || jd > 31)) return null;
    return { jy, jm, jd };
  }

  function renderDays(input) {
    const p = ensurePicker();
    const todayJ = toJalali(...(new Date().toISOString().slice(0, 10)).split('-').map(Number));
    let cur = parseVal(input);
    const jy = cur ? cur.jy : todayJ.jy, jm = cur ? cur.jm : todayJ.jm;
    const sel = cur && cur.jd ? { jy, jm, jd: cur.jd } : null;
    const len = monthLength(jy, jm);
    const firstDow = satBase(jy, jm);
    let html = `<div class="jdp-head">
      <button type="button" data-nav="-1"><i class="bi bi-chevron-right"></i></button>
      <span class="jdp-title" data-mode="months">${FA_MONTHS[jm - 1]} ${jy}</span>
      <button type="button" data-nav="1"><i class="bi bi-chevron-left"></i></button></div>
      <div class="jdp-grid">` + DOW.map(d => `<span class="dow">${d}</span>`).join('');
    for (let i = 0; i < firstDow; i++) html += '<button type="button" class="jdp-day empty" tabindex="-1"></button>';
    for (let d = 1; d <= len; d++) {
      const isToday = todayJ.jy === jy && todayJ.jm === jm && todayJ.jd === d;
      const isSel = sel && sel.jd === d;
      html += `<button type="button" class="jdp-day${isToday ? ' today' : ''}${isSel ? ' selected' : ''}" data-day="${d}">${d}</button>`;
    }
    html += `</div><div class="jdp-foot"><button type="button" data-today>امروز</button><button type="button" data-clear>پاک کردن</button></div>`;
    p.innerHTML = html;
    bind(input, jy, jm);
  }

  function renderMonths(input) {
    const p = ensurePicker();
    const cur = parseVal(input);
    const jy = cur ? cur.jy : toJalali(...(new Date().toISOString().slice(0, 10)).split('-').map(Number)).jy;
    let html = `<div class="jdp-head"><span></span><span class="jdp-title" data-mode="years">سال ${jy}</span><span></span></div><div class="jdp-months">`;
    FA_MONTHS.forEach((m, i) => {
      const isSel = cur && cur.jm === i + 1;
      html += `<button type="button" data-month="${i + 1}" class="${isSel ? 'selected' : ''}" style="${isSel ? 'background:#4f46e5;color:#fff' : ''}">${m}</button>`;
    });
    html += '</div>';
    p.innerHTML = html;
    p.querySelectorAll('[data-month]').forEach(b => b.addEventListener('click', function () {
      const jm = +this.dataset.month;
      const c = parseVal(input);
      const njy = c ? c.jy : jy;
      if (c && c.jd) { input.value = `${njy}/${String(jm).padStart(2, '0')}/${String(c.jd).padStart(2, '0')}`; renderDays(input); }
      else { input.value = `${njy}/${String(jm).padStart(2, '0')}`; hide(); input.dispatchEvent(new Event('change')); }
    }));
    p.querySelector('.jdp-title').addEventListener('click', () => renderYears(input, jy));
  }

  function renderYears(input, base) {
    const p = ensurePicker();
    const nowJ = toJalali(...(new Date().toISOString().slice(0, 10)).split('-').map(Number));
    const start = nowJ.jy - 10;
    let html = `<div class="jdp-head"><span></span><span class="jdp-title">انتخاب سال</span><span></span></div><div class="jdp-years">`;
    for (let y = start; y <= nowJ.jy + 10; y++) html += `<button type="button" data-year="${y}" class="${base === y ? 'selected' : ''}" style="${base === y ? 'background:#4f46e5;color:#fff' : ''}">${y}</button>`;
    html += '</div>';
    p.innerHTML = html;
    p.querySelectorAll('[data-year]').forEach(b => b.addEventListener('click', function () {
      const y = +this.dataset.year;
      const c = parseVal(input);
      if (c) { input.value = `${y}/${String(c.jm).padStart(2, '0')}${c.jd ? '/' + String(c.jd).padStart(2, '0') : ''}`; renderMonths(input); }
      else { input.value = String(y); hide(); }
    }));
  }

  function bind(input, jy, jm) {
    const p = ensurePicker();
    p.querySelectorAll('[data-nav]').forEach(b => b.addEventListener('click', function () {
      let ny = jy, nm = jm + (+this.dataset.nav);
      if (nm > 12) { nm = 1; ny++; } if (nm < 1) { nm = 12; ny--; }
      const c = parseVal(input);
      input.dataset._nav = `${ny}/${nm}`;
      const fake = { ...c };
      if (c && c.jd) input.value = `${ny}/${String(nm).padStart(2, '0')}/${String(Math.min(c.jd, monthLength(ny, nm))).padStart(2, '0')}`;
      renderDays(input);
    }));
    p.querySelectorAll('.jdp-day[data-day]').forEach(b => b.addEventListener('click', function () {
      const d = +this.dataset.day;
      const c = parseVal(input);
      const y = c ? c.jy : jy, m = c ? c.jm : jm;
      input.value = `${y}/${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}`;
      input.dispatchEvent(new Event('change'));
      hide();
    }));
    const tb = p.querySelector('[data-today]');
    if (tb) tb.addEventListener('click', function () {
      const t = toJalali(...(new Date().toISOString().slice(0, 10)).split('-').map(Number));
      input.value = `${t.jy}/${String(t.jm).padStart(2, '0')}/${String(t.jd).padStart(2, '0')}`;
      input.dispatchEvent(new Event('change'));
      hide();
    });
    const cl = p.querySelector('[data-clear]');
    if (cl) cl.addEventListener('click', function () { input.value = ''; hide(); });
    const title = p.querySelector('.jdp-title');
    if (title && title.dataset.mode === 'months') title.addEventListener('click', () => renderMonths(input));
  }

  function attach(input) {
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('dir', 'ltr');
    input.style.textAlign = 'center';
    input.addEventListener('focus', function () { currentInput = input; renderDays(input); showAt(input); });
    input.addEventListener('click', function () { currentInput = input; renderDays(input); showAt(input); });
    input.addEventListener('input', function () {
      const v = input.value.replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
      input.value = v;
    });
  }

  function init() {
    document.querySelectorAll('input.jdate:not([data-jd])').forEach(inp => { inp.dataset.jd = '1'; attach(inp); });
    document.querySelectorAll('input.jmonth:not([data-jm])').forEach(inp => {
      inp.dataset.jm = '1';
      inp.setAttribute('autocomplete', 'off');
      inp.setAttribute('dir', 'ltr');
      inp.style.textAlign = 'center';
      inp.addEventListener('focus', function () { currentInput = inp; renderMonths(inp); showAt(inp); });
      inp.addEventListener('click', function () { currentInput = inp; renderMonths(inp); showAt(inp); });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  window.jdateInit = init;

  // بستن با ESC
  document.addEventListener('keydown', e => { if (e.key === 'Escape') hide(); });
})();
