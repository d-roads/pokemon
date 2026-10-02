# Primal Watch — session handoff

Updated: October 1, 2026 Pacific. Repository: `d-roads/pokemon`, branch `main`. The repository is authoritative.

## Product goals

1. Keep the current clean, smooth collector UI.
2. Show defensible prices and buy targets from reported sales for raw near-mint, PSA 9, and PSA 10 cards. Never fabricate prices when evidence is missing.
3. Cover rare/chase cards across Black & White, XY, and Sun & Moon, including requested special sets.
4. Preserve the watchlist, buy limits, Dex, and listing alerts.
5. Commit each integration separately and leave an updated handoff after every session.

## Current state

- **Catalog:** 5,923 cards in 43 sets; 2,835 are browsable rare/promo cards.
  - XY: 1,865 cards / 902 rare, now including Double Crisis.
  - Black & White: 1,336 cards / 553 rare.
  - Sun & Moon: 2,722 cards / 1,380 rare across Sun & Moon, Guardians Rising, Burning Shadows, Shining Legends, Crimson Invasion, Ultra Prism, Forbidden Light, Celestial Storm, Dragon Majesty, Lost Thunder, Team Up, Detective Pikachu, Unbroken Bonds, Unified Minds, Hidden Fates (including SV1–SV94), and Cosmic Eclipse.
- **Full PriceCharting captures:** 1,627 cards across 43 files, with 113,223 classified sales in total.
- **Sun & Moon pricing:** 1,109 of 1,380 rare cards have exact PriceCharting product matches and guide prices. The 172 highest-interest cards have full captures containing 13,145 classified sales, monthly history, and population data. The 271 unmatched rare cards intentionally show no fabricated market data.
- **Double Crisis pricing:** all 8 rare cards have exact matches and full captures, containing 566 classified sales.
- Local user data lives in `site/data/primal-watch.sqlite` and is gitignored. It must never be committed because this is a public repository.

## Work completed this session

### Dex purchase date

- Replaced the fragile free-form purchase date entry with aligned Month / Day / Year controls plus Today and Clear actions.
- New dates are limited to January 1, 2010 through today in both the UI and API.
- Existing legacy records before 2010 remain readable and can be edited without silently changing their date; changing such a date requires a valid 2010-or-later value.
- Main files: `site/public/app.js`, `site/public/style.css`, `site/lib/portfolio.mjs`, `site/lib/api.mjs`.

### 1Y / 2Y / 3Y price projections

- Card detail now shows a **Simple trend projection** beside the recent-sales scatter plot.
- It performs ordinary least-squares linear regression on up to 35 matching sales from the trailing year, converts the daily dollar slope to a yearly increase using 365.2425 days, and applies that dollar slope to today's reference price for 1Y, 2Y, and 3Y values.
- It fails closed with **Not enough information** unless there are at least 3 usable sales spanning at least 30 days. Negative projections are floored at $0.
- The UI explicitly labels the figures as simple projections and not investment advice.
- Main files: `site/lib/analysis.mjs`, `site/public/app.js`, `site/public/style.css`.

### Sun & Moon and Double Crisis

- Added all 16 requested Sun & Moon sets, including Hidden Fates' Shiny Vault, plus Double Crisis.
- Catalog data is stored in `site/data/sm-catalogs.json` and `site/data/xy-special-catalogs.json`.
- Exact product mappings and guide snapshots are in `site/data/source-urls.json` and `site/data/sm-market.json`; full captures are in `site/data/pricecharting/`.
- `tools/research/capture-new-sets.mjs` is the paced/retried workflow for exact set-table mapping and full capture. It uses the same strict classifier as the app and supports explicit set IDs such as `dc1`, `sm9`, and `sm115`.
- Corrected sale matching for official Tag Team names containing `&` and subset identifiers such as `SV49/SV94`, while still rejecting bundles with extra card names.

## Verification

- `node --test --test-isolation=none tests/*.test.mjs`: **64/64 passing**.
- `node build.mjs`: passes; dependency-free Worker and public assets built successfully (about 43.3 MB).
- Coverage includes the 2010 date boundary and legacy-date compatibility, projection math/insufficient-data behavior, full catalog totals and uniqueness, Sun & Moon subset/Tag Team matching, Double Crisis browsing, API scoping, Dex, alerts, and saved watchlist behavior.
- Managed visual-browser startup was unavailable in this environment, so this session did not perform a fresh screenshot pass. UI rendering and interactions were exercised by the repository's VM-based UI tests.

## Pending and known limits

1. **eBay API keys are still pending from the collector.** Do not block other work on them. Once available, configure them locally (never in git), run an alert scan, and verify one real Browse API response and notification path.
2. Restart the local app to load the new code and data: `cd site`, then `node server.mjs` with Node 24+.
3. The remaining 271 Sun & Moon rare cards do not have an exact PriceCharting product match. Revisit set-table matching before adding data; do not synthesize URLs or prices.
4. Sun & Moon full captures currently prioritize 172 high-interest cards rather than every rare. A future pass can expand coverage with `tools/research/capture-new-sets.mjs`.
5. Live PriceCharting refresh from the collector's PC remains unverified and may be rate-limited. The committed snapshot pipeline is paced and retrying.
6. Alerts run only while `server.mjs` is running and alert once per listing. A later price drop on the same listing does not re-alert.
7. The Worker bundle is too large for a typical Cloudflare Worker deployment with all captures embedded; hosted deployment would need market data moved to D1/KV or another store.
8. Trend values are mechanical extrapolations of a recent dollar slope, not forecasts. Do not present them as investment advice.

## Suggested next session

1. When the eBay keys arrive, perform a real alert integration test and document the result without exposing secrets.
2. Review unmatched Sun & Moon rares and expand full-capture coverage based on collector priority/value.
3. Do a desktop/mobile visual pass on the collector's machine, especially the Dex date controls, projection panel, Hidden Fates subset numbers, and Double Crisis cards.
4. Consider Dex CSV import/export or a sold/realized-P&L state after the data work is stable.

## Commits this session

- `badd136` — Fix Dex purchase date entry
- `5773cda` — Add trailing-year price projections
- `89cc940` — Add Sun & Moon rare-card catalog and markets
- `2dc106c` — Add Double Crisis rare-card market data
- Final commit — this handoff
