#!/usr/bin/env python3
"""
Rank Congress members by whether their disclosed trades actually made money
-- independent of Trump entirely. Uses excess_since (return since the trade,
relative to a market benchmark) already computed per-trade in the source
dataset.

For a PURCHASE, positive excess_since = good call (stock beat the market
after they bought). For a SALE, the sign is flipped: negative excess_since
after a sale means the stock underperformed after they got out, i.e. good
sell timing. Both are folded into one "decision_score" per trade so buys and
sells contribute on the same scale, then averaged per filer.

This is a backtest of disclosed trades using price data as of whenever the
source dataset was last refreshed, not a live/forward-looking prediction.
Small-sample members are noisy -- a minimum trade count is required to reduce
the "got lucky on 3 trades" effect, but even the leaderboard should be read
as "worth a closer look," not "reliably skilled."
"""

import json
import statistics
import sys
from collections import defaultdict

from match_trump_congress import FILERS_PATH, load, normalize_side

MIN_TRADES = 15


def decision_score(trade, side):
    excess = trade.get("excess_since")
    if excess is None:
        return None
    return excess if side == "buy" else -excess


def main():
    min_trades = int(sys.argv[1]) if len(sys.argv) > 1 else MIN_TRADES
    trades, filers = load()

    by_filer = defaultdict(list)
    for t in trades:
        filer = filers.get(t.get("filer_id"))
        if not filer or filer.get("branch") != "congress":
            continue
        side = normalize_side(t.get("transaction_type"))
        if not side:
            continue
        score = decision_score(t, side)
        if score is None:
            continue
        by_filer[t["filer_id"]].append(score)

    results = []
    for filer_id, scores in by_filer.items():
        if len(scores) < min_trades:
            continue
        filer = filers[filer_id]
        results.append(
            {
                "filer_id": filer_id,
                "name": filer.get("full_name"),
                "chamber": filer.get("chamber"),
                "party": filer.get("party"),
                "state": filer.get("state"),
                "trades_scored": len(scores),
                "avg_decision_score": round(statistics.mean(scores), 2),
                "median_decision_score": round(statistics.median(scores), 2),
                "stdev": round(statistics.pstdev(scores), 2) if len(scores) > 1 else 0,
            }
        )

    # Median, not mean: excess_since has a fat tail (some trades show
    # +20,000%/-5,000%, almost certainly micro-cap/SPAC noise) that lets a
    # single trade dominate an average. Median is robust to that; a big
    # mean/median gap in the output is itself a signal to distrust the mean.
    results.sort(key=lambda r: -r["median_decision_score"])

    print(f"Filers with >= {min_trades} scored trades: {len(results)}\n")
    print(f"{'Rank':<5}{'Name':<28}{'Chmb':<7}{'Party':<6}{'N':<6}{'Median':<10}{'AvgScore'}")
    for i, r in enumerate(results[:15], 1):
        print(
            f"{i:<5}{r['name']:<28}{(r['chamber'] or ''):<7}{(r['party'] or ''):<6}"
            f"{r['trades_scored']:<6}{r['median_decision_score']:<10}{r['avg_decision_score']}"
        )
    print("\n...bottom 5 (worst median decision score):")
    for r in results[-5:]:
        print(
            f"     {r['name']:<28}{(r['chamber'] or ''):<7}{(r['party'] or ''):<6}"
            f"{r['trades_scored']:<6}{r['median_decision_score']:<10}{r['avg_decision_score']}"
        )

    with open("output/performance_leaderboard.json", "w") as f:
        json.dump(results, f, indent=2)
    print(f"\nFull results ({len(results)} filers) written to output/performance_leaderboard.json")


if __name__ == "__main__":
    main()
