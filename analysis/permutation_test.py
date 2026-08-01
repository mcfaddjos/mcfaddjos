#!/usr/bin/env python3
"""
Chance baseline for the Trump-timing match counts in match_trump_congress.py.

For each Congress member, the observed match count against Trump's trades
could be high just because they trade a lot, or trade popular tickers Trump
also happens to trade a lot. To tell "meaningfully close timing" apart from
"trades the same popular stocks as everyone else," this shuffles each
member's OWN trade dates among their OWN trades (same tickers, same sides,
same set of dates they were actually active -- just randomly reassigned)
and recomputes the match count many times. The p-value is how often a
random shuffle does at least as well as what actually happened.

p < 0.05 roughly means: this member's specific date/ticker pairing lines up
with Trump's trades more than random reshuffling of their own activity would
predict. It does NOT mean anything about why.
"""

import bisect
import json
import random
import sys
from collections import defaultdict

from match_trump_congress import (
    FILERS_PATH,
    TRUMP_FILER_ID,
    load,
    normalize_side,
    parse_date,
    resolve_ticker,
)

N_PERMUTATIONS = 200
MIN_OWN_TRADES = 5  # skip members with too few trades for a meaningful test


def build_trump_index_sorted(trades):
    """ticker -> side -> sorted list of ordinal-day ints (for bisect)."""
    idx = defaultdict(lambda: defaultdict(list))
    for t in trades:
        if t.get("filer_id") != TRUMP_FILER_ID:
            continue
        d = parse_date(t.get("transaction_date"))
        side = normalize_side(t.get("transaction_type"))
        ticker = resolve_ticker(t)
        if not d or not side or not ticker:
            continue
        idx[ticker][side].append(d.toordinal())
    for ticker in idx:
        for side in idx[ticker]:
            idx[ticker][side].sort()
    return idx


def count_matches(member_trades, trump_idx, window):
    """member_trades: list of (ticker, side, ordinal_day)."""
    count = 0
    for ticker, side, day in member_trades:
        days = trump_idx.get(ticker, {}).get(side)
        if not days:
            continue
        i = bisect.bisect_left(days, day)
        hit = False
        if i < len(days) and days[i] - day <= window:
            hit = True
        if not hit and i > 0 and day - days[i - 1] <= window:
            hit = True
        if hit:
            count += 1
    return count


def main():
    window = int(sys.argv[1]) if len(sys.argv) > 1 else 5
    n_perm = int(sys.argv[2]) if len(sys.argv) > 2 else N_PERMUTATIONS
    random.seed(42)

    trades, filers = load()
    trump_idx = build_trump_index_sorted(trades)
    total_trump = sum(len(v) for sides in trump_idx.values() for v in sides.values())
    print(f"Trump trades indexed: {total_trump}. Window: +/-{window} days. Permutations: {n_perm}")

    by_filer = defaultdict(list)
    for t in trades:
        filer = filers.get(t.get("filer_id"))
        if not filer or filer.get("branch") != "congress":
            continue
        side = normalize_side(t.get("transaction_type"))
        ticker = resolve_ticker(t)
        d = parse_date(t.get("transaction_date"))
        if not side or not ticker or not d:
            continue
        by_filer[t["filer_id"]].append((ticker, side, d.toordinal()))

    results = []
    for filer_id, member_trades in by_filer.items():
        if len(member_trades) < MIN_OWN_TRADES:
            continue
        observed = count_matches(member_trades, trump_idx, window)
        if observed == 0:
            continue

        dates = [d for _, _, d in member_trades]
        pairs = [(t, s) for t, s, _ in member_trades]
        at_least_as_good = 0
        for _ in range(n_perm):
            shuffled_dates = dates[:]
            random.shuffle(shuffled_dates)
            permuted = [(t, s, d) for (t, s), d in zip(pairs, shuffled_dates)]
            if count_matches(permuted, trump_idx, window) >= observed:
                at_least_as_good += 1
        p_value = (at_least_as_good + 1) / (n_perm + 1)

        filer = filers[filer_id]
        results.append(
            {
                "filer_id": filer_id,
                "name": filer.get("full_name"),
                "chamber": filer.get("chamber"),
                "party": filer.get("party"),
                "state": filer.get("state"),
                "observed_matches": observed,
                "own_trades_used": len(member_trades),
                "p_value": round(p_value, 4),
                "significant_p05": p_value < 0.05,
            }
        )

    results.sort(key=lambda r: (r["p_value"], -r["observed_matches"]))

    print(f"\n{'Name':<28}{'Chmb':<7}{'Matches':<9}{'p-value':<9}{'Sig(p<.05)'}")
    for r in results[:20]:
        print(
            f"{r['name']:<28}{(r['chamber'] or ''):<7}{r['observed_matches']:<9}"
            f"{r['p_value']:<9}{'YES' if r['significant_p05'] else ''}"
        )

    n_sig = sum(1 for r in results if r["significant_p05"])
    print(f"\n{n_sig} of {len(results)} tested members significant at p<0.05 "
          f"(with {len(results)} members tested, ~{len(results)*0.05:.0f} 'significant' "
          f"results would be expected by chance alone at this threshold).")

    with open(f"output/permutation_{window}d.json", "w") as f:
        json.dump(results, f, indent=2)
    print(f"\nFull results written to output/permutation_{window}d.json")


if __name__ == "__main__":
    main()
