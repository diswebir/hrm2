/* HRM Pro — جاوااسکریپت عمومی */
(function () {
  'use strict';

  // ---------- تم روشن/تاریک ----------
  const themeBtn = document.getElementById('themeToggle');
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem('hrm-theme', t); } catch (e) {}
    if (themeBtn) themeBtn.innerHTML = t === 'dark' ? '<i class="bi bi-sun"></i>' : '<i class="bi bi-moon-stars"></i>';
  }
  let saved = 'light';
  try { saved = localStorage.getItem('hrm-theme') || 'light'; } catch (e) {}
  applyTheme(saved);
  if (themeBtn) themeBtn.addEventListener('click', () => {
    applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  });

  // ---------- منوی موبایل ----------
  const burger = document.getElementById('sidebarToggle');
  if (burger) {
    burger.addEventListener('click', function () {
      const sb = document.querySelector('.sidebar');
      sb.classList.toggle('open');
      if (sb.classList.contains('open')) {
        const bd = document.createElement('div');
        bd.className = 'sb-backdrop';
        bd.addEventListener('click', () => { sb.classList.remove('open'); bd.remove(); });
        document.body.appendChild(bd);
      } else {
        const bd = document.querySelector('.sb-backdrop'); if (bd) bd.remove();
      }
    });
  }

  // ---------- تایید حذف ----------
  document.addEventListener('submit', function (e) {
    const f = e.target;
    if (f.matches('form[data-confirm]')) {
      if (!window.confirm(f.getAttribute('data-confirm') || 'مطمئن هستید؟')) { e.preventDefault(); }
    }
  });

  // ---------- مخفی شدن خودکار پیام‌ها ----------
  document.querySelectorAll('.auto-hide').forEach(el => setTimeout(() => {
    el.style.transition = 'opacity .6s'; el.style.opacity = '0';
    setTimeout(() => el.remove(), 700);
  }, 5000));

  // ---------- میانبر جستجو (/) ----------
  const gSearch = document.getElementById('globalSearch');
  document.addEventListener('keydown', function (e) {
    if (e.key === '/' && gSearch && document.activeElement !== gSearch && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) {
      e.preventDefault(); gSearch.focus();
    }
  });

  // ---------- جدول‌ها: مرتب‌سازی ساده با کلیک روی سرستون ----------
  document.querySelectorAll('table[data-sortable]').forEach(function (table) {
    const ths = table.querySelectorAll('thead th');
    ths.forEach(function (th, i) {
      th.style.cursor = 'pointer';
      th.title = 'برای مرتب‌سازی کلیک کنید';
      th.addEventListener('click', function () {
        const tbody = table.querySelector('tbody');
        const rows = Array.from(tbody.querySelectorAll('tr'));
        const dir = th.dataset.dir === 'asc' ? -1 : 1;
        ths.forEach(t => { t.dataset.dir = ''; });
        th.dataset.dir = dir === 1 ? 'asc' : 'desc';
        rows.sort(function (a, b) {
          const av = a.cells[i] ? a.cells[i].textContent.trim() : '';
          const bv = b.cells[i] ? b.cells[i].textContent.trim() : '';
          const an = parseFloat(av.replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))), bn = parseFloat(bv.replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
          if (!isNaN(an) && !isNaN(bn) && av.match(/^[\d,۰-۹٪.\s]+$/)) return (an - bn) * dir;
          return av.localeCompare(bv, 'fa') * dir;
        });
        rows.forEach(r => tbody.appendChild(r));
      });
    });
  });

  // ---------- پیش‌نمایش انتخاب فایل ----------
  document.querySelectorAll('input[type=file]').forEach(function (inp) {
    inp.addEventListener('change', function () {
      const lbl = inp.closest('.form-group, .mb-3, div');
      if (lbl) {
        const small = lbl.querySelector('.file-name');
        if (small) small.textContent = inp.files[0] ? inp.files[0].name : '';
      }
    });
  });
})();
