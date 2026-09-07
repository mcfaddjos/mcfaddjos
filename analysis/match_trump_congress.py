#!/usr/bin/env python3
"""
Compare Congress members' disclosed stock trades against Donald Trump's
disclosed trades (OGE Form 278-T filings), looking for same-ticker,
same-direction (buy/sell) trades within N days of each other.

Data source: kadoa-org/congress-trading-monitor (public, MIT-licensed),
which aggregates House Clerk, Senate eFD, and OGE executive-branch
disclosures into one normalized dataset.

This is a TIMING correlation, not proof of coordination or insider
knowledge. It only tells you two people traded the same stock in the
same direction within a window of each other -- that can happen by
chance, especially for high-volume traders and popular tickers (AAPL,
NVDA, MSFT, etc).
"""

import glob
import json
import sys
from collections import defaultdict
from datetime import datetime, timedelta

FILERS_PATH = "raw_data/filers.json"
TRUMP_FILER_PATH = "raw_data/trump_filer.json"
CONGRESS_FILER_GLOB = "raw_data/filers/*.json"
TICKER_FALLBACK_PATH = "ticker_fallback.json"
WINDOW_DAYS = 5
TRUMP_FILER_ID = "oge_donald_trump"

with open(TICKER_FALLBACK_PATH) as f:
    TICKER_FALLBACK = {k.upper(): v for k, v in json.load(f).items()}


def resolve_ticker(trade):
    """The source dataset leaves ~86% of Trump's trades with no ticker
    (mostly because its resolver dictionary doesn't cover them -- these
    are mostly ordinary large-cap stocks, not exotic instruments). Fill
    in the gap from a manually-built name->ticker map for the highest-
    frequency unresolved names. Bonds/money-market funds/preferreds are
    deliberately left unmapped -- they don't have a tradeable ticker."""
    ticker = (trade.get("ticker") or "").upper().strip()
    if ticker:
        return ticker
    name = (trade.get("asset_name") or "").upper().strip()
    return TICKER_FALLBACK.get(name, "")


def normalize_side(transaction_type):
    if not transaction_type:
        return None
    t = transaction_type.lower()
    if "purchase" in t or t == "buy":
        return "buy"
    if "sale" in t or t == "sell":
        return "sell"
    return None


def parse_date(s):
    if not s:
        return None
    for fmt in ("%Y-%m-%d", "%m/%d/%Y"):
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            continue
    return None


def load():
    trades = []

    with open(TRUMP_FILER_PATH) as f:
        trades.extend(json.load(f)["trades"])

    skipped_files = []
    for path in sorted(glob.glob(CONGRESS_FILER_GLOB)):
        try:
            with open(path) as f:
                data = json.load(f)
            trades.extend(data["trades"])
        except (json.JSONDecodeError, KeyError):
            skipped_files.append(path)
    if skipped_files:
        print(f"Warning: skipped {len(skipped_files)} unparseable filer files "
              f"(likely incomplete downloads): {skipped_files[:5]}...")

    with open(FILERS_PATH) as f:
        filers = {f_["id"]: f_ for f_ in json.load(f)}
    return trades, filers


def build_trump_index(trades):
    """ticker -> side -> sorted list of dates"""
    idx = defaultdict(lambda: defaultdict(list))
    for t in trades:
        if t.get("filer_id") != TRUMP_FILER_ID:
            continue
        d = parse_date(t.get("transaction_date"))
        side = normalize_side(t.get("transaction_type"))
        ticker = resolve_ticker(t)
        if not d or not side or not ticker:
            continue
        idx[ticker][side].append(d)
    for ticker in idx:
        for side in idx[ticker]:
            idx[ticker][side].sort()
    return idx


def nearest_trump_match(trump_dates, target_date, window_days):
    best = None
    for d in trump_dates:
        delta = abs((d - target_date).days)
        if delta <= window_days:
            if best is None or delta < best[0]:
                best = (delta, d)
    return best


def main():
    window = int(sys.argv[1]) if len(sys.argv) > 1 else WINDOW_DAYS
    trades, filers = load()
    trump_idx = build_trump_index(trades)
    total_trump_trades = sum(
        len(dates) for sides in trump_idx.values() for dates in sides.values()
    )
    print(f"Loaded {len(trades)} total trades, {len(filers)} filers.")
    print(f"Trump trades indexed: {total_trump_trades}. Window: +/-{window} days.\n")

    per_filer_matches = defaultdict(list)
    per_filer_trade_count = defaultdict(int)

    for t in trades:
        filer_id = t.get("filer_id")
        filer = filers.get(filer_id)
        if not filer or filer.get("branch") != "congress":
            continue
        side = normalize_side(t.get("transaction_type"))
        ticker = resolve_ticker(t)
        d = parse_date(t.get("transaction_date"))
        if not side or not ticker or not d:
            continue

        per_filer_trade_count[filer_id] += 1

        trump_dates = trump_idx.get(ticker, {}).get(side, [])
        if not trump_dates:
            continue
        match = nearest_trump_match(trump_dates, d, window)
        if match:
            delta_days, trump_date = match
            per_filer_matches[filer_id].append(
                {
                    "ticker": ticker,
                    "side": side,
                    "member_date": t.get("transaction_date"),
                    "trump_date": trump_date.strftime("%Y-%m-%d"),
                    "delta_days": delta_days,
                    "amount_range": t.get("amount_range_label"),
                }
            )

    ranked = []
    for filer_id, matches in per_filer_matches.items():
        filer = filers[filer_id]
        total = per_filer_trade_count[filer_id]
        ranked.append(
            {
                "filer_id": filer_id,
                "name": filer.get("full_name"),
                "chamber": filer.get("chamber"),
                "party": filer.get("party"),
                "state": filer.get("state"),
                "match_count": len(matches),
                "total_trades": total,
                "match_rate": round(len(matches) / total * 100, 1) if total else 0,
                "sample_matches": sorted(matches, key=lambda m: m["delta_days"])[:5],
            }
        )

    ranked.sort(key=lambda r: (-r["match_count"], r["match_rate"] * -1))

    print(f"{'Rank':<5}{'Name':<28}{'Chmb':<7}{'Party':<6}{'Matches':<9}{'OwnTrades':<11}{'MatchRate'}")
    for i, r in enumerate(ranked[:10], 1):
        print(
            f"{i:<5}{r['name']:<28}{(r['chamber'] or ''):<7}{(r['party'] or ''):<6}"
            f"{r['match_count']:<9}{r['total_trades']:<11}{r['match_rate']}%"
        )

    with open("output/top10_matches.json", "w") as f:
        json.dump(ranked[:10], f, indent=2)
    with open("output/all_matches.json", "w") as f:
        json.dump(ranked, f, indent=2)

    print("\nFull results written to output/top10_matches.json and output/all_matches.json")


if __name__ == "__main__":
    main()
