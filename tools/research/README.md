# Sales research tooling

These scripts build and audit the public catalog and PriceCharting snapshot used by Primal Watch. Run them from the repository root with Node.js 24 or newer. Captured source pages remain attributed to their original URLs; the app fails closed when a card cannot be matched exactly.

## Legacy catalog

`node tools/research/gen-legacy.mjs` downloads the public `PokemonTCG/pokemon-tcg-data` set and card JSON and writes `site/data/legacy-catalogs.json` for:

- all 16 EX Series sets;
- Diamond & Pearl (`dp1`–`dp7`);
- Platinum (`pl1`–`pl4`);
- HeartGold & SoulSilver (`hgss1`–`hgss4`);
- Call of Legends (`col1`).

The generated file preserves official collector numbers, rarities, images, release dates, and legacy mechanics such as Pokémon ex, Gold Star, LV.X, Prime, LEGEND, SH, SL, AR, and the Unown A–Z/!/ ? subset.

## PriceCharting mapping and captures

`node tools/research/capture-new-sets.mjs --series=EX,DP --per-set=10` reads each PriceCharting set listing, writes exact product URLs to `site/data/source-urls.json`, stores guides in `site/data/legacy-market.json`, and saves the selected full pages under `site/data/pricecharting/<set>.json`.

Useful options:

- `--per-set=0` maps exact guide URLs without adding full-page captures.
- `--series=EX` or `--series=DP` limits the run to one legacy group.
- A positive `--per-set` selects that many high-interest cards per set for full sale history, monthly guides, and population data.

Matching prefers the exact collector number and standard or `[Holo]` printing, while rejecting reverse holo, stamped, prerelease, promo, and other alternate printings. Special handling keeps Unown letters and punctuation distinct and preserves SH, SL, and AR subset numbers.

The October 2, 2026 legacy snapshot maps 1,317 of 1,425 eligible cards and contains 320 full captures: 160 EX pages with 11,023 classified sales and 160 Diamond & Pearl/Platinum/HGSS pages with 8,129 classified sales. The 108 unmatched cards intentionally show no market data until an exact source product can be identified.

## Existing and diagnostic tools

- `gen-bw.mjs` builds the Black & White catalog from `pokemon-tcg-data`.
- `map-urls.mjs [XY|BW]` maps an existing catalog against saved set-listing rows.
- `audit.mjs` reports per-grade coverage.
- `review.mjs <card ids>` prints the sales behind selected prices.

Classification rules live in `site/lib/capture.mjs` and `site/lib/sales.mjs`, shared with the app's Refresh action. Do not commit local SQLite files, logs, or API credentials.

## Wizards catalog, full rare-card capture and audit

- `node tools/research/gen-vintage.mjs`: generate 18 English sets from Base Set through the last pre-EX e-Card releases, plus contemporary promos (1,789 cards; 741 eligible rares/promos).
- `node tools/research/capture-vintage.mjs`: follow public set-listing pagination and capture every exactly matched rare/promo. At most three requests are active. Each card is checkpointed; rerunning resumes missing captures. Add set IDs to narrow a run, or `--refresh` to fetch existing captures again. Historical accepted rows are retained and deduplicated.
- `node tools/research/audit-vintage.mjs`: audit saved vintage sale identity, grade and provenance, and report score coverage and the historical forecast holdout results. Nonzero exit if invalid sales remain.

`vintage-coverage.json` records all unmatched cards, fetch failures, source-page counts and accepted eBay sales. `vintage-audit.json` records the audit timestamp and withholding reasons by grade. Neither report claims complete eBay sales history. A saved public product page has limited historical coverage. The direct eBay sold-history API is restricted; Browse listing-alert keys do not grant that archive.

Vintage product matches require collector number and exact name (or a documented alias). Numeric fallback matches are forbidden. First editions, shadowless, later reprints, foreign cards and alternate holo treatments are excluded. Missing or ambiguous products remain unpriced. Forecast holdouts are chronological and compare with a flat-price baseline; they do not establish long-term accuracy or returns from the investment score.

Vintage printing exceptions are explicit in the catalog and the card detail: Base Set Machamp uses the shadowed 1st Edition deck print (shadowless and 1999–2000 are still excluded); Best of Game 1–7 use the non-Winner reverse foils, and 8–9 use Winner-stamped reverse foils. A generic printing exclusion must not remove a set's native finish. The word “of” in a set name is no longer misread as the PSA “OF” qualifier; explicit grade qualifiers remain excluded.
