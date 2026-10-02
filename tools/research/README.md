# Sales research tooling

How the October 2026 PriceCharting captures were collected, so a later session can refresh or extend them.
These are session tools, not part of the app. Paths inside assume the repo at `/home/claude/pokemon`,
the pokemon-tcg-data clone at `/home/claude/pokemontcg/pokemon-tcg-data`, and a scratch folder at `/home/claude/work`.

1. **Catalog** (new sets): `gen-bw.mjs` builds `site/data/bw-catalogs.json` from the public
   PokemonTCG/pokemon-tcg-data repository (names, numbers, rarities). Adapt the set list for new eras.
2. **Set listings**: in the Claude desktop built-in browser, open any pricecharting.com page, inject
   `pwlib-full.js` with the JavaScript tool, then `__pw.setList('pokemon-<console-slug>')` for each set.
3. **Product URLs**: `map-urls.mjs [XY|BW]` matches catalog cards to listing rows by collector number
   (falling back to the `[Holo]` product) and writes a URL map; merge it into `site/data/source-urls.json`.
4. **Pages**: save a queue with `__pw.saveQueue('name', [[cardId, 'pokemon-set/slug-number'], ...])` and run
   `__pw.chain('name', 75, 1300)` (one page every ~1.3 s, stops after 4 failures in a row). The queue lives in
   the page's localStorage, so a closed pane can resume with `resume.js`.
5. **Transfer**: `await __pw.waitNext(prevTag, 38)` returns a finished chunk as gzip+base64 parts of 250k
   characters. Oversized tool results are saved to disk by the harness; `pull.sh` reassembles them
   (`ingest.mjs`) and classifies each page (`process-pages.mjs` → `site/data/pricecharting/<set>.json`).
   Then mark the chunk retrieved with the next `waitNext(tag)` call.
6. **Check**: `audit.mjs` reports per-grade coverage; `review.mjs <card ids>` prints the sales behind a price.

Classification rules live in `site/lib/capture.mjs` and `site/lib/sales.mjs`, shared with the app's own refresh.
