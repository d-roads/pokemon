# Primal Watch — session handoff

Updated: October 1, 2026 UTC / September 30, 2026 Pacific.

## Goal and user preferences

Build a clean, smooth Pokémon XY card watchlist website showing current prices, reported past sales, and useful buy targets for raw, PSA 9, and PSA 10 cards. The user initially tested Primal Clash, then requested the rest of XY. Keep the existing visual design, which the user likes.

The current feature request is to give the card list its own scroller so the full card insight stays accessible, and to improve actual sale data and buy targets. Focus on rare cards, especially EXs, promos, secret rares, full arts, and BREAK cards; exclude commons and uncommons from normal browsing.

The latest request is to document progress and remaining work in this file. This is a checkpoint, not a claim that the remaining website work has been completed.

## Project location and runtime

- Project root: `C:\Users\b345t\.codex\.chatgpt-projects\g-p-6a72b895d6288191b4624c5f5479fcae\primal-watch`
- Application: `site/`
- Local address: `http://localhost:5173/`
- Runtime: Node.js 24.19; dependency-free local server with built-in SQLite.
- Node executable used this session: `C:\Users\b345t\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe`
- Watchlist and user buy limits: `site/data/primal-watch.sqlite`. Preserve this database.
- Start locally from `site/` with `node server.mjs` or `Start-Primal-Watch.ps1`.
- The previously running server was PID 7620. Verify its identity and current state before restarting; do not assume that PID still belongs to this app.
- The server has not been restarted for the latest changes. Static files can update while catalog and market modules remain loaded from the prior process.

## Completed changes in the working tree

### Scrolling and browsing

- Desktop layout fits the viewport; the card list and insight panel each have independent scrolling.
- Controls and list footer stay outside the list's scroll area. Both scroll regions can receive keyboard focus.
- Mobile list and expanded insight use bounded scroll areas.
- Default browsing is the chase-card filter. All rares excludes common/uncommon cards.
- Existing saved watchlist entries remain available, including legacy entries that are outside the new rare filters.
- Analysis results are cached per market record, grade, and day to reduce repeated calculations while browsing.

### Catalog

The catalog now contains 1,831 cards: 1,620 numbered cards across 13 XY expansions plus 211 XY Black Star Promos. Of these, 894 are eligible rare/promo cards and 513 are categorized as chase cards.

Sets: XY Base Set, Flashfire, Furious Fists, Phantom Forces, Primal Clash, Roaring Skies, Ancient Origins, BREAKthrough, BREAKpoint, Fates Collide, Steam Siege, Generations, Evolutions, and XY Black Star Promos. Generations includes RC1–RC32. Reverse-holo and alternate promo variants are not individually modeled.

Primal Clash rarity metadata was added. Card IDs remain scoped to each set, preserving existing watchlist keys.

### Sales parsing and pricing

- Improved parsing of horizontal PriceCharting guide tables and named price cells.
- Improved matching of printed card numbers, denominators, Radiant Collection IDs, and XY promo numbers.
- PSA 9 and PSA 10 matching excludes other graders, ambiguous grades, and qualifiers.
- Matching filters exclude obvious lots, bundles, reverse variants, jumbo/staff cards, and non-English listings.
- Printed HP values in titles are distinguished from heavily played condition labels.
- Repeated TCGPlayer product links across different sale dates are retained as separate reported transactions.
- Duplicate legacy seed transactions are removed when a matching titled transaction is available.
- Newer observations take precedence over older cached guide values; sale histories are merged rather than replaced.
- Invalid dates, future transactions, and duplicates are excluded from analysis.
- Displayed money uses two decimal places.
- Detail panels show source links, observation dates, sale titles, grade-specific coverage, and sample counts.

### Recommendation model

- Use the narrowest 30-, 90-, or 180-day window containing at least three usable same-grade sales after outlier filtering.
- The buy target is 15% below the matching sale median.
- A target requires at least three comparable sales within 180 days and at least one within 90 days.
- Raw targets require explicitly near-mint sales; mixed or unknown raw conditions do not qualify.
- One or two comparable sales can show a limited-sample median, but cannot produce a buy target.
- Mixed-grader Grade 9 reference guides are shown separately and are not labeled as PSA 9 market prices.
- Missing or insufficient data stays unknown rather than producing an unsupported target.

The 15% margin is a buying heuristic. Demand scores are sales-activity proxies. Five-year scenarios remain illustrative and are not validated investment forecasts or backtested predictions.

### API

- Added `POST /api/research?set=<set-id|all>&offset=<number>` to fetch actual histories for four eligible cards per batch.
- The UI's Refresh sales control runs batches, supports cancellation, and reports source failures.
- Failed refreshes retain prior data and do not falsely advance its observation date.
- Existing `/api/refresh` remains for compatibility and now scopes work to eligible cards.
- Existing watchlist ownership, origin validation, and persistence remain in place.
- The build includes the shared sales-parsing module.

## Research checkpoint

The most recent completed research batch checked **880 of 894 eligible cards**. Its in-session tally was **713 cards with reported sales** and **15,834 collected sale records**. These are collection counts before final on-disk normalization, deduplication, date filtering, and recommendation analysis. Recompute the final counts from `data/market.mjs`; do not present these as fully audited usable-sale counts.

Completed research batches were saved under `site/data/sales-batches/` as:

`batch-080.json`, `batch-160.json`, `batch-240.json`, `batch-320.json`, `batch-400.json`, `batch-480.json`, `batch-560.json`, `batch-640.json`, `batch-720.json`, `batch-800.json`, and `batch-880.json`.

**14 cards remain unresearched in the original pass.** Reconstruct the remaining IDs by comparing eligible catalog IDs against the saved batch keys. Temporary function-session stores are no longer available in the handoff turn; reconstruct state from disk, not from those stores.

The data module merges saved batches, the initial researched-sales file, and existing reference snapshots. Public PriceCharting excerpts were checked for guide tables, near-mint raw listings, exact PSA 9 titles, and PSA 10 titles. Excerpts can be incomplete; statuses such as `partial`, `guides-only`, and `unavailable` deliberately record that limitation. Checking a source does not guarantee all three grades have sufficient comparable sales.

An earlier long research call was interrupted before its temporary state committed. That pass was repeated in smaller, disk-saved batches. The completed files above are the durable checkpoint.

## Known issues to resolve next

### Source URL aliases

`site/data/catalog.mjs` currently strips punctuation while creating PriceCharting slugs. This creates wrong links for apostrophes, some hyphens, and publisher-specific card names. Fix the shared slug generation and add explicit aliases where needed. Apply corrected links to original Primal Clash entries as well as added sets and promos.

Verified examples from source research:

| Card ID | Correct PriceCharting URL |
| --- | --- |
| `xy5-157` | `https://www.pricecharting.com/game/pokemon-primal-clash/archie%27s-ace-in-the-hole-157` |
| `xy8-162` | `https://www.pricecharting.com/game/pokemon-breakthrough/giovanni%27s-scheme-162` |
| `xy12-108` | `https://www.pricecharting.com/game/pokemon-evolutions/misty%27s-determination-108` |
| `xyp-XY158` | `https://www.pricecharting.com/game/pokemon-promo/mega-beedrill-ex-xy158` |

Other candidates to verify include Maxie's Hidden Ball Trick, Professor Birch's Observations, Lysandre's Trump Card, Team Rocket's Handiwork, Brock's Grit, and Ho-Oh BREAK. Do not assume every Mega promo uses the catalog's abbreviated name. Retry affected failed sources after fixing links, and update their recorded source metadata without inventing transactions.

### Runtime and access limitations

- Outgoing direct market-source requests were blocked in the local environment. The remote web research tool worked, but live refresh from the application has not been verified against a reachable source.
- On the latest handoff turn, shell execution failed before launching with: `managed networking requires the elevated Windows sandbox backend`. This prevented a fresh disk audit, test run, and restart in that turn. This was an environment failure, not a website test failure.
- No usable in-app browser-control tool was exposed. UI controls were exercised with a VM harness, but the new scrolling layout still needs real browser checks at desktop, short viewport, and mobile sizes.
- Avoid bypassing network restrictions or claiming continuous monitoring. The website currently has researched snapshots and refresh functionality whose live source access remains unverified here.

## Tests and verification status

The last completed suite passed **38 tests** using:

```powershell
node --test --test-isolation=none tests/*.test.mjs
```

The no-isolation flag is needed in this environment because test subprocess spawning encountered EPERM. npm is not required.

Coverage includes catalog counts and IDs, rare/promo filters, raw condition and exact PSA matching, public excerpt and HTML parsing, duplicate handling, cache precedence, recency windows, mixed-grade guide behavior, blocked-refresh preservation, scoped watchlists, API validation, and UI control rendering.

Additional research batches were written after the latest successful test run. Rerun tests after completing source fixes and the final research pass. Do not claim that the current server has been updated or that visual browser QA has passed.

## Next session: recommended order

1. Restore normal workspace shell access and inspect the saved batch files.
2. Fix and verify source URL aliases; add meaningful regression coverage for apostrophes and special promo names.
3. Research the remaining 14 eligible cards and retry affected sources. Save observations to disk after each small batch.
4. Audit final deduplicated histories and calculate coverage for raw NM, PSA 9, and PSA 10 separately. Report cards with valid current medians, cards with eligible buy targets, stale histories, and missing sources.
5. Review sample high-interest cards, including Umbreon EX #119 (`xy10-119`), Wailord EX #147 (`xy5-147`), and Primal Groudon EX #151 (`xy5-151`), across all three grades. Inspect actual titles and dates, not just aggregate counts.
6. Run the tests, `node build.mjs`, and `node --check dist/server/index.js`.
7. Read existing watchlist state, verify the old server process, restart only this app, and compare state afterward. Confirm localhost serves 14 sets, 1,831 total cards, and 894 eligible cards without changing saved limits.
8. Verify independent list/insight scrolling in a real browser, including small screens, keyboard focus, card selection, pagination, and filter changes.
9. Update `site/README.md`, which still describes the old 1,620-card catalog and four-card sale coverage.
10. Remove the already-applied temporary helpers listed below; rebuild the source ZIP and update the existing saved artifact. Give the user a concise outcome and disclose the live-refresh limitation if it still applies.

On Windows, launch any background server with `Start-Process -WindowStyle Hidden`. Keep process stop and start steps separate and verify the target process before stopping it.

## Important files

| Path relative to `site/` | Purpose |
| --- | --- |
| `public/index.html` | Main interface and control markup |
| `public/style.css` | Styling and independent scroll layout |
| `public/app.js` | Filters, selection, watchlist, insights, batched research refresh |
| `data/catalog.mjs` | Catalog construction, rarity/chase flags, and source URLs |
| `data/xy-catalogs.json` | Additional numbered XY catalogs |
| `data/primal-rarities.json` | Primal Clash rarity metadata |
| `data/xy-promos.json` | XY promo catalog |
| `data/market.mjs` | Merge reference snapshots and researched observations |
| `data/sales-batches/` | Durable public-sale research checkpoints |
| `lib/sales.mjs` | Matching, normalization, deduplication, and market merges |
| `lib/provider.mjs` | Source fetching and HTML price/history parsing |
| `lib/analysis.mjs` | Comparable sales, prices, targets, demand, scenarios |
| `lib/api.mjs` | Catalog, market, research refresh, and watchlist endpoints |
| `server.mjs` | Loopback HTTP server and SQLite runtime |
| `db/schema.sql` | Watchlist and market-cache schema |
| `tests/` | Model, provider, API, and UI checks |
| `build.mjs` | Cloudflare Worker build |

Temporary one-time helpers already applied: `update-rare-ui.mjs`, `update-build.mjs`, `update-tests.mjs`, `update-refresh.mjs`, and `update-guide-label.mjs`. Do not rerun them; some would duplicate edits. Remove only these exact temporary files after verification.

The root `package-source.mjs` creates `primal-watch.zip`, excluding build output, SQLite data, and localhost logs. The previous source ZIP predates the current changes and still needs regeneration. The existing saved ZIP's identifier is `libfile_f05a209a5e488191b1e54b6fde73d277`; replace that exact artifact when ready rather than creating an unrelated duplicate.

Sites project registration from earlier work: `appgprj_6abda3f9d8b08191bdfd0c7d7cfb8b49`. No production URL has been published. Publishing is not required by the current request.

## Future improvements

- Integrate an authorized price/sales provider with dependable access, explicit raw condition and grade fields, and permitted refresh limits.
- Track source health, last successful refresh, coverage, and data age per grade so incomplete data is easy to understand.
- Improve edition/variant matching, international currency handling, shipping treatment, and transaction-level provenance before widening the catalog.
- Add scheduled updates and price alerts only when requested; the current app is not continuously monitoring sales.
- Make the target margin configurable and account for selling fees, shipping, taxes, and liquidity before presenting investment-oriented conclusions.
- Backtest any forecasting model against genuinely historical data without future-data leakage. Current five-year scenarios do not satisfy the user's earlier accuracy/backtesting goal.
- Improve demand estimates with distinct buyer activity or sell-through data when available; observed sale frequency alone is a limited proxy.
- Review list performance as coverage grows, test accessible keyboard navigation and touch scrolling, and consider virtualization if pagination no longer keeps browsing responsive.

## Working preferences

Keep progressing within the user's authorized scope without unnecessary confirmation requests. Preserve the watchlist and custom limits. Keep the UI approachable and the pricing evidence transparent. Distinguish completed changes, verified behavior, partial observations, and future plans in any final report.
