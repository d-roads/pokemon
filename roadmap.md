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

- [x] **Fast guide-price sweep** (`/api/sweep`, `startSweep` in `lib/api.mjs`). Reads every page of each
  set's PriceCharting listing (about 150 products a page, cursor paging) through the same pace as Update
  sales. Sets sharing a listing are read once. Saves guide prices and observation rows, and records each
  set in `set_sweeps`. Sets swept in the last 20 h are skipped unless forced. Set refresh in Browse now
  reads every page as well.
  **Measured (Oct 14, 2026, real network, rate-limited):** all 136 English listings in 11.4 min
  (404 pages), pricing 9,445 of 9,734 English rare cards (97%). Update sales would need ~9,700 pages.
  The only failure was Scarlet & Violet Energy. Cards the listing can't match (Unown letters, some
  variants) still get prices from Update sales.
- [x] **Tiered full-page refresh** (sales history and PSA population), by the card's most valuable grade:
  - Daily: watched, owned, or worth $1,000+ (~1,800 cards)
  - Weekly: $100–$1,000
  - Monthly: under $100
  Sizes on the local-test data put this at ~2,800 pages a day, so one night reads at most
  `FUTURESIGHT_NIGHTLY_PAGES` (default 1,500). What is left goes first the next night. `/api/schedule`
  shows the tiers and what is due.
- [x] **Nightly schedule** (`runNightly`, `FUTURESIGHT_UPDATE_HOUR`): sweep, then due card pages, then a
  metrics rebuild, once a day at or after that hour (a computer that was asleep catches up).
- [x] **Daily prices** (`price_points`): each card's guide price per grade on the days it was read. A row
  is saved when the price changes, and again after 14 days so an unchanged price is known to be current.
  Together with each card's monthly guide history, this is the price series every metric uses.
- [x] **`card_metrics`** (one row per card and grade, today's values; history comes from the price series):
  - Price (guide), sold median, returns over 1 day, 7 days, 30 days, 90 days and 1 year, 52-week high and low
  - Volatility (annualised, monthly) and drawdown from the all-time high
  - Sales in 30 and 90 days, sales value, days since last sale
  - PSA 10 / PSA 9 and PSA 10 / raw spreads, PSA population, gem rate, 90-day population growth
  - English vs Japanese price gap (verified printings)
  - Premium over same-era, same-rarity peers
- [x] **Indices** (`market_index` daily levels, `index_metrics` today's values) for each language and
  grade: all cards, top 100, each era, set, Pokémon (3+ cards), rarity tier and artist. Chain-linked;
  value-weighted (`level`) and equal-weighted (`level_eq`). Each index also carries its premium over peers
  over time, so a Pokémon's demand can be charted, plus breadth, sales volume, concentration and gem rate.
  English cards take the illustrator of their verified Japanese printing (5,767 linked).
  **Measured:** a full rebuild of the local-test data (17,043 cards, 2,150 indices, ~917k index levels)
  takes ~25 s and ~250 MB above the server's normal memory. It runs after each Update sales or sweep, and nightly.
  `character_metrics` became the `char` indices.
- [x] **Stop reloading the whole cache on page load.** `market_cache` keeps a light copy of each record
  (`light`, `light_key`, cleared by a trigger when the record is rewritten without it). `/api/catalog`:
  2.5 s → 0.9 s. Alerts, set refreshes and Japanese matching read only the cards they need.
- [ ] **Set print status** (in print / out of print). Release dates and eras are in the catalog. Print
  status needs a source.
- [ ] **Consider PriceCharting's paid API / price-guide download.** One daily file would cover every guide
  price, through an approved channel. Check plans and terms before relying on scraping at higher rates.
- [x] The rebuild gives way to other requests between pages and batches (longest pause 0.4 s, measured).

## Phase 2 — Card page (like a stock's quote page)

Done items are in the card panel's **Market metrics** section (`marketSection` in `public/app.js`).

- [x] Price chart (`cardChartSection`, `/api/card-history`): raw / PSA 9 / PSA 10, 3 months to all time, the
  monthly guide plus every daily read, monthly matching-sales bars, markers for set release and PSA population
  jumps (+10% and 10+ copies), and its era's typical-card index scaled to the card's price. Replaces the old
  monthly guide chart; the reported-sales chart remains.
- [x] Grade spreads today (PSA 10 / PSA 9, PSA 10 / raw). [x] The same over time (Spreads view).
- [x] Grading calculator (raw copies): raw sold median + editable grading fee and shipping, against the
  expected value at the card's PSA population odds (PSA 8 and 7 at their guides, 6 and below at the
  ungraded guide), with the break-even PSA 10 rate. Notes that submitted copies are better than average.
- [x] Population today: PSA graded, gem rate, 90-day growth once population history exists.
  [x] Population over time chart (Population view; fills as card pages are read — the local-test data has
  only one reading per card so far).
- [x] Liquidity: sales in 30 / 90 days, days since last sale. [x] Active listings: **Check live listings**
  (`/api/listings`) counts matching eBay listings through the account's eBay or SerpApi key, one search per
  check, kept 30 minutes.
- [x] Risk: volatility, drawdown from peak, 52-week range. [x] Beta and correlation to its era's typical card
  (monthly changes over 2 years, 8+ months, `card_metrics.beta`/`correl`). Guides are noisy month to month,
  so correlations are modest (average ~0.2 on the local-test data).
- [x] English vs Japanese price gap (verified printings, same grade).
- [~] Comparables: the card's set, Pokémon, tier and artist indices are listed and open their pages,
  whose member tables compare the cards side by side.
- [x] Character context: the Pokémon's demand premium and index returns next to the card, and the card's
  own premium over peers.
- [x] Fair value (sold median, else the guide; `fairValue` in `lib/alerts.mjs`) and a deal check: each live
  listing shows how far below or above fair value it is.
- [x] Sell-side: what selling today nets at the sold median (or guide) after the Price check cost
  assumptions. [x] Marketplace presets (`MARKET_PRESETS`): eBay without a Store (13.25% to $7,500, 2.35%
  above, $0.40 an order) and TCGplayer Level 1–4 (10.75% capped at $75, plus 2.5% + $0.30), as published
  October 2026.

## Phase 3 — Character demand

The **Market → Pokémon** tab and each Pokémon's index page.

- [x] Character leaderboard: demand premium (shrunk for Pokémon with few cards), its change over a year,
  index returns (typical card or by value), breadth, cards, sales and value; Rising and Fading demand lists.
- [x] Character pages: index chart (typical card and by value, 6M–all), demand premium over time,
  every card with price, returns, premium over peers, sales and last sale.
  [x] Which eras, sets and tiers carry the premium (median premium by era, set and tier on Pokémon and artist
  pages) and the entry-point card (cheapest with sales in 90 days, else cheapest priced).
- [x] Money flow (Pokémon → Money flow, `/api/flows`, `index_flows`): each Pokémon's share of the market's
  matching sales value per month for 12 months, last 3 months against the 3 before. Card pages list only
  ~30 recent sales, so a card with a full list counts only from the first whole month after its oldest
  listed sale; months resting on under half the cards are flagged. Accuracy improves as nightly reads keep
  every sale.
- [x] Undervalued cards of in-demand characters (Pokémon → Undervalued, `/api/undervalued`): Pokémon at 1.5×+
  demand with 5+ priced cards, and their cards at half or less of that premium, from $10.
- [x] English vs Japanese demand (Pokémon → English vs Japanese): both premiums and their ratio, per Pokémon
  with enough priced cards in both languages.
- Note: the catalog cannot tell items from trainer characters, so a few items (Energy Switch, Rare Candy)
  appear as "Pokémon". Energy cards are left out.

## Phase 4 — Set trends

The **Market → Sets** tab and each set's index page.

- [x] Set pages as "sectors": index, value, top-5 share, breadth, gem rate, sales, member cards.
  [x] How fast the set is being graded (`index_metrics.pop_growth_90d`, the Grading 90D column): growth in
  PSA-graded copies over 90 days among members with a reading from then. Blank until population readings
  are 90 days old (from early January 2027 for cards read nightly since October).
- [x] Set lifecycle curves: each set's index by months since release (rebased to 100 at its first month)
  against its era's median path, with how far above or below typical each set sits now.
  On the local-test data, Scarlet & Violet sets fall to ~56% of launch by month 7 and recover to ~90%
  by month 26.
- [x] Set comparison: pick several sets on the lifecycle chart; a side-by-side table below it (age, vs era
  median, returns, drawdown, cards, value, top-5 share, breadth, gem rate, sales, grading pace).
- [x] Rarity-tier trends across sets (Market → Rarity, and the overview's tier list).
- [ ] Out-of-print effect (blocked: needs print status, see Phase 1).

## Phase 5 — Market overview

The **Market → Overview** tab.

- [x] Index cards with sparklines (all cards, top 100, each era); index pages with their members.
  Top 100 uses today's members, so its history flatters it.
- [x] Heatmap of sets, sized by value and coloured by 1D / 7D / 30D / 1Y change. [x] By Pokémon (the 80 most
  valuable) and rarity tier.
- [x] Market breadth: up vs down over 30 days, 52-week highs and lows, sales in 30 days.
- [x] Top movers by group: every Market table sorts by any return. [x] A combined movers panel (Biggest moves):
  sets, Pokémon, tiers and single cards up and down over the heatmap's period. A card counts only when
  matching sales back its guide move (sold median within 35%, or 2+ sales in 90 days and under +1,000%;
  `MOVER_CHECKS`): on the local-test data ~4,000 of ~9,400 PSA 10 guide moves are unbacked, e.g. a PSA 10
  guide jumping from $239 to $8,600 on one sale.
- [x] Sales tape (`/api/tape`): the newest sales recorded from card pages (`sales_observations`), one row per
  listing, against the card's guide.

## Phase 6 — Screener, portfolio, alerts

- [x] Screener v2 (Market → Screener, `lib/screener.mjs`, `/api/screen`): filter and sort every card of a
  language and grade on any `card_metrics` column plus distance from the 52-week high, its lead Pokémon's
  demand, demand change and index return, and its set's age and index return; eras and text search; four
  starting screens; the current screen is remembered in the browser; named screens are saved per account
  (`screens` table, `/api/screens`, up to 50); Export CSV writes every match (up to 20,000) with every field.
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
