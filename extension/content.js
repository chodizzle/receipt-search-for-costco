// Injected into a logged-in costco.com / costco.ca tab on demand.
// Reuses the site's own auth token (localStorage) to call the same GraphQL
// API the "Orders & Purchases" page uses: warehouse receipts one quarter at a
// time, and online orders one year at a time (list, then details for prices).

if (!window.__costcoReceiptSync) {
  window.__costcoReceiptSync = true;

  const API = 'https://ecom-api.costco.com/ebusiness/order/v1/orders/graphql';
  // Static app identifier the Costco web app sends with every orders request.
  const CLIENT_IDENTIFIER = '481b1aec-aa3b-454b-b81b-48187e28f205';
  // getOnlineOrders requires the online "warehouse" for the site's country.
  const ONLINE_WAREHOUSE = location.hostname.endsWith('.ca') ? '894' : '847';

  const gqlText = (s) => s.replace(/\s+/g, ' ');

  const RECEIPTS_QUERY = gqlText(`query receiptsWithCounts($startDate: String!, $endDate: String!, $documentType: String!, $documentSubType: String!) {
    receiptsWithCounts(startDate: $startDate, endDate: $endDate, documentType: $documentType, documentSubType: $documentSubType) {
      receipts {
        warehouseName warehouseNumber documentType transactionDateTime transactionBarcode
        transactionType total subTotal taxes totalItemCount instantSavings
        itemArray {
          itemNumber itemDescription01 itemDescription02 itemDepartmentNumber
          unit amount itemUnitPriceAmount taxFlag fuelUnitQuantity fuelUomCode
        }
      }
    }
  }`);

  const ONLINE_LIST_QUERY = gqlText(`query getOnlineOrders($startDate: String!, $endDate: String!, $pageNumber: Int, $pageSize: Int, $warehouseNumber: String!) {
    getOnlineOrders(startDate: $startDate, endDate: $endDate, pageNumber: $pageNumber, pageSize: $pageSize, warehouseNumber: $warehouseNumber) {
      pageNumber pageSize totalNumberOfRecords
      bcOrders {
        orderHeaderId orderPlacedDate: orderedDate orderNumber: sourceOrderNumber orderTotal warehouseNumber status
        orderLineItems { itemNumber itemDescription lineNumber status }
      }
    }
  }`);

  const ONLINE_DETAILS_QUERY = gqlText(`query getOrderDetails($orderNumbers: [String]) {
    getOrderDetails(orderNumbers: $orderNumbers) {
      orderNumber: sourceOrderNumber orderPlacedDate: orderedDate status warehouseNumber
      merchandiseTotal shippingAndHandling discountAmount uSTaxTotal1 orderTotal
      shipToAddress: orderShipTos {
        orderLineItems {
          itemNumber itemDescription: sourceItemDescription price: unitPrice
          quantity: orderedTotalQuantity merchandiseTotalAmount isFeeItem orderStatus
        }
      }
    }
  }`);

  const receiptDate = (d) => `${d.getMonth() + 1}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
  const onlineDate = (d) => `${d.getFullYear()}-${d.getMonth() + 1}-${String(d.getDate()).padStart(2, '0')}`;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const progress = (msg) => chrome.runtime.sendMessage({ type: 'sync-progress', msg }).catch(() => {});

  // Auth errors let the search page retry after opening Orders & Purchases,
  // which is the page that puts a fresh idToken in localStorage.
  const authError = (msg) => Object.assign(new Error(msg), { code: 'auth' });

  async function gql(query, variables) {
    const token = localStorage.getItem('idToken');
    const clientId = localStorage.getItem('clientID');
    if (!token) throw authError('Not logged in — sign in to Costco in this tab, then sync again.');

    const res = await fetch(API, {
      method: 'POST',
      credentials: 'omit',
      headers: {
        accept: '*/*',
        'content-type': 'application/json-patch+json',
        'client-identifier': CLIENT_IDENTIFIER,
        'costco-x-authorization': `Bearer ${token}`,
        'costco-x-wcs-clientid': clientId || '',
        'costco.env': 'ecom',
        'costco.service': 'restOrders',
      },
      body: JSON.stringify({ query, variables }),
    });
    if (res.status === 401 || res.status === 403) {
      throw authError('Costco rejected the session — sign in again on the Orders & Purchases page and retry.');
    }
    if (!res.ok) throw new Error(`Costco API returned HTTP ${res.status}`);
    const json = await res.json();
    if (json.errors?.length) throw new Error(`Costco API error: ${json.errors.map((e) => e.message).join('; ')}`);
    return json.data;
  }

  // Walk backwards from now to floor in windows of `months`.
  function* windows(floor, months) {
    let end = new Date();
    while (end > floor) {
      let start = new Date(end.getFullYear(), end.getMonth() - months, end.getDate() + 1);
      if (start < floor) start = floor;
      yield [start, end];
      end = new Date(start.getFullYear(), start.getMonth(), start.getDate() - 1);
    }
  }

  async function syncWarehouse(floor) {
    const found = {};
    for (const [start, end] of windows(floor, 3)) {
      progress(`Receipts ${receiptDate(start)} – ${receiptDate(end)}… (${Object.keys(found).length} so far)`);
      const data = await gql(RECEIPTS_QUERY, {
        startDate: receiptDate(start), endDate: receiptDate(end), documentType: 'all', documentSubType: 'all',
      });
      for (const r of data?.receiptsWithCounts?.receipts ?? []) {
        found[r.transactionBarcode || `${r.transactionDateTime}|${r.total}`] = r;
      }
      await sleep(400); // be polite
    }
    return found;
  }

  async function syncOnline(floor, known) {
    const found = {};
    const PAGE = 50;
    for (const [start, end] of windows(floor, 12)) {
      for (let page = 1; ; page++) {
        progress(`Online orders ${onlineDate(start)} – ${onlineDate(end)}, page ${page}… (${Object.keys(found).length} so far)`);
        const res = (await gql(ONLINE_LIST_QUERY, {
          startDate: onlineDate(start), endDate: onlineDate(end), pageNumber: page, pageSize: PAGE, warehouseNumber: ONLINE_WAREHOUSE,
        }))?.getOnlineOrders;
        const batch = (Array.isArray(res) ? res[0] : res)?.bcOrders ?? [];
        for (const o of batch) found[o.orderNumber] = o;
        await sleep(400);
        if (batch.length < PAGE) break;
      }
    }

    // Line prices only come from getOrderDetails. Skip orders we already have
    // details for unless their status may still change.
    const need = Object.keys(found).filter((n) => !known[n]?.details || !/deliver|complete|cancel|picked/i.test(known[n].status || ''));
    for (let i = 0; i < need.length; i += 10) {
      progress(`Order details ${i + 1}–${Math.min(i + 10, need.length)} of ${need.length}…`);
      try {
        const details = (await gql(ONLINE_DETAILS_QUERY, { orderNumbers: need.slice(i, i + 10) }))?.getOrderDetails ?? [];
        for (const d of details) if (found[d.orderNumber]) found[d.orderNumber].details = d;
      } catch (e) {
        console.warn('[Receipt Search for Costco] order details failed; keeping list data only', e);
      }
      await sleep(400);
    }
    for (const n of Object.keys(found)) {
      if (!found[n].details && known[n]?.details) found[n].details = known[n].details;
    }
    return found;
  }

  // One sync at a time per tab, so a manual sync and an auto-sync can't
  // overwrite each other's merge.
  let queue = Promise.resolve();
  const sync = (opts) => (queue = queue.catch(() => {}).then(() => runSync(opts)));

  async function runSync({ since, yearsBack }) {
    const now = new Date();
    const floor = since ? new Date(since) : new Date(now.getFullYear() - yearsBack, now.getMonth(), now.getDate());
    const stored = await chrome.storage.local.get(['receipts', 'orders']);
    const receipts = stored.receipts || {};
    const orders = stored.orders || {};
    const before = Object.keys(receipts).length + Object.keys(orders).length;

    Object.assign(receipts, await syncWarehouse(floor));

    let onlineError = null;
    try {
      Object.assign(orders, await syncOnline(floor, orders));
    } catch (e) {
      onlineError = e.message; // don't lose the warehouse receipts over this
    }

    await chrome.storage.local.set({ receipts, orders, lastSync: now.toISOString(), region: location.hostname });
    const total = Object.keys(receipts).length + Object.keys(orders).length;
    return { added: total - before, total, onlineError };
  }

  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg?.type === 'has-token') return reply({ ok: !!localStorage.getItem('idToken') });
    if (msg?.type !== 'sync') return;
    sync(msg).then((r) => reply({ ok: true, ...r }), (e) => reply({ ok: false, error: e.message, code: e.code }));
    return true; // async reply
  });

  // Auto-sync: when the manifest loads this on an account page and the user is
  // on Orders & Purchases, quietly pull anything new (opt-out in Settings).
  const AUTO_SYNC_EVERY = 6 * 3600e3;
  let autoRunning = false;
  async function maybeAutoSync() {
    if (autoRunning || !/ordersandpurchases/i.test(location.hash)) return;
    const { settings = {}, lastSync } = await chrome.storage.local.get(['settings', 'lastSync']);
    // Only after a first manual sync, so the initial 3-year pull is never a surprise.
    if (settings.autoSync === false || !lastSync || Date.now() - new Date(lastSync) < AUTO_SYNC_EVERY) return;
    autoRunning = true;
    try {
      for (let i = 0; i < 20 && !localStorage.getItem('idToken'); i++) await sleep(1000);
      const since = new Date(new Date(lastSync).getTime() - 31 * 864e5).toISOString();
      console.info('[Receipt Search for Costco] auto-sync', await sync({ since, yearsBack: 3 }));
    } catch (e) {
      console.warn('[Receipt Search for Costco] auto-sync failed', e);
    } finally {
      autoRunning = false;
    }
  }
  window.addEventListener('hashchange', maybeAutoSync);
  maybeAutoSync();
}
