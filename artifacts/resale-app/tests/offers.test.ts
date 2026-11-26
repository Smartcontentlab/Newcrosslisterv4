import assert from "node:assert/strict";
import { groupOffers, type OfferItem, type OfferRow } from "../src/lib/offers";

const now = Date.parse("2026-11-26T12:00:00Z");
const item: OfferItem = { id: 1, title: "Aritzia Cardigan", price: 60, cost: 8, weight: 1, status: "listed", floor: 40, listings: [] };
const base = { itemId: 1, kind: "offer" as const, listingUrl: null, listingTitle: "Aritzia Cardigan", buyer: null, detail: null, status: "open" as const, orderId: null, lastSeenAt: "2026-11-26T11:00:00Z" };
const rows: OfferRow[] = [
  { ...base, id: 1, marketplace: "poshmark", amount: 45, firstSeenAt: "2026-11-26T10:00:00Z" },
  { ...base, id: 2, marketplace: "depop", amount: 40, firstSeenAt: "2026-11-26T09:00:00Z" },
  { ...base, id: 3, marketplace: "poshmark", amount: 35, firstSeenAt: "2026-11-24T09:00:00Z" },
];
const [group] = groupOffers(rows, [item], now);
// Depop $40 keeps ~$38.23; Poshmark $45 keeps $36: the lower Depop offer is the better one.
assert.equal(group.offers[0].marketplace, "depop");
assert.equal(group.offers[0].best, true);
assert.equal(group.betterElsewhere?.site, "Depop");
assert.ok((group.betterElsewhere?.extra ?? 0) > 2);
const old = group.offers.find((o) => o.id === 3)!;
assert.equal(old.stale, true);
assert.equal(old.belowFloor, true);
assert.equal(group.offers[group.offers.length - 1].id, 3);
console.log("offers: 6 checks passed");
