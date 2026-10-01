# Primal Watch

A functional XY era card tracker. Includes all 1,620 numbered English cards across 13 sets, including secret rares and Generations’ Radiant Collection. A set picker, all-set search, separate raw/PSA 9/PSA 10 views, sourced price snapshots, reported sales for four Primal Clash cards, a saved watchlist, custom buy limits, sales plots, activity-based demand estimates, and transparent five-year scenarios.

## Open locally

Requires Node.js 24 or newer; no packages or installation needed.

Run `node server.mjs` in this folder (or run `Start-Primal-Watch.ps1` on Windows), then open http://localhost:5173.

Watchlist data persists in `data/primal-watch.sqlite`. Local mode is one personal workspace and listens only on the loopback address. It does not use browser storage as the source of truth.

## Market data

Initial Primal Clash observations were collected September 30, 2026 from PriceCharting. The additional 12 catalogs and raw reference estimates come from Eyevo checklists. Selected graded guides were checked against public PriceCharting pages. Coverage varies by card and grade; unknown prices remain empty. Each snapshot retains its own source and observation date. Values are USD. The initial grade-9 source guides can mix grading companies; PSA 9 recommendations use only matching reported PSA sales. Raw targets require explicitly near-mint sales. Sales observations are sourced, not generated. Transaction links in initial data lead to the PriceCharting source page, which contains the original listing links.

Refresh fetches the public source. If it is blocked or the page layout cannot be parsed, the UI keeps the last observations and states that it could not refresh. This workspace blocks outgoing network traffic; live refresh could not be verified here. No claim is made of continuous monitoring or a licensed live feed. A production price provider with guaranteed API access is the next integration step.

## Recommendation method

At least 3 same-grade sales within 180 days, including a sale within 90 days, are required. The target is 15% below the matching median. Reported best-offer amounts are kept separate from crossed-out asks. Bundle and mismatched-grade listings are excluded. Demand is an explicitly labeled sales-activity proxy; five-year scenarios are illustrative assumptions and are not backtested predictions. The UI explains the full method and links sources.

## Hosted runtime

`node build.mjs` writes a Cloudflare Worker to `dist/server/index.js`. It exports `fetch(request, env)` and uses a D1 binding named `DB`. Apply `db/schema.sql` before serving requests. Watchlists use full set/card IDs to prevent collisions between identical collector numbers. Existing Primal Clash entries and custom limits remain in the same database. Hosted watchlists use the authenticated ChatGPT visitor ID injected by Sites. The site remains private unless its access policy is deliberately changed. Write routes validate the grade/card, price, request size, and origin, and use prepared queries.

Sites registration is `appgprj_6abda3f9d8b08191bdfd0c7d7cfb8b49`. The source push and deployment are blocked by this workspace's network restrictions. No production URL has been published.

Run meaningful model/provider/API checks with `node --test --test-isolation=none tests/*.test.mjs`.

## Included sets

XY Base Set, Flashfire, Furious Fists, Phantom Forces, Primal Clash, Roaring Skies, Ancient Origins, BREAKthrough, BREAKpoint, Fates Collide, Steam Siege, Generations, and Evolutions. Generations includes RC1–RC32. Alternate promos and reverse-holo variants are not separate entries.
