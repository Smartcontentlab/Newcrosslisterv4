# CrossLinkOS Phase 2 workflow specification

## Purpose

This specification converts the existing authenticated canonical-listing backend into a seller-facing workflow that makes every item’s state visible without claiming marketplace actions that have not been verified. A physical item is the unit of work. Platform-specific drafts are subordinate records represented by compact **P**, **D**, and **M** chips.

## Core seller journey

1. The seller creates one canonical item in **Listing Studio** with photos, all reusable item facts, one base list price, acquisition cost, and marketplace shipping assumptions.
2. The seller saves the item without losing progress. A sticky action bar remains available after every section.
3. The seller uses the visible AI co-pilot to refine the title, description, tags, and pricing. Suggestions are editable before application.
4. The seller generates Poshmark, Depop, and Mercari drafts. The item appears once in the **Draft Board**.
5. The seller selects ready platform drafts and sends them to the locally installed extension. The extension only fills an already-open marketplace listing form. It never obtains credentials, cookies, or publishes.
6. The seller reviews, saves or publishes in the marketplace, and confirms the verified state in CrossLinkOS by supplying an optional live URL or marketplace identifier.
7. When the seller records a sale, the item leaves the active draft board, enters **Sold & Fulfillment**, and shows both the sale marketplace and the status of each remaining delisting task. It also enters the existing **Pull · Print · Pack · Ship** checklist.

## Draft-board status language

The board must not use shipping terminology before a sale. In particular, **Needs posted** means a CrossLinkOS draft is ready but has not been confirmed as created in the marketplace.

| Internal state | Seller-facing label | Meaning | Verification boundary |
| --- | --- | --- | --- |
| no_draft | No draft | No CrossLinkOS draft exists for this platform. | Local data only. |
| draft | Needs details | A draft exists but required listing facts are missing. | Local data only. |
| ready | Needs posted | A complete CrossLinkOS draft is ready to send to the extension. | Local data only. |
| prefilled | Prefilled — review | The extension reported that it filled the currently open marketplace form; seller must review and save or publish there. | Extension completion report, not a claimed marketplace draft. |
| draft_saved | Draft saved | Seller explicitly confirmed the marketplace saved the draft after review. | Seller confirmation only unless a verified marketplace ID is recorded. |
| published | Live | Seller explicitly confirmed publication and optionally records the live URL or marketplace listing ID. | Seller confirmation with optional proof link. |
| sold | Sold | The seller recorded a sale on this platform. | Seller-recorded sale. |
| delisted | Delisted | The remaining-platform delisting task has been completed. | Seller confirmation. |
| needs_attention | Needs attention | Extension, form, or seller review needs intervention. | Local workflow state. |

Each platform chip will surface a short label and use an accessible tooltip or detail drawer rather than relying only on color. The overall item stage is derived from those chip states: **Needs draft**, **Needs posted**, **Pushed for review**, **Live**, **Partially live**, **Sold — delisting**, or **Fulfillment**.

## Pricing language and fee-aware comparison

The canonical price is the single public **List price**. **What I paid** is the seller’s acquisition cost, not a second marketplace price. The client-side comparison shows estimated net proceeds and profit as a transparent planning aid, with no implication that the platforms will calculate the same amount at checkout.

| Platform | Baseline estimate | Adjustable assumption | Planning note |
| --- | --- | --- | --- |
| Poshmark | List price minus $2.95 below $15, otherwise list price times 80%. | Seller label upgrade / overage. | Buyer pays standard shipping; a seller-paid overweight-label amount reduces profit. |
| Depop (US) | List price minus 3.3% of item plus buyer shipping, minus $0.45. | Buyer shipping amount and any seller-funded shipping. | No US selling fee in the baseline; processing is charged on the transaction amount. |
| Mercari | List price minus 10% of item price plus buyer-paid shipping, then minus seller-funded shipping if applicable. | Buyer-paid or seller-paid shipping and seller shipping cost. | This is an estimate, subject to Mercari’s then-current fee and label rules. |

The calculator will place all three outcomes in one visible comparison table while the seller enters the list price. A note links to current marketplace fee pages and identifies variables that must be confirmed at sale time.

## Sold-to-fulfillment lifecycle

After **Record sale** is completed, the system must show a dedicated **Sold & Fulfillment** lifecycle card or tab, rather than leaving the seller to infer the next tasks from several screens.

| Lifecycle area | Required display |
| --- | --- |
| Sale origin | The marketplace where it sold, sold price, sold date, buyer name when captured, and optional order reference. |
| Delisting tracker | Every other P/D/M state, the exact remaining marketplaces to remove, and progress such as `1 of 2 delisted`. |
| Fulfillment handoff | A direct link to the existing Pull · Print · Pack · Ship task with checklist completion and shipment status. |
| Completion | The item remains in historical sold records after all delisting and fulfillment steps are done. |

No automated marketplace delisting, saved marketplace draft, or live listing will be represented as complete without an extension report or seller confirmation.

## Implementation inventory

| Area | Existing foundation | Planned change |
| --- | --- | --- |
| Authentication and ownership | Supabase auth, `requireAuth`, owner-scoped workflow routes, RLS. | Preserve all tenant filters and attach all new state to the authenticated user. |
| Canonical item persistence | `items` with base price, acquisition cost, photos, tags, weight, status. | Clarify labels and add client-side shipping assumptions; persist only when seller needs a reusable assumption. |
| Marketplace drafts | `marketplace_drafts` stores platform state, contents, missing fields, and external URL/ID. | Add P/D/M item-board endpoint and controlled transitions for prefilled, draft saved, live, and attention states. |
| Listing Studio | Can create, update, AI-assist, and generate drafts. | Add always-visible save actions, embedded co-pilot, transparent profit comparison, and final handoff. |
| Listings screen | Raw per-platform records. | Replace its primary view with one item per row, P/D/M chips, a detail drawer, selection, and extension handoff. |
| Sold workflow | Mark-sold creates order, shipping task, and pending delisting tasks. | Make the sale source, delisting progress, and fulfillment handoff visible together. |
| Extension | Existing agent routes provide a foundation. | Add a Manifest V3, local-only extension that fills open forms and reports only verifiable completion signals. |

## Sources for fee-assumption verification

The implementation should show estimates rather than guaranteed payout figures. Product UI copy will link sellers to current official help pages before they choose a price.

1. Poshmark fee and shipping-policy references: https://support.poshmark.com/s/article/How-does-Poshmark-make-money?language=en_US and https://support.poshmark.com/s/article/How-do-I-upgrade-my-shipping-label?language=en_US
2. Depop US fee reference: https://depophelp.zendesk.com/hc/en-gb/articles/360001790747-Selling-fees-and-taxes
3. Mercari fee reference: https://www.mercari.com/us/help_center/article/169/

The concrete UI, extension, and API behavior will be verified after build before claiming an end-to-end marketplace draft was created.

*Prepared for CrossLinkOS on 2026-08-21.*
