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
- Hosting: Vercel (`vercel.json`, `scripts/build-vercel.mjs`, `api/index.js` (all `/api/*` requests are rewritten to it)). `main` auto-deploys to `crosslinkos.vercel.app`.
- Not part of the product: `artifacts/mockup-sandbox`, `artifacts/crosslink-competitive-strategy`, `.migration-backup` (kept as reference).

## Design system
Source of truth: the "Crosslister" design system (Framer, "Readable Shape"), mirrored in the Claude artifacts https://claude.ai/artifact/9sDPNjE317tDM77Avwr89b (system) and https://claude.ai/artifact/QSrcAXQtBhjyBim8q9U5My (reference board). Tokens live in `artifacts/resale-app/src/index.css` as HSL variables. The system is light only, so dark mode was removed.
- Shape: square corners everywhere (all radius tokens are 0; only the status dot is round). 2px near-black borders on panels, buttons, the sidebar and header rules; 1px on rows and tiles. No shadows, gradients or blur.
- Colour: ground `#F6F3EE`, panel `#ECE8E1`, card `#FFFDF9`, ink `#161616`. Signal Pink `#F59AC9` and Status Lime `#98B91C` are used as fills only, always with ink text (as text they fail contrast). Accent-tint `#F1DDE7` is for one washed panel per screen; the inverse (black) strip is for one tile per screen.
- Type: Fira Sans 800 only for the page headline (`cx-display`). Nunito for everything else: wordmark (`cx-wordmark`), metrics (`cx-metric`), panel titles (`cx-panel-title`), uppercase buttons, eyebrows (`cx-eyebrow`, led by a sparkle) and links (`cx-link`, ending in an arrow).
- Voice: sparkle at most once per block; a slash separates a title from its count ("Activity / 6").
- Shared pieces: `PageHeader`, `MarketplaceBadges` (square letter-code tiles), `ui/button` (variants: default pink, `send` lime, outline, destructive), `ui/sparkle`, `AppLayout` (248px sidebar with numbered items and an inverse status box). `lib/theme.ts` now only pins the light theme.
- Decisions to confirm: the product keeps the name "CrossLinkOS" rather than the design file's working wordmark "LIST//SYNC"; marketplaces use letter-code tiles instead of the Etsy/Shopify/eBay logos in the design file.

## Pricing and fees (Listing studio)
- `artifacts/resale-app/src/lib/pricing.ts`: the fee maths (Poshmark $2.95 under $15 else 20%, buyer-paid $6.49 label with a $5 / $10 seller upgrade over 5 / 10 lb; Depop 0% selling fee, 3.3% + $0.45 processing on price plus shipping, optional 12% boost; Mercari 10% of price plus buyer-paid shipping), the "what do I list at to keep $X" reverse calculator, and the weight cheat sheet. Sources and check date are in the file header. Fee rules change (Mercari changes label prices Oct 19, 2026): re-check before launch and periodically.
- `components/PricingPanel.tsx`: list price with an "AI suggestion?" button (Add suggestion / No thanks), weight with tap-to-fill "weight usuals", free-shipping and Depop-boost switches, live take-home per marketplace, and working backwards from a target. Shipping defaults to a typical $6.49 label and is editable under "Change".
- `POST /api/ai/price-estimate` (api-server `routes/ai.ts`) now also looks up the seller's own past sales of the same brand or category and returns `yourSales` and `basis`. It is still an AI estimate, not live marketplace data. Next step for real comps: eBay Browse API (free developer key; active listings only, sold data is restricted).
- "What I paid" moved to an optional collapsed "Private records" section. It is never sent to a marketplace and only drives profit figures.

## Photo workbench: "whole item" cutout
- `src/lib/cutout.ts` (used by `processPhoto` in `pages/listing-studio.tsx`). Problem it fixes: the cutout model (`@imgly/background-removal`, ISNet) keeps the most eye-catching object, so a white or grey garment on a light bed or floor came back as only the printed graphic. Tested with the small, medium and full model sizes: same result, so a bigger model does not help.
- How it works: run the model, then use its answer as a hint and grow it to the real garment edge with GrabCut (OpenCV, colour-based) on a 480 px copy. If the model already covers 90% or more of the item, its result is used untouched. If GrabCut fails or swallows the frame, it falls back to the model result.
- Measured on synthetic flat-lay tees (white on cream, grey on grey carpet, white on white, black on dark wood): share of the garment kept went from about 14-15% to 99% on the light ones; the black-on-dark case was already fine and stays untouched. On real catalogue photos a white tee that came back see-through is now solid. Not yet measured on the user's own photos.
- Cost: OpenCV loads only when a cutout runs (about 15 MB, 3.9 MB compressed, browser-cached). The model files come from the imgly CDN at run time, as before. The output is capped at 2400 px on the long side.
- White backdrop now adds a soft contact shadow so a white item stays visible.
- Licence flag for the app-store plan: `@imgly/background-removal` is AGPL-3.0 (its own licence file). Fine for a private tool; before selling or shipping the app, either buy their commercial licence or swap the cutout step for a permissively licensed model. BiRefNet (MIT) gives better edges but its browser build ran out of memory in testing (224 MB fp32 model), so it would need a server-side step.

## Listing help (section 02) and messages
- Root cause of "nothing happens": the app never mounted the toast component, so every success and error message (including "add a title first") was invisible. `<Toaster />` is now mounted in `App.tsx` and styled to the design system. Any older toast in the app now shows for the first time.
- Write description / Improve title / Suggest tags now call `POST /api/workflow/ai-assist`, which works straight from the form fields (no saved item, no database needed). If the NVIDIA model is not configured or fails, it returns a plain template built from the entries and says so. Messages also appear inline in the card.
- Estimate price now triggers the same "AI suggestion?" flow as the price box (you choose whether to add it) instead of overwriting the list price.

## Screens
Overview, Inventory, Listings (draft board), Orders, Listing studio, Shipping, Marketplaces (extension and connections), Analytics, AI assistant, Agent hub, Settings (new: profile, defaults, plan, CSV export), Help (new: quick start, draft states, FAQ, fee links), sign in, 404.

## Verified vs not verified
Verified: typecheck passes for the app and API, `pnpm run build:vercel` succeeds, every screen renders at desktop and phone width and in the empty state with mocked data, `supabase/schema.sql` runs twice cleanly on Postgres 16 and the signup trigger creates profiles.
Verified in a browser this round: listing-help buttons and messages, and the cutout on synthetic and catalogue photos (real model, real OpenCV).
Not verified: the cutout on the user's own photos, a real sign-up and real data against the live Supabase project, the AI endpoints with a real NVIDIA key, the Chrome extension against live Poshmark, Depop and Mercari pages (their pages change and the selectors may need tuning).

## Known gaps and risks
- `artifacts/api-server/src/lib/auth.ts` falls back to a hardcoded Supabase URL and publishable key when env vars are missing. Publishable keys are public by design but the fallback should be removed before other tenants use the app.
- The API uses `app.use(cors())` with no origin list. Restrict it to the production domain before opening the app to the public.
- Fee estimates are planning numbers and go stale. Each marketplace's fee page is linked from Help.
- Listing studio's long form and the Listings table keep their original structure with the new tokens applied; they have not been redesigned screen-by-screen.
- Plans and billing are placeholders (everyone is on "free").
- Email notifications are stored as a preference only; nothing sends yet.

## Suggested next steps
1. Run `supabase/schema.sql`, sign up, add three real items, walk the whole flow and write down what feels wrong.
2. Tune the extension selectors against live marketplace forms.
3. eBay through its official API (needs a developer account).
4. Redesign the three remaining hero headers, add photo upload storage (Supabase Storage free tier).
5. Store-readiness: privacy policy, terms, data export (done) and account deletion, lock CORS, remove hardcoded fallbacks, add error monitoring (Sentry free tier), then billing.
