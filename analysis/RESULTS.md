# Trump vs. Congress trade-timing comparison

**Method:** for every disclosed Congress member trade, check whether Trump
disclosed a trade in the *same ticker*, *same direction* (buy/buy or sell/sell),
within **5 days** either way. Count matches per member. Not a dollar-amount
match, not proof of anything -- a timing correlation only.

**Data:** [kadoa-org/congress-trading-monitor](https://github.com/kadoa-org/congress-trading-monitor)
(public, MIT-licensed), which normalizes House Clerk PTRs, Senate eFD PTRs, and
Trump's OGE Form 278-T filings into one dataset. Pulled 2026-07-09.

## Top 10 (5-day window)

| Rank | Name | Chamber | Party | Matches | Own trades | Match rate |
|---|---|---|---|---|---|---|
| 1 | Gilbert Cisneros | House | D | 99 | 2,525 | 3.9% |
| 2 | Rohit Khanna | House | D | 49 | 95 | **51.6%** |
| 3 | David J. Taylor | House | R | 33 | 171 | 19.3% |
| 4 | Michael T. McCaul | House | R | 30 | 54 | **55.6%** |
| 5 | Josh Gottheimer | House | D | 16 | 3,456 | 0.5% |
| 6 | Jared Moskowitz | House | D | 14 | 374 | 3.7% |
| 7 | Maria Elvira Salazar | House | R | 12 | 69 | 17.4% |
| 8 | Byron Donalds | House | R | 12 | 161 | 7.5% |
| 9 | April McClain Delaney | House | D | 12 | 326 | 3.7% |
| 10 | John Boozman | Senate | R | 10 | 420 | 2.4% |

Two different signals are mixed together in "Matches" -- worth reading them apart:

- **Raw match count** rewards trading *a lot*. Cisneros and Gottheimer are two
  of the most active traders in Congress (thousands of trades each); at that
  volume, overlapping with Trump's ~2,400 ticker-resolved trades on popular
  names is close to inevitable. Their match *rate* (3.9%, 0.5%) is unremarkable.
- **Match rate** is the more interesting number. Rohit Khanna (51.6%) and
  Michael McCaul (55.6%) trade far less often, but when they do trade, it
  lines up with a Trump trade (same ticker, same direction, same week) more
  than half the time. That's the pair worth a second look if you want to dig
  further -- not the volume leaders.

## Read this before acting on it

- **These are very likely routine managed-account trades, not signals.**
  Sampled matches skew toward the smallest disclosure bracket ($1,001-$15,000),
  same-day, in mega-cap names (AAPL, META, JPM, HD, AMD...). That's the
  signature of an automated/robo-managed brokerage account doing routine
  rebalancing or dividend reinvestment -- both Trump's disclosed trades and
  many members' trades go through professional money managers, who may simply
  trade the same popular names on similar days for reasons that have nothing
  to do with each other.
- **Coverage is partial, not "last year."** Congress-side ticker resolution is
  good (~85%). Trump-side started at just 14% (the source dataset's resolver
  dictionary missed most plain-English company names) -- I hand-built a
  fallback map (`ticker_fallback.json`) for the ~150 most common unresolved
  names, which brought Trump-side coverage to ~31% (2,415 of 7,744 trades).
  The remaining 69% (mostly bonds, money-market funds, and long-tail small-caps)
  aren't in this analysis at all. The trades that *are* resolved skew heavily
  toward Jan-May 2026, not calendar 2025 -- that's when Trump's disclosed
  trading volume was heaviest in this dataset, not a deliberate window choice.
- **Congress members' own filings can also be late.** STOCK Act gives 45 days;
  Trump's OGE filings were disclosed even later in practice (some over a year
  late). A "5 days apart" match on trade *date* doesn't mean either side knew
  about the other's trade at the time -- both could have been made in good
  faith and only *become public* months apart.
- This is a timing correlation, not evidence of coordination, insider
  knowledge, or wrongdoing by anyone named here.

## Files

- `match_trump_congress.py` -- the matching script (`python3 match_trump_congress.py [window_days]`)
- `ticker_fallback.json` -- manual name-to-ticker map filling gaps in the source data
- `output/top10_matches.json`, `output/all_matches.json` -- full results (gitignored, regenerate by running the script)
- `raw_data/` -- downloaded source data (gitignored, ~150MB, re-fetch via the fetch script if needed)
