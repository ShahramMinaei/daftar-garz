/* رابط کاربری: مسیریابی ساده با hash و رسم صفحه‌ها. */
(function (global) {
  'use strict';

  var J = global.Jalali;
  var Store = global.Store;
  var app;
  var searchTerm = '';
  var openSettlements = {}; // شناسه‌ی تسویه‌هایی که باز شده‌اند

  /* ================= ابزارهای کمکی ================= */

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function useFaDigits() { return Store.get().settings.digits !== 'en'; }

  function num(n) {
    var s = String(n);
    return useFaDigits() ? J.toFaDigits(s) : s;
  }

  function money(n) {
    return num(J.groupThousands(n)) + ' تومان';
  }

  function moneyHtml(n) {
    return num(J.groupThousands(n)) + ' <span class="unit">تومان</span>';
  }

  function dateLong(key) {
    var j = J.fromKey(key);
    return J.weekdayName(j) + ' ' + num(j.jd) + ' ' + J.MONTHS[j.jm - 1] + ' ' + num(j.jy);
  }

  function dateShort(key) {
    var j = J.fromKey(key);
    return num(j.jd) + ' ' + J.MONTHS[j.jm - 1] + ' ' + num(j.jy);
  }

  function parseInt10(v) {
    var n = parseInt(J.toLatinDigits(String(v || '')).replace(/[^\d-]/g, ''), 10);
    return isNaN(n) ? 0 : n;
  }

  /* یکسان‌سازی نویسه‌های عربی/فارسی و ارقام، برای این‌که جستجو حساس نباشد */
  function normalize(s) {
    return J.toLatinDigits(String(s || ''))
      .replace(/[يیۍ]/g, 'ی')
      .replace(/[كک]/g, 'ک')
      .replace(/[أإآا]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/[‌‏‎]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function digitsOnly(s) { return J.toLatinDigits(String(s || '')).replace(/\D/g, ''); }

  /* ================= پیام کوتاه ================= */

  function toast(message, kind) {
    var host = document.getElementById('toast-host');
    host.innerHTML = ''; // همیشه فقط یک پیام؛ روی هم انباشته نشوند
    var el = document.createElement('div');
    el.className = 'toast' + (kind ? ' ' + kind : '');
    el.textContent = message;
    host.appendChild(el);
    setTimeout(function () {
      el.style.transition = 'opacity .3s';
      el.style.opacity = '0';
      setTimeout(function () { el.remove(); }, 320);
    }, kind === 'err' ? 5200 : 2800);
  }

  /* ================= گفت‌وگوها ================= */

  function openOverlay(innerHtml) {
    var overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.innerHTML = '<div class="dialog">' + innerHtml + '</div>';
    document.body.appendChild(overlay);
    return overlay;
  }

  function confirmDialog(opts) {
    return new Promise(function (resolve) {
      var overlay = openOverlay(
        '<h2>' + esc(opts.title) + '</h2>' +
        '<p>' + (opts.html || esc(opts.message || '')) + '</p>' +
        '<div class="btn-row">' +
        '<button class="btn btn-ghost" data-act="no">' + esc(opts.cancelText || 'انصراف') + '</button>' +
        '<button class="btn ' + (opts.danger ? 'btn-danger' : 'btn-primary') + '" data-act="yes">' +
        esc(opts.confirmText || 'بله، مطمئنم') + '</button>' +
        '</div>'
      );
      overlay.addEventListener('click', function (e) {
        var act = e.target.closest('[data-act]');
        if (act) {
          overlay.remove();
          resolve(act.dataset.act === 'yes');
        } else if (e.target === overlay) {
          overlay.remove();
          resolve(false);
        }
      });
    });
  }

  /* گفت‌وگوی افزودن/ویرایش قلم منو */
  function menuItemDialog(item) {
    return new Promise(function (resolve) {
      var isEdit = !!item;
      var overlay = openOverlay(
        '<h2>' + (isEdit ? 'ویرایش قلم' : 'افزودن قلم جدید') + '</h2>' +
        '<div class="field"><label for="mi-name">نام قلم</label>' +
        '<input class="input" id="mi-name" type="text" value="' + esc(isEdit ? item.name : '') + '" placeholder="مثلاً: عدسی"></div>' +
        '<div class="field"><label for="mi-price">قیمت (تومان)</label>' +
        '<input class="input ltr-num" id="mi-price" type="text" inputmode="numeric" value="' +
        (isEdit ? J.groupThousands(item.price) : '') + '" placeholder="مثلاً: 150000"></div>' +
        '<div class="btn-row">' +
        '<button class="btn btn-ghost" data-act="no">انصراف</button>' +
        '<button class="btn btn-primary" data-act="yes">ذخیره</button>' +
        '</div>'
      );
      var nameEl = overlay.querySelector('#mi-name');
      var priceEl = overlay.querySelector('#mi-price');

      priceEl.addEventListener('input', function () {
        var v = parseInt10(priceEl.value);
        priceEl.value = v ? J.groupThousands(v) : '';
      });

      overlay.addEventListener('click', function (e) {
        var act = e.target.closest('[data-act]');
        if (!act) {
          if (e.target === overlay) { overlay.remove(); resolve(null); }
          return;
        }
        if (act.dataset.act === 'no') { overlay.remove(); resolve(null); return; }
        var name = nameEl.value.trim();
        var price = parseInt10(priceEl.value);
        if (!name) { toast('نام قلم را بنویسید.', 'err'); nameEl.focus(); return; }
        if (price <= 0) { toast('قیمت را بنویسید.', 'err'); priceEl.focus(); return; }
        overlay.remove();
        resolve({ name: name, price: price });
      });
      setTimeout(function () { nameEl.focus(); }, 60);
    });
  }

  /* انتخابگر تاریخ شمسی */
  function pickDate(currentKey) {
    return new Promise(function (resolve) {
      var sel = J.fromKey(currentKey);
      var view = { jy: sel.jy, jm: sel.jm };
      var todayKey = J.toKey(J.today());

      var overlay = openOverlay('<div id="cal-root"></div>' +
        '<div class="btn-row" style="margin-top:14px">' +
        '<button class="btn btn-ghost" data-act="close">انصراف</button>' +
        '<button class="btn btn-secondary" data-act="today">امروز</button>' +
        '</div>');
      var root = overlay.querySelector('#cal-root');

      function draw() {
        var len = J.monthLength(view.jy, view.jm);
        var first = J.firstWeekdayOfMonth(view.jy, view.jm);
        var cells = '';
        J.WEEK_HEADERS.forEach(function (w) { cells += '<div class="wd">' + w + '</div>'; });
        for (var i = 0; i < first; i++) cells += '<div class="cal-day blank"></div>';
        for (var d = 1; d <= len; d++) {
          var key = J.toKey({ jy: view.jy, jm: view.jm, jd: d });
          var cls = 'cal-day';
          if (key === todayKey) cls += ' today';
          if (key === J.toKey(sel)) cls += ' selected';
          cells += '<button type="button" class="' + cls + '" data-day="' + key + '">' + num(d) + '</button>';
        }
        root.innerHTML =
          '<div class="cal-head">' +
          '<button type="button" class="cal-nav" data-nav="-1" aria-label="ماه قبل">›</button>' +
          '<div class="title">' + J.MONTHS[view.jm - 1] + ' ' + num(view.jy) + '</div>' +
          '<button type="button" class="cal-nav" data-nav="1" aria-label="ماه بعد">‹</button>' +
          '</div><div class="cal-grid">' + cells + '</div>';
      }
      draw();

      overlay.addEventListener('click', function (e) {
        var nav = e.target.closest('[data-nav]');
        if (nav) {
          var step = +nav.dataset.nav;
          view.jm += step;
          if (view.jm > 12) { view.jm = 1; view.jy++; }
          if (view.jm < 1) { view.jm = 12; view.jy--; }
          draw();
          return;
        }
        var day = e.target.closest('[data-day]');
        if (day) { overlay.remove(); resolve(day.dataset.day); return; }
        var act = e.target.closest('[data-act]');
        if (act) {
          overlay.remove();
          resolve(act.dataset.act === 'today' ? todayKey : null);
          return;
        }
        if (e.target === overlay) { overlay.remove(); resolve(null); }
      });
    });
  }

  /* ================= مسیریابی ================= */

  function go(hash) { location.hash = hash; }

  function currentRoute() {
    var raw = location.hash.replace(/^#/, '');
    if (!raw || raw === '/') return { name: 'home' };
    var p = raw.split('/').filter(Boolean);
    if (p[0] === 'employer' && p[1] === 'new') return { name: 'employer-form' };
    if (p[0] === 'employer' && p[2] === 'edit') return { name: 'employer-form', id: p[1] };
    if (p[0] === 'employer' && p[1]) return { name: 'employer', id: p[1] };
    if (p[0] === 'order' && p[1] === 'new' && p[2]) return { name: 'order-form', employerId: p[2] };
    if (p[0] === 'order' && p[1] === 'edit' && p[2]) return { name: 'order-form', orderId: p[2] };
    if (p[0] === 'settings') return { name: 'settings' };
    return { name: 'home' };
  }

  function render() {
    var route = currentRoute();
    var screens = {
      'home': screenHome,
      'employer-form': screenEmployerForm,
      'employer': screenEmployer,
      'order-form': screenOrderForm,
      'settings': screenSettings
    };
    var fn = screens[route.name] || screenHome;
    app.innerHTML = '';
    fn(route);
  }

  function topbar(opts) {
    var right = opts.back
      ? '<button class="topbar-btn" data-back="' + esc(opts.back) + '" aria-label="بازگشت">' +
        '<span aria-hidden="true">›</span><span>بازگشت</span></button>'
      : '<div class="topbar-spacer"></div>';
    var left = opts.action || '<div class="topbar-spacer"></div>';
    return '<header class="topbar">' + right + '<h1>' + esc(opts.title) + '</h1>' + left + '</header>';
  }

  function mount(html) {
    var wrap = document.createElement('div');
    wrap.className = 'screen';
    wrap.innerHTML = html;
    app.appendChild(wrap);
    wrap.addEventListener('click', function (e) {
      var back = e.target.closest('[data-back]');
      if (back) go(back.dataset.back);
    });
    global.scrollTo(0, 0);
    return wrap;
  }

  /* ================= صفحه‌ی اصلی ================= */

  function matchesSearch(employer, term) {
    if (!term) return true;
    var t = normalize(term);
    var tDigits = digitsOnly(term);
    if (normalize(employer.name).indexOf(t) >= 0) return true;
    if (employer.foremanName && normalize(employer.foremanName).indexOf(t) >= 0) return true;
    if (tDigits) {
      var phones = (employer.phones || []).concat(employer.foremanPhone ? [employer.foremanPhone] : []);
      for (var i = 0; i < phones.length; i++) {
        if (digitsOnly(phones[i]).indexOf(tDigits) >= 0) return true;
      }
    }
    return false;
  }

  function screenHome() {
    var state = Store.get();
    var total = Store.totalReceivables();

    var html = topbar({
      title: 'دفتر قرض',
      action: '<button class="topbar-btn" data-nav-settings="1" aria-label="تنظیمات">' +
        '<span aria-hidden="true">⚙</span><span>تنظیمات</span></button>'
    });

    html += '<div class="content has-dock">' +
      '<div class="summary">' +
      '<div class="label">مجموع کل مطالبات</div>' +
      '<div class="value">' + moneyHtml(total) + '</div>' +
      '</div>' +
      '<div class="search-wrap">' +
      '<span class="search-icon" aria-hidden="true">⌕</span>' +
      '<input class="input" id="search" type="search" placeholder="جستجوی نام، استادکار یا شماره تلفن" ' +
      'value="' + esc(searchTerm) + '" autocomplete="off">' +
      '</div>' +
      '<div id="employer-list"></div>' +
      '</div>';

    html += '<div class="dock">' +
      '<button class="btn btn-primary" data-add-employer="1">' +
      '<span aria-hidden="true">＋</span><span>افزودن صاحب‌کار جدید</span></button></div>';

    var wrap = mount(html);
    var listEl = wrap.querySelector('#employer-list');

    function drawList() {
      var employers = state.employers
        .filter(function (e) { return matchesSearch(e, searchTerm); })
        .sort(function (a, b) { return a.name.localeCompare(b.name, 'fa'); });

      if (!employers.length) {
        listEl.innerHTML = '<div class="empty">' +
          (state.employers.length
            ? '<span class="big-emoji" aria-hidden="true">⌕</span>صاحب‌کاری با این مشخصات پیدا نشد.'
            : '<span class="big-emoji" aria-hidden="true">📓</span>هنوز هیچ صاحب‌کاری ثبت نشده است.<br>' +
              'با دکمه‌ی پایین صفحه اولین نفر را اضافه کنید.') +
          '</div>';
        return;
      }

      listEl.innerHTML = '<div class="list">' + employers.map(function (e) {
        var bal = Store.openBalanceOf(e.id);
        var sub = [];
        if (e.foremanName) sub.push('استادکار: ' + e.foremanName);
        else if ((e.phones || [])[0]) sub.push(e.phones[0]);
        return '<a class="row-card" href="#/employer/' + esc(e.id) + '">' +
          '<div class="main">' +
          '<div class="name">' + esc(e.name) + '</div>' +
          (sub.length ? '<div class="sub">' + esc(sub.join(' • ')) + '</div>' : '') +
          '</div>' +
          '<span class="amount-badge ' + (bal > 0 ? 'debt' : 'zero') + '">' +
          (bal > 0 ? moneyHtml(bal) : 'تسویه') + '</span>' +
          '<span class="chev" aria-hidden="true">‹</span>' +
          '</a>';
      }).join('') + '</div>';
    }
    drawList();

    var searchEl = wrap.querySelector('#search');
    searchEl.addEventListener('input', function () {
      searchTerm = searchEl.value;
      drawList();
    });

    wrap.addEventListener('click', function (e) {
      if (e.target.closest('[data-nav-settings]')) go('#/settings');
      if (e.target.closest('[data-add-employer]')) go('#/employer/new');
    });
  }

  /* ================= فرم صاحب‌کار ================= */

  function screenEmployerForm(route) {
    var editing = route.id ? Store.employerById(route.id) : null;
    if (route.id && !editing) { go('#/'); return; }

    var phones = editing && editing.phones.length ? editing.phones.slice() : [''];

    var html = topbar({
      title: editing ? 'ویرایش صاحب‌کار' : 'صاحب‌کار جدید',
      back: editing ? '#/employer/' + editing.id : '#/'
    });

    html += '<div class="content has-dock"><div class="card">' +
      '<div class="field"><label for="f-name">نام صاحب‌کار <span class="muted small">(الزامی)</span></label>' +
      '<input class="input" id="f-name" type="text" value="' + esc(editing ? editing.name : '') + '" placeholder="مثلاً: حاج رضا تعمیرگاه"></div>' +

      '<div class="field"><label>شماره‌های تلفن</label><div id="phones"></div>' +
      '<button class="btn btn-ghost btn-sm" id="add-phone" type="button">' +
      '<span aria-hidden="true">＋</span><span>افزودن شماره‌ی دیگر</span></button></div>' +

      '<div class="field"><label for="f-foreman">نام استادکار <span class="muted small">(اختیاری)</span></label>' +
      '<input class="input" id="f-foreman" type="text" value="' + esc(editing ? editing.foremanName : '') + '"></div>' +

      '<div class="field"><label for="f-foreman-phone">شماره استادکار <span class="muted small">(اختیاری)</span></label>' +
      '<input class="input ltr-num" id="f-foreman-phone" type="tel" inputmode="tel" value="' +
      esc(editing ? editing.foremanPhone : '') + '"></div>' +

      '<div class="field" style="margin-bottom:0"><label for="f-notes">توضیحات <span class="muted small">(اختیاری)</span></label>' +
      '<textarea class="input" id="f-notes" placeholder="هر نکته‌ای که لازم است یادتان بماند">' +
      esc(editing ? editing.notes : '') + '</textarea></div>' +
      '</div>';

    if (editing) {
      html += '<button class="btn btn-danger" id="delete-employer" type="button">' +
        '<span aria-hidden="true">🗑</span><span>حذف این صاحب‌کار</span></button>';
    }
    html += '</div>';

    html += '<div class="dock"><button class="btn btn-primary" id="save">' +
      '<span aria-hidden="true">✓</span><span>ذخیره</span></button></div>';

    var wrap = mount(html);
    var phonesEl = wrap.querySelector('#phones');

    function drawPhones() {
      phonesEl.innerHTML = phones.map(function (p, i) {
        return '<div class="phone-row">' +
          '<input class="input ltr-num" type="tel" inputmode="tel" data-phone="' + i + '" ' +
          'value="' + esc(p) + '" placeholder="مثلاً: 09121234567">' +
          (phones.length > 1
            ? '<button class="btn btn-danger btn-sm" type="button" data-remove-phone="' + i + '">' +
              '<span aria-hidden="true">🗑</span><span>حذف</span></button>'
            : '') +
          '</div>';
      }).join('');
    }
    drawPhones();

    phonesEl.addEventListener('input', function (e) {
      var input = e.target.closest('[data-phone]');
      if (input) phones[+input.dataset.phone] = input.value;
    });

    phonesEl.addEventListener('click', function (e) {
      var rm = e.target.closest('[data-remove-phone]');
      if (rm) {
        phones.splice(+rm.dataset.removePhone, 1);
        if (!phones.length) phones = [''];
        drawPhones();
      }
    });

    wrap.querySelector('#add-phone').addEventListener('click', function () {
      phones.push('');
      drawPhones();
      var inputs = phonesEl.querySelectorAll('[data-phone]');
      inputs[inputs.length - 1].focus();
    });

    wrap.querySelector('#save').addEventListener('click', function () {
      var name = wrap.querySelector('#f-name').value.trim();
      if (!name) {
        toast('نام صاحب‌کار را بنویسید.', 'err');
        wrap.querySelector('#f-name').focus();
        return;
      }
      var data = {
        id: editing ? editing.id : undefined,
        name: name,
        phones: phones.map(function (p) { return p.trim(); }).filter(Boolean),
        foremanName: wrap.querySelector('#f-foreman').value.trim(),
        foremanPhone: wrap.querySelector('#f-foreman-phone').value.trim(),
        notes: wrap.querySelector('#f-notes').value.trim()
      };
      var id = Store.saveEmployer(data);
      toast(editing ? 'تغییرات ذخیره شد.' : 'صاحب‌کار اضافه شد.', 'ok');
      go('#/employer/' + id);
    });

    var delBtn = wrap.querySelector('#delete-employer');
    if (delBtn) {
      delBtn.addEventListener('click', function () {
        confirmDialog({
          title: 'حذف صاحب‌کار',
          html: 'با حذف <b>' + esc(editing.name) + '</b>، همه‌ی سفارش‌ها و تسویه‌های او هم پاک می‌شوند.<br>' +
            'این کار برگشت‌پذیر نیست. آیا مطمئنید؟',
          confirmText: 'بله، حذف کن',
          danger: true
        }).then(function (yes) {
          if (!yes) return;
          Store.deleteEmployer(editing.id);
          toast('صاحب‌کار حذف شد.', 'ok');
          go('#/');
        });
      });
    }
  }

  /* ================= جزئیات صاحب‌کار ================= */

  function orderItemsText(order) {
    if (!order.lines.length) return '—';
    return order.lines.map(function (l) {
      return esc(l.name) + ' × ' + num(l.qty);
    }).join(' + ');
  }

  function screenEmployer(route) {
    var employer = Store.employerById(route.id);
    if (!employer) { go('#/'); return; }

    var openOrders = Store.openOrdersOf(employer.id);
    var balance = Store.openBalanceOf(employer.id);
    var settlements = Store.settlementsOf(employer.id);

    var html = topbar({
      title: employer.name,
      back: '#/',
      action: '<button class="topbar-btn" data-edit="1" aria-label="ویرایش صاحب‌کار">' +
        '<span aria-hidden="true">✎</span><span>ویرایش</span></button>'
    });

    html += '<div class="content has-dock">';

    /* اطلاعات */
    var info = '';
    if (employer.phones.length) {
      info += '<div class="info-line"><span class="key">تلفن</span><span class="val">' +
        employer.phones.map(function (p) {
          return '<a class="tel" href="tel:' + esc(digitsOnly(p)) + '">' + esc(num(p)) + '</a>';
        }).join('، ') + '</span></div>';
    }
    if (employer.foremanName) {
      info += '<div class="info-line"><span class="key">استادکار</span><span class="val">' + esc(employer.foremanName) + '</span></div>';
    }
    if (employer.foremanPhone) {
      info += '<div class="info-line"><span class="key">تلفن استادکار</span><span class="val">' +
        '<a class="tel" href="tel:' + esc(digitsOnly(employer.foremanPhone)) + '">' + esc(num(employer.foremanPhone)) + '</a></span></div>';
    }
    if (employer.notes) {
      info += '<div class="info-line"><span class="key">توضیحات</span><span class="val">' + esc(employer.notes) + '</span></div>';
    }
    if (info) html += '<div class="card info-card">' + info + '</div>';

    /* مانده */
    html += '<div class="balance-box ' + (balance > 0 ? 'debt' : 'zero') + '">' +
      '<div class="label">' + (balance > 0 ? 'مانده‌ی حساب باز' : 'حساب این صاحب‌کار تسویه است') + '</div>' +
      (balance > 0 ? '<div class="value">' + moneyHtml(balance) + '</div>' : '') +
      '</div>';

    if (balance > 0) {
      html += '<button class="btn btn-ok" id="settle" style="margin-bottom:12px">' +
        '<span aria-hidden="true">✓</span><span>تسویه حساب</span></button>';
    }

    /* سفارش‌های باز */
    html += '<div class="section-title">سفارش‌های تسویه‌نشده' +
      (openOrders.length ? ' (' + num(openOrders.length) + ' روز)' : '') + '</div>';

    if (!openOrders.length) {
      html += '<div class="empty"><span class="big-emoji" aria-hidden="true">☕</span>سفارش بازی ثبت نشده است.</div>';
    } else {
      html += openOrders.map(function (o) {
        return '<div class="order-card">' +
          '<div class="order-head">' +
          '<span class="date">' + esc(dateShort(o.dateKey)) + '</span>' +
          '<span class="total">' + moneyHtml(o.total) + '</span>' +
          '</div>' +
          '<div class="order-items">' + orderItemsText(o) +
          (o.people ? ' <span class="muted">— ' + num(o.people) + ' نفر</span>' : '') + '</div>' +
          '<div class="order-actions">' +
          '<button class="btn btn-secondary btn-sm" data-edit-order="' + esc(o.id) + '">' +
          '<span aria-hidden="true">✎</span><span>ویرایش</span></button>' +
          '<button class="btn btn-danger btn-sm" data-delete-order="' + esc(o.id) + '">' +
          '<span aria-hidden="true">🗑</span><span>حذف</span></button>' +
          '</div></div>';
      }).join('');
    }

    /* تاریخچه‌ی تسویه‌ها */
    html += '<div class="section-title">تاریخچه‌ی تسویه‌ها</div>';
    if (!settlements.length) {
      html += '<div class="empty small">تا حالا تسویه‌ای انجام نشده است.</div>';
    } else {
      html += settlements.map(function (s) {
        var isOpen = !!openSettlements[s.id];
        var body = '';
        if (isOpen) {
          var orders = Store.ordersOfSettlement(s.id);
          body = '<div class="settle-body">' + orders.map(function (o) {
            return '<div class="line">' +
              '<span class="d">' + esc(dateShort(o.dateKey)) + '</span>' +
              '<span class="i">' + orderItemsText(o) + '</span>' +
              '<span class="t">' + esc(money(o.total)) + '</span>' +
              '</div>';
          }).join('') +
            '<button class="btn btn-ghost btn-sm" style="width:100%;margin-top:10px" data-undo-settlement="' + esc(s.id) + '">' +
            '<span aria-hidden="true">↺</span><span>برگرداندن این تسویه</span></button>' +
            '</div>';
        }
        return '<div class="settle-card">' +
          '<button class="settle-head" data-toggle-settlement="' + esc(s.id) + '">' +
          '<span aria-hidden="true">' + (isOpen ? '▾' : '▸') + '</span>' +
          '<span class="date">' + esc(dateShort(s.dateKey)) + '</span>' +
          '<span class="total">' + moneyHtml(s.total) + '</span>' +
          '</button>' + body + '</div>';
      }).join('');
    }

    html += '</div>';

    html += '<div class="dock"><button class="btn btn-primary" id="new-order">' +
      '<span aria-hidden="true">＋</span><span>ثبت سفارش امروز</span></button></div>';

    var wrap = mount(html);

    wrap.addEventListener('click', function (e) {
      if (e.target.closest('[data-edit]')) { go('#/employer/' + employer.id + '/edit'); return; }
      if (e.target.closest('#new-order')) { go('#/order/new/' + employer.id); return; }

      var editOrder = e.target.closest('[data-edit-order]');
      if (editOrder) { go('#/order/edit/' + editOrder.dataset.editOrder); return; }

      var delOrder = e.target.closest('[data-delete-order]');
      if (delOrder) {
        var order = Store.orderById(delOrder.dataset.deleteOrder);
        confirmDialog({
          title: 'حذف سفارش',
          html: 'سفارش <b>' + esc(dateShort(order.dateKey)) + '</b> به مبلغ ' +
            '<span class="emph">' + esc(money(order.total)) + '</span> حذف شود؟',
          confirmText: 'بله، حذف کن',
          danger: true
        }).then(function (yes) {
          if (!yes) return;
          Store.deleteOrder(order.id);
          toast('سفارش حذف شد.', 'ok');
          render();
        });
        return;
      }

      var toggle = e.target.closest('[data-toggle-settlement]');
      if (toggle) {
        var sid = toggle.dataset.toggleSettlement;
        openSettlements[sid] = !openSettlements[sid];
        render();
        return;
      }

      var undo = e.target.closest('[data-undo-settlement]');
      if (undo) {
        confirmDialog({
          title: 'برگرداندن تسویه',
          message: 'سفارش‌های این تسویه دوباره به حساب باز برمی‌گردند. آیا مطمئنید؟',
          confirmText: 'بله، برگردان',
          danger: true
        }).then(function (yes) {
          if (!yes) return;
          Store.undoSettlement(undo.dataset.undoSettlement);
          toast('تسویه برگردانده شد.', 'ok');
          render();
        });
        return;
      }

      if (e.target.closest('#settle')) {
        confirmDialog({
          title: 'تسویه حساب',
          html: 'حساب <b>' + esc(employer.name) + '</b> به مبلغ' +
            '<span class="emph">' + esc(money(balance)) + '</span>' +
            'تسویه شود؟ آیا مطمئنید؟',
          confirmText: 'بله، تسویه شد'
        }).then(function (yes) {
          if (!yes) return;
          Store.settle(employer.id, J.toKey(J.today()));
          toast('حساب تسویه شد.', 'ok');
          render();
        });
      }
    });
  }

  /* ================= فرم سفارش روزانه ================= */

  function screenOrderForm(route) {
    var editing = route.orderId ? Store.orderById(route.orderId) : null;
    if (route.orderId && !editing) { go('#/'); return; }

    var employerId = editing ? editing.employerId : route.employerId;
    var employer = Store.employerById(employerId);
    if (!employer) { go('#/'); return; }

    /* قیمت‌های سفارش در حال ویرایش از خود رکورد خوانده می‌شوند («عکس لحظه‌ای»)،
       تا ویرایش یک سفارش قدیمی مبلغش را با قیمت‌های جدید عوض نکند. */
    var snapshot = {};
    if (editing) {
      editing.lines.forEach(function (l) { snapshot[l.itemId] = { name: l.name, price: l.price }; });
    }

    var items = Store.activeMenuItems().map(function (m) {
      var snap = snapshot[m.id];
      return { id: m.id, name: snap ? snap.name : m.name, price: snap ? snap.price : m.price };
    });
    /* قلم‌هایی که در تنظیمات غیرفعال یا حذف شده‌اند ولی در همین سفارش هستند */
    if (editing) {
      editing.lines.forEach(function (l) {
        if (!items.some(function (i) { return i.id === l.itemId; })) {
          items.push({ id: l.itemId, name: l.name, price: l.price, retired: true });
        }
      });
    }

    var form = {
      dateKey: editing ? editing.dateKey : J.toKey(J.today()),
      people: editing ? editing.people : 0,
      qty: {}
    };
    items.forEach(function (i) { form.qty[i.id] = 0; });
    if (editing) editing.lines.forEach(function (l) { form.qty[l.itemId] = l.qty; });

    var html = topbar({
      title: editing ? 'ویرایش سفارش' : 'سفارش ' + employer.name,
      back: '#/employer/' + employerId
    });

    html += '<div class="content has-dock">' +
      '<div class="card">' +
      '<div class="field"><label>تاریخ سفارش</label>' +
      '<button class="btn btn-secondary" id="date-btn" type="button" style="justify-content:space-between">' +
      '<span id="date-label">' + esc(dateLong(form.dateKey)) + '</span>' +
      '<span aria-hidden="true">📅</span></button>' +
      '<div class="hint">برای ثبت روزهای گذشته، روی تاریخ بزنید.</div></div>' +

      '<div class="field" style="margin-bottom:0"><label for="f-people">تعداد نفرها</label>' +
      '<div class="counter-ctrl">' +
      '<button class="step-btn plus" type="button" data-people-step="1" aria-label="زیاد کردن تعداد نفر">＋</button>' +
      '<input class="qty-input" id="f-people" type="text" inputmode="numeric" value="' + num(form.people) + '">' +
      '<button class="step-btn" type="button" data-people-step="-1" aria-label="کم کردن تعداد نفر">−</button>' +
      '</div>' +
      '<div class="hint">فقط برای یادداشت خودتان است و در مبلغ اثری ندارد.</div></div>' +
      '</div>';

    html += '<div class="section-title">اقلام سفارش</div>';

    if (!items.length) {
      html += '<div class="empty">هیچ قلمی در منو نیست.<br>' +
        'از بخش تنظیمات، قلم‌های منو را اضافه کنید.</div>';
    }

    html += items.map(function (i) {
      return '<div class="counter-card" data-card="' + esc(i.id) + '">' +
        '<div class="counter-top">' +
        '<span class="name">' + esc(i.name) + (i.retired ? ' <span class="muted small">(حذف‌شده از منو)</span>' : '') + '</span>' +
        '<span class="price">' + esc(money(i.price)) + '</span>' +
        '</div>' +
        '<div class="counter-ctrl">' +
        '<button class="step-btn plus" type="button" data-step="1" data-item="' + esc(i.id) + '" aria-label="زیاد کردن ' + esc(i.name) + '">＋</button>' +
        '<input class="qty-input" type="text" inputmode="numeric" data-qty="' + esc(i.id) + '" value="' + num(form.qty[i.id]) + '" aria-label="تعداد ' + esc(i.name) + '">' +
        '<button class="step-btn" type="button" data-step="-1" data-item="' + esc(i.id) + '" aria-label="کم کردن ' + esc(i.name) + '">−</button>' +
        '</div>' +
        '<div class="counter-sub" data-sub="' + esc(i.id) + '"></div>' +
        '</div>';
    }).join('');

    html += '</div>';

    html += '<div class="dock">' +
      '<div class="live-total"><span class="label">جمع این سفارش</span>' +
      '<span class="value" id="live-total">' + moneyHtml(0) + '</span></div>' +
      '<button class="btn btn-primary" id="save-order">' +
      '<span aria-hidden="true">✓</span><span>ذخیره‌ی سفارش</span></button>' +
      '</div>';

    var wrap = mount(html);

    function itemById(id) {
      return items.find(function (i) { return i.id === id; });
    }

    function currentTotal() {
      return items.reduce(function (s, i) { return s + i.price * (form.qty[i.id] || 0); }, 0);
    }

    function refresh() {
      items.forEach(function (i) {
        var q = form.qty[i.id] || 0;
        var input = wrap.querySelector('[data-qty="' + i.id + '"]');
        if (input && J.toLatinDigits(input.value) !== String(q)) input.value = num(q);
        var sub = wrap.querySelector('[data-sub="' + i.id + '"]');
        sub.textContent = q > 0 ? num(q) + ' × ' + money(i.price) + ' = ' + money(i.price * q) : '';
        wrap.querySelector('[data-card="' + i.id + '"]').classList.toggle('active', q > 0);
        var minus = wrap.querySelector('[data-step="-1"][data-item="' + i.id + '"]');
        if (minus) minus.disabled = q <= 0;
      });
      wrap.querySelector('#live-total').innerHTML = moneyHtml(currentTotal());
    }
    refresh();

    wrap.addEventListener('click', function (e) {
      var step = e.target.closest('[data-step]');
      if (step) {
        var id = step.dataset.item;
        form.qty[id] = Math.max(0, (form.qty[id] || 0) + (+step.dataset.step));
        refresh();
        return;
      }
      var pStep = e.target.closest('[data-people-step]');
      if (pStep) {
        form.people = Math.max(0, form.people + (+pStep.dataset.peopleStep));
        wrap.querySelector('#f-people').value = num(form.people);
        return;
      }
      if (e.target.closest('#date-btn')) {
        pickDate(form.dateKey).then(function (key) {
          if (!key) return;
          form.dateKey = key;
          wrap.querySelector('#date-label').textContent = dateLong(key);
        });
      }
    });

    wrap.addEventListener('input', function (e) {
      var qtyInput = e.target.closest('[data-qty]');
      if (qtyInput) {
        form.qty[qtyInput.dataset.qty] = Math.max(0, parseInt10(qtyInput.value));
        var id = qtyInput.dataset.qty;
        var i = itemById(id);
        var q = form.qty[id];
        wrap.querySelector('[data-sub="' + id + '"]').textContent = q > 0 ? num(q) + ' × ' + money(i.price) + ' = ' + money(i.price * q) : '';
        wrap.querySelector('[data-card="' + id + '"]').classList.toggle('active', q > 0);
        wrap.querySelector('#live-total').innerHTML = moneyHtml(currentTotal());
        return;
      }
      if (e.target.id === 'f-people') form.people = Math.max(0, parseInt10(e.target.value));
    });

    wrap.querySelector('#save-order').addEventListener('click', function () {
      var lines = items
        .filter(function (i) { return (form.qty[i.id] || 0) > 0; })
        .map(function (i) { return { itemId: i.id, name: i.name, price: i.price, qty: form.qty[i.id] }; });

      if (!lines.length) {
        toast('حداقل یک قلم را انتخاب کنید.', 'err');
        return;
      }

      Store.saveOrder({
        id: editing ? editing.id : undefined,
        employerId: employerId,
        dateKey: form.dateKey,
        people: form.people,
        lines: lines,
        createdAt: editing ? editing.createdAt : undefined
      });
      toast(editing ? 'سفارش ویرایش شد.' : 'سفارش ثبت شد.', 'ok');
      go('#/employer/' + employerId);
    });
  }

  /* ================= تنظیمات ================= */

  function screenSettings() {
    var state = Store.get();
    var days = global.Backup.daysSinceLastBackup();

    var html = topbar({ title: 'تنظیمات', back: '#/' });
    html += '<div class="content">';

    /* قلم‌های منو */
    html += '<div class="section-title">قلم‌های منو و قیمت‌ها</div>' +
      '<div class="notice">اگر قیمتی را عوض کنید، فقط روی سفارش‌های <b>جدید</b> اثر می‌گذارد. ' +
      'سفارش‌های ثبت‌شده‌ی قبلی با همان قیمت روز خودشان دست‌نخورده می‌مانند.</div>' +
      '<div class="card" id="menu-card">' +
      state.menuItems.map(function (m) {
        var off = m.active === false;
        return '<div class="menu-item-row">' +
          '<div class="mi-main">' +
          '<div class="mi-name' + (off ? ' off' : '') + '">' + esc(m.name) + '</div>' +
          '<div class="mi-price">' + esc(money(m.price)) + (off ? ' — غیرفعال' : '') + '</div>' +
          '</div>' +
          '<div class="mi-actions">' +
          '<button class="btn btn-ghost btn-sm" data-edit-item="' + esc(m.id) + '">' +
          '<span aria-hidden="true">✎</span><span>ویرایش</span></button>' +
          '<button class="btn btn-ghost btn-sm" data-toggle-item="' + esc(m.id) + '">' +
          '<span aria-hidden="true">' + (off ? '👁' : '🚫') + '</span><span>' +
          (off ? 'فعال کردن' : 'غیرفعال') + '</span></button>' +
          '<button class="btn btn-danger btn-sm" data-delete-item="' + esc(m.id) + '">' +
          '<span aria-hidden="true">🗑</span><span>حذف</span></button>' +
          '</div>' +
          '</div>';
      }).join('') +
      '</div>' +
      '<button class="btn btn-secondary" id="add-item">' +
      '<span aria-hidden="true">＋</span><span>افزودن قلم جدید</span></button>';

    /* نمایش اعداد */
    html += '<div class="section-title">نمایش</div><div class="card">' +
      '<div class="switch-row">' +
      '<span class="sw-label">نمایش اعداد با رقم فارسی<br><span class="muted small">' +
      'خاموش: ۱۴۰,۰۰۰ به شکل 140,000 دیده می‌شود</span></span>' +
      '<label class="switch"><input type="checkbox" id="digits-toggle"' +
      (useFaDigits() ? ' checked' : '') + '><span class="track"></span></label>' +
      '</div></div>';

    /* پشتیبان‌گیری */
    html += '<div class="section-title">پشتیبان‌گیری</div>' +
      '<div class="notice">هر ۷ روز یک‌بار، اپ خودش هنگام باز شدن یک پشتیبان می‌سازد و روی گوشی دانلود می‌کند: ' +
      'یک فایل اکسل خوانا و یک فایل بازیابی.</div>' +
      '<div class="card">' +
      '<div class="info-line small muted" style="margin-bottom:12px">آخرین پشتیبان‌گیری: ' +
      (days === null ? 'هنوز انجام نشده' : (days === 0 ? 'امروز' : num(days) + ' روز پیش')) + '</div>' +
      '<button class="btn btn-primary" id="backup-now" style="margin-bottom:10px">' +
      '<span aria-hidden="true">⬇</span><span>پشتیبان‌گیری دستی همین الان</span></button>' +
      '<button class="btn btn-secondary" id="restore-btn">' +
      '<span aria-hidden="true">⬆</span><span>بازیابی از فایل پشتیبان</span></button>' +
      '<input type="file" id="restore-file" accept=".json,application/json" class="hidden">' +
      '</div>';

    /* تلگرام */
    html += '<div class="section-title">ارسال خودکار پشتیبان به تلگرام <span class="muted small">(اختیاری)</span></div>' +
      '<div class="notice">اگر این دو کادر را پر کنید، پشتیبان هفتگی خودکار به تلگرام شما هم فرستاده می‌شود. ' +
      'خالی گذاشتنشان هیچ مشکلی ندارد؛ در آن صورت فقط روی گوشی دانلود می‌شود.</div>' +
      '<div class="card">' +
      '<div class="field"><label for="tg-token">توکن ربات تلگرام</label>' +
      '<input class="input ltr-num" id="tg-token" type="text" autocomplete="off" placeholder="خالی بگذارید تا غیرفعال بماند" value="' +
      esc(state.settings.telegramToken) + '"></div>' +
      '<div class="field" style="margin-bottom:12px"><label for="tg-chat">شناسه چت</label>' +
      '<input class="input ltr-num" id="tg-chat" type="text" autocomplete="off" inputmode="text" value="' +
      esc(state.settings.telegramChatId) + '"></div>' +
      '<div class="btn-row">' +
      '<button class="btn btn-secondary btn-sm" id="tg-save" style="flex:1">' +
      '<span aria-hidden="true">✓</span><span>ذخیره</span></button>' +
      '<button class="btn btn-ghost btn-sm" id="tg-test" style="flex:1">' +
      '<span aria-hidden="true">✉</span><span>ارسال آزمایشی</span></button>' +
      '</div></div>';

    html += '</div>';

    var wrap = mount(html);

    /* --- قلم‌های منو --- */
    wrap.querySelector('#add-item').addEventListener('click', function () {
      menuItemDialog(null).then(function (data) {
        if (!data) return;
        Store.saveMenuItem(data);
        toast('قلم اضافه شد.', 'ok');
        render();
      });
    });

    wrap.querySelector('#menu-card').addEventListener('click', function (e) {
      var edit = e.target.closest('[data-edit-item]');
      if (edit) {
        var item = state.menuItems.find(function (m) { return m.id === edit.dataset.editItem; });
        menuItemDialog(item).then(function (data) {
          if (!data) return;
          Store.saveMenuItem({ id: item.id, name: data.name, price: data.price });
          toast('قلم ویرایش شد.', 'ok');
          render();
        });
        return;
      }

      var toggle = e.target.closest('[data-toggle-item]');
      if (toggle) {
        var m = state.menuItems.find(function (x) { return x.id === toggle.dataset.toggleItem; });
        Store.saveMenuItem({ id: m.id, active: m.active === false });
        toast(m.active === false ? 'قلم فعال شد.' : 'قلم غیرفعال شد.', 'ok');
        render();
        return;
      }

      var del = e.target.closest('[data-delete-item]');
      if (del) {
        var target = state.menuItems.find(function (x) { return x.id === del.dataset.deleteItem; });
        confirmDialog({
          title: 'حذف قلم منو',
          html: '<b>' + esc(target.name) + '</b> از منو حذف شود؟<br>' +
            'سفارش‌های قبلی که با این قلم ثبت شده‌اند <b>دست‌نخورده</b> باقی می‌مانند.',
          confirmText: 'بله، حذف کن',
          danger: true
        }).then(function (yes) {
          if (!yes) return;
          Store.deleteMenuItem(target.id);
          toast('قلم حذف شد.', 'ok');
          render();
        });
      }
    });

    /* --- ارقام --- */
    wrap.querySelector('#digits-toggle').addEventListener('change', function (e) {
      Store.updateSettings({ digits: e.target.checked ? 'fa' : 'en' });
      render();
    });

    /* --- پشتیبان --- */
    wrap.querySelector('#backup-now').addEventListener('click', function () {
      var btn = this;
      btn.disabled = true;
      toast('در حال ساخت پشتیبان…');
      global.Backup.run().then(function (res) {
        btn.disabled = false;
        if (res.telegram === 'sent') toast('پشتیبان ساخته و به تلگرام فرستاده شد.', 'ok');
        else if (res.telegram === 'failed') toast('پشتیبان دانلود شد، ولی ارسال به تلگرام ناموفق بود: ' + res.error, 'err');
        else toast('پشتیبان ساخته و دانلود شد.', 'ok');
        render();
      }).catch(function (err) {
        btn.disabled = false;
        toast('پشتیبان‌گیری ناموفق بود: ' + err.message, 'err');
      });
    });

    var fileInput = wrap.querySelector('#restore-file');
    wrap.querySelector('#restore-btn').addEventListener('click', function () { fileInput.click(); });

    fileInput.addEventListener('change', function () {
      var file = fileInput.files && fileInput.files[0];
      if (!file) return;
      global.Backup.parseBackupFile(file).then(function (data) {
        return confirmDialog({
          title: 'بازیابی اطلاعات',
          html: 'این فایل شامل <b>' + num((data.employers || []).length) + '</b> صاحب‌کار و <b>' +
            num((data.orders || []).length) + '</b> سفارش است.<br>' +
            'با بازیابی، همه‌ی اطلاعات فعلی اپ <b>پاک</b> و جای آن‌ها اطلاعات این فایل نشانده می‌شود. آیا مطمئنید؟',
          confirmText: 'بله، بازیابی کن',
          danger: true
        }).then(function (yes) {
          if (!yes) return;
          Store.importData(data);
          toast('اطلاعات بازیابی شد.', 'ok');
          go('#/');
        });
      }).catch(function (err) {
        toast(err.message || 'فایل خوانده نشد.', 'err');
      }).then(function () {
        fileInput.value = '';
      });
    });

    /* --- تلگرام --- */
    function readTelegramFields() {
      return {
        telegramToken: wrap.querySelector('#tg-token').value.trim(),
        telegramChatId: J.toLatinDigits(wrap.querySelector('#tg-chat').value.trim())
      };
    }

    wrap.querySelector('#tg-save').addEventListener('click', function () {
      Store.updateSettings(readTelegramFields());
      toast('ذخیره شد.', 'ok');
    });

    wrap.querySelector('#tg-test').addEventListener('click', function () {
      var fields = readTelegramFields();
      if (!fields.telegramToken || !fields.telegramChatId) {
        toast('اول توکن و شناسه چت را پر کنید.', 'err');
        return;
      }
      Store.updateSettings(fields);
      var btn = this;
      btn.disabled = true;
      toast('در حال ارسال…');
      var blob = new Blob(['پیام آزمایشی دفتر قرض'], { type: 'text/plain' });
      global.Backup.sendToTelegram(fields.telegramToken, fields.telegramChatId, blob, 'آزمایش.txt', 'اتصال دفتر قرض درست کار می‌کند.')
        .then(function () {
          btn.disabled = false;
          toast('ارسال آزمایشی موفق بود.', 'ok');
        })
        .catch(function (err) {
          btn.disabled = false;
          toast('ارسال ناموفق بود: ' + err.message, 'err');
        });
    });
  }

  /* ================= راه‌اندازی ================= */

  function start() {
    app = document.getElementById('app');
    global.addEventListener('hashchange', render);
    render();
  }

  global.UI = { start: start, render: render, toast: toast, confirmDialog: confirmDialog };
})(typeof globalThis !== 'undefined' ? globalThis : this);
