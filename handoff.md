# FutureSight — session handoff

*Formerly Primal Watch.*

Updated: October 6, 2026 (late) Pacific. Repository: `d-roads/pokemon`. The repository is authoritative.

## Sword & Shield and modern expansions — October 6, 2026

- Task 1 adds 28 released English Sword & Shield era sets and subsets, 3,712 cards, and 2,290 eligible rare/promo entries. The audit has 2,285 captured exact products, 134,238 accepted sale rows (70,913 labeled eBay), and zero invalid accepted rows. Five entries lack a saved product capture. Coverage and audit reports are `tools/research/modern-coverage-swsh.json` and `tools/research/modern-audit-swsh.json`. Public pages do not expose the complete eBay archive.
- Exact product identity, collector number, native printing, and sale grade are checked before a market observation is used. McDonald's 2022's six holo-only cards and nine non-holo cards are handled separately. Unmatched cards have no supported price or investment score. PSA 10/9 historical holdouts passed for 98/47 cards; those tests do not validate future returns.
- Task 2 was started manually after the 6:00 AM Pacific scheduled runner failed to start Codex. It adds 26 released English Scarlet & Violet and Mega Evolution sets/subsets through the 30th Celebration release, 4,765 cards, and 2,294 eligible browse entries. Of those, 2,293 have verified product captures: 200,969 accepted sale rows (137,069 labeled eBay), with zero invalid accepted rows. Paradise Resort SVP 045 lacks a standard-print market product; its Quarter Finalist stamped listing is deliberately excluded. Coverage and audit reports are `tools/research/modern-coverage-later.json` and `tools/research/modern-audit-later.json`.
- Scores pass the evidence gate for 1,359 PSA 10, 1,281 PSA 9, and 2,237 raw modern cards. Historical trend holdouts pass for 201, 148, and 2 respectively; these do not validate future returns. The expanded card information view is shared by WOTC, Sword & Shield, Scarlet & Violet, and Mega Evolution cards. All 120 Node tests pass, and the Worker builds at 188.6 MB uncompressed; hosted deployment may require a smaller data-loading design. The 6:00 AM failure log remains only as task history; do not rerun the scheduled job.
- Both branches are on GitHub: `codex/sword-shield-cards-sales` is based on `main`, and `codex/scarlet-violet-mega-cards-sales` is based on the Task 1 branch. Review them separately in that order. The GitHub integration returned HTTP 403 when asked to open a draft pull request, so no PR was created.




## Accounts and the sign-in landing page — October 6, 2026 (late)

- **Why:** the collector wants people on the home network to test the site, each with their own data.
- **Server (`site/lib/accounts.mjs`, `site/server.mjs`):** `accounts` and `sessions` tables live in the same SQLite file (created on start; existing tables untouched). Every `/api/*` call needs a signed-in session; the account's `user_key` is passed to the API as `LOCAL_USER_ID`, so the API code itself did not change. Routes: `POST /api/auth/signup`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`. `/` serves `login.html` until someone signs in; `/login` always shows it.
- **Rules:** usernames 3–20 of `A–Z a–z 0–9`, with `. - _` only between letters/numbers (no doubles), unique case-insensitively. Passwords 5–64 printable ASCII, no spaces and none of `< > " ' ` \ ; &`, repeated on sign-up. Same checks in `login.js` and on the server.
- **Security:** salted scrypt hashes, timing-safe compare (unknown usernames take as long as wrong passwords), 32-byte session tokens stored only as SHA-256, 30-day HttpOnly SameSite=Strict cookie, auth POSTs must carry this site's Origin, 8 failed sign-ins per device per 10 minutes, 6 new accounts per device per hour. Plain HTTP on the LAN, so no `Secure` flag.
- **Admin:** `FUTURESIGHT_ADMIN_PASSWORD` in `site/.env` creates `admin` once, with `user_key` `local-owner`, so it owns the watchlist (10), Dex (2) and alerts saved before accounts. The collector's `.env` has `FUTURESIGHT_ADMIN_PASSWORD=test1` (requested; weak, fine for a home test). The password is not in git.
- **Alerts:** the background scan now loops over every account with alerts turned on.
- **LAN:** `Start-FutureSight.ps1` sets `HOST=0.0.0.0` and prints the network address(es). Windows asks once to allow Node.js on private networks.
- **Landing page (`public/login.html`, `login.css`, `login.js`, `glint.svg`):** night-indigo card vault. Canvas background of drifting, flipping holo card silhouettes (front: little price chart; back: Glint's star gem), twinkling stars and occasional comets; the form is a holographic "Collector pass" card with a pointer-reactive foil edge and tilt, an art window where Glint rides a self-drawing price line, and a tape of real set names along the bottom. Bricolage Grotesque + Inter. Pauses when the tab is hidden; `prefers-reduced-motion` gets a still frame. Glint transparent copy is `glint.svg` (favicon minus its tile).
- **App:** account chip with the username and **Sign out** in the top bar; any `401 signedOut` sends the page back to `/login`.
- Tests: 130/130 (6 new in `tests/accounts.test.mjs`). Checked end to end with the collector's database copy: admin sees 10 watchlist entries and 2 Dex entries; a new account starts empty; duplicate (any case), bad characters, mismatched passwords and cross-site posts are refused.
- **Not done:** password change/reset and account deletion (an admin can only be reset by editing the database). The Cloudflare Worker build still uses its platform sign-in and does not include accounts.

## Charts, projections and card images — October 6, 2026 (evening)

- **Merged to `main`:** `codex/scarlet-violet-mega-cards-sales` (which contains `codex/sword-shield-cards-sales`) is merged as `ceb677d`. The only conflict was the page `<head>`; the PC folder's already-resolved `index.html` was used, and the PC's newer `server.mjs` (HOST setting) was kept. `main` now matches the PC folder plus the fixes below.
- **Why charts looked empty:** PriceCharting pages list only the most recent sold rows, so a busy modern card has about 3–10 weeks of sales (median raw near-mint span 85 days). The scatter plotted only the newest 35 sales (often a few days), and the projection needs 8 sale days over 6 months, so it almost never ran for modern cards (raw: 5 SWSH, 2 SV, 0 ME cards).
- **Scatter (`chart()` in `app.js`):** plots every matching sale from the past year (thinned evenly above 160) and draws the source's monthly price line (dashed, with a legend) behind it.
- **Projection (`trendProjection` in `lib/analysis.mjs`):** unchanged when sales alone qualify. Otherwise it tries `historyProjection`: the past ~13 months of the grade's monthly price history (needs 8 months over 6 months, updated in the last 75 days), log-linear fit, a chronological holdout that must beat an unchanged price, and the same extreme-trend guard. The growth rate is applied to the confident sold median, and the note says it came from the monthly history. Raw cards with a projection now: SWSH 734, SV 669, ME 111 (PSA 10: 391 / 493 / 58 including sales-based). Most remaining cards fail the holdout honestly; the panel says so and always shows the observed 12-month change in the source price.
- **Card images:** images.pokemontcg.io has no Ascended Heroes, Perfect Order, Chaos Rising, Pitch Black, 30th Celebration (or Classic Collection), MEE, SVP 102 or four Celebrations Classic Collection images, and it returns a 640×892 card back instead of an error. The TCGdex links for MEP, SVE and later SVP were empty too. 1,017 modern card images were repointed (TCGdex for the ME main sets with a Limitless `imageAlt`, Limitless for MEE/MEP/SVE/SVP/30th Classic Collection/Celebrations CC, PriceCharting product photos for SVP 190–192, 213–215, 225 and MEP 93) and every new URL was checked to load. EX Emerald Groudon 102 and Unown ? were also fixed (legacy cards may now carry an `image`). In the page, an image that errors or is the 640×892 placeholder switches to `imageAlt`, then fades to "image unavailable".
- Tests: 124/124 (2 new in `analysis.test.mjs`); Worker build passes at 192.0 MB. Headless Chromium check of ME/SV detail panels: no page errors.
- Restart the local server after copying (catalog JSON and API code changed).

## FutureSight rebrand and opening animation — October 6, 2026

- **The app is now called FutureSight** (formerly Primal Watch), since it covers far more than Primal Clash. Commit `d1a2968` on `main`. Page title, header, footer badge, server messages, alert sender name, User-Agent strings, READMEs, `package.json` and tests are renamed. `site/Start-Primal-Watch.ps1` is now `site/Start-FutureSight.ps1`; `Package-Latest.ps1` writes `futuresight-latest.zip`.
- **Kept on purpose:** the database file stays `site/data/primal-watch.sqlite`, so saved watchlists, Dex and alerts need no moving. The new theme key `futuresight-theme` falls back to the old `primal-watch-theme-v2`, so the chosen appearance carries over.
- **Mascot and logo:** the collector asked for shiny Celebi. That is a Pokémon Company character, so it was not drawn, nor a lookalike from the reference images. The collector chose to keep **Glint**, an original comet sprite (teal-to-indigo round body, gold star gem, crest, little arms, comet tail). It is one SVG `<symbol id="fs-glint">` at the top of `site/public/index.html`, shared by the header logo, the favicon (`site/public/favicon.svg`, a copy) and the animation. Wordmark: **future**sight in accent green + ink. Do not replace the mascot with a Pokémon character.
- **Opening animation** (`site/public/intro.js`, styles at the end of `style.css`): Glint flies in from the lower left on an arc-length-even spline loop around the screen (with a twinkle trail), stops in the middle, squashes, hops, spins with happy eyes and waving arms while about 50 star/dot sparkles burst out with a ring and glow, then the "futuresight / card terminal" title appears; it then swoops to the top left, shrinking into the logo, which gives a small bounce and twinkle. About 5 s in total.
  - Plays once per browser tab (sessionStorage `futuresight-intro-seen`). Any click, tap or key (except Tab) skips it. Never auto-plays with `prefers-reduced-motion`. Settings → **Opening animation** has an on/off switch (localStorage `futuresight-intro`) and **Replay now**.
  - The head script adds `html.intro-pending` before first paint, so the page doesn't flash first; a CSS fail-safe clears that cover after 5 s if `intro.js` never runs.
  - Performance: transform and opacity only, no blur (rule from the scroll fix still holds). Headless Chromium: median 16.7 ms frames during the animation at 1440×900 and 390×844, no page errors.
- Tests: 2 new in `tests/ui.test.mjs` (branding, wiring, reduced motion, fail-safe, no blur, Settings controls). 117/117 on `main`; Worker build passes.
- **PC folder:** the collector's local folder already holds Codex's Sword & Shield / Scarlet & Violet / Mega Evolution work (branches `codex/sword-shield-cards-sales` and `codex/scarlet-violet-mega-cards-sales`, not yet merged to `main`). The rebrand was three-way merged into the PC's copies of `index.html`, `app.js`, `provider.mjs`, `site/README.md`, `api.test.mjs` and `ui.test.mjs` (one conflict, the page `<head>`: kept the PC's newer description plus the rebrand lines), so that work was not overwritten. The other changed files were identical to `main` and were copied as is. The old `Start-Primal-Watch.ps1` is still in the PC folder and can be deleted. Restart the local server after copying.
- **When the Codex branches are merged into `main`:** expect small conflicts in the same places (page `<head>`, app.js strings such as "Primal Watch", tests, README). Keep the FutureSight names and the Codex content.
- Cards' sources link still points to PriceCharting's Primal Clash page by default; that is the set name, not the app name, and was left as is.

## Merge note (October 6, later)

- Two sessions worked in the collector's PC folder in parallel. Codex's Wizards-era work could not reach GitHub (its branch push got HTTP 403), while the grade-scarcity score, the reading view and the scroll fix were pushed to `main` (`dd7213c`, `39027f4`, `8336e66`).
- **Resolved:** Codex's patch (`primal-watch-vintage.patch`, one commit `549e3af`, authored by Codex) was applied on `dd7213c` and merged with those commits as **`c03932c` on `main`**. The only conflicts were `site/public/app.js` (the detail panel was restructured for the reading view, so Codex's vintage printing line, source-snapshot note and projection note were carried into the new sections) and this file. The PC folder and `main` now hold the same code.
- Checked on the merged repo: 115/115 tests, Worker build and syntax check pass; a browser check showed no page errors and 60 fps scrolling in the reading view. Secret scan before pushing found nothing; `site/data/primal-watch.sqlite*`, `.env`, zips and patches stay out of git.
- The scratch `primal-watch-latest.zip` and `primal-watch-vintage.patch` in the PC folder are no longer needed and are not tracked.

## Wizards expansion — October 6, 2026

- Added 18 pre-EX English sets (including early-2003 Aquapolis/Skyridge and contemporary promos). Total catalog: 11,315 cards, 93 sets, 5,001 browsable rares/promos.
- All 741 new eligible cards have exact source matches and captures: 44,348 accepted sales, 43,814 reported eBay sales. Set listings are paginated, captures resume per card, and every remaining gap/error is recorded in `tools/research/vintage-coverage.json` (none at completion). This remains a limited public-page snapshot, not a complete eBay archive.
- Vintage matching validates names/aliases, numbers, set totals and printings. Native Southern Islands/Best of Game reverse foils are supported; Best of Game Winner/non-Winner values stay separate. Machamp #8 explicitly uses the shadowed 1st Edition deck print. Other first editions/shadowless/reprints are excluded. Unknown source mappings fail closed.
- Scores now expire against today after 14 days; movers expire after 7 days even if all records are old. Stale records no longer influence demand peers. Vintage owner names and Dark/Light forms normalize to their underlying characters.
- Trend projections now require 8 sale dates across 180 days, recent sales and a confident current sold median. Daily-median regression must pass a chronological holdout (<=35% MAPE and no worse than unchanged prices). UI shows historical error and explicitly says the 1–3 year horizon is unverified. Missing prices, duplicate-only data, reversals and extreme slopes fail closed.
- `tools/research/vintage-audit.json` documents grade-specific score coverage, accepted historical-test errors and withholding reasons. All 44,348 saved vintage sales pass the identity/grade/date audit. Scores remain heuristic historical screens, not calibrated probabilities of profit.
- Fixed a pre-existing grade-parser issue: “of” in Best of Game / Call of Legends is no longer mistaken for PSA's OF qualifier. Explicit qualifiers remain excluded.
- Validation: 113/113 Node tests, API checks for the new catalog/market/era scopes, Worker build and syntax check. Browser runtime could not initialize, so visual browser QA is unverified.
- Work is committed locally on `codex/wizards-cards-sales-validation`. GitHub branch creation was rejected with HTTP 403 “Resource not accessible by integration”; no remote branch or PR was created. A patch and updated local-app ZIP are provided for handoff. Restart the local Node server after copying the updated source. Existing local SQLite data must be preserved and never committed.

## Product goals

1. Keep the UI smooth and readable. **New (Oct 5):** the look is now a dark trading terminal, based on the collector's BlockTrade reference screenshot.
2. Show defensible prices and buy targets from reported sales for raw near-mint, PSA 9, and PSA 10 cards. Never fabricate prices when evidence is missing.
3. Cover rare/chase cards from the EX era through Sun & Moon, including requested special sets.
4. Preserve the watchlist, buy limits, Dex, and listing alerts.
5. **New:** Show weekly and monthly top movers by percentage increase (top 20 each for PSA 10, PSA 9, and raw). Leave out any move the data can't confirm.
6. **New:** Offer a Potential investments tab built only from the app's sales data, weighted toward characters with real collector demand.
7. Let collectors include or exclude eras independently in Top movers and Investments.
8. Provide appearances through a dedicated Settings page: Terminal (default dark), Light, and Soft contrast.
9. **New:** An advanced filter system (screener) in Browse: era, set, min/max price, minimum activity score, minimum investment score. It replaces the old $250–$350 toggle.
10. **New:** An investment score out of 100 in each card's information section, also usable as a filter and a sort.
11. Commit each integration separately and leave an updated handoff after every session.
12. **Standard finish (collector's rule):** commit and push to git, copy the changed files into the collector's local folder (`C:\Users\b345t\.codex\.chatgpt-projects\g-p-6a72b895d6288191b4624c5f5479fcae\primal-watch`, via the desktop link; git is not installed there), and post the handoff to the claude.ai Project.

## Current state

- **Catalog:** 9,526 cards in 75 sets; 4,260 are browsable rare/chase cards (EX 687, Diamond & Pearl through HGSS 738, Black & White 553, XY 902, Sun & Moon 1,380).
- **Market data:** 1,947 full PriceCharting captures with 132,454 classified sales. Of 1,425 eligible legacy cards, 1,317 have exact guide matches and 320 have full captures. The snapshot was checked October 2, 2026.
- **Navigation:** a top bar (no sidebar) with Browse sets · Top movers · Investments · Watchlist · Dex · Alerts · Settings. A status bar at the bottom shows the sales-check date and a ticker of this week's confirmed movers.
- **Investment scores:** 462 PSA 10, 719 PSA 9 and 1,799 raw cards are scored on the current snapshot (medians about 59–60, range 27–89).
- Local user data lives in `site/data/primal-watch.sqlite` and is gitignored. It must never be committed because this is a public repository.

## Work completed this session (October 5)

### Investment score (`d498731`)

- New module `site/lib/score.mjs`. Each card gets a 0–100 score per grade, from the app's sales only, reusing `marketContext` and the signals in `invest.mjs`.
- Parts and weights: character demand 30%, price momentum 25% (trailing-year log regression, full credit only when t ≥ 3; >150%/yr counts as overheated), value 20% (vs. same-set, same-rarity cards of no more popular characters, plus distance below a held multi-year high, with a penalty if still falling), liquidity 15% (activity score), stability 10%.
- Fail-closed: no score without a confident sold price and up-to-date data; the reason is shown instead. Cards under $25 are capped at 59. Unmeasurable parts count as 50 and are labeled "Not measured".
- Bands: 80+ Strong, 65–79 Good, 50–64 Fair, 35–49 Weak, <35 Poor.
- API: `GET /api/scores` (compact `{id:[psa10,psa9,raw]}`), and `/api/market?id=` now includes `score` with the breakdown. Memoised with the same cache as movers/investments; the first computation is about 1 s.

### Advanced filters and score UI (`cc7fdca`)

- The `$250–$350` checkbox is gone. A **Screener** panel above the card list has era chips (EX, DP–HGSS, BW, XY, SM; multi-select, the last era can't be removed), the set picker, min/max price for the grade in view, a minimum activity score slider, a minimum investment score slider, and quick screens (Score 80+, Score 65+, Liquid, Under $100, $100–$500, $500+). Active filters show as removable chips above the list; "Clear filters" resets everything.
- The "Demand estimate" metric is renamed **Activity score**, matching the filter (same calculation).
- Each list row has an **INV** score pill; the detail panel has an **Investment score** box with rating, meter, the five parts with their evidence, any Investments signals met, and "not a forecast" wording. Sort now includes "Investment score". Investments picks also show their score.
- On phones the screener collapses behind a **Filters** button with a count badge.
- Refresh sales with a partial era selection refreshes each selected era in turn.

### Terminal design (`f665231`)

- `site/public/style.css` was rewritten from scratch around colour tokens: near-black panels, neon-green accents and primary buttons, red for losses, JetBrains Mono for figures, Inter for text (both from Google Fonts). Charts now use the theme tokens.
- Light and Soft contrast are redefined on the same tokens. The theme key changed to `primal-watch-theme-v2`, so everyone sees the Terminal look once; Light and Soft are still in Settings.
- The desktop fixed-height layout and per-view scrolling rules were carried over unchanged in behaviour.

### Fix: "Scores could not be loaded", and Movers/Investments never refreshing

- **Cause of the score error (collector's PC):** `server.mjs` loads `lib/*.mjs` once at startup but serves `public/` fresh on every request. Copying the new files over a server that was left running gave the new page with the old API, so `/api/scores` returned 404 ("Not found."). The code itself was verified against the collector's real database (537 refreshed cards): `/api/scores`, `/api/movers` and `/api/investments` all return 200 with the new code, and the 404 reproduces with the old code.
- **What the page now does:** `request()` keeps the HTTP status. A 404 shows "Primal Watch is running older server code than this page. Close the Primal Watch window and start it again (node server.mjs)" in the card, the empty-filter message and the top banner. Other failures show the real reason and retry once after 4 s. The card has a **Try again** button that clears the banner when it succeeds.
- **The collector must close and restart the server once** to pick up the new API. This is the only step needed for the score error.
- **Why Movers/Investments looked frozen:** the page cached each list for the whole visit and never discarded it, and nothing told the user when sales changed. Now: lists are reused for 30 s then revalidated in the background (stale-while-revalidate, a failed refresh keeps the old list); saving a refreshed card, a set refresh or an Update sales run discards the caches; both tabs have **Recalculate** (instant rebuild from saved sales, plus scores and ticker) and **Update sales** (era-aware batch fetch with progress and Cancel).
- **Server:** the `insight()` memo in `lib/api.mjs` now shares in-flight work between simultaneous requests, drops stale entries for the same key and is not poisoned by a failed computation. It is keyed by the market-cache count and newest `fetched_at`, so a price saved by the refresh button changes the next answer without a restart (regression test added).
- Tests: UI (404 message and retry, 30 s expiry, background replace, failed refresh keeps the list, Recalculate, Update sales batches) and API (saved price changes movers/investments/scores). Harness `workspace()` now exposes `responses` and `calls` and accepts function and error responses.

### Production polish (October 6, branch `feat/production-polish`)

Goal was to add Sharp, Framer Motion, Lighthouse CI, Sentry, RemixIcon and Zod. The app is a dependency-free Cloudflare Worker (`build.mjs` concatenates `lib/*.mjs` and strips imports), and the sandbox could not reach the npm registry, so each tool was replaced by a dependency-free equivalent instead of being installed:

- **Validation (instead of Zod):** `lib/schema.mjs` (`shapeError` with `oneOf`, `optionalPrice`, text bounds). Used for the watchlist and report endpoints. `input()` now rejects `null`, arrays and other non-object JSON with 400; before, those threw and returned 503.
- **Error reporting (instead of the Sentry SDK):** `lib/report.mjs` posts Sentry envelopes with `fetch`. Enabled by `SENTRY_DSN` (local `site/.env`, gitignored; Worker secret when hosted). Hooks: API 503 path, server errors and uncaught exceptions, the alert scan, and a browser `error`/`unhandledrejection` listener that posts to `POST /api/report` so the DSN stays on the server. Scrubbed, deduplicated and capped at 30 per hour. **Live delivery to Sentry is unverified**: the sandbox proxy blocks Sentry. Check on the collector's machine (README).
- **Icons (instead of RemixIcon):** an inline 13-icon sprite at the top of `index.html` plus an `icon()` helper in `app.js`. The icons are simple line icons drawn for this project, **not** RemixIcon (GitHub was blocked). Any `<symbol>` can be replaced with real RemixIcon paths.
- **Motion (instead of Framer Motion, a React library):** CSS only: views fade up, dialogs scale in, button press feedback. The existing `prefers-reduced-motion` rule disables all of it. The detail panel is deliberately not animated because it re-renders often.
- **Lighthouse:** `site/lighthouserc.json` and `npm run lighthouse` (run on the collector's machine; warn-only thresholds).
- **Sharp dropped:** it is a native Node library that cannot run in a Worker, and card images are remote, so there is nothing local to optimize.
- Verified: `node --test tests/*.test.mjs` 100/100 on Node 22.22 (10 new in `tests/report.test.mjs`); `node build.mjs` still 52.5 MB; headless Chromium showed no page errors, working icons at 1440 and 390 px, and a browser crash reaching `/api/report`.

### Grade scarcity in the PSA 9 / PSA 10 score (`dd7213c`)

- Collector's request: a card with a low share of PSA 10s (or 9s) is a better buy. Added a sixth score part, **Grade scarcity**, for PSA 9 and PSA 10 only. Raw scores are unchanged.
- Source: the PSA population counts already captured with every PriceCharting page (`market.pop.psa`, index 9 = PSA 10, 8 = PSA 9). 1,755 of 1,947 captures have them. `mergeMarket` now keeps `pop` if a newer record lacks it.
- PSA 10 uses PSA 10s ÷ all PSA-graded; PSA 9 uses (PSA 9 + PSA 10) ÷ all PSA-graded, so a card where most copies gem doesn't look like it has rare 9s.
- Ranked as a percentile **within the card's era** (lowest rate = 100), because gem rates differ hugely by era: median PSA 10 rate DP–HGSS 3%, EX 6%, BW 7%, XY 12%, SM 41%. Needs 30+ graded copies and 20+ era peers (else all cards); otherwise counts as 50 and is labeled.
- Weights for graded scores: demand 27, momentum 22, value 18, liquidity 13, stability 8, scarcity 12 (`SCORE_RULES.gradedWeights`). Raw keeps the old weights.
- Measured for 1,066 of 1,181 scored graded card-grades. Score counts unchanged (462 PSA 10, 719 PSA 9); medians 57 / 60.
- Method text updated in README and the in-app dialog. Tests: 101/101 (new scarcity unit test).
- Restart the local server after copying (it loads `lib/` at startup).

### Expanded card reading view (October 6)

- Collector's request: expand the card info section to cover most of the page with a clean, readable layout.
- An **expand** icon in the card panel header (next to the grade) opens the same panel as a reading view: fixed over the page (inset ~3–4% on desktop, max 1440 px wide; full screen under 790 px) with a blurred backdrop.
- Layout: sticky top bar (card name, Raw NM / PSA 9 / PSA 10 tabs, "n of N", previous/next, close); hero row (large image and name | buy target, metrics, actions); then two columns: investment score, buy limit, sales coverage, five-year scenarios | wider sales chart (640×220), price history (720×230) and up to 24 recent sales (instead of 8). Larger type throughout.
- Esc, the close button or a click on the backdrop closes it and returns focus to the expand button; ← / → step through the filtered list; leaving Browse/Watchlist closes it. The rest of the page is `inert` while open.
- `renderDetail` now builds named sections and composes them in the normal order or the reading-view layout, so both stay in sync. `chart()` and `historyChart()` take a `wide` flag.
- Verified in headless Chromium at 1440×900, 1280×800 (Light) and 390×844: no page errors. New UI test; 102/102 passing.
- Noticed while testing: the "Simple trend projection" showed $0.00 for 1Y–3Y on Wailord EX PSA 9 (one outlier sale dragged the straight-line slope to −$300/yr). The Wizards session's projection rework fixes this: that card now says the trend did not pass the held-out sales check. Confirmed in the combined build.

### Scrolling performance fix (October 6)

- Collector reported low-fps scrolling. Measured in headless Chromium (software rendering, 120 wheel-style scroll steps, rAF frame times): card list and normal detail panel were 60 fps, but the **reading view ran at about 20 fps** and the **method dialog at about 22 fps**.
- Cause: the full-viewport `backdrop-filter: blur()` behind scrolling overlays (`.detail-backdrop`, `dialog::backdrop`), which is re-blurred every frame. Removing it alone restored 60 fps; pausing animations, removing the big shadow, or removing the sticky bar blur did not matter on their own.
- Fix: no `backdrop-filter` anywhere in `site/public/style.css`; overlays use a slightly darker solid dim instead (`#000000c4` reading view, `#000000bd` dialogs), and the reading-view top bar is 97% opaque. A unit test fails if `backdrop-filter` returns. 103/103 tests passing.
- Rule for future UI work: do not put blur effects behind anything that scrolls.

## Earlier sessions (summary)

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

- `node --test tests/*.test.mjs`: **90/90 passing** on Node 22.22 (this sandbox has no Node 24, so `--test-isolation=none` was not used; the standard Node 24 command is unchanged). New: `tests/score.test.mjs` (momentum, held highs, rating bands, real-data invariants: bounded, explained, $25 cap, compact table matches breakdown), an API test for `/api/scores` and the market breakdown, and UI tests for every filter, the era chips, sorting, removal of the old toggle, and the detail score box.
- `node build.mjs` and `node --check dist/server/index.js`: pass (52.5 MB Worker; `score` added to the bundled modules).
- Headless Chromium (1440×900 and 390×844) screenshots of Browse (unfiltered, filtered, score breakdown), Top movers, Investments, Dex, Alerts, Settings, the Light theme, the method dialog, and the phone filter drawer: no page errors. Card images and Google Fonts were blocked in the sandbox, so screenshots show placeholders and system fonts; on the collector's machine both load.

## Pending and known limits

1. **eBay API keys are still pending from the collector.** Do not block other work on them. Once available, configure them locally (never in git), run an alert scan, and verify one real Browse API response and notification path.
2. **Close and restart the local app** to load the new API code (`cd site`, then `node server.mjs` with Node 24+). Until then the page reports "older server code". Always restart after copying files; the server loads `lib/` only at startup.
3. Movers and investments are only as fresh as the sales data. After about a week without **Refresh sales**, the weekly lists empty out by design. A refreshed card is measured to its own new check date; cards more than 7 days (movers) or 14 days (investments) behind the newest check are excluded.
4. PSA 9 monthly highs (the Recovering signal) use PriceCharting's Grade 9 guide, which mixes graders. This is labeled in the UI.
5. The Cheap and Recovering signals rarely fire on the current snapshot because many XY-era cards are near their highs. That is expected, not a bug. The thresholds are the `INVEST_RULES` constants if the collector wants them looser.
6. Character demand is relative within the selected five-era catalog. Trainer and item names count as their own "characters" and rarely reach the cut.
7. The remaining 271 Sun & Moon rares and 108 legacy rares lack exact PriceCharting matches. Only 172 Sun & Moon and 320 legacy cards have full captures, so cards without full sales histories contribute less to movers, investments and demand scores.
8. Alerts run only while `server.mjs` is running and alert once per listing.
9. The 52.5 MB Worker bundle is too large for a typical Cloudflare deployment; hosted use needs market data in D1/KV.
10. Trend projections, movers, investment signals and investment scores describe past sales. They must not be presented as forecasts or investment advice.
11. Filters are not remembered between visits; they reset on reload. Saving them in the browser is a small follow-up if wanted.

## Suggested next session

1. Ask whether the 12% grade-scarcity weight feels right, and whether very low-pop cards (under 30 graded) should get a bonus instead of counting as average.
1. Ask the collector how the terminal look, the screener layout and the score weights feel with real images. Tune `SCORE_RULES` in `site/lib/score.mjs` if wanted (weights, $25 cap, momentum cap).
2. Check the redesign on the collector's own desktop and phone with real card images and fonts (sandbox screenshots used placeholders).
3. Review the 108 unmatched legacy PriceCharting products manually and add only exact matches. Expand full captures beyond 10 per legacy set if broader investment coverage is wanted.
4. Ask whether the $25 floor, top-quarter demand cut, 3-per-character cap, and compact era labels feel right across the much larger catalog.
5. Consider "watch" and "add to Dex" buttons directly on mover and investment rows, plus a "falling" movers list if wanted.
6. Expand Sun & Moon full captures (`tools/research/capture-new-sets.mjs`) so demand scores and movers cover more SM cards.
7. When the eBay keys arrive, perform a real alert integration test and document the result without exposing secrets.

## Commits this session

- `d498731` — Add a 0–100 investment score for every card and grade
- `cc7fdca` — Replace the $250–$350 toggle with an advanced screener
- `f665231` — Restyle Primal Watch as a trading terminal
- `dd7213c` — Add PSA grade scarcity to the PSA 9 and PSA 10 investment score
- `39027f4` — Expand card details into a full-page reading view
- `8336e66` — Fix low-fps scrolling by removing backdrop blur from overlays
- `549e3af` — Codex: Add Wizards-era cards, full rare-card captures, and evidence checks
- `c03932c` — Merge the Wizards work with the reading view and scroll fix
- Final commit — this handoff update

Previous session: `70d7339` (EX through HGSS catalog), `49f7d73` (appearance settings and era-scoped market screens).
