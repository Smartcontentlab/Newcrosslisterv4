# CrossLinkOS production verification — 2026-08-21

## Authoritative marketplace fee sources used by the net-proceeds calculator

| Platform | Verified policy used in the estimator | Official source |
| --- | --- | --- |
| Poshmark (US) | $2.95 commission for sales under $15; 20% commission for sales of $15 or more. Seller label upgrades: free through 5 lb, $5 from 5.01–10 lb, and $10 from 10.01–15 lb. | [Selling fees](https://support.poshmark.com/s/article/297755057) and [FAQs / label upgrades](https://support.poshmark.com/s/topic/0TO1I000000kJqqWAE/faqs?language=en_US) |
| Depop (US) | No selling fee for US sellers; Depop Payments processing is 3.3% + $0.45 on item price, shipping, and applicable taxes. Optional boosted listings incur 12% for new US listings from 23 March 2026. | [Depop seller fees and charges](https://depophelp.zendesk.com/hc/en-gb/articles/360001791127-Seller-fees-and-charges) |
| Mercari (US) | 10% seller fee on item price plus buyer-paid shipping; no separate payment-processing fee for new or updated listings from 6 January 2025. | [Mercari fees](https://www.mercari.com/us/help_center/article/169/) |

CrossLinkOS labels all results as estimates. Shipping choices, tax treatment, seller-funded shipping, label overages, and changing marketplace policies remain seller-review inputs.

## Production checks

The production URL is [https://newcrosslisterv4000.vercel.app](https://newcrosslisterv4000.vercel.app). Its public sign-in screen rendered successfully, and `GET /api/healthz` returned `{"status":"ok"}`. An unauthenticated request to `GET /api/workflow/draft-board` returned HTTP 401, preserving the authenticated tenant boundary.

Vercel deployment `dpl_5NJN87HaagW3BW6uNjNNJPisg76a`, sourced from commit `7c48dc1` (`feat: add resale draft workflow and local extension`), reached `READY` in production. The production client bundle was checked for the new Draft Board, Sold & Fulfillment, and Connections interface copy.

The follow-on navigation-label-only deployment for commit `b1350ee` was reported by Vercel as `CANCELED` with no error, stderr, or exit events in its build log. The source commit is pushed to `main`; the next action is to re-trigger the Git deployment and verify that it reaches `READY`.

## Extension package checks

The `chrome-extension` directory passed JavaScript syntax checks for all extension files, JSON parsing for `manifest.json`, and Chromium’s unpacked-extension packaging validation. It is designed for Chrome 114+ because it uses the Manifest V3 Side Panel API. The extension holds handoff data only in `chrome.storage.session`; it does not persist marketplace credentials, cookies, or photos.
