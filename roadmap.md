# FutureSight roadmap: a market terminal for Pokémon cards

Goal: give collectors and investors the depth of a financial terminal: every price, every sale, every
spread and every population change for ~18,000 rare cards, plus how demand is moving by Pokémon,
set and rarity, kept fresh daily and readable at a glance.

Work happens on `dev` and is promoted to `beta` once a phase looks good. Each phase ends with tests
passing (`npm test` in `site/`) and a short entry in `handoff.md`.

---

## Phase 0 — Faster price updates

**Problem (measured Oct 14, 2026).** Update sales runs at about 1 card per second (~4.7 h for 17,000
cards). Downloading a PriceCharting page takes only 0.75–1 s, and 4 run at once. Most of the time goes
elsewhere:

- `captureBatch` reloaded the **whole** price cache for every batch of 4 cards: 131 MB of JSON and
  1.2 s on the local-test database (7,875 cards), growing to ~2.5 s at 17k cards.
- The browser ran batches in lockstep: the slowest of the 4 pages held up the next batch, and every
  batch went through the browser and back.
- The browser redrew the whole card list after every batch.
- Each card's price and its history rows were saved in separate database transactions.

**Work**

- [x] Read only the cached prices of the cards being updated, not the whole cache.
- [x] Save a card's price and its history rows in one transaction.
- [x] Run Update sales on the server: one shared background job with up to 6 workers at a steady
      pace (default 1 page/s, `FUTURESIGHT_UPDATE_RATE`). It halves its pace and pauses for 15 s when
      PriceCharting answers "too many requests", then recovers. Busy or timed-out pages are retried
      up to 3 times. The job keeps going if the tab is closed. The page shows progress and new prices
      as they arrive, and falls back to the old batch loop where background jobs are not available.
- [x] Redraw the list at most every 2 s during an update.
- [x] Rejoin a running update after a page reload.

**Measured result (Oct 14, 2026, one set of ~50 cards each, against a copy of the local-test database).**

| | Cards saved | Lost to "too many requests" | Time |
|---|---|---|---|
| Old batch loop (xy6) | 29 of 52 | 23 | 104 s |
| New server job (xy4) | 50 of 51 | 1 | 463 s |

The code overhead is gone and the job no longer loses rate-limited cards. But PriceCharting's rate
limit is now the ceiling. During the test it answered "too many requests" even at 1 page/s, and the
job settled at about 6–7 pages a minute. Earlier sessions saw ~1 page/s without trouble, so the limit
may vary with recent traffic from the same address. Either way, reading 17k full pages cannot get
much faster. **The real speed-up is making far fewer requests, which makes Phase 1's guide-price
sweep, tiered refresh and PriceCharting's paid API the top priority.**

## Phase 1 — Data foundation

Everything after this phase depends on precomputed numbers, not on re-reading every card's full record.
The first two items are also the answer to faster price updates (see Phase 0's measured result).

- **Fast guide-price sweep.** Read each set's PriceCharting listing page (`parseSet` already reads it):
  raw, Grade 9 and PSA 10 guide prices for every card in a few hundred requests, a few minutes for
  the whole market.
- **Tiered full-page refresh** (sales history and PSA population):
  - Daily: watched, owned, recent movers, cards over a value threshold
  - Weekly: mid-priced cards
  - Monthly: cards under $25
- **Nightly schedule.** The server starts the sweep and the daily tier on its own (setting
  `FUTURESIGHT_UPDATE_HOUR`).
- **`card_metrics` table**, rebuilt after each update. One row per card, grade and day:
  - Price, returns over 1 day, 7 days, 30 days, 90 days and 1 year, 52-week high and low
  - Volatility and drawdown
  - Sales count and days since last sale
  - Grade spreads, gem rate and population growth
  - English vs Japanese price gap
  - Character premium (from `demandOf`) and months since the set's release
- **`character_metrics` table**, one row per Pokémon, grade and day: character index, returns,
  demand premium, sales count and sales value across all their cards, breadth (share of their cards
  up over 30 days), number of priced cards. Kept daily so demand can be charted over time, not only
  read as today's score.
- **Set facts:** release date, era, print status (in print / out of print) and card count per set,
  for set-age comparisons.
- **Indices** in a `market_index` table: top 100, each era, each grade, English vs Japanese, each set,
  each Pokémon with enough priced cards, each rarity tier (Gold Star, secret rare, full art, alt art,
  special illustration rare, …) and each artist with enough priced cards.
- **Stop reloading the whole cache on page load.** `/api/catalog` and alert scans still read every
  cached record on each call. Serve light records from a small summary column or from `card_metrics`.
- **Consider PriceCharting's paid API / price-guide download.** One daily file would cover every guide
  price, through an approved channel. Check plans and terms before relying on scraping at higher rates.

## Phase 2 — Card page (like a stock's quote page)

- Price chart: raw / PSA 9 / PSA 10 toggle, 3 months to all time, monthly sales-count bars, and markers
  for set release and population jumps.
- Grade spreads: PSA 10 vs PSA 9 and PSA 10 vs raw multiples, over time.
- Grading calculator: raw price plus grading fee and shipping, weighed against the expected value at
  this card's PSA 10 rate.
- Population panel: PSA population over time, gem rate, how fast new copies are graded.
- Liquidity: sales per month, median days between sales, active listings (SerpApi/eBay).
- Risk: volatility, worst drop from peak, how closely it follows its era index.
- English vs Japanese price gap for the 5,767 linked printings.
- Comparables: same Pokémon, same artist, same rarity tier, side by side.
- Character context: this Pokémon's index, demand rank and demand trend next to the card, and whether
  the card is priced above or below the character's usual premium.
- Fair value and deal check: a fair-value range from recent matching sales, and live listings
  (SerpApi/eBay) marked as below, at or above it.
- Sell-side Price check: net proceeds after eBay / TCGplayer fees, shipping and tax at today's median,
  next to the existing buy-side break-even (`lib/investment-costs.mjs`).

## Phase 3 — Character demand

Which Pokémon collectors are paying up for, and whether that is rising or fading.

- Character leaderboard: Pokémon ranked by demand premium, index return (30 days / 90 days / 1 year),
  sales volume and breadth, with rising and falling demand flagged.
- Character pages: index chart and demand premium over time; every card of that Pokémon sorted by
  value or return; which eras, sets and rarity tiers carry the premium; the cheapest card with
  steady sales (the entry point).
- Money flow: each character's share of total sales value over time, to show where buying is moving.
- Undervalued cards of in-demand characters: priced below the character's usual premium for their
  rarity and set (extends the existing "cheap" signal from `lib/invest.mjs`).
- English vs Japanese demand: characters whose Japanese cards trade at an unusual premium or
  discount to their English cards.

## Phase 4 — Set trends

- Set pages as "sectors": set index, total value, how much of it sits in the top cards, best and
  worst performers, gem rate and how fast the set is being graded.
- Set lifecycle curves: each set's index by months since release, overlaid on its era's typical curve,
  to show where a set sits (post-release dip, recovery, out-of-print climb).
- Set comparison: two or more sets side by side on index, returns, volatility and liquidity.
- Rarity-tier trends: how each tier is moving across sets, and within a set (chase cards vs the rest).
- Out-of-print effect: how set indices moved before and after print runs ended.

## Phase 5 — Market overview

- Index cards with sparklines; index detail pages with their members.
- Heatmap: sets as boxes, sized by total value and coloured by % change (1 day / 7 days / 30 days / 1 year).
  The same view by Pokémon and by rarity tier.
- Market breadth: cards up vs down, new 52-week highs and lows, sales volume against average.
- Top movers by group: the sets, Pokémon, rarity tiers and artists moving most, beside the existing
  card movers.
- Sales tape: a live, filterable feed of newly seen sales, flagging sales far above or below fair value.

## Phase 6 — Screener, portfolio, alerts

- Screener v2: filter and sort on any `card_metrics` column, including character premium, character
  index return and set age; save screens, export CSV.
- Portfolio analytics (Dex):
  - Realized and unrealized profit and loss
  - Allocation by era, grade, set and Pokémon
  - Performance against the indices
  - Risk and concentration, including exposure to a single Pokémon or set
  - What-if: portfolio value if a set, Pokémon or grade index moves by a chosen %
- Alert types:
  - Price crosses a level
  - % move in a period
  - Population jump
  - Unusual sales volume
  - PSA 10 / PSA 9 spread widening
  - New 52-week high or low
  - A Pokémon's or set's index moves by a chosen % or its demand rank jumps
  - A live listing appears below fair value (not only below a manual buy limit)

## Later (needs new data sources)

- Sealed products (booster boxes, ETBs) and their indices.
- Release and reprint calendar, with markers on charts: new sets, reprints of a Pokémon or artwork,
  and demand catalysts (new games, anime and movie releases, Pokémon Presents, anniversary sets).
- Search interest per Pokémon (e.g. Google Trends) beside its demand premium.
- Supply on the market: active-listing counts over time and listings per monthly sale (needs regular
  SerpApi/eBay reads, which cost credits).
- Other marketplaces and graders (CGC, BGS population).

## Out of scope (removed Oct 14, 2026)

Every item must help decide what to buy, hold or sell. These did not, and were taken off:

- The terminal interface phase: command bar and view codes, saved multi-panel layouts, a ticker strip,
  a dense dark theme and keyboard navigation. They change how pages are reached, not what they show.
  The dark terminal theme and the status-bar ticker already exist.
- Format rotation on the calendar: it moves tournament playables, not the collector cards tracked here.
