/* راه‌اندازی اپ: بارگذاری اطلاعات، اجرای رابط کاربری، ثبت سرویس‌ورکر و پشتیبان‌گیری خودکار هفتگی. */
(function (global) {
  'use strict';

  function boot() {
    global.Store.load();
    global.UI.start();

    /* سرویس‌ورکر: همه‌ی فایل‌ها را کش می‌کند تا اپ بدون اینترنت هم کامل باز شود. */
    if ('serviceWorker' in navigator) {
      global.addEventListener('load', function () {
        navigator.serviceWorker.register('sw.js').catch(function (err) {
          console.warn('ثبت سرویس‌ورکر ناموفق بود:', err);
        });
      });
    }

    /* پشتیبان‌گیری خودکار هفتگی — بدون پرسیدن از کاربر.
       دانلود فایل ممکن است تا اولین لمس صفحه صبر کند، چون سافاری برای دانلود
       نیاز دارد کاربر تازگی با صفحه کار کرده باشد. */
    setTimeout(function () {
      if (!global.Backup.isDue()) return;
      global.Backup.run().then(function (res) {
        if (res.telegram === 'sent') {
          global.UI.toast('پشتیبان هفتگی ساخته و به تلگرام فرستاده شد.', 'ok');
        } else if (res.telegram === 'failed') {
          global.UI.toast('پشتیبان هفتگی ساخته شد، ولی ارسال به تلگرام ناموفق بود.', 'err');
        } else {
          global.UI.toast('پشتیبان هفتگی خودکار ساخته و دانلود شد.', 'ok');
        }
      }).catch(function (err) {
        console.warn('پشتیبان‌گیری خودکار ناموفق بود:', err);
      });
    }, 1200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
