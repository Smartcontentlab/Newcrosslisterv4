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
- `components/PricingPanel.tsx`: list price with a "Suggest a price" button (Add suggestion / No thanks; shows eBay sample sales and a "See sold comps on eBay" link), weight with tap-to-fill "weight usuals", free-shipping and Depop-boost switches, live take-home per marketplace, and working backwards from a target. Shipping defaults to a typical $6.49 label and is editable under "Change".
- `POST /api/ai/price-estimate`: see "Price suggestions" below.
- "What I paid" moved to an optional collapsed "Private records" section. It is never sent to a marketplace and only drives profit figures.

## Photo workbench: "whole item" cutout
- `src/lib/cutout.ts` (used by `processPhoto` in `pages/listing-studio.tsx`). Problem it fixes: the cutout model (`@imgly/background-removal`, ISNet) keeps the most eye-catching object, so a white or grey garment on a light bed or floor came back as only the printed graphic. Tested with the small, medium and full model sizes: same result, so a bigger model does not help.
- How it works: run the model, then use its answer as a hint and grow it to the real garment edge with GrabCut (OpenCV, colour-based) on a 480 px copy. If the model already covers 90% or more of the item, its result is used untouched. If GrabCut fails or swallows the frame, it falls back to the model result.
- Measured on synthetic flat-lay tees (white on cream, grey on grey carpet, white on white, black on dark wood): share of the garment kept went from about 14-15% to 99% on the light ones; the black-on-dark case was already fine and stays untouched. On real catalogue photos a white tee that came back see-through is now solid. Not yet measured on the user's own photos.
- Cost: OpenCV loads only when a cutout runs (about 15 MB, 3.9 MB compressed, browser-cached). The model files come from the imgly CDN at run time, as before. The output is capped at 2400 px on the long side.
- White backdrop now adds a soft contact shadow so a white item stays visible.
- Licence flag for the app-store plan: `@imgly/background-removal` is AGPL-3.0 (its own licence file). Fine for a private tool; before selling or shipping the app, either buy their commercial licence or swap the cutout step for a permissively licensed model. BiRefNet (MIT) gives better edges but its browser build ran out of memory in testing (224 MB fp32 model), so it would need a server-side step.

## AI layer (v6)
- Why "the AI did not answer" happened: `NVIDIA_NIM_MODEL` in Vercel was `meta/llama-3.3-70b-instruct`, which NVIDIA's live catalogue (`GET https://integrate.api.nvidia.com/v1/models`, public) does not list, and the old code hid the error and swapped in a template that looked like an answer.
- `artifacts/api-server/src/lib/nim.ts` is now the only place that talks to NVIDIA. It reads the live model list (cached 10 min), uses `NVIDIA_NIM_MODEL` only if it is in that list, otherwise walks a preference list (text and vision lists at the top of the file), moves to the next model on 404/429/5xx/timeouts (with short cool-downs), strips `<think>` blocks, and throws a `NimError` whose message is safe to show ("The AI could not answer: <model> answered HTTP 503"). 401/403 becomes "NVIDIA rejected the AI key". The key is never logged or returned.
- No fake AI output: title/tags/photo reading return an error the UI shows, and change nothing. Only the per-platform copy has a deterministic template fallback, and it is labelled "template" with the reason in the UI, the draft cards and the API (`source`, `reason`, `aiProblem`).
- Tests: `pnpm --filter @workspace/api-server run test` (30 checks; NVIDIA, SoldComps and eBay are mocked, no keys needed).

## Listing studio layout (v6)
01 Photo workbench with **Start from your photos** (vision AI) -> 02 item record (with the price box and its own **Suggest a price**) -> 03 marketplace-ready details -> **04 Listing copy** (per platform) -> 05 P·D·M drafts -> 06 sale. The AI section moved after the form because it needs the facts; the photo reader sits first because it only needs photos.
- **Start from your photos** (`POST /api/workflow/photo-read`, `lib/photo-read.ts`): the browser shrinks up to 3 photos to about 512 px JPEG (`lib/downscale.ts`; NVIDIA's hosted vision endpoints reject large inline images), each photo is read in its own request (works with single-image vision models) and the answers are merged. Result is an editable checklist (only empty fields ticked by default); nothing is filled until "Apply ticked fields". Brand/size/material are only returned when a tag, logo or label is legible; `unsure` lists what it could not tell. Vision models used: `meta/llama-3.2-90b-vision-instruct`, then 11b, gemma, phi-3 vision (whichever the live list offers).
- **Listing copy** (`POST /api/workflow/listing-copy`, `lib/listing-copy.ts`, `lib/platform-playbooks.ts`): one AI call per platform in parallel, each with that platform's voice, structure, do/don't rules, length target, hashtag rule, only the trend words that match the item, and season words. Output is title + body + hashtags, cleaned and composed (Depop: the first line is the title because Depop has no title box; hashtags go at the end of the description).
- Truth guard on every AI answer: sentences with claims the seller never entered (smoke-free, authentic, ships next day, box/dust bag, worn once) are removed; measurement numbers not present in the seller's entries are removed; status hashtags (#NWT, #NWOT, #EUC, #GUC) are dropped unless the condition and text support them (#NWT is added on Poshmark only when the seller wrote "new with tags"); watched brand hashtags are dropped unless the seller entered that brand; length limits enforced; each removal is shown as a warning. "To make this stronger" hints (add measurements, flaws, brand, material, size) are deterministic.
- Saved copy: edits in section 04 are stored in `marketplaceDetails.platformCopy[platform]` with the item. `POST /api/workflow/items/:id/marketplace-drafts` uses the seller's saved copy first, then fresh AI copy, then the template, and returns `copyOrigin` (`seller | ai | template`). Drafts (and therefore the Chrome extension) fill title, description and tags from these.
- **Sources and dates for the platform rules** are in `platform-playbooks.ts` and shown to the seller under "What this style is based on". Official: Poshmark blog (title format Brand + type + attributes; description tone; measurements), Depop help centre and "How to grow your shop" (short, relevant, measurements, fill attributes), Mercari help (state brand, be truthful, tell a story, do not add unrelated brands/hashtags). Reported by third parties, not by the marketplace, so treated as soft targets and marked in the UI: title 80 chars (Poshmark, Mercari), description 1,500 (Poshmark) and 1,000 (Mercari, Depop), hashtag counts, and hashtag habits such as #NWT.
- **Monthly trend refresh (Depop):** Depop publishes "Trending on Depop" on the 1st of each month (https://www.depop.com/blog/). Open the newest post, edit `DEPOP_TRENDS` in `platform-playbooks.ts` (each entry: `words` the seller may honestly use, and `when`, a regex for which items it applies to), and update `TRENDS_AS_OF`. Trend words are offered to the AI only when the item text matches, so unrelated items never get trend words. Current data: Trending on Depop August (posted Sept 1, 2026): back-to-college, beachwear, riding boots, Halloween, high necklines, playful prints, country club chic; "The Edited Self" 2026 report: modern uniforms, neo nostalgia, everyday ceremony, romanticized sports; Aug 2025: desert revival.
- Open question for a later round: Poshmark and Mercari do not publish a trend list like Depop's. Their vocabulary is currently seasonal words plus the seller's own facts.

## Price suggestions (v6)
- `lib/comps.ts` + `POST /api/ai/price-estimate`. The title, brand and style are turned into a search ("Levi's 501 Jeans"), then: (1) SoldComps sold prices when `SOLDCOMPS_API_KEY` is set (real eBay sold listings, most recent 90 days; free plan 100 searches a month, commercial use allowed per their pricing page), (2) eBay Browse API active asking prices when `EBAY_CLIENT_ID` and `EBAY_CLIENT_SECRET` are set (labelled "asking prices, not sold prices"), (3) otherwise an AI estimate plus the seller's own past sales of the same brand or category.
- With comps the numbers are deterministic (no AI needed): junk titles (lots, parts, box only) and outliers are dropped, suggested price = median, range = 25th to 75th percentile, confidence from sample size. The card lists five sample sales with links and always offers "See sold comps on eBay" (eBay's own sold-items page for the same search), which works with no keys at all. Results are cached 12 hours per search.
- Not verified: live SoldComps and eBay responses (no keys in the build environment); the code follows their published docs and is tested against mocks of those shapes. eBay's Marketplace Insights (real sold data) is restricted to approved partners, which is why SoldComps is used.
- Risk to know: SoldComps is a small third-party service. If it disappears, the eBay Browse fallback and the eBay link keep the feature useful.

## Listing help history (v5)
- Root cause of "nothing happens" in v4: the app never mounted the toast component, so every message was invisible. `<Toaster />` is mounted in `App.tsx` and styled to the design system.

## Screens
Overview, Inventory, Listings (draft board), Orders, Listing studio, Shipping, Marketplaces (extension and connections), Analytics, AI assistant, Agent hub, Settings (new: profile, defaults, plan, CSV export), Help (new: quick start, draft states, FAQ, fee links), sign in, 404.

## Verified vs not verified
Verified: typecheck passes for the app and API, `pnpm run build:vercel` succeeds, every screen renders at desktop and phone width and in the empty state with mocked data, `supabase/schema.sql` runs twice cleanly on Postgres 16 and the signup trigger creates profiles.
Verified in a browser this round: listing-help buttons and messages, and the cutout on synthetic and catalogue photos (real model, real OpenCV).
Verified in a browser in v6 (mocked API): photo reading flow and its failure message, the three copy tabs and edits, saved copy in the save payload, template labelling when the AI is down, the price card with eBay comps.
Not verified: the cutout on the user's own photos, a real sign-up and real data against the live Supabase project, any AI endpoint with a real NVIDIA key (model behaviour, vision accuracy, the JSON quality of each model), SoldComps and eBay with real keys, the Chrome extension against live Poshmark, Depop and Mercari pages (their pages change and the selectors may need tuning).

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
3. Sell-side eBay listing through its official API (needs a developer account). Price comps from eBay are already in (see Price suggestions).
4. Redesign the three remaining hero headers, add photo upload storage (Supabase Storage free tier).
5. Store-readiness: privacy policy, terms, data export (done) and account deletion, lock CORS, remove hardcoded fallbacks, add error monitoring (Sentry free tier), then billing.
