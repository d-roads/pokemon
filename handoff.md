# Primal Watch — session handoff

Updated: October 1, 2026 Pacific. Repository: `d-roads/pokemon`, branch `main`. The repository is authoritative.

## Product goals

1. Keep the current clean, smooth collector UI.
2. Show defensible prices and buy targets from reported sales for raw near-mint, PSA 9, and PSA 10 cards. Never fabricate prices when evidence is missing.
3. Cover rare/chase cards across Black & White, XY, and Sun & Moon, including requested special sets.
4. Preserve the watchlist, buy limits, Dex, and listing alerts.
5. **New:** Show weekly and monthly top movers by percentage increase (top 20 each for PSA 10, PSA 9, and raw). Leave out any move the data can't confirm.
6. **New:** Offer a Potential investments tab built only from the app's sales data, weighted toward characters with real collector demand.
7. Commit each integration separately and leave an updated handoff after every session.

## Current state

- **Catalog:** 5,923 cards in 43 sets; 2,835 are browsable rare/promo cards (XY 902, Black & White 553, Sun & Moon 1,380).
- **Market data:** full PriceCharting captures for 1,627 cards, with 113,223 classified sales; snapshot checked October 1, 2026. 271 Sun & Moon rares still have no exact product match and show no market data.
- **Navigation:** Browse sets · **Top movers** · **Investments** · Watchlist · Dex · Alerts.
- Local user data lives in `site/data/primal-watch.sqlite` and is gitignored. It must never be committed because this is a public repository.

## Work completed this session

### Top movers (`8c64966`)

- New sidebar view with Week / Month toggle and separate PSA 10, PSA 9 and Raw NM lists of up to 20 cards each. On narrow screens a grade switcher shows one list at a time. Clicking a card opens it in Browse at that grade.
- Method (`site/lib/movers.mjs`) compares the median of matching sales in the last 7 or 30 days with the 4 weeks or 2 months before, ending at each card's own data-check date.
- Collector-chosen **$25 starting-price floor**.
- Fail-closed checks: 3+ sales on 2+ days in each period; at most 25% outliers and typical spread within 30%; two thirds of new sales above the start; +150% jumps need 5+ sales per period; the new median must agree with the source guide (0.4–2.5×); stale cards are excluded.
- Rejected moves are counted under each list as "left out as uncertain" and are never shown.
- Snapshot results:
  - **Week:** PSA 10 has 10 cards, PSA 9 has 17, and raw has 11. Fewer cards pass, so these lists are short on purpose.
  - **Month:** all three grades fill 20 places, from 66 / 68 / 100 qualifying cards.
- Spot-checked against sale titles. Volcanion EX PSA 10, Mew (Fates Collide) PSA 9 and Mewtwo GX (Shining Legends) PSA 10 are genuine. Detective Pikachu Charizard PSA 10 first showed +199% on prices from $325 to $3,500, which led to the scatter rule; it is now excluded.
- API: `GET /api/movers?period=week|month`.

### Potential investments (`c8e73fa`)

- New sidebar view with a PSA 10 / PSA 9 / Raw NM switcher. Each pick shows its sold price, every signal it met with the numbers behind it, and a character-demand meter. Clicking a pick opens the card.
- Method (`site/lib/invest.mjs`) uses sales data only, as the collector chose; no web or hobby-news input.
  - **Gate:** a confident sold price of at least $25 (the same evidence as a buy target). The character must be in the **top quarter for demand**; the current cut is a score of 70.
  - **Character demand:** each card's price relative to its era and rarity peers, averaged per character and shrunk toward average for small samples. It is combined 65/35 with the character's 6-month sales activity. Forms and mechanics (M, Primal, Alolan, Shining, EX, GX and similar) count as the same character, and Tag Teams use their strongest partner. This was the collector's request: low-demand characters such as Aggron should not be treated as safe even when they look cheap.
  - **Steady uptrend:** +15% to +150% a year with a statistically clear, low-scatter regression over 8+ sales, 6+ months and 3+ quarters, confirmed by recent sales.
  - **Recovering from highs:** at least 40% below a high held for several months in the past 5 years, with sales in the last 45 days up at least 5%.
  - **Cheap vs. similar cards:** at most 65% of the median price of 4+ same-set, same-rarity cards whose characters score at least 10 demand points lower. Promos are excluded.
  - At most 3 picks per character.
- Snapshot results:
  - **PSA 10:** 11 picks, all uptrends.
  - **PSA 9:** 20 picks from 28 qualifying (19 uptrends, 1 recovering).
  - **Raw:** 20 picks from 49 qualifying (19 uptrends, 1 cheap).
- Aggron scores 69, just under the cut of 70. Its cards do sell about 1.5× their peers in this data, so it is not low demand by this measure. It is simply outside the top quarter.
- An earlier, broader "cheap" definition compared cards across sets and to their own character's average. It flagged things like Flying Pikachu against gold secret rares, so it was replaced with the same-set comparison above.
- API: `GET /api/investments`.

### Shared

- Both endpoints compute over every card and are memoised in `site/lib/api.mjs`. The cache resets when `market_cache` changes or the day rolls over, and the first request takes about 0.5 s.
- `site/build.mjs` bundles `movers` and `invest`; helpers use unique names because the Worker build concatenates modules.
- The README and the in-app "How targets work" dialog document both methods.

## Verification

- `node --test tests/*.test.mjs`: **76/76 passing**, up from 64. New tests cover each mover failure mode, the real-data invariants for movers and investments, character parsing, the uptrend and recovery edge cases, both API endpoints, and both UI views. The tests were run on Node 22, which lacks `--test-isolation`; the standard command for Node 24 is unchanged.
- `node build.mjs` and `node --check dist/server/index.js`: pass (43.4 MB Worker).
- Headless Chromium screenshots of both views at 1440px and 390px rendered without page errors. Card images were blocked in this sandbox, so the screenshots show placeholders; on the collector's machine the images load from pokemontcg.io.

## Pending and known limits

1. **eBay API keys are still pending from the collector.** Do not block other work on them. Once available, configure them locally (never in git), run an alert scan, and verify one real Browse API response and notification path.
2. Restart the local app to load the new code: `cd site`, then `node server.mjs` with Node 24+.
3. Movers and investments are only as fresh as the sales data. After about a week without **Refresh sales**, the weekly lists empty out by design. A refreshed card is measured to its own new check date; cards more than 7 days (movers) or 14 days (investments) behind the newest check are excluded.
4. PSA 9 monthly highs (the Recovering signal) use PriceCharting's Grade 9 guide, which mixes graders. This is labeled in the UI.
5. The Cheap and Recovering signals rarely fire on the current snapshot because many XY-era cards are near their highs. That is expected, not a bug. The thresholds are the `INVEST_RULES` constants if the collector wants them looser.
6. Character demand is relative within this catalog (B&W, XY, Sun & Moon rares only). Trainer and item names count as their own "characters" and rarely reach the cut.
7. The remaining 271 Sun & Moon rares lack exact PriceCharting matches, and only 172 Sun & Moon cards have full captures. Those cards contribute less to movers, investments and demand scores.
8. Alerts run only while `server.mjs` is running and alert once per listing.
9. The Worker bundle is too large for a typical Cloudflare deployment; hosted use needs market data in D1/KV.
10. Trend projections, movers and investment signals describe past sales. They must not be presented as forecasts or investment advice.

## Suggested next session

1. Do a visual pass of Top movers and Investments on the collector's desktop and phone with real card images. Ask whether the $25 floor, the top-quarter demand cut and the 3-per-character cap feel right.
2. Consider "watch" and "add to Dex" buttons directly on mover and investment rows, plus a "falling" movers list if wanted.
3. Expand Sun & Moon full captures (`tools/research/capture-new-sets.mjs`) so demand scores and movers cover more SM cards.
4. When the eBay keys arrive, perform a real alert integration test and document the result without exposing secrets.

## Commits this session

- `8c64966` — Add Top movers view for weekly and monthly price rises
- `c8e73fa` — Add Potential investments view screened from sales data
- Final commit — README methods and this handoff
