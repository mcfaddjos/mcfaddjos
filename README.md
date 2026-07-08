## Hi, I’m Joseph!

I am an ameture software engineer in the data analysis sector of the aeronautical world. 
My background primarily pertains to Mechanical Engineering though I decided to make a change 
in careers.

### It is my personal goal to expand my knowledge and experiance one project at a time. Wish me Luck!

---

## Trump Trade Tracker (paper trading sim)

A small local web app for paper-trading with a fake $100 balance, loosely themed around
tracking Trump/Trump-family-linked stocks and market-moving news.

### Reality check first

There is **no live feed of "Trump's stock trades."** The STOCK Act, which forces Congress
to publicly report individual trades within days, does not apply to the President. Trump
only files an annual OGE-278 financial disclosure — asset value *ranges*, not buy/sell
transactions. So this tool is built around what's actually available:

- **DJT** (Trump Media & Technology Group / Truth Social) — the one publicly traded stock
  Trump/his family actually holds equity in.
- A curated **watchlist** of stocks that historically move on Trump policy news (tariffs,
  defense, crypto policy) — these are *not* companies he owns, just correlated plays.
- A hand-curated **timeline** of disclosure filings and market-moving events (`js/data.js`)
  covering both terms — seed data, verify before relying on it, and extend it yourself.
- A **journal** tab for manually logging news/signals as you see them, since there's no
  automated feed to hook into a static, no-backend app.

### Running it

No build step, no install. From this folder:

```
python3 -m http.server 8000
```

then open `http://localhost:8000`. (Opening `index.html` directly by double-clicking
mostly works too, but a local server avoids occasional browser quirks with `fetch`.)

### Live prices (optional)

Sign up for a free API key at [finnhub.io](https://finnhub.io), paste it into the
Settings tab. The key is stored only in your browser's `localStorage` and is sent
directly to Finnhub — never to any other server. Without a key, you can still trade by
typing prices in manually.

### Data

Everything (cash balance, holdings, trade history, journal, portfolio value chart,
API key) lives in `localStorage` in your browser — nothing leaves your machine except
the direct calls to Finnhub for quotes. Use the Settings tab to export/import a JSON
backup or reset back to $100.

### On wiring this into real trades later

This app is intentionally a static, no-backend page, so it only checks prices when
you have it open — it can't watch the market or auto-trade for you. If/when you want
to go further:

- **Automated tracking without a full backend:** this repo lives in a Claude Code
  environment that supports scheduled sessions (cron-style "Routines"). One could be
  set up to periodically research Trump-related market news and append entries to
  `js/data.js` / the journal, then commit — ask if you want that wired up.
- **Real broker APIs, if you want to eventually place real orders:**
  - **Alpaca** — commission-free, has an official public API with a first-class
    *paper trading* sandbox that mirrors the live trading API 1:1. This is the natural
    next step: point this same buy/sell logic at Alpaca's paper endpoint before ever
    touching real money.
  - **Interactive Brokers (IBKR)** — more powerful/flexible official API, steeper setup.
  - **Tradier** — brokerage with a developer API and its own paper trading sandbox.
  - **Robinhood** — has **no official public trading API**. Unofficial reverse-engineered
    libraries exist, but using them violates Robinhood's terms of service and risks
    account suspension — not recommended for anything automated.

None of this is financial advice, and paper-trading results don't account for real-world
slippage, fees, or execution risk.
