# CrossLinkOS: setup and first run

Everything you need to do by hand, in order. Each step says where to click.

## 1. Create the Supabase project and its tables (once, about 5 minutes)

The original project (`wxtwjuqajceahzxyquzm`) was deleted — its hostname no longer
resolves — so this starts from a new one. A free Supabase project pauses after about
a week of no activity and is eventually removed, which is what happened here.

1. Open https://supabase.com/dashboard, create a **New project** on the free plan, and
   wait for it to finish provisioning.
2. In the left sidebar click **SQL Editor**, then **New query**.
3. Open `supabase/schema.sql` from this repo, copy the whole file, paste it into the editor.
4. Click **Run**. You should see "Success. No rows returned".
5. Click **Table Editor** and confirm these tables exist: `user_profiles`, `items`, `listings`, `orders`, `shipping_tasks`, `marketplace_drafts`, `delisting_tasks`, `buy_candidates`.

The script is safe to run again if you are unsure whether it worked.

## 2. Check the Vercel environment variables

Vercel dashboard -> project `newcrosslisterv4000` -> Settings -> Environment Variables. These must exist for Production and Preview:

| Name | What it is |
| --- | --- |
| `DATABASE_URL` | Supabase -> Project Settings -> Database -> Connection string (pooled, "Transaction" mode) |
| `NVIDIA_NIM_API_KEY` | key from build.nvidia.com (free tier) |
| `NVIDIA_NIM_MODEL` | `meta/llama-3.3-70b-instruct` |
| `SUPABASE_URL` | Supabase -> Project Settings -> Data API -> Project URL |
| `SUPABASE_PUBLISHABLE_KEY` | Supabase -> Project Settings -> API Keys -> publishable key |
| `VITE_SUPABASE_URL` | same as `SUPABASE_URL` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | same as `SUPABASE_PUBLISHABLE_KEY` |

The two `VITE_` values are baked in at build time, so after changing them you must redeploy.

## 3. Let people sign in (Supabase Auth)

1. Supabase -> **Authentication** -> **URL Configuration**.
2. Set **Site URL** to `https://newcrosslisterv4000.vercel.app`.
3. Add `https://newcrosslisterv4000.vercel.app/**` under **Redirect URLs**.
4. If you want to skip email confirmation while testing: **Authentication** -> **Sign In / Providers** -> **Email** -> turn off **Confirm email**. Turn it back on before inviting other people.

## 4. Install the Chrome extension

1. Sign in at https://newcrosslisterv4000.vercel.app and open **Marketplaces**.
2. Click **Download extension** (a zip). Unzip it somewhere permanent.
3. In Chrome open `chrome://extensions`, switch on **Developer mode** (top right).
4. Click **Load unpacked** and pick the unzipped folder.
5. Reload the CrossLinkOS tab. The Marketplaces page should now say the extension is connected.

The extension only talks to `newcrosslisterv4000.vercel.app`. Preview links and localhost are ignored on purpose.

## 5. Run it locally (optional)

```bash
pnpm install
cp .env.example .env   # fill in the same values as the Vercel table above
pnpm run typecheck
pnpm run build:vercel  # builds public/ (app) and serverless/ (API)
```

## Troubleshooting

- **Blank app or "Initializing secure workspace" forever:** the `VITE_SUPABASE_*` variables are missing on the deployment you are viewing. Add them and redeploy.
- **Every page shows an error toast:** the tables from step 1 do not exist yet, or `DATABASE_URL` is wrong.
- **Sign up says "check your email" but nothing arrives:** use step 3 to turn off email confirmation while testing.
- **Extension says "not detected":** you are on a preview or localhost address. Use the production address.
