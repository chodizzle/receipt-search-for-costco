// Fake chrome.* + demo purchase history for store screenshots. Loaded before search.js.
// After search.js renders, applies the view described in the URL hash:
//   #q=<search>&view=grouped|lines&open=<row index>
(() => {
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const pick = (a) => a[Math.floor(rand() * a.length)];

  const products = [
    ['1092765', 'KS PAPER TOWEL 12CT', 23.99, 4], ['96716', 'ROTISSERIE CHICKEN', 4.99, 0], ['1144513', 'KS PURIFIED WATER 40PK', 4.49, 1],
    ['30669', 'ORGANIC BANANAS 3LB', 1.99, 0], ['1069221', 'KS EV OLIVE OIL 2L', 19.99, 3], ['1003563', 'KS HOUSE BLEND COFFEE 2.5LB', 17.99, 0],
    ['1195364', 'CAGE FREE EGGS 5DZ', 11.99, 0], ['513234', 'KS ORGANIC MILK 3PK', 12.49, 0], ['1149920', 'KS BATH TISSUE 30CT', 24.99, 5],
    ['1358012', 'STRAWBERRIES 2LB', 5.99, 0], ['46432', 'AVOCADOS 6CT', 6.49, 0], ['1427500', 'KS ALMOND BUTTER 27OZ', 9.99, 0],
    ['1184228', 'SALMON FILLET', 31.86, 0], ['1050617', 'KS LAUNDRY PACS 152CT', 21.99, 4], ['1201430', 'SPARKLING WATER 35PK', 12.99, 2],
    ['1625311', 'KS TRAIL MIX 4LB', 14.99, 0], ['1101254', 'KS DISH SOAP PACS 115CT', 16.49, 3], ['1390087', 'FRESH BLUEBERRIES 18OZ', 6.99, 0],
  ];
  const warehouses = ['ISSAQUAH', 'KIRKLAND', 'TUKWILA'];
  // Local-time ISO string (toISOString would shift to UTC).
  const local = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 19);
  const receipts = {};
  const now = new Date();
  for (let i = 0; i < 46; i++) {
    const d = new Date(now.getTime() - (i * 15 + Math.floor(rand() * 8) + 2) * 864e5);
    d.setHours(10 + Math.floor(rand() * 9), Math.floor(rand() * 60));
    const items = [];
    const chosen = new Set([1, ...Array.from({ length: 4 + Math.floor(rand() * 7) }, () => Math.floor(rand() * products.length))]);
    for (const idx of chosen) {
      const [num, desc, price, off] = products[idx];
      const unit = rand() < 0.15 ? 2 : 1;
      const drift = 1 + (Math.floor(rand() * 3) - 1) * 0.05 * (i > 20 ? 1 : 0);
      const p = Math.round(price * drift * 100) / 100;
      items.push({ itemNumber: num, itemDescription01: desc, itemDescription02: '', amount: +(p * unit).toFixed(2), unit, itemUnitPriceAmount: p });
      if (off && rand() < 0.5) items.push({ itemNumber: '0', itemDescription01: `/${num}`, amount: -off, unit: 1 });
    }
    const sub = items.reduce((s, it) => s + it.amount, 0);
    const bc = `2113${String(400 + i).padStart(5, '0')}${d.toISOString().slice(2, 10).replace(/-/g, '')}${String(1000 + Math.floor(rand() * 9000))}`;
    receipts[bc] = { transactionBarcode: bc, transactionDateTime: local(d), warehouseName: pick(warehouses),
      documentType: 'WarehouseReceiptDetail', subTotal: +sub.toFixed(2), taxes: +(sub * 0.04).toFixed(2), total: +(sub * 1.04).toFixed(2), itemArray: items };
  }
  const gasDate = new Date(now.getTime() - 9 * 864e5).toISOString().slice(0, 19);
  receipts.GAS1 = { transactionBarcode: '21134006210261009', transactionDateTime: gasDate, warehouseName: 'ISSAQUAH', documentType: 'FuelReceipts', total: 52.1,
    itemArray: [{ itemNumber: '400', itemDescription01: 'REGULAR', amount: 52.1, fuelUnitQuantity: 12.512, fuelUomCode: 'GAL', itemUnitPriceAmount: 4.164 }] };
  const orders = {
    1205530981: { orderNumber: '1205530981', orderPlacedDate: new Date(now.getTime() - 40 * 864e5).toISOString().slice(0, 10), status: 'Delivered', orderTotal: 60.98,
      details: { merchandiseTotal: 56.98, uSTaxTotal1: 4, shipToAddress: [{ orderLineItems: [
        { itemNumber: '1092765', itemDescription: 'Kirkland Signature Paper Towels, 12 Rolls', price: 26.99, quantity: 1, merchandiseTotalAmount: 26.99 },
        { itemNumber: '1720881', itemDescription: 'Memory Foam Pillow, 2-pack', price: 29.99, quantity: 1, merchandiseTotalAmount: 29.99 }] }] } },
  };

  const data = { receipts, orders, lastSync: new Date(now.getTime() - 2 * 3600e3).toISOString(), settings: { autoSync: true, includeGas: true } };
  window.chrome = {
    storage: { local: { get: async () => data, set: async (v) => Object.assign(data, v) }, onChanged: { addListener() {} } },
    runtime: { onMessage: { addListener() {} } }, tabs: {}, scripting: {},
  };

  window.addEventListener('load', () => setTimeout(() => {
    const h = new URLSearchParams(location.hash.slice(1));
    if (h.get('view')) document.querySelector(`input[name=view][value=${h.get('view')}]`).click();
    const q = document.querySelector('#q');
    q.value = h.get('q') || '';
    q.dispatchEvent(new Event('input'));
    setTimeout(() => {
      if (h.has('open')) document.querySelectorAll('#results tbody tr')[+h.get('open')].click();
      q.blur();
    }, 200);
  }, 200));
})();
