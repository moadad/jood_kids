const APP_KEY = 'jood-kids-sales-pro-enterprise-v6';

const state = {
  currentView: 'overview',
  currentUser: null,
  deferredPrompt: null,
  cameraStream: null,
  cameraLoopTimer: null,
  resolvedLookup: null,
  selectedCustomerId: null,
  selectedInvoiceId: null,
  draftInvoice: null,
  scannerTarget: 'invoice',
  lookupAutoTimer: null,
  data: loadData(),
  dom: {},
  toastTimer: null,
};

function uid() { return Math.random().toString(36).slice(2, 11); }
function byId(id) { return document.getElementById(id); }
function today() { return new Date().toISOString().slice(0, 10); }
function nowIso() { return new Date().toISOString(); }
function money(n) { return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n || 0)); }
function esc(v) { return String(v ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])); }
function parseDateValue(dateStr) { return dateStr ? new Date(`${dateStr}T00:00:00`) : null; }
function formatDisplayDate(dateStr) { try { return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-GB'); } catch { return dateStr || '—'; } }
function formatDateTime(value) { try { return new Date(value).toLocaleString('en-GB'); } catch { return value || '—'; } }
function deriveSeriesBarcode(pieceBarcode, seriesQty) {
  const clean = String(pieceBarcode || '').replace(/\D/g, '');
  return clean ? `${clean}${String(seriesQty || 0).padStart(2, '0')}` : '';
}

function adminUidValue() {
  return window.JOOD_FIREBASE?.adminUid || 'JxKXouwjdadht4wSMPf1qtbeW9n1';
}
function adminEmailValue() {
  return String(window.JOOD_FIREBASE?.adminEmail || 'admin@erp-pro.local').trim().toLowerCase();
}
function isAdminIdentity(email, firebaseUid) {
  return String(email || '').trim().toLowerCase() === adminEmailValue() || String(firebaseUid || '').trim() === adminUidValue();
}

function showToast(message) {
  const toast = state.dom.toast;
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
}

function defaultData() {
  return {
    company: {
      name: 'JOOD KIDS',
      city: 'Alexandria',
      address: 'Alexandria · Egypt',
      phone: '+20 100 555 7788',
      tax: 'TX-220055',
      logoText: 'JK',
      logoDataUrl: ''
    },
    customers: [],
    items: [],
    invoices: [],
    activityLogs: [],
    users: [
      { id: uid(), name: 'Admin JOOD', email: adminEmailValue(), role: 'admin', active: true, firebaseUid: adminUidValue(), passwordHash: '0c9c926994473267792a9543b2b06bf04d216c0aec58b92d70e9d9f552bda77a' },
      { id: uid(), name: 'Sales Desk', email: 'sales1@joodkids.local', role: 'sales', active: true, passwordHash: '6bc0a63cb29c92306020c0a6bbc358cc4628db277dc06e253535e126517ad637' },
      { id: uid(), name: 'Viewer', email: 'viewer@joodkids.local', role: 'viewer', active: true, passwordHash: '65375049b9e4d7cad6c9ba286fdeb9394b28135a3e84136404cfccfdcc438894' }
    ],
    counters: { item: 1001, invoice: 1 }
  };
}

function migrateData(data) {
  const base = defaultData();
  return {
    ...base,
    ...data,
    company: { ...base.company, ...(data.company || {}) },
    customers: Array.isArray(data.customers) ? data.customers : [],
    items: Array.isArray(data.items) ? data.items : [],
    invoices: Array.isArray(data.invoices) ? data.invoices.map((inv) => finalizeInvoice({ id: inv.id || uid(), number: inv.number || '', date: inv.date || today(), customerId: inv.customerId || '', lines: Array.isArray(inv.lines) ? inv.lines : [], discountMode: inv.discountMode || 'value', discountValue: Number(inv.discountValue || 0), subTotal: Number(inv.subTotal || 0), discountAmount: Number(inv.discountAmount || 0), total: Number(inv.total || 0) })) : [],
    activityLogs: Array.isArray(data.activityLogs) ? data.activityLogs : [],
    users: Array.isArray(data.users) && data.users.length ? data.users.map((u) => {
      const normalizedEmail = String(u.email || '').trim().toLowerCase();
      const firebaseUid = String(u.firebaseUid || '');
      return { ...u, email: normalizedEmail, firebaseUid, role: isAdminIdentity(normalizedEmail, firebaseUid) ? 'admin' : (u.role || 'sales') };
    }) : base.users,
    counters: { ...base.counters, ...(data.counters || {}) }
  };
}

function ensureAdminRecord() {
  let admin = state.data.users.find((u) => isAdminIdentity(u.email, u.firebaseUid));
  if (!admin) {
    admin = { id: uid(), name: 'Admin JOOD', email: adminEmailValue(), role: 'admin', active: true, firebaseUid: adminUidValue(), passwordHash: '0c9c926994473267792a9543b2b06bf04d216c0aec58b92d70e9d9f552bda77a' };
    state.data.users.unshift(admin);
  } else {
    admin.email = adminEmailValue();
    admin.firebaseUid = adminUidValue();
    admin.role = 'admin';
    admin.active = true;
  }
}

function loadData() {
  try {
    const raw = localStorage.getItem(APP_KEY);
    return raw ? migrateData(JSON.parse(raw)) : defaultData();
  } catch {
    return defaultData();
  }
}

function saveData() {
  localStorage.setItem(APP_KEY, JSON.stringify(state.data));
  if (window.JOOD_REMOTE?.isAuthenticated?.()) {
    window.JOOD_REMOTE.saveAppData(state.data).catch(() => null);
  }
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(String(value || ''));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function normalizeUsersSecurity() {
  ensureAdminRecord();
  let changed = false;
  for (const user of state.data.users) {
    const normalizedEmail = String(user.email || '').trim().toLowerCase();
    if (user.email !== normalizedEmail) {
      user.email = normalizedEmail;
      changed = true;
    }
    if (isAdminIdentity(user.email, user.firebaseUid)) {
      if (user.role !== 'admin') { user.role = 'admin'; changed = true; }
      if (user.firebaseUid !== adminUidValue()) { user.firebaseUid = adminUidValue(); changed = true; }
      if (user.email !== adminEmailValue()) { user.email = adminEmailValue(); changed = true; }
    }
    if (!user.passwordHash) {
      const fallback = isAdminIdentity(user.email, user.firebaseUid) ? adminUidValue() : (user.password || '123456');
      user.passwordHash = await sha256(fallback);
      delete user.password;
      changed = true;
    }
  }
  if (changed) saveData();
}

async function hydrateFromRemote() {
  if (!window.JOOD_REMOTE?.loadAppData) return;
  try {
    const remote = await window.JOOD_REMOTE.loadAppData();
    if (!remote) return;
    state.data = migrateData(remote);
    localStorage.setItem(APP_KEY, JSON.stringify(state.data));
    await normalizeUsersSecurity();
    renderAll();
  } catch {}
}

function currentActor() {
  return {
    name: state.currentUser?.name || 'Guest',
    role: state.currentUser?.role || 'guest'
  };
}

function logActivity(action, detail = '') {
  const actor = currentActor();
  state.data.activityLogs.unshift({ id: uid(), at: nowIso(), action, detail, user: actor.name, role: actor.role });
  state.data.activityLogs = state.data.activityLogs.slice(0, 500);
  saveData();
}

function nextInvoiceNumber() {
  return `INV-${new Date().getFullYear()}-${String(state.data.counters.invoice++).padStart(5, '0')}`;
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

function itemFactory(seed) {
  return {
    id: uid(),
    code: String(seed.code || state.data.counters.item++),
    name: seed.name,
    unit: seed.unit || 'قطعة',
    seriesQty: Number(seed.seriesQty || 6),
    pieceBarcode: String(seed.pieceBarcode || ''),
    seriesBarcode: String(seed.seriesBarcode || deriveSeriesBarcode(seed.pieceBarcode, seed.seriesQty || 6)),
    piecePrice: Number(seed.piecePrice || 0),
    seriesPrice: Number(seed.seriesPrice || 0),
    sizes: seed.sizes || '',
    stock: Number(seed.stock || 0)
  };
}

function customerName(customerId) {
  return state.data.customers.find((c) => c.id === customerId)?.name || '—';
}

function findCustomer(customerId) {
  return state.data.customers.find((c) => c.id === customerId) || null;
}

function findInvoice(invoiceId) {
  return state.data.invoices.find((i) => i.id === invoiceId) || null;
}

function finalizeInvoice(inv) {
  inv.lines = (inv.lines || []).map((line, idx) => {
    const qty = Math.max(1, Number(line.qty || 1));
    const unitPrice = Number(line.unitPrice || 0);
    const mode = line.mode === 'series' ? 'series' : 'piece';
    const pieceQty = mode === 'series' ? Math.max(1, qty) * Number(line.seriesQty || line.pieceQtyPerSeries || 0 || 1) : qty;
    return { ...line, seq: idx + 1, qty, unitPrice, total: qty * unitPrice, pieceQty };
  });
  inv.subTotal = inv.lines.reduce((sum, line) => sum + Number(line.total || 0), 0);
  inv.discountValue = Number(inv.discountValue || 0);
  inv.discountAmount = inv.discountMode === 'percent' ? inv.subTotal * inv.discountValue / 100 : inv.discountValue;
  inv.total = Math.max(0, inv.subTotal - inv.discountAmount);
  return inv;
}

function invoiceFromSeed(customer, linesInput, discountMode, discountValue, date) {
  const lines = linesInput.map((entry) => {
    const item = state.data.items.find((i) => i.id === entry.itemId);
    const mode = entry.mode === 'series' ? 'series' : 'piece';
    const qty = Number(entry.qty || 1);
    const unitPrice = mode === 'series' ? Number(item.seriesPrice) : Number(item.piecePrice);
    return {
      id: uid(),
      itemId: item.id,
      barcode: mode === 'series' ? item.seriesBarcode : item.pieceBarcode,
      name: item.name,
      unit: mode === 'series' ? `سيري ${item.seriesQty}` : item.unit,
      qty,
      unitPrice,
      total: qty * unitPrice,
      mode,
      pieceQty: mode === 'series' ? qty * Number(item.seriesQty || 0) : qty,
      itemCode: item.code,
      seriesQty: Number(item.seriesQty || 0)
    };
  });
  return finalizeInvoice({ id: uid(), number: nextInvoiceNumber(), date, customerId: customer.id, lines, discountMode, discountValue });
}

function seedDemoData() {
  state.data = defaultData();
  state.data.company = {
    name: 'JOOD KIDS',
    city: 'Alexandria',
    address: 'Wholesale District · Alexandria · Egypt',
    phone: '+20 100 555 7788',
    tax: 'TX-220055',
    logoText: 'JK',
    logoDataUrl: ''
  };
  state.data.customers = [
    { id: uid(), name: 'بيت الأطفال', phone: '01008877665', city: 'الاسكندرية', address: 'سيدي جابر' },
    { id: uid(), name: 'دار الأناقة', phone: '01002233445', city: 'المنصورة', address: 'شارع الجمهورية' },
    { id: uid(), name: 'مؤسسة النور', phone: '01001122334', city: 'القاهرة', address: 'مدينة نصر' },
    { id: uid(), name: 'رويال كيدز', phone: '01007788995', city: 'طنطا', address: 'المركز التجاري' }
  ];
  state.data.items = [
    itemFactory({ name: 'طقم ولادي صيفي', unit: 'قطعة', seriesQty: 6, pieceBarcode: '6221001100112', piecePrice: 125, seriesPrice: 750, sizes: '2-4-6-8', stock: 120 }),
    itemFactory({ name: 'فستان بناتي مطرز', unit: 'قطعة', seriesQty: 9, pieceBarcode: '6221001100211', piecePrice: 168, seriesPrice: 1512, sizes: '4-6-8-10', stock: 95 }),
    itemFactory({ name: 'بيجامة أطفال شتوي', unit: 'قطعة', seriesQty: 12, pieceBarcode: '6221001100310', piecePrice: 92, seriesPrice: 1104, sizes: '1-2-3-4', stock: 180 }),
    itemFactory({ name: 'تيشيرت قطن', unit: 'قطعة', seriesQty: 6, pieceBarcode: '6221001100419', piecePrice: 64, seriesPrice: 384, sizes: '2-4-6-8', stock: 210 }),
    itemFactory({ name: 'طقم بيبي شتوي', unit: 'قطعة', seriesQty: 6, pieceBarcode: '6221001100518', piecePrice: 145, seriesPrice: 870, sizes: '0-1-2', stock: 88 })
  ];
  const c1 = state.data.customers[0];
  const c2 = state.data.customers[2];
  const c3 = state.data.customers[1];
  state.data.invoices = [
    invoiceFromSeed(c1, [{ itemId: state.data.items[0].id, mode: 'series', qty: 1 }, { itemId: state.data.items[1].id, mode: 'piece', qty: 4 }], 'percent', 5, '2026-03-20'),
    invoiceFromSeed(c2, [{ itemId: state.data.items[2].id, mode: 'series', qty: 2 }, { itemId: state.data.items[3].id, mode: 'piece', qty: 10 }], 'value', 100, '2026-03-22'),
    invoiceFromSeed(c3, [{ itemId: state.data.items[4].id, mode: 'series', qty: 1 }, { itemId: state.data.items[0].id, mode: 'piece', qty: 7 }], 'value', 0, '2026-03-25')
  ];
  state.data.counters.invoice = 4;
  state.data.activityLogs = [];
  saveData();
  state.draftInvoice = createEmptyInvoice();
  state.selectedCustomerId = null;
  state.selectedInvoiceId = null;
  logActivity('تهيئة', 'تم تحميل البيانات التجريبية');
  renderAll();
  showView('overview');
  showToast('تم تحميل البيانات التجريبية');
}

function cacheDom() {
  const ids = [
    'sidebar','drawerBackdrop','mainStage','viewTitle','breadcrumbs','currentUserBadge','installBtn','seedBtn','menuToggle','loginBtn','loginModal','loginEmail','loginPassword','loginStatus','confirmLoginBtn','toast',
    'invoiceNumber','invoiceDate','invoiceCustomer','invoiceCustomerPhone','barcodeInput','lookupMode','lookupQty','lookupResult','scanAddBtn','cameraBtn','scannerModal','closeScannerBtn','scannerStatus','cameraVideo','previewInvoiceBtn','previewModal','closePreviewBtn','manualItemSelect','manualAddMode','addManualItemBtn','invoiceLines','discountMode','discountValue','subTotalValue','discountAmountValue','grandTotalValue','invoicePreview','printInvoiceBtn','imageInvoiceBtn','saveInvoiceBtn','newInvoiceBtn','heroNewInvoiceBtn',
    'customerName','customerPhone','customerCity','customerAddress','addCustomerBtn','customersTable','exportCustomersBtn','importCustomersBtn','importCustomersInput','customerSearch',
    'itemCode','itemName','itemUnit','itemSeriesQty','itemPieceBarcode','itemSeriesBarcode','itemPiecePrice','itemSeriesPrice','itemSizes','itemStock','generateSeriesBarcodeBtn','scanPieceBarcodeBtn','scanSeriesBarcodeBtn','printBarcodeBtn','addItemBtn','itemsTable','exportItemsBtn','importItemsBtn','importItemsInput','itemSearch','barcodeCard',
    'invoicesReport','customersReport','exportInvoicesBtn','importInvoicesBtn','importInvoicesInput','reportFrom','reportTo','invoiceSearch',
    'activityTable','activitySearch','exportActivityBtn',
    'userName','userEmail','userPassword','userRole','userActive','addUserBtn','usersTable',
    'companyName','companyCity','companyAddress','companyPhone','companyTax','companyLogoText','companyLogoUpload','saveCompanyBtn','companyNameSidebar','companyAddressSidebar','companyLogoPreview','sidebarBrandMark','settingsLogoPreview','settingsCompanyName','settingsCompanyMeta',
    'statInvoices','statSales','statCustomers','statItems','latestInvoices','topCustomers','salesTrend',
    'customerDetailName','customerDetailMeta','customerInvoiceCount','customerSalesTotal','customerLastInvoice','customerInvoicesTable','backToReportsBtn','openCustomerInvoicesBtn',
    'invoiceDetailTitle','invoiceDetailMeta','invoiceDetailPreview','backToCustomerBtn','printSavedInvoiceBtn','imageSavedInvoiceBtn'
  ];
  ids.forEach((id) => state.dom[id] = byId(id));
  state.dom.navButtons = [...document.querySelectorAll('.nav-btn')];
  state.dom.screens = [...document.querySelectorAll('.screen')];
  state.dom.openViewButtons = [...document.querySelectorAll('[data-open-view]')];
}

function bindEvents() {
  state.dom.navButtons.forEach((btn) => btn.addEventListener('click', () => showView(btn.dataset.view)));
  state.dom.openViewButtons.forEach((btn) => btn.addEventListener('click', () => showView(btn.dataset.openView)));
  state.dom.menuToggle.addEventListener('click', toggleSidebar);
  state.dom.drawerBackdrop.addEventListener('click', closeSidebar);
  state.dom.mainStage.addEventListener('click', () => { if (window.innerWidth <= 980) closeSidebar(); });
  state.dom.installBtn.addEventListener('click', installApp);
  state.dom.seedBtn.addEventListener('click', seedDemoData);
  state.dom.loginBtn.addEventListener('click', () => { if (state.currentUser) logoutUser(); else state.dom.loginModal.classList.add('show'); });
  state.dom.confirmLoginBtn.addEventListener('click', handleLogin);
  state.dom.loginPassword.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleLogin(); });
  state.dom.loginEmail.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleLogin(); });
  state.dom.heroNewInvoiceBtn.addEventListener('click', () => showView('invoices'));

  state.dom.invoiceCustomer.addEventListener('change', () => { syncDraftFromForm(); renderInvoiceForm(); renderInvoiceDraft(); });
  state.dom.invoiceDate.addEventListener('change', () => { syncDraftFromForm(); renderInvoiceDraft(); });
  state.dom.discountMode.addEventListener('change', () => { syncDraftFromForm(); renderInvoiceDraft(); });
  state.dom.discountValue.addEventListener('input', () => { syncDraftFromForm(); renderInvoiceDraft(); });
  state.dom.barcodeInput.addEventListener('input', () => { resolveLookup(); scheduleAutoAddFromInput(); });
  state.dom.barcodeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addByLookup(); } });
  state.dom.lookupMode.addEventListener('change', renderLookupResult);
  state.dom.lookupQty.addEventListener('input', renderLookupResult);
  state.dom.scanAddBtn.addEventListener('click', addByLookup);
  state.dom.addManualItemBtn.addEventListener('click', addManualItem);
  state.dom.manualItemSelect.addEventListener('change', syncManualSelectionToLookup);
  state.dom.newInvoiceBtn.addEventListener('click', resetDraftInvoice);
  state.dom.saveInvoiceBtn.addEventListener('click', saveInvoice);
  state.dom.previewInvoiceBtn.addEventListener('click', openPreviewModal);
  state.dom.closePreviewBtn.addEventListener('click', closePreviewModal);
  state.dom.printInvoiceBtn.addEventListener('click', printCurrentInvoice);
  state.dom.imageInvoiceBtn.addEventListener('click', () => downloadInvoiceImage(state.draftInvoice, state.draftInvoice.number));
  state.dom.invoiceLines.addEventListener('input', handleInvoiceLineInput);
  state.dom.invoiceLines.addEventListener('click', handleInvoiceLineClick);
  state.dom.cameraBtn.addEventListener('click', () => openCamera('invoice'));
  state.dom.closeScannerBtn.addEventListener('click', closeCamera);

  state.dom.addCustomerBtn.addEventListener('click', addCustomer);
  state.dom.customerSearch.addEventListener('input', renderCustomers);
  state.dom.customersTable.addEventListener('click', handleCustomersTableClick);
  state.dom.exportCustomersBtn.addEventListener('click', () => exportExcel('customers', customersExportRows(), 'تصدير العملاء'));
  state.dom.importCustomersBtn.addEventListener('click', () => state.dom.importCustomersInput.click());
  state.dom.importCustomersInput.addEventListener('change', async (e) => importCustomers(await readImportedRows(e.target.files?.[0])));

  state.dom.generateSeriesBarcodeBtn.addEventListener('click', () => updateSeriesBarcode(true));
  state.dom.scanPieceBarcodeBtn.addEventListener('click', () => openCamera('itemPiece'));
  state.dom.scanSeriesBarcodeBtn.addEventListener('click', () => openCamera('itemSeries'));
  state.dom.printBarcodeBtn.addEventListener('click', printBarcodeCard);
  state.dom.addItemBtn.addEventListener('click', addItem);
  state.dom.itemPieceBarcode.addEventListener('input', () => updateSeriesBarcode(false));
  state.dom.itemSeriesQty.addEventListener('change', () => updateSeriesBarcode(false));
  state.dom.itemSeriesBarcode.addEventListener('input', renderBarcodeCard);
  state.dom.itemName.addEventListener('input', renderBarcodeCard);
  state.dom.itemSearch.addEventListener('input', renderItems);
  state.dom.itemsTable.addEventListener('click', handleItemsTableClick);
  state.dom.exportItemsBtn.addEventListener('click', () => exportExcel('items', itemsExportRows(), 'تصدير المواد'));
  state.dom.importItemsBtn.addEventListener('click', () => state.dom.importItemsInput.click());
  state.dom.importItemsInput.addEventListener('change', async (e) => importItems(await readImportedRows(e.target.files?.[0])));

  state.dom.reportFrom.addEventListener('change', renderReports);
  state.dom.reportTo.addEventListener('change', renderReports);
  state.dom.invoiceSearch.addEventListener('input', renderReports);
  state.dom.invoicesReport.addEventListener('click', handleInvoicesReportClick);
  state.dom.customersReport.addEventListener('click', handleCustomersReportClick);
  state.dom.customerInvoicesTable.addEventListener('click', handleCustomerInvoicesClick);
  state.dom.backToReportsBtn.addEventListener('click', () => showView('reports'));
  state.dom.openCustomerInvoicesBtn.addEventListener('click', () => showView('reports'));
  state.dom.backToCustomerBtn.addEventListener('click', () => showView('customer-detail'));
  state.dom.printSavedInvoiceBtn.addEventListener('click', printSavedInvoice);
  state.dom.imageSavedInvoiceBtn.addEventListener('click', () => {
    const invoice = findInvoice(state.selectedInvoiceId);
    if (invoice) downloadInvoiceImage(invoice, invoice.number);
  });
  state.dom.exportInvoicesBtn.addEventListener('click', () => exportExcel('invoices', invoicesExportRows(filteredInvoices()), 'تصدير الفواتير'));
  state.dom.importInvoicesBtn.addEventListener('click', () => state.dom.importInvoicesInput.click());
  state.dom.importInvoicesInput.addEventListener('change', async (e) => importInvoices(await readImportedRows(e.target.files?.[0])));

  state.dom.activitySearch.addEventListener('input', renderActivity);
  state.dom.exportActivityBtn.addEventListener('click', () => exportExcel('activity-log', activityExportRows(), 'تصدير سجل الحركات'));

  state.dom.addUserBtn.addEventListener('click', addUser);
  state.dom.usersTable.addEventListener('click', handleUsersTableClick);

  state.dom.companyLogoUpload.addEventListener('change', handleLogoUpload);
  state.dom.saveCompanyBtn.addEventListener('click', saveCompany);

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    state.deferredPrompt = e;
  });
}

function toggleSidebar(e) {
  e?.stopPropagation?.();
  state.dom.sidebar.classList.toggle('open');
  state.dom.drawerBackdrop.classList.toggle('show', state.dom.sidebar.classList.contains('open'));
}

function closeSidebar() {
  state.dom.sidebar.classList.remove('open');
  state.dom.drawerBackdrop.classList.remove('show');
}

function showView(view) {
  state.currentView = view;
  state.dom.screens.forEach((screen) => screen.classList.toggle('active-screen', screen.id === view));
  state.dom.navButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.view === view));
  const titles = {
    overview: 'الرئيسية', invoices: 'الفواتير', customers: 'العملاء', 'customer-detail': 'تفاصيل العميل', items: 'المواد', reports: 'التقارير', activity: 'سجل الحركات', 'invoice-detail': 'تفاصيل الفاتورة', users: 'المستخدمون', settings: 'الإعدادات'
  };
  state.dom.viewTitle.textContent = titles[view] || 'JOOD KIDS';
  state.dom.breadcrumbs.textContent = breadcrumbFor(view);
  closeSidebar();
  if (view === 'customer-detail') renderCustomerDetail();
  if (view === 'invoice-detail') renderInvoiceDetail();
  if (view === 'reports') renderReports();
  if (view === 'customers') renderCustomers();
  if (view === 'items') renderItems();
  if (view === 'invoices') renderInvoiceDraft();
  if (view === 'activity') renderActivity();
}

function breadcrumbFor(view) {
  if (view === 'customer-detail') return `JOOD KIDS / Reports / ${findCustomer(state.selectedCustomerId)?.name || 'Customer'}`;
  if (view === 'invoice-detail') return `JOOD KIDS / Reports / ${findInvoice(state.selectedInvoiceId)?.number || 'Invoice'}`;
  if (view === 'activity') return 'JOOD KIDS / Admin / Activity Log';
  const label = ({overview:'Dashboard', invoices:'Invoices', customers:'Customers', items:'Items', reports:'Reports', users:'Users', settings:'Settings'})[view] || 'Dashboard';
  return `JOOD KIDS / ${label}`;
}

async function handleLogin() {
  const email = state.dom.loginEmail.value.trim().toLowerCase();
  const password = state.dom.loginPassword.value;
  if (!email || !password) return setLoginStatus('أدخل المستخدم وكلمة المرور');
  setLoginStatus('');
  state.dom.confirmLoginBtn.disabled = true;
  let user = null;
  let remoteAuth = null;
  try {
    const inputHash = await sha256(password);
    user = state.data.users.find((u) => u.active && String(u.email || '').trim().toLowerCase() === email && u.passwordHash === inputHash) || null;
    if (window.JOOD_REMOTE?.signIn) {
      try {
        remoteAuth = await window.JOOD_REMOTE.signIn(email, password);
      } catch {}
    }
    if (!user && remoteAuth) {
      user = state.data.users.find((u) => String(u.email || '').trim().toLowerCase() === email || String(u.firebaseUid || '') === String(remoteAuth.uid || '')) || null;
    }
    if (!user && remoteAuth) {
      user = {
        id: uid(),
        name: email.split('@')[0],
        email,
        role: isAdminIdentity(email, remoteAuth.uid) ? 'admin' : 'sales',
        active: true,
        firebaseUid: remoteAuth.uid || '',
        passwordHash: inputHash
      };
      state.data.users.unshift(user);
      saveData();
    }
    if (!user) return setLoginStatus('بيانات الدخول غير صحيحة');
    if (remoteAuth?.uid) user.firebaseUid = remoteAuth.uid;
    if (isAdminIdentity(user.email, user.firebaseUid)) user.role = 'admin';
    user.email = email;
    user.active = true;
    state.currentUser = user;
    renderAuthUI();
    state.dom.loginModal.classList.remove('show');
    state.dom.loginPassword.value = '';
    logActivity('دخول', `${user.name} · ${user.role}`);
    await hydrateFromRemote();
    renderUsers();
    renderActivity();
  } finally {
    state.dom.confirmLoginBtn.disabled = false;
  }
}

function setLoginStatus(message) {
  state.dom.loginStatus.textContent = message || '';
}

function renderAuthUI() {
  state.dom.currentUserBadge.textContent = state.currentUser ? `${state.currentUser.name} · ${state.currentUser.role}` : 'Guest';
  state.dom.loginBtn.textContent = state.currentUser ? 'تسجيل الخروج' : 'تسجيل الدخول';
}

async function logoutUser() {
  try { await window.JOOD_REMOTE?.signOut?.(); } catch {}
  state.currentUser = null;
  renderAuthUI();
  state.dom.loginModal.classList.add('show');
}

function renderLoginUsers() {
  if (!state.dom.loginEmail.value) state.dom.loginEmail.value = adminEmailValue();
}

function renderAll() {
  renderCompany();
  renderOverview();
  renderCustomers();
  renderItems();
  renderUsers();
  renderReports();
  renderActivity();
  renderInvoiceForm();
  renderLookupResult();
  renderInvoiceDraft();
  renderCustomerDetail();
  renderInvoiceDetail();
}

function renderCompany() {
  const company = state.data.company;
  state.dom.companyName.value = company.name;
  state.dom.companyCity.value = company.city;
  state.dom.companyAddress.value = company.address;
  state.dom.companyPhone.value = company.phone;
  state.dom.companyTax.value = company.tax;
  state.dom.companyLogoText.value = company.logoText;
  state.dom.companyNameSidebar.textContent = company.name;
  state.dom.companyAddressSidebar.textContent = company.address;
  state.dom.settingsCompanyName.textContent = company.name;
  state.dom.settingsCompanyMeta.textContent = `${company.address} · ${company.phone}`;
  applyLogo(state.dom.companyLogoPreview, company.logoDataUrl, company.logoText);
  applyLogo(state.dom.settingsLogoPreview, company.logoDataUrl, company.logoText);
  applyLogo(state.dom.sidebarBrandMark, company.logoDataUrl, company.logoText || 'JK');
  applyLogo(byId('loginBrandMark'), company.logoDataUrl, company.logoText || 'JK');
}

function applyLogo(element, logoDataUrl, text) {
  if (!element) return;
  if (logoDataUrl) {
    element.style.backgroundImage = `url(${logoDataUrl})`;
    element.textContent = '';
  } else {
    element.style.backgroundImage = 'none';
    element.textContent = (text || 'JK').slice(0, 4).toUpperCase();
  }
}

function renderOverview() {
  const invoices = state.data.invoices;
  const totalSales = invoices.reduce((sum, inv) => sum + Number(inv.total || 0), 0);
  state.dom.statInvoices.textContent = String(invoices.length);
  state.dom.statSales.textContent = money(totalSales);
  state.dom.statCustomers.textContent = String(state.data.customers.length);
  state.dom.statItems.textContent = String(state.data.items.length);

  state.dom.latestInvoices.innerHTML = tableHTML(
    ['رقم الفاتورة', 'التاريخ', 'العميل', 'الصافي'],
    invoices.slice(0, 6).map((inv) => `<tr class="clickable-row go-invoice" data-id="${inv.id}"><td class="row-link">${esc(inv.number)}</td><td>${esc(formatDisplayDate(inv.date))}</td><td>${esc(customerName(inv.customerId))}</td><td>${money(inv.total)}</td></tr>`),
    'لا توجد فواتير'
  );
  state.dom.latestInvoices.querySelectorAll('.go-invoice').forEach((row) => row.addEventListener('click', () => openInvoiceDetail(row.dataset.id)));

  const customerMap = new Map();
  invoices.forEach((inv) => customerMap.set(inv.customerId, (customerMap.get(inv.customerId) || 0) + Number(inv.total || 0)));
  const rankedCustomers = [...customerMap.entries()].map(([customerId, total]) => ({ customerId, total, name: customerName(customerId) })).sort((a, b) => b.total - a.total).slice(0, 5);
  state.dom.topCustomers.innerHTML = rankedCustomers.length ? rankedCustomers.map((entry) => `<div class="stack-card clickable-row go-customer" data-id="${entry.customerId}"><div><strong>${esc(entry.name)}</strong><small>مبيعات</small></div><b>${money(entry.total)}</b></div>`).join('') : `<div class="invoice-line-empty">لا توجد بيانات</div>`;
  state.dom.topCustomers.querySelectorAll('.go-customer').forEach((card) => card.addEventListener('click', () => openCustomerDetail(card.dataset.id)));
  renderTrend();
}

function renderTrend() {
  const monthTotals = {};
  state.data.invoices.forEach((inv) => {
    const d = parseDateValue(inv.date);
    if (!d) return;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    monthTotals[key] = (monthTotals[key] || 0) + Number(inv.total || 0);
  });
  const keys = Object.keys(monthTotals).sort().slice(-6);
  const max = Math.max(1, ...keys.map((k) => monthTotals[k]));
  state.dom.salesTrend.innerHTML = keys.length ? keys.map((key) => {
    const height = Math.max(18, (monthTotals[key] / max) * 180);
    const label = key.slice(5);
    return `<div class="trend-col"><div class="trend-bar" style="height:${height}px"></div><strong>${money(monthTotals[key])}</strong><small>${esc(label)}</small></div>`;
  }).join('') : `<div class="invoice-line-empty">لا توجد حركة</div>`;
}

function renderCustomers() {
  const q = state.dom.customerSearch.value.trim().toLowerCase();
  const rows = state.data.customers.filter((c) => !q || [c.name, c.phone, c.city, c.address].join(' ').toLowerCase().includes(q)).map((customer) => {
    const invoices = state.data.invoices.filter((inv) => inv.customerId === customer.id);
    const total = invoices.reduce((sum, inv) => sum + Number(inv.total || 0), 0);
    return `<tr class="clickable-row open-customer" data-id="${customer.id}"><td class="row-link">${esc(customer.name)}</td><td>${esc(customer.phone || '—')}</td><td>${esc(customer.city || '—')}</td><td>${esc(customer.address || '—')}</td><td>${invoices.length}</td><td>${money(total)}</td><td><button class="danger-btn remove-customer" data-id="${customer.id}">حذف</button></td></tr>`;
  });
  state.dom.customersTable.innerHTML = tableHTML(['الاسم', 'الموبايل', 'المدينة', 'العنوان', 'الفواتير', 'المبيعات', ''], rows, 'لا توجد بيانات');
}

function handleCustomersTableClick(e) {
  const removeBtn = e.target.closest('.remove-customer');
  if (removeBtn) {
    const customerId = removeBtn.dataset.id;
    const customer = findCustomer(customerId);
    state.data.customers = state.data.customers.filter((c) => c.id !== customerId);
    state.data.invoices = state.data.invoices.filter((inv) => inv.customerId !== customerId);
    saveData();
    logActivity('حذف عميل', customer?.name || customerId);
    renderAll();
    showToast('تم حذف العميل');
    return;
  }
  const row = e.target.closest('.open-customer');
  if (row) openCustomerDetail(row.dataset.id);
}

function renderCustomerDetail() {
  const customer = findCustomer(state.selectedCustomerId);
  if (!customer) {
    state.dom.customerDetailName.textContent = '—';
    state.dom.customerDetailMeta.textContent = '—';
    state.dom.customerInvoiceCount.textContent = '0';
    state.dom.customerSalesTotal.textContent = '0.00';
    state.dom.customerLastInvoice.textContent = '—';
    state.dom.customerInvoicesTable.innerHTML = tableHTML(['رقم الفاتورة', 'التاريخ', 'الإجمالي', 'الخصم', 'الصافي'], [], 'لا توجد بيانات');
    return;
  }
  const invoices = state.data.invoices.filter((inv) => inv.customerId === customer.id);
  const total = invoices.reduce((sum, inv) => sum + Number(inv.total || 0), 0);
  const lastInvoice = invoices[0];
  state.dom.customerDetailName.textContent = customer.name;
  state.dom.customerDetailMeta.textContent = `${customer.phone || '—'} · ${customer.city || '—'} · ${customer.address || '—'}`;
  state.dom.customerInvoiceCount.textContent = String(invoices.length);
  state.dom.customerSalesTotal.textContent = money(total);
  state.dom.customerLastInvoice.textContent = lastInvoice ? lastInvoice.number : '—';
  state.dom.customerInvoicesTable.innerHTML = tableHTML(['رقم الفاتورة', 'التاريخ', 'الإجمالي', 'الخصم', 'الصافي'], invoices.map((inv) => `<tr class="clickable-row open-invoice" data-id="${inv.id}"><td class="row-link">${esc(inv.number)}</td><td>${esc(formatDisplayDate(inv.date))}</td><td>${money(inv.subTotal)}</td><td>${money(inv.discountAmount)}</td><td>${money(inv.total)}</td></tr>`), 'لا توجد فواتير');
}

function handleCustomerInvoicesClick(e) {
  const row = e.target.closest('.open-invoice');
  if (row) openInvoiceDetail(row.dataset.id);
}

function renderItems() {
  const q = state.dom.itemSearch.value.trim().toLowerCase();
  const rows = state.data.items.filter((item) => !q || [item.code, item.name, item.pieceBarcode, item.seriesBarcode, item.sizes].join(' ').toLowerCase().includes(q)).map((item) => `<tr><td>${esc(item.code)}</td><td>${esc(item.name)}</td><td>${esc(item.unit)}</td><td>${esc(String(item.seriesQty))}</td><td>${esc(item.pieceBarcode || '—')}</td><td>${esc(item.seriesBarcode || '—')}</td><td>${money(item.piecePrice)}</td><td>${money(item.seriesPrice)}</td><td>${esc(item.sizes || '—')}</td><td>${esc(String(item.stock))}</td><td><button class="danger-btn remove-item" data-id="${item.id}">حذف</button></td></tr>`);
  state.dom.itemsTable.innerHTML = tableHTML(['كود', 'الصنف', 'الوحدة', 'السيري', 'باركود القطعة', 'باركود السيري', 'سعر القطعة', 'سعر السيري', 'المقاسات', 'المخزون', ''], rows, 'لا توجد مواد');
  renderBarcodeCard();
}

function handleItemsTableClick(e) {
  const removeBtn = e.target.closest('.remove-item');
  if (!removeBtn) return;
  const item = state.data.items.find((x) => x.id === removeBtn.dataset.id);
  state.data.items = state.data.items.filter((itm) => itm.id !== removeBtn.dataset.id);
  saveData();
  logActivity('حذف مادة', item?.name || removeBtn.dataset.id);
  renderAll();
  showToast('تم حذف المادة');
}

function filteredInvoices() {
  const q = state.dom.invoiceSearch.value.trim().toLowerCase();
  const from = parseDateValue(state.dom.reportFrom.value);
  const to = parseDateValue(state.dom.reportTo.value);
  return state.data.invoices.filter((inv) => {
    const d = parseDateValue(inv.date);
    if (from && d < from) return false;
    if (to && d > to) return false;
    if (!q) return true;
    return [inv.number, customerName(inv.customerId), inv.date].join(' ').toLowerCase().includes(q);
  });
}

function renderReports() {
  const invoices = filteredInvoices();
  state.dom.invoicesReport.innerHTML = tableHTML(['رقم الفاتورة', 'التاريخ', 'العميل', 'الإجمالي', 'الخصم', 'الصافي'], invoices.map((inv) => `<tr class="clickable-row report-invoice" data-id="${inv.id}"><td class="row-link">${esc(inv.number)}</td><td>${esc(formatDisplayDate(inv.date))}</td><td>${esc(customerName(inv.customerId))}</td><td>${money(inv.subTotal)}</td><td>${money(inv.discountAmount)}</td><td>${money(inv.total)}</td></tr>`), 'لا توجد بيانات');

  const customerMap = new Map();
  invoices.forEach((inv) => {
    const bucket = customerMap.get(inv.customerId) || { count: 0, total: 0, lastDate: '' };
    bucket.count += 1;
    bucket.total += Number(inv.total || 0);
    bucket.lastDate = inv.date > bucket.lastDate ? inv.date : bucket.lastDate;
    customerMap.set(inv.customerId, bucket);
  });
  const customerRows = [...customerMap.entries()].map(([customerId, meta]) => ({ customerId, name: customerName(customerId), ...meta })).sort((a, b) => b.total - a.total);
  state.dom.customersReport.innerHTML = tableHTML(['العميل', 'عدد الفواتير', 'إجمالي المبيعات', 'آخر فاتورة'], customerRows.map((row) => `<tr class="clickable-row report-customer" data-id="${row.customerId}"><td class="row-link">${esc(row.name)}</td><td>${row.count}</td><td>${money(row.total)}</td><td>${esc(formatDisplayDate(row.lastDate))}</td></tr>`), 'لا توجد بيانات');
}

function handleInvoicesReportClick(e) {
  const row = e.target.closest('.report-invoice');
  if (row) openInvoiceDetail(row.dataset.id);
}

function handleCustomersReportClick(e) {
  const row = e.target.closest('.report-customer');
  if (row) openCustomerDetail(row.dataset.id);
}

function renderActivity() {
  if (state.currentUser?.role !== 'admin') {
    state.dom.activityTable.innerHTML = '<div class="admin-lock">صلاحية الأدمن فقط</div>';
    return;
  }
  const q = state.dom.activitySearch.value.trim().toLowerCase();
  const rows = state.data.activityLogs.filter((log) => !q || [log.action, log.detail, log.user, log.role, log.at].join(' ').toLowerCase().includes(q)).map((log) => `<tr><td>${esc(formatDateTime(log.at))}</td><td>${esc(log.action)}</td><td>${esc(log.detail || '—')}</td><td>${esc(log.user)}</td><td>${esc(log.role)}</td></tr>`);
  state.dom.activityTable.innerHTML = tableHTML(['الوقت', 'الحركة', 'التفاصيل', 'المستخدم', 'الصلاحية'], rows, 'لا توجد حركات');
}

function renderUsers() {
  const currentRole = state.currentUser?.role || 'guest';
  const noAccess = currentRole !== 'admin';
  state.dom.addUserBtn.disabled = noAccess;
  ['userName','userEmail','userPassword','userRole','userActive'].forEach((id) => state.dom[id].disabled = noAccess);
  const rows = state.data.users.map((user) => `<tr><td>${esc(user.name)}</td><td>${esc(user.email)}</td><td><span class="tag tag-${esc(user.role)}">${esc(user.role)}</span></td><td>${user.active ? 'نشط' : 'موقوف'}</td><td><button class="ghost-btn toggle-user" data-id="${user.id}">${user.active ? 'إيقاف' : 'تفعيل'}</button></td><td><button class="danger-btn remove-user" data-id="${user.id}">حذف</button></td></tr>`);
  state.dom.usersTable.innerHTML = tableHTML(['الاسم', 'البريد', 'الصلاحية', 'الحالة', '', ''], rows, 'لا يوجد مستخدمون');
}

function handleUsersTableClick(e) {
  const toggleBtn = e.target.closest('.toggle-user');
  if (toggleBtn) {
    if (state.currentUser?.role !== 'admin') return showToast('صلاحية الأدمن فقط');
    const user = state.data.users.find((u) => u.id === toggleBtn.dataset.id);
    if (!user) return;
    user.active = !user.active;
    saveData();
    logActivity('تحديث مستخدم', `${user.name} · ${user.active ? 'نشط' : 'موقوف'}`);
    renderUsers();
    renderLoginUsers();
    renderActivity();
    showToast('تم تحديث الحالة');
    return;
  }
  const removeBtn = e.target.closest('.remove-user');
  if (removeBtn) {
    if (state.currentUser?.role !== 'admin') return showToast('صلاحية الأدمن فقط');
    const user = state.data.users.find((u) => u.id === removeBtn.dataset.id);
    state.data.users = state.data.users.filter((u) => u.id !== removeBtn.dataset.id);
    saveData();
    logActivity('حذف مستخدم', user?.name || removeBtn.dataset.id);
    renderUsers();
    renderLoginUsers();
    renderActivity();
    showToast('تم حذف المستخدم');
  }
}

function renderInvoiceForm() {
  if (!state.draftInvoice) state.draftInvoice = createEmptyInvoice();
  state.dom.invoiceNumber.value = state.draftInvoice.number;
  state.dom.invoiceDate.value = state.draftInvoice.date;
  state.dom.discountMode.value = state.draftInvoice.discountMode;
  state.dom.discountValue.value = state.draftInvoice.discountValue;
  state.dom.invoiceCustomer.innerHTML = `<option value="">اختر العميل</option>` + state.data.customers.map((c) => `<option value="${c.id}" ${c.id === state.draftInvoice.customerId ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  state.dom.invoiceCustomerPhone.value = findCustomer(state.draftInvoice.customerId)?.phone || '';
  state.dom.manualItemSelect.innerHTML = `<option value="">اختر مادة</option>` + state.data.items.map((item) => `<option value="${item.id}">${esc(item.code)} · ${esc(item.name)}</option>`).join('');
}

function syncDraftFromForm() {
  state.draftInvoice.customerId = state.dom.invoiceCustomer.value;
  state.draftInvoice.date = state.dom.invoiceDate.value || today();
  state.draftInvoice.discountMode = state.dom.discountMode.value;
  state.draftInvoice.discountValue = Number(state.dom.discountValue.value || 0);
  finalizeInvoice(state.draftInvoice);
}

function findLookupMeta(term) {
  const value = String(term || '').trim();
  if (!value) return null;
  const item = state.data.items.find((entry) => String(entry.code) === value || String(entry.pieceBarcode) === value || String(entry.seriesBarcode) === value);
  if (!item) return null;
  let matched = 'code';
  if (String(item.seriesBarcode) === value) matched = 'series';
  else if (String(item.pieceBarcode) === value) matched = 'piece';
  return { item, matched };
}

function findItemByLookup(term) {
  return findLookupMeta(term)?.item || null;
}

function resolveLookup() {
  const meta = findLookupMeta(state.dom.barcodeInput.value);
  state.resolvedLookup = meta?.item || null;
  renderLookupResult();
}

function effectiveLookupMode() {
  if (!state.resolvedLookup) return 'piece';
  const requested = state.dom.lookupMode.value;
  if (requested === 'auto') {
    const typed = String(state.dom.barcodeInput.value || '').trim();
    return typed && typed === String(state.resolvedLookup.seriesBarcode) ? 'series' : 'piece';
  }
  return requested;
}

function scheduleAutoAddFromInput() {
  clearTimeout(state.lookupAutoTimer);
  const value = String(state.dom.barcodeInput.value || '').trim();
  if (!value) return;
  state.lookupAutoTimer = setTimeout(() => {
    const meta = findLookupMeta(value);
    if (!meta) return;
    if (meta.matched === 'piece' || meta.matched === 'series') addByLookup();
  }, 120);
}

function renderLookupResult() {
  const item = state.resolvedLookup;
  if (!item) {
    state.dom.lookupResult.className = 'lookup-card empty-state';
    state.dom.lookupResult.innerHTML = '<div>أدخل رقم المادة أو الباركود</div>';
    return;
  }
  const mode = effectiveLookupMode();
  const qty = Math.max(1, Number(state.dom.lookupQty.value || 1));
  const unitPrice = mode === 'series' ? item.seriesPrice : item.piecePrice;
  const totalQty = mode === 'series' ? qty * Number(item.seriesQty || 0) : qty;
  const detected = mode === 'series' ? `تم التعرف على باركود السيري ${item.seriesBarcode}` : `تم التعرف على باركود القطعة ${item.pieceBarcode}`;
  state.dom.lookupResult.className = 'lookup-card';
  state.dom.lookupResult.innerHTML = `
    <div class="lookup-grid">
      <div class="lookup-main">
        <span class="lookup-pill">${mode === 'series' ? `سيري ${item.seriesQty}` : 'قطعة'}</span>
        <strong>${esc(item.name)}</strong>
        <div class="lookup-meta">كود: ${esc(item.code)}<br>الوحدة: ${esc(item.unit)}<br>المقاسات: ${esc(item.sizes || '—')}<br>المخزون: ${esc(String(item.stock))}<br>${esc(detected)}</div>
      </div>
      <div class="lookup-pricing">
        <div><span>السعر</span><strong>${money(unitPrice)}</strong></div>
        <div><span>الكمية</span><strong>${qty}</strong></div>
        <div><span>الإجمالي</span><strong>${money(unitPrice * qty)}</strong></div>
        <div><span>إجمالي القطع</span><strong>${totalQty}</strong></div>
      </div>
    </div>`;
}

function addLineFromItem(item, mode = 'piece', qty = 1) {
  syncDraftFromForm();
  const resolvedMode = mode === 'series' ? 'series' : 'piece';
  const normalizedQty = Math.max(1, Number(qty || 1));
  const unitPrice = resolvedMode === 'series' ? Number(item.seriesPrice || 0) : Number(item.piecePrice || 0);
  const barcode = resolvedMode === 'series' ? item.seriesBarcode : item.pieceBarcode;
  const existing = state.draftInvoice.lines.find((line) => line.itemId === item.id && line.mode === resolvedMode && line.barcode === barcode && line.unitPrice === unitPrice);
  if (existing) {
    existing.qty += normalizedQty;
    existing.pieceQty = resolvedMode === 'series' ? existing.qty * Number(item.seriesQty || 0) : existing.qty;
    existing.total = existing.qty * existing.unitPrice;
  } else {
    state.draftInvoice.lines.push({
      id: uid(),
      itemId: item.id,
      itemCode: item.code,
      barcode,
      name: item.name,
      unit: resolvedMode === 'series' ? `سيري ${item.seriesQty}` : item.unit,
      qty: normalizedQty,
      unitPrice,
      total: normalizedQty * unitPrice,
      mode: resolvedMode,
      pieceQty: resolvedMode === 'series' ? Number(item.seriesQty || 0) * normalizedQty : normalizedQty,
      seriesQty: Number(item.seriesQty || 0)
    });
  }
  renderInvoiceDraft();
}

function sanitizeLookupQty() {
  const qty = Math.max(1, Number(state.dom.lookupQty.value || 1));
  state.dom.lookupQty.value = qty;
  return qty;
}

function addByLookup() {
  const item = state.resolvedLookup || findItemByLookup(state.dom.barcodeInput.value);
  if (!item) return showToast('لم يتم العثور على الصنف');
  const mode = effectiveLookupMode();
  const qty = sanitizeLookupQty();
  addLineFromItem(item, mode, qty);
  const label = mode === 'series' ? `سيري ${item.seriesQty}` : 'قطعة';
  showToast(`تمت إضافة ${esc(item.name)} · ${label}`.replace(/&[^;]+;/g, ''));
  state.dom.barcodeInput.value = '';
  state.resolvedLookup = null;
  renderLookupResult();
  state.dom.barcodeInput.focus();
}

function syncManualSelectionToLookup() {
  const item = state.data.items.find((i) => i.id === state.dom.manualItemSelect.value);
  if (!item) return;
  state.dom.barcodeInput.value = item.code;
  state.resolvedLookup = item;
  renderLookupResult();
}

function addManualItem() {
  const item = state.data.items.find((i) => i.id === state.dom.manualItemSelect.value);
  if (!item) return showToast('اختر مادة');
  addLineFromItem(item, state.dom.manualAddMode.value, 1);
}

function renderInvoiceDraft() {
  syncDraftFromForm();
  state.dom.invoiceLines.innerHTML = state.draftInvoice.lines.length ? state.draftInvoice.lines.map((line) => `<tr><td>${line.seq}</td><td>${esc(line.barcode || '—')}</td><td>${esc(line.name)}</td><td>${esc(line.unit)}</td><td><input class="line-qty-input" type="number" min="1" value="${line.qty}" data-id="${line.id}" /></td><td>${money(line.unitPrice)}</td><td>${money(line.total)}</td><td><button class="danger-btn delete-row" data-id="${line.id}">حذف</button></td></tr>`).join('') : `<tr><td colspan="8" class="invoice-line-empty">لا توجد أصناف</td></tr>`;
  state.dom.subTotalValue.textContent = money(state.draftInvoice.subTotal);
  state.dom.discountAmountValue.textContent = money(state.draftInvoice.discountAmount);
  state.dom.grandTotalValue.textContent = money(state.draftInvoice.total);
  state.dom.invoicePreview.innerHTML = invoiceHTML(state.draftInvoice, 'invoiceSheet');
}

function handleInvoiceLineInput(e) {
  const input = e.target.closest('.line-qty-input');
  if (!input) return;
  const line = state.draftInvoice.lines.find((l) => l.id === input.dataset.id);
  if (!line) return;
  line.qty = Math.max(1, Number(input.value || 1));
  line.total = line.qty * line.unitPrice;
  line.pieceQty = line.mode === 'series' ? line.qty * Number(line.seriesQty || 0) : line.qty;
  renderInvoiceDraft();
}

function handleInvoiceLineClick(e) {
  const btn = e.target.closest('.delete-row');
  if (!btn) return;
  state.draftInvoice.lines = state.draftInvoice.lines.filter((line) => line.id !== btn.dataset.id);
  renderInvoiceDraft();
}

function invoiceHTML(inv, sheetId = 'invoiceSheet') {
  const customer = findCustomer(inv.customerId) || {};
  const company = state.data.company;
  const discountRow = Number(inv.discountAmount || 0) > 0 ? `<div><span>الخصم</span><strong>${money(inv.discountAmount)}</strong></div>` : '';
  const lineCount = (inv.lines || []).reduce((sum, line) => sum + Number(line.qty || 0), 0);
  const lines = (inv.lines || []).map((line) => `<tr><td>${line.seq}</td><td>${esc(line.barcode || '—')}</td><td>${esc(line.name)}</td><td>${esc(line.unit)}</td><td>${line.qty}</td><td>${money(line.unitPrice)}</td><td>${money(line.total)}</td></tr>`).join('');
  const logoInner = company.logoDataUrl ? '' : esc(company.logoText || 'JK');
  const logoStyle = company.logoDataUrl ? ` style="background-image:url(${company.logoDataUrl})"` : '';
  return `
    <div class="invoice-sheet" id="${sheetId}">
      <div class="invoice-watermark">${esc(company.name)}</div>
      <div class="invoice-banner">
        <div class="invoice-banner-top">
          <div class="invoice-brand">
            <div class="invoice-logo"${logoStyle}>${logoInner}</div>
            <div>
              <h2>${esc(company.name)}</h2>
              <div class="detail-line">${esc(company.address)}</div>
              <div class="detail-line">${esc(company.phone)} · ${esc(company.tax)}</div>
            </div>
          </div>
          <div class="invoice-side">
            <div class="section-label">Sales Invoice</div>
            <h3>فاتورة مبيعات</h3>
            <div class="invoice-number">${esc(inv.number)}</div>
          </div>
        </div>
      </div>

      <div class="invoice-meta-ribbon">
        <div class="meta-card"><small>التاريخ</small><strong>${esc(formatDisplayDate(inv.date))}</strong></div>
        <div class="meta-card"><small>العميل</small><strong>${esc(customer.name || '—')}</strong></div>
        <div class="meta-card"><small>الموبايل</small><strong>${esc(customer.phone || '—')}</strong></div>
        <div class="meta-card"><small>المدينة</small><strong>${esc(customer.city || '—')}</strong></div>
        <div class="meta-card"><small>العنوان</small><strong>${esc(customer.address || '—')}</strong></div>
        <div class="meta-card"><small>عدد السطور</small><strong>${esc(String((inv.lines || []).length))}</strong></div>
        <div class="meta-card"><small>إجمالي الكمية</small><strong>${esc(String(lineCount))}</strong></div>
        <div class="meta-card"><small>رقم الفاتورة</small><strong>${esc(inv.number)}</strong></div>
      </div>

      <div class="invoice-table-wrap">
        <table class="invoice-table">
          <thead><tr><th>م</th><th>الباركود</th><th>الصنف</th><th>الوحدة</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead>
          <tbody>${lines || `<tr><td colspan="7" class="invoice-line-empty">لا توجد أصناف</td></tr>`}</tbody>
        </table>
      </div>

      <div class="invoice-footer-grid">
        <div class="invoice-note-box">
          <h4>بيانات العميل</h4>
          <p>${esc(customer.address || '—')}</p>
          <p style="margin-top:12px">يسعدنا خدمتكم دائمًا في ${esc(company.name)}</p>
        </div>
        <div class="invoice-summary">
          <div><span>الإجمالي</span><strong>${money(inv.subTotal)}</strong></div>
          ${discountRow}
          <div class="invoice-grand"><span>الصافي</span><strong>${money(inv.total)}</strong></div>
        </div>
      </div>

      <div class="invoice-signatures">
        <div class="signature-box">توقيع المستلم</div>
        <div class="signature-box">توقيع البائع</div>
      </div>
    </div>`;
}

function saveInvoice() {
  syncDraftFromForm();
  if (!state.draftInvoice.customerId) return showToast('اختر العميل');
  if (!state.draftInvoice.lines.length) return showToast('أضف صنفًا واحدًا على الأقل');
  const saved = JSON.parse(JSON.stringify(finalizeInvoice({ ...state.draftInvoice, lines: state.draftInvoice.lines.map((l) => ({ ...l })) })));
  state.data.invoices.unshift(saved);
  state.selectedInvoiceId = saved.id;
  state.selectedCustomerId = saved.customerId;
  saveData();
  logActivity('حفظ فاتورة', `${saved.number} · ${customerName(saved.customerId)} · ${money(saved.total)}`);
  resetDraftInvoice();
  renderAll();
  openInvoiceDetail(saved.id);
  showToast('تم حفظ الفاتورة');
}

function resetDraftInvoice() {
  state.draftInvoice = createEmptyInvoice();
  state.resolvedLookup = null;
  state.dom.barcodeInput.value = '';
  state.dom.lookupQty.value = '1';
  renderInvoiceForm();
  renderLookupResult();
  renderInvoiceDraft();
}

function openPreviewModal() {
  renderInvoiceDraft();
  state.dom.previewModal.classList.add('show');
}

function closePreviewModal() {
  state.dom.previewModal.classList.remove('show');
}

function printCurrentInvoice() {
  state.dom.previewModal.classList.remove('show');
  showView('invoices');
  window.print();
}

function openCustomerDetail(customerId) {
  state.selectedCustomerId = customerId;
  renderCustomerDetail();
  showView('customer-detail');
}

function openInvoiceDetail(invoiceId) {
  const invoice = findInvoice(invoiceId);
  if (!invoice) return;
  state.selectedInvoiceId = invoiceId;
  state.selectedCustomerId = invoice.customerId;
  renderInvoiceDetail();
  showView('invoice-detail');
}

function renderInvoiceDetail() {
  const invoice = findInvoice(state.selectedInvoiceId);
  if (!invoice) {
    const placeholder = finalizeInvoice({ id: '', number: 'INV-—', date: today(), customerId: '', lines: [], discountMode: 'value', discountValue: 0, subTotal: 0, discountAmount: 0, total: 0 });
    state.dom.invoiceDetailTitle.textContent = '—';
    state.dom.invoiceDetailMeta.textContent = '—';
    state.dom.invoiceDetailPreview.innerHTML = invoiceHTML(placeholder, 'savedInvoiceSheet');
    return;
  }
  state.dom.invoiceDetailTitle.textContent = invoice.number;
  state.dom.invoiceDetailMeta.textContent = `${customerName(invoice.customerId)} · ${formatDisplayDate(invoice.date)} · ${money(invoice.total)}`;
  state.dom.invoiceDetailPreview.innerHTML = invoiceHTML(invoice, 'savedInvoiceSheet');
}

function printSavedInvoice() {
  showView('invoice-detail');
  window.print();
}

async function downloadInvoiceImage(invoiceOrTarget, name) {
  const invoice = invoiceOrTarget && invoiceOrTarget.lines ? invoiceOrTarget : (state.currentView === 'invoice-detail' ? findInvoice(state.selectedInvoiceId) : state.draftInvoice);
  if (!invoice) return;

  const width = 1240;
  const height = 1754;
  const margin = 64;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  const grad = ctx.createLinearGradient(0, 0, width, 0);
  grad.addColorStop(0, '#101733');
  grad.addColorStop(0.55, '#223063');
  grad.addColorStop(1, '#5b3df5');
  ctx.fillStyle = grad;
  roundRect(ctx, margin, margin, width - margin * 2, 220, 36, true, false);

  ctx.fillStyle = 'rgba(255,255,255,.10)';
  ctx.font = '900 96px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(String(state.data.company.name || 'JOOD KIDS'), width / 2, 175);

  const logoX = width - margin - 170;
  const logoY = margin + 30;
  await drawLogoCanvas(ctx, logoX, logoY, 110, state.data.company.logoDataUrl, state.data.company.logoText || 'JK');

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'right';
  ctx.font = '900 40px Arial';
  ctx.fillText(String(state.data.company.name || 'JOOD KIDS'), logoX - 26, margin + 78);
  ctx.font = '500 24px Arial';
  ctx.fillStyle = 'rgba(255,255,255,.86)';
  ctx.fillText(String(state.data.company.address || ''), logoX - 26, margin + 118);
  ctx.fillText(`${state.data.company.phone || ''}   ${state.data.company.tax || ''}`, logoX - 26, margin + 152);

  ctx.textAlign = 'left';
  ctx.fillStyle = '#f7d36b';
  ctx.font = '700 22px Arial';
  ctx.fillText('SALES INVOICE', margin + 34, margin + 78);
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 52px Arial';
  ctx.fillText('فاتورة مبيعات', margin + 34, margin + 136);
  ctx.font = '700 28px Arial';
  ctx.fillText(String(invoice.number || ''), margin + 34, margin + 176);

  const customer = findCustomer(invoice.customerId) || {};
  const cardsTop = margin + 250;
  const cardW = (width - margin * 2 - 36) / 4;
  const meta = [['التاريخ', formatDisplayDate(invoice.date)], ['العميل', customer.name || '—'], ['الموبايل', customer.phone || '—'], ['المدينة', customer.city || '—']];
  meta.forEach((entry, idx) => {
    const x = margin + idx * (cardW + 12);
    ctx.fillStyle = '#f8f9ff';
    roundRect(ctx, x, cardsTop, cardW, 110, 24, true, false);
    ctx.strokeStyle = '#e8ecf8';
    roundRect(ctx, x, cardsTop, cardW, 110, 24, false, true);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#727b9b';
    ctx.font = '600 22px Arial';
    ctx.fillText(entry[0], x + cardW - 20, cardsTop + 34);
    ctx.fillStyle = '#161d39';
    ctx.font = '800 28px Arial';
    ctx.fillText(String(entry[1]), x + cardW - 20, cardsTop + 76);
  });

  const tableTop = cardsTop + 146;
  const cols = [80, 220, 330, 150, 120, 150, 166];
  const headers = ['م', 'الباركود', 'الصنف', 'الوحدة', 'الكمية', 'السعر', 'الإجمالي'];
  let x = margin;
  ctx.fillStyle = '#f5f7ff';
  roundRect(ctx, margin, tableTop, width - margin * 2, 56, 18, true, false);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#1b2343';
  ctx.font = '800 23px Arial';
  headers.forEach((h, idx) => {
    x += cols[idx];
    ctx.fillText(h, x - 14, tableTop + 36);
  });

  let rowY = tableTop + 56;
  const lines = invoice.lines || [];
  if (!lines.length) {
    ctx.fillStyle = '#fff';
    roundRect(ctx, margin, rowY, width - margin * 2, 74, 0, true, false);
    ctx.fillStyle = '#7c85a3';
    ctx.font = '700 22px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('لا توجد أصناف', width / 2, rowY + 44);
    rowY += 74;
  } else {
    lines.forEach((line, idx) => {
      const rowH = 62;
      ctx.fillStyle = idx % 2 === 0 ? '#ffffff' : '#fbfcff';
      ctx.fillRect(margin, rowY, width - margin * 2, rowH);
      ctx.strokeStyle = '#edf0f8';
      ctx.beginPath();
      ctx.moveTo(margin, rowY + rowH);
      ctx.lineTo(width - margin, rowY + rowH);
      ctx.stroke();
      const values = [String(line.seq || idx + 1), String(line.barcode || '—'), String(line.name || ''), String(line.unit || ''), String(line.qty || 1), money(line.unitPrice), money(line.total)];
      let start = margin;
      ctx.fillStyle = '#1b2343';
      ctx.font = '700 21px Arial';
      ctx.textAlign = 'right';
      values.forEach((value, colIdx) => {
        start += cols[colIdx];
        const text = value.length > 28 && colIdx === 2 ? `${value.slice(0, 28)}…` : value;
        ctx.fillText(text, start - 14, rowY + 38);
      });
      rowY += rowH;
    });
  }

  const noteY = rowY + 26;
  ctx.fillStyle = '#fafbff';
  roundRect(ctx, margin, noteY, 520, 170, 24, true, false);
  ctx.fillStyle = '#111733';
  ctx.font = '800 26px Arial';
  ctx.textAlign = 'right';
  ctx.fillText('بيانات العميل', margin + 490, noteY + 42);
  ctx.font = '600 22px Arial';
  ctx.fillStyle = '#525b7b';
  wrapText(ctx, String(customer.address || '—'), margin + 490, noteY + 82, 450, 34);
  ctx.fillText(`شكراً لتعاملكم مع ${state.data.company.name || 'JOOD KIDS'}`, margin + 490, noteY + 146);

  const summaryX = width - margin - 360;
  ctx.fillStyle = '#101733';
  roundRect(ctx, summaryX, noteY, 360, 170, 28, true, false);
  const summaryRows = [['الإجمالي', money(invoice.subTotal)], ['الخصم', money(invoice.discountAmount)], ['الصافي', money(invoice.total)]];
  summaryRows.forEach((entry, idx) => {
    const yy = noteY + 42 + idx * 40;
    ctx.textAlign = 'right';
    ctx.fillStyle = idx === 2 ? '#ffffff' : 'rgba(255,255,255,.88)';
    ctx.font = idx === 2 ? '900 29px Arial' : '700 24px Arial';
    ctx.fillText(entry[0], summaryX + 320, yy);
    ctx.textAlign = 'left';
    ctx.fillText(entry[1], summaryX + 34, yy);
  });

  const footerY = noteY + 210;
  ctx.strokeStyle = '#d7dcef';
  roundRect(ctx, margin, footerY, 260, 92, 18, false, true);
  roundRect(ctx, width - margin - 260, footerY, 260, 92, 18, false, true);
  ctx.fillStyle = '#636d90';
  ctx.textAlign = 'center';
  ctx.font = '700 22px Arial';
  ctx.fillText('توقيع المستلم', margin + 130, footerY + 62);
  ctx.fillText('توقيع البائع', width - margin - 130, footerY + 62);

  const filename = `${name || invoice.number || 'invoice'}.png`;
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png', 1));
  if (blob) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = filename;
    link.href = url;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  } else {
    const link = document.createElement('a');
    link.download = filename;
    link.href = canvas.toDataURL('image/png', 1);
    link.click();
  }
  showToast('تم حفظ الفاتورة كصورة');
}

function roundRect(ctx, x, y, width, height, radius, fill, stroke) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

async function drawLogoCanvas(ctx, x, y, size, logoDataUrl, fallbackText) {
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, x, y, size, size, 28, true, false);
  if (logoDataUrl) {
    try {
      const img = await loadImage(logoDataUrl);
      ctx.save();
      roundRect(ctx, x, y, size, size, 28, false, false);
      ctx.clip();
      ctx.drawImage(img, x, y, size, size);
      ctx.restore();
      return;
    } catch {}
  }
  ctx.fillStyle = '#5b3df5';
  ctx.textAlign = 'center';
  ctx.font = '900 38px Arial';
  ctx.fillText(String(fallbackText || 'JK').slice(0, 4).toUpperCase(), x + size / 2, y + size / 2 + 14);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = String(text || '').split(/\s+/);
  let line = '';
  let currentY = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, currentY);
      line = word;
      currentY += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, currentY);
}

function addCustomer() {
  const name = state.dom.customerName.value.trim();
  if (!name) return showToast('أدخل اسم العميل');
  state.data.customers.unshift({ id: uid(), name, phone: state.dom.customerPhone.value.trim(), city: state.dom.customerCity.value.trim(), address: state.dom.customerAddress.value.trim() });
  saveData();
  logActivity('إضافة عميل', name);
  state.dom.customerName.value = '';
  state.dom.customerPhone.value = '';
  state.dom.customerCity.value = '';
  state.dom.customerAddress.value = '';
  renderAll();
  showToast('تم حفظ العميل');
}

function updateSeriesBarcode(force = false) {
  const generated = deriveSeriesBarcode(state.dom.itemPieceBarcode.value, state.dom.itemSeriesQty.value);
  const current = state.dom.itemSeriesBarcode.value.trim();
  const previousGenerated = state.dom.itemSeriesBarcode.dataset.generatedValue || '';
  if (force || !current || current === previousGenerated) state.dom.itemSeriesBarcode.value = generated;
  state.dom.itemSeriesBarcode.dataset.generatedValue = generated;
  renderBarcodeCard();
}

function renderBarcodeCard() {
  const piece = state.dom.itemPieceBarcode.value || '—';
  const series = state.dom.itemSeriesBarcode.value || '—';
  const name = state.dom.itemName.value || 'اسم الصنف';
  state.dom.barcodeCard.innerHTML = `<h4 style="margin:0 0 14px">معاينة الباركود</h4><div><strong>${esc(name)}</strong></div><div style="margin:12px 0 6px">باركود القطعة</div><div class="barcode-bars"></div><div class="barcode-caption">${esc(piece)}</div><div style="margin:18px 0 6px">باركود السيري</div><div class="barcode-bars"></div><div class="barcode-caption">${esc(series)}</div>`;
}

function printBarcodeCard() {
  renderBarcodeCard();
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(`<html dir="rtl"><head><title>Barcode</title><style>body{font-family:Arial;padding:24px}.barcode-bars{height:76px;border-radius:14px;background:repeating-linear-gradient(90deg,#111 0px,#111 2px,transparent 2px,transparent 4px,#111 4px,#111 6px,transparent 6px,transparent 8px,#111 8px,#111 12px,transparent 12px,transparent 15px)}.barcode-caption{text-align:center;margin-top:10px;font-weight:900;letter-spacing:.22em}</style></head><body>${state.dom.barcodeCard.innerHTML}</body></html>`);
  win.document.close();
  win.print();
}

function addItem() {
  const name = state.dom.itemName.value.trim();
  const pieceBarcode = state.dom.itemPieceBarcode.value.trim();
  if (!name || !pieceBarcode) return showToast('أدخل اسم الصنف وباركود القطعة');
  const item = { id: uid(), code: String(state.dom.itemCode.value || state.data.counters.item), name, unit: state.dom.itemUnit.value.trim() || 'قطعة', seriesQty: Number(state.dom.itemSeriesQty.value || 6), pieceBarcode, seriesBarcode: state.dom.itemSeriesBarcode.value.trim() || deriveSeriesBarcode(pieceBarcode, state.dom.itemSeriesQty.value), piecePrice: Number(state.dom.itemPiecePrice.value || 0), seriesPrice: Number(state.dom.itemSeriesPrice.value || 0), sizes: state.dom.itemSizes.value.trim(), stock: Number(state.dom.itemStock.value || 0) };
  state.data.items.unshift(item);
  state.data.counters.item = Math.max(state.data.counters.item, Number(item.code) + 1);
  saveData();
  logActivity('إضافة مادة', `${item.name} · ${item.code}`);
  resetItemForm();
  renderAll();
  showToast('تم حفظ المادة');
}

function resetItemForm() {
  state.dom.itemCode.value = String(state.data.counters.item);
  state.dom.itemName.value = '';
  state.dom.itemUnit.value = 'قطعة';
  state.dom.itemSeriesQty.value = '6';
  state.dom.itemPieceBarcode.value = '';
  state.dom.itemSeriesBarcode.value = '';
  state.dom.itemSeriesBarcode.dataset.generatedValue = '';
  state.dom.itemPiecePrice.value = '';
  state.dom.itemSeriesPrice.value = '';
  state.dom.itemSizes.value = '';
  state.dom.itemStock.value = '0';
  renderBarcodeCard();
}

async function addUser() {
  if (state.currentUser?.role !== 'admin') return showToast('صلاحية الأدمن فقط');
  const name = state.dom.userName.value.trim();
  const email = state.dom.userEmail.value.trim().toLowerCase();
  const password = state.dom.userPassword.value.trim();
  if (!name || !email || !password) return showToast('أدخل الاسم والبريد وكلمة المرور');
  state.data.users.unshift({ id: uid(), name, email, role: state.dom.userRole.value, active: state.dom.userActive.value === 'true', passwordHash: await sha256(password) });
  saveData();
  logActivity('إضافة مستخدم', `${name} · ${state.dom.userRole.value}`);
  state.dom.userName.value = '';
  state.dom.userEmail.value = '';
  state.dom.userPassword.value = '';
  renderUsers();
  renderLoginUsers();
  renderActivity();
  showToast('تم حفظ المستخدم');
}

async function handleLogoUpload(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  const dataUrl = await fileToDataUrl(file);
  state.data.company.logoDataUrl = dataUrl;
  saveData();
  renderCompany();
  renderInvoiceDraft();
  renderInvoiceDetail();
  logActivity('رفع شعار', file.name);
  showToast('تم رفع الشعار');
}

function saveCompany() {
  state.data.company = { ...state.data.company, name: state.dom.companyName.value.trim(), city: state.dom.companyCity.value.trim(), address: state.dom.companyAddress.value.trim(), phone: state.dom.companyPhone.value.trim(), tax: state.dom.companyTax.value.trim(), logoText: state.dom.companyLogoText.value.trim() || 'JK' };
  saveData();
  renderCompany();
  renderInvoiceDraft();
  renderInvoiceDetail();
  logActivity('تحديث الشركة', state.data.company.name);
  showToast('تم حفظ بيانات الشركة');
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function exportExcel(type, rows, actionLabel = 'تصدير') {
  if (!rows || !rows.length) return showToast('لا توجد بيانات للتصدير');
  const headers = Object.keys(rows[0]);
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="UTF-8"></head><body><table border="1"><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${headers.map((h) => `<td>${esc(row[h] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`;
  const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${type}-${today()}.xls`;
  a.click();
  logActivity(actionLabel, type);
}

function customersExportRows() { return state.data.customers.map((c) => ({ name: c.name, phone: c.phone, city: c.city, address: c.address })); }
function itemsExportRows() { return state.data.items.map((i) => ({ code: i.code, name: i.name, unit: i.unit, seriesQty: i.seriesQty, pieceBarcode: i.pieceBarcode, seriesBarcode: i.seriesBarcode, piecePrice: i.piecePrice, seriesPrice: i.seriesPrice, sizes: i.sizes, stock: i.stock })); }
function invoicesExportRows(invoices = state.data.invoices) { return invoices.map((inv) => ({ number: inv.number, date: inv.date, customerName: customerName(inv.customerId), customerId: inv.customerId, subTotal: inv.subTotal, discountMode: inv.discountMode, discountValue: inv.discountValue, discountAmount: inv.discountAmount, total: inv.total, linesJson: JSON.stringify(inv.lines || []) })); }
function activityExportRows() { return state.data.activityLogs.map((log) => ({ at: log.at, action: log.action, detail: log.detail, user: log.user, role: log.role })); }

async function readImportedRows(file) {
  if (!file) return null;
  const text = await file.text();
  if (file.name.toLowerCase().endsWith('.csv')) return parseCSV(text);
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'text/html');
  const table = doc.querySelector('table');
  if (!table) return [];
  const headerCells = [...table.querySelectorAll('thead th')];
  const headers = headerCells.length ? headerCells.map((th) => th.textContent.trim()) : [...table.querySelectorAll('tr:first-child td')].map((td) => td.textContent.trim());
  const bodyRows = table.querySelectorAll('tbody tr');
  return [...bodyRows].map((tr) => {
    const cells = [...tr.children];
    const row = {};
    headers.forEach((header, idx) => row[header] = cells[idx]?.textContent?.trim() ?? '');
    return row;
  });
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const headers = splitCSVLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = splitCSVLine(line);
    const row = {};
    headers.forEach((h, idx) => row[h] = values[idx] || '');
    return row;
  });
}

function splitCSVLine(line) {
  const out = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      out.push(current); current = '';
    } else current += ch;
  }
  out.push(current);
  return out.map((v) => v.trim());
}

function normalizeKey(key) { return String(key || '').replace(/\s+/g, '').toLowerCase(); }
function getValue(row, candidates) {
  for (const candidate of candidates) {
    const found = Object.keys(row).find((k) => normalizeKey(k) === normalizeKey(candidate));
    if (found) return row[found];
  }
  return '';
}

function importCustomers(rows) {
  if (!rows || !rows.length) return showToast('ملف العملاء فارغ');
  rows.forEach((row) => {
    const name = getValue(row, ['name', 'الاسم', 'اسمالعميل']);
    if (!name) return;
    state.data.customers.unshift({ id: uid(), name, phone: getValue(row, ['phone', 'الموبايل', 'رقمالموبايل']), city: getValue(row, ['city', 'المدينة']), address: getValue(row, ['address', 'العنوان']) });
  });
  saveData();
  logActivity('استيراد عملاء', String(rows.length));
  renderAll();
  state.dom.importCustomersInput.value = '';
  showToast('تم استيراد العملاء');
}

function importItems(rows) {
  if (!rows || !rows.length) return showToast('ملف المواد فارغ');
  rows.forEach((row) => {
    const name = getValue(row, ['name', 'اسمالصنف', 'الصنف']);
    const pieceBarcode = getValue(row, ['pieceBarcode', 'باركودالقطعة']);
    if (!name || !pieceBarcode) return;
    const code = getValue(row, ['code', 'رقمالمادة']) || String(state.data.counters.item);
    state.data.items.unshift({ id: uid(), code, name, unit: getValue(row, ['unit', 'الوحدة']) || 'قطعة', seriesQty: Number(getValue(row, ['seriesQty', 'عددالسيري']) || 6), pieceBarcode, seriesBarcode: getValue(row, ['seriesBarcode', 'باركودالسيري']) || deriveSeriesBarcode(pieceBarcode, Number(getValue(row, ['seriesQty', 'عددالسيري']) || 6)), piecePrice: Number(getValue(row, ['piecePrice', 'سعرالقطعة']) || 0), seriesPrice: Number(getValue(row, ['seriesPrice', 'سعرالسيري']) || 0), sizes: getValue(row, ['sizes', 'المقاسات']), stock: Number(getValue(row, ['stock', 'المخزون']) || 0) });
    state.data.counters.item = Math.max(state.data.counters.item, Number(code) + 1);
  });
  saveData();
  logActivity('استيراد مواد', String(rows.length));
  resetItemForm();
  renderAll();
  state.dom.importItemsInput.value = '';
  showToast('تم استيراد المواد');
}

function importInvoices(rows) {
  if (!rows || !rows.length) return showToast('ملف الفواتير فارغ');
  rows.forEach((row) => {
    const number = getValue(row, ['number', 'رقمالفاتورة']);
    const date = getValue(row, ['date', 'التاريخ']) || today();
    if (!number) return;
    const customerId = getValue(row, ['customerId']) || findOrCreateCustomerByName(getValue(row, ['customerName', 'العميل']));
    let lines = [];
    try { lines = JSON.parse(getValue(row, ['linesJson']) || '[]'); } catch { lines = []; }
    state.data.invoices.unshift(finalizeInvoice({ id: uid(), number, date, customerId, lines, discountMode: getValue(row, ['discountMode']) || 'value', discountValue: Number(getValue(row, ['discountValue']) || 0), subTotal: Number(getValue(row, ['subTotal']) || 0), discountAmount: Number(getValue(row, ['discountAmount']) || 0), total: Number(getValue(row, ['total']) || 0) }));
  });
  saveData();
  logActivity('استيراد فواتير', String(rows.length));
  renderAll();
  state.dom.importInvoicesInput.value = '';
  showToast('تم استيراد الفواتير');
}

function findOrCreateCustomerByName(name) {
  const clean = String(name || '').trim();
  if (!clean) return '';
  const existing = state.data.customers.find((c) => c.name === clean);
  if (existing) return existing.id;
  const created = { id: uid(), name: clean, phone: '', city: '', address: '' };
  state.data.customers.unshift(created);
  return created.id;
}

async function installApp() {
  if (!state.deferredPrompt) return showToast('التثبيت حسب دعم المتصفح');
  state.deferredPrompt.prompt();
  await state.deferredPrompt.userChoice;
  state.deferredPrompt = null;
}

async function openCamera(target = 'invoice') {
  state.scannerTarget = target;
  state.dom.scannerModal.classList.add('show');
  try {
    state.cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    state.dom.cameraVideo.srcObject = state.cameraStream;
    state.dom.scannerStatus.textContent = 'Camera Ready';
    startBarcodeDetectionLoop();
  } catch {
    state.dom.scannerStatus.textContent = 'Camera Unavailable';
  }
}

function startBarcodeDetectionLoop() {
  stopBarcodeDetectionLoop();
  if (!('BarcodeDetector' in window)) {
    state.dom.scannerStatus.textContent = 'Use external scanner or manual entry';
    return;
  }
  const detector = new BarcodeDetector({ formats: ['ean_13', 'code_128', 'upc_a', 'upc_e', 'qr_code'] });
  const tick = async () => {
    try {
      if (!state.cameraStream || state.dom.cameraVideo.readyState < 2) return;
      const results = await detector.detect(state.dom.cameraVideo);
      const code = results?.[0]?.rawValue;
      if (!code) return;
      if (state.scannerTarget === 'itemPiece') {
        state.dom.itemPieceBarcode.value = code;
        updateSeriesBarcode(false);
      } else if (state.scannerTarget === 'itemSeries') {
        state.dom.itemSeriesBarcode.value = code;
        renderBarcodeCard();
      } else {
        state.dom.barcodeInput.value = code;
        resolveLookup();
        addByLookup();
      }
      closeCamera();
    } catch {}
  };
  state.cameraLoopTimer = setInterval(tick, 350);
}

function stopBarcodeDetectionLoop() {
  if (state.cameraLoopTimer) clearInterval(state.cameraLoopTimer);
  state.cameraLoopTimer = null;
}

function closeCamera() {
  state.dom.scannerModal.classList.remove('show');
  stopBarcodeDetectionLoop();
  if (state.cameraStream) state.cameraStream.getTracks().forEach((track) => track.stop());
  state.cameraStream = null;
}

function tableHTML(headers, rows, emptyText) {
  return `<table><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.join('') : `<tr><td colspan="${headers.length}" class="invoice-line-empty">${esc(emptyText)}</td></tr>`}</tbody></table>`;
}

function registerSW() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => null);
}

function applyRemoteSession(remoteUser) {
  if (!remoteUser?.email && !remoteUser?.uid) return false;
  const email = String(remoteUser.email || '').trim().toLowerCase();
  let user = state.data.users.find((u) => String(u.email || '').trim().toLowerCase() === email || String(u.firebaseUid || '') === String(remoteUser.uid || '')) || null;
  if (!user) {
    user = {
      id: uid(),
      name: email ? email.split('@')[0] : 'User',
      email,
      role: isAdminIdentity(email, remoteUser.uid) ? 'admin' : 'sales',
      active: true,
      firebaseUid: remoteUser.uid || '',
      passwordHash: ''
    };
    state.data.users.unshift(user);
  }
  if (remoteUser.uid) user.firebaseUid = remoteUser.uid;
  if (email) user.email = email;
  if (isAdminIdentity(user.email, user.firebaseUid)) user.role = 'admin';
  user.active = true;
  state.currentUser = user;
  renderAuthUI();
  state.dom.loginModal.classList.remove('show');
  saveData();
  return true;
}

window.addEventListener('jood-auth-changed', (event) => {
  applyRemoteSession(event.detail || null);
});

window.addEventListener('load', async () => {
  cacheDom();
  bindEvents();
  state.draftInvoice = createEmptyInvoice();
  await normalizeUsersSecurity();
  if (!state.data.customers.length && !state.data.items.length && !state.data.invoices.length) seedDemoData();
  else renderAll();
  resetItemForm();
  renderLoginUsers();
  renderAuthUI();
  registerSW();
  const remoteUser = await window.JOOD_REMOTE?.waitForReady?.();
  if (applyRemoteSession(remoteUser)) {
    await hydrateFromRemote();
  }
});
