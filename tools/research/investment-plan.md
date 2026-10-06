# Investment scoring research and implementation plan

Prepared October 6, 2026 (America/Los_Angeles). Repository: `d-roads/pokemon` / FutureSight. **Planning only: no application changes, data refreshes, database writes, commits, pushes, or deployments.** Research ran against an isolated copy of GitHub `main` at `7bfafb3b277eb7a39ac498e2ba760ffa7e9f8d29`. The existing local `pokemon` checkout was at `d279a2e824f5d1f5086666edfb8b0c31e20678e8`; it was not updated.

## 1. Decision

Do not replace the production score yet. The research identifies a simple, reproducible candidate worth validating:

**Research score = 100 × (0.75 × historical-value percentile + 0.25 × momentum percentile).**

The weights were selected on earlier data, not by picking the best result in the later evaluation period. This candidate delivered **+5.13 percentage points** over the equal-weight guide-price baseline across 18 later date/grade baskets, or **+3.02 points** after delaying entry by one month. It did **not** work universally: Grade 9, Sword & Shield, Scarlet & Violet, Primal Clash, Evolving Skies, and the aggregate 2025 entry period expose failures. The 2022 selection period itself lost money after assumed costs. Therefore this is a candidate ranking signal, not a validated profit forecast or a universal optimum.

The proposed new system combines (1) this transparent challenger, (2) exact-printing and evidence checks, (3) an explicit acquisition price and net-return calculation, and (4) a chronological validation gate. It must be able to say “insufficient evidence” and “no attractive purchase at this price.” A card can be desirable while still being a bad investment at the asking price.

We cannot establish the universally optimal formula from this archive. We can identify a candidate, document its failures, and specify a reproducible process for deciding whether it deserves production use. No claim that it beats the existing production score on a comparable, unbiased sample is supported.

## 2. Current implementation audit

Authoritative files at the reviewed revision:

- [`site/lib/score.mjs`](https://github.com/d-roads/pokemon/blob/7bfafb3b277eb7a39ac498e2ba760ffa7e9f8d29/site/lib/score.mjs): weights, score components, score eligibility and ratings.
- [`site/lib/invest.mjs`](https://github.com/d-roads/pokemon/blob/7bfafb3b277eb7a39ac498e2ba760ffa7e9f8d29/site/lib/invest.mjs): character demand, market context, investment signals and shortlist.
- [`site/lib/analysis.mjs`](https://github.com/d-roads/pokemon/blob/7bfafb3b277eb7a39ac498e2ba760ffa7e9f8d29/site/lib/analysis.mjs): matching-sale medians, activity, outliers and trend projections.
- [`site/lib/capture.mjs`](https://github.com/d-roads/pokemon/blob/7bfafb3b277eb7a39ac498e2ba760ffa7e9f8d29/site/lib/capture.mjs), `sales.mjs`, `api.mjs`, `payload.mjs`, `site/data/market.mjs`, and `site/public/app.js`: source classification, loading, API caching and display.
- `tools/research/audit-vintage.mjs` and `audit-modern.mjs`: existing forecast holdouts. Their own comments distinguish short forecast checks from long-term investment validation.

### Existing formula

Each component is mapped to 0–100; the weighted total is rounded.

| Component | Raw weight | PSA 9 / PSA 10 weight |
|---|---:|---:|
| Character demand | 30% | 27% |
| Momentum | 25% | 22% |
| Value | 20% | 18% |
| Liquidity/activity | 15% | 13% |
| Stability | 10% | 8% |
| Grade scarcity | — | 12% |

The price must have at least three matching sales in 180 days, including a sale within 90 days; the source check must be within 14 days. The median uses the shortest qualifying 30/90/180-day window, after excluding prices outside 0.4–2.5 times its sample median. Raw comparisons require NM condition. Prices below $25 cap the score at 59. Rating cutoffs are 80/65/50/35 for Strong/Good/Fair/Weak.

Demand measures character price premiums relative to rarity/era peers and captured activity. Momentum uses a trailing-year log-price slope and its regression t-statistic. Value blends a same-set peer comparison and discount to a held historical high. Liquidity rewards recent observed sale counts; stability rewards low median absolute price dispersion. Scarcity ranks the PSA 10 share, or PSA 9-or-better share, within an era where sufficiently populated. Missing components commonly receive 50.

### What to retain

- Exact card identity and printing checks; separate raw NM, PSA 9 and PSA 10.
- Explicit missing scores and recent-sales requirements.
- Explainable evidence, source links and stable deterministic calculations.
- Restrictions on implausible trends and promotion of stale data.

### What the new system must address

1. **No defined investment outcome.** The score is not trained against a holding period, expected return, probability of profit or downside. Its rating thresholds are manual.
2. **Acquisition price and costs are absent.** Price floor and popularity do not establish positive net returns. A blanket 15% buy discount from a median is not a profitability test.
3. **Demand is not independent of price.** An expensive character gets a high demand score, and own-card premiums enter the character aggregate. A leave-one-card-out calculation is required before treating demand as independent evidence. The comment about shrinkage does not make this leave-one-out.
4. **Scarcity measures grading difficulty, not investable supply.** A low gem rate can coexist with many PSA 10 copies or weak demand. Historical absolute population, population growth and turnover are more relevant candidates, but none should receive a positive weight without validation.
5. **Observed sale counts are censored.** Limited source-page histories can truncate high-volume cards more severely than quiet cards. The source's “full” capture status means the available page was captured, not that all market transactions were observed. Activity cannot be interpreted as complete trading volume or sell-through.
6. **Three sales can create apparent stability.** Repeated or smoothed guide values likewise do not establish liquidity. Missing evidence deserves an uncertainty flag, not an automatic average investment rating.
7. **Historical peaks are not fair value.** A discount from a speculative peak may be justified. Peer comparisons also miss artwork, finish, distribution, reprints and supply differences.
8. **Historical replay is unsafe without an explicit as-of layer.** `heldHigh`, recovering history, population comparisons and guide fallbacks must receive date-truncated, historically available inputs. Passing an old `now` to `investmentScores` alone does not reconstruct the past. A current snapshot cannot be marked historically available by changing its check date.
9. **Trend t-statistics are not profit confidence.** Repeated sale days and serial dependence undermine the simple independent-error interpretation. The existing price projection holdout does not validate the investment rank or its 1–3-year extrapolations.
10. **Scope is narrower than “most Pokémon cards.”** The catalog's eligible rare/promo subset and available English printing coverage cannot establish performance for commons, every language, sealed products, other grades or new releases.

## 3. Data actually examined

The pinned repository contains 19,965 catalog cards across 149 sets, of which 9,758 are eligible. Eligible-card snapshots expose 521,705 classified sale rows and 22,001 nonempty card/grade guide series. Excluding October 2026, those guide series contain 1,039,621 positive monthly observations. These are inventory counts, not independent statistical samples.

Monthly history starts in late 2020 / early 2021. A vintage card's 1999 release date does not give us 1999 prices. The usable feature sample covers 70,084 repeated card/grade/date observations, 5,202 unique cards and 131 sets across WOTC, EX, DP, BW, XY, SM, SWSH and SV. The later evaluation contains 35,535 observations and 4,917 unique cards across 131 sets. Of those sets, 74 have enough candidates for at least one separate set/grade/date basket of 20 cards. Mega Evolution lacks the required completed feature-plus-outcome history and is not validated.

### Material provenance limits

- All monthly histories were downloaded in 2026. They are reconstructed historical series, not archived editions proven available to an investor on each old date. Later corrections and retrospective smoothing cannot be ruled out.
- The current catalog and source mappings introduce coverage/survivorship bias. Historical uncaptured cards are not represented merely because the backtest has many rows.
- PriceCharting's raw series is ungraded, not NM-only. Its Grade 9 series combines PSA and BGS; PSA 10 is explicitly PSA. Treat these as three separate guide datasets, not interchangeable representations of the application's three sale cohorts. [Provider methodology](https://www.pricecharting.com/page/methodology).
- Guides are derived using proprietary price aggregation. They exclude shipping and other transaction costs. Historical guide changes are not guaranteed executable sale proceeds. [Provider methodology](https://www.pricecharting.com/page/methodology).
- No complete historical order book, unsold listings, sell-through, reprint announcements, grade-population time series or original availability timestamps were found. No synthetic population history was introduced.
- Public saved sale pages are bounded excerpts. See the repository's [research tooling documentation](https://github.com/d-roads/pokemon/blob/7bfafb3b277eb7a39ac498e2ba760ffa7e9f8d29/tools/research/README.md).

## 4. Backtest protocol that was executed

### Universe, timing and targets

1. Use the pinned catalog's eligible cards and exact saved guide series; never manufacture prices from release dates.
2. Quarterly feature dates: March 2022 through June 2025. Each row requires all 13 consecutive monthly prices ending at the feature date, at least six distinct values, price at least $25, and a set release at least 12 months earlier. This last gate is set-level, so it does not prove the individual age of a later-added promo; production needs per-card availability.
3. Compute ranks across eligible cards in the same guide grade and date, including candidates whose future exit price is absent. Never condition the feature universe on future winners.
4. Rank each basket, select the top 20% (round upward), and compare equal-notional average returns with all eligible cards in that basket. These are idealized fractional/notional baskets; physical integer-card portfolio feasibility remains untested.
5. Primary holding period: 12 months. Also examine 6 and 24 months where mature. Future endpoints after August 2026 are not evaluated. No October partial-month endpoints enter the experiment.
6. Costs are an explicit scenario: 15% sale-side haircut, $5 acquisition shipping and $5 exit costs. For entry guide `P` and exit guide `E`, simulated return is `(0.85 E − 5)/(P + 5) − 1`. This is not a claim about the historical fees actually paid. Other fee rates and execution stresses are reported below. Published marketplace fees vary by category/account and may apply to more than item price; production must use an effective-dated fee adapter. [eBay selling fees](https://www.ebay.com/help/selling/fees/fees-sellers?id=4822).
7. Missing mature exit prices receive a conservative −100% mark, rather than dropping selected positions. There are 18 such 12-month observations in the later sample. This stress convention is not a claim that those cards became worthless.
8. Deterministic set holdout: unsigned rolling string hash `h = (31h + characterCode) mod 2^32`; sets with `h mod 5 = 0` never contribute outcomes to weight selection. Twenty-seven such sets appear in the later evaluation. Their contemporaneous features can enter percentile reference distributions; outcomes cannot.

### Features and exact candidate formula

Let `P[i,g,t]` be the guide price in dollars for card `i`, guide grade `g`, completed month `t`.

```text
V(i,g,t) = ln(median(P[t−12], …, P[t]) / P[t])
M(i,g,t) = ln(P[t−1] / P[t−12])
Q(i,g,t) = − population_stddev(ln(P[u] / P[u−1]), u=t−11,…,t)

PR(x) = average zero-based sorted rank of x / (N−1), with ties averaged
S(i,g,t) = 100 × [0.75 PR(V) + 0.25 PR(M)]
```

`V` is a discount to a trailing median, not a claimed intrinsic value. `M` skips the newest month; it measures the eleven monthly steps from t−12 to t−1, not an annualized forecast. The selection experiment considered momentum, value, low volatility, equal-weight mixtures, and all three-feature mixtures in 25-percentage-point increments: **16 distinct weight vectors, represented by 22 labels including duplicates**. `Q` was tested but received zero weight in the selected formula. Do not add the original demand/scarcity bonuses to this formula without another evaluation.

Select weights using non-held-out sets at 2022 entry dates, whose 12-month labels mature by December 2023. Objective: `mean(basket excess net return) − 0.5 × population_stddev(basket excess net return)`, with equal weight per date/grade basket. This chose `(M,V,Q)=(0.25,0.75,0)`. Freeze this choice for March 2024–June 2025 evaluation. As a secondary rolling check, refit for 2025 using entry dates through December 2023, whose labels finish by December 2024; it chose the same weights. No 2024-entry future returns enter the January 2025 refit.

This was an exploratory analysis, not a preregistered trial. An initial complete-cohort-only missing-data diagnostic produced a different preferred blend; the final protocol retains missing mature exits using the conservative convention above. That sensitivity is another reason not to claim optimality. The final script and results below are the authoritative reported experiment.

### How to interpret the results

All percentages below are **simulated guide-price returns after assumed costs**, averaged across date/grade baskets. “Difference” is percentage-point excess over the same basket's all-card baseline. They are not CAGR, realized portfolio returns, independently repeated bets, or forecasted future returns. Quarterly 12-month holdings overlap and can contain the same cards. The very large rising-market returns in older eras should not be interpreted as an enduring strategy advantage.

## 5. Results

### Candidate comparison on later dates

| Experiment / segment | Baskets | Candidate net guide return | Equal-weight baseline | Difference (pp) |
|---|---:|---:|---:|---:|
| Momentum only | 18 | +29.49% | +30.56% | -1.07 |
| Value only | 18 | +35.97% | +30.56% | +5.41 |
| Low volatility only | 18 | +24.50% | +30.56% | -6.07 |
| Equal thirds | 18 | +29.02% | +30.56% | -1.54 |
| 50% momentum / 50% value | 18 | +35.10% | +30.56% | +4.53 |
| 50% momentum / 50% low volatility | 18 | +37.09% | +30.56% | +6.53 |
| 50% value / 50% low volatility | 18 | +26.34% | +30.56% | -4.22 |
| Training-selected 25% momentum / 75% value | 18 | +35.69% | +30.56% | +5.13 |

The 50/50 momentum/low-volatility alternative has the best later aggregate result among these displayed comparators, but choosing it because of that result would use the test period for model selection. The training-selected 25/75 blend remains the primary candidate. The simple value-only baseline is also competitive and must remain a challenger.

### Years, grades and unseen sets

| Experiment / segment | Baskets | Candidate net guide return | Equal-weight baseline | Difference (pp) |
|---|---:|---:|---:|---:|
| 2024 entry dates | 12 | +29.65% | +21.71% | +7.93 |
| 2025 entry dates | 6 | +47.79% | +48.26% | -0.47 |
| raw | 6 | +35.50% | +23.16% | +12.34 |
| grade9 | 6 | +27.61% | +29.77% | -2.16 |
| psa10 | 6 | +43.97% | +38.76% | +5.21 |
| 27 held-out sets (pooled) | 18 | +32.63% | +25.38% | +7.24 |

The primary candidate beats the baseline in 13 of 18 aggregate baskets. Average within-basket positive-return share is 59.61%; 15.10% of selected positions lose more than 30%. PSA 10's average positive-return share is only 49.14%, despite its positive average return: large winners matter. The 2022 training-selected basket average was −22.85%, versus −29.60% for its baseline. Beating the card market does not guarantee making money or beating cash.

### Era breakdown

| Experiment / segment | Baskets | Candidate net guide return | Equal-weight baseline | Difference (pp) |
|---|---:|---:|---:|---:|
| WOTC | 18 | +33.76% | +29.14% | +4.62 |
| EX | 18 | +112.81% | +77.28% | +35.54 |
| DP | 18 | +112.29% | +93.20% | +19.10 |
| XY | 18 | +65.82% | +59.70% | +6.13 |
| BW | 18 | +47.30% | +42.30% | +4.99 |
| SM | 18 | +49.40% | +44.68% | +4.71 |
| SWSH | 18 | -0.41% | +4.33% | -4.74 |
| SV | 12 | +2.76% | +3.66% | -0.90 |

These are fresh top-quintile selections within each era/grade/date subset using the existing global grade/date feature ranks; they are not additive attribution of the pooled portfolio. The same qualification applies to per-set and price-band tables. Segment failures cannot be fixed by silently excluding those segments after looking at their outcomes.

### Named sets, including counterexamples

| Experiment / segment | Baskets | Candidate net guide return | Equal-weight baseline | Difference (pp) |
|---|---:|---:|---:|---:|
| Base Set | 12 | +35.14% | +23.55% | +11.59 |
| Primal Clash | 9 | +47.92% | +60.52% | -12.60 |
| Hidden Fates | 7 | +63.24% | +45.97% | +17.27 |
| Evolving Skies | 11 | -10.62% | +0.74% | -11.35 |
| Scarlet & Violet | 5 | +4.99% | +10.73% | -5.73 |
| 151 | 4 | +30.45% | +35.59% | -5.14 |

Across all 555 qualifying set/grade/date baskets, excess return averages +3.06 points, but only 51.17% beat their own baseline. Median set-basket excess is only +0.83 points. Thus pooled performance is not evidence of universal set-level effectiveness. Appendix B lists every separately testable set.

### Holding periods and robustness checks

| Experiment / segment | Baskets | Candidate net guide return | Equal-weight baseline | Difference (pp) |
|---|---:|---:|---:|---:|
| 6-month holding | 18 | -6.72% | -9.19% | +2.47 |
| 12-month holding | 18 | +35.69% | +30.56% | +5.13 |
| 24-month holding | 6 | +149.73% | +121.14% | +28.58 |
| 12 months, one-month delayed purchase | 18 | +38.50% | +35.49% | +3.02 |
| Delayed + tax/slippage/high fees | 18 | +9.40% | +6.95% | +2.45 |
| Same month, cap returns at +200% | 18 | +26.83% | +23.07% | +3.76 |
| March-only non-overlapping entries | 6 | +22.67% | +14.69% | +7.98 |

- Delayed entry uses the next month's price and an exit 12 months after that. The six unavailable next-month entries remain cash with zero return; they are not replaced by the next ranked card. Costs apply only to filled hypothetical positions.
- Execution stress starts with delayed entry and applies 5% buy slippage, 8% acquisition tax, 5% exit slippage, a 20% exit haircut, and the same $5 acquisition/$5 exit fixed costs. Its average positive-return share falls to 38.90%; 30.72% of selected positions lose over 30%. Taxes/fees are scenarios, not location-specific tax advice or a historical fee reconstruction.
- The six-month result is negative after costs. The strong 24-month result spans only two mature entry dates and is strongly regime-dependent. It does not validate a 24-month production forecast.
- The +200% upside cap is a sensitivity check applied equally to candidate and baseline returns; it is not an achievable trade rule.
- March-only dates remove overlapping 12-month entry vintages but leave only two dates and correlated cards/grades. A naive date-cluster bootstrap of all six quarterly dates gives roughly +0.26 to +8.85 points; overlapping horizons make that interval overconfident. Do not present it as statistical proof.
- 10% / 15% / 20% sale haircuts yield excess returns of +5.48 / +5.13 / +4.78 points in the same-month experiment. The zero-sale-cost run still includes $5 acquisition shipping; it is not a fully frictionless baseline.
- Price-band excess returns are +9.46 points for $25–99.99, +10.72 for $100–499.99 and +3.09 for $500+, using independent selections within each band. High prices and these favorable historical regimes are not a guarantee of executable liquidity.

### Existing-score replay: diagnostic, not a head-to-head validation

The existing functions were evaluated on June 30 in 2022–2025 after filtering sales/history to each date, removing all current guides and population, and assigning a synthetic check date so stale-data rejection did not make every row null. These adjustments make this explicitly **a partial reconstruction**, not the original historical score. Exact historical capture availability, population, demand universe and sold-page completeness are unavailable.

| As-of date | Raw scored / matched | PSA 9 scored / matched | PSA 10 scored / matched |
|---|---:|---:|---:|
| 2022-06-30 | 1 / 0 | 22 / 6 | 113 / 28 |
| 2023-06-30 | 1 / 0 | 80 / 9 | 252 / 65 |
| 2024-06-30 | 0 / 0 | 62 / 26 | 315 / 171 |
| 2025-06-30 | 0 / 0 | 345 / 243 | 940 / 606 |

Counts are scored card/grade rows with entry sale median at least $25, followed by rows also having an exit fair sale median at the one-year date. Raw contributes no matched rows. Exit fair medians may use the preceding 30/90/180 days and do not guarantee liquidation at the horizon. The conditional matched subset is selected using future coverage, so its returns must not be used to claim superiority. For completeness the executable appendix preserves those diagnostic conditional return calculations; they are intentionally not promoted into the comparison tables.

## 6. Proposed production design

### Separate evidence, ranking and investability

Use a single documented calculation architecture across supported cards, with condition/grade-specific models and explicit abstention. “Universal” should mean consistent definitions and reproducibility, not forcing one weight vector to be correct in every era.

1. **Evidence status:** exact identity, known grade/condition, valid dates, source freshness, minimum independent sale days, horizon maturity, collection coverage, feature availability and uncertainty. Preserve the existing matching rules. Start with a proposed minimum of eight independent sale days in 180 days, one within 30 days, and at least six observed months across a trailing year; choose final thresholds on training data and publish lost coverage. Do not confuse this proposed gate with the guide experiment's eligibility.
2. **Research rank:** the tested `S` above, clearly labeled as an uncalibrated historical ranking. Guide-based raw and mixed Grade 9 research must not masquerade as NM/PSA-specific evidence. The production candidate must be recomputed on verified matching-sale aggregates and revalidated; this experiment does not validate that substitution.
3. **Net investment estimate:** a horizon-specific forecast, uncertainty range and maximum acquisition price. All predictions must change when the asking price or costs change, even if the underlying research rank does not.

### Reproducible net-return formula

Default research horizon is 12 months. Let:

```text
B       = actual item asking price
tax     = applicable buyer tax rate on the modeled purchase basis
Cin     = acquisition shipping, authentication and other fixed acquisition costs
A       = B × (1 + tax) + Cin
E       = uncertain future executable gross sale price after market slippage
F(E)    = effective-dated marketplace fee function, including fixed/order fees
Cout    = outbound shipping, insurance and handling
Chold   = holding costs over the horizon
Rnet(E) = [E − F(E) − Cout − Chold] / A − 1
```

Forecast `E` using a transparent regularized model, not annualizing the score:

```text
y = ln(future matching-grade sale median / current matching-grade sale median)
mu = beta0[grade] + betaM × M + betaV × V + betaQ × Q
     + betaP × ln(current price) + betaA × ln(1 + card age in months)

beta = argmin sum_j w_j × Huber(y_j − mu_j)
       + lambda × sum(non-intercept beta^2)
```

This fitted forecast is a **specified future experiment**, not a model estimated or validated in this report. Preprocessing parameters come only from training data: center/scale by training median/IQR, clip transformed values to [−5,5], handle zero IQR explicitly. Features and labels must share exact grade/condition definitions. Equalize training weights across entry-date/grade/era blocks so large modern catalogs do not dominate. Regularization controls grade intercepts and any later supported era effects toward a pooled model; do not add set identifiers merely to memorize past winners.

Tune `lambda` over a small frozen grid `{0.1, 1, 10, 100}` on purged chronological inner folds. Benchmark against constant-price, value-only, momentum-only, the tested rank and the existing score. Prefer the simpler model within one standard error of the best validation result. Keep scarcity, character demand and population growth out of the initial model; evaluate each later through an explicit ablation using historically available data.

On a distinct chronological calibration window, retain prediction residuals and calculate a conservative 10th-percentile exit-price estimate `E10 = currentPrice × exp(mu + q10(residual))`. This is a lower outcome quantile, not a confidence bound on the mean. Validate empirical coverage by grade and era. If residual calibration is insufficient or unstable, withhold it.

For a simple proportional fee `f` and fixed fee `f0`, the maximum item price consistent with a desired return `h` at the conservative exit estimate is:

```text
Bmax = {[(1−f) × E10 − f0 − Cout − Chold] / (1+h) − Cin} / (1+tax)
```

For tiered fees, solve the original fee equation directly. Negative `Bmax` means no buy at a positive price. Display the price required for positive net return and a configurable hurdle; do not hard-code the old 15% discount.

Do not convert `S=80` into “80% likely to profit.” Only after independent probability calibration may the UI show `Pr(Rnet > h)` as a percentage. If a single 0–100 investment score is retained before that point, label it explicitly as a percentile of conservative net-return estimates against a versioned reference universe, not a probability. Show expected/net downside separately. The production sort should use conservative net return at the actual acquisition price, and must allow no qualifying investments.

### New cards and unsupported cohorts

Do not extrapolate this 13-month-feature experiment to launch-week cards or Mega Evolution. A separate cold-start model needs release-age cohorts, reprint/supply context and its own temporal holdouts. Until validated, show available sales and evidence status without a predictive score. Likewise withhold NM/PSA 9 forecasts when only mixed-condition/mixed-grader guide history exists. This is the cost of a legitimate broadly applicable system, rather than assigning arbitrary numbers to every card.

## 7. Implementation steps and files

### Phase 1 — Versioned data and research harness

- Add immutable observation storage beside the existing latest-value `market_cache`; use the repository's existing database migration convention after locating it. Define logical tables `market_observations`, `sales_observations`, `guide_observations`, `population_observations`, `model_runs`, and `score_observations`. Do not overwrite existing capture history.
- Store `card_id`, exact printing/language/grade/condition, `event_at`, `available_at`, `captured_at`, source product/listing ID, currency, price basis, source URL/hash, parser version and collection completeness. Unknown historical `available_at` stays unknown, not backdated. Save population counts and newly announced supply information prospectively.
- Extend `site/lib/capture.mjs` and `site/lib/sales.mjs` to preserve provenance and grade distinctions; add `site/lib/as-of.mjs` to enforce both event and availability cutoffs. Corrections append a new observation version.
- Add `tools/research/backtest-investment.mjs` and a versioned config/manifest, initially based on the executable appendix. Separate feature building, fold assignment, candidate selection, execution simulation and reporting. Record unfilled entries, absent exits, cohort exclusions and coverage reasons explicitly.
- Acceptance: a future-data poisoning test leaves old predictions unchanged; snapshots replay deterministically; duplicate sales and guide/sale unit conversions are covered; data gaps cannot silently become zero returns or artificial stability.

### Phase 2 — Exact-condition features and cost model

- Add `site/lib/investment-features.mjs` for monthly medians from verified independent sale days. Deduplicate listings, preserve missing months and flag stale/smoothed values; never forward-fill prices to manufacture qualifying histories.
- Add `site/lib/investment-costs.mjs` for explicit price/currency/tax/fee/shipping assumptions and break-even purchase prices. Raw-to-graded submissions are a separate strategy; grading costs and uncertain grades do not belong in an already-graded-card model by accident.
- Keep observed liquidity and data coverage separate. Only call a measure sell-through when both listings offered and listings sold are observable.
- Initially run the tested 75/25 candidate in research/shadow mode. Preserve original score outputs for comparison. Do not reuse the old fixed labels.
- Acceptance: a more expensive asking price cannot improve net investability; increased costs cannot improve return; unsupported grades/unknown prices give no prediction; three identical sales cannot create high confidence.

### Phase 3 — Honest model selection and validation

- Train the transparent net-return challenger offline; freeze features, transformations, cost assumptions, hyperparameter grid and target horizon before the next untouched test window.
- Use expanding calendar folds. Purge training examples whose exit/label window touches validation or test, including any price aggregation/execution buffer. Never allow a 12-month outcome to become available early just because its entry date is old.
- Hold out whole sets and whole eras as additional stress tests. Report grades, age cohorts, price tiers and release years; historical price years are a separate dimension from card release years. No outcome-based exclusions.
- Compare all models on the same historically observable eligible universe and execution policy. Include all-card and set/era-matched baskets, unchanged-price forecasts, simple factor baselines, no-purchase/cash, and the current score where an exact replay is possible.
- Simulate integer card purchases under fixed budgets, set/character concentration limits, bid/ask or observed execution slippage, capacity and time-to-sale. Carry unsold inventory and fees explicitly. A missing future print is not automatic proof of sale or worthlessness.
- Report net return, excess return, median return, profit rate, loss >30%, downside quantiles, turnover, fill rate, time-to-sale, coverage, maximum drawdown on a properly marked portfolio, forecast error and calibration. Do not report a maximum drawdown from the terminal-return tables above; it was not measured here.
- Use calendar blocks at least as long as overlapping holding periods and cluster by set/card family as appropriate. Report the small number of independent market regimes. Run multiple-testing-aware comparisons and preserve all attempted candidates.
- Promotion gate proposed for implementation: positive net return after realistic costs and positive excess over the strongest preregistered baseline on untouched periods; a conservative block-bootstrap lower excess bound above zero; acceptable probability/interval calibration; no material grade/era failure on sufficiently sized cohorts; at least three non-overlapping annual test vintages across materially different markets and broad set coverage. A useful preliminary cohort threshold is 100 distinct cards across five sets; report both counts rather than treating this as proof of independence. Final tolerance definitions must be frozen before testing.
- **The present study does not pass this gate.** Only two later entry years are present, several segments fail, actual trade execution is unknown, and raw/Grade 9 identity is mismatched. Broader immutable historical data or prospective outcomes are required. Do not tune against the same 2024–2025 windows until they “pass.”

### Phase 4 — API and interface integration after validation

- Extend `site/lib/score.mjs` behind a model-version feature flag; preserve `investmentScores` as an adapter during transition. Keep old and candidate results independently replayable.
- Update `site/lib/api.mjs` so score caches include model version, dataset revision, as-of time, cost profile and horizon, not just market-cache count/latest timestamp. Store inference results; do not train on a request.
- Coordinate `site/lib/invest.mjs` shortlist rules with the new net-return gate, so the list and card detail cannot make contradictory recommendations.
- Extend `site/lib/payload.mjs` and `/api/market` responses with `modelVersion`, `asOf`, `horizonMonths`, `evidenceStatus`, `rank`, `forecastBasis`, `netReturnQuantiles`, `maxBuyPrice`, `costAssumptions`, and reason codes. Probability remains absent unless calibrated.
- Update `site/public/app.js` to distinguish historical rank, conditional forecast and observed sales. Replace opaque Strong/Good labels with validated meanings. Keep source evidence and limitations in the explanation; ordinary users should not need model internals to judge price, risk and data quality.
- Build frozen-data integration tests in `site/tests/score.test.mjs`, `invest.test.mjs`, `analysis.test.mjs` and new focused feature/as-of/cost/backtest tests. Verify both local server and Worker paths using the existing scripts. Include negative cases: future history, mixed graders, missing sales, stale source, reprints and absent exits.

### Phase 5 — Shadow evaluation and rollout

- Run both systems on the same inputs and archive their predictions before outcomes occur. Monitor coverage, drift, score-decile outcomes, calibration and execution assumptions by grade/era.
- Keep a rollback switch and immutable model artifact with input schema, training cutoff, coefficients, transforms, residual calibration, cohort support and code/data hashes.
- Release only supported cohorts after the frozen validation gate passes. A short shadow period can test operations, but cannot validate a 12-month investment horizon before 12-month outcomes mature.
- Refit on a scheduled offline cadence only after enough new mature labels exist. Version every change and evaluate against the prior champion. Never self-update weights silently from live prices.

## 8. Verification and reproducibility

Research used Node.js v24.21.0, no added packages, the repository's real data loader and scorer, and deterministic code. Research arithmetic/temporal/ranking assertions pass. Repeating the final experiment produced the same SHA-256 result file. No application tests/builds were needed because no application code changed.

- Source revision: `7bfafb3b277eb7a39ac498e2ba760ffa7e9f8d29`.
- Downloaded source archive SHA-256: `10715eaee8afc715a132ddd194c3930a1349669c396f3d4cd4b706a94206fb7f`.
- Executable research script SHA-256: `8e8d2021b51e4c3d6a6d10bda55a3c8d2deb86d2cab8522602a805d9388830fa`.
- `research-results.json` SHA-256: `78c44a520f1d4fa833d495a7d4058fc9bb5a0808922d23e1c2d103bfc33af272`.
- Script output includes source-capture SHA-256 manifest, all candidate-selection metrics, every test basket, per-set diagnostics, missing-data counts, legacy-replay diagnostics and robustness checks.

To reproduce without modifying the application: extract that pinned GitHub revision into a temporary directory; save Appendix C verbatim as `research.mjs` at its root; run `node research.mjs`. It reads saved source data and writes only `research-results.json` in that temporary directory. Do not run capture/update scripts. The appendix is the actual final script used, not pseudocode. Checks validate training label maturity, held-set separation, finite percentile ranks, weight sum, basket count, fee monotonicity, net-return arithmetic, missing exits and unfilled entries.

The only persistent deliverable created in the working project is this `plan.md`. The formula, model fitting, migrations, endpoints and UI work above are proposed future changes.

## Appendix A — Sets held out from weight selection

Base Set, Legendary Collection, Expedition Base Set, Best of Game, Ruby & Sapphire, FireRed & LeafGreen, Legend Maker, Majestic Dawn, Rising Rivals, Dark Explorers, Legendary Treasures, XY Base Set, Roaring Skies, Evolutions, Burning Shadows, Lost Thunder, Hidden Fates, SWSH Black Star Promos, Vivid Voltage, Celebrations: Classic Collection, Brilliant Stars, Brilliant Stars Trainer Gallery, Astral Radiance, Scarlet & Violet Black Star Promos, Crown Zenith, 151, Paradox Rift.

## Appendix B — All separately testable sets

Same frozen 25/75 formula; select top quintile within each set/grade/date, require at least 20 eligible cards. These 74 sets are the subset with enough rows for set-specific baskets; the pooled feature/evaluation universe has 131 sets.

| Experiment / segment | Baskets | Candidate net guide return | Equal-weight baseline | Difference (pp) |
|---|---:|---:|---:|---:|
| 151 | 4 | +30.45% | +35.59% | -5.14 |
| Ancient Origins | 12 | +40.23% | +68.93% | -28.70 |
| Aquapolis | 18 | +31.41% | +30.67% | +0.73 |
| Astral Radiance | 6 | -15.10% | -19.69% | +4.59 |
| Astral Radiance Trainer Gallery | 6 | +32.48% | +16.29% | +16.18 |
| BREAKpoint | 7 | +44.56% | +44.58% | -0.02 |
| BREAKthrough | 8 | +34.26% | +46.25% | -11.99 |
| Base Set | 12 | +35.14% | +23.55% | +11.59 |
| Base Set 2 | 12 | +25.95% | +7.24% | +18.71 |
| Battle Styles | 6 | -20.11% | -19.85% | -0.25 |
| Black & White Base Set | 2 | +96.18% | +67.35% | +28.83 |
| Boundaries Crossed | 6 | +24.36% | +31.31% | -6.95 |
| Brilliant Stars | 6 | -17.86% | -16.73% | -1.13 |
| Brilliant Stars Trainer Gallery | 5 | +46.93% | +41.69% | +5.24 |
| Celebrations | 6 | +61.21% | +75.20% | -13.99 |
| Celebrations: Classic Collection | 4 | +65.11% | +55.83% | +9.28 |
| Chilling Reign | 6 | -11.91% | -18.47% | +6.56 |
| Crown Zenith | 6 | -26.14% | -20.73% | -5.41 |
| Crown Zenith Galarian Gallery | 6 | +32.22% | +40.01% | -7.79 |
| Dark Explorers | 6 | +6.98% | +35.39% | -28.41 |
| Darkness Ablaze | 6 | -25.46% | -24.15% | -1.30 |
| Dragons Exalted | 4 | +69.28% | +90.79% | -21.51 |
| Evolutions | 6 | +39.34% | +55.29% | -15.94 |
| Evolving Skies | 11 | -10.62% | +0.74% | -11.35 |
| Expedition Base Set | 18 | +43.46% | +42.87% | +0.60 |
| Fates Collide | 6 | +61.55% | +46.34% | +15.21 |
| Flashfire | 6 | +23.55% | +25.80% | -2.25 |
| Fossil | 12 | +27.48% | +16.75% | +10.73 |
| Furious Fists | 6 | +0.38% | +11.73% | -11.36 |
| Fusion Strike | 6 | -17.12% | -11.44% | -5.68 |
| Generations | 8 | +66.00% | +74.47% | -8.47 |
| Gym Challenge | 12 | +20.56% | +19.80% | +0.77 |
| Gym Heroes | 12 | +18.63% | +17.82% | +0.81 |
| Hidden Fates | 7 | +63.24% | +45.97% | +17.27 |
| Jungle | 12 | +27.56% | +14.66% | +12.90 |
| Legendary Collection | 12 | +43.18% | +25.27% | +17.91 |
| Legendary Treasures | 8 | +50.35% | +82.18% | -31.83 |
| Lost Origin | 6 | -29.86% | -28.11% | -1.75 |
| Lost Origin Trainer Gallery | 6 | +45.44% | +44.88% | +0.55 |
| Neo Destiny | 16 | +20.80% | +35.04% | -14.24 |
| Neo Discovery | 12 | +25.81% | +20.65% | +5.16 |
| Neo Genesis | 5 | +22.42% | +6.21% | +16.21 |
| Neo Revelation | 12 | +24.97% | +13.04% | +11.93 |
| Next Destinies | 6 | +181.10% | +98.22% | +82.88 |
| Noble Victories | 3 | -19.74% | +10.23% | -29.97 |
| Obsidian Flames | 4 | -3.92% | +2.15% | -6.07 |
| Paldea Evolved | 6 | -4.97% | -13.39% | +8.42 |
| Paldean Fates | 2 | -3.49% | +18.67% | -22.17 |
| Paradox Rift | 3 | -17.47% | -11.65% | -5.82 |
| Phantom Forces | 6 | +117.30% | +67.43% | +49.87 |
| Plasma Blast | 6 | +60.83% | +69.28% | -8.46 |
| Plasma Freeze | 12 | +54.02% | +51.49% | +2.53 |
| Plasma Storm | 6 | +76.66% | +57.05% | +19.61 |
| PokÃ©mon GO | 6 | +35.82% | +15.18% | +20.64 |
| Primal Clash | 9 | +47.92% | +60.52% | -12.60 |
| Rebel Clash | 6 | -22.90% | -30.07% | +7.18 |
| Roaring Skies | 7 | +91.71% | +75.40% | +16.32 |
| SWSH Black Star Promos | 12 | +15.97% | +21.11% | -5.13 |
| Scarlet & Violet | 5 | +4.99% | +10.73% | -5.73 |
| Scarlet & Violet Black Star Promos | 2 | +82.38% | +63.28% | +19.10 |
| Shining Fates | 2 | -34.41% | -17.22% | -17.19 |
| Shining Fates Shiny Vault | 6 | -21.66% | -22.96% | +1.31 |
| Silver Tempest | 6 | -16.23% | -17.57% | +1.34 |
| Silver Tempest Trainer Gallery | 5 | +29.38% | +24.80% | +4.58 |
| Skyridge | 18 | +46.74% | +50.16% | -3.42 |
| Steam Siege | 6 | +17.38% | +34.47% | -17.08 |
| Sword & Shield | 6 | -12.29% | -15.07% | +2.78 |
| Team Rocket | 12 | +17.55% | +10.91% | +6.64 |
| Temporal Forces | 2 | -18.40% | -7.87% | -10.52 |
| Twilight Masquerade | 1 | +56.65% | +13.05% | +43.60 |
| Vivid Voltage | 6 | -24.26% | -17.63% | -6.63 |
| Wizards Black Star Promos | 12 | +121.24% | +79.12% | +42.12 |
| XY Base Set | 6 | +169.52% | +105.27% | +64.25 |
| XY Black Star Promos | 13 | +95.06% | +83.75% | +11.32 |

## Appendix C — Executable research script

```javascript
import {cards,sets} from './site/data/catalog.mjs';
import {snapshots} from './site/data/market.mjs';
import {investmentScores} from './site/lib/score.mjs';
import {analyze} from './site/lib/analysis.mjs';
import {writeFileSync,readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const avg=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
const med=a=>{a=[...a].sort((a,b)=>a-b);return a.length?(a[Math.floor((a.length-1)/2)]+a[Math.floor(a.length/2)])/2:null};
const sd=a=>Math.sqrt(avg(a.map(x=>(x-avg(a))**2))||0);
const month=s=>Number(s.slice(0,4))*12+Number(s.slice(5,7))-1;
const ym=t=>Math.floor(t/12)+'-'+String(t%12+1).padStart(2,'0');
const hash=s=>{let h=0;for(const c of s)h=(31*h+c.charCodeAt(0))>>>0;return h};
const release=new Map(sets.map(s=>[s.id,month(s.release)]));
const grades=['raw','grade9','psa10'];
const series=[];let points=0,sales=0;const captures=[];
for(const c of cards.filter(c=>c.eligible)) {const m=snapshots[c.id];if(!m)continue;sales+=(m.sales||[]).length;
 for(const g of grades){const h=new Map((m.history?.[g]||[]).filter(([d,p])=>p>0&&d<'2026-10').map(([d,p])=>[month(d),p/100]));points+=h.size;if(h.size)series.push({c,g,h,hold:hash(c.setId)%5===0});}
}
for(const f of readdirSync('./site/data/pricecharting').sort())if(f.endsWith('.json'))captures.push([f,createHash('sha256').update(readFileSync('./site/data/pricecharting/'+f)).digest('hex')]);
const rank=(rows,key,out)=>{const a=[...rows].sort((a,b)=>a[key]-b[key]);for(let i=0;i<a.length;){let j=i+1;while(j<a.length&&a[j][key]===a[i][key])j++;for(let k=i;k<j;k++)a[k][out]=(i+j-1)/2/Math.max(1,a.length-1);i=j;}};
const models={momentum:[1,0,0],value:[0,1,0],lowVol:[0,0,1],balanced:[1/3,1/3,1/3],momentumValue:[.5,.5,0],momentumQuality:[.5,0,.5],valueQuality:[0,.5,.5]};
for(let m=0;m<=4;m++)for(let v=0;v<=4-m;v++)models['grid_'+m+'_'+v]=[m/4,v/4,(4-m-v)/4];
const score=(r,w)=>r.rm*w[0]+r.rv*w[1]+r.rq*w[2];
const observations=[];const cohorts=[];
for(let t=month('2022-03');t<=month('2025-06');t+=3)for(const g of grades){
 const rows=[];
 for(const s of series){if(s.g!==g||release.get(s.c.setId)>t-12)continue;const ps=Array.from({length:13},(_,k)=>s.h.get(t-12+k));if(ps.some(p=>!(p>0))||ps.at(-1)<25||new Set(ps).size<6)continue;
  const lr=ps.slice(1).map((p,i)=>Math.log(p/ps[i]));
  rows.push({id:s.c.id,set:s.c.setId,era:s.c.series,g,t,hold:s.hold,p:ps.at(-1),next:s.h.get(t+1),lagFuture:Object.fromEntries([6,12,24].map(h=>[h,s.h.get(t+h+1)])),mom:Math.log(ps[11]/ps[0]),val:Math.log(med(ps)/ps.at(-1)),qual:-sd(lr),future:Object.fromEntries([6,12,24].map(h=>[h,s.h.get(t+h)]))});
 }
 // Ranks use only features available at the date, including rows lacking future labels.
 for(const [key,out] of [['mom','rm'],['val','rv'],['qual','rq']])rank(rows,key,out);
 observations.push(...rows);cohorts.push({date:ym(t),g,eligible:rows.length,missing12:rows.filter(r=>!r.future[12]).length});
}
const ret=(r,h=12,fee=.15,fixed=5)=>r.noTrade?0:r.future[h]>0?Math.min(r.cap??Infinity,((1-fee)*r.future[h]-fixed)/(r.p+5)-1):-1;
function baskets(rows,w,h=12,fee=.15,fixed=5,extra=''){
 const groups=new Map();for(const r of rows){if(r.t+h>month('2026-08'))continue;const k=r.t+'|'+r.g+(extra?'|'+r[extra]:'');if(!groups.has(k))groups.set(k,[]);groups.get(k).push(r);}
 const out=[];for(const [key,all] of groups){if(all.length<20)continue;const sorted=[...all].sort((a,b)=>score(b,w)-score(a,w)||a.id.localeCompare(b.id)),top=sorted.slice(0,Math.ceil(all.length*.2));
  // Do not silently replace a selected position lacking its future price.
  // Missing mature outcomes receive a conservative -100% mark for every strategy.
  const r=top.map(r=>ret(r,h,fee,fixed)),base=avg(all.map(r=>ret(r,h,fee,fixed)));
  out.push({key,date:ym(all[0].t),g:all[0].g,n:all.length,k:top.length,missing:all.filter(r=>!r.future[h]).length,net:avg(r),base,lift:avg(r)-base,median:med(r),win:avg(r.map(x=>+(x>0))),loss:avg(r.map(x=>+(x<-.3))),worst:Math.min(...r)});
 }return out;
}
const summary=b=>({baskets:b.length,meanNet:avg(b.map(x=>x.net)),baseline:avg(b.map(x=>x.base)),lift:avg(b.map(x=>x.lift)),medianLift:med(b.map(x=>x.lift)),positiveLift:avg(b.map(x=>+(x.lift>0))),win:avg(b.map(x=>x.win)),loss30:avg(b.map(x=>x.loss)),worstBasket: b.length?Math.min(...b.map(x=>x.net)):null});
const train=observations.filter(r=>!r.hold&&r.t<=month('2022-12'));
const test=observations.filter(r=>r.t>=month('2024-03'));
const selection=Object.entries(models).map(([name,w])=>{const b=baskets(train,w);return {name,w,...summary(b),objective:avg(b.map(x=>x.lift))-.5*sd(b.map(x=>x.lift))}}).sort((a,b)=>b.objective-a.objective||a.name.localeCompare(b.name));
const chosen=selection[0],w=chosen.w;
const results={revision:'7bfafb3b277eb7a39ac498e2ba760ffa7e9f8d29',inventory:{cards:cards.length,eligible:cards.filter(c=>c.eligible).length,sets:sets.length,historySeries:series.length,historyPoints:points,sales,observations:observations.length,uniqueCards:new Set(observations.map(r=>r.id)).size,setsTested:new Set(observations.map(r=>r.set)).size,eras:[...new Set(observations.map(r=>r.era))]},manifest:captures,cohorts,selection,chosen,comparison:Object.fromEntries(Object.entries(models).filter(([n])=>!n.startsWith('grid')||n===chosen.name).map(([n,w])=>[n,summary(baskets(test,w))])),byYear:Object.fromEntries([2024,2025].map(y=>[y,summary(baskets(test.filter(r=>Math.floor(r.t/12)===y),w))])),byGrade:Object.fromEntries(grades.map(g=>[g,summary(baskets(test.filter(r=>r.g===g),w))])),byEra:Object.fromEntries([...new Set(test.map(r=>r.era))].map(e=>[e,summary(baskets(test.filter(r=>r.era===e),w))])),heldSets:summary(baskets(test.filter(r=>r.hold),w)),bySet:summary(baskets(test,w,12,.15,5,'set')),horizons:Object.fromEntries([6,12,24].map(h=>[h,summary(baskets(test,w,h))])),costs:Object.fromEntries([0,.10,.15,.20].map(f=>[f,summary(baskets(test,w,12,f,f?5:0))])),testBaskets:baskets(test,w),heldSetNames:sets.filter(s=>hash(s.id)%5===0&&test.some(r=>r.set===s.id)).map(s=>s.name)};
// Inspect legacy scorer availability on dated sales. Historical population is unavailable.
results.legacyReplay=[];
for(const date of ['2022-06-30','2023-06-30','2024-06-30','2025-06-30']){
 const cutoff=Date.parse(date+'T23:59:59Z'),entries=cards.filter(c=>c.eligible&&release.get(c.setId)<=month(date)).map(c=>{const m=snapshots[c.id];if(!m)return [c,null];const history=Object.fromEntries(grades.map(g=>[g,(m.history?.[g]||[]).filter(([d])=>d<=date.slice(0,7))]));return [c,{...m,pop:null,history,guide:{},sales:(m.sales||[]).filter(s=>s.date<=date),observedAt:date,research:{...m.research,checkedAt:date}}]});
 const scores=investmentScores(entries,{now:cutoff});const row={date,grades:{}};
 for(const g of ['raw','psa9','psa10']){const matches=[];for(const [c,m] of entries){const a=scores.full.get(c.id)?.[g];if(a?.score==null||!(a.price>=25))continue;const future=analyze({sales:(snapshots[c.id]?.sales||[]).filter(s=>s.date>date)},g,15,Date.UTC(Number(date.slice(0,4))+1,5,30,23,59,59));if(future.fair>0)matches.push({id:c.id,s:a.score,r:(future.fair*.85-5)/(a.price+5)-1});}matches.sort((a,b)=>b.s-a.s||a.id.localeCompare(b.id));const top=matches.slice(0,Math.ceil(matches.length*.2));row.grades[g]={scored:[...scores.full.values()].filter(x=>x[g]?.score!=null&&x[g].price>=25).length,matched:matches.length,topNet:avg(top.map(x=>x.r)),base:avg(matches.map(x=>x.r))};}results.legacyReplay.push(row);
}
results.walkForward=[2024,2025].map(y=>{const tr=observations.filter(r=>!r.hold&&r.t<=month((y-2)+'-12'));const choices=Object.entries(models).map(([name,w])=>{const b=baskets(tr,w);return {name,w,objective:avg(b.map(x=>x.lift))-.5*sd(b.map(x=>x.lift))}}).sort((a,b)=>b.objective-a.objective||a.name.localeCompare(b.name));return {year:y,selected:choices[0],test:summary(baskets(test.filter(r=>Math.floor(r.t/12)===y),choices[0].w)),heldSets:summary(baskets(test.filter(r=>Math.floor(r.t/12)===y&&r.hold),choices[0].w))}});
results.setDetails=[...new Set(test.map(r=>r.set))].map(set=>({set,name:sets.find(s=>s.id===set)?.name,...summary(baskets(test.filter(r=>r.set===set),w))})).filter(x=>x.baskets);
let seed=123456789;const rand=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296};
const dateLifts=[...new Set(results.testBaskets.map(b=>b.date))].map(d=>avg(results.testBaskets.filter(b=>b.date===d).map(b=>b.lift)));
const bs=Array.from({length:5000},()=>avg(dateLifts.map(()=>dateLifts[Math.floor(rand()*dateLifts.length)]))).sort((a,b)=>a-b);
results.dateBootstrap={dates:dateLifts.length,lower:bs[125],upper:bs[4874],note:'Exploratory date-cluster bootstrap; adjacent 12-month holdings overlap, so not a formal independent-sample confidence interval.'};
results.evaluationCoverage={testObservations:test.length,cards:new Set(test.map(r=>r.id)).size,sets:new Set(test.map(r=>r.set)).size,missing12:test.filter(r=>!r.future[12]).length,holdSets:new Set(test.filter(r=>r.hold).map(r=>r.set)).size};
const delayed=test.map(r=>({...r,p:r.next||r.p,noTrade:!r.next,future:r.lagFuture}));
results.delayed={missingEntries:test.filter(r=>!r.next).length,summary:summary(baskets(delayed,w)),byGrade:Object.fromEntries(grades.map(g=>[g,summary(baskets(delayed.filter(r=>r.g===g),w))]))};
results.nonoverlap=summary(baskets(test.filter(r=>r.t%12===2),w));
results.priceBands=Object.fromEntries([[25,100],[100,500],[500,Infinity]].map(([lo,hi])=>[lo+'-'+hi,summary(baskets(test.filter(r=>r.p>=lo&&r.p<hi),w))]));
results.psa10TrainingChoice=Object.entries(models).map(([name,w])=>{const b=baskets(train.filter(r=>r.g==='psa10'),w);return {name,w,objective:avg(b.map(x=>x.lift))-.5*sd(b.map(x=>x.lift))}}).sort((a,b)=>b.objective-a.objective||a.name.localeCompare(b.name))[0];
results.psa10OwnModel=summary(baskets(test.filter(r=>r.g==='psa10'),results.psa10TrainingChoice.w));
results.cappedUpside=summary(baskets(test.map(r=>({...r,cap:2})),w));
results.executionStress=summary(baskets(delayed.map(r=>({...r,p:r.p*1.05*1.08,future:Object.fromEntries(Object.entries(r.future).map(([h,p])=>[h,p*.95]))})),w,12,.20,5));
assert(train.every(r=>!r.hold&&r.t+12<=month('2023-12')));
assert(observations.every(r=>[r.rm,r.rv,r.rq].every(x=>Number.isFinite(x)&&x>=0&&x<=1)));
assert(Math.abs(w.reduce((a,b)=>a+b,0)-1)<1e-10);
assert.equal(results.testBaskets.length,18);
assert(results.costs['0.1'].meanNet>results.costs['0.15'].meanNet&&results.costs['0.15'].meanNet>results.costs['0.2'].meanNet);
assert.equal(ret({p:100,future:{12:100}}),(85-5)/105-1);
assert.equal(ret({p:100,future:{}}),-1);
assert.equal(ret({p:100,future:{},noTrade:true}),0);
results.checks='Passed: ranks, training-label cutoff, disjoint held sets, weight sum, cohort count, fee monotonicity, net-return arithmetic, missing exits and unfilled entries.';
writeFileSync('research-results.json',JSON.stringify(results,null,2)+'\n');
console.log(JSON.stringify({...results,manifest:undefined,cohorts:undefined,selection:results.selection.slice(0,5)},null,2));
```
