/* آزمون منطق محاسبه، تسویه و ماندگاری قیمت‌ها — بدون نیاز به مرورگر.
   اجرا:  node tools/test-logic.js */

// جایگزین ساده‌ی localStorage
var mem = {};
globalThis.localStorage = {
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
  setItem: function (k, v) { mem[k] = String(v); },
  removeItem: function (k) { delete mem[k]; }
};

require('../js/jalali.js');
require('../js/store.js');

var J = globalThis.Jalali;
var Store = globalThis.Store;

var passed = 0, failed = 0;

function check(label, actual, expected) {
  var ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { passed++; console.log('  ✓ ' + label); }
  else { failed++; console.log('  ✗ ' + label + '\n      انتظار: ' + JSON.stringify(expected) + '\n      نتیجه:  ' + JSON.stringify(actual)); }
}

function section(t) { console.log('\n' + t); }

Store.load();
var menu = {};
Store.get().menuItems.forEach(function (m) { menu[m.name] = m; });

var NOKAV = menu['نوکاو (همراه یک چایی)'];
var CHAI = menu['چایی اضافه (هر عدد)'];
var OMLET = menu['املت'];
var LUBIA = menu['لوبیا'];

section('۱) قیمت‌های پیش‌فرض منو');
check('نوکاو', NOKAV.price, 140000);
check('چایی اضافه', CHAI.price, 20000);
check('املت', OMLET.price, 170000);
check('لوبیا', LUBIA.price, 190000);

function line(item, qty) {
  return { itemId: item.id, name: item.name, price: item.price, qty: qty };
}

section('۲) مثال خود پرامپت: ۲ نوکاو + ۱ چایی اضافه + ۱ املت');
var ex1 = [line(NOKAV, 2), line(CHAI, 1), line(OMLET, 1)];
check('(۲×۱۴۰٬۰۰۰) + (۱×۲۰٬۰۰۰) + (۱×۱۷۰٬۰۰۰) = ۴۷۰٬۰۰۰', Store.computeTotal(ex1), 470000);

section('۳) دو مثال دیگر');
check('۳ لوبیا + ۲ چایی = ۵۷۰٬۰۰۰+۴۰٬۰۰۰ = ۶۱۰٬۰۰۰', Store.computeTotal([line(LUBIA, 3), line(CHAI, 2)]), 610000);
check('۱ از هر چهار قلم = ۵۲۰٬۰۰۰', Store.computeTotal([line(NOKAV, 1), line(CHAI, 1), line(OMLET, 1), line(LUBIA, 1)]), 520000);
check('سفارش خالی = ۰', Store.computeTotal([]), 0);
check('۱۰ نوکاو + ۷ املت = ۱٬۴۰۰٬۰۰۰+۱٬۱۹۰٬۰۰۰ = ۲٬۵۹۰٬۰۰۰', Store.computeTotal([line(NOKAV, 10), line(OMLET, 7)]), 2590000);

section('۴) ثبت سفارش و مانده‌ی حساب باز');
var empId = Store.saveEmployer({ name: 'حاج رضا تعمیرگاه', phones: ['09121234567', '02155551111'], foremanName: 'مشهدی اکبر', foremanPhone: '09339998877', notes: 'کنار بانک' });
var emp2 = Store.saveEmployer({ name: 'آهنگری برادران', phones: ['09127776655'], foremanName: '', foremanPhone: '', notes: '' });

var d1 = J.toKey({ jy: 1405, jm: 5, jd: 20 });
var d2 = J.toKey({ jy: 1405, jm: 5, jd: 21 });

var o1 = Store.saveOrder({ employerId: empId, dateKey: d1, people: 3, lines: ex1 });
check('مبلغ سفارش اول', Store.orderById(o1).total, 470000);

Store.saveOrder({ employerId: empId, dateKey: d2, people: 2, lines: [line(LUBIA, 2)] });
check('مانده‌ی حساب باز کارفرمای اول', Store.openBalanceOf(empId), 470000 + 380000);

Store.saveOrder({ employerId: emp2, dateKey: d1, people: 1, lines: [line(OMLET, 1)] });
check('مانده‌ی کارفرمای دوم', Store.openBalanceOf(emp2), 170000);
check('مجموع کل مطالبات', Store.totalReceivables(), 850000 + 170000);

section('۵) قلم‌های با تعداد صفر ذخیره نمی‌شوند');
var o3 = Store.saveOrder({ employerId: emp2, dateKey: d2, people: 1, lines: [line(NOKAV, 1), line(CHAI, 0), line(LUBIA, 0)] });
check('فقط یک سطر ذخیره شد', Store.orderById(o3).lines.length, 1);
check('مبلغ همان نوکاو است', Store.orderById(o3).total, 140000);
Store.deleteOrder(o3);

section('۶) «عکس لحظه‌ای» قیمت: تغییر قیمت در تنظیمات نباید حساب‌های قبلی را عوض کند');
Store.saveMenuItem({ id: NOKAV.id, price: 200000 });
check('قیمت جدید منو', Store.get().menuItems.find(function (m) { return m.id === NOKAV.id; }).price, 200000);
check('مبلغ سفارش قدیمی دست‌نخورده', Store.orderById(o1).total, 470000);
check('قیمت داخل سطر سفارش قدیمی', Store.orderById(o1).lines[0].price, 140000);
check('مانده‌ی حساب باز تغییر نکرد', Store.openBalanceOf(empId), 850000);
Store.saveMenuItem({ id: NOKAV.id, price: 140000 });

section('۷) ویرایش سفارش');
Store.saveOrder({ id: o1, employerId: empId, dateKey: d1, people: 4, lines: [line(NOKAV, 2), line(CHAI, 1), line(OMLET, 1), line(LUBIA, 1)] });
check('مبلغ پس از ویرایش', Store.orderById(o1).total, 660000);
check('تعداد نفر به‌روز شد', Store.orderById(o1).people, 4);
check('مانده‌ی جدید', Store.openBalanceOf(empId), 660000 + 380000);

section('۸) تسویه حساب');
var settleDate = J.toKey({ jy: 1405, jm: 5, jd: 25 });
var stl = Store.settle(empId, settleDate);
check('مبلغ دسته‌ی تسویه', stl.total, 1040000);
check('تعداد روزهای تسویه‌شده', stl.orderCount, 2);
check('حساب باز صفر شد', Store.openBalanceOf(empId), 0);
check('سفارش‌های باز خالی شد', Store.openOrdersOf(empId).length, 0);
check('تاریخچه یک دسته دارد', Store.settlementsOf(empId).length, 1);
check('جزئیات دسته‌ی تسویه', Store.ordersOfSettlement(stl.id).length, 2);
check('مجموع مطالبات فقط کارفرمای دوم', Store.totalReceivables(), 170000);

section('۹) سفارش جدید بعد از تسویه به حساب باز تازه می‌رود');
Store.saveOrder({ employerId: empId, dateKey: settleDate, people: 1, lines: [line(CHAI, 5)] });
check('مانده‌ی حساب باز جدید', Store.openBalanceOf(empId), 100000);
check('تاریخچه هنوز دست‌نخورده', Store.settlementsOf(empId)[0].total, 1040000);

section('۱۰) برگرداندن تسویه');
Store.undoSettlement(stl.id);
check('مانده پس از برگرداندن', Store.openBalanceOf(empId), 100000 + 1040000);
check('تاریخچه خالی شد', Store.settlementsOf(empId).length, 0);

section('۱۱) حذف کارفرما، سفارش‌هایش را هم پاک می‌کند');
var before = Store.get().orders.length;
Store.deleteEmployer(empId);
check('کارفرما حذف شد', Store.employerById(empId), null);
check('سفارش‌هایش هم پاک شدند', Store.get().orders.length, before - 3);
check('کارفرمای دیگر دست‌نخورده', Store.openBalanceOf(emp2), 170000);

section('۱۲) ماندگاری روی حافظه‌ی محلی');
var raw = JSON.parse(mem['daftar-qarz/data']);
check('اطلاعات در حافظه نوشته شده', raw.employers.length, 1);
Store.load();
check('پس از بارگذاری مجدد، مانده حفظ شده', Store.openBalanceOf(emp2), 170000);

section('۱۳) قالب‌بندی عدد و تاریخ');
check('جداکننده‌ی هزارگان', J.groupThousands(470000), '470,000');
check('ارقام فارسی', J.toFaDigits('1,040,000'), '۱,۰۴۰,۰۰۰');
check('کلید تاریخ', J.toKey({ jy: 1405, jm: 5, jd: 7 }), '1405/05/07');
check('مرتب‌سازی کلید تاریخ', ['1405/05/07', '1404/12/29', '1405/01/01'].sort().join('|'), '1404/12/29|1405/01/01|1405/05/07');

console.log('\n────────────────────────────');
console.log('موفق: ' + passed + '   ناموفق: ' + failed);
process.exit(failed ? 1 : 0);
