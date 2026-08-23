# ListFlow — AI Resale Platform

An AI-powered resale automation platform that helps sellers source, list, manage, sell, and ship products across multiple marketplaces from one dashboard.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080, served at `/api`)
- `pnpm --filter @workspace/resale-app run dev` — run the frontend (served at `/`)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Wouter routing + TanStack Query + Recharts
- API: Express 5 + Zod validation
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Design: dark "deep cyber-grunge" system — near-black base, neon pink `#FF2D78` accent (glow reserved for hover/key moments), Press Start 2P for pixel headings + Nunito for body; utilities like `glass-card`, `neon-glow-pink`, `font-pixel` live in `index.css`

## Where things live

- `lib/api-spec/openapi.yaml` — API contract (source of truth)
- `lib/db/src/schema/` — Drizzle table definitions (items, listings, orders, shipping_tasks)
- `artifacts/api-server/src/routes/` — Express route handlers (items, listings, orders, shipping, analytics, ai)
- `artifacts/resale-app/src/` — React frontend

## Architecture decisions

- One master "Item" record per product; Listings are marketplace-specific derivations of it
- Shipping tasks auto-created when order status moves to `awaiting_shipment`
- AI endpoints use heuristic logic (condition multipliers, category premiums, marketplace-specific copy styles)
- Analytics computed in-memory from DB queries (no materialized views needed at this scale)
- `listingCount` on items is computed at query time by joining active listings

## Product

- **Dashboard** — Action Center ("Drafts Ready" → posting flow, "Shipments Due" → fulfillment), quick-add drop zone that auto-opens the posting flow on save, KPI cards, recent activity
- **Inventory** — Item grid with photos (shared `ItemImage` fallback for dead URLs), per-item 6-platform lit/dimmed badge cluster, "OMNIPRESENT" when fully posted
- **Listings** — Cross-listing table by marketplace; "Link Listing" modal uses a visual item picker (search + thumbnail select)
- **Orders** — Status workflow (pending → awaiting_shipment → shipped → delivered) with one-click transitions
- **Fulfillment** (route `/shipping`) — Checklist queue per order awaiting shipment, per-task progress bar; completing all steps auto-advances the order to shipped
- **Analytics** — Monthly revenue chart, marketplace breakdown, top categories, stale inventory
- **AI Assistant** — Chat + Price Estimator + Listing Generator tabs
- **Agent Hub** — Setup console for external AI agents: base endpoint, live posting queue, Claude tool schemas/system prompt, OpenAI-compatible Python snippet, raw API reference (all copy-ready)

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Google Fonts `@import url(...)` MUST be the very first line of `index.css` (before `@import 'tailwindcss'`)
- After adding new tables to `lib/db/src/schema/`, run `pnpm run typecheck:libs` before building api-server
- `listingsTable.status` enum: `draft | active | ended | sold`
- `ordersTable.status` enum: `pending | awaiting_shipment | shipped | delivered | returned | refunded`
- Body schemas in OpenAPI must use entity-shaped names (e.g. `ItemInput`, not `CreateItemBody`) to avoid Orval TS2308 collision
- `GET /api/shipping` only returns tasks for orders currently in `awaiting_shipment` — an empty Fulfillment page usually means no orders need shipping, not a bug
- Every mutation `onSuccess` must invalidate related queries via orval `get*QueryKey()` helpers, including cross-entity keys (orders ↔ shipping tasks ↔ dashboard summary)

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
