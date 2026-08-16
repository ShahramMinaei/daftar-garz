/* تبدیل تاریخ شمسی/میلادی و قالب‌بندی اعداد فارسی.
   الگوریتم تبدیل بر پایه‌ی روش jalaali-js پیاده‌سازی شده تا نیازی به کتابخانه‌ی بیرونی نباشد. */
(function (global) {
  'use strict';

  function div(a, b) { return ~~(a / b); }
  function mod(a, b) { return a - ~~(a / b) * b; }

  var BREAKS = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210,
    1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];

  function jalCal(jy, withoutLeap) {
    var bl = BREAKS.length, gy = jy + 621, leapJ = -14, jp = BREAKS[0];
    var jm, jump, leap, leapG, march, n, i;

    if (jy < jp || jy >= BREAKS[bl - 1]) throw new Error('سال شمسی نامعتبر: ' + jy);

    for (i = 1; i < bl; i += 1) {
      jm = BREAKS[i];
      jump = jm - jp;
      if (jy < jm) break;
      leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4);
      jp = jm;
    }
    n = jy - jp;

    leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
    if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;

    leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
    march = 20 + leapJ - leapG;

    if (!withoutLeap) {
      if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
      leap = mod(mod(n + 1, 33) - 1, 4);
      if (leap === -1) leap = 4;
    }
    return { leap: leap, gy: gy, march: march };
  }

  // شماره‌ی روز مطلق (Julian Day Number) از تاریخ میلادی
  function g2d(gy, gm, gd) {
    var d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4)
      + div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408;
    d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
    return d;
  }

  function d2g(jdn) {
    var j, i, gd, gm, gy;
    j = 4 * jdn + 139361631;
    j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
    i = div(mod(j, 1461), 4) * 5 + 308;
    gd = div(mod(i, 153), 5) + 1;
    gm = mod(div(i, 153), 12) + 1;
    gy = div(j, 1461) - 100100 + div(8 - gm, 6);
    return { gy: gy, gm: gm, gd: gd };
  }

  function j2d(jy, jm, jd) {
    var r = jalCal(jy, true);
    return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
  }

  function d2j(jdn) {
    var gy = d2g(jdn).gy, jy = gy - 621, r = jalCal(jy, false),
      jdn1f = g2d(gy, 3, r.march), jd, jm, k;
    k = jdn - jdn1f;
    if (k >= 0) {
      if (k <= 185) {
        jm = 1 + div(k, 31);
        jd = mod(k, 31) + 1;
        return { jy: jy, jm: jm, jd: jd };
      }
      k -= 186;
    } else {
      jy -= 1;
      k += 179;
      if (r.leap === 1) k += 1;
    }
    jm = 7 + div(k, 30);
    jd = mod(k, 30) + 1;
    return { jy: jy, jm: jm, jd: jd };
  }

  function toJalaali(gy, gm, gd) { return d2j(g2d(gy, gm, gd)); }
  function toGregorian(jy, jm, jd) { return d2g(j2d(jy, jm, jd)); }

  function isLeapJalaaliYear(jy) { return jalCal(jy, false).leap === 0; }

  function monthLength(jy, jm) {
    if (jm <= 6) return 31;
    if (jm <= 11) return 30;
    return isLeapJalaaliYear(jy) ? 30 : 29;
  }

  var MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
    'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
  // getDay() جاوااسکریپت: ۰ = یکشنبه
  var WEEKDAYS_BY_JS_DAY = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'];
  // ستون‌های تقویم، از شنبه تا جمعه
  var WEEK_HEADERS = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];

  function today() {
    var now = new Date();
    return toJalaali(now.getFullYear(), now.getMonth() + 1, now.getDate());
  }

  /* کلید تاریخ به شکل «۱۴۰۴/۰۵/۲۵» با رقم لاتین — هم برای ذخیره و هم برای مرتب‌سازی الفبایی درست است */
  function toKey(j) {
    return j.jy + '/' + String(j.jm).padStart(2, '0') + '/' + String(j.jd).padStart(2, '0');
  }

  function fromKey(key) {
    var p = String(key).split('/');
    return { jy: +p[0], jm: +p[1], jd: +p[2] };
  }

  // شماره‌ی ستون تقویم (۰ = شنبه) برای اول ماه
  function firstWeekdayOfMonth(jy, jm) {
    var g = toGregorian(jy, jm, 1);
    var jsDay = new Date(g.gy, g.gm - 1, g.gd).getDay(); // ۰=یکشنبه
    return (jsDay + 1) % 7; // ۰=شنبه
  }

  function weekdayName(j) {
    var g = toGregorian(j.jy, j.jm, j.jd);
    return WEEKDAYS_BY_JS_DAY[new Date(g.gy, g.gm - 1, g.gd).getDay()];
  }

  /* ---------- ارقام و قالب‌بندی ---------- */
  var FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

  function toFaDigits(s) {
    return String(s).replace(/[0-9]/g, function (d) { return FA_DIGITS[+d]; });
  }

  /* هر رقم فارسی یا عربی را به رقم لاتین برمی‌گرداند تا محاسبات درست انجام شود */
  function toLatinDigits(s) {
    return String(s)
      .replace(/[۰-۹]/g, function (c) { return String(c.charCodeAt(0) - 0x06F0); })
      .replace(/[٠-٩]/g, function (c) { return String(c.charCodeAt(0) - 0x0660); });
  }

  function groupThousands(n) {
    var s = String(Math.abs(Math.round(n)));
    var out = '';
    while (s.length > 3) {
      out = ',' + s.slice(-3) + out;
      s = s.slice(0, -3);
    }
    return (n < 0 ? '-' : '') + s + out;
  }

  global.Jalali = {
    toJalaali: toJalaali,
    toGregorian: toGregorian,
    monthLength: monthLength,
    isLeapJalaaliYear: isLeapJalaaliYear,
    today: today,
    toKey: toKey,
    fromKey: fromKey,
    firstWeekdayOfMonth: firstWeekdayOfMonth,
    weekdayName: weekdayName,
    MONTHS: MONTHS,
    WEEK_HEADERS: WEEK_HEADERS,
    toFaDigits: toFaDigits,
    toLatinDigits: toLatinDigits,
    groupThousands: groupThousands
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
