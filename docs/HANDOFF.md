# CrossLinkOS: handoff

For any human or agent picking this project up. Read this first, then `docs/SETUP.md`.

## What it is
A cross-listing and resale operations app. A seller enters an item once, the app prepares Poshmark, Depop and Mercari drafts, a Chrome extension fills the marketplace forms inside the seller's own logged-in browser, and the app tracks sales, delisting from other marketplaces and shipping. The extension never saves or publishes; the seller always presses the final button.

## Architecture
- Monorepo (pnpm, Node 22, TypeScript).
- `artifacts/resale-app`: React 19, Vite 7, Tailwind v4, shadcn/radix, wouter, TanStack Query, recharts, Supabase Auth.
- `artifacts/api-server`: Express 5, Drizzle ORM on Postgres, NVIDIA NIM for AI, verifies Supabase tokens.
- `lib/db`: Drizzle tables. `lib/api-client-react`: generated hooks. `lib/api-zod`, `lib/api-spec`: request validation and OpenAPI.
- `chrome-extension`: Manifest V3 side panel that prefills marketplace forms.
- `supabase/schema.sql`: the full database schema with row level security and the signup trigger.
- Hosting: Vercel (`vercel.json`, `scripts/build-vercel.mjs`, `api/[[...path]].js`). `main` auto-deploys to `crosslinkos.vercel.app`.
- Not part of the product: `artifacts/mockup-sandbox`, `artifacts/crosslink-competitive-strategy`, `.migration-backup` (kept as reference).

## Design system
Tokens live in `artifacts/resale-app/src/index.css` as HSL variables (light in `:root`, dark in `.dark`). Reference: the "Crosslister Design System" artifact (https://claude.ai/artifact/9sDPNjE317tDM77Avwr89b) and the UI reference board (https://claude.ai/artifact/QSrcAXQtBhjyBim8q9U5My).
Rules: near-black and warm off-white surfaces, one muted neo-pink accent used sparingly, mono type for labels and numbers, pill buttons, 20px card radius, small four-point sparkle as the only decorative motif. Shared pieces: `PageHeader`, `MarketplaceBadges`, `ui/sparkle`, theme toggle in `lib/theme.ts` (stored in localStorage, wrapped in try/catch).

## Screens
Overview, Inventory, Listings (draft board), Orders, Listing studio, Shipping, Marketplaces (extension and connections), Analytics, AI assistant, Agent hub, Settings (new: profile, defaults, theme, plan, CSV export), Help (new: quick start, draft states, FAQ, fee links), sign in, 404.

## Verified vs not verified
Verified: typecheck passes for the app and API, `pnpm run build:vercel` succeeds, every screen renders in light, dark, phone width and empty state with mocked data, `supabase/schema.sql` runs twice cleanly on Postgres 16 and the signup trigger creates profiles.
Not verified: a real sign-up and real data against the live Supabase project, the AI endpoints with a real NVIDIA key, the Chrome extension against live Poshmark, Depop and Mercari pages (their pages change and the selectors may need tuning).

## Known gaps and risks
- `artifacts/api-server/src/lib/auth.ts` falls back to a hardcoded Supabase URL and publishable key when env vars are missing. Publishable keys are public by design but the fallback should be removed before other tenants use the app.
- The API uses `app.use(cors())` with no origin list. Restrict it to the production domain before opening the app to the public.
- Fee estimates are planning numbers and go stale. Each marketplace's fee page is linked from Help.
- Listings, Orders and Listing studio still have their older hero headers; they work and match the theme but have not had the full redesign.
- Plans and billing are placeholders (everyone is on "free").
- Email notifications are stored as a preference only; nothing sends yet.

## Suggested next steps
1. Run `supabase/schema.sql`, sign up, add three real items, walk the whole flow and write down what feels wrong.
2. Tune the extension selectors against live marketplace forms.
3. eBay through its official API (needs a developer account).
4. Redesign the three remaining hero headers, add photo upload storage (Supabase Storage free tier).
5. Store-readiness: privacy policy, terms, data export (done) and account deletion, lock CORS, remove hardcoded fallbacks, add error monitoring (Sentry free tier), then billing.
