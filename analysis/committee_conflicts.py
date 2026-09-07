#!/usr/bin/env python3
"""
Flag Congress members whose disclosed trades land disproportionately in
sectors their own committee assignments oversee (the classic "conflict of
interest" pattern -- e.g. an Armed Services member trading defense stocks).

Data:
  - raw_data/committees/legislators-current.yaml,
    committee-membership-current.yaml, committees-current.yaml
    (unitedstates/congress-legislators, public domain)
  - ticker_sector.json (GICS-like sector per ticker, from the
    trump-portfolio-tracker ticker-seed data -- covers ~1,029 tickers,
    not the full universe, so this is a partial-coverage analysis)
  - COMMITTEE_SECTORS below: a hand-curated map from committee to the
    sectors its jurisdiction plausibly touches. This is a judgment call,
    not an official mapping -- committees like Appropriations, Budget,
    Rules, and Ethics are deliberately excluded (jurisdiction too broad
    to mean anything sector-specific).

Output: for each member with enough sector-taggable trades, what fraction
of their trades fall in a sector their committee(s) oversee, vs what
fraction would be expected if their trades were spread evenly across all
sectors they touch (the baseline). A member trading ONLY in their
committee's sectors isn't necessarily doing anything wrong -- committee
assignments often follow a member's pre-existing professional background
(a doctor on Health, a banker on Financial Services) -- but a high,
concentrated overlap is worth knowing either way.
"""

import json
import statistics
import sys
from collections import Counter, defaultdict

import yaml

from match_trump_congress import FILERS_PATH, load

LEGISLATORS_PATH = "raw_data/committees/legislators-current.yaml"
MEMBERSHIP_PATH = "raw_data/committees/committee-membership-current.yaml"
COMMITTEES_PATH = "raw_data/committees/committees-current.yaml"
TICKER_SECTOR_PATH = "ticker_sector.json"
MIN_SECTOR_TRADES = 10

# Committees excluded deliberately (jurisdiction too broad/procedural to be
# sector-specific): Appropriations, Budget, Rules, Ethics, House Admin,
# Small Business, Foreign Affairs/Relations, Oversight, Education & Workforce.
COMMITTEE_SECTORS = {
    "HSAG": {"Consumer Staples", "Materials"},
    "HSAS": {"Industrials"},
    "HSBA": {"Financials", "Real Estate"},
    "HSHM": {"Industrials", "Technology"},
    "HSIF": {"Energy", "Healthcare", "Communication Services", "Utilities"},
    "HSII": {"Energy", "Materials"},
    "HLIG": {"Technology", "Industrials"},
    "HSJU": {"Technology", "Communication Services"},
    "HSPW": {"Industrials", "Real Estate"},
    "HSSY": {"Technology", "Communication Services"},
    "HSVR": {"Healthcare"},
    "SSAF": {"Consumer Staples", "Materials"},
    "SSAS": {"Industrials"},
    "SSBK": {"Financials", "Real Estate"},
    "SSCM": {"Technology", "Communication Services", "Industrials"},
    "SSEG": {"Energy", "Utilities", "Materials"},
    "SSEV": {"Industrials", "Utilities", "Materials"},
    "SSFI": {"Financials", "Healthcare"},
    "SSGA": {"Industrials", "Technology"},
    "SSHR": {"Healthcare"},
    "SSJU": {"Technology", "Communication Services"},
    "SSVA": {"Healthcare"},
    "SLIN": {"Technology", "Industrials"},
    "HSZS": {"Technology", "Industrials"},
}


def normalize_name(first, last):
    return (first + last).lower().replace(" ", "").replace("-", "").replace("'", "").replace(".", "")


def build_bioguide_to_sectors():
    with open(MEMBERSHIP_PATH) as f:
        membership = yaml.safe_load(f)
    bioguide_committees = defaultdict(set)
    for committee_code, members in membership.items():
        base_code = committee_code[:4]  # subcommittee codes extend the 4-char base
        sectors = COMMITTEE_SECTORS.get(base_code)
        if not sectors:
            continue
        for m in members:
            bg = m.get("bioguide")
            if bg:
                bioguide_committees[bg].update(sectors)
    return bioguide_committees


def build_name_to_bioguide():
    with open(LEGISLATORS_PATH) as f:
        legislators = yaml.safe_load(f)
    name_to_bg = {}
    for person in legislators:
        bg = person["id"].get("bioguide")
        name = person.get("name", {})
        key = normalize_name(name.get("first", ""), name.get("last", ""))
        if key and bg:
            name_to_bg[key] = bg
    return name_to_bg


def match_filers_to_bioguide(filers, name_to_bg):
    filer_to_bg = {}
    unmatched = []
    for filer_id, filer in filers.items():
        if filer.get("branch") != "congress":
            continue
        full_name = filer.get("full_name", "")
        parts = full_name.replace(".", "").replace(",", "").split()
        if len(parts) < 2:
            unmatched.append(filer_id)
            continue
        first, last = parts[0], parts[-1]
        key = normalize_name(first, last)
        bg = name_to_bg.get(key)
        if bg:
            filer_to_bg[filer_id] = bg
        else:
            unmatched.append(filer_id)
    return filer_to_bg, unmatched


def main():
    min_trades = int(sys.argv[1]) if len(sys.argv) > 1 else MIN_SECTOR_TRADES

    trades, filers = load()
    ticker_sector = {k.upper(): v["sector"] for k, v in json.load(open(TICKER_SECTOR_PATH)).items()}

    name_to_bg = build_name_to_bioguide()
    filer_to_bg, unmatched = match_filers_to_bioguide(filers, name_to_bg)
    bg_to_sectors = build_bioguide_to_sectors()

    print(f"Matched {len(filer_to_bg)}/{len([f for f in filers.values() if f.get('branch')=='congress'])} "
          f"congress filers to a bioguide ID ({len(unmatched)} unmatched, mostly name-format mismatches).")

    from match_trump_congress import resolve_ticker  # reuse fallback resolver

    by_filer_sectors = defaultdict(list)
    market_sector_counts = Counter()
    for t in trades:
        filer = filers.get(t.get("filer_id"))
        if not filer or filer.get("branch") != "congress":
            continue
        ticker = resolve_ticker(t)
        sector = ticker_sector.get(ticker)
        if not sector:
            continue
        by_filer_sectors[t["filer_id"]].append(sector)
        market_sector_counts[sector] += 1

    # Baseline: what fraction of ALL Congress trades (market-wide) fall in a
    # given set of sectors, if trades were distributed like the overall
    # market rather than concentrated by committee. A member covering more/
    # more-popular sectors (e.g. Technology at 22% of all trades) will have
    # a higher "in jurisdiction" rate for that reason alone -- baseline_pct
    # isolates that so "lift" (observed - baseline) is the real signal.
    market_total = sum(market_sector_counts.values())
    sector_market_share = {s: c / market_total * 100 for s, c in market_sector_counts.items()}

    results = []
    for filer_id, sectors_traded in by_filer_sectors.items():
        if len(sectors_traded) < min_trades:
            continue
        bg = filer_to_bg.get(filer_id)
        member_sectors = bg_to_sectors.get(bg) if bg else None
        if not member_sectors:
            continue  # no sector-mapped committee assignment

        in_jurisdiction = sum(1 for s in sectors_traded if s in member_sectors)
        total = len(sectors_traded)
        baseline_pct = sum(sector_market_share.get(s, 0) for s in member_sectors)
        observed_pct = round(in_jurisdiction / total * 100, 1)
        filer = filers[filer_id]
        results.append(
            {
                "filer_id": filer_id,
                "name": filer.get("full_name"),
                "chamber": filer.get("chamber"),
                "party": filer.get("party"),
                "state": filer.get("state"),
                "committee_sectors": sorted(member_sectors),
                "sector_tagged_trades": total,
                "in_jurisdiction_trades": in_jurisdiction,
                "in_jurisdiction_pct": observed_pct,
                "baseline_pct": round(baseline_pct, 1),
                "lift_pct": round(observed_pct - baseline_pct, 1),
                "top_traded_sectors": Counter(sectors_traded).most_common(3),
            }
        )

    results.sort(key=lambda r: -r["lift_pct"])

    print(f"\n{len(results)} members with a sector-mapped committee AND >= {min_trades} sector-taggable trades.")
    print("Sorted by LIFT (observed in-jurisdiction % minus market-baseline % for those sectors) -- "
          "not raw in-jurisdiction %, which mostly just tracks how many popular sectors a member's "
          "committees happen to cover.\n")

    print(f"{'Name':<28}{'Chmb':<6}{'N':<6}{'Observed':<10}{'Baseline':<10}{'Lift'}")
    for r in results[:15]:
        print(
            f"{r['name']:<28}{(r['chamber'] or ''):<6}{r['sector_tagged_trades']:<6}"
            f"{r['in_jurisdiction_pct']:<10}{r['baseline_pct']:<10}{r['lift_pct']}"
        )

    with open("output/committee_conflicts.json", "w") as f:
        json.dump(results, f, indent=2)
    print(f"\nFull results written to output/committee_conflicts.json")


if __name__ == "__main__":
    main()
