# Primal Watch — session handoff

Updated: October 2, 2026 Pacific. Repository: `d-roads/pokemon`, branch `main`. The repository is authoritative.

## Product goals

1. Keep the current clean, smooth collector UI.
2. Show defensible prices and buy targets from reported sales for raw near-mint, PSA 9, and PSA 10 cards. Never fabricate prices when evidence is missing.
3. Cover rare/chase cards from the EX era through Sun & Moon, including requested special sets.
4. Preserve the watchlist, buy limits, Dex, and listing alerts.
5. **New:** Show weekly and monthly top movers by percentage increase (top 20 each for PSA 10, PSA 9, and raw). Leave out any move the data can't confirm.
6. **New:** Offer a Potential investments tab built only from the app's sales data, weighted toward characters with real collector demand.
7. Let collectors include or exclude eras independently in Top movers and Investments.
8. Provide Light, Dark, and Soft contrast appearances through a dedicated Settings page.
9. Commit each integration separately and leave an updated handoff after every session.
10. **Standard finish (collector's rule):** commit and push to git, copy the changed files into the collector's local folder (`C:\Users\b345t\.codex\.chatgpt-projects\g-p-6a72b895d6288191b4624c5f5479fcae\primal-watch`, via the desktop link; git is not installed there), and post the handoff to the claude.ai Project.

## Current state

- **Catalog:** 9,526 cards in 75 sets; 4,260 are browsable rare/chase cards (EX 687, Diamond & Pearl through HGSS 738, Black & White 553, XY 902, Sun & Moon 1,380).
- **Market data:** 1,947 full PriceCharting captures with 132,454 classified sales. Of 1,425 eligible legacy cards, 1,317 have exact guide matches and 320 have full captures. The snapshot was checked October 2, 2026.
- **Navigation:** Browse sets · **Top movers** · **Investments** · Watchlist · Dex · Alerts · **Settings**.
- Local user data lives in `site/data/primal-watch.sqlite` and is gitignored. It must never be committed because this is a public repository.

## Work completed this session

### EX and Diamond & Pearl through HGSS catalog and market data

- Added every English expansion from EX Ruby & Sapphire through EX Power Keepers, all Diamond & Pearl and Platinum expansions, all four HeartGold & SoulSilver expansions, and Call of Legends: 32 sets and 3,603 cards total.
- The catalog now understands Pokémon ex, Gold Star, LV.X, Prime, LEGEND, SH, SL, AR, and the Unown A–Z/!/ ? subset. Collector labels and strict sale matching keep letters, punctuation, and subset numbers distinct.
- Added `tools/research/gen-legacy.mjs`, generated `site/data/legacy-catalogs.json`, and generalized `capture-new-sets.mjs` for exact set-listing matches and repeatable legacy capture runs.
- Mapped 1,317 of 1,425 eligible legacy cards to exact PriceCharting product pages. Unmatched cards fail closed and display no price rather than borrowing another printing's data.
- Captured the 10 highest-interest cards from every new set: 160 EX pages with 11,023 classified sales and 160 Diamond & Pearl/Platinum/HGSS pages with 8,129 classified sales. Total app coverage is now 1,947 full pages and 132,454 classified sales.

### Settings and era filters

- Added a Settings page with Light, Dark, and Soft contrast appearances. The preference is stored locally and applied before the stylesheet loads to prevent a light-theme flash.
- Added shared EX / DP / BW / XY / SM filter chips to Top movers and Investments. All eras are enabled initially, the final selected era cannot be removed accidentally, and “All eras” resets the scope.
- Filtering is performed by the API before ranking, so an XY-only list is the best 20 within XY rather than a hidden subset of the global top 20. Both endpoints accept `series=EX,DP,...`, cache by scope, and reject unsupported or empty scopes with 400.
- Older cards qualify naturally under the existing evidence rules. In the current EX+DP monthly scope there are 1 PSA 10, 20 PSA 9, and 11 raw movers, plus 11 PSA 9 and 16 raw investment picks.
- Added Browse category tabs for Pokémon ex, LV.X, Prime, LEGEND, and Gold Star; the set picker now covers five eras and 75 sets.

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

### Follow-up fixes (`b5050f3`)

- **Scrolling:** on desktop the page body is fixed height and each view scrolls internally. The Top movers and Investments views were missing from that rule, so content past the first screen was unreachable. Both are now added to it, alongside Dex and Alerts, and were verified with a mouse-wheel test in Chromium.
- **Investment thesis:** each pick now has a "Why it's listed" block containing:
  - a short thesis written from its own numbers: character demand, then each signal's evidence, then the main risk for that kind of signal, then "Not a forecast";
  - a checklist of all three signals, marking each met (✓ with figures) or not met.
- The thesis is generated server-side (`investmentThesis` in `site/lib/invest.mjs`, fields `thesis` and `checks`).

### Shared

- Both endpoints compute over every card and are memoised in `site/lib/api.mjs`. The cache resets when `market_cache` changes or the day rolls over, and the first request takes about 0.5 s.
- `site/build.mjs` bundles `movers` and `invest`; helpers use unique names because the Worker build concatenates modules.
- The README and the in-app "How targets work" dialog document both methods.

## Verification

- `node --test --test-isolation=none tests/*.test.mjs`: **79/79 passing** on Node 24.19. New coverage includes the full five-era catalog, saved market coverage totals, legacy chase categories, exact source URLs, legacy letter/shiny collector-number isolation, series-scoped Movers and Investments APIs, invalid scopes, five-era navigation, and persistent appearance choices.
- `node build.mjs`: pass (52.5 MB dependency-free Worker plus public assets).
- A live-server endpoint check confirmed `series=EX,DP` response scopes and current result counts; unsupported series return 400.
- The in-app browser harness could not initialize in this session because its runtime was blocked from importing a required Node built-in module. No visual browser result is claimed for this session; the Settings and filter interactions are covered by UI tests, but desktop/mobile screenshots should be checked once the browser harness is available.

## Pending and known limits

1. **eBay API keys are still pending from the collector.** Do not block other work on them. Once available, configure them locally (never in git), run an alert scan, and verify one real Browse API response and notification path.
2. Restart the local app to load the new code: `cd site`, then `node server.mjs` with Node 24+.
3. Movers and investments are only as fresh as the sales data. After about a week without **Refresh sales**, the weekly lists empty out by design. A refreshed card is measured to its own new check date; cards more than 7 days (movers) or 14 days (investments) behind the newest check are excluded.
4. PSA 9 monthly highs (the Recovering signal) use PriceCharting's Grade 9 guide, which mixes graders. This is labeled in the UI.
5. The Cheap and Recovering signals rarely fire on the current snapshot because many XY-era cards are near their highs. That is expected, not a bug. The thresholds are the `INVEST_RULES` constants if the collector wants them looser.
6. Character demand is relative within the selected five-era catalog. Trainer and item names count as their own "characters" and rarely reach the cut.
7. The remaining 271 Sun & Moon rares and 108 legacy rares lack exact PriceCharting matches. Only 172 Sun & Moon and 320 legacy cards have full captures, so cards without full sales histories contribute less to movers, investments and demand scores.
8. Alerts run only while `server.mjs` is running and alert once per listing.
9. The 52.5 MB Worker bundle is too large for a typical Cloudflare deployment; hosted use needs market data in D1/KV.
10. Trend projections, movers and investment signals describe past sales. They must not be presented as forecasts or investment advice.

## Suggested next session

1. Do a visual pass of Settings, the seven-item navigation, and era-filtered Top movers/Investments at desktop and 390px once browser automation is available; verify real card images on the collector's machine.
2. Review the 108 unmatched legacy PriceCharting products manually and add only exact matches. Expand full captures beyond 10 per legacy set if broader investment coverage is wanted.
3. Ask whether the $25 floor, top-quarter demand cut, 3-per-character cap, and compact era labels feel right across the much larger catalog.
4. Consider "watch" and "add to Dex" buttons directly on mover and investment rows, plus a "falling" movers list if wanted.
5. Expand Sun & Moon full captures (`tools/research/capture-new-sets.mjs`) so demand scores and movers cover more SM cards.
6. When the eBay keys arrive, perform a real alert integration test and document the result without exposing secrets.

## Commits this session

- `70d7339` — Add EX through HGSS catalog and market research
- `49f7d73` — Add appearance settings and era-scoped market screens
- Final commit — this handoff update
