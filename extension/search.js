const $ = (s) => document.querySelector(s);
const COSTCO_TABS = ['https://www.costco.com/*', 'https://www.costco.ca/*'];
const LOGIN_URL = 'https://www.costco.com/';
// Account → Orders & Purchases (the page that sets the login token).
const ORDERS_PATH = '/myaccount/#/app/4900eb1f-0c10-4bd9-99c3-c59e6c1ecebf/ordersandpurchases';
const MAX_ROWS = 500;

let receipts = {};   // barcode -> raw warehouse receipt
let orders = {};     // order number -> raw online order (+ .details)
let lines = [];      // flattened, searchable item lines from both
let current = [];    // lines matching the current filters
const DEFAULT_SETTINGS = { autoSync: true, includeGas: true };
let settings = { ...DEFAULT_SETTINGS };

const money = (n) => (n == null || isNaN(n) ? '' : (n < 0 ? '-$' : '$') + Math.abs(n).toFixed(2));
// Date-only strings parse as UTC midnight (the previous day in US time zones); treat them as local.
const day = (iso) => new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T00:00` : iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
// Costco returns a mix of ISO and US-style date strings; normalize so sorting
// and year filtering can compare strings.
const iso = (s) => {
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s;
  const d = new Date(s);
  return isNaN(d) ? String(s) : d.toISOString();
};
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- data ----------

// Instant-savings lines look like "/1234567" or "TPD/1234567" with a negative
// amount; fold them into the item they discount when it's on the same receipt.
// Gas station / car wash receipts come back from the same receipts query.
const isGas = (r) =>
  /gas|fuel|car\s*wash/i.test(r.documentType || '') || (r.itemArray || []).some((it) => it.fuelUomCode);

function flatten(r) {
  const items = r.itemArray || [];
  const gas = isGas(r);
  const out = [];
  const byNumber = {};
  for (const it of items) {
    const d1 = (it.itemDescription01 || '').trim();
    const ref = d1.match(/^(?:TPD)?\s*\/\s*(\d+)/i);
    if (ref && Number(it.amount) < 0 && byNumber[ref[1]]) {
      byNumber[ref[1]].savings += Number(it.amount);
      continue;
    }
    const line = {
      src: gas ? 'gas' : 'warehouse',
      ref: r.transactionBarcode,
      date: iso(r.transactionDateTime),
      warehouse: gas ? `${r.warehouseName || ''} Gas`.trim() : r.warehouseName || '',
      itemNumber: String(it.itemNumber ?? ''),
      desc: d1,
      desc2: (it.itemDescription02 || '').trim(),
      qty: it.fuelUomCode ? Number(it.fuelUnitQuantity) : Number(it.unit ?? 1),
      unitPrice: it.itemUnitPriceAmount != null ? Number(it.itemUnitPriceAmount) : null,
      amount: Number(it.amount),
      savings: 0,
    };
    line.haystack = `${line.desc} ${line.desc2} ${line.itemNumber} ${line.warehouse} ${line.ref}`.toLowerCase();
    byNumber[line.itemNumber] = line;
    out.push(line);
  }
  return out;
}

const orderItems = (o) =>
  o.details ? (o.details.shipToAddress || []).flatMap((s) => s.orderLineItems || []).filter((it) => !it.isFeeItem)
    : o.orderLineItems || [];

// Online orders: prices come from getOrderDetails; if that failed we still
// index the item names from the order list, just without amounts.
function flattenOrder(o) {
  const priced = !!o.details;
  return orderItems(o).map((it) => {
    const qty = Number(it.quantity ?? 1);
    const amount = priced ? Number(it.merchandiseTotalAmount ?? (it.price ?? 0) * qty) : null;
    const line = {
      src: 'online',
      ref: `o:${o.orderNumber}`,
      date: iso(o.orderPlacedDate),
      warehouse: `Online · ${o.status || ''}`.replace(/ · $/, ''),
      itemNumber: String(it.itemNumber ?? ''),
      desc: (it.itemDescription || '').trim(),
      desc2: `Order #${o.orderNumber}`,
      qty,
      unitPrice: priced && it.price != null ? Number(it.price) : null,
      amount,
      savings: 0,
    };
    line.haystack = `${line.desc} ${line.itemNumber} online ${o.orderNumber}`.toLowerCase();
    return line;
  });
}

const net = (l) => (l.amount == null ? 0 : l.amount + l.savings);

async function load() {
  const data = await chrome.storage.local.get(['receipts', 'orders', 'lastSync', 'settings']);
  settings = { ...DEFAULT_SETTINGS, ...data.settings };
  applySettings();
  receipts = data.receipts || {};
  orders = data.orders || {};
  lines = [...Object.values(receipts).flatMap(flatten), ...Object.values(orders).flatMap(flattenOrder)]
    .sort((a, b) => b.date.localeCompare(a.date));

  const nr = Object.keys(receipts).length;
  const no = Object.keys(orders).length;
  $('#status').textContent = nr + no
    ? `${nr} receipts · ${no} online orders · ${lines.length} items · synced ${new Date(data.lastSync).toLocaleString()}`
    : 'No receipts synced yet — click Sync.';

  const years = [...new Set(lines.map((l) => l.date.slice(0, 4)))].sort().reverse();
  const sel = $('#year');
  const keep = sel.value;
  sel.innerHTML = '<option value="">All dates</option><option value="12m">Last 12 months</option>' +
    years.map((y) => `<option>${y}</option>`).join('');
  sel.value = keep;
  render();
}

// ---------- search + render ----------

function filter() {
  const terms = $('#q').value.toLowerCase().split(/\s+/).filter(Boolean);
  const year = $('#year').value;
  const src = $('#source').value;
  const cutoff = new Date(Date.now() - 365 * 864e5).toISOString();
  return lines.filter((l) =>
    (settings.includeGas || l.src !== 'gas') &&
    (!src || l.src === src) &&
    (!year || (year === '12m' ? l.date >= cutoff : l.date.startsWith(year))) &&
    terms.every((t) => l.haystack.includes(t)));
}

function highlight(text) {
  const terms = $('#q').value.split(/\s+/).filter(Boolean).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!terms.length) return esc(text);
  // Split on raw text so matches never land inside an HTML entity; odd parts are the hits.
  return String(text ?? '').split(new RegExp(`(${terms.join('|')})`, 'gi'))
    .map((part, i) => (i % 2 ? `<mark>${esc(part)}</mark>` : esc(part))).join('');
}

function group(rows) {
  const g = new Map();
  for (const l of rows) {
    const k = l.itemNumber || l.desc;
    const e = g.get(k) || { itemNumber: l.itemNumber, desc: l.desc, times: 0, qty: 0, spent: 0, savings: 0, last: l };
    e.times++; e.qty += l.qty || 0; e.spent += net(l); e.savings += l.savings;
    if (l.date > e.last.date) e.last = l;
    // Warehouse receipts abbreviate names ("KS PAPER TOWEL"); prefer the fuller online name when we have one.
    if (l.src === 'online' && l.desc) e.desc = l.desc;
    g.set(k, e);
  }
  return [...g.values()].sort((a, b) => b.last.date.localeCompare(a.last.date));
}

// Per-unit price actually paid, after instant savings.
const lastPrice = (l) => (l.amount == null ? null : net(l) / (l.qty || 1));
// Receipt barcode / online order number, with just the last 4 shown in the list.
const refId = (l) => String(l.ref ?? '').replace(/^o:/, '');
const srcTag = (l) =>
  l.src === 'online' ? '<span class="tag">online</span>' : l.src === 'gas' ? '<span class="tag gas">gas</span>' : '';

function render() {
  current = filter();
  const grouped = document.querySelector('input[name=view]:checked').value === 'grouped';
  const total = current.reduce((s, l) => s + net(l), 0);
  const tripCount = new Set(current.map((l) => l.ref)).size;
  $('#summary').textContent = lines.length
    ? `${current.length} purchases on ${tripCount} receipts/orders · ${money(total)} total`
    : '';

  const thead = $('#results thead');
  const tbody = $('#results tbody');
  let rows;
  if (grouped) {
    const groups = group(current);
    thead.innerHTML = `<tr><th>Item</th><th class="hide-sm">Item #</th><th class="num">Times</th><th class="num hide-sm">Qty</th>
      <th class="num">Last price</th><th class="hide-sm">Last bought</th><th class="num">Total spent</th></tr>`;
    rows = groups.slice(0, MAX_ROWS).map((e) => `<tr data-ref="${esc(e.last.ref)}" data-item="${esc(e.itemNumber)}">
      <td>${highlight(e.desc)}</td>
      <td class="hide-sm">${highlight(e.itemNumber)}</td>
      <td class="num">${e.times}</td>
      <td class="num hide-sm">${+e.qty.toFixed(3)}</td>
      <td class="num">${money(lastPrice(e.last))}</td>
      <td class="hide-sm">${day(e.last.date)} ${srcTag(e.last)}</td>
      <td class="num">${money(e.spent)}${e.savings ? `<div class="save">saved ${money(-e.savings)}</div>` : ''}</td></tr>`);
    setMore(groups.length);
  } else {
    thead.innerHTML = `<tr><th title="Last 4 of the receipt or order number">Receipt</th><th>Date</th><th>Item</th><th class="hide-sm">Item #</th><th class="hide-sm">Where</th>
      <th class="num">Qty</th><th class="num">Price</th></tr>`;
    rows = current.slice(0, MAX_ROWS).map((l) => `<tr data-ref="${esc(l.ref)}" data-item="${esc(l.itemNumber)}">
      <td class="rid" title="${esc(refId(l))}">${highlight(refId(l).slice(-4))}</td>
      <td>${day(l.date)}</td>
      <td>${highlight(l.desc)} ${srcTag(l)}${l.desc2 ? `<div class="desc2">${highlight(l.desc2)}</div>` : ''}</td>
      <td class="hide-sm">${highlight(l.itemNumber)}</td>
      <td class="hide-sm">${highlight(l.warehouse)}</td>
      <td class="num">${+(l.qty || 0).toFixed(3)}</td>
      <td class="num ${l.amount < 0 ? 'neg' : ''}">${l.amount == null ? '—' : money(net(l))}${l.savings ? `<div class="save">${money(l.amount)} − ${money(-l.savings)} off</div>` : ''}</td></tr>`);
    setMore(current.length);
  }
  tbody.innerHTML = rows.join('') ||
    `<tr><td colspan="7">${lines.length ? 'No matches.' : 'Sync your receipts to get started.'}</td></tr>`;
}

function setMore(n) {
  $('#more').hidden = n <= MAX_ROWS;
  $('#more').textContent = `Showing ${MAX_ROWS} of ${n} — narrow your search to see more.`;
}

// Optional rows (cls set) are hidden when zero; required rows only when missing.
const totalRow = (label, v, cls = '') =>
  v == null || v === '' || (cls && Number(v) === 0) ? ''
    : `<tr><td colspan="3" class="${cls}">${label}</td><td class="num ${cls}">${money(Number(v))}</td></tr>`;

function itemTable(items, itemNumber, foot) {
  return `<table>
    <thead><tr><th>Item</th><th>Item #</th><th class="num">Qty</th><th class="num">Price</th></tr></thead>
    <tbody>${items.map((l) => `<tr class="${l.itemNumber === itemNumber ? 'hit' : ''}">
      <td>${esc(l.desc)}${l.src !== 'online' && l.desc2 ? `<div class="desc2">${esc(l.desc2)}</div>` : ''}</td><td>${esc(l.itemNumber)}</td>
      <td class="num">${+(l.qty || 0).toFixed(3)}</td>
      <td class="num">${l.amount == null ? '—' : money(net(l))}${l.savings ? `<div class="save">${money(-l.savings)} off</div>` : ''}</td></tr>`).join('')}</tbody>
    <tfoot>${foot}</tfoot>
  </table>`;
}

function showReceipt(ref, itemNumber) {
  if (ref.startsWith('o:')) {
    const o = orders[ref.slice(2)];
    if (!o) return;
    const d = o.details || {};
    $('#receipt-body').innerHTML = `
      <h2>Online order #${esc(o.orderNumber)}</h2>
      <div class="meta">${day(iso(o.orderPlacedDate))} · ${esc(o.status || '')}${o.details ? '' : ' · item prices unavailable'}</div>
      ${itemTable(flattenOrder(o), itemNumber,
        totalRow('Merchandise', d.merchandiseTotal) + totalRow('Shipping & handling', d.shippingAndHandling, 'opt') +
        totalRow('Discounts', d.discountAmount, 'save') + totalRow('Tax', d.uSTaxTotal1) + totalRow('Total', o.orderTotal ?? d.orderTotal))}`;
  } else {
    const r = receipts[ref];
    if (!r) return;
    $('#receipt-body').innerHTML = `
      <h2>${esc(r.warehouseName || 'Costco')}</h2>
      <div class="meta">${new Date(iso(r.transactionDateTime)).toLocaleString()} · ${esc(r.documentType || '')} · ${esc(ref)}</div>
      ${itemTable(flatten(r), itemNumber,
        totalRow('Subtotal', r.subTotal) + totalRow('Tax', r.taxes) + totalRow('Total', r.total) +
        totalRow('Instant savings', r.instantSavings, 'save'))}`;
  }
  $('#receipt').showModal();
}

function exportCsv() {
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const header = ['Date', 'Source', 'Where', 'Item #', 'Description', 'Description 2', 'Qty', 'Unit price', 'Amount', 'Savings', 'Net', 'Receipt / order'];
  const body = current.map((l) => [l.date, l.src, l.warehouse, l.itemNumber, l.desc, l.desc2, l.qty, l.unitPrice, l.amount, l.savings,
    l.amount == null ? '' : net(l).toFixed(2), l.ref.replace(/^o:/, '')].map(cell).join(','));
  const blob = new Blob([[header.join(','), ...body].join('\n')], { type: 'text/csv' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'costco-purchases.csv' });
  a.click();
  URL.revokeObjectURL(a.href);
}

// ---------- settings ----------

function applySettings() {
  for (const k of Object.keys(DEFAULT_SETTINGS)) $(`#set-${k}`).checked = settings[k];
  const gasOpt = $('#source option[value=gas]');
  gasOpt.hidden = gasOpt.disabled = !settings.includeGas;
  if (!settings.includeGas && $('#source').value === 'gas') $('#source').value = '';
}

async function saveSetting(k, v) {
  settings = { ...settings, [k]: v };
  await chrome.storage.local.set({ settings });
  applySettings();
  render();
}

// ---------- sync ----------

let syncing = false; // manual sync in progress: it reloads + reports on its own

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// (Re-)inject the content script, which navigation wipes, then message it.
async function send(tabId, msg) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
  return chrome.tabs.sendMessage(tabId, msg);
}

// The login token only lands in localStorage once Costco's account app runs,
// so send the tab to Orders & Purchases and wait for the token to show up.
async function openOrdersPage(tab) {
  $('#status').textContent = 'Opening Orders & Purchases on Costco to refresh your login…';
  const origin = new URL(tab.url).origin;
  await chrome.tabs.update(tab.id, { url: origin + ORDERS_PATH });
  for (let i = 0; i < 30; i++) {
    await sleep(1000);
    const t = await chrome.tabs.get(tab.id);
    if (t.status !== 'complete' || !t.url.startsWith(origin)) continue;
    try {
      if ((await send(tab.id, { type: 'has-token' }))?.ok) return;
    } catch { /* page still settling */ }
  }
  await chrome.tabs.update(tab.id, { active: true });
  throw new Error('Couldn’t find your Costco login — sign in on the Costco tab (Account → Orders & Purchases), then Sync again.');
}

async function sync(full) {
  const btns = [$('#sync'), $('#fullsync')];
  btns.forEach((b) => (b.disabled = true));
  syncing = true;
  try {
    let [tab] = await chrome.tabs.query({ url: COSTCO_TABS });
    if (!tab) {
      await chrome.tabs.create({ url: LOGIN_URL + ORDERS_PATH.slice(1), active: true });
      $('#status').textContent = 'Opened Costco — sign in there (Account → Orders & Purchases), then click Sync again.';
      return;
    }
    const { lastSync } = await chrome.storage.local.get('lastSync');
    // Incremental: re-fetch from a month before the last sync to catch late-posting receipts.
    const since = !full && lastSync ? new Date(new Date(lastSync).getTime() - 31 * 864e5).toISOString() : null;
    $('#status').textContent = 'Connecting to Costco tab…';
    if (!(await send(tab.id, { type: 'has-token' }))?.ok) await openOrdersPage(tab);
    let res = await send(tab.id, { type: 'sync', since, yearsBack: 3 });
    // A stale token from another page: refresh it via Orders & Purchases and try once more.
    if (res?.code === 'auth') {
      await openOrdersPage(tab);
      res = await send(tab.id, { type: 'sync', since, yearsBack: 3 });
    }
    if (!res?.ok) throw new Error(res?.error || 'Sync failed.');
    await load();
    $('#status').textContent += ` · +${res.added} new` +
      (res.onlineError ? ` · ⚠ online orders failed: ${res.onlineError}` : '');
  } catch (e) {
    $('#status').textContent = `⚠ ${e.message}`;
  } finally {
    btns.forEach((b) => (b.disabled = false));
    syncing = false;
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'sync-progress') $('#status').textContent = msg.msg;
});

// ---------- wiring ----------

let t;
$('#q').addEventListener('input', () => { clearTimeout(t); t = setTimeout(render, 120); });
$('#year').addEventListener('change', render);
$('#source').addEventListener('change', render);
document.querySelectorAll('input[name=view]').forEach((r) => r.addEventListener('change', render));
$('#results tbody').addEventListener('click', (e) => {
  const tr = e.target.closest('tr[data-ref]');
  if (tr) showReceipt(tr.dataset.ref, tr.dataset.item);
});
$('#sync').addEventListener('click', () => sync(false));
$('#fullsync').addEventListener('click', () => sync(true));
$('#csv').addEventListener('click', exportCsv);
$('#open-settings').addEventListener('click', () => $('#settings').showModal());
for (const k of Object.keys(DEFAULT_SETTINGS)) {
  $(`#set-${k}`).addEventListener('change', (e) => saveSetting(k, e.target.checked));
}
// Pick up auto-syncs (or another open search tab) without a manual refresh.
let reloadTimer;
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || syncing || !(changes.receipts || changes.orders)) return;
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(load, 300);
});

load();
