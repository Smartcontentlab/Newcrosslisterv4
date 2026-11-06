# CrossLinkOS Draft Fill — Local Chrome Extension

CrossLinkOS Draft Fill is a **personal, unpacked Chrome extension** for the CrossLinkOS workflow. It receives seller-selected Poshmark, Depop, and Mercari drafts from the authenticated CrossLinkOS Draft Board, fills the already-open marketplace listing form, and then stops so you can review it and press Post yourself. It does **not** click Save, List, Publish, Submit, or any equivalent final action.

> **Privacy boundary:** Marketplace passwords, MFA codes, and cookies are never collected, copied, or stored. The temporary queue lives in Chrome extension session memory and is cleared when Chrome restarts, when the extension reloads, or when the seller clears it. Listing photos are passed once per item and attached to the form's photo picker, where you can still reorder or remove them.

## Install for personal use

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode** in the upper-right corner.
3. Select **Load unpacked**.
4. Choose the `chrome-extension` folder from this repository.
5. Pin **CrossLinkOS Draft Fill** from Chrome’s extensions menu, if desired.
6. Open the deployed CrossLinkOS app and visit **Connections**. Select **Check local extension** to confirm Chrome has loaded it.

The extension uses Chrome’s Manifest V3 Side Panel API, which requires Chrome 114 or later. Chrome documents the `sidePanel` permission, its persistent companion-panel model, and its user-gesture restrictions in its Side Panel API reference. [Chrome Side Panel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel)

## Seller workflow

1. In CrossLinkOS, create and save a canonical item, then generate the P/D/M drafts.
2. On **Listings**, select one or more items whose platform chip says **Needs posted**.
3. Select **Prepare extension handoff**. This sends only the title, description, tags, price, and photo reminder to the extension’s temporary local queue.
4. Open the marketplace yourself and sign in directly in the normal Chrome tab.
5. Open that platform’s **new listing** form. Chrome’s CrossLinkOS side panel will show the appropriate queued draft.
6. Select **Fill draft in this form**. The extension fills visible title, description, price, and tag fields where the marketplace exposes compatible controls.
7. Read the side panel's report: it lists anything it couldn't fill (for example a size the marketplace doesn't offer). Finish those by hand, review everything, then decide whether to **save the marketplace draft** or **publish**.
8. Back in CrossLinkOS, use the platform chip to confirm **Draft saved** or **Live**. CrossLinkOS does not infer either state from the field-fill action.

## What the extension can and cannot do

| Capability | Behavior |
| --- | --- |
| Marketplace sign-in | The seller signs in directly on each marketplace. The extension may inspect the visible local page to report a high-level signed-in, signed-out, or unknown status. |
| Draft queue | The queue is held only in `chrome.storage.session`, not synced across Chrome profiles or stored by CrossLinkOS. Chrome documents that this storage is memory-backed and cleared when the extension reloads or Chrome restarts. [Chrome Storage API](https://developer.chrome.com/docs/extensions/reference/api/storage) |
| Poshmark | Fills title, description, department and category, subcategory, size, condition, brand (picked from Poshmark's list), up to 2 colors, up to 3 style tags, and price. It also fills the Listing Price pop-up: original price, and Automate Offers from your Smart Sell setting (off, minimum price, or floor %). Mapped against the live form in Nov 2026. |
| Depop | Depop has no title field, so the title goes on the description's first line, followed by your tags as up to 5 hashtags. Also fills category (under the right department), brand, condition, up to 2 colors, size, material, source, age, style, quantity, SKU and price. Shipping stays on Depop's default; check the package size. Mapped against the live form in Nov 2026. |
| Mercari | Title, description, price and tags only. Mercari blocks its sell form until the account finishes government-ID verification, so the full mapping is still to do. |
| Photos | Attached to the form's photo picker when the handoff included them. Check them before posting. |
| Marketplace drafts | A successful fill means **Prefilled — review** only. It does not mean a marketplace draft is saved. |
| Publish / submit | Never automated. The seller manually saves or publishes after review. |
| Cookies / credentials | Never requested, read, or stored. |

## Troubleshooting

If the Connections page says the extension is not detected, refresh the CrossLinkOS browser tab after loading the unpacked extension. If the extension shows **Open Poshmark, Depop, or Mercari first**, navigate to that marketplace’s listing flow and wait until the form is visible. If a field cannot be found, wait for the marketplace page to finish loading and try again; selector layouts may change, and CrossLinkOS will report the draft as **Needs attention** rather than claiming success.

For external web-page access, Chrome requires an explicit `externally_connectable.matches` allow-list in the extension manifest. This package allows only the CrossLinkOS Vercel URL to initiate the limited local handoff. [Chrome externally_connectable reference](https://developer.chrome.com/docs/extensions/reference/manifest/externally-connectable)
