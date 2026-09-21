# CrossLinkOS: setup and first run

Everything you need to do by hand, in order. Each step says where to click.

## 1. Create the database tables (once, about 2 minutes)

1. Open https://supabase.com/dashboard and choose the project `wxtwjuqajceahzxyquzm`.
2. In the left sidebar click **SQL Editor**, then **New query**.
3. Open `supabase/schema.sql` from this repo, copy the whole file, paste it into the editor.
4. Click **Run**. You should see "Success. No rows returned".
5. Click **Table Editor** and confirm these tables exist: `user_profiles`, `items`, `listings`, `orders`, `shipping_tasks`, `marketplace_drafts`, `delisting_tasks`, `buy_candidates`.

The script is safe to run again if you are unsure whether it worked.

## 2. Check the Vercel environment variables

Vercel dashboard -> project `crosslinkos` -> Settings -> Environment Variables. These must exist for Production and Preview:

| Name | What it is |
| --- | --- |
| `DATABASE_URL` | Supabase -> Project Settings -> Database -> Connection string (pooled, "Transaction" mode) |
| `NVIDIA_NIM_API_KEY` | key from build.nvidia.com (free tier) |
| `NVIDIA_NIM_MODEL` | leave it out (delete it if it exists). The app now reads NVIDIA's live model list and picks a working model. If you set it, it must be a model NVIDIA currently lists at https://integrate.api.nvidia.com/v1/models, otherwise it is ignored |
| `SUPABASE_URL` | `https://wxtwjuqajceahzxyquzm.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | Supabase -> Project Settings -> API Keys -> publishable key |
| `VITE_SUPABASE_URL` | same as `SUPABASE_URL` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | same as `SUPABASE_PUBLISHABLE_KEY` |

The two `VITE_` values are baked in at build time, so after changing them you must redeploy.

Optional, for real eBay prices in the "Suggest a price" button (section 5 below has the click-by-click):

| Name | What it is |
| --- | --- |
| `SOLDCOMPS_API_KEY` | sold-price data for eBay. Free plan: 100 searches a month. Sign up at https://sold-comps.com |
| `EBAY_CLIENT_ID` and `EBAY_CLIENT_SECRET` | eBay developer keyset (free). Used only when SoldComps is not set or is out of searches. Gives current asking prices, not sold prices |

Without these the button still works: it uses an AI estimate plus your own past sales, and always shows a link to eBay's sold-items page for the same search.

## 3. Let people sign in (Supabase Auth)

1. Supabase -> **Authentication** -> **URL Configuration**.
2. Set **Site URL** to `https://crosslinkos.vercel.app`.
3. Add `https://crosslinkos.vercel.app/**` under **Redirect URLs**.
4. If you want to skip email confirmation while testing: **Authentication** -> **Sign In / Providers** -> **Email** -> turn off **Confirm email**. Turn it back on before inviting other people.

## 4. Install the Chrome extension

1. Sign in at https://crosslinkos.vercel.app and open **Marketplaces**.
2. Click **Download extension** (a zip). Unzip it somewhere permanent.
3. In Chrome open `chrome://extensions`, switch on **Developer mode** (top right).
4. Click **Load unpacked** and pick the unzipped folder.
5. Reload the CrossLinkOS tab. The Marketplaces page should now say the extension is connected.

The extension only talks to `crosslinkos.vercel.app`. Preview links and localhost are ignored on purpose.

## 5. Turn on real eBay prices (optional, about 5 minutes)

1. Go to https://sold-comps.com and create a free account. No card is needed for the free plan.
2. Copy your API key from the dashboard (it starts with `sc_`).
3. Vercel -> project `crosslinkos` -> Settings -> Environment Variables -> **Add**.
4. Name: `SOLDCOMPS_API_KEY`. Value: paste the key. Tick Production, Preview and Development. Tick **Sensitive** if offered. Save.
5. Vercel -> Deployments -> the newest one -> the three dots -> **Redeploy**.
6. In the app open Listing studio, type a title such as "Levi's 501 jeans", click **Suggest a price**. The card should say "Recent eBay sold prices" and list sample sales.

Each click uses one of the 100 monthly searches; repeat searches for the same title are remembered for 12 hours and cost nothing.

## 6. Run it locally (optional)

```bash
pnpm install
cp .env.example .env   # fill in the same values as the Vercel table above
pnpm run typecheck
pnpm run build:vercel  # builds public/ (app) and serverless/ (API)
pnpm --filter @workspace/api-server run test   # AI client, copy writer, comps and route tests (no keys, no network)
```

## Troubleshooting

- **Blank app or "Initializing secure workspace" forever:** the `VITE_SUPABASE_*` variables are missing on the deployment you are viewing. Add them and redeploy.
- **Every page shows an error toast:** the tables from step 1 do not exist yet, or `DATABASE_URL` is wrong.
- **Sign up says "check your email" but nothing arrives:** use step 3 to turn off email confirmation while testing.
- **"The AI could not answer" in the app:** the message now says why. "NVIDIA rejected the AI key" means the key in Vercel is wrong or expired: create a new one at https://build.nvidia.com and update `NVIDIA_NIM_API_KEY`, then redeploy. "...answered HTTP 503/429" means NVIDIA is busy: wait a minute and retry. If `NVIDIA_NIM_MODEL` is set to a retired model the app ignores it automatically.
- **Extension says "not detected":** you are on a preview or localhost address. Use the production address.
