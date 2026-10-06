# Primal Watch

A personal Pokémon card tracker covering the EX, Diamond & Pearl through HGSS, Black & White, XY, and Sun & Moon eras (2003–2019). Browse every rare card set by set, compare reported sold prices for raw (near mint), PSA 9 and PSA 10 copies, see the week's and month's top movers, screen potential investments, save a watchlist with your own buy limits, keep your collection in the Dex, and get alerts when a watched card is listed at your price.

## Open locally

Requires Node.js 24 or newer. No packages or installation are needed.

Run `node server.mjs` in this folder (or `Start-Primal-Watch.ps1` on Windows), then open http://localhost:5173.

Your watchlist, buy limits, Dex and alert settings are stored in `data/primal-watch.sqlite`. Starting the server only ever adds missing tables, so existing data is kept. Local mode is a single personal workspace and listens only on the loopback address.

## What's included

- **Catalog**: 9,526 cards in 75 sets, 4,260 of them browsable rare/chase cards (rare, holo rare, Pokémon ex/EX/GX, LV.X, Prime, LEGEND, Gold Star, full art, secret rare, shiny, Prism Star, BREAK, Radiant Collection and promos).
  - EX Series: all 16 English expansions from EX Ruby & Sapphire through EX Power Keepers.
  - Diamond & Pearl through HGSS: all 7 Diamond & Pearl expansions, 4 Platinum expansions, 4 HeartGold & SoulSilver expansions, and Call of Legends.
  - XY Series: XY Base Set, Flashfire, Furious Fists, Phantom Forces, Primal Clash, Double Crisis, Roaring Skies, Ancient Origins, BREAKthrough, BREAKpoint, Fates Collide, Steam Siege, Generations (with RC1–RC32), Evolutions, and XY Black Star Promos.
  - Black & White Series: Black & White Base Set, Emerging Powers, Noble Victories, Next Destinies, Dark Explorers, Dragons Exalted, Dragon Vault, Boundaries Crossed, Plasma Storm, Plasma Freeze, Plasma Blast and Legendary Treasures (with RC1–RC25).
  - Sun & Moon Series: Sun & Moon, Guardians Rising, Burning Shadows, Shining Legends, Crimson Invasion, Ultra Prism, Forbidden Light, Celestial Storm, Dragon Majesty, Lost Thunder, Team Up, Detective Pikachu, Unbroken Bonds, Unified Minds, Hidden Fates (including SV1–SV94) and Cosmic Eclipse.
  - Reverse holos, stamped, prerelease and other alternate prints are not separate entries.
- **Browse**: a screener with era chips, set picker, min/max price for the grade in view, minimum activity score, minimum investment score and quick screens; search, raw / PSA 9 / PSA 10 views, sold medians, buy targets, an investment score per card, sales plots, 1Y/2Y/3Y trend projections, monthly price history and PSA population.
- **Top movers**: the 20 biggest percentage rises in sold price this week or month, listed separately for PSA 10, PSA 9 and raw near-mint. Era filters can include only the eras you want or exclude eras you do not collect. Lists are shorter when fewer cards have reliable evidence.
- **Potential investments**: up to 20 picks per grade, each showing which signals it met (steady uptrend, recovering from highs, cheap vs. similar cards) and its character's demand score. The same era filters recompute the screen within the selected catalog scope.
- **Watchlist**: star a card and grade; set your own maximum price.
- **Dex**: add cards you own with grade, quantity, price paid and date. See total value, cost basis, unrealized profit and loss, a value-vs-cost chart over time, and each card's own P/L chart.
- **Alerts**: with your own free eBay developer keys, the server checks newly listed Buy It Now and Best Offer listings for each watched card and alerts when price plus shipping is at or below your limit. Alerts appear in the app, as desktop notifications while the app is open, and optionally on your phone through [ntfy](https://ntfy.sh) or a Discord webhook. Without keys, the Alerts page still gives a ready-made eBay search for every watched card.
- **Settings**: choose Terminal (the default dark trading-terminal look), Light, or Soft contrast. The preference is stored in the browser and applied before the page paints.
- **Status bar**: the date of the sales data and a ticker of this week's confirmed top movers.

### Setting up listing alerts

1. Sign in at [developer.ebay.com](https://developer.ebay.com/my/keys), create an application keyset, and copy the **Production** App ID (Client ID) and Cert ID (Client Secret).
2. In Primal Watch, open **Alerts**, paste both keys, choose how often to check, and turn on **Scan for new listings automatically**.
3. Optional: install the ntfy app, subscribe to a topic name only you know, and enter that topic; or paste a Discord webhook URL. Use **Send a test** to check it.

Alerts run while `node server.mjs` is running. Keys stay in your local database and are never sent back to the page.

## Market data

The current snapshot contains 1,947 full PriceCharting captures and 132,454 classified sales. Every rare XY and Black & White card has a full capture; Sun & Moon has exact guide matches for 1,109 rare cards and full captures for the 172 highest-interest cards. For the newly added legacy eras, 1,317 of 1,425 eligible cards have exact product matches and guide prices, and the 10 highest-interest cards from each of the 32 sets have full pages: 160 EX captures with 11,023 classified sales and 160 Diamond & Pearl/Platinum/HGSS captures with 8,129 classified sales. Product URLs were matched against PriceCharting's own set listings (`data/source-urls.json`), including legacy letter and shiny subset numbering.

A sale is counted only when:

- the table it was listed under agrees with the grade in its title (a "Gem Mint 10" without a grader in the PSA 10 table is left out, and so is a PSA-titled sale filed as ungraded);
- the collector number and set total match the card;
- it is not a lot, bundle, proxy, foreign-language copy, reverse holo, cosmos holo, stamped, prerelease, league, staff or signed copy, and not graded by another company.

Every counted sale keeps its title, date, price and a link to the original listing. Captures live in `data/pricecharting/<set>.json`; earlier excerpt-based research (`data/sales-batches/`, `data/researched-sales.json`) is merged in only for sales older than what the full page still shows, so nothing is counted twice.

**Refresh** asks PriceCharting for the latest page from your computer and parses it the same way. If the source is unavailable or its layout changes, saved observations keep their original date. This is a snapshot plus on-demand refresh, not a licensed live feed.

## Recommendation method

A buy target needs at least 3 same-grade sales within 180 days, including one in the last 90 days. The narrowest 30-, 90- or 180-day window with 3 usable sales is used; prices below 40% or above 250% of that window's median are dropped as outliers. The target is 15% below the median. Raw targets use only sales explicitly described as near mint. Mixed-grader Grade 9 guides are shown for reference and never become a PSA 9 price. The 1Y/2Y/3Y figures apply the linear-regression dollar slope from up to 35 trailing-year sales to today's reference price; at least three sales spanning 30 days are required. Demand is a sales-activity proxy, the trend figures are simple projections rather than investment advice, and five-year scenarios remain illustrative assumptions.

## Top movers method

A move compares the median of matching sales in the last 7 days (week) or 30 days (month) of each card's sales data with the median of the 4 weeks or 2 months before. A card is listed only when:

- it was worth at least $25 at the start of the period;
- both periods have at least 3 matching sales on at least 2 different days, after the usual 40%–250% outlier rule;
- no more than a quarter of either period's sales were outliers, and the rest sit typically within 30% of their median;
- at least two thirds of the new sales are above the starting price;
- a rise of more than 150% has at least 5 sales in each period;
- the new median is within 40%–250% of the source's own current guide for that grade;
- the card's data is no more than 7 days older than the newest check.

Raw moves use near-mint sales only. Cards that fail a check are counted under the list as "left out as uncertain" rather than shown.

## Potential investments method

These are screens over past sales, not forecasts or advice. A card qualifies for a grade only when it has a confident sold price (the same evidence a buy target needs) of at least $25, its character is in the top quarter for collector demand, and it meets at least one signal.

- **Character demand** comes from sales only. For every card, each grade's reference price is compared with the median for its era and rarity category; a character's premium is the average across its cards, shrunk toward average when it appears on only a few. It is combined (65/35) with how often the character's fully captured cards sold in the last 6 months, then ranked against all characters. Tag Team cards use their most in-demand partner. Forms and mechanics (M, Primal, Alolan, Shining, EX, GX, BREAK, Prism Star) count as the same character.
- **Steady uptrend**: a log-price regression across at least 8 matching sales from the past year, spanning 6+ months and 3 or more quarters, rising 15%–150% a year with a t-statistic of at least 3 and typical scatter under 25%, and the last 90 days at least 10% above sales 6–12 months ago.
- **Recovering from highs**: the monthly guide is at least 40% below a high reached in the last five years (excluding the latest 3 months) and held for 3+ months, and sales in the last 45 days are at least 5% above the 90 days before, with most new sales above that level.
- **Cheap vs. similar cards**: the card sells for at most 65% of the median price of at least 4 same-set, same-rarity cards whose characters score at least 10 demand points lower. Promos are not compared.

At most 3 picks per character are shown. With the October 2026 snapshot, most picks are uptrends. Many XY-era prices are near their highs, so the recovery and cheapness signals rarely fire.

## Investment score method

Every rare card gets a 0–100 score per grade (`site/lib/score.mjs`), from the same sales, monthly guide history and catalog as the Investments tab. A score needs a confident sold price (the evidence a buy target needs) and up-to-date sales; otherwise it is left blank with the reason. Five parts are each scored 0–100 and blended:

- **Character demand (30%)**: the character's demand score from the Investments method.
- **Price momentum (25%)**: a log-price regression across at least 5 matching sales spanning 90+ days of the past year. Growth maps linearly from −60% (0) to +60% a year (100), and only counts in full when the trend's t-statistic is 3 or more. Rises above 150% a year are treated as too fast to trust (45).
- **Value (20%)**: the average of (a) price against the median of 4+ same-set, same-rarity cards of no more popular characters (65% of that median or less scores 100; 150% or more scores 20) and (b) distance below the highest monthly guide level held for 3+ months in the last five years (at the high scores 35; 50% or more below scores 100; a card still clearly falling earns 40% less).
- **Liquidity (15%)**: the activity score.
- **Price stability (10%)**: 100 minus the typical distance of recent sales from the median, scaled so a 40% spread scores 0.

A part that cannot be measured counts as 50 and is labeled. Cards under the $25 floor are capped at 59. Bands: 80+ Strong, 65–79 Good, 50–64 Fair, 35–49 Weak, under 35 Poor. `GET /api/scores` returns `{card_id: [psa10, psa9, raw]}`; `GET /api/market?id=` includes each grade's breakdown. On the October 2026 snapshot, 462 PSA 10, 719 PSA 9 and 1,799 raw cards are scored, with medians near 60.

## Dex valuation

Each entry is valued at the current reference for its grade: the sold median when there are recent matching sales, otherwise the source guide, otherwise the latest monthly guide. Profit and loss compares that with the price paid. The value-over-time chart uses each card's monthly price history from its purchase month; PSA 9 history is PriceCharting's Grade 9 guide, which includes other graders. Fees, shipping and tax are not included.

## Tests and build

```
node --test --test-isolation=none tests/*.test.mjs
node build.mjs
node --check dist/server/index.js
```

On older Node versions without `--test-isolation`, run `node --test tests/*.test.mjs`.

`/api/movers?period=week|month` and `/api/investments` compute over every card and are cached until saved market data changes or the day rolls over. Both accept a comma-separated era scope, for example `series=XY` or `series=EX,DP`; unsupported or empty scopes return 400.

`node build.mjs` writes a Cloudflare Worker to `dist/server/index.js` that uses a D1 binding named `DB` (apply `db/schema.sql` first). With the full sales captures embedded, the bundle is about 52.5 MB, which is larger than Workers allow; hosting it would need the market data moved to D1 or KV. Scheduled alert scans run only in the local Node server.
