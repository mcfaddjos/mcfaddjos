# Trump vs. Congress trading analysis

Four analyses, in order of how much they should change your mind:

1. **Timing match** -- same ticker, same direction, within N days of a Trump trade. (Raw signal, easy to over-read.)
2. **Permutation baseline** -- is a member's match count above what shuffling their own trade dates would produce by chance? (Corrects #1.)
3. **Performance leaderboard** -- do a member's trades actually make money, independent of Trump entirely?
4. **Committee/sector conflict** -- do a member's trades land in sectors their committees oversee, more than market-wide baseline would predict?

**Data:** [kadoa-org/congress-trading-monitor](https://github.com/kadoa-org/congress-trading-monitor) (House Clerk + Senate eFD + Trump's OGE 278-T, unified), plus [unitedstates/congress-legislators](https://github.com/unitedstates/congress-legislators) for committee assignments. Pulled 2026-07-09/11.

## Headline: one name shows up in two different analyses

**Byron Donalds (R-FL, House)** is one of only 5 members whose Trump-trade timing beats a random-chance baseline at *every* window width tested (5/10/15/20 days, p ≤ 0.002), **and** independently shows an above-baseline concentration of trades in his committee's sectors (+13.1 points vs. baseline). Those are two unrelated methods agreeing on the same person -- the strongest single data point across all four analyses. Still a correlation, not evidence of anything. Worth an outside look, not a conclusion.

## 1. Timing match (±5 days, same ticker, same direction)

Ticker coverage on the Trump side is now 42.5% (3,294 of 7,744 trades -- up from 31% last pass after expanding the manual name→ticker map to ~325 companies; the rest is mostly bonds, money-market funds, and long-tail small-caps with no clean ticker).

| Rank | Name | Chamber | Party | Matches | Own trades | Match rate |
|---|---|---|---|---|---|---|
| 1 | Gilbert Cisneros | House | D | 119 | 2,525 | 4.7% |
| 2 | Ro Khanna | House | D | 49 | 95 | 51.6% |
| 3 | Michael McCaul | House | R | 39 | 70 | 55.7% |
| 4 | David J. Taylor | House | R | 34 | 171 | 19.9% |
| 5 | Maria Elvira Salazar | House | R | 19 | 69 | 27.5% |
| 6 | Jared Moskowitz | House | D | 18 | 374 | 4.8% |
| 7 | Josh Gottheimer | House | D | 17 | 3,456 | 0.5% |
| 8 | Byron Donalds | House | R | 16 | 161 | 9.9% |
| 9 | April McClain Delaney | House | D | 12 | 326 | 3.7% |
| 10 | John Boozman | Senate | R | 10 | 420 | 2.4% |

**Read this one skeptically -- see section 2.** Raw match rate rewards members who happen to trade the same popular mega-caps Trump trades a lot (AAPL, MSFT, JPM...), which can look like "close timing" even when it's just shared taste in blue chips.

Per-window snapshots (5/10/15/20 days): `output/top10_matches_{5,10,15,20}d.json`.

## 2. Permutation baseline -- correcting #1 for chance

For each member, shuffle their own trade dates among their own trades (same tickers, same sides, same activity level -- just randomly reassigned) 200-1000 times, and see how often a random shuffle matches Trump as well as their actual trades did. Members below are the ones whose *actual* timing beats random chance at p<0.05.

**This overturns last round's headline finding.** Ro Khanna, last time's top pick by match rate, has p=0.59 at the 5-day window -- completely unremarkable; his high match rate was just a byproduct of trading very frequently in Trump's favorite names. Michael McCaul is borderline (p=0.06-0.11 depending on window) -- not quite significant. Gilbert Cisneros, dismissed last time as "just a high-volume trader," is actually the single strongest result (p≤0.002 at every window) -- volume alone doesn't explain his specific date/ticker pairing.

**Members significant (p<0.05) at every window tested (5/10/15/20 days):**

| Name | Chamber | Party | 5-day p | 20-day p |
|---|---|---|---|---|
| Gilbert Cisneros | House | D | 0.001 | 0.002 |
| Maria Elvira Salazar | House | R | 0.001 | 0.004 |
| Byron Donalds | House | R | 0.001 | 0.042 |
| Angus King | Senate | I | 0.002 | 0.026 |
| Shelley Moore Capito | Senate | R | 0.008 | 0.004 |

With ~50-60 members tested per window and a p<0.05 threshold, ~2-3 "significant" results would be expected by pure chance -- getting 5 that hold up across all four independent window widths is a stronger claim than any single p-value alone.

Full results: `output/permutation_{5,10,15,20}d.json`.

## 3. Performance leaderboard -- do their trades make money?

Independent of Trump. Each trade gets a "decision score": `excess_since` (return vs. market benchmark, from trade date to most recent price) for buys, flipped sign for sells (a sale followed by a decline = good timing). Averaged per member, minimum 15 scored trades.

**Median, not mean** -- `excess_since` has a severe fat tail (individual trades from -5,720% to +24,680%, almost certainly micro-cap/SPAC noise), so a single lucky or unlucky trade can dominate an average. Median is far more robust; a big mean/median gap in the raw output is itself a red flag to distrust that member's number.

| Rank | Name | Chamber | Party | N | Median score |
|---|---|---|---|---|---|
| 1 | Brad Ashford | House | D | 17 | 257.1 |
| 2 | Frank LoBiondo | House | R | 28 | 177.4 |
| 3 | Barbara Comstock | House | R | 31 | 93.5 |
| 4 | John Larson | House | D | 26 | 91.3 |
| 5 | Roger Marshall | House | R | 51 | 90.6 |
| ... | | | | | |
| 7 | Nicholas Van Taylor | House | R | 305 | 84.3 |
| 10 | Donna Shalala | House | D | 396 | 66.7 |
| 13 | Peter Meijer | House | R | 239 | 58.1 |
| 14 | Mikie Sherrill | House | D | 226 | 58.0 |

The large-N rows (Van Taylor, Shalala, Meijer, Sherrill -- hundreds of scored trades) are the more trustworthy entries; the top 5 are lower-N and more exposed to a handful of lucky picks despite the median guard. This is a backtest against current prices, not a live forward-looking prediction.

Full results (161 filers): `output/performance_leaderboard.json`.

## 4. Committee/sector conflict -- trading what they oversee

Do a member's trades land in sectors their committee assignments cover, more than you'd expect from market-wide trading patterns alone? Matched 200/355 Congress filers to committee assignments (155 unmatched on name-format mismatches -- a real gap, not a "clean" result). Sector tags come from a ~1,029-ticker GICS-like map (partial coverage). Committees with broad/procedural jurisdiction (Appropriations, Budget, Rules, Ethics) are deliberately excluded -- they don't map to a sector.

**Lift = observed in-jurisdiction trade % minus market-baseline % for those sectors** -- this is the important correction. Sheldon Whitehouse's raw "74.5% of trades in his committees' sectors" looked dramatic until baselining: his committees cover 7 of 12 sectors worth ~74% of all Congress trading anyway, so his lift is -0 -- not a signal, just broad committee coverage. Same story for Josh Gottheimer. Both dropped out once the baseline was applied.

| Rank | Name | Chamber | N | Observed % | Baseline % | Lift |
|---|---|---|---|---|---|---|
| 1 | Tina Smith | Senate | 20 | 90.0 | 40.5 | +49.5 |
| 2 | Bryan Steil | House | 12 | 66.7 | 17.6 | +49.1 |
| 3 | Deborah Ross | House | 23 | 69.6 | 29.7 | +39.9 |
| 4 | Thomas Kean | House | 10 | 60.0 | 26.8 | +33.2 |
| 5 | Austin Scott | House | 39 | 69.2 | 43.7 | +25.5 |
| 7 | Patrick Fallon | House | 225 | 54.7 | 33.7 | +21.0 |
| 11 | Byron Donalds | House | 140 | 30.7 | 17.6 | +13.1 |

Full results: `output/committee_conflicts.json`.

## Read all of this before acting on it

- **None of this is evidence of coordination, insider knowledge, or wrongdoing by anyone named.** Every method here measures correlation. The permutation and baseline corrections make the surviving correlations *harder to explain by chance alone* -- they don't explain *why* a correlation exists.
- **Sampled timing matches skew toward small-dollar, same-day mega-cap trades** -- consistent with both Trump's and many members' trades running through automated/managed brokerage accounts that rebalance similarly, not necessarily anyone watching anyone.
- **Both sides can disclose late.** STOCK Act gives Congress 45 days; Trump's OGE filings were sometimes over a year late. A close match on trade *date* doesn't mean either side could have known about the other's trade in real time.
- **Ticker/name/committee-matching is all partial.** Trump-side tickers: 42.5% resolved. Committee matching: 200/355 members. Sector tagging: ~1,029 of a much larger ticker universe. Every number above is a floor on what's really there, computed from what could be matched -- not a census.
- **Trump-side data still skews to Jan-May 2026**, not calendar 2025 -- that's when his disclosed trading volume was heaviest in this dataset, not a deliberate window choice. The full 21,000-trade 2025 annual filing is still not accessible from this environment (blocked domain) or available as a public structured dataset.

## Files

- `match_trump_congress.py [window_days]` -- timing match
- `permutation_test.py [window_days] [n_permutations]` -- chance baseline for the above
- `performance_leaderboard.py [min_trades]` -- return-based ranking
- `committee_conflicts.py [min_trades]` -- sector/committee overlap
- `ticker_fallback.json` -- manual name→ticker map (Trump-side gap fill)
- `ticker_sector.json` -- ticker→GICS-like sector map (from trump-portfolio-tracker's seed data)
- `raw_data/` -- downloaded source data incl. `raw_data/committees/` (gitignored, re-fetch if needed)
- `output/` -- committed: per-window match/permutation results, performance leaderboard, committee conflicts. Gitignored: `all_matches.json` and the default (unsuffixed) output files, which are just the last run and get overwritten -- regenerate by running the scripts.
