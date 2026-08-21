# CrossLinkOS Free Hosting Decision — August 21, 2026

## Recommendation

For a **small personal workspace**, use **Vercel Hobby with the existing Supabase free project**. It is the fastest path because CrossLinkOS already has a React/Vite frontend plus a Node/Express serverless API. Vercel Functions support the Node.js runtime; the Hobby plan includes one million function invocations per month, 4 CPU-hours of active time, 360 GB-hours of provisioned memory, 100 deployments per day, and a five-minute maximum function duration. [1] [2]

The important limitation is that Vercel documents Hobby as restricted to **non-commercial, personal use**. If CrossLinkOS becomes a business-operated product, acquires outside users, or runs meaningful commercial volume, it should move to a paid/commercially appropriate plan rather than rely on Hobby. [1]

## Compared options

| Host | Fit for CrossLinkOS today | Main advantage | Main constraint | Decision |
|---|---|---|---|---|
| **Vercel Hobby + Supabase** | Strong for a single seller/personal workspace | Small adaptation; retains Node API and static Vite client | Hobby is personal/non-commercial use; hard monthly usage limits | **Recommended for personal use** |
| Cloudflare Pages + Workers | Technically possible but needs a substantial API rewrite | Free plan has 100,000 Worker requests/day and free static assets | Worker free plan has 10 ms CPU per invocation; current Node/Postgres Express server cannot be lifted unchanged | Defer until an edge-first rewrite is worthwhile |
| Render Free Web Service | Can run the current Express app with fewer code changes | One normal Node web service | Spins down after 15 idle minutes; cold starts about a minute; docs say not for production | Reasonable temporary fallback, not preferred |
| Current Netlify site | Existing configuration is ready | No migration required | Production deploy was blocked by the connected account’s reported usage limit | Not currently viable |

## Implementation consequence

The Vercel route will add a Vercel-compatible Node serverless entry point and rewrites while preserving the current Express routers, Supabase Auth, PostgreSQL, and NVIDIA NIM environment variables. The application will then be deployed under a new Vercel URL and tested using a real seller signup before old test records are assigned or removed.

## References

[1]: https://vercel.com/docs/plans/hobby "Vercel Hobby Plan"

[2]: https://vercel.com/docs/functions/limitations "Vercel Functions Limits"

[3]: https://developers.cloudflare.com/workers/platform/pricing/ "Cloudflare Workers Pricing"

[4]: https://render.com/docs/free "Render — Deploy for Free"

## Vercel deployment diagnostics

The user-authorized Vercel account is the `shay` team (`team_Uxn8CM88WMpbiVaCBzVe0NNj`). The active root project is `newcrosslisterv4000` (`prj_AS3fB0yB9Ji6jemwBZk4YVZPp3nU`). Vercel initially classified it as Express despite its Vite client. Official Vercel configuration documentation confirms that `vercel.json` supports the `framework` property and that it overrides the Framework Preset; the repository now explicitly uses `"framework": "vite"`. The documentation also confirms that `outputDirectory` overrides Project Settings.[5]

The direct Vercel logs showed that its function builder runs `build:vercel` from `artifacts/api-server`, rather than the repository root. The API workspace script now invokes the root build and stages the generated root static output in `artifacts/api-server/public`, satisfying that builder’s current-directory output check. The same local command was verified successfully.

[5]: https://vercel.com/docs/project-configuration/vercel-json "Vercel — Static Configuration with vercel.json"
