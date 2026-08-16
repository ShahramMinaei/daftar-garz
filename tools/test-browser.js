/* آزمون سرتاسری در مرورگر واقعی، شامل آزمون حالت آفلاین.
   اجرا:  node tools/serve.js &  سپس  node tools/test-browser.js */
const { chromium, devices } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = 'http://localhost:8080/';
const SHOTS = path.join(__dirname, '..', 'screenshots');

let passed = 0, failed = 0;
function check(label, ok, extra) {
  if (ok) { passed++; console.log('  ✓ ' + label); }
  else { failed++; console.log('  ✗ ' + label + (extra ? '  →  ' + extra : '')); }
}
function section(t) { console.log('\n' + t); }

/* وضعیت بازبودن تاریخچه بین رفت‌وبرگشت‌ها حفظ می‌شود، پس فقط وقتی بسته است کلیک می‌کنیم. */
async function openSettlementDetails(page) {
  await page.waitForSelector('.settle-card');
  if (!(await page.locator('.settle-body').count())) {
    await page.click('[data-toggle-settlement]');
  }
  await page.waitForSelector('.settle-body');
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    ...devices['iPhone 13'],
    isMobile: true,
    hasTouch: true,
    locale: 'fa-IR',
    acceptDownloads: true
  });
  const page = await context.newPage();

  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto(BASE, { waitUntil: 'networkidle' });

  section('۱) بارگذاری صفحه‌ی اصلی');
  check('عنوان صفحه', await page.title() === 'دفتر قرض');
  check('نوار عنوان فارسی', (await page.locator('.topbar h1').textContent()) === 'دفتر قرض');
  check('راست‌به‌چپ', await page.evaluate(() => document.documentElement.dir) === 'rtl');
  check('مجموع مطالبات صفر', (await page.locator('.summary .value').textContent()).includes('۰'));
  check('فونت وزیرمتن بارگذاری شد', await page.evaluate(() => document.fonts.check('16px Vazirmatn')));
  await page.screenshot({ path: path.join(SHOTS, '01-home-empty.png') });

  section('۲) افزودن صاحب‌کار');
  await page.click('[data-add-employer]');
  await page.fill('#f-name', 'حاج رضا تعمیرگاه');
  await page.fill('[data-phone="0"]', '09121234567');
  await page.click('#add-phone');
  await page.fill('[data-phone="1"]', '02155551111');
  await page.fill('#f-foreman', 'مشهدی اکبر');
  await page.fill('#f-foreman-phone', '09339998877');
  await page.fill('#f-notes', 'کنار بانک ملی');
  await page.screenshot({ path: path.join(SHOTS, '02-employer-form.png') });
  await page.click('#save');
  await page.waitForSelector('.balance-box');
  check('رفتیم به صفحه‌ی جزئیات', (await page.locator('.topbar h1').textContent()) === 'حاج رضا تعمیرگاه');
  check('حساب تسویه است', (await page.locator('.balance-box').getAttribute('class')).includes('zero'));

  section('۳) ثبت سفارش: ۲ نوکاو + ۱ چایی اضافه + ۱ املت');
  await page.click('#new-order');
  await page.waitForSelector('.counter-card');
  const cards = page.locator('.counter-card');
  check('چهار قلم منو نمایش داده شد', await cards.count() === 4);
  check('تاریخ پیش‌فرض امروز است', (await page.locator('#date-label').textContent()).length > 6);

  async function plus(name, times) {
    const card = page.locator('.counter-card', { hasText: name }).first();
    for (let i = 0; i < times; i++) await card.locator('.step-btn.plus').click();
  }
  await plus('نوکاو', 2);
  await plus('چایی اضافه', 1);
  await plus('املت', 1);
  await page.fill('#f-people', '3');

  const liveTotal = await page.locator('#live-total').textContent();
  check('جمع زنده = ۴۷۰,۰۰۰ تومان', liveTotal.replace(/\s+/g, ' ').trim() === '۴۷۰,۰۰۰ تومان', liveTotal);
  await page.screenshot({ path: path.join(SHOTS, '03-order-form.png') });

  section('۴) بررسی دکمه‌ی منها');
  await plus('نوکاو', 1);
  check('بعد از یک + دیگر: ۶۱۰,۰۰۰', (await page.locator('#live-total').textContent()).includes('۶۱۰,۰۰۰'));
  await page.locator('.counter-card', { hasText: 'نوکاو' }).first().locator('[data-step="-1"]').click();
  check('بعد از منها دوباره ۴۷۰,۰۰۰', (await page.locator('#live-total').textContent()).includes('۴۷۰,۰۰۰'));

  await page.click('#save-order');
  await page.waitForSelector('.order-card');

  section('۵) صفحه‌ی جزئیات پس از ثبت');
  check('مانده = ۴۷۰,۰۰۰', (await page.locator('.balance-box .value').textContent()).includes('۴۷۰,۰۰۰'));
  check('بدهکار با رنگ گرم', (await page.locator('.balance-box').getAttribute('class')).includes('debt'));
  check('یک سفارش باز', await page.locator('.order-card').count() === 1);
  check('اقلام سفارش درست', (await page.locator('.order-items').first().textContent()).includes('نوکاو (همراه یک چایی) × ۲'));
  check('تعداد نفر نمایش داده شد', (await page.locator('.order-items').first().textContent()).includes('۳ نفر'));
  await page.screenshot({ path: path.join(SHOTS, '04-employer-detail.png') });

  section('۶) ثبت سفارش دوم در تاریخ گذشته');
  await page.click('#new-order');
  await page.click('#date-btn');
  await page.waitForSelector('.cal-grid');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SHOTS, '05-date-picker.png') });
  await page.click('.cal-nav[data-nav="-1"]');           // ماه قبل
  await page.locator('.cal-day:not(.blank)').nth(9).click(); // روز ۱۰ ماه قبل
  const pickedLabel = await page.locator('#date-label').textContent();
  check('تاریخ گذشته انتخاب شد', pickedLabel.includes('۱۰'), pickedLabel);
  await plus('لوبیا', 2);
  check('جمع = ۳۸۰,۰۰۰', (await page.locator('#live-total').textContent()).includes('۳۸۰,۰۰۰'));
  await page.click('#save-order');
  await page.waitForSelector('.order-card');
  check('مانده = ۸۵۰,۰۰۰', (await page.locator('.balance-box .value').textContent()).includes('۸۵۰,۰۰۰'));
  check('دو سفارش باز', await page.locator('.order-card').count() === 2);
  check('سفارش جدیدتر اول فهرست است', (await page.locator('.order-card .order-head .total').first().textContent()).includes('۴۷۰,۰۰۰'));

  section('۷) ویرایش سفارش');
  await page.locator('[data-edit-order]').first().click();
  await page.waitForSelector('.counter-card');
  check('مقدار نوکاو از قبل پر است', (await page.locator('.counter-card', { hasText: 'نوکاو' }).first().locator('.qty-input').inputValue()) === '۲');
  await plus('لوبیا', 1);
  check('جمع ویرایش = ۶۶۰,۰۰۰', (await page.locator('#live-total').textContent()).includes('۶۶۰,۰۰۰'));
  await page.click('#save-order');
  await page.waitForSelector('.balance-box');
  check('مانده پس از ویرایش = ۱,۰۴۰,۰۰۰', (await page.locator('.balance-box .value').textContent()).includes('۱,۰۴۰,۰۰۰'));

  section('۸) جستجو در صفحه‌ی اصلی');
  await page.click('[data-back]');
  await page.waitForSelector('#search');
  check('مجموع مطالبات = ۱,۰۴۰,۰۰۰', (await page.locator('.summary .value').textContent()).includes('۱,۰۴۰,۰۰۰'));
  await page.click('[data-add-employer]');
  await page.fill('#f-name', 'آهنگری برادران');
  await page.fill('[data-phone="0"]', '09127776655');
  await page.click('#save');
  await page.waitForSelector('.balance-box');
  await page.click('[data-back]');
  await page.waitForSelector('#search');
  check('دو صاحب‌کار در فهرست', await page.locator('.row-card').count() === 2);
  check('مرتب الفبایی (آهنگری اول)', (await page.locator('.row-card .name').first().textContent()) === 'آهنگری برادران');

  await page.fill('#search', 'رضا');
  check('جستجو با نام', await page.locator('.row-card').count() === 1);
  await page.fill('#search', 'اکبر');
  check('جستجو با نام استادکار', (await page.locator('.row-card .name').first().textContent()) === 'حاج رضا تعمیرگاه');
  await page.fill('#search', '5555');
  check('جستجو با شماره‌ی دوم صاحب‌کار', (await page.locator('.row-card .name').first().textContent()) === 'حاج رضا تعمیرگاه');
  await page.fill('#search', '۹۳۳۹');
  check('جستجو با شماره‌ی استادکار و رقم فارسی', (await page.locator('.row-card .name').first().textContent()) === 'حاج رضا تعمیرگاه');
  await page.fill('#search', 'هیچ‌کس');
  check('نتیجه‌ی خالی پیام می‌دهد', (await page.locator('.empty').textContent()).includes('پیدا نشد'));
  await page.fill('#search', '');
  await page.screenshot({ path: path.join(SHOTS, '06-home-list.png') });

  section('۹) تسویه حساب');
  await page.locator('.row-card', { hasText: 'حاج رضا' }).click();
  await page.waitForSelector('#settle');
  await page.click('#settle');
  await page.waitForSelector('.dialog');
  check('تاییدیه مبلغ را نشان می‌دهد', (await page.locator('.dialog .emph').textContent()).includes('۱,۰۴۰,۰۰۰'));
  check('تاییدیه می‌پرسد مطمئنید', (await page.locator('.dialog').textContent()).includes('مطمئنید'));
  await page.screenshot({ path: path.join(SHOTS, '07-settle-confirm.png') });
  await page.click('.dialog [data-act="yes"]');
  await page.waitForSelector('.balance-box.zero');
  check('حساب صفر شد', (await page.locator('.balance-box').getAttribute('class')).includes('zero'));
  check('سفارش باز نمانده', await page.locator('.order-card').count() === 0);
  check('یک دسته در تاریخچه', await page.locator('.settle-card').count() === 1);
  check('مبلغ تاریخچه درست', (await page.locator('.settle-card .total').textContent()).includes('۱,۰۴۰,۰۰۰'));

  await openSettlementDetails(page);
  check('جزئیات دسته: دو سفارش', await page.locator('.settle-body .line').count() === 2);
  await page.screenshot({ path: path.join(SHOTS, '08-settlement-history.png') });

  section('۱۰) ماندگاری قیمت پس از تغییر در تنظیمات');
  await page.click('[data-back]');
  await page.waitForSelector('#search');
  await page.click('[data-nav-settings]');
  await page.waitForSelector('#menu-card');
  await page.locator('[data-edit-item]').first().click();
  await page.waitForSelector('#mi-price');
  await page.fill('#mi-price', '200000');
  await page.click('.dialog [data-act="yes"]');
  await page.waitForSelector('#menu-card');
  check('قیمت جدید در تنظیمات', (await page.locator('.mi-price').first().textContent()).includes('۲۰۰,۰۰۰'));
  await page.click('[data-back]');
  await page.locator('.row-card', { hasText: 'حاج رضا' }).click();
  await openSettlementDetails(page);
  check('حساب تسویه‌شده‌ی قبلی دست‌نخورده مانده', (await page.locator('.settle-card .total').textContent()).includes('۱,۰۴۰,۰۰۰'));

  section('۱۱) افزودن قلم جدید و ظاهر شدن خودکارش در فرم سفارش');
  await page.click('[data-back]');
  await page.click('[data-nav-settings]');
  await page.waitForSelector('#add-item');
  await page.click('#add-item');
  await page.fill('#mi-name', 'عدسی');
  await page.fill('#mi-price', '160000');
  await page.click('.dialog [data-act="yes"]');
  await page.waitForSelector('#menu-card');
  check('پنج قلم در تنظیمات', await page.locator('.menu-item-row').count() === 5);
  await page.screenshot({ path: path.join(SHOTS, '09-settings.png') });
  await page.click('[data-back]');
  await page.locator('.row-card', { hasText: 'آهنگری' }).click();
  await page.click('#new-order');
  await page.waitForSelector('.counter-card');
  check('قلم جدید خودکار در فرم سفارش هست', await page.locator('.counter-card').count() === 5);
  await plus('عدسی', 2);
  check('جمع با قلم جدید = ۳۲۰,۰۰۰', (await page.locator('#live-total').textContent()).includes('۳۲۰,۰۰۰'));
  await page.click('#save-order');
  await page.waitForSelector('.balance-box.debt');

  section('۱۲) حذف سفارش با تاییدیه');
  await page.locator('[data-delete-order]').first().click();
  await page.waitForSelector('.dialog');
  check('تاییدیه‌ی حذف مبلغ را نشان می‌دهد', (await page.locator('.dialog .emph').textContent()).includes('۳۲۰,۰۰۰'));
  await page.click('.dialog [data-act="no"]');
  check('انصراف کار می‌کند؛ سفارش سرجایش است', await page.locator('.order-card').count() === 1);
  await page.locator('[data-delete-order]').first().click();
  await page.waitForSelector('.dialog');
  await page.click('.dialog [data-act="yes"]');
  await page.waitForSelector('.balance-box.zero');
  check('سفارش حذف شد و حساب صفر شد', await page.locator('.order-card').count() === 0);

  section('۱۳) پشتیبان‌گیری دستی: دانلود فایل اکسل و فایل بازیابی');
  await page.click('[data-back]');
  await page.click('[data-nav-settings]');
  await page.waitForSelector('#backup-now');
  const downloads = [];
  page.on('download', d => downloads.push(d));
  await page.click('#backup-now');
  await page.waitForTimeout(2500);
  check('دو فایل دانلود شد', downloads.length === 2, 'تعداد: ' + downloads.length);
  const names = downloads.map(d => d.suggestedFilename());
  check('فایل اکسل ساخته شد', names.some(n => n.endsWith('.xlsx')), names.join(' , '));
  check('فایل بازیابی ساخته شد', names.some(n => n.endsWith('.json')), names.join(' , '));
  const xlsxDl = downloads.find(d => d.suggestedFilename().endsWith('.xlsx'));
  const xlsxPath = path.join(SHOTS, '..', 'tools', '_backup.xlsx');
  await xlsxDl.saveAs(xlsxPath);
  check('فایل اکسل خالی نیست', fs.statSync(xlsxPath).size > 2000);
  const jsonDl = downloads.find(d => d.suggestedFilename().endsWith('.json'));
  const jsonPath = path.join(SHOTS, '..', 'tools', '_backup.json');
  await jsonDl.saveAs(jsonPath);
  const backup = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  check('فایل بازیابی شامل ۲ صاحب‌کار', backup.employers.length === 2);
  check('فایل بازیابی شامل تسویه', backup.settlements.length === 1);
  check('خط «آخرین پشتیبان‌گیری» به‌روز شد', (await page.locator('.card .info-line').first().textContent()).includes('امروز'));

  section('۱۴) بازیابی از فایل پشتیبان');
  await page.locator('.row-card').first().isVisible().catch(() => {});
  await page.setInputFiles('#restore-file', jsonPath);
  await page.waitForSelector('.dialog');
  check('تاییدیه‌ی بازیابی تعداد را می‌گوید', (await page.locator('.dialog').textContent()).includes('۲'));
  await page.click('.dialog [data-act="yes"]');
  await page.waitForSelector('#search');
  check('بعد از بازیابی، دو صاحب‌کار هست', await page.locator('.row-card').count() === 2);

  section('۱۵) تغییر ارقام به لاتین');
  await page.click('[data-nav-settings]');
  await page.waitForSelector('#digits-toggle');
  await page.click('#digits-toggle');
  await page.waitForTimeout(200);
  await page.click('[data-back]');
  await page.waitForSelector('.summary');
  check('اعداد لاتین شدند', /[0-9]/.test(await page.locator('.summary .value').textContent()));
  await page.click('[data-nav-settings]');
  await page.click('#digits-toggle');
  await page.waitForTimeout(200);
  await page.click('[data-back]');
  await page.waitForSelector('.summary');
  check('برگشت به ارقام فارسی', /[۰-۹]/.test(await page.locator('.summary .value').textContent()));

  section('۱۶) آزمون آفلاین (شبیه‌سازی خاموش‌بودن اینترنت)');
  const swReady = await page.evaluate(() => navigator.serviceWorker.ready.then(r => !!r.active));
  check('سرویس‌ورکر فعال است', swReady);
  const cached = await page.evaluate(async () => {
    const names = await caches.keys();
    const c = await caches.open(names[0]);
    return (await c.keys()).length;
  });
  check('فایل‌های اپ کش شدند', cached >= 15, 'تعداد: ' + cached);

  await context.setOffline(true);
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('.summary', { timeout: 10000 });
  check('اپ در حالت آفلاین باز شد', await page.locator('.topbar h1').textContent() === 'دفتر قرض');
  check('آفلاین: اطلاعات قبلی سرجایشان هستند', await page.locator('.row-card').count() === 2);
  check('آفلاین: فونت فارسی هم از کش آمد', await page.evaluate(() => document.fonts.check('16px Vazirmatn')));
  await page.screenshot({ path: path.join(SHOTS, '10-offline.png') });

  await page.locator('.row-card', { hasText: 'حاج رضا' }).click();
  await page.click('#new-order');
  await page.waitForSelector('.counter-card');
  await plus('املت', 2);
  check('آفلاین: جمع زنده کار می‌کند = ۳۴۰,۰۰۰', (await page.locator('#live-total').textContent()).includes('۳۴۰,۰۰۰'));
  await page.click('#save-order');
  await page.waitForSelector('.balance-box.debt');
  check('آفلاین: سفارش جدید ذخیره شد', (await page.locator('.balance-box .value').textContent()).includes('۳۴۰,۰۰۰'));

  // بستن و باز کردن دوباره‌ی اپ، همچنان بدون اینترنت
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('.balance-box', { timeout: 10000 });
  check('آفلاین: بعد از باز و بسته کردن، همان صفحه باز می‌شود', (await page.locator('.topbar h1').textContent()) === 'حاج رضا تعمیرگاه');
  check('آفلاین: سفارش تازه سرجایش مانده', (await page.locator('.balance-box .value').textContent()).includes('۳۴۰,۰۰۰'));
  await page.click('[data-back]');
  await page.waitForSelector('.summary');
  check('آفلاین: مجموع مطالبات در صفحه‌ی اصلی درست است', (await page.locator('.summary .value').textContent()).includes('۳۴۰,۰۰۰'));
  await context.setOffline(false);

  section('۱۷) پشتیبان‌گیری خودکار هفتگی (بدون فشردن هیچ دکمه‌ای)');
  // وانمود می‌کنیم ۸ روز از پشتیبان قبلی گذشته است
  await page.evaluate(() => {
    window.Store.updateSettings({ lastBackupAt: Date.now() - 8 * 24 * 60 * 60 * 1000 });
  });
  downloads.length = 0;
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('.summary');
  await page.waitForTimeout(2500);
  const beforeTap = downloads.length;
  await page.click('body', { position: { x: 5, y: 300 } }); // اولین لمس کاربر
  await page.waitForTimeout(3000);
  // بسته به سیاست مرورگر، دانلود یا بلافاصله انجام می‌شود یا تا اولین لمس صبر می‌کند؛
  // مهم این است که در هر دو حالت دقیقاً دو فایل ساخته شود و هیچ‌کدام دو بار دانلود نشود.
  check('پشتیبان هفتگی بدون فشردن هیچ دکمه‌ای ساخته شد', downloads.length === 2,
    'قبل از لمس: ' + beforeTap + '، بعد از لمس: ' + downloads.length);
  const autoNames = downloads.map(d => d.suggestedFilename()).sort();
  check('پشتیبان خودکار شامل فایل اکسل', autoNames.some(n => n.endsWith('.xlsx')), autoNames.join(' , '));
  check('پشتیبان خودکار شامل فایل بازیابی', autoNames.some(n => n.endsWith('.json')), autoNames.join(' , '));
  const notDue = await page.evaluate(() => window.Backup.isDue());
  check('پس از پشتیبان‌گیری، تا هفته‌ی بعد دیگر تکرار نمی‌شود', notDue === false);

  section('۱۸) خطاهای جاوااسکریپت');
  check('هیچ خطای اجرایی رخ نداد', errors.length === 0, errors.slice(0, 3).join(' | '));

  await browser.close();

  console.log('\n────────────────────────────');
  console.log('موفق: ' + passed + '   ناموفق: ' + failed);
  process.exit(failed ? 1 : 0);
})().catch(err => {
  console.error('\nآزمون با خطا متوقف شد:', err);
  process.exit(1);
});
