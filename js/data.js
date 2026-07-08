/*
 * Seed data for the Trump Trade Tracker.
 *
 * IMPORTANT HONESTY NOTE (read before trusting any of this):
 * The President is NOT covered by the STOCK Act's real-time Periodic
 * Transaction Report requirement -- that only applies to Congress. The
 * President only files an annual OGE-278 financial disclosure, which shows
 * asset VALUE RANGES, not individual buy/sell trades or dates. So there is
 * no live "Trump bought X shares of Y on this date" feed to plug into.
 *
 * What this file actually contains:
 *  - TIMELINE: hand-curated, high-level public events relevant to Trump's
 *    disclosed financial interests and market-moving actions. Dates are
 *    best-effort and should be independently verified before you rely on
 *    them. Fill in `source` with a URL once you've checked one.
 *  - WATCHLIST: a starter list of tickers. "family" = an asset Trump or his
 *    family actually holds an equity stake in (currently just DJT).
 *    "policy" = stocks that historically move on Trump-driven news (tariffs,
 *    defense spending, crypto policy) -- NOT companies he owns.
 *
 * Add to both arrays over time as you find/verify more events.
 */

const TIMELINE = [
  {
    date: "2017-01-20",
    term: "1st term",
    title: "Inauguration; assets moved to a trust",
    detail:
      "Trump takes office. Business operations are handed to a trust managed by his sons rather than being sold off. No real-time trade disclosure requirement applies to the presidency.",
    source: "",
  },
  {
    date: "2017-2020",
    term: "1st term",
    title: "Annual OGE-278 financial disclosures filed",
    detail:
      "Each year in office, an annual public financial disclosure (asset value ranges, not individual trades) was filed. Useful for net-worth-composition context, not for day-trade signals.",
    source: "",
  },
  {
    date: "2021-10-20",
    term: "post-1st term",
    title: "Trump Media & Technology Group (TMTG) announced",
    detail:
      "TMTG (parent of Truth Social) announces plans to go public via a merger with SPAC Digital World Acquisition Corp (DWAC).",
    source: "",
  },
  {
    date: "2024-03-25",
    term: "pre-2nd term",
    title: "DWAC/TMTG merger completes -- DJT starts trading",
    detail:
      "Trump Media & Technology Group begins trading on Nasdaq under ticker DJT. This is the one publicly-traded, Trump-family-owned equity you can actually buy.",
    source: "",
  },
  {
    date: "2025-01-17",
    term: "2nd term",
    title: "$TRUMP and $MELANIA meme coins launched",
    detail:
      "Days before the second inauguration, Trump-branded and Melania-branded crypto meme coins launched. These are crypto tokens, not equities -- this tracker only trades stocks, so they're listed here for context only.",
    source: "",
  },
  {
    date: "2025-01-20",
    term: "2nd term",
    title: "Second inauguration",
    detail: "Trump sworn in for a second, non-consecutive term.",
    source: "",
  },
  {
    date: "2025",
    term: "2nd term",
    title: "World Liberty Financial (family-linked DeFi project)",
    detail:
      "A DeFi project associated with the Trump family launches token sales. Again, crypto rather than a listed equity.",
    source: "",
  },
  {
    date: "2025-04",
    term: "2nd term",
    title: "\"Liberation Day\" tariff announcement",
    detail:
      "Broad new tariffs announced, triggering a sharp, broad market selloff and volatility spike -- the clearest example of a Trump policy action moving markets directly. Good candidate for the Journal/Signals tab.",
    source: "",
  },
  {
    date: "2025",
    term: "2nd term",
    title: "DJT diversifies into crypto/Bitcoin-treasury strategy",
    detail:
      "Trump Media pursued crypto-adjacent treasury and ETF plans during 2025, driving additional DJT volatility. Verify specifics before trading on this.",
    source: "",
  },
  {
    date: "2026",
    term: "2nd term",
    title: "-- add events here --",
    detail:
      "Anything from 2026 onward is past this tool's seed data. Log new events yourself in the Journal tab, or add a TIMELINE entry here once verified.",
    source: "",
  },
];

const WATCHLIST = [
  {
    symbol: "DJT",
    group: "family",
    label: "Trump Media & Technology Group",
    note: "Truth Social parent. Trump is the largest shareholder.",
  },
  {
    symbol: "LMT",
    group: "policy",
    label: "Lockheed Martin",
    note: "Defense spending / geopolitics sensitive.",
  },
  {
    symbol: "RTX",
    group: "policy",
    label: "RTX (Raytheon)",
    note: "Defense spending / geopolitics sensitive.",
  },
  {
    symbol: "X",
    group: "policy",
    label: "United States Steel",
    note: "Tariff-sensitive (steel/aluminum policy).",
  },
  {
    symbol: "CLF",
    group: "policy",
    label: "Cleveland-Cliffs",
    note: "Tariff-sensitive (steel policy).",
  },
  {
    symbol: "COIN",
    group: "policy",
    label: "Coinbase",
    note: "Sensitive to administration crypto policy stance.",
  },
];
