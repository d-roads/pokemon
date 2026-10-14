# FutureSight roadmap: a market terminal for Pokémon cards

Goal: give collectors and investors the depth of a financial terminal: every price, every sale, every
spread and every population change for ~18,000 rare cards, kept fresh daily and readable at a glance.

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
- [ ] Rejoin a running update after a page reload (today you rejoin it by pressing Update sales again).

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
- **Indices** in a `market_index` table: top 100, each era, each grade, English vs Japanese.
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

## Phase 3 — Market overview

- Index cards with sparklines; index detail pages with their members.
- Heatmap: sets as boxes, sized by total value and coloured by % change (1 day / 7 days / 30 days / 1 year).
- Market breadth: cards up vs down, new 52-week highs and lows, sales volume against average.
- Sales tape: a live, filterable feed of newly seen sales, flagging sales far above or below fair value.
- Set pages as "sectors": set index, total value, how much of it sits in the top cards.

## Phase 4 — Screener, portfolio, alerts

- Screener v2: filter and sort on any `card_metrics` column, save screens, export CSV.
- Portfolio analytics:
  - Realized and unrealized profit and loss
  - Allocation by era, grade and set
  - Performance against the indices
  - Risk and concentration
  - What-if scenarios
- Alert types:
  - Price crosses a level
  - % move in a period
  - Population jump
  - Unusual sales volume
  - PSA 10 / PSA 9 spread widening
  - New 52-week high or low

## Phase 5 — Terminal interface

- Command bar: type `CHARIZARD BASE PSA10` and press Enter, with short commands for each view
  (`GP` chart, `POP`, `SALES`, `CMP`).
- Multi-panel layouts you can save; a ticker strip of watched cards; a dense dark theme; keyboard
  navigation throughout.

## Later (needs new data sources)

- Sealed products (booster boxes, ETBs) and their indices.
- Release, reprint and rotation calendar.
- Other marketplaces and graders (CGC, BGS population).
