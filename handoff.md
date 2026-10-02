# Primal Watch — session handoff

Updated: October 1, 2026, ~6 pm Pacific (overnight session). Repository: `d-roads/pokemon` (public), branch `main`.

## Goals (from the collector)

1. Keep the clean, smooth design the collector likes.
2. Accurate prices and buy targets for rare cards from actual reported sales: raw near mint, PSA 9 and PSA 10. Focus on EX, full art, secret rare, promo and BREAK cards; commons and uncommons stay out of normal browsing.
3. Cover every rare card in the XY era, then the Black & White era (Black & White Base Set, Emerging Powers, Noble Victories, Next Destinies, Dark Explorers, Dragons Exalted, Dragon Vault, Boundaries Crossed, Plasma Storm, Plasma Freeze, Plasma Blast, Legendary Treasures).
4. **Alerts** when a wishlisted (watched) card is listed for a good price.
5. **The Dex**: a library of owned cards showing total collection value and a P/L chart for cards bought.
6. Preserve the saved watchlist and buy limits.
7. Commit each iteration to `d-roads/pokemon`, and leave a handoff like this one at the end of every session listing goals and unfinished work.

## Where things live

| What | Where |
| --- | --- |
| Original source folder (collector's PC) | `C:\Users\b345t\.codex\.chatgpt-projects\g-p-6a72b895d6288191b4624c5f5479fcae\primal-watch` — the app is in `site\` |
| Repository | `site/` (the app), `tools/research/` (data-collection scripts), `handoff.md`, packaging scripts |
| Saved watchlist, limits, Dex, alerts | `site/data/primal-watch.sqlite` (+ `-wal`, `-shm`). **Never committed** — the repo is public. |
| Run | `cd site` then `node server.mjs` (Node 24+) → http://localhost:5173. `Start-Primal-Watch.ps1` does the same on Windows. |

The Next.js template files in the original root folder (`app/`, `components/`, `package.json`, etc.) are unused scaffolding and are not mirrored in the repo.

## What was done this session

### Data: every rare card, full sales history

- **Catalog**: 3,167 cards in 26 sets (XY 1,831 · Black & White 1,336), 1,447 rare: 894 XY, 553 BW. BW checklists come from the public PokemonTCG/pokemon-tcg-data repo (`site/data/bw-catalogs.json`); "-EX" names are normalized to "EX"; Dragon Vault's unlabeled cards are treated as holo rares and Kyurem 21/20 as a secret rare; Legendary Treasures includes RC1–RC25 (only the rare RC cards are browsable).
- **Source URLs fixed**: every card's PriceCharting product URL was matched against PriceCharting's own set listings (`site/data/source-urls.json`). This fixed 76 XY links (apostrophes as `%27`, `mega-` vs `m-` names, `[Holo]` products such as Mew #53, `porygon-z`, `ho-oh`, promo numbers `xy01`). `pcSlug()` in `catalog.mjs` is the corrected fallback. All four examples from the previous handoff are covered by tests.
- **Full page captures**: all 1,447 rare cards' PriceCharting pages were read in full (Ungraded, Grade 9 and PSA 10 sold tables, monthly price history, PSA/CGC population) → `site/data/pricecharting/<set>.json`, 99,512 classified sales. Rules (in `lib/capture.mjs` + `lib/sales.mjs`): the table must agree with the title's grade, card number and set total must match, and lots, proxies, foreign copies, other graders, reverse/cosmos holos, stamped, prerelease, league, staff and signed copies are excluded. The old excerpt batches are merged only for sales older than what the page still shows (79 such sales remain).
- **Coverage on 2026-10-01** (cards with a sold median / with a buy target):

  | | Raw NM | PSA 9 | PSA 10 |
  | --- | --- | --- | --- |
  | XY (894) | 874 / 864 (was 469 targets) | 509 / 320 (was 53) | 364 / 226 (was 20) |
  | BW (553) | 549 / 530 | 196 / 77 | 104 / 19 |

  Cards without a target have fewer than 3 matching sales in 180 days or none in 90 days; that is a real gap in reported sales, not a parsing failure.
- Spot checks: Umbreon EX #119 (PSA 9 30-day median ≈ $400–415 from 9 sales; PSA 10 ≈ $5,300 from 4), Wailord EX #147 (PSA 9 $253.50 from 6; PSA 10 only one sale since 2022 → guide only), Primal Groudon EX #151 (PSA 9 $2,250 from 5 recent sales; PSA 10 last sold 2025 → guide only), Mew EX RC24 (PSA 9 $1,100, PSA 10 $12,270 median of 5 within 180 days, no target because none in 90 days).
- **Live refresh** (`provider.mjs`) now parses the real page structure the same way as the capture. The old parser read the wrong price cell on real pages. Live refresh from the collector's PC is still **unverified** (PriceCharting may block non-browser requests); it fails safely.

### New features

- **Dex** (sidebar → Dex): add owned cards (grade, quantity, price paid, date, notes) from any card's “＋ Dex” button or the Dex search. Shows collection value, cost basis, unrealized P/L, best performer, a value-vs-cost chart (6M/1Y/3Y/All, crosshair tooltip), a card grid, binder progress per set, and a per-card price-history chart with the purchase price and month marked. Valuation: sold median → source guide → latest monthly guide. API: `GET/POST/PUT/DELETE /api/collection`; table `collection`.
- **Listing alerts** (sidebar → Alerts): uses the collector's own free eBay developer keys (Browse API, client-credentials token). For each watched card and grade it searches newly listed Buy It Now / Best Offer listings (auctions optional), re-checks the title (number, grade, exclusions), and alerts when price + listed shipping is at or below the limit (the collector's limit, else the suggested target if allowed). Each listing alerts once. Notifications: in-app list with unread badge, desktop notifications while the page is open, ntfy topic, Discord webhook, and a test button. Without keys the page still lists a ready-made eBay search per watched card. Scans run in `server.mjs` every N minutes (default 30) while the server is running. API: `/api/alerts`, `/api/alerts/settings`, `/api/alerts/scan`, `/api/alerts/test`; tables `alert_settings`, `alerts`, `alert_runs`. Keys are stored only in the local SQLite file and are masked in every response.
- **Eras**: the set picker has All sets / All XY / All Black & White plus grouped sets; breadcrumb and sidebar follow the era; category tabs show only categories that exist in view (BREAK and ACE SPEC added).
- **Card detail** adds monthly price history, PSA population and gem rate, an alert note on watched cards, and “＋ Dex”.
- **Performance**: `/api/catalog` sends a compact market summary (≈550 KB gzipped for 3,167 cards); the full record (titles, links, history) loads per card. Server startup ≈1.4 s.

### Safety of saved data

`server.mjs` only runs `CREATE TABLE IF NOT EXISTS`. Verified on a copy of the collector's database: the 8 watchlist entries (including the $440 limit on Giratina EX `xy7-93`) are byte-for-byte unchanged after migration. The SQLite file on the PC was not touched by this session.

### Tests

59 passing: `node --test --test-isolation=none tests/*.test.mjs` (Node 22 without that flag: `node --test tests/*.test.mjs`). New coverage: real page markup parsing, table/grade agreement, variant exclusions, slug rules and verified URLs, BW catalog shape, Dex validation/valuation/series, alert matching, shipping/limits, token reuse, once-per-listing alerts, secrets masking, collection and alert API scoping. `node build.mjs` and `node --check dist/server/index.js` pass.

Visual checks were done with headless Chromium at 1440×900 and 390×844 (browse, BW set, card detail, Dex with chart hover and dialog, binder progress, Alerts, mobile). Card images could not load in the cloud workspace (blocked host) but load normally on the PC.

## Unfinished work and known limits

1. **Restart the app on the PC** to pick up the new code and data. The previously running server (if any) still has the old code in memory.
2. **eBay keys are needed for automatic alerts.** Untested against the live eBay API from here (no keys, no network to eBay); the request/response handling follows eBay's documented Browse API and is covered by mocked tests. First real run: add keys → Scan now → check the status line for errors.
3. **Live “Refresh sales” from the PC is unverified.** If PriceCharting blocks it, data can be re-captured the way this session did (see `tools/research/README.md`: built-in browser, paced at ~1.3 s per page, chunked transfer).
4. Remove the five temporary helpers still in the PC folder (`site/update-*.mjs`); they were deleted from the repo but this session cannot delete files on the PC. The old `primal-watch.zip` and `site/dist/` on the PC are stale; run `node build.mjs` or `Package-Latest.ps1` to refresh them if needed.
5. Alerts fire once per listing; a later price drop on the same listing does not re-alert. Alerts only run while `node server.mjs` is running.
6. The Cloudflare Worker bundle is ≈37 MB with all captures embedded, too large for Workers. Hosting would need market data in D1/KV. Publishing was not requested.
7. PSA 9 history in the Dex chart is PriceCharting's Grade 9 guide (mixed graders); current values use PSA-only sold medians.
8. Not modeled: BW Black Star Promos, reverse holos and stamped variants as separate cards, realized P/L for sold cards, selling fees.
9. Demand scores remain a sales-activity proxy; five-year scenarios remain illustrative, not backtested.

## Suggested next steps

1. Restart, open the Dex and Alerts, add eBay keys and an ntfy topic, run a scan, and confirm a test notification arrives.
2. Decide whether to refresh captures on a schedule (e.g., weekly) — the research tooling makes a full refresh about 40 minutes of paced page reads.
3. Optional: BW promos, a realized-P/L “sold” state in the Dex, CSV export/import of the Dex, configurable target margin.

## Commits this session

- `d0864aa` Import from the September 30 checkpoint
- `c99c5b6` Dex, listing alerts, BW catalog, full-page captures (first 525 XY cards)
- `29e8952` All 894 XY rare cards captured
- `945d9d9` All 553 BW rare cards captured; binder progress; research tooling
- final commit: this handoff and write-back notes
