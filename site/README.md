# FutureSight

A personal Pokémon card tracker covering Wizards of the Coast through released Mega Evolution sets (1999–2026). Browse collectible cards set by set, compare reported sold prices for raw (near mint), PSA 9 and PSA 10 copies, see the week's and month's top movers, screen potential investments, save a watchlist with your own buy limits, keep your collection in the Dex, and get alerts when a watched card is listed at your price.

## Open locally

Requires Node.js 24 or newer. No packages or installation are needed.

Run `node server.mjs` in this folder (or `Start-FutureSight.ps1` on Windows), then open http://localhost:5173.

**After copying in new files, close the FutureSight window and start it again.** The page files are re-read on every request, but the server's API code is loaded only once at startup. A server left running will serve the new page with the old API, and features such as Investment scores will report that the server code is older than the page.

Your watchlist, buy limits, Dex and alert settings are stored in `data/primal-watch.sqlite` (the file keeps its name from before the FutureSight rename, so nothing needs moving). Starting the server only ever adds missing tables, so existing data is kept. Local mode is a single personal workspace and listens only on the loopback address.

## Beta and local test copies

- **The beta runs the `beta` branch** (version 1.0.0, "beta 1": commit `4bdf0c8`). Outside testers reach it through `Start-Beta.ps1` (port 5173, Quick Tunnel, invite codes). Update it only on purpose.
- **New work is tested in a separate copy.** Unzip a newer build into its own folder next to the beta folder (never on top of it) and run `Start-LocalTest.ps1` there. It uses port 5180, listens on this computer only (`-Network` to allow the home network), opens no tunnel, and keeps its own database `data\local-test.sqlite`, copied once from the beta's database with `copy-db.mjs` (safe while the beta runs; `-FreshCopy` re-copies it).
- Every page shows which copy it is beside the logo and on the sign-in page: **Beta · v…**, **Local test · v…** or **Local · v…** (`GET /api/version`; set by `FUTURESIGHT_CHANNEL`). `FUTURESIGHT_DB` points a copy at another database file.

## Accounts and sharing on your home network

- Everyone signs in on the landing page (`public/login.html`). Each account has its own watchlist, Dex and alerts; prices and the catalog are shared.
- **Create account** asks for a username, a password and the password again. Usernames are 3–20 letters or numbers, with `.` `-` `_` allowed only between them, and are unique regardless of capital letters. Passwords are 5–64 standard keyboard characters with no spaces and none of `< > " ' ` \ ; &`. The server checks the same rules (`lib/accounts.mjs`).
- Passwords are stored as salted scrypt hashes. Sessions last 30 days in an HttpOnly, SameSite=Strict cookie; the database keeps only a hash of each session token. Sign-in and sign-up forms must come from FutureSight's own page, and repeated failed sign-ins from one device are paused for 10 minutes.
- **Admin account:** set `FUTURESIGHT_ADMIN_PASSWORD` in `site/.env` and the server creates `admin` on its next start (only if it does not exist yet). Admin takes over the watchlist, Dex and alerts saved before accounts existed (stored under `local-owner`). Removing the line afterwards does not change the account.
- **Home network:** `Start-FutureSight.ps1` listens on the network (`HOST=0.0.0.0`) and prints the address others should open, such as `http://192.168.1.20:5173`. Windows may ask once whether Node.js can use private networks; choose Allow. Traffic is plain HTTP, so use this only on a network you trust.
- Listing alerts run in the background for every account that has turned them on.

### Beta testers outside your network (Cloudflare Quick Tunnel + invite codes)

1. Run `Start-Beta.ps1` (right-click → Run with PowerShell). It restarts FutureSight with the current code, opens a Cloudflare Quick Tunnel and prints the **beta link** (`https://….trycloudflare.com`) in a green box. Keep that window open; closing it takes the link down. Each start gives a new link.
2. In another PowerShell window in this folder, run `node invite.mjs` for one invite code, `node invite.mjs 5` for five, or `node invite.mjs 1 "Sam"` to note who it is for. `node invite.mjs list` shows who used which code.
3. Send each tester the link and their code. They choose **Create account** and enter it. Each code works once.

How it is protected: through the link, new accounts need an unused invite code (stored only as a hash, used and spent in one step), and everything else needs a signed-in account. Sign-in cookies are `Secure`. Failed sign-ins (8 per 10 minutes) and sign-ups (6 per hour) are limited per tester, using the visitor address cloudflared passes on, so one tester's typos cannot lock out the others. `server.mjs` only accepts the tunnel when the request comes from cloudflared on this computer for a `*.trycloudflare.com` address over HTTPS (`lib/origin.mjs`). On the home network, accounts still need no code.

Not used: cloudflared's `--allowed-mail` email check. In cloudflared 2026.10.0 its session ended about a minute after the email code, which bounced testers back to Cloudflare and then to a "Forbidden" page (tested October 6, 2026). Quick Tunnels are meant for testing and come with no uptime guarantee; for a permanent address, use your own domain with a named tunnel.

## Opening animation

When you open FutureSight in a new tab, Glint (the mascot, an original comet sprite drawn for this app) flies around the screen, does a twirl with a sparkle burst and settles into the logo at the top left. It plays once per tab, any click or key skips it, and it never plays when your system asks for reduced motion. Turn it off or replay it under **Settings → Opening animation**. The code is `public/intro.js`; the artwork is the `fs-glint` symbol in `public/index.html`, shared by the logo and the animation.

## What's included

- **Catalog**: 19,965 cards in 149 sets, 9,758 of them browsable cards (rare, holo rare, Pokémon ex/EX/GX/V/VMAX/VSTAR, LV.X, Prime, LEGEND, Gold Star, full art, secret rare, shiny, Prism Star, BREAK, Radiant Collection, Trainer/Galarian Gallery, Classic Collection, Scarlet & Violet and Mega Evolution energies and promos).
  - Wizards of the Coast: Base Set, Jungle, Fossil, Base Set 2, Team Rocket, Gym Heroes, Gym Challenge, Neo Genesis, Neo Discovery, Neo Revelation, Neo Destiny, Legendary Collection, Expedition, Aquapolis, Skyridge, Wizards Black Star Promos, Southern Islands and Best of Game. Includes H1–H32 holo subsets. English standard/unlimited prints; first editions, shadowless and alternate prints are excluded. Southern Islands’ native reverse holos remain part of that set.
  - EX Series: all 16 English expansions from EX Ruby & Sapphire through EX Power Keepers.
  - Diamond & Pearl through HGSS: all 7 Diamond & Pearl expansions, 4 Platinum expansions, 4 HeartGold & SoulSilver expansions, and Call of Legends.
  - XY Series: XY Base Set, Flashfire, Furious Fists, Phantom Forces, Primal Clash, Double Crisis, Roaring Skies, Ancient Origins, BREAKthrough, BREAKpoint, Fates Collide, Steam Siege, Generations (with RC1–RC32), Evolutions, and XY Black Star Promos.
  - Black & White Series: Black & White Base Set, Emerging Powers, Noble Victories, Next Destinies, Dark Explorers, Dragons Exalted, Dragon Vault, Boundaries Crossed, Plasma Storm, Plasma Freeze, Plasma Blast and Legendary Treasures (with RC1–RC25).
  - Sun & Moon Series: Sun & Moon, Guardians Rising, Burning Shadows, Shining Legends, Crimson Invasion, Ultra Prism, Forbidden Light, Celestial Storm, Dragon Majesty, Lost Thunder, Team Up, Detective Pikachu, Unbroken Bonds, Unified Minds, Hidden Fates (including SV1–SV94) and Cosmic Eclipse.
  - Sword & Shield Series: all twelve main expansions, Champion's Path, Shining Fates and its Shiny Vault, Crown Zenith and its Galarian Gallery, the four Trainer Galleries, SWSH Black Star Promos, Pokémon Futsal Collection, McDonald's 2021/2022, Celebrations and its Classic Collection, and Pokémon GO. Only exact-matched standard prints receive sales data; alternate printings are not mixed into the same score.
  - Scarlet & Violet Series: all released main and special expansions from Scarlet & Violet through White Flare, plus Black Star Promos and the energy cards.
  - Mega Evolution Series: released sets from Mega Evolution through Pitch Black, 30th Celebration and its Classic Collection, Black Star Promos, and the energy cards, as of October 6, 2026. Announced later promo releases and jumbo-only cards are excluded.
  - Reverse holos and alternate prints are not separate entries. A promo whose original printing carries a set stamp is represented by that original printing.
- **Browse**: a screener with era chips, set picker, min/max price for the grade in view, minimum activity score, minimum investment score and quick screens; search, raw / PSA 9 / PSA 10 views, sold medians, buy targets, an investment score per card, sales plots, 1Y/2Y/3Y trend projections, monthly price history and PSA population. The expand button in the card panel opens a **reading view** over most of the page (full screen on phones): larger type, a two-column layout (price, score, limits and scenarios on the left; bigger sales and history charts and up to 24 recent sales on the right), Raw NM / PSA 9 / PSA 10 tabs, previous/next card buttons (or ← →), and Esc or a click outside to close.
- **Top movers**: the 20 biggest percentage rises in sold price this week or month, listed separately for PSA 10, PSA 9 and raw near-mint. Era filters can include only the eras you want or exclude eras you do not collect. Lists are shorter when fewer cards have reliable evidence.
- **Potential investments**: up to 20 picks per grade, each showing which signals it met (steady uptrend, recovering from highs, cheap vs. similar cards) and its character's demand score. The same era filters recompute the screen within the selected catalog scope.
- **Watchlist**: star a card and grade; set your own maximum price.
- **Dex**: add cards you own with grade, quantity, price paid and date. See total value, cost basis, unrealized profit and loss, a value-vs-cost chart over time, and each card's own P/L chart.
- **Alerts**: with your own free eBay developer keys, the server checks newly listed Buy It Now and Best Offer listings for each watched card and alerts when price plus shipping is at or below your limit. Alerts appear in the app, as desktop notifications while the app is open, and optionally on your phone through [ntfy](https://ntfy.sh) or a Discord webhook. Without keys, the Alerts page still gives a ready-made eBay search for every watched card.
- **Settings**: choose Terminal (the default dark trading-terminal look), Light, or Soft contrast. The preference is stored in the browser and applied before the page paints.
- **Status bar**: the date of the sales data and a ticker of this week's confirmed top movers.

### Optional: error reporting (Sentry)

FutureSight can report crashes to your own free [Sentry](https://sentry.io) project. It is off unless you turn it on, and it needs no packages: errors are sent with a plain HTTPS request.

1. Create a Sentry project (platform: Node.js) and copy its DSN.
2. Copy `.env.example` to `.env` in this folder and paste the DSN after `SENTRY_DSN=`. The `.env` file is never committed.
3. Restart the app. To check it, run `Invoke-RestMethod -Method Post http://localhost:5173/api/report -ContentType application/json -Body '{"message":"FutureSight test"}'` in PowerShell (or the equivalent `curl`). It answers `sent: true` and the event appears in Sentry within a minute.

Only the error type, a trimmed message (links reduced to the site name) and stack frames (file names and line numbers, never folder paths) are sent. Settings, eBay keys, request bodies and your watchlist are never included. Repeats within a minute are skipped and at most 30 reports are sent per hour, so a crash loop cannot use up the free quota. For a hosted Worker, set `SENTRY_DSN` as a secret.

### Optional: performance checks (Lighthouse)

With Chrome installed, close FutureSight and run `npm run lighthouse` in this folder. It starts the app, audits the page three times, and writes reports to `.lighthouseci/`. Thresholds in `lighthouserc.json` warn rather than fail. This is the only step that downloads anything, and nothing is added to the app itself.

### Setting up listing alerts

1. Sign in at [developer.ebay.com](https://developer.ebay.com/my/keys), create an application keyset, and copy the **Production** App ID (Client ID) and Cert ID (Client Secret).
2. In FutureSight, open **Alerts**, paste both keys, choose how often to check, and turn on **Scan for new listings automatically**.
3. Optional: install the ntfy app, subscribe to a topic name only you know, and enter that topic; or paste a Discord webhook URL. Use **Send a test** to check it.

Alerts run while `node server.mjs` is running. Keys stay in your local database and are never sent back to the page.

## Japanese cards

- 120 Japanese sets from the Wizards era to Mega Evolution, 5,726 rare and promo cards (`data/japanese-catalogs.json`, generated by `tools/research/gen-japanese.mjs` from the TCGdex card database, MIT licence). Card ids start with `ja-`; each card has its Japanese name and an English name where one is known (cards known only by a Japanese name take the price guide's English product name once matched).
- 3,345 are linked to the English card with the same artwork (same illustrator, Pokémon, HP and attack costs/damage, and the same rarity class). The info screen's English / Japanese tabs swap between the two printings.
- **Prices.** A Japanese card is priced only from its own exact PriceCharting product, never from the English card. Refreshing a Japanese set (Refresh sales on the set, Update sales with Japanese selected, or Find prices on a card) reads that set's PriceCharting listing, matches every card by collector number and name (Pokédex number for the original Wizards sets and Neo; `#227/S-P` style numbers for promos), saves the matches in the `source_map` table with each product's raw / Grade 9 / PSA 10 guide prices, and then fetches full product pages for sale histories like English cards. A product row that is a variant (Master Ball, 1st Edition, stamped...) is never used for a standard card; a number shared by several products with the same name, or a name that disagrees, stays unmatched. A dry run on Oct 7, 2026 matched 5,019 of 5,726 cards (`tools/research/japanese-mapping-check.json`).
- **Sales and alerts.** Japanese sold listings must name the card and its number (fraction numerator and set total must both agree), and must not say English, Korean, Chinese or another language; lots, proxies, other graders, Master Ball and other variants are excluded. VS and web were printed only as 1st Edition; elsewhere 1st Edition copies are excluded. Listing alerts for Japanese cards search Japanese listings and require the word Japanese/JPN/JP in the title.
- **Japanese cards are only compared with other Japanese cards.** Top movers, Investments and investment scores are computed per language (`lang=en|ja`); the research rank is English-only by default (its weights were chosen on English data and did not pass a Japanese check; see "Research rank coverage and Japanese check" below).
- 79 Japanese sets (most of DP, Platinum, HGSS, BW, XY and early Sword & Shield) have no card list in TCGdex yet; they are listed in `tools/research/japanese-coverage.json`.
- **Names and images.** Japanese cards and sets are shown with English names by default. Cards whose checklist has only a Japanese name take the English name of their matched PriceCharting product (`nameEn`, baked by `tools/research/japanese-images.mjs`; 270 cards, mostly promos, still have only a Japanese name). Settings → **Japanese cards** adds the original Japanese card and set names to each card's details (saved in the browser). Images are TCGdex scans where TCGdex has them (1,631 cards; the path is case-sensitive, e.g. `ja/SV/SV2a/201`), otherwise the matched product's PriceCharting photo; cards with neither show a plain placeholder until their product is matched.
- **Matching in Pokédex-numbered sets.** The Wizards sets and Neo are listed on PriceCharting by Pokédex number, so a trainer is never matched there by its collector number alone (Devolution Spray #86 is not Seel #86). Matches made that way before `ja-map-2026.10.08` are removed, with their cached prices, when the server starts.

## Market data

The Wizards import captures **all 741 rare/promo entries**, with 44,348 accepted sales (43,814 reported eBay sales) checked October 6, 2026. The importer follows every page of each set listing and classifies every exposed sold row on each exactly matched product page. It saves the original sale titles, dates, amounts and links. The reproducible coverage report is `tools/research/vintage-coverage.json`; `vintage-audit.json` reports grade-level score/forecast eligibility and unmatched cards. Unmatched products receive no inferred price or score.

The Sword & Shield import adds 28 sets and 2,290 eligible cards. The October 6 audit found **2,285 captured product pages**, 134,238 accepted sales, and 70,913 reported eBay sales, with zero invalid accepted rows. Five cards still lack a saved exact product capture; `tools/research/modern-coverage-swsh.json` lists the unresolved or uncaptured matches. `modern-audit-swsh.json` records score coverage and chronological forecast holdouts. McDonald's 2021 tracks the non-holo printing; McDonald's 2022 tracks its six native holos and nine non-holos separately by card. Exact source and printing checks withhold unsupported prices and scores.

The Scarlet & Violet and Mega Evolution import adds 28 released English sets and subsets, 4,938 catalog cards, and 2,467 browsable entries. The October 6 audit found **2,463 exact product captures**, 210,668 accepted sales, and 143,259 reported eBay sales, with zero invalid accepted rows. Four cards remain unpriced: Paradise Resort SVP 045 has no verified standard-print product, and the exact Mega Zeraora ex, Mega Darkrai ex, and Mega Dragonite ex MEP 089–091 product pages have no readable public price or sale rows. `tools/research/modern-coverage-later.json` records source coverage, and `modern-audit-later.json` records score and forecast coverage. Scarlet & Violet rares follow their native foil printing; cards filed under other consoles and cards with shortened market names use verified, card-specific mappings. The audit reports scores for 1,432 PSA 10, 1,349 PSA 9, and 2,386 raw cards; grade-level trend projections are available for 205 PSA 10, 150 PSA 9, and 2 raw cards. These are historical screens and holdouts, not validated future investment returns.

**This is not all eBay sales history.** PriceCharting reports a limited snapshot of eBay and TCGPlayer sales; older or unreported sales can be absent. The ordinary eBay Browse API used for alerts supplies listings, not a complete sold archive. The UI and capture metadata explicitly state this limitation. Existing observations are retained on refresh, and duplicate listing IDs are merged.

Before the Wizards expansion, the snapshot contained 1,947 full PriceCharting captures and 132,454 classified sales. Every rare XY and Black & White card has a full capture; Sun & Moon has exact guide matches for 1,109 rare cards and full captures for the 172 highest-interest cards. For the newly added legacy eras, 1,317 of 1,425 eligible cards have exact product matches and guide prices, and the 10 highest-interest cards from each of the 32 sets have full pages: 160 EX captures with 11,023 classified sales and 160 Diamond & Pearl/Platinum/HGSS captures with 8,129 classified sales. Product URLs were matched against PriceCharting's own set listings (`data/source-urls.json`), including legacy letter and shiny subset numbering.

A sale is counted only when:

- the table it was listed under agrees with the grade in its title (a "Gem Mint 10" without a grader in the PSA 10 table is left out, and so is a PSA-titled sale filed as ungraded);
- the collector number and set total match the card;
- it is not a lot, bundle, proxy, foreign-language copy, reverse holo, cosmos holo, stamped, prerelease, league, staff or signed copy, and not graded by another company.

Every counted sale keeps its title, date, price and a link to the original listing. Captures live in `data/pricecharting/<set>.json`; earlier excerpt-based research (`data/sales-batches/`, `data/researched-sales.json`) is merged in only for sales older than what the full page still shows, so nothing is counted twice.

**Refresh** asks PriceCharting for the latest page from your computer and parses it the same way. If the source is unavailable or its layout changes, saved observations keep their original date. This is a snapshot plus on-demand refresh, not a licensed live feed.

## Recommendation method

A buy target needs at least 3 same-grade sales within 180 days, including one in the last 90 days. The narrowest 30-, 90- or 180-day window with 3 usable sales is used; prices below 40% or above 250% of that window's median are dropped as outliers. The target is 15% below the median. Raw targets use only sales explicitly described as near mint. Mixed-grader Grade 9 guides are shown for reference and never become a PSA 9 price. The 1Y/2Y/3Y figures use daily sold medians from the trailing year and require a confident current sold price, at least eight distinct sale dates spanning 180 days, a sale in the last 90 days, and a source check within 14 days. The last 30% of dates (at least three dates) are held out. A regression fitted only on earlier dates is anchored to their then-available sold median and compared with an unchanged-price baseline. Projections are withheld when average absolute percentage error exceeds 35%, is worse than that baseline, or annual dollar growth exceeds +150% / −80% of the current price. The displayed historical error does not validate the 1–3 year extrapolation; future accuracy remains unverified. Demand is a sales-activity proxy, the trend figures are simple projections rather than investment advice, and five-year scenarios remain illustrative assumptions.

## Top movers method

A move compares the median of matching sales in the last 7 days (week) or 30 days (month) of each card's sales data with the median of the 4 weeks or 2 months before. A card is listed only when:

- it was worth at least $25 at the start of the period;
- both periods have at least 3 matching sales on at least 2 different days, after the usual 40%–250% outlier rule;
- no more than a quarter of either period's sales were outliers, and the rest sit typically within 30% of their median;
- at least two thirds of the new sales are above the starting price;
- a rise of more than 150% has at least 5 sales in each period;
- the new median is within 40%–250% of the source's own current guide for that grade;
- the card's data was checked within the last 7 days.

Raw moves use near-mint sales only. Cards that fail a check are counted under the list as "left out as uncertain" rather than shown.

## Potential investments method

These are screens over past sales, not forecasts or advice. A card qualifies for a grade only when it has a confident sold price (the same evidence a buy target needs) of at least $25, its character is in the top quarter for collector demand it meets at least one signal.

- **Character demand** comes from sales only. For every card, each grade's reference price is compared with the median for its era and rarity category; a character's premium is the average across its cards, shrunk toward average when it appears on only a few. It is combined (65/35) with how often the character's fully captured cards sold in the last 6 months, then ranked against all characters. Tag Team cards use their most in-demand partner. Forms, owners and mechanics (including Dark, Light, Gym leaders, M, Primal, Alolan, Shining, EX, GX, BREAK, Prism Star) count as the same character.
- **Steady uptrend**: a log-price regression across at least 8 matching sales from the past year, spanning 6+ months and 3 or more quarters, rising 15%–150% a year with a t-statistic of at least 3 and typical scatter under 25%, and the last 90 days at least 10% above sales 6–12 months ago.
- **Recovering from highs**: the monthly guide is at least 40% below a high reached in the last five years (excluding the latest 3 months) and held for 3+ months, and sales in the last 45 days are at least 5% above the 90 days before, with most new sales above that level.
- **Cheap vs. similar cards**: the card sells for at most 65% of the median price of at least 4 same-set, same-rarity cards whose characters score at least 10 demand points lower. Promos are not compared.

At most 3 picks per character are shown. With the October 2026 snapshot, most picks are uptrends. Many XY-era prices are near their highs, so the recovery and cheapness signals rarely fire.

## Investment score method

Every rare card gets a 0–100 score per grade (`site/lib/score.mjs`), from the same sales, monthly guide history and catalog as the Investments tab. A score needs a confident sold price (the evidence a buy target needs) and sales data checked within the last 14 days relative to today (even when the entire dataset is old); otherwise it is left blank with the reason. Each part is scored 0–100 and blended. Weights are shown as raw / graded; PSA 9 and PSA 10 add a sixth part, grade scarcity:

- **Character demand (30% / 27%)**: the character's demand score from the Investments method.
- **Price momentum (25% / 22%)**: a log-price regression across at least 5 matching sales spanning 90+ days of the past year. Growth maps linearly from −60% (0) to +60% a year (100), and only counts in full when the trend's t-statistic is 3 or more. Rises above 150% a year are treated as too fast to trust (45).
- **Value (20% / 18%)**: the average of (a) price against the median of 4+ same-set, same-rarity cards of no more popular characters (65% of that median or less scores 100; 150% or more scores 20) and (b) distance below the highest monthly guide level held for 3+ months in the last five years (at the high scores 35; 50% or more below scores 100; a card still clearly falling earns 40% less).
- **Liquidity (15% / 13%)**: the activity score.
- **Price stability (10% / 8%)**: 100 minus the typical distance of recent sales from the median, scaled so a 40% spread scores 0.
- **Grade scarcity (PSA 9 and PSA 10 only, 12%)**: from the PSA population counts captured with each PriceCharting page. PSA 10 uses the share of PSA-graded copies that are PSA 10; PSA 9 uses the share that reached PSA 9 or better (so a card where most copies gem does not look like it has rare 9s). The share is ranked against cards of the same era with 30+ graded copies (falling back to all cards when an era has fewer than 20), because gem rates differ widely by era: on the current data the median PSA 10 rate is about 3% for Diamond & Pearl–HGSS and 41% for Sun & Moon. The lowest rate in the era scores 100, the highest 0. Cards with fewer than 30 PSA-graded copies, or no captured counts, count as 50.

A part that cannot be measured counts as 50 and is labeled. Cards under the $25 floor are capped at 59. Bands: 80+ Strong, 65–79 Good, 50–64 Fair, 35–49 Weak, under 35 Poor. `GET /api/scores` returns `{card_id: [psa10, psa9, raw]}`; `GET /api/market?id=` includes each grade's breakdown. Before the Wizards expansion, 462 PSA 10, 719 PSA 9 and 1,799 raw cards are scored, with medians near 60; grade scarcity is measured for 1,066 of the 1,181 scored graded card-grades.

## Research rank, evidence and price check (shadow mode)

A new investment system from the October 2026 research plan (`tools/research/investment-plan.md`) runs next to the investment score so both can be compared. It does not replace the score.

- **Research rank** (`lib/investment-features.mjs`): `100 × (0.75 × PR(V) + 0.25 × PR(M))` on the last 13 completed months, where V is the discount to the 13-month median and M the momentum from 12 months back to last month; PR is the tie-averaged percentile within the grade and month. Weights were chosen on 2022 data and frozen. It is an uncalibrated historical ranking, never a probability. Matching-sale months are used once a card has 13 of them and the pool has 50+ cards; otherwise the guide history, labelled honestly (raw = ungraded mixed condition, PSA 9 = Grade 9 PSA+BGS mixed). Mega Evolution and sets under 12 months old are not ranked.
- **Screener**: Browse can filter by **Min research rank**, sort by **Research rank** and use the **Research 70+** quick screen, exactly like the activity and investment scores (per grade; the list's score column switches to RES). Legacy mode hides all three.
- **Evidence status**: Supported / Limited / Insufficient / Not supported, with reasons. Supported needs a grade-matched basis, 8+ sale days in 180 (one in the last 30, across 6 of the last 12 months), fresh data and varied prices.
- **Price check** (`lib/investment-costs.mjs`, also served to the page): break-even and hurdle prices at today's sold median after editable fees, shipping and tax (default: 15% fees, $5 in, $5 out, no tax). Arithmetic on today's price, not a forecast.
- **Forecast**: a regularized 12-month model is trained offline (`tools/research/train-investment-model.mjs`) and stored in `data/investment-model.json`. It did not pass its promotion gate (an unchanged price forecast better on held-out data, one test vintage, cohort failures), so the app shows no forecast and no maximum buy price from it.
- **Switch** (`FUTURESIGHT_SCORE_MODEL` in `site/.env`): `shadow` (default), `legacy` (rollback: hides the research panel) or `candidate` (shows the forecast only if the artifact is promoted; otherwise behaves as shadow).
- **Logs**: every refresh is also appended to `market_observations`, `sales_observations`, `guide_observations` and `population_observations` (never updated; corrections are new rows; availability is the capture time, never backdated). Each day's research and heuristic scores are archived once to `score_observations` with a `model_runs` entry, so they can be checked against later prices. `lib/as-of.mjs` replays what was known at a date.

## Research rank coverage and Japanese check (October 7, 2026)

- **Coverage:** a card can only be ranked once its full product page (monthly price history) has been read. Full pages for every eligible English card that lacked one were captured and bundled into `data/pricecharting/` with `tools/research/bundle-captures.mjs <records.jsonl>`. The bundled data alone now ranks **7,569 of 9,758** eligible English cards (was 5,721). The rest fail a frozen rule: 1,320 are under the $25 floor at every grade, 669 are ME (excluded), the others have short or flat histories or no exact product. `tools/research/research-coverage.json` has the per-era counts.
- **Bundling is add-only.** Existing captures are the inputs of the frozen investment study, so they are never replaced unless `--replace` is passed. `backtest-investment.mjs` and `train-investment-model.mjs` load only the captures listed in `tools/research/investment-backtest-universe.json` (SHA-256 checked), so later captures cannot change the published figures.
- **Japanese check:** `tools/research/backtest-japanese.mjs <database.sqlite>` tests the frozen English weights, unchanged, on Japanese price history, with the pass criteria fixed beforehand in `investment-backtest-ja.config.json`. On October 7, 2026 (2,405 cards, 95 sets, 9 quarterly entry dates from 2023-06 to 2025-06) the top fifth beat the all-card basket by +1.50 pp over 12 months, but not when buying a month later (−0.12 pp) or on held-out sets (−0.15 pp), and the two latest entry dates and the SV era were strongly negative. **Not passed**, so Japanese ranks stay off. Results: `tools/research/investment-backtest-ja-results.json`.
- **Switch:** `FUTURESIGHT_JA_RESEARCH` in `.env`: `off` (default) or `shadow`. With `shadow`, Japanese cards get their own research table, ranked only against Japanese cards and archived under a separate model version (`…+ja`). English ranks are identical either way.
- **Importing collected data into another database:** `node tools/research/import-collected.mjs --from <collected.sqlite> --to <target.sqlite> [--dry-run]`. It merges market records with `mergeMarket` (newer capture wins, sales from both kept), copies the append-only observation logs and any missing Japanese product matches, and skips a card whose product or source page differs between the two. It does not touch accounts, watchlists, Dex, alerts or score archives. It refuses the beta folder, a file named `primal-watch.sqlite` (unless `--allow-main-db`) and a running server on `--port` (default 5180), and writes a backup next to the target first.

## Dex valuation

Each entry is valued at the current reference for its grade: the sold median when there are recent matching sales, otherwise the source guide, otherwise the latest monthly guide. Profit and loss compares that with the price paid. The value-over-time chart uses each card's monthly price history from its purchase month; PSA 9 history is PriceCharting's Grade 9 guide, which includes other graders. Fees, shipping and tax are not included.

## Keeping Top movers, Investments and scores current

Both lists and the investment scores are built from the sales saved in the local database. The server remembers each answer and rebuilds it as soon as any saved market record changes (or the day rolls over), and simultaneous requests share one computation. The page keeps a fetched list for 30 seconds, then asks again whenever the tab is opened or the era/period changes, swapping in a newer list without a spinner.

Each of the two tabs has two buttons:

- **Recalculate** re-reads the sales you have already saved and rebuilds the list, the scores and the status-bar ticker. It is instant and fetches nothing new.
- **Update sales** fetches the newest sold prices for every rare card in the included eras (four cards per request, with progress, and Cancel at any time; what was fetched is kept), then rebuilds everything. Cards whose full sales page was read in the last 6 hours are skipped, so running it again after a cancel or a dropped connection continues where it stopped; never-read cards go first (highest guide price first), then the oldest reads. A busy or timed-out page is retried twice on the server, a failed request three times in the page, and cards that still failed get one more pass at the end; the summary says how many were skipped or could not be read. Refreshing a single card, or a set from Browse, also clears the cached lists.

## Tests and build

```
node --test --test-isolation=none tests/*.test.mjs
node build.mjs
node --check dist/server/index.js
```

On older Node versions without `--test-isolation`, run `node --test tests/*.test.mjs`.

`/api/movers?period=week|month` and `/api/investments` compute over every card and are cached until saved market data changes or the day rolls over. Both accept a comma-separated era scope, for example `series=WOTC` or `series=WOTC,EX,DP`; unsupported or empty scopes return 400.

`node build.mjs` writes a Cloudflare Worker to `dist/server/index.js` that uses a D1 binding named `DB` (apply `db/schema.sql` first). With the full sales captures embedded, the bundle is about 70 MB, which is larger than Workers allow; hosting it would need the market data moved to D1 or KV. Scheduled alert scans run only in the local Node server.

Vintage printing exceptions are explicit in the catalog and the card detail: Base Set Machamp uses the shadowed 1st Edition deck print (shadowless and 1999–2000 are still excluded); Best of Game 1–7 use the non-Winner reverse foils, and 8–9 use Winner-stamped reverse foils. A generic printing exclusion must not remove a set's native finish. The word “of” in a set name is no longer misread as the PSA “OF” qualifier; explicit grade qualifiers remain excluded.

Language switching uses `data/language-pairs.json`, a reviewed registry of exact English/Japanese printing counterparts. Official expansion names and collector numbers may differ. Only reciprocal, one-to-one pairs enable the language tabs; unknown, ambiguous and unreviewed counterparts are disabled. Names, illustrators, HP/attacks and the earliest release are insufficient proof of matching artwork and printing. Candidate links remain in the Japanese catalog for research, but are never active counterparts.

Run `node tools/research/audit-language-links.mjs` from the repository root to check the entire catalog and regenerate `tools/research/language-links-audit.json`. Current coverage is deliberately limited to the three pre-existing known-pair regression fixtures; 3,342 formerly active heuristic links await artwork/expansion/rarity/finish review. This does **not** mean those cards have no other-language edition. Before adding a registry pair, compare both card scans/checklists (including alternate art, holo/stamp variants and promo/reprint origin), record the evidence, and run the audit and tests. The registry rejects duplicate endpoints and missing cards. Cross-language links live in the bundled catalog, not SQLite, so all databases receive the corrected behavior on server restart without changing prices or user collections.
