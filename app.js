
const APP_KEY = 'jood-kids-sales-pro-v5';

const state = {
  route: 'dashboard',
  viewParams: {},
  currentUserId: null,
  deferredPrompt: null,
  importTarget: null,
  cameraStream: null,
  cameraLoopTimer: null,
  scannerOpen: false,
  lookupResolved: null,
  data: loadData(),
  draftInvoice: null
};

function uid() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}
function today() { return new Date().toISOString().slice(0, 10); }
function money(n) {
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n || 0));
}
function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}
function cleanDigits(v) { return String(v || '').replace(/\D/g, ''); }
function deriveSeriesBarcode(pieceBarcode, seriesQty) {
  const clean = cleanDigits(pieceBarcode);
  return clean ? `${clean}${String(seriesQty || 0).padStart(2, '0')}` : '';
}
function normalizeRole(role) { return ['admin', 'sales', 'viewer'].includes(role) ? role : 'sales'; }
function downloadBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1200);
}
function customerById(id) { return state.data.customers.find((c) => c.id === id) || null; }
function itemById(id) { return state.data.items.find((i) => i.id === id) || null; }
function invoiceById(id) { return state.data.invoices.find((inv) => inv.id === id) || null; }
function userById(id) { return state.data.users.find((u) => u.id === id) || null; }
function currentUser() { return userById(state.currentUserId) || state.data.users[0] || null; }
function isAdmin() { return currentUser()?.role === 'admin'; }
function canEdit() { return currentUser()?.role !== 'viewer'; }
function nextInvoiceNumber() {
  const value = state.data.counters.invoice;
  state.data.counters.invoice += 1;
  return `INV-${new Date().getFullYear()}-${String(value).padStart(5, '0')}`;
}
function nextItemCode() {
  const value = state.data.counters.item;
  state.data.counters.item += 1;
  return String(value);
}
function createEmptyInvoice() {
  return finalizeInvoice({
    id: uid(),
    number: nextInvoiceNumber(),
    date: today(),
    customerId: '',
    lines: [],
    discountMode: 'value',
    discountValue: 0,
    subTotal: 0,
    discountAmount: 0,
    total: 0
  });
}
function ensureDraft() { if (!state.draftInvoice) state.draftInvoice = createEmptyInvoice(); }
function finalizeInvoice(inv) {
  inv.lines = (inv.lines || []).map((line, index) => {
    const qty = Math.max(1, Number(line.qty || 1));
    const unitPrice = Number(line.unitPrice || 0);
    return {
      id: line.id || uid(),
      seq: index + 1,
      itemId: line.itemId || '',
      barcode: String(line.barcode || ''),
      name: String(line.name || ''),
      unit: String(line.unit || 'قطعة'),
      qty,
      unitPrice,
      total: qty * unitPrice
    };
  });
  inv.subTotal = inv.lines.reduce((sum, line) => sum + Number(line.total || 0), 0);
  inv.discountMode = inv.discountMode === 'percent' ? 'percent' : 'value';
  inv.discountValue = Number(inv.discountValue || 0);
  inv.discountAmount = inv.discountMode === 'percent' ? inv.subTotal * inv.discountValue / 100 : inv.discountValue;
  inv.discountAmount = Math.max(0, inv.discountAmount);
  inv.total = Math.max(0, inv.subTotal - inv.discountAmount);
  return inv;
}
function defaultData() {
  return {
    company: {
      name: 'JOOD KIDS',
      city: 'الاسكندرية',
      address: 'الاسكندرية - مصر',
      phone: '+20 100 555 7788',
      tax: 'TX-220055',
      logoText: 'JOOD\nKIDS',
      logoUrl: ''
    },
    customers: [],
    items: [],
    invoices: [],
    users: [
      { id: uid(), name: 'Admin JOOD', email: 'admin@erp-pro.local', role: 'admin', active: true, firebaseUid: 'JxKXouwjdadht4wSMPf1qtbeW9n1' },
      { id: uid(), name: 'Sales One', email: 'sales1@joodkids.local', role: 'sales', active: true },
      { id: uid(), name: 'Viewer', email: 'viewer@joodkids.local', role: 'viewer', active: true }
    ],
    counters: { item: 1001, invoice: 1 }
  };
}
function loadData() {
  try {
    const raw = localStorage.getItem(APP_KEY);
    if (!raw) return defaultData();
    const parsed = JSON.parse(raw);
    parsed.company = parsed.company || defaultData().company;
    parsed.customers = Array.isArray(parsed.customers) ? parsed.customers : [];
    parsed.items = Array.isArray(parsed.items) ? parsed.items : [];
    parsed.invoices = Array.isArray(parsed.invoices) ? parsed.invoices : [];
    parsed.users = Array.isArray(parsed.users) && parsed.users.length ? parsed.users : defaultData().users;
    parsed.counters = parsed.counters || { item: 1001, invoice: 1 };
    return parsed;
  } catch (error) {
    console.warn(error);
    return defaultData();
  }
}
function saveData() { localStorage.setItem(APP_KEY, JSON.stringify(state.data)); }
function itemFactory(seed) {
  return {
    id: uid(),
    code: String(seed.code || nextItemCode()),
    name: String(seed.name || ''),
    unit: String(seed.unit || 'قطعة'),
    seriesQty: Number(seed.seriesQty || 6),
    pieceBarcode: String(seed.pieceBarcode || ''),
    seriesBarcode: String(seed.seriesBarcode || deriveSeriesBarcode(seed.pieceBarcode, seed.seriesQty || 6)),
    piecePrice: Number(seed.piecePrice || 0),
    seriesPrice: Number(seed.seriesPrice || 0),
    sizes: String(seed.sizes || ''),
    stock: Number(seed.stock || 0)
  };
}
function invoiceFromSeed(customer, linesInput, discountMode, discountValue, date) {
  const lines = linesInput.map((l) => {
    const item = itemById(l.itemId) || state.data.items.find((x) => x.id === l.itemId);
    const mode = l.mode === 'series' ? 'series' : 'piece';
    const qty = Number(l.qty || 1);
    return { id: uid(), itemId: item.id, barcode: mode === 'series' ? item.seriesBarcode : item.pieceBarcode, name: item.name, unit: mode === 'series' ? `سيري ${item.seriesQty}` : item.unit, qty, unitPrice: mode === 'series' ? Number(item.seriesPrice) : Number(item.piecePrice) };
  });
  return finalizeInvoice({ id: uid(), number: `INV-2026-${String(state.data.invoices.length + 1).padStart(5, '0')}`, date, customerId: customer.id, lines, discountMode, discountValue });
}
function seedDemoData() {
  state.data = defaultData();
  state.data.company = { name: 'JOOD KIDS', city: 'الاسكندرية', address: 'منطقة الجملة - الاسكندرية - مصر', phone: '+20 100 555 7788', tax: 'TX-220055', logoText: 'JOOD\nKIDS', logoUrl: '' };
  state.data.customers = [
    { id: uid(), name: 'مؤسسة النور', phone: '01001122334', city: 'القاهرة', address: 'مدينة نصر' },
    { id: uid(), name: 'بيت الأطفال', phone: '01008877665', city: 'الاسكندرية', address: 'سيدي جابر' },
    { id: uid(), name: 'دار الأناقة', phone: '01002233445', city: 'المنصورة', address: 'شارع الجمهورية' }
  ];
  state.data.items = [
    itemFactory({ name: 'طقم ولادي صيفي', unit: 'قطعة', seriesQty: 6, pieceBarcode: '6221001100112', piecePrice: 125, seriesPrice: 750, sizes: '2-4-6-8', stock: 120 }),
    itemFactory({ name: 'فستان بناتي مطرز', unit: 'قطعة', seriesQty: 9, pieceBarcode: '6221001100211', piecePrice: 168, seriesPrice: 1512, sizes: '4-6-8-10', stock: 95 }),
    itemFactory({ name: 'بيجامة أطفال شتوي', unit: 'قطعة', seriesQty: 12, pieceBarcode: '6221001100310', piecePrice: 92, seriesPrice: 1104, sizes: '1-2-3-4', stock: 180 }),
    itemFactory({ name: 'تيشيرت قطن', unit: 'قطعة', seriesQty: 6, pieceBarcode: '6221001100419', piecePrice: 64, seriesPrice: 384, sizes: '2-4-6-8', stock: 210 })
  ];
  const c1 = state.data.customers[0];
  const c2 = state.data.customers[1];
  state.data.invoices = [
    invoiceFromSeed(c1, [{ itemId: state.data.items[0].id, mode: 'series', qty: 2 }, { itemId: state.data.items[1].id, mode: 'piece', qty: 5 }], 'percent', 7, '2026-03-25'),
    invoiceFromSeed(c2, [{ itemId: state.data.items[2].id, mode: 'series', qty: 1 }, { itemId: state.data.items[3].id, mode: 'piece', qty: 10 }], 'value', 100, '2026-03-26')
  ];
  state.data.counters.invoice = 3;
  saveData();
  state.currentUserId = state.data.users[0].id;
  state.draftInvoice = createEmptyInvoice();
  state.route = 'dashboard';
  render();
}
function navigate(route, viewParams = {}) {
  state.route = route;
  state.viewParams = viewParams;
  if (window.innerWidth <= 980) document.querySelector('.sidebar')?.classList.remove('open');
  render();
}
function metricSalesTotal() { return state.data.invoices.reduce((sum, inv) => sum + Number(inv.total || 0), 0); }
function customerTotal(customerId) { return state.data.invoices.filter((inv) => inv.customerId === customerId).reduce((sum, inv) => sum + Number(inv.total || 0), 0); }
function customerInvoiceCount(customerId) { return state.data.invoices.filter((inv) => inv.customerId === customerId).length; }
function lineModeLabel(item, mode) { return mode === 'series' ? `سيري ${item.seriesQty}` : item.unit; }
function lineBarcode(item, mode) { return mode === 'series' ? item.seriesBarcode : item.pieceBarcode; }
function linePrice(item, mode) { return mode === 'series' ? Number(item.seriesPrice) : Number(item.piecePrice); }
function findItemLookup(term) {
  const q = String(term || '').trim();
  if (!q) return null;
  const exact = state.data.items.find((i) => i.code === q || i.pieceBarcode === q || i.seriesBarcode === q);
  if (exact) return { item: exact, mode: exact.seriesBarcode === q ? 'series' : 'piece', match: exact.code === q ? 'code' : exact.pieceBarcode === q ? 'pieceBarcode' : 'seriesBarcode' };
  const starts = state.data.items.find((i) => i.code.startsWith(q) || i.pieceBarcode.startsWith(q) || i.seriesBarcode.startsWith(q));
  if (starts) return { item: starts, mode: starts.seriesBarcode.startsWith(q) ? 'series' : 'piece', match: 'startsWith' };
  const byName = state.data.items.find((i) => i.name.includes(q));
  if (byName) return { item: byName, mode: 'piece', match: 'name' };
  return null;
}
function effectiveLookupMode(requested, resolved) {
  if (!resolved) return requested === 'auto' ? 'piece' : requested;
  return requested === 'auto' ? resolved.mode : requested;
}
function addDraftLine(item, mode, qty) {
  ensureDraft();
  if (!canEdit()) return alert('ليس لديك صلاحية التعديل.');
  const quantity = Math.max(1, Number(qty || 1));
  const unit = lineModeLabel(item, mode);
  const existing = state.draftInvoice.lines.find((line) => line.itemId === item.id && line.unit === unit);
  if (existing) existing.qty += quantity;
  else state.draftInvoice.lines.push({ id: uid(), itemId: item.id, barcode: lineBarcode(item, mode), name: item.name, unit, qty: quantity, unitPrice: linePrice(item, mode) });
  finalizeInvoice(state.draftInvoice);
  render();
}
function duplicateToDraft(invoiceId) {
  const inv = invoiceById(invoiceId);
  if (!inv) return;
  state.draftInvoice = finalizeInvoice(JSON.parse(JSON.stringify({ ...inv, id: uid(), number: nextInvoiceNumber(), date: today() })));
  navigate('invoice-editor');
}
function exportXlsx(rows, fileName, sheetName = 'Sheet1') {
  if (!rows || !rows.length) return alert('لا توجد بيانات');
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, fileName);
}
function exportBackup() {
  const blob = new Blob([JSON.stringify(state.data, null, 2)], { type: 'application/json;charset=utf-8' });
  downloadBlob(blob, `jood-kids-backup-${today()}.json`);
}
function importBackup(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result || '{}'));
      if (!parsed || typeof parsed !== 'object') throw new Error('bad json');
      state.data = {
        company: parsed.company || defaultData().company,
        customers: Array.isArray(parsed.customers) ? parsed.customers : [],
        items: Array.isArray(parsed.items) ? parsed.items : [],
        invoices: Array.isArray(parsed.invoices) ? parsed.invoices.map((inv) => finalizeInvoice(inv)) : [],
        users: Array.isArray(parsed.users) && parsed.users.length ? parsed.users : defaultData().users,
        counters: parsed.counters || { item: 1001, invoice: 1 }
      };
      saveData();
      ensureCurrentUser();
      render();
    } catch (error) {
      console.warn(error);
      alert('ملف النسخة الاحتياطية غير صالح');
    }
  };
  reader.readAsText(file, 'utf-8');
}
function normalizeKey(key) {
  return String(key || '').trim().toLowerCase().replace(/\s+/g, '').replace(/_/g, '').replace(/-/g, '');
}
function pick(row, keys) {
  const normalized = Object.fromEntries(Object.entries(row || {}).map(([k, v]) => [normalizeKey(k), v]));
  for (const key of keys) {
    const value = normalized[normalizeKey(key)];
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return '';
}
function importCustomers(rows) {
  let added = 0;
  rows.forEach((row) => {
    const name = String(pick(row, ['name', 'customername', 'اسم', 'اسم العميل', 'العميل']) || '').trim();
    if (!name) return;
    state.data.customers.unshift({ id: uid(), name, phone: String(pick(row, ['phone', 'mobile', 'رقم الموبايل', 'الموبايل']) || '').trim(), city: String(pick(row, ['city', 'المدينة']) || '').trim(), address: String(pick(row, ['address', 'العنوان']) || '').trim() });
    added += 1;
  });
  if (added) saveData();
  return added;
}
function importItems(rows) {
  let added = 0;
  rows.forEach((row) => {
    const name = String(pick(row, ['name', 'itemname', 'اسم الصنف', 'الصنف']) || '').trim();
    const pieceBarcode = String(pick(row, ['piecebarcode', 'barcode', 'باركود القطعة']) || '').trim();
    if (!name || !pieceBarcode) return;
    const seriesQty = Number(pick(row, ['seriesqty', 'seriescount', 'عدد السيري']) || 6);
    state.data.items.unshift(itemFactory({ code: String(pick(row, ['code', 'itemcode', 'رقم المادة']) || nextItemCode()), name, unit: String(pick(row, ['unit', 'الوحدة']) || 'قطعة'), seriesQty, pieceBarcode, seriesBarcode: String(pick(row, ['seriesbarcode', 'باركود السيري']) || deriveSeriesBarcode(pieceBarcode, seriesQty)), piecePrice: Number(pick(row, ['pieceprice', 'سعر القطعة']) || 0), seriesPrice: Number(pick(row, ['seriesprice', 'سعر السيري']) || 0), sizes: String(pick(row, ['sizes', 'المقاسات']) || ''), stock: Number(pick(row, ['stock', 'المخزون']) || 0) }));
    added += 1;
  });
  if (added) saveData();
  return added;
}
function findOrCreateCustomerByName(name, phone = '', city = '', address = '') {
  let found = state.data.customers.find((c) => c.name === name);
  if (!found) {
    found = { id: uid(), name, phone, city, address };
    state.data.customers.unshift(found);
  }
  return found;
}
function importInvoices(rows) {
  const grouped = new Map();
  rows.forEach((row) => {
    const number = String(pick(row, ['number', 'invoicenumber', 'رقم الفاتورة']) || '').trim();
    const customerName = String(pick(row, ['customer', 'customername', 'العميل', 'اسم العميل']) || '').trim();
    if (!number || !customerName) return;
    if (!grouped.has(number)) {
      const customer = findOrCreateCustomerByName(customerName, String(pick(row, ['phone', 'customerphone', 'رقم الموبايل']) || ''), String(pick(row, ['city', 'المدينة']) || ''), String(pick(row, ['address', 'العنوان']) || ''));
      grouped.set(number, { id: uid(), number, date: String(pick(row, ['date', 'التاريخ']) || today()), customerId: customer.id, discountMode: String(pick(row, ['discountmode', 'نوع الخصم']) || 'value').trim() === 'percent' ? 'percent' : 'value', discountValue: Number(pick(row, ['discountvalue', 'الخصم']) || 0), lines: [] });
    }
    const inv = grouped.get(number);
    const qty = Number(pick(row, ['qty', 'quantity', 'الكمية']) || 1);
    const unitPrice = Number(pick(row, ['price', 'unitprice', 'السعر']) || 0);
    const itemName = String(pick(row, ['itemname', 'name', 'اسم الصنف']) || 'صنف');
    const barcode = String(pick(row, ['barcode', 'رقم الباركود', 'barcodenumber']) || '');
    const unit = String(pick(row, ['unit', 'الوحدة']) || 'قطعة');
    const item = state.data.items.find((i) => i.pieceBarcode === barcode || i.seriesBarcode === barcode || i.name === itemName);
    inv.lines.push({ id: uid(), itemId: item?.id || '', barcode, name: itemName, unit, qty, unitPrice });
  });
  const imported = [...grouped.values()].map((inv) => finalizeInvoice(inv));
  if (imported.length) {
    state.data.invoices = imported.concat(state.data.invoices);
    saveData();
  }
  return imported.length;
}
function openExcelImport(target) {
  state.importTarget = target;
  const input = document.getElementById('excelImportInput');
  input.value = '';
  input.click();
}
function openBackupImport() {
  const input = document.getElementById('backupImportInput');
  input.value = '';
  input.click();
}
function handleExcelFile(file) {
  const reader = new FileReader();
  reader.onload = (evt) => {
    try {
      const result = evt.target.result;
      const wb = file.name.toLowerCase().endsWith('.csv') ? XLSX.read(result, { type: 'string' }) : XLSX.read(result, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
      let count = 0;
      if (state.importTarget === 'customers') count = importCustomers(rows);
      if (state.importTarget === 'items') count = importItems(rows);
      if (state.importTarget === 'invoices') count = importInvoices(rows);
      render();
      alert(count ? `تم الاستيراد: ${count}` : 'لم يتم العثور على صفوف صالحة');
    } catch (error) {
      console.warn(error);
      alert('تعذر قراءة الملف');
    }
  };
  if (file.name.toLowerCase().endsWith('.csv')) reader.readAsText(file, 'utf-8');
  else reader.readAsArrayBuffer(file);
}
function customerReportRows() {
  return state.data.customers.map((customer) => ({ العميل: customer.name, الموبايل: customer.phone, المدينة: customer.city, العنوان: customer.address, عدد_الفواتير: customerInvoiceCount(customer.id), إجمالي_الشراء: Number(customerTotal(customer.id).toFixed(2)) }));
}
function itemRows() {
  return state.data.items.map((item) => ({ رقم_المادة: item.code, اسم_الصنف: item.name, الوحدة: item.unit, عدد_السيري: item.seriesQty, باركود_القطعة: item.pieceBarcode, باركود_السيري: item.seriesBarcode, سعر_القطعة: item.piecePrice, سعر_السيري: item.seriesPrice, المقاسات: item.sizes, المخزون: item.stock }));
}
function invoiceSummaryRows() {
  return state.data.invoices.map((inv) => {
    const customer = customerById(inv.customerId);
    return { رقم_الفاتورة: inv.number, التاريخ: inv.date, العميل: customer?.name || '', الموبايل: customer?.phone || '', قبل_الخصم: Number(inv.subTotal.toFixed(2)), الخصم: Number(inv.discountAmount.toFixed(2)), الإجمالي: Number(inv.total.toFixed(2)) };
  });
}
function invoiceLineRows() {
  return state.data.invoices.flatMap((inv) => {
    const customer = customerById(inv.customerId);
    return inv.lines.map((line) => ({ رقم_الفاتورة: inv.number, التاريخ: inv.date, العميل: customer?.name || '', الباركود: line.barcode, الصنف: line.name, الوحدة: line.unit, الكمية: line.qty, السعر: line.unitPrice, الإجمالي: line.total, نوع_الخصم: inv.discountMode, قيمة_الخصم: inv.discountValue }));
  });
}
function topCustomers() {
  return state.data.customers.map((c) => ({ ...c, total: customerTotal(c.id), count: customerInvoiceCount(c.id) })).sort((a, b) => b.total - a.total).slice(0, 8);
}
function latestInvoices(limit = 8) {
  return [...state.data.invoices].sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.number.localeCompare(a.number)).slice(0, limit);
}
function activeCustomer() { return customerById(state.viewParams.customerId); }
function activeInvoice() { return invoiceById(state.viewParams.invoiceId); }
function renderBrandMark(company) {
  if (company.logoUrl) return `<img src="${esc(company.logoUrl)}" alt="${esc(company.name)}" />`;
  return esc(company.logoText || company.name).replace(/\n/g, '<br>');
}
function shellTemplate() {
  const company = state.data.company;
  const user = currentUser();
  const titleMap = { dashboard: 'الرئيسية', 'invoice-editor': 'فاتورة جديدة', invoices: 'الفواتير', customers: 'العملاء', 'customer-detail': 'بطاقة العميل', items: 'المواد', reports: 'التقارير', users: 'المستخدمون', settings: 'بيانات الشركة', 'invoice-detail': 'تفاصيل الفاتورة' };
  return `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand"><div class="brand-mark">JK</div><div><h1>JOOD KIDS</h1><p>Sales Pro</p></div></div>
        <div class="company-card"><div class="company-logo">${renderBrandMark(company)}</div><div><strong>${esc(company.name)}</strong><span>${esc(company.address)}</span></div></div>
        <nav class="nav">
          ${navButton('dashboard', 'الرئيسية', '⌂')}
          ${navButton('invoice-editor', 'فاتورة جديدة', '✦')}
          ${navButton('invoices', 'الفواتير', '▤')}
          ${navButton('customers', 'العملاء', '◉')}
          ${navButton('items', 'المواد', '▣')}
          ${navButton('reports', 'التقارير', '◫')}
          ${navButton('users', 'المستخدمون', '⚑')}
          ${navButton('settings', 'بيانات الشركة', '⚙')}
        </nav>
        <div class="sidebar-footer">
          <button class="btn ghost block" data-action="toggle-sidebar">إغلاق</button>
          <button class="btn ghost block" data-action="install-app">تثبيت التطبيق</button>
          <button class="btn ghost block" data-action="seed-demo">بيانات جاهزة</button>
        </div>
      </aside>
      <main class="content">
        <header class="topbar">
          <div class="toolbar"><button class="btn secondary mobile-only icon-only" data-action="toggle-sidebar">☰</button><div><h2>${titleMap[state.route] || 'JOOD KIDS'}</h2><div class="sub">${esc(company.city)} • ${esc(today())}</div></div></div>
          <div class="topbar-actions">
            <button class="btn secondary" data-action="go-route" data-route="invoice-editor">فاتورة</button>
            <button class="btn secondary" data-action="go-route" data-route="reports">تقارير</button>
            <div class="user-pill"><div class="avatar">${esc((user?.name || 'A').slice(0, 1).toUpperCase())}</div><div><div>${esc(user?.name || 'Admin JOOD')}</div><div class="inline-note">${esc(user?.role || 'admin')}</div></div></div>
            <button class="btn primary" data-action="open-login">تبديل المستخدم</button>
          </div>
        </header>
        <div class="page" id="routeHost">${renderRoute()}</div>
      </main>
    </div>
    ${loginModal()}
    ${scannerModal()}
    <div class="print-zone" id="printZone"></div>
  `;
}
function navButton(route, label, icon) { return `<button class="nav-btn ${state.route === route ? 'active' : ''}" data-action="go-route" data-route="${route}"><span>${label}</span><span class="icon">${icon}</span></button>`; }
function renderRoute() {
  switch (state.route) {
    case 'dashboard': return renderDashboard();
    case 'invoice-editor': return renderInvoiceEditor();
    case 'invoices': return renderInvoicesList();
    case 'customers': return renderCustomers();
    case 'customer-detail': return renderCustomerDetail();
    case 'items': return renderItems();
    case 'reports': return renderReports();
    case 'users': return renderUsers();
    case 'settings': return renderSettings();
    case 'invoice-detail': return renderInvoiceDetail();
    default: return renderDashboard();
  }
}
function renderDashboard() {
  const customers = topCustomers();
  const invoices = latestInvoices();
  return `
    <div class="grid-4">
      <div class="stat-card"><span>عدد الفواتير</span><strong>${state.data.invoices.length}</strong><small>فواتير محفوظة</small></div>
      <div class="stat-card"><span>إجمالي المبيعات</span><strong>${money(metricSalesTotal())}</strong><small>بعد الخصم</small></div>
      <div class="stat-card"><span>العملاء</span><strong>${state.data.customers.length}</strong><small>سجل العملاء</small></div>
      <div class="stat-card"><span>المواد</span><strong>${state.data.items.length}</strong><small>بطاقات الأصناف</small></div>
    </div>
    <div class="grid-main" style="margin-top:18px">
      <div class="card soft">
        <div class="card-head"><h3>أحدث الفواتير</h3><div class="actions"><button class="btn secondary small" data-action="go-route" data-route="invoices">عرض الكل</button></div></div>
        <div class="table-wrap"><table><thead><tr><th>رقم الفاتورة</th><th>التاريخ</th><th>العميل</th><th>الإجمالي</th></tr></thead><tbody>
          ${invoices.length ? invoices.map((inv) => { const customer = customerById(inv.customerId); return `<tr><td><span class="clickable" data-action="open-invoice" data-id="${inv.id}">${esc(inv.number)}</span></td><td>${esc(inv.date)}</td><td><span class="clickable" data-action="open-customer" data-id="${customer?.id || ''}">${esc(customer?.name || '—')}</span></td><td class="mono">${money(inv.total)}</td></tr>`; }).join('') : `<tr><td colspan="4" class="empty-cell">لا توجد فواتير</td></tr>`}
        </tbody></table></div>
      </div>
      <div class="card soft">
        <div class="card-head"><h3>أفضل العملاء</h3><div class="actions"><button class="btn secondary small" data-action="go-route" data-route="reports">التقارير</button></div></div>
        <div class="table-wrap"><table><thead><tr><th>العميل</th><th>عدد الفواتير</th><th>إجمالي الشراء</th></tr></thead><tbody>
          ${customers.length ? customers.map((customer) => `<tr><td><span class="clickable" data-action="open-customer" data-id="${customer.id}">${esc(customer.name)}</span></td><td>${customer.count}</td><td class="mono">${money(customer.total)}</td></tr>`).join('') : `<tr><td colspan="3" class="empty-cell">لا توجد بيانات</td></tr>`}
        </tbody></table></div>
      </div>
    </div>`;
}
function renderLookupCard(resolved, requestedMode, qty) {
  const mode = effectiveLookupMode(requestedMode, resolved);
  const item = resolved.item;
  const unit = lineModeLabel(item, mode);
  const price = linePrice(item, mode);
  const matchText = { code: 'رقم المادة', pieceBarcode: 'باركود القطعة', seriesBarcode: 'باركود السيري', startsWith: 'مطابقة', name: 'الاسم' }[resolved.match] || 'مطابقة';
  return `<div class="lookup-main"><div><div class="lookup-title-row"><strong>${esc(item.name)}</strong><span class="badge purple">${esc(matchText)}</span></div><div class="lookup-meta">رقم المادة: <b>${esc(item.code)}</b> • الوحدة: <b>${esc(unit)}</b> • المقاسات: <b>${esc(item.sizes || '—')}</b></div><div class="lookup-meta">باركود القطعة: <b>${esc(item.pieceBarcode)}</b> • باركود السيري: <b>${esc(item.seriesBarcode)}</b></div></div><div class="lookup-price-stack"><div class="lookup-price-box"><small>السعر</small><strong class="mono">${money(price)}</strong></div><div class="lookup-price-box"><small>الكمية</small><strong>${qty}</strong></div><div class="lookup-price-box"><small>الإجمالي المتوقع</small><strong class="mono">${money(price * qty)}</strong></div></div></div>`;
}
function renderInvoiceEditor() {
  ensureDraft();
  finalizeInvoice(state.draftInvoice);
  const draft = state.draftInvoice;
  const customer = customerById(draft.customerId);
  const lookupTerm = state.viewParams.lookupTerm || '';
  const requestedMode = state.viewParams.lookupMode || 'auto';
  const qty = Number(state.viewParams.lookupQty || 1);
  const resolved = state.lookupResolved;
  return `<div class="invoice-shell"><div class="card soft"><div class="card-head"><h3>فاتورة مبيعات</h3><div class="actions"><button class="btn secondary small" data-action="new-draft">جديدة</button><button class="btn success small" data-action="save-invoice">حفظ</button><button class="btn warn small" data-action="download-pdf" data-source="draft">PDF A4</button><button class="btn secondary small" data-action="download-image" data-source="draft">صورة</button></div></div>
    <div class="form-grid cols-4"><label class="field"><span>رقم الفاتورة</span><input value="${esc(draft.number)}" readonly /></label><label class="field"><span>التاريخ</span><input type="date" value="${esc(draft.date)}" data-input="draft-date" /></label><label class="field"><span>العميل</span><select data-input="draft-customer"><option value="">اختر العميل</option>${state.data.customers.map((c) => `<option value="${c.id}" ${draft.customerId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label><label class="field"><span>الموبايل</span><input value="${esc(customer?.phone || '')}" readonly /></label></div>
    <div class="invoice-lookup"><div class="lookup-grid"><label class="field"><span>بحث / باركود</span><input value="${esc(lookupTerm)}" data-input="lookup-term" /></label><label class="field"><span>الوضع</span><select data-input="lookup-mode"><option value="auto" ${requestedMode === 'auto' ? 'selected' : ''}>تلقائي</option><option value="piece" ${requestedMode === 'piece' ? 'selected' : ''}>قطعة</option><option value="series" ${requestedMode === 'series' ? 'selected' : ''}>سيري</option></select></label><label class="field"><span>الكمية</span><input type="number" min="1" value="${qty}" data-input="lookup-qty" /></label><button class="btn primary" data-action="add-lookup">إضافة</button><button class="btn secondary" data-action="open-scanner">كاميرا</button></div><div class="lookup-result ${resolved ? '' : 'empty'}">${resolved ? renderLookupCard(resolved, requestedMode, qty) : 'اكتب رقم المادة أو الباركود'}</div></div>
    <div class="card" style="margin-top:16px;padding:16px"><div class="card-head" style="margin-bottom:12px"><h3 style="font-size:18px">إضافة من القائمة</h3></div><div class="form-grid cols-3"><label class="field"><span>المادة</span><select data-input="manual-item"><option value="">اختر مادة</option>${state.data.items.map((item) => `<option value="${item.id}" ${state.viewParams.manualItemId === item.id ? 'selected' : ''}>${esc(item.code)} — ${esc(item.name)}</option>`).join('')}</select></label><label class="field"><span>نوع الإضافة</span><select data-input="manual-mode"><option value="piece" ${(state.viewParams.manualMode || 'piece') === 'piece' ? 'selected' : ''}>قطعة</option><option value="series" ${(state.viewParams.manualMode || 'piece') === 'series' ? 'selected' : ''}>سيري</option></select></label><div class="field" style="align-self:end"><button class="btn secondary" data-action="add-manual">إضافة من القائمة</button></div></div></div>
    <div class="table-wrap" style="margin-top:16px"><table><thead><tr><th>م</th><th>رقم الباركود</th><th>الصنف</th><th>الوحدة</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th><th></th></tr></thead><tbody>${draft.lines.length ? draft.lines.map((line, index) => `<tr><td>${index + 1}</td><td class="mono">${esc(line.barcode)}</td><td>${esc(line.name)}</td><td>${esc(line.unit)}</td><td><input class="qty-input" type="number" min="1" value="${line.qty}" data-input="line-qty" data-id="${line.id}" ${canEdit() ? '' : 'disabled'} /></td><td class="mono">${money(line.unitPrice)}</td><td class="mono">${money(line.total)}</td><td><button class="btn danger small" data-action="remove-line" data-id="${line.id}" ${canEdit() ? '' : 'disabled'}>حذف</button></td></tr>`).join('') : `<tr><td colspan="8" class="empty-cell">لا توجد أصناف</td></tr>`}</tbody></table></div>
    <div class="grid-2" style="margin-top:16px"><div class="summary-box"><div class="discount-grid"><label class="field"><span>نوع الخصم</span><select data-input="discount-mode"><option value="value" ${draft.discountMode === 'value' ? 'selected' : ''}>قيمة</option><option value="percent" ${draft.discountMode === 'percent' ? 'selected' : ''}>نسبة %</option></select></label><label class="field"><span>الخصم</span><input type="number" min="0" value="${draft.discountValue}" data-input="discount-value" /></label></div></div><div class="summary-box"><div class="summary-row"><span>الإجمالي قبل الخصم</span><strong class="mono">${money(draft.subTotal)}</strong></div><div class="summary-row"><span>الخصم</span><strong class="mono">${money(draft.discountAmount)}</strong></div><div class="summary-row total"><span>الإجمالي النهائي</span><strong class="mono">${money(draft.total)}</strong></div></div></div>
  </div><div class="card soft"><div class="card-head"><h3>معاينة الفاتورة</h3><div class="actions"><button class="btn secondary small" data-action="print-current">طباعة</button></div></div>${invoiceSheetHtml(draft)}</div></div>`;
}
function renderInvoicesList() {
  const query = String(state.viewParams.invoiceQuery || '').trim();
  const from = state.viewParams.invoiceFrom || '';
  const to = state.viewParams.invoiceTo || '';
  let rows = [...state.data.invoices];
  if (query) rows = rows.filter((inv) => { const customer = customerById(inv.customerId); return inv.number.includes(query) || (customer?.name || '').includes(query); });
  if (from) rows = rows.filter((inv) => inv.date >= from);
  if (to) rows = rows.filter((inv) => inv.date <= to);
  rows.sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.number.localeCompare(a.number));
  return `<div class="card soft"><div class="card-head"><h3>سجل الفواتير</h3><div class="actions"><button class="btn secondary small" data-action="excel-import" data-target="invoices">استيراد Excel</button><button class="btn secondary small" data-action="export-invoices">تصدير Excel</button><button class="btn primary small" data-action="go-route" data-route="invoice-editor">فاتورة جديدة</button></div></div><div class="toolbar" style="margin-bottom:14px"><input class="search-input" placeholder="بحث بالعميل أو رقم الفاتورة" value="${esc(query)}" data-input="invoice-filter-query" /><label class="field" style="min-width:160px"><span>من</span><input type="date" value="${esc(from)}" data-input="invoice-filter-from" /></label><label class="field" style="min-width:160px"><span>إلى</span><input type="date" value="${esc(to)}" data-input="invoice-filter-to" /></label></div><div class="table-wrap"><table><thead><tr><th>رقم الفاتورة</th><th>التاريخ</th><th>العميل</th><th>عدد البنود</th><th>قبل الخصم</th><th>الخصم</th><th>الإجمالي</th><th></th></tr></thead><tbody>${rows.length ? rows.map((inv) => { const customer = customerById(inv.customerId); return `<tr><td><span class="clickable" data-action="open-invoice" data-id="${inv.id}">${esc(inv.number)}</span></td><td>${esc(inv.date)}</td><td><span class="clickable" data-action="open-customer" data-id="${customer?.id || ''}">${esc(customer?.name || '—')}</span></td><td>${inv.lines.length}</td><td class="mono">${money(inv.subTotal)}</td><td class="mono">${money(inv.discountAmount)}</td><td class="mono">${money(inv.total)}</td><td><div class="split-actions"><button class="btn secondary small" data-action="copy-invoice" data-id="${inv.id}">نسخ</button><button class="btn danger small" data-action="delete-invoice" data-id="${inv.id}" ${canEdit() ? '' : 'disabled'}>حذف</button></div></td></tr>`; }).join('') : `<tr><td colspan="8" class="empty-cell">لا توجد نتائج</td></tr>`}</tbody></table></div></div>`;
}
function renderCustomers() {
  const rows = [...state.data.customers].sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  return `<div class="grid-main"><div class="card soft"><div class="card-head"><h3>إضافة عميل</h3><div class="actions"><button class="btn secondary small" data-action="excel-import" data-target="customers">استيراد Excel</button><button class="btn secondary small" data-action="export-customers">تصدير Excel</button></div></div><div class="form-grid"><label class="field"><span>اسم العميل</span><input value="${esc(state.viewParams.customerName || '')}" data-input="customer-name" /></label><label class="field"><span>رقم الموبايل</span><input value="${esc(state.viewParams.customerPhone || '')}" data-input="customer-phone" /></label><label class="field"><span>المدينة</span><input value="${esc(state.viewParams.customerCity || '')}" data-input="customer-city" /></label><label class="field"><span>العنوان</span><input value="${esc(state.viewParams.customerAddress || '')}" data-input="customer-address" /></label></div><div style="margin-top:16px"><button class="btn primary" data-action="save-customer" ${canEdit() ? '' : 'disabled'}>حفظ العميل</button></div></div><div class="card soft"><div class="card-head"><h3>سجل العملاء</h3></div><div class="table-wrap"><table><thead><tr><th>العميل</th><th>الموبايل</th><th>المدينة</th><th>عدد الفواتير</th><th>إجمالي الشراء</th><th></th></tr></thead><tbody>${rows.length ? rows.map((customer) => `<tr><td><span class="clickable" data-action="open-customer" data-id="${customer.id}">${esc(customer.name)}</span></td><td>${esc(customer.phone)}</td><td>${esc(customer.city)}</td><td>${customerInvoiceCount(customer.id)}</td><td class="mono">${money(customerTotal(customer.id))}</td><td><button class="btn danger small" data-action="delete-customer" data-id="${customer.id}" ${canEdit() ? '' : 'disabled'}>حذف</button></td></tr>`).join('') : `<tr><td colspan="6" class="empty-cell">لا يوجد عملاء</td></tr>`}</tbody></table></div></div></div>`;
}
function renderCustomerDetail() {
  const customer = activeCustomer();
  if (!customer) return `<div class="card soft"><div class="empty-cell">العميل غير موجود</div></div>`;
  const invoices = state.data.invoices.filter((inv) => inv.customerId === customer.id).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return `<div class="grid-main"><div class="card soft"><div class="card-head"><h3>${esc(customer.name)}</h3><div class="actions"><button class="btn secondary small" data-action="go-route" data-route="customers">الرجوع</button></div></div><div class="kpi-row"><div class="kpi"><span>إجمالي الشراء</span><b class="mono">${money(customerTotal(customer.id))}</b></div><div class="kpi"><span>عدد الفواتير</span><b>${customerInvoiceCount(customer.id)}</b></div><div class="kpi"><span>الموبايل</span><b>${esc(customer.phone || '—')}</b></div></div><div class="table-wrap" style="margin-top:16px"><table><thead><tr><th>رقم الفاتورة</th><th>التاريخ</th><th>عدد البنود</th><th>الخصم</th><th>الإجمالي</th></tr></thead><tbody>${invoices.length ? invoices.map((inv) => `<tr><td><span class="clickable" data-action="open-invoice" data-id="${inv.id}">${esc(inv.number)}</span></td><td>${esc(inv.date)}</td><td>${inv.lines.length}</td><td class="mono">${money(inv.discountAmount)}</td><td class="mono">${money(inv.total)}</td></tr>`).join('') : `<tr><td colspan="5" class="empty-cell">لا توجد فواتير لهذا العميل</td></tr>`}</tbody></table></div></div><div class="side-meta"><div class="meta-box"><h4>بيانات العميل</h4><div class="meta-list"><div class="meta-row"><span>الاسم</span><strong>${esc(customer.name)}</strong></div><div class="meta-row"><span>الموبايل</span><strong>${esc(customer.phone || '—')}</strong></div><div class="meta-row"><span>المدينة</span><strong>${esc(customer.city || '—')}</strong></div><div class="meta-row"><span>العنوان</span><strong>${esc(customer.address || '—')}</strong></div></div></div><div class="meta-box"><h4>إجراءات</h4><div class="meta-list"><button class="btn primary" data-action="prepare-customer-invoice" data-id="${customer.id}">فاتورة للعميل</button><button class="btn secondary" data-action="export-customer-invoices" data-id="${customer.id}">تصدير فواتير العميل</button></div></div></div></div>`;
}
function renderItems() {
  const nextCode = state.viewParams.itemCode || String(Math.max(Number(state.data.counters.item || 1001), 1001));
  const pieceBarcode = state.viewParams.itemPieceBarcode || '';
  const seriesQty = Number(state.viewParams.itemSeriesQty || 6);
  const seriesBarcode = state.viewParams.itemSeriesBarcode || deriveSeriesBarcode(pieceBarcode, seriesQty);
  return `<div class="grid-main"><div class="card soft"><div class="card-head"><h3>بطاقة المادة</h3><div class="actions"><button class="btn secondary small" data-action="excel-import" data-target="items">استيراد Excel</button><button class="btn secondary small" data-action="export-items">تصدير Excel</button></div></div><div class="form-grid cols-3"><label class="field"><span>رقم المادة</span><input value="${esc(nextCode)}" data-input="item-code" readonly /></label><label class="field"><span>اسم الصنف</span><input value="${esc(state.viewParams.itemName || '')}" data-input="item-name" /></label><label class="field"><span>الوحدة</span><input value="${esc(state.viewParams.itemUnit || 'قطعة')}" data-input="item-unit" /></label><label class="field"><span>عدد السيري</span><select data-input="item-seriesqty">${[6, 9, 12].map((n) => `<option value="${n}" ${seriesQty === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label><label class="field"><span>باركود القطعة</span><input value="${esc(pieceBarcode)}" data-input="item-piecebarcode" /></label><label class="field"><span>باركود السيري</span><input value="${esc(seriesBarcode)}" data-input="item-seriesbarcode" readonly /></label><label class="field"><span>سعر القطعة</span><input type="number" min="0" value="${esc(state.viewParams.itemPiecePrice || '')}" data-input="item-pieceprice" /></label><label class="field"><span>سعر السيري</span><input type="number" min="0" value="${esc(state.viewParams.itemSeriesPrice || '')}" data-input="item-seriesprice" /></label><label class="field"><span>المقاسات</span><input value="${esc(state.viewParams.itemSizes || '')}" data-input="item-sizes" /></label><label class="field"><span>المخزون</span><input type="number" min="0" value="${esc(state.viewParams.itemStock || '0')}" data-input="item-stock" /></label></div><div style="margin-top:16px" class="split-actions"><button class="btn secondary" data-action="regen-series-barcode">توليد باركود السيري</button><button class="btn success" data-action="save-item" ${canEdit() ? '' : 'disabled'}>حفظ المادة</button></div></div><div class="side-meta"><div class="barcode-card"><h4 style="margin:0 0 12px;font-size:18px">طباعة الباركود</h4><div class="barcode-slot"><div>باركود القطعة</div><canvas id="pieceBarcodeCanvas"></canvas><div class="caption mono">${esc(pieceBarcode || '—')}</div></div><div class="barcode-slot"><div>باركود السيري</div><canvas id="seriesBarcodeCanvas"></canvas><div class="caption mono">${esc(seriesBarcode || '—')}</div></div><div style="margin-top:12px"><button class="btn secondary block" data-action="print-barcodes">طباعة الباركود</button></div></div></div><div class="card soft" style="grid-column:1/-1"><div class="card-head"><h3>سجل المواد</h3></div><div class="table-wrap"><table><thead><tr><th>رقم المادة</th><th>اسم الصنف</th><th>باركود القطعة</th><th>باركود السيري</th><th>عدد السيري</th><th>سعر القطعة</th><th>سعر السيري</th><th>المخزون</th><th></th></tr></thead><tbody>${state.data.items.length ? state.data.items.map((item) => `<tr><td>${esc(item.code)}</td><td>${esc(item.name)}</td><td class="mono">${esc(item.pieceBarcode)}</td><td class="mono">${esc(item.seriesBarcode)}</td><td>${item.seriesQty}</td><td class="mono">${money(item.piecePrice)}</td><td class="mono">${money(item.seriesPrice)}</td><td>${item.stock}</td><td><button class="btn danger small" data-action="delete-item" data-id="${item.id}" ${canEdit() ? '' : 'disabled'}>حذف</button></td></tr>`).join('') : `<tr><td colspan="9" class="empty-cell">لا توجد مواد</td></tr>`}</tbody></table></div></div></div>`;
}
function renderReports() {
  const top = topCustomers();
  const latest = latestInvoices(20);
  return `<div class="grid-2"><div class="card soft"><div class="card-head"><h3>تقارير العملاء</h3><div class="actions"><button class="btn secondary small" data-action="export-customers">تصدير Excel</button></div></div><div class="table-wrap"><table><thead><tr><th>العميل</th><th>الموبايل</th><th>عدد الفواتير</th><th>إجمالي الشراء</th></tr></thead><tbody>${top.length ? top.map((customer) => `<tr><td><span class="clickable" data-action="open-customer" data-id="${customer.id}">${esc(customer.name)}</span></td><td>${esc(customer.phone || '—')}</td><td>${customer.count}</td><td class="mono">${money(customer.total)}</td></tr>`).join('') : `<tr><td colspan="4" class="empty-cell">لا توجد بيانات</td></tr>`}</tbody></table></div></div><div class="card soft"><div class="card-head"><h3>تقارير الفواتير</h3><div class="actions"><button class="btn secondary small" data-action="export-invoices">تصدير Excel</button><button class="btn secondary small" data-action="export-invoice-lines">تفاصيل Excel</button></div></div><div class="table-wrap"><table><thead><tr><th>رقم الفاتورة</th><th>التاريخ</th><th>العميل</th><th>الإجمالي</th></tr></thead><tbody>${latest.length ? latest.map((inv) => { const customer = customerById(inv.customerId); return `<tr><td><span class="clickable" data-action="open-invoice" data-id="${inv.id}">${esc(inv.number)}</span></td><td>${esc(inv.date)}</td><td><span class="clickable" data-action="open-customer" data-id="${customer?.id || ''}">${esc(customer?.name || '—')}</span></td><td class="mono">${money(inv.total)}</td></tr>`; }).join('') : `<tr><td colspan="4" class="empty-cell">لا توجد فواتير</td></tr>`}</tbody></table></div></div></div>`;
}
function renderUsers() {
  const user = currentUser();
  return `<div class="grid-main"><div class="card soft"><div class="card-head"><h3>إضافة مستخدم</h3></div><div class="form-grid"><label class="field"><span>الاسم</span><input value="${esc(state.viewParams.userName || '')}" data-input="user-name" /></label><label class="field"><span>البريد</span><input value="${esc(state.viewParams.userEmail || '')}" data-input="user-email" /></label><label class="field"><span>الصلاحية</span><select data-input="user-role">${['admin', 'sales', 'viewer'].map((role) => `<option value="${role}" ${(state.viewParams.userRole || 'sales') === role ? 'selected' : ''}>${role}</option>`).join('')}</select></label><label class="field"><span>الحالة</span><select data-input="user-active"><option value="true" ${(String(state.viewParams.userActive || 'true')) === 'true' ? 'selected' : ''}>نشط</option><option value="false" ${(String(state.viewParams.userActive || 'true')) === 'false' ? 'selected' : ''}>موقوف</option></select></label></div><div style="margin-top:16px"><button class="btn primary" data-action="save-user" ${isAdmin() ? '' : 'disabled'}>حفظ المستخدم</button></div></div><div class="card soft"><div class="card-head"><h3>الصلاحيات</h3></div><div class="table-wrap"><table><thead><tr><th>الاسم</th><th>البريد</th><th>الصلاحية</th><th>الحالة</th><th></th></tr></thead><tbody>${state.data.users.length ? state.data.users.map((u) => `<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td><span class="badge ${u.role === 'admin' ? 'purple' : u.role === 'sales' ? 'cyan' : 'gold'}">${esc(u.role)}</span></td><td>${u.active ? 'نشط' : 'موقوف'}</td><td>${u.id === user?.id ? '<span class="inline-note">الحالي</span>' : `<button class="btn danger small" data-action="delete-user" data-id="${u.id}" ${isAdmin() ? '' : 'disabled'}>حذف</button>`}</td></tr>`).join('') : `<tr><td colspan="5" class="empty-cell">لا يوجد مستخدمون</td></tr>`}</tbody></table></div></div></div>`;
}
function renderSettings() {
  const company = state.data.company;
  return `<div class="grid-main"><div class="card soft"><div class="card-head"><h3>بيانات الشركة</h3></div><div class="form-grid"><label class="field"><span>اسم الشركة</span><input value="${esc(company.name)}" data-input="company-name" /></label><label class="field"><span>المدينة</span><input value="${esc(company.city)}" data-input="company-city" /></label><label class="field"><span>العنوان</span><input value="${esc(company.address)}" data-input="company-address" /></label><label class="field"><span>التليفون</span><input value="${esc(company.phone)}" data-input="company-phone" /></label><label class="field"><span>الرقم الضريبي</span><input value="${esc(company.tax)}" data-input="company-tax" /></label><label class="field"><span>نص اللوجو</span><input value="${esc(company.logoText.replace(/\n/g, ' '))}" data-input="company-logotext" /></label><label class="field" style="grid-column:1/-1"><span>رابط اللوجو</span><input value="${esc(company.logoUrl || '')}" data-input="company-logourl" /></label></div><div style="margin-top:16px" class="split-actions"><button class="btn success" data-action="save-company" ${isAdmin() ? '' : 'disabled'}>حفظ البيانات</button><button class="btn secondary" data-action="export-backup">نسخة احتياطية</button><button class="btn secondary" data-action="import-backup">استيراد نسخة</button></div></div><div class="side-meta"><div class="meta-box"><h4>Firebase</h4><div class="meta-list"><div class="meta-row"><span>projectId</span><strong>${esc(window.JOOD_FIREBASE?.firebaseConfig?.projectId || '')}</strong></div><div class="meta-row"><span>adminUid</span><strong>${esc(window.JOOD_FIREBASE?.adminUid || '')}</strong></div><div class="meta-row"><span>adminEmail</span><strong>${esc(window.JOOD_FIREBASE?.adminEmail || '')}</strong></div></div></div><div class="meta-box"><h4>النسخ والتصدير</h4><div class="meta-list"><button class="btn secondary" data-action="export-customers">عملاء Excel</button><button class="btn secondary" data-action="export-items">مواد Excel</button><button class="btn secondary" data-action="export-invoices">فواتير Excel</button><button class="btn secondary" data-action="export-invoice-lines">تفاصيل الفواتير Excel</button></div></div></div></div>`;
}
function invoiceSheetHtml(inv) {
  finalizeInvoice(inv);
  const company = state.data.company;
  const customer = customerById(inv.customerId);
  const discountLabel = inv.discountMode === 'percent' ? `خصم نسبة (${Number(inv.discountValue || 0)}%)` : 'خصم قيمة';
  return `<div class="invoice-sheet" id="sheet-${inv.id}"><div class="invoice-strip"></div><div class="invoice-head"><div class="invoice-brand"><div class="invoice-brand-mark">${renderBrandMark(company)}</div><div><h1 class="invoice-title">${esc(company.name)}</h1><div class="invoice-sub">${esc(company.address)}<br>${esc(company.phone)}<br>Tax No: ${esc(company.tax)}</div></div></div><div><span class="badge purple">فاتورة مبيعات</span><div class="value mono" style="margin-top:10px;font-size:34px;font-weight:900">${esc(inv.number)}</div></div></div><div class="invoice-chip-grid"><div class="invoice-chip"><small>التاريخ</small><strong>${esc(inv.date)}</strong></div><div class="invoice-chip"><small>العميل</small><strong>${esc(customer?.name || '—')}</strong></div><div class="invoice-chip"><small>الموبايل</small><strong>${esc(customer?.phone || '—')}</strong></div><div class="invoice-chip"><small>العنوان</small><strong>${esc(customer?.address || '—')}</strong></div></div><table class="invoice-table"><thead><tr><th>م</th><th>رقم الباركود</th><th>اسم الصنف</th><th>الوحدة</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead><tbody>${inv.lines.length ? inv.lines.map((line, index) => `<tr><td>${index + 1}</td><td class="mono">${esc(line.barcode)}</td><td>${esc(line.name)}</td><td>${esc(line.unit)}</td><td>${line.qty}</td><td class="mono">${money(line.unitPrice)}</td><td class="mono">${money(line.total)}</td></tr>`).join('') : `<tr><td colspan="7" class="empty-cell">لا توجد أصناف</td></tr>`}</tbody></table><div class="invoice-foot"><div class="invoice-note"><strong>العميل</strong><p>${esc(customer?.name || '—')} — ${esc(customer?.phone || '—')} — ${esc(customer?.address || '—')}</p><div class="signature-row"><div class="signature-box">توقيع المستلم</div><div class="signature-box">اعتماد المبيعات</div></div></div><div class="invoice-total-box"><div class="line"><span>الإجمالي قبل الخصم</span><strong class="mono">${money(inv.subTotal)}</strong></div>${inv.discountAmount ? `<div class="line"><span>${esc(discountLabel)}</span><strong class="mono">${money(inv.discountAmount)}</strong></div>` : ''}<div class="line grand"><span>الإجمالي النهائي</span><strong class="mono">${money(inv.total)}</strong></div></div></div></div>`;
}
function renderInvoiceDetail() {
  const inv = activeInvoice();
  if (!inv) return `<div class="card soft"><div class="empty-cell">الفاتورة غير موجودة</div></div>`;
  const customer = customerById(inv.customerId);
  return `<div class="grid-main"><div class="card soft"><div class="card-head"><h3>${esc(inv.number)}</h3><div class="actions"><button class="btn secondary small" data-action="go-route" data-route="invoices">الرجوع</button><button class="btn secondary small" data-action="copy-invoice" data-id="${inv.id}">نسخ إلى فاتورة جديدة</button><button class="btn warn small" data-action="download-pdf" data-source="invoice" data-id="${inv.id}">PDF A4</button><button class="btn secondary small" data-action="download-image" data-source="invoice" data-id="${inv.id}">صورة</button></div></div>${invoiceSheetHtml(inv)}</div><div class="side-meta"><div class="meta-box"><h4>بيانات الفاتورة</h4><div class="meta-list"><div class="meta-row"><span>التاريخ</span><strong>${esc(inv.date)}</strong></div><div class="meta-row"><span>العميل</span><strong class="clickable" data-action="open-customer" data-id="${customer?.id || ''}">${esc(customer?.name || '—')}</strong></div><div class="meta-row"><span>الموبايل</span><strong>${esc(customer?.phone || '—')}</strong></div><div class="meta-row"><span>عدد البنود</span><strong>${inv.lines.length}</strong></div><div class="meta-row"><span>الإجمالي</span><strong class="mono">${money(inv.total)}</strong></div></div></div><div class="meta-box"><h4>تفاصيل سريعة</h4><div class="table-wrap"><table><thead><tr><th>الصنف</th><th>الكمية</th></tr></thead><tbody>${inv.lines.map((line) => `<tr><td>${esc(line.name)}</td><td>${line.qty}</td></tr>`).join('')}</tbody></table></div></div></div></div>`;
}
function loginModal() {
  const users = state.data.users;
  return `<div class="modal ${state.viewParams.showLogin ? 'show' : ''}" id="loginModal"><div class="modal-card"><h3>تبديل المستخدم</h3><div class="field"><span>المستخدم</span><select id="loginUserSelect">${users.map((u) => `<option value="${u.id}" ${u.id === state.currentUserId ? 'selected' : ''}>${esc(u.name)} — ${esc(u.role)}</option>`).join('')}</select></div><div class="split-actions" style="margin-top:18px"><button class="btn primary" data-action="confirm-login">دخول</button><button class="btn secondary" data-action="close-login">إغلاق</button></div></div></div>`;
}
function scannerModal() {
  return `<div class="modal ${state.scannerOpen ? 'show' : ''}" id="scannerModal"><div class="modal-card"><h3>قراءة الباركود</h3><div class="video-shell"><video id="scannerVideo" autoplay playsinline muted></video></div><div class="status-line" id="scannerStatus">جاهز</div><div class="split-actions" style="margin-top:16px"><button class="btn secondary" data-action="close-scanner">إغلاق</button></div></div></div>`;
}
function render() {
  ensureCurrentUser();
  syncLookupFromParams();
  ensureDraft();
  document.getElementById('app').innerHTML = shellTemplate();
  postRender();
}
function ensureCurrentUser() { if (!state.currentUserId || !userById(state.currentUserId)) state.currentUserId = state.data.users[0]?.id || null; }
function syncLookupFromParams() { if (state.route === 'invoice-editor') state.lookupResolved = findItemLookup(state.viewParams.lookupTerm || ''); }
function postRender() { drawBarcodePreview(); if (state.scannerOpen) attachVideoStream(); }
function drawBarcodePreview() {
  if (state.route !== 'items') return;
  const pieceValue = state.viewParams.itemPieceBarcode || '';
  const seriesValue = state.viewParams.itemSeriesBarcode || deriveSeriesBarcode(pieceValue, state.viewParams.itemSeriesQty || 6);
  const pieceCanvas = document.getElementById('pieceBarcodeCanvas');
  const seriesCanvas = document.getElementById('seriesBarcodeCanvas');
  if (pieceCanvas && pieceValue) try { JsBarcode(pieceCanvas, pieceValue, { displayValue: false, margin: 0, width: 1.6, height: 52 }); } catch {}
  if (seriesCanvas && seriesValue) try { JsBarcode(seriesCanvas, seriesValue, { displayValue: false, margin: 0, width: 1.6, height: 52 }); } catch {}
}
function openLoginModal() { state.viewParams = { ...state.viewParams, showLogin: true }; render(); }
function closeLoginModal() { const { showLogin, ...rest } = state.viewParams; state.viewParams = rest; render(); }
function confirmLogin() { const selectedId = document.getElementById('loginUserSelect')?.value; if (selectedId && userById(selectedId)) state.currentUserId = selectedId; closeLoginModal(); }
function updateViewParams(patch) { state.viewParams = { ...state.viewParams, ...patch }; }
function handleInput(e) {
  const key = e.target.dataset.input;
  if (!key) return;
  if (key === 'draft-date') state.draftInvoice.date = e.target.value || today();
  if (key === 'draft-customer') state.draftInvoice.customerId = e.target.value;
  if (key === 'discount-mode') state.draftInvoice.discountMode = e.target.value;
  if (key === 'discount-value') state.draftInvoice.discountValue = Number(e.target.value || 0);
  if (key === 'line-qty') { const line = state.draftInvoice.lines.find((l) => l.id === e.target.dataset.id); if (line) line.qty = Math.max(1, Number(e.target.value || 1)); }
  if (key.startsWith('lookup-')) {
    if (key === 'lookup-term') updateViewParams({ lookupTerm: e.target.value });
    if (key === 'lookup-mode') updateViewParams({ lookupMode: e.target.value });
    if (key === 'lookup-qty') updateViewParams({ lookupQty: Math.max(1, Number(e.target.value || 1)) });
  }
  if (key.startsWith('manual-')) {
    if (key === 'manual-item') updateViewParams({ manualItemId: e.target.value });
    if (key === 'manual-mode') updateViewParams({ manualMode: e.target.value });
  }
  if (key.startsWith('invoice-filter-')) {
    if (key === 'invoice-filter-query') updateViewParams({ invoiceQuery: e.target.value });
    if (key === 'invoice-filter-from') updateViewParams({ invoiceFrom: e.target.value });
    if (key === 'invoice-filter-to') updateViewParams({ invoiceTo: e.target.value });
    render();
    return;
  }
  if (key.startsWith('customer-')) updateViewParams({ customerName: key === 'customer-name' ? e.target.value : state.viewParams.customerName || '', customerPhone: key === 'customer-phone' ? e.target.value : state.viewParams.customerPhone || '', customerCity: key === 'customer-city' ? e.target.value : state.viewParams.customerCity || '', customerAddress: key === 'customer-address' ? e.target.value : state.viewParams.customerAddress || '' });
  if (key.startsWith('item-')) {
    const patch = { itemCode: state.viewParams.itemCode || String(Math.max(Number(state.data.counters.item || 1001), 1001)), itemName: state.viewParams.itemName || '', itemUnit: state.viewParams.itemUnit || 'قطعة', itemSeriesQty: Number(state.viewParams.itemSeriesQty || 6), itemPieceBarcode: state.viewParams.itemPieceBarcode || '', itemSeriesBarcode: state.viewParams.itemSeriesBarcode || '', itemPiecePrice: state.viewParams.itemPiecePrice || '', itemSeriesPrice: state.viewParams.itemSeriesPrice || '', itemSizes: state.viewParams.itemSizes || '', itemStock: state.viewParams.itemStock || '0' };
    if (key === 'item-name') patch.itemName = e.target.value;
    if (key === 'item-unit') patch.itemUnit = e.target.value;
    if (key === 'item-seriesqty') patch.itemSeriesQty = Number(e.target.value || 6);
    if (key === 'item-piecebarcode') patch.itemPieceBarcode = e.target.value;
    if (key === 'item-pieceprice') patch.itemPiecePrice = e.target.value;
    if (key === 'item-seriesprice') patch.itemSeriesPrice = e.target.value;
    if (key === 'item-sizes') patch.itemSizes = e.target.value;
    if (key === 'item-stock') patch.itemStock = e.target.value;
    patch.itemSeriesBarcode = deriveSeriesBarcode(patch.itemPieceBarcode, patch.itemSeriesQty);
    updateViewParams(patch);
  }
  if (key.startsWith('user-')) updateViewParams({ userName: key === 'user-name' ? e.target.value : state.viewParams.userName || '', userEmail: key === 'user-email' ? e.target.value : state.viewParams.userEmail || '', userRole: key === 'user-role' ? e.target.value : state.viewParams.userRole || 'sales', userActive: key === 'user-active' ? e.target.value : state.viewParams.userActive || 'true' });
  if (key.startsWith('company-')) {
    const company = state.data.company;
    state.data.company = { ...company, name: key === 'company-name' ? e.target.value : company.name, city: key === 'company-city' ? e.target.value : company.city, address: key === 'company-address' ? e.target.value : company.address, phone: key === 'company-phone' ? e.target.value : company.phone, tax: key === 'company-tax' ? e.target.value : company.tax, logoText: (key === 'company-logotext' ? e.target.value : company.logoText).replace(/\s+/g, '\n'), logoUrl: key === 'company-logourl' ? e.target.value : company.logoUrl };
  }
  finalizeInvoice(state.draftInvoice);
  render();
}
function handleClick(e) {
  const button = e.target.closest('[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  const id = button.dataset.id;
  const route = button.dataset.route;
  const target = button.dataset.target;
  const source = button.dataset.source;
  if (action === 'toggle-sidebar') return document.querySelector('.sidebar')?.classList.toggle('open');
  if (action === 'go-route') return navigate(route);
  if (action === 'open-login') return openLoginModal();
  if (action === 'close-login') return closeLoginModal();
  if (action === 'confirm-login') return confirmLogin();
  if (action === 'seed-demo') return seedDemoData();
  if (action === 'install-app') return installApp();
  if (action === 'new-draft') { state.draftInvoice = createEmptyInvoice(); state.viewParams = {}; return navigate('invoice-editor'); }
  if (action === 'add-lookup') return addByLookup();
  if (action === 'add-manual') return addManual();
  if (action === 'remove-line') return removeDraftLine(id);
  if (action === 'save-invoice') return saveInvoice();
  if (action === 'open-invoice') return navigate('invoice-detail', { invoiceId: id });
  if (action === 'open-customer') return navigate('customer-detail', { customerId: id });
  if (action === 'copy-invoice') return duplicateToDraft(id);
  if (action === 'delete-invoice') return deleteInvoice(id);
  if (action === 'save-customer') return saveCustomer();
  if (action === 'delete-customer') return deleteCustomer(id);
  if (action === 'prepare-customer-invoice') return prepareCustomerInvoice(id);
  if (action === 'export-customer-invoices') return exportCustomerInvoices(id);
  if (action === 'regen-series-barcode') return regenSeriesBarcode();
  if (action === 'save-item') return saveItem();
  if (action === 'delete-item') return deleteItem(id);
  if (action === 'print-barcodes') return printBarcodes();
  if (action === 'save-user') return saveUser();
  if (action === 'delete-user') return deleteUser(id);
  if (action === 'save-company') return saveCompany();
  if (action === 'excel-import') return openExcelImport(target);
  if (action === 'export-customers') return exportXlsx(customerReportRows(), `customers-${today()}.xlsx`, 'Customers');
  if (action === 'export-items') return exportXlsx(itemRows(), `items-${today()}.xlsx`, 'Items');
  if (action === 'export-invoices') return exportXlsx(invoiceSummaryRows(), `invoices-${today()}.xlsx`, 'Invoices');
  if (action === 'export-invoice-lines') return exportXlsx(invoiceLineRows(), `invoice-lines-${today()}.xlsx`, 'InvoiceLines');
  if (action === 'export-backup') return exportBackup();
  if (action === 'import-backup') return openBackupImport();
  if (action === 'download-pdf') return downloadInvoicePdf(source === 'invoice' ? invoiceById(id) : state.draftInvoice);
  if (action === 'download-image') return downloadInvoiceImage(source === 'invoice' ? invoiceById(id) : state.draftInvoice);
  if (action === 'print-current') return printInvoice(state.route === 'invoice-detail' ? activeInvoice() : state.draftInvoice);
  if (action === 'open-scanner') return openScanner();
  if (action === 'close-scanner') return closeScanner();
}
function addByLookup() {
  const term = String(state.viewParams.lookupTerm || '').trim();
  const resolved = findItemLookup(term);
  if (!resolved) return alert('الصنف غير موجود');
  state.lookupResolved = resolved;
  const mode = effectiveLookupMode(state.viewParams.lookupMode || 'auto', resolved);
  const qty = Math.max(1, Number(state.viewParams.lookupQty || 1));
  updateViewParams({ lookupQty: 1 });
  addDraftLine(resolved.item, mode, qty);
}
function addManual() {
  const item = itemById(state.viewParams.manualItemId);
  if (!item) return alert('اختر مادة');
  const mode = state.viewParams.manualMode || 'piece';
  const qty = Math.max(1, Number(state.viewParams.lookupQty || 1));
  addDraftLine(item, mode, qty);
}
function removeDraftLine(lineId) { if (!canEdit()) return; state.draftInvoice.lines = state.draftInvoice.lines.filter((line) => line.id !== lineId); finalizeInvoice(state.draftInvoice); render(); }
function saveInvoice() {
  if (!canEdit()) return alert('ليس لديك صلاحية الحفظ.');
  ensureDraft();
  finalizeInvoice(state.draftInvoice);
  if (!state.draftInvoice.customerId || !state.draftInvoice.lines.length) return alert('اختر العميل وأضف صنفًا واحدًا على الأقل');
  state.data.invoices.unshift(JSON.parse(JSON.stringify(state.draftInvoice)));
  saveData();
  const savedId = state.draftInvoice.id;
  state.draftInvoice = createEmptyInvoice();
  render();
  navigate('invoice-detail', { invoiceId: savedId });
}
function deleteInvoice(id) { if (!canEdit()) return; if (!confirm('حذف الفاتورة؟')) return; state.data.invoices = state.data.invoices.filter((inv) => inv.id !== id); saveData(); render(); }
function saveCustomer() {
  if (!canEdit()) return;
  const name = String(state.viewParams.customerName || '').trim();
  if (!name) return alert('أدخل اسم العميل');
  state.data.customers.unshift({ id: uid(), name, phone: String(state.viewParams.customerPhone || '').trim(), city: String(state.viewParams.customerCity || '').trim(), address: String(state.viewParams.customerAddress || '').trim() });
  saveData();
  navigate('customers');
}
function deleteCustomer(id) { if (!canEdit()) return; if (!confirm('حذف العميل؟')) return; state.data.customers = state.data.customers.filter((c) => c.id !== id); saveData(); render(); }
function prepareCustomerInvoice(customerId) { const customer = customerById(customerId); if (!customer) return; state.draftInvoice = createEmptyInvoice(); state.draftInvoice.customerId = customer.id; navigate('invoice-editor'); }
function exportCustomerInvoices(customerId) {
  const customer = customerById(customerId);
  if (!customer) return;
  const rows = state.data.invoices.filter((inv) => inv.customerId === customerId).flatMap((inv) => inv.lines.map((line) => ({ رقم_الفاتورة: inv.number, التاريخ: inv.date, العميل: customer.name, الباركود: line.barcode, الصنف: line.name, الوحدة: line.unit, الكمية: line.qty, السعر: line.unitPrice, الإجمالي: line.total, الخصم: inv.discountAmount, الإجمالي_النهائي: inv.total })));
  exportXlsx(rows, `customer-${customer.name}-${today()}.xlsx`, 'CustomerInvoices');
}
function regenSeriesBarcode() { const pieceBarcode = String(state.viewParams.itemPieceBarcode || ''); const seriesQty = Number(state.viewParams.itemSeriesQty || 6); updateViewParams({ itemSeriesBarcode: deriveSeriesBarcode(pieceBarcode, seriesQty) }); render(); }
function saveItem() {
  if (!canEdit()) return;
  const name = String(state.viewParams.itemName || '').trim();
  const pieceBarcode = String(state.viewParams.itemPieceBarcode || '').trim();
  if (!name || !pieceBarcode) return alert('أدخل اسم الصنف وباركود القطعة');
  const code = String(state.viewParams.itemCode || nextItemCode());
  state.data.items.unshift(itemFactory({ code, name, unit: String(state.viewParams.itemUnit || 'قطعة').trim(), seriesQty: Number(state.viewParams.itemSeriesQty || 6), pieceBarcode, seriesBarcode: String(state.viewParams.itemSeriesBarcode || deriveSeriesBarcode(pieceBarcode, state.viewParams.itemSeriesQty || 6)), piecePrice: Number(state.viewParams.itemPiecePrice || 0), seriesPrice: Number(state.viewParams.itemSeriesPrice || 0), sizes: String(state.viewParams.itemSizes || ''), stock: Number(state.viewParams.itemStock || 0) }));
  state.data.counters.item = Math.max(Number(state.data.counters.item || 1001), Number(code) + 1);
  saveData();
  navigate('items', { itemCode: String(state.data.counters.item) });
}
function deleteItem(id) { if (!canEdit()) return; if (!confirm('حذف المادة؟')) return; state.data.items = state.data.items.filter((i) => i.id !== id); saveData(); render(); }
function saveUser() {
  if (!isAdmin()) return alert('هذه الشاشة للأدمن');
  const name = String(state.viewParams.userName || '').trim();
  const email = String(state.viewParams.userEmail || '').trim();
  if (!name || !email) return alert('أدخل الاسم والبريد');
  state.data.users.unshift({ id: uid(), name, email, role: normalizeRole(state.viewParams.userRole || 'sales'), active: String(state.viewParams.userActive || 'true') === 'true' });
  saveData();
  navigate('users');
}
function deleteUser(id) { if (!isAdmin()) return; if (id === state.currentUserId) return alert('لا يمكن حذف المستخدم الحالي'); if (!confirm('حذف المستخدم؟')) return; state.data.users = state.data.users.filter((u) => u.id !== id); saveData(); render(); }
function saveCompany() { if (!isAdmin()) return alert('هذه الشاشة للأدمن'); saveData(); render(); }
async function installApp() {
  if (!state.deferredPrompt) return alert('التثبيت يتم من المتصفح عند توفره.');
  state.deferredPrompt.prompt();
  await state.deferredPrompt.userChoice;
  state.deferredPrompt = null;
}
function printInvoice(inv) { if (!inv) return; document.getElementById('printZone').innerHTML = invoiceSheetHtml(inv); window.print(); }
async function downloadInvoiceImage(inv) {
  if (!inv) return;
  const wrapper = document.createElement('div');
  wrapper.style.position = 'fixed';
  wrapper.style.inset = '-99999px auto auto -99999px';
  wrapper.style.width = '1240px';
  wrapper.innerHTML = invoiceSheetHtml(inv);
  document.body.appendChild(wrapper);
  try {
    const canvas = await html2canvas(wrapper.firstElementChild, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
    canvas.toBlob((blob) => { if (blob) downloadBlob(blob, `${inv.number}.png`); }, 'image/png');
  } catch (error) {
    console.warn(error);
    alert('تعذر إنشاء الصورة');
  } finally {
    wrapper.remove();
  }
}
async function downloadInvoicePdf(inv) {
  if (!inv) return;
  const wrapper = document.createElement('div');
  wrapper.style.position = 'fixed';
  wrapper.style.inset = '-99999px auto auto -99999px';
  wrapper.style.width = '1240px';
  wrapper.innerHTML = invoiceSheetHtml(inv);
  document.body.appendChild(wrapper);
  try {
    const canvas = await html2canvas(wrapper.firstElementChild, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = 210;
    const pageHeight = 297;
    const ratio = Math.min(pageWidth / canvas.width, pageHeight / canvas.height);
    const w = canvas.width * ratio;
    const h = canvas.height * ratio;
    const x = (pageWidth - w) / 2;
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', x, 8, w, h);
    pdf.save(`${inv.number}.pdf`);
  } catch (error) {
    console.warn(error);
    alert('تعذر إنشاء PDF');
  } finally {
    wrapper.remove();
  }
}
async function openScanner() {
  state.scannerOpen = true;
  render();
  try {
    state.cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    attachVideoStream();
    startScannerLoop();
  } catch (error) {
    console.warn(error);
    document.getElementById('scannerStatus').textContent = 'تعذر تشغيل الكاميرا';
  }
}
function attachVideoStream() { const video = document.getElementById('scannerVideo'); if (video && state.cameraStream) video.srcObject = state.cameraStream; }
function startScannerLoop() {
  stopScannerLoop();
  const status = document.getElementById('scannerStatus');
  if (!('BarcodeDetector' in window)) { if (status) status.textContent = 'استخدم قارئ الباركود الخارجي أو الكتابة اليدوية'; return; }
  if (status) status.textContent = 'وجّه الكاميرا إلى الباركود';
  const detector = new BarcodeDetector({ formats: ['ean_13', 'code_128', 'upc_a', 'upc_e', 'qr_code'] });
  state.cameraLoopTimer = setInterval(async () => {
    const video = document.getElementById('scannerVideo');
    if (!video || video.readyState < 2) return;
    try {
      const result = await detector.detect(video);
      const raw = result?.[0]?.rawValue;
      if (raw) {
        const resolved = findItemLookup(raw);
        updateViewParams({ lookupTerm: raw, lookupQty: 1 });
        state.scannerOpen = false;
        closeStream();
        if (resolved) {
          state.lookupResolved = resolved;
          const mode = effectiveLookupMode(state.viewParams.lookupMode || 'auto', resolved);
          addDraftLine(resolved.item, mode, 1);
          return;
        }
        render();
      }
    } catch (error) {
      console.warn(error);
    }
  }, 450);
}
function stopScannerLoop() { if (state.cameraLoopTimer) { clearInterval(state.cameraLoopTimer); state.cameraLoopTimer = null; } }
function closeStream() { stopScannerLoop(); if (state.cameraStream) { state.cameraStream.getTracks().forEach((track) => track.stop()); state.cameraStream = null; } }
function closeScanner() { state.scannerOpen = false; closeStream(); render(); }
function printBarcodes() {
  const name = String(state.viewParams.itemName || 'JOOD KIDS');
  const piece = String(state.viewParams.itemPieceBarcode || '');
  const series = String(state.viewParams.itemSeriesBarcode || deriveSeriesBarcode(piece, state.viewParams.itemSeriesQty || 6));
  const win = window.open('', '_blank');
  win.document.write(`<html dir="rtl"><head><title>Barcode</title><script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script><style>body{font-family:Cairo,Arial;padding:24px}.card{border:1px solid #dbe2fb;border-radius:20px;padding:18px;margin-bottom:18px}.title{font-weight:900;font-size:22px;margin-bottom:10px}.cap{text-align:center;font-weight:800;margin-top:8px}canvas{display:block;margin:12px auto;max-width:100%}</style></head><body><div class="card"><div class="title">${esc(name)}</div><div>باركود القطعة</div><canvas id="b1"></canvas><div class="cap">${esc(piece)}</div></div><div class="card"><div class="title">${esc(name)}</div><div>باركود السيري</div><canvas id="b2"></canvas><div class="cap">${esc(series)}</div></div><script>JsBarcode('#b1','${esc(piece)}',{displayValue:false,width:2,height:80,margin:0});JsBarcode('#b2','${esc(series)}',{displayValue:false,width:2,height:80,margin:0});window.print();<\/script></body></html>`);
  win.document.close();
}
function registerAppEvents() {
  document.addEventListener('click', handleClick);
  document.addEventListener('input', handleInput);
  document.getElementById('excelImportInput').addEventListener('change', (e) => { const file = e.target.files?.[0]; if (file) handleExcelFile(file); });
  document.getElementById('backupImportInput').addEventListener('change', (e) => { const file = e.target.files?.[0]; if (file) importBackup(file); });
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); state.deferredPrompt = e; });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.scannerOpen) closeScanner();
    const active = document.activeElement;
    if (e.key === 'Enter' && active?.dataset?.input === 'lookup-term') {
      e.preventDefault();
      addByLookup();
    }
  });
}
function registerServiceWorker() { if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(console.warn); }
window.addEventListener('load', () => {
  registerAppEvents();
  registerServiceWorker();
  ensureCurrentUser();
  state.draftInvoice = createEmptyInvoice();
  const params = new URLSearchParams(location.search);
  const shouldSeed = params.get('seed') === '1' || (!state.data.customers.length && !state.data.items.length && !state.data.invoices.length);
  if (shouldSeed) seedDemoData(); else render();
});
