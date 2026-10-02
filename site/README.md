# Primal Watch

A personal Pokémon card tracker for the Black & White, XY, and Sun & Moon eras. Browse every rare card set by set, compare reported sold prices for raw (near mint), PSA 9 and PSA 10 copies, save a watchlist with your own buy limits, keep your collection in the Dex, and get alerts when a watched card is listed at your price.

## Open locally

Requires Node.js 24 or newer. No packages or installation are needed.

Run `node server.mjs` in this folder (or `Start-Primal-Watch.ps1` on Windows), then open http://localhost:5173.

Your watchlist, buy limits, Dex and alert settings are stored in `data/primal-watch.sqlite`. Starting the server only ever adds missing tables, so existing data is kept. Local mode is a single personal workspace and listens only on the loopback address.

## What's included

- **Catalog**: 5,923 cards in 43 sets, 2,835 of them rare (rare, holo rare, EX/GX, full art, secret rare, shiny, Prism Star, BREAK, Radiant Collection and promos).
  - XY Series: XY Base Set, Flashfire, Furious Fists, Phantom Forces, Primal Clash, Double Crisis, Roaring Skies, Ancient Origins, BREAKthrough, BREAKpoint, Fates Collide, Steam Siege, Generations (with RC1–RC32), Evolutions, and XY Black Star Promos.
  - Black & White Series: Black & White Base Set, Emerging Powers, Noble Victories, Next Destinies, Dark Explorers, Dragons Exalted, Dragon Vault, Boundaries Crossed, Plasma Storm, Plasma Freeze, Plasma Blast and Legendary Treasures (with RC1–RC25).
  - Sun & Moon Series: Sun & Moon, Guardians Rising, Burning Shadows, Shining Legends, Crimson Invasion, Ultra Prism, Forbidden Light, Celestial Storm, Dragon Majesty, Lost Thunder, Team Up, Detective Pikachu, Unbroken Bonds, Unified Minds, Hidden Fates (including SV1–SV94) and Cosmic Eclipse.
  - Reverse holos, stamped, prerelease and other alternate prints are not separate entries.
- **Browse**: set or era picker, search, raw / PSA 9 / PSA 10 views, sold medians, buy targets, sales plots, 1Y/2Y/3Y trend projections, monthly price history and PSA population.
- **Watchlist**: star a card and grade; set your own maximum price.
- **Dex**: add cards you own with grade, quantity, price paid and date. See total value, cost basis, unrealized profit and loss, a value-vs-cost chart over time, and each card's own P/L chart.
- **Alerts**: with your own free eBay developer keys, the server checks newly listed Buy It Now and Best Offer listings for each watched card and alerts when price plus shipping is at or below your limit. Alerts appear in the app, as desktop notifications while the app is open, and optionally on your phone through [ntfy](https://ntfy.sh) or a Discord webhook. Without keys, the Alerts page still gives a ready-made eBay search for every watched card.

### Setting up listing alerts

1. Sign in at [developer.ebay.com](https://developer.ebay.com/my/keys), create an application keyset, and copy the **Production** App ID (Client ID) and Cert ID (Client Secret).
2. In Primal Watch, open **Alerts**, paste both keys, choose how often to check, and turn on **Scan for new listings automatically**.
3. Optional: install the ntfy app, subscribe to a topic name only you know, and enter that topic; or paste a Discord webhook URL. Use **Send a test** to check it.

Alerts run while `node server.mjs` is running. Keys stay in your local database and are never sent back to the page.

## Market data

Each rare XY and Black & White card's PriceCharting product page was read in full on October 1, 2026, including all 8 Double Crisis rares and their 566 classified sales. For Sun & Moon, 1,109 rare cards have exact product matches and guide prices; the 172 highest-interest cards also have full pages with 13,145 classified sales, monthly price history and population data. Product URLs were matched against PriceCharting's own set listings (`data/source-urls.json`), which fixes apostrophes, Mega names, `[Holo]` products, subset numbers and promo numbering.

A sale is counted only when:

- the table it was listed under agrees with the grade in its title (a "Gem Mint 10" without a grader in the PSA 10 table is left out, and so is a PSA-titled sale filed as ungraded);
- the collector number and set total match the card;
- it is not a lot, bundle, proxy, foreign-language copy, reverse holo, cosmos holo, stamped, prerelease, league, staff or signed copy, and not graded by another company.

Every counted sale keeps its title, date, price and a link to the original listing. Captures live in `data/pricecharting/<set>.json`; earlier excerpt-based research (`data/sales-batches/`, `data/researched-sales.json`) is merged in only for sales older than what the full page still shows, so nothing is counted twice.

**Refresh** asks PriceCharting for the latest page from your computer and parses it the same way. If the source is unavailable or its layout changes, saved observations keep their original date. This is a snapshot plus on-demand refresh, not a licensed live feed.

## Recommendation method

A buy target needs at least 3 same-grade sales within 180 days, including one in the last 90 days. The narrowest 30-, 90- or 180-day window with 3 usable sales is used; prices below 40% or above 250% of that window's median are dropped as outliers. The target is 15% below the median. Raw targets use only sales explicitly described as near mint. Mixed-grader Grade 9 guides are shown for reference and never become a PSA 9 price. The 1Y/2Y/3Y figures apply the linear-regression dollar slope from up to 35 trailing-year sales to today's reference price; at least three sales spanning 30 days are required. Demand is a sales-activity proxy, the trend figures are simple projections rather than investment advice, and five-year scenarios remain illustrative assumptions.

## Dex valuation

Each entry is valued at the current reference for its grade: the sold median when there are recent matching sales, otherwise the source guide, otherwise the latest monthly guide. Profit and loss compares that with the price paid. The value-over-time chart uses each card's monthly price history from its purchase month; PSA 9 history is PriceCharting's Grade 9 guide, which includes other graders. Fees, shipping and tax are not included.

## Tests and build

```
node --test --test-isolation=none tests/*.test.mjs
node build.mjs
node --check dist/server/index.js
```

On older Node versions without `--test-isolation`, run `node --test tests/*.test.mjs`.

`node build.mjs` writes a Cloudflare Worker to `dist/server/index.js` that uses a D1 binding named `DB` (apply `db/schema.sql` first). With the full sales captures embedded, the bundle is about 37 MB, which is larger than Workers allow; hosting it would need the market data moved to D1 or KV. Scheduled alert scans run only in the local Node server.
