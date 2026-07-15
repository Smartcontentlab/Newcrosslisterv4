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
- Design: Dark mode default, amber primary accent, Plus Jakarta Sans + Spline Sans Mono fonts

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

- **Dashboard** — KPI cards (revenue, profit, listings, orders), recent activity feed, marketplace breakdown
- **Inventory** — Item grid with photos, status, cost vs price, listing count; add/edit items
- **Listings** — Cross-listing table by marketplace with status filters
- **Orders** — Order management with status workflow (pending → awaiting_shipment → shipped → delivered)
- **Shipping** — Interactive checklist queue for each order awaiting fulfillment
- **Analytics** — Monthly revenue chart, marketplace breakdown, top categories, stale inventory
- **AI Assistant** — Chat assistant + AI listing generator + price estimator

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Google Fonts `@import url(...)` MUST be the very first line of `index.css` (before `@import 'tailwindcss'`)
- After adding new tables to `lib/db/src/schema/`, run `pnpm run typecheck:libs` before building api-server
- `listingsTable.status` enum: `draft | active | ended | sold`
- `ordersTable.status` enum: `pending | awaiting_shipment | shipped | delivered | returned | refunded`
- Body schemas in OpenAPI must use entity-shaped names (e.g. `ItemInput`, not `CreateItemBody`) to avoid Orval TS2308 collision

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
