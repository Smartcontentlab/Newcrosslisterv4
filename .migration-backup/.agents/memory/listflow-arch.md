---
name: ListFlow architecture
description: Core data model and business logic decisions for the ListFlow resale platform
---

## Data model

One master Item → many Listings (one per marketplace) → Orders (when sold)

- Items: `draft | active | sold | archived`
- Listings: `draft | active | ended | sold` — marketplace-specific derivations of an item
- Orders: `pending | awaiting_shipment | shipped | delivered | returned | refunded`
- ShippingTasks: auto-created with 8 default steps when order moves to `awaiting_shipment`

## Key business logic

- `listingCount` on items is computed at query time (join active listings), not stored
- `profit` auto-calculated in order creation if not provided: `salePrice - fees - shippingCost`
- Shipping task steps stored as JSONB array on the task row
- When all shipping steps complete, order auto-advances to `shipped`
- When order ships/delivers, item status auto-advances to `sold`

**Why:** Keeps the data model clean without denormalization. The joins are cheap at resale-scale volume.
