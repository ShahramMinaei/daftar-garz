/* لایه‌ی ذخیره‌سازی محلی. همه‌چیز در localStorage همین گوشی می‌ماند؛ هیچ سروری در کار نیست. */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'daftar-qarz/data';
  var SCHEMA = 1;

  var DEFAULT_MENU = [
    { id: 'item-nokav', name: 'نوکاو (همراه یک چایی)', price: 140000, active: true },
    { id: 'item-chai', name: 'چایی اضافه (هر عدد)', price: 20000, active: true },
    { id: 'item-omlet', name: 'املت', price: 170000, active: true },
    { id: 'item-lubia', name: 'لوبیا', price: 190000, active: true }
  ];

  function newId(prefix) {
    return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  function emptyState() {
    return {
      schema: SCHEMA,
      employers: [],
      menuItems: DEFAULT_MENU.map(function (m) { return Object.assign({}, m); }),
      orders: [],
      settlements: [],
      settings: {
        shopName: 'چایخانه سه‌رچاوه', // نام کسب‌وکار، در صفحه‌ی اصلی و پشتیبان‌ها نشان داده می‌شود
        digits: 'fa',              // «fa» = ارقام فارسی، «en» = ارقام لاتین
        telegramToken: '',
        telegramChatId: '',
        lastBackupAt: null,        // زمان آخرین پشتیبان‌گیری (میلی‌ثانیه)
        backupIntervalDays: 7
      }
    };
  }

  var state = null;
  var listeners = [];

  function normalize(raw) {
    var base = emptyState();
    if (!raw || typeof raw !== 'object') return base;
    var s = {
      schema: SCHEMA,
      employers: Array.isArray(raw.employers) ? raw.employers : [],
      menuItems: Array.isArray(raw.menuItems) && raw.menuItems.length ? raw.menuItems : base.menuItems,
      orders: Array.isArray(raw.orders) ? raw.orders : [],
      settlements: Array.isArray(raw.settlements) ? raw.settlements : [],
      settings: Object.assign(base.settings, raw.settings || {})
    };
    s.employers.forEach(function (e) {
      e.id = e.id || newId('emp');
      e.name = e.name || '';
      e.phones = Array.isArray(e.phones) ? e.phones.filter(Boolean) : [];
      e.notes = e.notes || '';
      e.foremanName = e.foremanName || '';
      e.foremanPhone = e.foremanPhone || '';
    });
    s.menuItems.forEach(function (m) {
      m.id = m.id || newId('item');
      m.price = Number(m.price) || 0;
      m.active = m.active !== false;
    });
    s.orders.forEach(function (o) {
      o.id = o.id || newId('ord');
      o.lines = Array.isArray(o.lines) ? o.lines : [];
      o.people = Number(o.people) || 0;
      o.total = Number(o.total) || computeTotal(o.lines);
      o.settlementId = o.settlementId || null;
    });
    return s;
  }

  function load() {
    var raw = null;
    try {
      var text = global.localStorage.getItem(STORAGE_KEY);
      if (text) raw = JSON.parse(text);
    } catch (err) {
      console.warn('خواندن اطلاعات ذخیره‌شده ناموفق بود:', err);
    }
    state = normalize(raw);
    return state;
  }

  function persist() {
    try {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (err) {
      console.error('ذخیره‌سازی ناموفق بود:', err);
      return false;
    }
  }

  function commit() {
    var ok = persist();
    listeners.forEach(function (fn) { fn(state); });
    return ok;
  }

  function subscribe(fn) { listeners.push(fn); }

  function get() {
    if (!state) load();
    return state;
  }

  /* ---------- محاسبه ---------- */

  function computeTotal(lines) {
    return (lines || []).reduce(function (sum, l) {
      return sum + (Number(l.price) || 0) * (Number(l.qty) || 0);
    }, 0);
  }

  function openOrdersOf(employerId) {
    return get().orders
      .filter(function (o) { return o.employerId === employerId && !o.settlementId; })
      .sort(function (a, b) { return b.dateKey.localeCompare(a.dateKey) || b.createdAt - a.createdAt; });
  }

  function openBalanceOf(employerId) {
    return openOrdersOf(employerId).reduce(function (s, o) { return s + o.total; }, 0);
  }

  function totalReceivables() {
    return get().employers.reduce(function (s, e) { return s + openBalanceOf(e.id); }, 0);
  }

  function settlementsOf(employerId) {
    return get().settlements
      .filter(function (s) { return s.employerId === employerId; })
      .sort(function (a, b) { return b.dateKey.localeCompare(a.dateKey) || b.createdAt - a.createdAt; });
  }

  function ordersOfSettlement(settlementId) {
    return get().orders
      .filter(function (o) { return o.settlementId === settlementId; })
      .sort(function (a, b) { return a.dateKey.localeCompare(b.dateKey); });
  }

  /* ---------- کارفرما ---------- */

  function employerById(id) {
    return get().employers.find(function (e) { return e.id === id; }) || null;
  }

  function saveEmployer(data) {
    var s = get();
    if (data.id) {
      var idx = s.employers.findIndex(function (e) { return e.id === data.id; });
      if (idx >= 0) s.employers[idx] = Object.assign({}, s.employers[idx], data);
    } else {
      data.id = newId('emp');
      data.createdAt = Date.now();
      s.employers.push(data);
    }
    commit();
    return data.id;
  }

  function deleteEmployer(id) {
    var s = get();
    s.employers = s.employers.filter(function (e) { return e.id !== id; });
    s.orders = s.orders.filter(function (o) { return o.employerId !== id; });
    s.settlements = s.settlements.filter(function (x) { return x.employerId !== id; });
    commit();
  }

  /* ---------- سفارش ---------- */

  function orderById(id) {
    return get().orders.find(function (o) { return o.id === id; }) || null;
  }

  /* قیمت هر قلم به‌صورت «عکس لحظه‌ای» داخل خود سفارش ذخیره می‌شود،
     تا تغییر بعدی قیمت‌ها در تنظیمات روی حساب‌های قبلی اثری نگذارد. */
  function saveOrder(data) {
    var s = get();
    var lines = (data.lines || [])
      .filter(function (l) { return Number(l.qty) > 0; })
      .map(function (l) {
        return { itemId: l.itemId, name: l.name, price: Number(l.price) || 0, qty: Number(l.qty) || 0 };
      });
    var record = {
      id: data.id || newId('ord'),
      employerId: data.employerId,
      dateKey: data.dateKey,
      people: Number(data.people) || 0,
      lines: lines,
      total: computeTotal(lines),
      settlementId: null,
      createdAt: data.createdAt || Date.now()
    };
    var idx = data.id ? s.orders.findIndex(function (o) { return o.id === data.id; }) : -1;
    if (idx >= 0) {
      record.settlementId = s.orders[idx].settlementId; // سفارش تسویه‌شده در همان دسته می‌ماند
      s.orders[idx] = record;
    } else {
      s.orders.push(record);
    }
    commit();
    return record.id;
  }

  function deleteOrder(id) {
    var s = get();
    s.orders = s.orders.filter(function (o) { return o.id !== id; });
    commit();
  }

  /* ---------- تسویه ---------- */

  function settle(employerId, dateKey) {
    var s = get();
    var open = openOrdersOf(employerId);
    if (!open.length) return null;
    var record = {
      id: newId('stl'),
      employerId: employerId,
      dateKey: dateKey,
      total: open.reduce(function (sum, o) { return sum + o.total; }, 0),
      orderCount: open.length,
      createdAt: Date.now()
    };
    open.forEach(function (o) { o.settlementId = record.id; });
    s.settlements.push(record);
    commit();
    return record;
  }

  /* بازگرداندن یک تسویه: سفارش‌هایش دوباره به حساب باز برمی‌گردند */
  function undoSettlement(settlementId) {
    var s = get();
    s.orders.forEach(function (o) {
      if (o.settlementId === settlementId) o.settlementId = null;
    });
    s.settlements = s.settlements.filter(function (x) { return x.id !== settlementId; });
    commit();
  }

  /* ---------- قلم‌های منو ---------- */

  function activeMenuItems() {
    return get().menuItems.filter(function (m) { return m.active !== false; });
  }

  function saveMenuItem(data) {
    var s = get();
    if (data.id) {
      var idx = s.menuItems.findIndex(function (m) { return m.id === data.id; });
      if (idx >= 0) s.menuItems[idx] = Object.assign({}, s.menuItems[idx], data);
    } else {
      s.menuItems.push({ id: newId('item'), name: data.name, price: Number(data.price) || 0, active: true });
    }
    commit();
  }

  function deleteMenuItem(id) {
    var s = get();
    s.menuItems = s.menuItems.filter(function (m) { return m.id !== id; });
    commit();
  }

  function updateSettings(patch) {
    Object.assign(get().settings, patch);
    commit();
  }

  /* ---------- پشتیبان ---------- */

  function exportData() {
    return JSON.parse(JSON.stringify(get()));
  }

  function importData(raw) {
    state = normalize(raw);
    commit();
  }

  global.Store = {
    STORAGE_KEY: STORAGE_KEY,
    newId: newId,
    load: load,
    get: get,
    subscribe: subscribe,
    commit: commit,
    computeTotal: computeTotal,
    openOrdersOf: openOrdersOf,
    openBalanceOf: openBalanceOf,
    totalReceivables: totalReceivables,
    settlementsOf: settlementsOf,
    ordersOfSettlement: ordersOfSettlement,
    employerById: employerById,
    saveEmployer: saveEmployer,
    deleteEmployer: deleteEmployer,
    orderById: orderById,
    saveOrder: saveOrder,
    deleteOrder: deleteOrder,
    settle: settle,
    undoSettlement: undoSettlement,
    activeMenuItems: activeMenuItems,
    saveMenuItem: saveMenuItem,
    deleteMenuItem: deleteMenuItem,
    updateSettings: updateSettings,
    exportData: exportData,
    importData: importData
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
