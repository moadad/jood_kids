const APP_KEY = 'jood-kids-sales-pro-v2';

const state = {
  currentView: 'overview',
  currentUser: null,
  deferredPrompt: null,
  cameraStream: null,
  cameraLoopTimer: null,
  draftInvoice: null,
  resolvedLookup: null,
  data: loadData(),
  dom: {}
};

function uid() { return Math.random().toString(36).slice(2, 10); }
function today() { return new Date().toISOString().slice(0, 10); }
function money(n) { return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n || 0)); }
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])); }
function deriveSeriesBarcode(pieceBarcode, seriesQty) { const clean = String(pieceBarcode || '').replace(/\D/g, ''); return clean ? `${clean}${String(seriesQty).padStart(2, '0')}` : ''; }
function byId(id) { return document.getElementById(id); }

function defaultData() {
  return {
    company: {
      name: 'JOOD KIDS',
      city: 'الاسكندرية',
      address: 'الاسكندرية - مصر',
      phone: '+20 100 555 7788',
      tax: 'TX-220055',
      logoText: 'JOOD\nKIDS'
    },
    customers: [],
    items: [],
    invoices: [],
    users: [
      { id: uid(), name: 'Admin JOOD', email: 'admin@erp-pro.local', role: 'admin', active: true, firebaseUid: 'JxKXouwjdadht4wSMPf1qtbeW9n1' },
      { id: uid(), name: 'مبيعات 1', email: 'sales1@joodkids.local', role: 'sales', active: true },
      { id: uid(), name: 'مشاهدة', email: 'viewer@joodkids.local', role: 'viewer', active: true }
    ],
    counters: { item: 1001, invoice: 1 }
  };
}

function loadData() {
  try {
    const raw = localStorage.getItem(APP_KEY);
    return raw ? JSON.parse(raw) : defaultData();
  } catch {
    return defaultData();
  }
}

function saveData() { localStorage.setItem(APP_KEY, JSON.stringify(state.data)); }
function nextInvoiceNumber() { return `INV-${new Date().getFullYear()}-${String(state.data.counters.invoice++).padStart(5, '0')}`; }
function createEmptyInvoice() {
  return { id: uid(), number: nextInvoiceNumber(), date: today(), customerId: '', lines: [], discountMode: 'value', discountValue: 0, subTotal: 0, discountAmount: 0, total: 0 };
}
function customerName(customerId) { return state.data.customers.find(c => c.id === customerId)?.name || '—'; }

function itemFactory(seed) {
  const code = String(state.data.counters.item++);
  return {
    id: uid(),
    code,
    name: seed.name,
    unit: seed.unit || 'قطعة',
    seriesQty: Number(seed.seriesQty || 6),
    pieceBarcode: String(seed.pieceBarcode || ''),
    seriesBarcode: deriveSeriesBarcode(seed.pieceBarcode, seed.seriesQty),
    piecePrice: Number(seed.piecePrice || 0),
    seriesPrice: Number(seed.seriesPrice || 0),
    sizes: seed.sizes || '',
    stock: Number(seed.stock || 0)
  };
}

function invoiceFromSeed(customer, linesInput, discountMode, discountValue, date) {
  const lines = linesInput.map((l, idx) => {
    const item = state.data.items.find(i => i.id === l.itemId);
    const mode = l.mode === 'series' ? 'series' : 'piece';
    const qty = Number(l.qty || 1);
    const price = mode === 'series' ? Number(item.seriesPrice) : Number(item.piecePrice);
    return { id: uid(), seq: idx + 1, itemId: item.id, barcode: mode === 'series' ? item.seriesBarcode : item.pieceBarcode, name: item.name, unit: mode === 'series' ? `سيري ${item.seriesQty}` : item.unit, qty, unitPrice: price, total: qty * price };
  });
  return finalizeInvoice({ id: uid(), number: `INV-2026-${String(state.data.invoices.length + 1).padStart(5, '0')}`, date, customerId: customer.id, lines, discountMode, discountValue });
}

function seedDemoData() {
  state.data = defaultData();
  state.data.company = {
    name: 'JOOD KIDS',
    city: 'الاسكندرية',
    address: 'منطقة الجملة - الاسكندرية - مصر',
    phone: '+20 100 555 7788',
    tax: 'TX-220055',
    logoText: 'JOOD\nKIDS'
  };
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
  const c1 = state.data.customers[0], c2 = state.data.customers[1];
  state.data.invoices = [
    invoiceFromSeed(c1, [{ itemId: state.data.items[0].id, mode: 'series', qty: 1 }, { itemId: state.data.items[1].id, mode: 'piece', qty: 5 }], 'percent', 5, '2026-03-24'),
    invoiceFromSeed(c2, [{ itemId: state.data.items[2].id, mode: 'series', qty: 2 }, { itemId: state.data.items[3].id, mode: 'piece', qty: 10 }], 'value', 100, '2026-03-25')
  ];
  state.data.counters.invoice = 3;
  saveData();
  state.draftInvoice = createEmptyInvoice();
  renderAll();
  showView('overview');
}

function prepareDemoDraft() {
  if (!state.data.customers.length || !state.data.items.length) return;
  const customer = state.data.customers[0];
  state.draftInvoice = createEmptyInvoice();
  state.draftInvoice.customerId = customer.id;
  state.draftInvoice.date = today();
  addLineFromItem(state.data.items[0], 'series', 2);
  addLineFromItem(state.data.items[1], 'piece', 5);
  state.draftInvoice.discountMode = 'percent';
  state.draftInvoice.discountValue = 7;
  renderInvoiceForm();
  renderInvoiceDraft();
}

function finalizeInvoice(inv) {
  inv.lines.forEach((line, idx) => {
    line.seq = idx + 1;
    line.qty = Math.max(1, Number(line.qty || 1));
    line.unitPrice = Number(line.unitPrice || 0);
    line.total = line.qty * line.unitPrice;
  });
  inv.subTotal = inv.lines.reduce((sum, line) => sum + Number(line.total || 0), 0);
  inv.discountAmount = inv.discountMode === 'percent' ? inv.subTotal * Number(inv.discountValue || 0) / 100 : Number(inv.discountValue || 0);
  inv.total = Math.max(0, inv.subTotal - inv.discountAmount);
  return inv;
}

function cacheDom() {
  Object.assign(state.dom, {
    navButtons: [...document.querySelectorAll('.nav-btn')],
    views: [...document.querySelectorAll('.view')],
    viewTitle: byId('viewTitle'),
    installBtn: byId('installBtn'),
    seedBtn: byId('seedBtn'),
    menuToggle: byId('menuToggle'),
    loginBtn: byId('loginBtn'),
    loginModal: byId('loginModal'),
    demoUserSelect: byId('demoUserSelect'),
    confirmLoginBtn: byId('confirmLoginBtn'),
    invoiceNumber: byId('invoiceNumber'),
    invoiceDate: byId('invoiceDate'),
    invoiceCustomer: byId('invoiceCustomer'),
    invoiceCustomerPhone: byId('invoiceCustomerPhone'),
    barcodeInput: byId('barcodeInput'),
    lookupMode: byId('lookupMode'),
    lookupQty: byId('lookupQty'),
    lookupResult: byId('lookupResult'),
    scanAddBtn: byId('scanAddBtn'),
    cameraBtn: byId('cameraBtn'),
    scannerModal: byId('scannerModal'),
    closeScannerBtn: byId('closeScannerBtn'),
    scannerStatus: byId('scannerStatus'),
    cameraVideo: byId('cameraVideo'),
    manualItemSelect: byId('manualItemSelect'),
    manualAddMode: byId('manualAddMode'),
    addManualItemBtn: byId('addManualItemBtn'),
    invoiceLines: byId('invoiceLines'),
    discountMode: byId('discountMode'),
    discountValue: byId('discountValue'),
    subTotalValue: byId('subTotalValue'),
    discountAmountValue: byId('discountAmountValue'),
    grandTotalValue: byId('grandTotalValue'),
    invoicePreview: byId('invoicePreview'),
    printInvoiceBtn: byId('printInvoiceBtn'),
    imageInvoiceBtn: byId('imageInvoiceBtn'),
    saveInvoiceBtn: byId('saveInvoiceBtn'),
    newInvoiceBtn: byId('newInvoiceBtn'),
    customerName: byId('customerName'),
    customerPhone: byId('customerPhone'),
    customerCity: byId('customerCity'),
    customerAddress: byId('customerAddress'),
    addCustomerBtn: byId('addCustomerBtn'),
    customersTable: byId('customersTable'),
    exportCustomersBtn: byId('exportCustomersBtn'),
    itemCode: byId('itemCode'),
    itemName: byId('itemName'),
    itemUnit: byId('itemUnit'),
    itemSeriesQty: byId('itemSeriesQty'),
    itemPieceBarcode: byId('itemPieceBarcode'),
    itemSeriesBarcode: byId('itemSeriesBarcode'),
    itemPiecePrice: byId('itemPiecePrice'),
    itemSeriesPrice: byId('itemSeriesPrice'),
    itemSizes: byId('itemSizes'),
    itemStock: byId('itemStock'),
    generateSeriesBarcodeBtn: byId('generateSeriesBarcodeBtn'),
    printBarcodeBtn: byId('printBarcodeBtn'),
    addItemBtn: byId('addItemBtn'),
    itemsTable: byId('itemsTable'),
    exportItemsBtn: byId('exportItemsBtn'),
    barcodeCard: byId('barcodeCard'),
    invoicesReport: byId('invoicesReport'),
    customersReport: byId('customersReport'),
    exportInvoicesBtn: byId('exportInvoicesBtn'),
    userName: byId('userName'),
    userEmail: byId('userEmail'),
    userRole: byId('userRole'),
    userActive: byId('userActive'),
    addUserBtn: byId('addUserBtn'),
    usersTable: byId('usersTable'),
    companyName: byId('companyName'),
    companyCity: byId('companyCity'),
    companyAddress: byId('companyAddress'),
    companyPhone: byId('companyPhone'),
    companyTax: byId('companyTax'),
    companyLogoText: byId('companyLogoText'),
    saveCompanyBtn: byId('saveCompanyBtn'),
    companyNameSidebar: byId('companyNameSidebar'),
    companyAddressSidebar: byId('companyAddressSidebar'),
    companyLogoPreview: byId('companyLogoPreview'),
    statInvoices: byId('statInvoices'),
    statSales: byId('statSales'),
    statCustomers: byId('statCustomers'),
    statItems: byId('statItems'),
    latestInvoices: byId('latestInvoices'),
    topCustomers: byId('topCustomers')
  });
}

function bindEvents() {
  state.dom.navButtons.forEach(btn => btn.addEventListener('click', () => showView(btn.dataset.view)));
  state.dom.menuToggle.addEventListener('click', () => document.querySelector('.sidebar').classList.toggle('open'));
  state.dom.installBtn.addEventListener('click', installApp);
  state.dom.seedBtn?.addEventListener('click', seedDemoData);
  state.dom.loginBtn.addEventListener('click', () => state.dom.loginModal.classList.add('show'));
  state.dom.confirmLoginBtn.addEventListener('click', handleLogin);
  state.dom.addCustomerBtn.addEventListener('click', addCustomer);
  state.dom.exportCustomersBtn.addEventListener('click', () => exportExcel('customers', state.data.customers));
  state.dom.generateSeriesBarcodeBtn.addEventListener('click', generateSeriesBarcode);
  state.dom.itemPieceBarcode.addEventListener('input', generateSeriesBarcode);
  state.dom.itemSeriesQty.addEventListener('change', generateSeriesBarcode);
  state.dom.addItemBtn.addEventListener('click', addItem);
  state.dom.printBarcodeBtn.addEventListener('click', printBarcodeCard);
  state.dom.exportItemsBtn.addEventListener('click', () => exportExcel('items', state.data.items));
  state.dom.saveCompanyBtn.addEventListener('click', saveCompany);
  state.dom.addUserBtn.addEventListener('click', addUser);
  state.dom.addManualItemBtn.addEventListener('click', addManualItem);
  state.dom.manualItemSelect.addEventListener('change', syncManualSelectionToLookup);
  state.dom.scanAddBtn.addEventListener('click', addByLookup);
  state.dom.barcodeInput.addEventListener('input', resolveLookup);
  state.dom.barcodeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addByLookup(); } });
  state.dom.lookupMode.addEventListener('change', renderLookupResult);
  state.dom.lookupQty.addEventListener('input', sanitizeLookupQty);
  state.dom.discountMode.addEventListener('change', syncDraftFromForm);
  state.dom.discountValue.addEventListener('input', syncDraftFromForm);
  state.dom.invoiceDate.addEventListener('change', syncDraftFromForm);
  state.dom.invoiceCustomer.addEventListener('change', syncDraftFromForm);
  state.dom.saveInvoiceBtn.addEventListener('click', saveInvoice);
  state.dom.newInvoiceBtn.addEventListener('click', () => {
    state.draftInvoice = createEmptyInvoice();
    state.dom.barcodeInput.value = '';
    state.resolvedLookup = null;
    renderInvoiceForm();
    renderLookupResult();
    renderInvoiceDraft();
  });
  state.dom.printInvoiceBtn.addEventListener('click', () => { showView('invoices'); setTimeout(() => window.print(), 200); });
  state.dom.imageInvoiceBtn.addEventListener('click', downloadInvoiceImage);
  state.dom.exportInvoicesBtn.addEventListener('click', () => exportExcel('invoices', state.data.invoices.map(inv => ({ number: inv.number, date: inv.date, customer: customerName(inv.customerId), subTotal: inv.subTotal, discount: inv.discountAmount, total: inv.total }))));
  state.dom.cameraBtn.addEventListener('click', openCamera);
  state.dom.closeScannerBtn.addEventListener('click', closeCamera);
  state.dom.invoiceLines.addEventListener('input', handleInvoiceLineInput);
  state.dom.invoiceLines.addEventListener('click', handleInvoiceLineClick);
  document.addEventListener('click', handleGlobalDeleteClick);
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); state.deferredPrompt = e; });
}

function showView(view) {
  state.currentView = view;
  state.dom.views.forEach(v => v.classList.toggle('active-view', v.id === view));
  state.dom.navButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.view === view));
  const titles = { overview: 'الرئيسية', invoices: 'الفواتير', customers: 'العملاء', items: 'المواد', reports: 'التقارير', users: 'المستخدمون', settings: 'الإعدادات' };
  state.dom.viewTitle.textContent = titles[view] || 'JOOD KIDS';
}

function handleLogin() {
  const selectedId = state.dom.demoUserSelect.value;
  state.currentUser = state.data.users.find(u => u.id === selectedId) || state.data.users[0] || null;
  state.dom.loginModal.classList.remove('show');
}

function renderLoginUsers() {
  state.dom.demoUserSelect.innerHTML = state.data.users.map(user => `<option value="${user.id}">${esc(user.name)} — ${esc(user.role)}</option>`).join('');
}

function renderOverview() {
  state.dom.statInvoices.textContent = state.data.invoices.length;
  state.dom.statSales.textContent = money(state.data.invoices.reduce((sum, inv) => sum + Number(inv.total || 0), 0));
  state.dom.statCustomers.textContent = state.data.customers.length;
  state.dom.statItems.textContent = state.data.items.length;

  const latestRows = state.data.invoices.slice(0, 8).map(inv => `<tr><td>${esc(inv.number)}</td><td>${esc(inv.date)}</td><td>${esc(customerName(inv.customerId))}</td><td>${money(inv.total)}</td></tr>`).join('') || `<tr><td colspan="4" class="muted">لا توجد فواتير بعد</td></tr>`;
  state.dom.latestInvoices.innerHTML = `<table><thead><tr><th>الفاتورة</th><th>التاريخ</th><th>العميل</th><th>الإجمالي</th></tr></thead><tbody>${latestRows}</tbody></table>`;

  const totalsByCustomer = state.data.customers.map(c => ({ name: c.name, total: state.data.invoices.filter(inv => inv.customerId === c.id).reduce((sum, inv) => sum + Number(inv.total || 0), 0) })).sort((a, b) => b.total - a.total).slice(0, 8);
  const customerRows = totalsByCustomer.map(c => `<tr><td>${esc(c.name)}</td><td>${money(c.total)}</td></tr>`).join('') || `<tr><td colspan="2" class="muted">لا توجد بيانات</td></tr>`;
  state.dom.topCustomers.innerHTML = `<table><thead><tr><th>العميل</th><th>إجمالي الشراء</th></tr></thead><tbody>${customerRows}</tbody></table>`;
}

function renderCustomers() {
  state.dom.customersTable.innerHTML = `<table><thead><tr><th>العميل</th><th>الموبايل</th><th>المدينة</th><th>العنوان</th><th></th></tr></thead><tbody>${state.data.customers.map(c => `<tr><td>${esc(c.name)}</td><td>${esc(c.phone)}</td><td>${esc(c.city)}</td><td>${esc(c.address)}</td><td><button class="danger-btn remove-customer" data-id="${c.id}">حذف</button></td></tr>`).join('') || `<tr><td colspan="5" class="muted">لا يوجد عملاء</td></tr>`}</tbody></table>`;
  state.dom.invoiceCustomer.innerHTML = `<option value="">اختر العميل</option>` + state.data.customers.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  if (state.draftInvoice?.customerId) state.dom.invoiceCustomer.value = state.draftInvoice.customerId;
}

function renderItems() {
  state.dom.itemsTable.innerHTML = `<table><thead><tr><th>رقم المادة</th><th>اسم الصنف</th><th>باركود القطعة</th><th>باركود السيري</th><th>عدد السيري</th><th>سعر القطعة</th><th>سعر السيري</th><th>المخزون</th><th></th></tr></thead><tbody>${state.data.items.map(i => `<tr><td>${esc(i.code)}</td><td>${esc(i.name)}</td><td>${esc(i.pieceBarcode)}</td><td>${esc(i.seriesBarcode)}</td><td>${i.seriesQty}</td><td>${money(i.piecePrice)}</td><td>${money(i.seriesPrice)}</td><td>${i.stock}</td><td><button class="danger-btn remove-item" data-id="${i.id}">حذف</button></td></tr>`).join('') || `<tr><td colspan="9" class="muted">لا توجد مواد</td></tr>`}</tbody></table>`;
  state.dom.manualItemSelect.innerHTML = `<option value="">اختر مادة</option>` + state.data.items.map(i => `<option value="${i.id}">${esc(i.code)} — ${esc(i.name)}</option>`).join('');
}

function renderReports() {
  state.dom.invoicesReport.innerHTML = `<table><thead><tr><th>رقم الفاتورة</th><th>التاريخ</th><th>العميل</th><th>قبل الخصم</th><th>الخصم</th><th>الإجمالي</th></tr></thead><tbody>${state.data.invoices.map(inv => `<tr><td>${esc(inv.number)}</td><td>${esc(inv.date)}</td><td>${esc(customerName(inv.customerId))}</td><td>${money(inv.subTotal)}</td><td>${money(inv.discountAmount)}</td><td>${money(inv.total)}</td></tr>`).join('') || `<tr><td colspan="6" class="muted">لا توجد فواتير</td></tr>`}</tbody></table>`;
  const rows = state.data.customers.map(c => {
    const total = state.data.invoices.filter(inv => inv.customerId === c.id).reduce((s, inv) => s + Number(inv.total || 0), 0);
    return `<tr><td>${esc(c.name)}</td><td>${esc(c.phone)}</td><td>${esc(c.city)}</td><td>${money(total)}</td></tr>`;
  }).join('') || `<tr><td colspan="4" class="muted">لا توجد بيانات</td></tr>`;
  state.dom.customersReport.innerHTML = `<table><thead><tr><th>العميل</th><th>الموبايل</th><th>المدينة</th><th>إجمالي الشراء</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderUsers() {
  state.dom.usersTable.innerHTML = `<table><thead><tr><th>الاسم</th><th>البريد</th><th>الصلاحية</th><th>الحالة</th><th></th></tr></thead><tbody>${state.data.users.map(u => `<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td><span class="status-pill status-${u.role}">${esc(u.role)}</span></td><td>${u.active ? 'نشط' : 'موقوف'}</td><td>${u.email === 'admin@erp-pro.local' ? '' : `<button class="danger-btn remove-user" data-id="${u.id}">حذف</button>`}</td></tr>`).join('')}</tbody></table>`;
  renderLoginUsers();
}

function renderCompany() {
  const c = state.data.company;
  state.dom.companyName.value = c.name;
  state.dom.companyCity.value = c.city;
  state.dom.companyAddress.value = c.address;
  state.dom.companyPhone.value = c.phone;
  state.dom.companyTax.value = c.tax;
  state.dom.companyLogoText.value = c.logoText.replace(/\n/g, ' ');
  state.dom.companyNameSidebar.textContent = c.name;
  state.dom.companyAddressSidebar.textContent = c.address;
  state.dom.companyLogoPreview.innerHTML = c.logoText.replace(/\n/g, '<br>');
}

function renderInvoiceForm() {
  if (!state.draftInvoice) state.draftInvoice = createEmptyInvoice();
  state.dom.invoiceNumber.value = state.draftInvoice.number;
  state.dom.invoiceDate.value = state.draftInvoice.date;
  state.dom.invoiceCustomer.value = state.draftInvoice.customerId || '';
  state.dom.discountMode.value = state.draftInvoice.discountMode;
  state.dom.discountValue.value = state.draftInvoice.discountValue;
  state.dom.invoiceCustomerPhone.value = state.data.customers.find(c => c.id === state.draftInvoice.customerId)?.phone || '';
}

function resolveLookup() {
  const term = state.dom.barcodeInput.value.trim();
  state.resolvedLookup = findItemByLookup(term);
  renderLookupResult();
}

function findItemByLookup(term) {
  const q = String(term || '').trim();
  if (!q) return null;
  const exact = state.data.items.find(i => i.code === q || i.pieceBarcode === q || i.seriesBarcode === q);
  if (exact) return { item: exact, detectedMode: exact.seriesBarcode === q ? 'series' : 'piece', matchType: exact.code === q ? 'code' : (exact.pieceBarcode === q ? 'pieceBarcode' : 'seriesBarcode'), query: q };
  const starts = state.data.items.find(i => i.code.startsWith(q) || i.pieceBarcode.startsWith(q) || i.seriesBarcode.startsWith(q));
  if (starts) return { item: starts, detectedMode: starts.code.startsWith(q) ? 'piece' : (starts.seriesBarcode.startsWith(q) ? 'series' : 'piece'), matchType: 'startsWith', query: q };
  const byName = state.data.items.find(i => i.name.includes(q));
  if (byName) return { item: byName, detectedMode: 'piece', matchType: 'name', query: q };
  return null;
}

function effectiveLookupMode() {
  const requested = state.dom.lookupMode.value;
  if (!state.resolvedLookup) return requested === 'auto' ? 'piece' : requested;
  if (requested !== 'auto') return requested;
  return state.resolvedLookup.detectedMode || 'piece';
}

function renderLookupResult() {
  const box = state.dom.lookupResult;
  const qty = Math.max(1, Number(state.dom.lookupQty.value || 1));
  if (!state.resolvedLookup) {
    box.className = 'lookup-result empty';
    box.innerHTML = `<div class="lookup-empty">${state.dom.barcodeInput.value.trim() ? 'لم يتم العثور على صنف مطابق لهذا الإدخال.' : 'اكتب رقم المادة أو الباركود ليتم جلب تفاصيل الصنف تلقائيًا.'}</div>`;
    return;
  }
  const { item, matchType } = state.resolvedLookup;
  const mode = effectiveLookupMode();
  const unitLabel = mode === 'series' ? `سيري ${item.seriesQty}` : item.unit;
  const price = mode === 'series' ? Number(item.seriesPrice) : Number(item.piecePrice);
  const matchMap = { code: 'تم التعرف من رقم المادة', pieceBarcode: 'تم التعرف من باركود القطعة', seriesBarcode: 'تم التعرف من باركود السيري', startsWith: 'مطابقة سريعة', name: 'مطابقة بالاسم' };
  box.className = 'lookup-result';
  box.innerHTML = `
    <div class="lookup-main">
      <div>
        <div class="lookup-title-row"><strong>${esc(item.name)}</strong><span class="status-pill status-sales">${esc(matchMap[matchType] || 'مطابقة')}</span></div>
        <div class="lookup-meta">رقم المادة: <b>${esc(item.code)}</b> • الوحدة: <b>${esc(unitLabel)}</b> • المقاسات: <b>${esc(item.sizes || '—')}</b></div>
        <div class="lookup-meta">باركود القطعة: <b>${esc(item.pieceBarcode)}</b> • باركود السيري: <b>${esc(item.seriesBarcode)}</b></div>
      </div>
      <div class="lookup-pricing">
        <div><small>السعر الحالي</small><strong>${money(price)}</strong></div>
        <div><small>الكمية المطلوب إضافتها</small><strong>${qty}</strong></div>
        <div><small>الإجمالي المتوقع</small><strong>${money(price * qty)}</strong></div>
      </div>
    </div>`;
}

function syncDraftFromForm() {
  state.draftInvoice.date = state.dom.invoiceDate.value || today();
  state.draftInvoice.customerId = state.dom.invoiceCustomer.value;
  state.draftInvoice.discountMode = state.dom.discountMode.value;
  state.draftInvoice.discountValue = Number(state.dom.discountValue.value || 0);
  state.dom.invoiceCustomerPhone.value = state.data.customers.find(c => c.id === state.draftInvoice.customerId)?.phone || '';
  renderInvoiceDraft();
}

function addLineFromItem(item, mode = 'piece', qty = 1) {
  const quantity = Math.max(1, Number(qty || 1));
  const isSeries = mode === 'series';
  const unit = isSeries ? `سيري ${item.seriesQty}` : item.unit;
  const price = isSeries ? Number(item.seriesPrice) : Number(item.piecePrice);
  const barcode = isSeries ? item.seriesBarcode : item.pieceBarcode;
  const existing = state.draftInvoice.lines.find(l => l.itemId === item.id && l.unit === unit);
  if (existing) {
    existing.qty += quantity;
    existing.total = existing.qty * existing.unitPrice;
  } else {
    state.draftInvoice.lines.push({ id: uid(), itemId: item.id, barcode, name: item.name, unit, qty: quantity, unitPrice: price, total: price * quantity });
  }
  syncDraftFromForm();
}

function sanitizeLookupQty() {
  const current = Math.max(1, Number(state.dom.lookupQty.value || 1));
  state.dom.lookupQty.value = current;
  renderLookupResult();
}

function addByLookup() {
  resolveLookup();
  if (!state.resolvedLookup) return alert('الصنف غير موجود. اكتب رقم المادة أو الباركود بشكل صحيح.');
  const item = state.resolvedLookup.item;
  const mode = effectiveLookupMode();
  const qty = Math.max(1, Number(state.dom.lookupQty.value || 1));
  addLineFromItem(item, mode, qty);
  state.dom.barcodeInput.select();
  if (state.resolvedLookup.matchType === 'pieceBarcode' || state.resolvedLookup.matchType === 'seriesBarcode') {
    state.dom.lookupQty.value = 1;
  }
  renderLookupResult();
}

function syncManualSelectionToLookup() {
  const item = state.data.items.find(i => i.id === state.dom.manualItemSelect.value);
  if (!item) return;
  state.dom.barcodeInput.value = item.code;
  state.dom.lookupMode.value = state.dom.manualAddMode.value;
  state.resolvedLookup = { item, detectedMode: state.dom.manualAddMode.value, matchType: 'code', query: item.code };
  renderLookupResult();
}

function addManualItem() {
  const item = state.data.items.find(i => i.id === state.dom.manualItemSelect.value);
  if (!item) return alert('اختر مادة من القائمة أولاً');
  const qty = Math.max(1, Number(state.dom.lookupQty.value || 1));
  addLineFromItem(item, state.dom.manualAddMode.value, qty);
}

function invoiceHTML(inv) {
  const company = state.data.company;
  const customer = state.data.customers.find(c => c.id === inv.customerId);
  const discountLabel = inv.discountMode === 'percent' ? `خصم (${Number(inv.discountValue || 0)}%)` : 'خصم';
  return `
    <div class="invoice-sheet" id="invoiceSheet">
      <div class="invoice-top-strip"></div>
      <div class="invoice-head">
        <div class="invoice-brand">
          <div class="invoice-logo">${company.logoText.replace(/\n/g, '<br>')}</div>
          <div>
            <h1 class="invoice-title">${esc(company.name)}</h1>
            <div>${esc(company.address)}</div>
            <div>${esc(company.phone)}</div>
            <div>Tax No: ${esc(company.tax)}</div>
          </div>
        </div>
        <div class="invoice-meta">
          <div class="soft-badge invoice-badge">فاتورة مبيعات</div>
          <div class="invoice-number-hero">${esc(inv.number)}</div>
        </div>
      </div>

      <div class="invoice-info-grid">
        <div class="info-chip"><small>التاريخ</small><strong>${esc(inv.date)}</strong></div>
        <div class="info-chip"><small>العميل</small><strong>${esc(customer?.name || '—')}</strong></div>
        <div class="info-chip"><small>الموبايل</small><strong>${esc(customer?.phone || '—')}</strong></div>
        <div class="info-chip"><small>العنوان</small><strong>${esc(customer?.address || '—')}</strong></div>
      </div>

      <table class="invoice-table">
        <thead>
          <tr><th>م</th><th>رقم الباركود</th><th>اسم الصنف</th><th>الوحدة</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr>
        </thead>
        <tbody>
          ${inv.lines.map((line, idx) => `<tr><td>${idx + 1}</td><td>${esc(line.barcode)}</td><td>${esc(line.name)}</td><td>${esc(line.unit)}</td><td>${line.qty}</td><td>${money(line.unitPrice)}</td><td>${money(line.total)}</td></tr>`).join('') || `<tr><td colspan="7" class="muted">لا توجد أصناف داخل الفاتورة</td></tr>`}
        </tbody>
      </table>

      <div class="invoice-footer">
        <div class="invoice-notes">
          <strong>بيانات التسليم</strong>
          <p>شكراً لتعاملكم معنا.</p>
          <div class="signature-row">
            <div class="signature-box"><span>توقيع المستلم</span></div>
            <div class="signature-box"><span>اعتماد المبيعات</span></div>
          </div>
        </div>
        <div class="invoice-summary">
          <div><span>الإجمالي قبل الخصم</span><strong>${money(inv.subTotal)}</strong></div>
          <div><span>${esc(discountLabel)}</span><strong>${money(inv.discountAmount)}</strong></div>
          <div class="grand"><span>الإجمالي النهائي</span><strong>${money(inv.total)}</strong></div>
        </div>
      </div>
    </div>`;
}

function renderInvoiceDraft() {
  finalizeInvoice(state.draftInvoice);
  state.dom.invoiceLines.innerHTML = state.draftInvoice.lines.length
    ? state.draftInvoice.lines.map((line, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td>${esc(line.barcode)}</td>
        <td>${esc(line.name)}</td>
        <td>${esc(line.unit)}</td>
        <td><input class="line-qty-input" type="number" min="1" value="${line.qty}" data-id="${line.id}" /></td>
        <td>${money(line.unitPrice)}</td>
        <td>${money(line.total)}</td>
        <td><button class="danger-btn delete-row" data-id="${line.id}">حذف</button></td>
      </tr>`).join('')
    : `<tr><td colspan="8" class="muted">لا توجد أصناف داخل الفاتورة</td></tr>`;
  state.dom.subTotalValue.textContent = money(state.draftInvoice.subTotal);
  state.dom.discountAmountValue.textContent = money(state.draftInvoice.discountAmount);
  state.dom.grandTotalValue.textContent = money(state.draftInvoice.total);
  state.dom.invoicePreview.innerHTML = invoiceHTML(state.draftInvoice);
}

function handleInvoiceLineInput(e) {
  const input = e.target.closest('.line-qty-input');
  if (!input) return;
  const line = state.draftInvoice.lines.find(l => l.id === input.dataset.id);
  if (!line) return;
  line.qty = Math.max(1, Number(input.value || 1));
  line.total = line.qty * line.unitPrice;
  renderInvoiceDraft();
}

function handleInvoiceLineClick(e) {
  const btn = e.target.closest('.delete-row');
  if (!btn) return;
  state.draftInvoice.lines = state.draftInvoice.lines.filter(line => line.id !== btn.dataset.id);
  renderInvoiceDraft();
}

function saveInvoice() {
  syncDraftFromForm();
  if (!state.draftInvoice.customerId || !state.draftInvoice.lines.length) return alert('يرجى اختيار العميل وإضافة صنف واحد على الأقل');
  state.data.invoices.unshift(JSON.parse(JSON.stringify(finalizeInvoice(state.draftInvoice))));
  saveData();
  state.draftInvoice = createEmptyInvoice();
  state.dom.barcodeInput.value = '';
  state.resolvedLookup = null;
  renderAll();
  showView('reports');
}

async function downloadInvoiceImage() {
  const target = document.getElementById('invoiceSheet');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1240" height="1754"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" style="width:1240px;height:1754px;background:white;padding:40px;direction:rtl;">${target.outerHTML}</div></foreignObject></svg>`;
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1240; canvas.height = 1754;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 1240, 1754); ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
    const a = document.createElement('a');
    a.download = `${state.draftInvoice.number}.png`;
    a.href = canvas.toDataURL('image/png');
    a.click();
  };
  img.src = url;
}

function addCustomer() {
  const name = state.dom.customerName.value.trim();
  if (!name) return alert('أدخل اسم العميل');
  state.data.customers.unshift({ id: uid(), name, phone: state.dom.customerPhone.value.trim(), city: state.dom.customerCity.value.trim(), address: state.dom.customerAddress.value.trim() });
  saveData();
  state.dom.customerName.value = '';
  state.dom.customerPhone.value = '';
  state.dom.customerCity.value = '';
  state.dom.customerAddress.value = '';
  renderAll();
}

function generateSeriesBarcode() {
  state.dom.itemSeriesBarcode.value = deriveSeriesBarcode(state.dom.itemPieceBarcode.value, state.dom.itemSeriesQty.value);
  renderBarcodeCard();
}

function renderBarcodeCard() {
  const piece = state.dom.itemPieceBarcode.value || '—';
  const series = state.dom.itemSeriesBarcode.value || '—';
  const name = state.dom.itemName.value || 'اسم الصنف';
  state.dom.barcodeCard.innerHTML = `<h4 style="margin:0 0 14px;">معاينة طباعة الباركود</h4><div><strong>${esc(name)}</strong></div><div style="margin:12px 0 6px;">باركود القطعة</div><div class="barcode-bars"></div><div class="barcode-caption">${esc(piece)}</div><div style="margin:18px 0 6px;">باركود السيري</div><div class="barcode-bars"></div><div class="barcode-caption">${esc(series)}</div>`;
}

function printBarcodeCard() {
  renderBarcodeCard();
  const w = window.open('', '_blank');
  w.document.write(`<html dir="rtl"><head><title>Barcode</title><style>body{font-family:Arial;padding:24px}.barcode-bars{height:74px;background:repeating-linear-gradient(90deg,#111 0px,#111 2px,transparent 2px,transparent 4px,#111 4px,#111 5px,transparent 5px,transparent 8px,#111 8px,#111 12px,transparent 12px,transparent 14px);border-radius:12px}.barcode-caption{text-align:center;margin-top:10px;font-weight:800;letter-spacing:2px}</style></head><body>${state.dom.barcodeCard.innerHTML}</body></html>`);
  w.document.close();
  w.print();
}

function addItem() {
  const name = state.dom.itemName.value.trim();
  const piece = state.dom.itemPieceBarcode.value.trim();
  if (!name || !piece) return alert('يرجى إدخال اسم الصنف وباركود القطعة');
  state.data.items.unshift({
    id: uid(),
    code: state.dom.itemCode.value,
    name,
    unit: state.dom.itemUnit.value.trim() || 'قطعة',
    seriesQty: Number(state.dom.itemSeriesQty.value),
    pieceBarcode: piece,
    seriesBarcode: state.dom.itemSeriesBarcode.value.trim() || deriveSeriesBarcode(piece, state.dom.itemSeriesQty.value),
    piecePrice: Number(state.dom.itemPiecePrice.value || 0),
    seriesPrice: Number(state.dom.itemSeriesPrice.value || 0),
    sizes: state.dom.itemSizes.value.trim(),
    stock: Number(state.dom.itemStock.value || 0)
  });
  state.data.counters.item = Math.max(state.data.counters.item, Number(state.dom.itemCode.value) + 1);
  saveData();
  resetItemForm();
  renderAll();
}

function resetItemForm() {
  state.dom.itemCode.value = String(state.data.counters.item);
  state.dom.itemName.value = '';
  state.dom.itemUnit.value = 'قطعة';
  state.dom.itemSeriesQty.value = '6';
  state.dom.itemPieceBarcode.value = '';
  state.dom.itemSeriesBarcode.value = '';
  state.dom.itemPiecePrice.value = '';
  state.dom.itemSeriesPrice.value = '';
  state.dom.itemSizes.value = '';
  state.dom.itemStock.value = '0';
  renderBarcodeCard();
}

function addUser() {
  if (state.currentUser?.role !== 'admin') return alert('هذه الشاشة للأدمن فقط');
  const name = state.dom.userName.value.trim();
  const email = state.dom.userEmail.value.trim();
  if (!name || !email) return alert('أدخل الاسم والبريد');
  state.data.users.unshift({ id: uid(), name, email, role: state.dom.userRole.value, active: state.dom.userActive.value === 'true' });
  saveData();
  state.dom.userName.value = '';
  state.dom.userEmail.value = '';
  renderAll();
}

function saveCompany() {
  state.data.company = {
    name: state.dom.companyName.value.trim(),
    city: state.dom.companyCity.value.trim(),
    address: state.dom.companyAddress.value.trim(),
    phone: state.dom.companyPhone.value.trim(),
    tax: state.dom.companyTax.value.trim(),
    logoText: state.dom.companyLogoText.value.trim().replace(/\s+/g, '\n')
  };
  saveData();
  renderAll();
}

function exportExcel(type, rows) {
  if (!rows || !rows.length) return alert('لا توجد بيانات للتصدير');
  const headers = Object.keys(rows[0]);
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="UTF-8"></head><body><table border="1"><thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${headers.map(h => `<td>${esc(r[h] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`;
  const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${type}-${today()}.xls`;
  a.click();
}

async function installApp() {
  if (!state.deferredPrompt) return alert('يمكن تثبيت التطبيق من المتصفح على الموبايل إذا كان الخيار مدعومًا.');
  state.deferredPrompt.prompt();
  await state.deferredPrompt.userChoice;
  state.deferredPrompt = null;
}

async function openCamera() {
  state.dom.scannerModal.classList.add('show');
  try {
    state.cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    state.dom.cameraVideo.srcObject = state.cameraStream;
    state.dom.scannerStatus.textContent = 'الكاميرا جاهزة';
    startBarcodeDetectionLoop();
  } catch (error) {
    console.warn(error);
    state.dom.scannerStatus.textContent = 'تعذر تشغيل الكاميرا';
  }
}

function startBarcodeDetectionLoop() {
  stopBarcodeDetectionLoop();
  if (!('BarcodeDetector' in window)) {
    state.dom.scannerStatus.textContent = 'استخدم القارئ أو أدخل الكود';
    return;
  }
  const detector = new BarcodeDetector({ formats: ['ean_13', 'code_128', 'qr_code', 'upc_a', 'upc_e'] });
  const tick = async () => {
    try {
      if (!state.cameraStream || state.dom.cameraVideo.readyState < 2) return;
      const barcodes = await detector.detect(state.dom.cameraVideo);
      const first = barcodes?.[0]?.rawValue;
      if (first) {
        state.dom.barcodeInput.value = first;
        resolveLookup();
        addByLookup();
        closeCamera();
        return;
      }
    } catch (error) {
      console.warn(error);
    }
  };
  state.cameraLoopTimer = setInterval(tick, 500);
}

function stopBarcodeDetectionLoop() {
  if (state.cameraLoopTimer) {
    clearInterval(state.cameraLoopTimer);
    state.cameraLoopTimer = null;
  }
}

function closeCamera() {
  state.dom.scannerModal.classList.remove('show');
  stopBarcodeDetectionLoop();
  if (state.cameraStream) {
    state.cameraStream.getTracks().forEach(track => track.stop());
    state.cameraStream = null;
  }
}

function handleGlobalDeleteClick(e) {
  const itemBtn = e.target.closest('.remove-item');
  if (itemBtn) {
    state.data.items = state.data.items.filter(i => i.id !== itemBtn.dataset.id);
    saveData();
    renderAll();
    return;
  }
  const customerBtn = e.target.closest('.remove-customer');
  if (customerBtn) {
    state.data.customers = state.data.customers.filter(c => c.id !== customerBtn.dataset.id);
    saveData();
    renderAll();
    return;
  }
  const userBtn = e.target.closest('.remove-user');
  if (userBtn) {
    state.data.users = state.data.users.filter(u => u.id !== userBtn.dataset.id);
    saveData();
    renderAll();
  }
}

function renderAll() {
  renderCompany();
  renderCustomers();
  renderItems();
  renderUsers();
  renderReports();
  renderOverview();
  renderInvoiceForm();
  renderLookupResult();
  renderInvoiceDraft();
  resetItemForm();
}

function registerSW() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(console.warn);
}

window.addEventListener('load', () => {
  cacheDom();
  bindEvents();
  state.draftInvoice = createEmptyInvoice();
  const params = new URLSearchParams(location.search);
  const shouldSeed = params.get('seed') === '1' || (!state.data.customers.length && !state.data.items.length && !state.data.invoices.length);
  if (shouldSeed) seedDemoData();
  else renderAll();
  if (params.get('demoDraft') === '1') prepareDemoDraft();
  renderLoginUsers();
  registerSW();
  const startView = params.get('view');
  if (startView) showView(startView);
  if (params.get('autologin') === '1') {
    state.currentUser = state.data.users[0];
    state.dom.loginModal.classList.remove('show');
  } else {
    state.dom.loginModal.classList.add('show');
  }
});
