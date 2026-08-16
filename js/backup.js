/* پشتیبان‌گیری: ساخت فایل اکسل خوانا + فایل JSON کامل برای بازیابی،
   دانلود روی گوشی، و در صورت تنظیم‌بودن، ارسال خودکار به تلگرام. */
(function (global) {
  'use strict';

  var J = global.Jalali;
  var DAY = 24 * 60 * 60 * 1000;

  function pad(n) { return String(n).padStart(2, '0'); }

  function stamp() {
    var t = J.today();
    var now = new Date();
    return t.jy + '-' + pad(t.jm) + '-' + pad(t.jd) + '_' + pad(now.getHours()) + pad(now.getMinutes());
  }

  function nameOfEmployer(state, id) {
    var e = state.employers.find(function (x) { return x.id === id; });
    return e ? e.name : '(حذف‌شده)';
  }

  /* ---------- ساخت شیت‌ها ---------- */
  function buildSheets(state) {
    var employers = state.employers.slice().sort(function (a, b) {
      return a.name.localeCompare(b.name, 'fa');
    });

    var openBalance = {};
    state.orders.forEach(function (o) {
      if (!o.settlementId) openBalance[o.employerId] = (openBalance[o.employerId] || 0) + o.total;
    });

    var sheetEmployers = {
      name: 'صاحب‌کارها',
      widths: [26, 24, 20, 18, 34, 18],
      rows: [['نام صاحب‌کار', 'شماره‌های تلفن', 'نام استادکار', 'شماره استادکار', 'توضیحات', 'مانده‌ی حساب باز (تومان)']]
    };
    employers.forEach(function (e) {
      sheetEmployers.rows.push([
        e.name,
        (e.phones || []).join(' ، '),
        e.foremanName || '',
        e.foremanPhone || '',
        e.notes || '',
        openBalance[e.id] || 0
      ]);
    });

    var sheetOrders = {
      name: 'سفارش‌های روزانه',
      widths: [26, 14, 12, 40, 20, 14, 14],
      rows: [['صاحب‌کار', 'تاریخ', 'تعداد نفر', 'اقلام سفارش', 'مبلغ کل (تومان)', 'وضعیت', 'تاریخ تسویه']]
    };
    var settlementById = {};
    state.settlements.forEach(function (s) { settlementById[s.id] = s; });

    state.orders.slice().sort(function (a, b) {
      var n = nameOfEmployer(state, a.employerId).localeCompare(nameOfEmployer(state, b.employerId), 'fa');
      return n || a.dateKey.localeCompare(b.dateKey);
    }).forEach(function (o) {
      var items = o.lines.map(function (l) {
        return l.name + ' × ' + l.qty + ' (' + J.groupThousands(l.price) + ')';
      }).join(' + ');
      var stl = o.settlementId ? settlementById[o.settlementId] : null;
      sheetOrders.rows.push([
        nameOfEmployer(state, o.employerId),
        o.dateKey,
        o.people || 0,
        items,
        o.total,
        o.settlementId ? 'تسویه‌شده' : 'باز',
        stl ? stl.dateKey : ''
      ]);
    });

    var sheetSettlements = {
      name: 'تسویه‌ها',
      widths: [26, 16, 20, 18],
      rows: [['صاحب‌کار', 'تاریخ تسویه', 'مبلغ تسویه (تومان)', 'تعداد روزهای تسویه‌شده']]
    };
    state.settlements.slice().sort(function (a, b) {
      return a.dateKey.localeCompare(b.dateKey);
    }).forEach(function (s) {
      sheetSettlements.rows.push([
        nameOfEmployer(state, s.employerId),
        s.dateKey,
        s.total,
        s.orderCount || 0
      ]);
    });

    var sheetMenu = {
      name: 'قلم‌های منو',
      widths: [34, 20, 14],
      rows: [['نام قلم', 'قیمت فعلی (تومان)', 'وضعیت']]
    };
    state.menuItems.forEach(function (m) {
      sheetMenu.rows.push([m.name, m.price, m.active === false ? 'غیرفعال' : 'فعال']);
    });

    return [sheetEmployers, sheetOrders, sheetSettlements, sheetMenu];
  }

  /* ---------- دانلود ---------- */
  var pendingDownloads = [];

  function triggerDownload(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 60000);
  }

  /* سافاری فقط وقتی اجازه‌ی دانلود می‌دهد که کاربر تازگی چیزی را لمس کرده باشد.
     اگر پشتیبان‌گیری خودکار موقع باز شدن اپ انجام شود، دانلود تا اولین لمس صبر می‌کند. */
  function downloadWhenAllowed(blob, filename) {
    var activated = !global.navigator.userActivation || global.navigator.userActivation.hasBeenActive;
    if (activated) {
      triggerDownload(blob, filename);
      return true;
    }
    pendingDownloads.push({ blob: blob, filename: filename });
    return false;
  }

  function flushPendingDownloads() {
    if (!pendingDownloads.length) return;
    var queue = pendingDownloads.slice();
    pendingDownloads.length = 0;
    queue.forEach(function (item, i) {
      setTimeout(function () { triggerDownload(item.blob, item.filename); }, i * 900);
    });
  }

  document.addEventListener('pointerdown', flushPendingDownloads, true);
  document.addEventListener('click', flushPendingDownloads, true);

  /* ---------- تلگرام ---------- */
  function sendToTelegram(token, chatId, blob, filename, caption) {
    var form = new FormData();
    form.append('chat_id', chatId);
    form.append('document', blob, filename);
    if (caption) form.append('caption', caption);
    return fetch('https://api.telegram.org/bot' + encodeURIComponent(token) + '/sendDocument', {
      method: 'POST',
      body: form
    }).then(function (res) {
      return res.json();
    }).then(function (data) {
      if (!data.ok) throw new Error(data.description || 'خطای ناشناخته‌ی تلگرام');
      return data;
    });
  }

  /* ---------- اجرای پشتیبان‌گیری ---------- */
  /* خروجی: { xlsxName, jsonName, downloaded, telegram: 'sent'|'failed'|'off', error } */
  function run(options) {
    options = options || {};
    var state = global.Store.exportData();
    var s = stamp();
    var xlsxName = 'daftar-qarz-' + s + '.xlsx';
    var jsonName = 'daftar-qarz-' + s + '.json';

    var xlsxBlob = global.XlsxWriter.build(buildSheets(state));
    var jsonBlob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });

    var result = { xlsxName: xlsxName, jsonName: jsonName, downloaded: false, telegram: 'off' };

    result.downloaded = downloadWhenAllowed(xlsxBlob, xlsxName);
    downloadWhenAllowed(jsonBlob, jsonName);

    var settings = global.Store.get().settings;
    var token = (settings.telegramToken || '').trim();
    var chatId = (settings.telegramChatId || '').trim();

    var telegramStep = Promise.resolve();
    if (token && chatId) {
      var t = J.today();
      var caption = 'پشتیبان دفتر قرض — ' + t.jy + '/' + pad(t.jm) + '/' + pad(t.jd);
      telegramStep = sendToTelegram(token, chatId, xlsxBlob, xlsxName, caption)
        .then(function () { return sendToTelegram(token, chatId, jsonBlob, jsonName, 'فایل بازیابی'); })
        .then(function () { result.telegram = 'sent'; })
        .catch(function (err) {
          result.telegram = 'failed';
          result.error = err.message;
        });
    }

    return telegramStep.then(function () {
      global.Store.updateSettings({ lastBackupAt: Date.now() });
      return result;
    });
  }

  function daysSinceLastBackup() {
    var last = global.Store.get().settings.lastBackupAt;
    if (!last) return null;
    return Math.floor((Date.now() - last) / DAY);
  }

  function isDue() {
    var settings = global.Store.get().settings;
    var interval = Number(settings.backupIntervalDays) || 7;
    if (!settings.lastBackupAt) {
      // اولین اجرا: زمان را ثبت می‌کنیم تا پشتیبان بعدی دقیقاً یک هفته بعد باشد
      global.Store.updateSettings({ lastBackupAt: Date.now() });
      return false;
    }
    return (Date.now() - settings.lastBackupAt) >= interval * DAY;
  }

  /* ---------- بازیابی ---------- */
  function parseBackupFile(file) {
    return file.text().then(function (text) {
      var data = JSON.parse(text);
      if (!data || typeof data !== 'object' || !Array.isArray(data.employers)) {
        throw new Error('این فایل یک پشتیبان معتبر دفتر قرض نیست.');
      }
      return data;
    });
  }

  global.Backup = {
    run: run,
    isDue: isDue,
    daysSinceLastBackup: daysSinceLastBackup,
    parseBackupFile: parseBackupFile,
    buildSheets: buildSheets,
    sendToTelegram: sendToTelegram
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
