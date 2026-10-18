# Chrome Web Store listing: Receipt Search for Costco

Copy-paste source for the Developer Dashboard. Fields are in dashboard order.

---

## Store listing tab

**Name** (from manifest): Receipt Search for Costco

**Summary** (from manifest description, 132 max):
> Search every item on your Costco warehouse receipts and online orders. Unofficial; your data stays in your browser.

**Category:** Shopping

**Language:** English (United States)

**Detailed description:**

```
Find anything you've ever bought at Costco in seconds.

Costco's website makes you pick one quarter at a time from a dropdown, open each receipt, then use Ctrl+F. Receipt Search for Costco downloads your whole purchase history once and gives you a single search box, like Amazon's order search.

WHAT YOU CAN DO
• Search every item across up to 3 years of warehouse receipts and online orders, by name, item number, warehouse, or receipt/order number
• Group by item to see how often you buy something, what you paid last time, and your total spend
• See instant savings folded into the item they apply to
• Open any purchase to view the full receipt or order
• Filter by year, by warehouse vs. online, or by gas & car wash
• Export what you've found to CSV

HOW IT WORKS
1. Sign in at costco.com (or costco.ca) as usual.
2. Click the extension icon, then Sync. The first sync pulls your full history; later syncs only fetch what's new.
3. Optional: auto-sync quietly picks up new receipts whenever you open Orders & Purchases on Costco.

PRIVATE BY DESIGN
• Your purchase history is stored only in your browser.
• The extension only talks to Costco. It has no servers, analytics, ads, or tracking.
• It never sees your Costco password; it uses the session you're already signed in with.
• Uninstalling it deletes everything it stored.

Receipt Search for Costco is an independent project. It is not affiliated with, endorsed by, or sponsored by Costco Wholesale Corporation. "Costco" is a trademark of Costco Wholesale Corporation and is used here only to describe what this extension works with.
```

**Graphic assets:**
- Store icon (128×128): `extension/icons/icon128.png`
- Screenshots (1280×800): `store/screenshot-1-search.png`, `store/screenshot-2-grouped.png`, `store/screenshot-3-receipt.png`
  1. "Search every item you've bought at Costco"
  2. "See how often you buy it and what you paid"
  3. "Open the full receipt in one click"

**Homepage URL:** https://github.com/chodizzle/receipt-search-for-costco
**Support URL:** https://github.com/chodizzle/receipt-search-for-costco/issues

---

## Privacy tab

**Single purpose description:**
> Lets users search their own Costco purchase history (warehouse receipts and online orders) by downloading it from their signed-in Costco account into local browser storage and showing a search interface.

**Permission justifications:**

| Permission | Justification |
|---|---|
| `storage` | Saves the user's downloaded receipts, online orders, and settings locally so they can be searched without re-downloading. |
| `unlimitedStorage` | Several years of receipts with line items can exceed the default local storage quota. |
| `scripting` | When the user clicks Sync, injects the sync script into the user's open Costco tab so it can request their purchase history using their existing signed-in session. |
| Host permission `https://www.costco.com/*`, `https://www.costco.ca/*` | Needed to find the user's open Costco tab, inject the sync script there, and open the Orders & Purchases page when the login session must be refreshed. No other sites are accessed. |
| Content script on `costco.com/myaccount/*`, `costco.ca/myaccount/*` | Powers the optional auto-sync: when the user opens Orders & Purchases, new receipts are fetched. Users can turn this off in Settings. |

**Are you using remote code?** No. All JavaScript is included in the package.

**Data usage — what user data do you collect?** Check:
- ☑ **Financial and payment information**: purchase transactions (receipts and orders), stored only on the user's device.
- ☑ **Authentication information**: Costco's existing session token is read from the Costco page and used only to request the user's own history from Costco. It is never stored or sent anywhere else.

Leave everything else unchecked.

**Certify all three:**
- ☑ I do not sell or transfer user data to third parties, outside of the approved use cases
- ☑ I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- ☑ I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL:** https://github.com/chodizzle/receipt-search-for-costco/blob/main/PRIVACY.md

---

## Distribution tab

- **Visibility:** Public, or Unlisted to share by link only for a soft launch.
- **Regions:** United States and Canada (the extension supports costco.com and costco.ca only).
- **Pricing:** Free.

---

## Reviewer notes (Test instructions field, optional)

```
The extension only works with a signed-in Costco membership account, so reviewers without one will see "Opened Costco — sign in there" after clicking Sync. Everything runs locally; the only network requests go to Costco's own order-history API (ecom-api.costco.com), sent from the user's Costco tab with their existing session.
```
