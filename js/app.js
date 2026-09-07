/*
 * Trump Trade Tracker -- paper trading sim + watchlist + timeline + journal.
 * No backend. Everything lives in localStorage. Live-ish quotes come from
 * Finnhub's free tier if you supply an API key in Settings; otherwise you
 * enter prices by hand.
 */

const STORAGE_KEY = "trumpTradeSim.v1";
const STARTING_CASH = 100;

let state = loadState();
let lastQuotes = {}; // symbol -> { price, ts }

// ---------- state ----------

function defaultState() {
  return {
    cash: STARTING_CASH,
    holdings: {}, // symbol -> { shares, avgCost }
    transactions: [], // { id, ts, symbol, side, shares, price, total }
    snapshots: [{ ts: Date.now(), value: STARTING_CASH }],
    journal: [], // { id, ts, title, note, symbol }
    followed: [], // array of filer_id (Congress tab)
    settings: {
      finnhubKey: "",
      congressConfig: { rankBy: "timing", window: 5, chamber: "all", party: "all", minTrades: 0 },
    },
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    const merged = Object.assign(defaultState(), parsed);
    merged.settings = Object.assign(defaultState().settings, parsed.settings || {});
    merged.settings.congressConfig = Object.assign(
      defaultState().settings.congressConfig,
      (parsed.settings || {}).congressConfig || {}
    );
    return merged;
  } catch (e) {
    console.error("Failed to load state, starting fresh.", e);
    return defaultState();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

// ---------- quotes ----------

async function fetchQuote(symbol) {
  const key = state.settings.finnhubKey.trim();
  if (!key) {
    throw new Error("No Finnhub API key set. Add one in Settings, or enter the price manually.");
  }
  const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(key)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Quote request failed (HTTP ${res.status})`);
  const data = await res.json();
  if (!data || typeof data.c !== "number" || data.c === 0) {
    throw new Error(`No quote data for "${symbol}". Check the symbol.`);
  }
  lastQuotes[symbol] = { price: data.c, change: data.dp, ts: Date.now() };
  return data.c;
}

// ---------- portfolio math ----------

function holdingsValue() {
  let total = 0;
  for (const [sym, h] of Object.entries(state.holdings)) {
    const price = lastQuotes[sym] ? lastQuotes[sym].price : h.avgCost;
    total += price * h.shares;
  }
  return total;
}

function totalValue() {
  return state.cash + holdingsValue();
}

function takeSnapshot() {
  state.snapshots.push({ ts: Date.now(), value: totalValue() });
  if (state.snapshots.length > 500) state.snapshots.shift();
}

function executeTrade(symbol, side, shares, price) {
  symbol = symbol.trim().toUpperCase();
  shares = Number(shares);
  price = Number(price);
  if (!symbol) throw new Error("Enter a ticker symbol.");
  if (!(shares > 0)) throw new Error("Shares must be a positive number.");
  if (!(price > 0)) throw new Error("Price must be a positive number.");

  const cost = shares * price;

  if (side === "buy") {
    if (cost > state.cash + 1e-9) {
      throw new Error(`Not enough cash. This trade costs $${cost.toFixed(2)}, you have $${state.cash.toFixed(2)}.`);
    }
    state.cash -= cost;
    const existing = state.holdings[symbol];
    if (existing) {
      const totalShares = existing.shares + shares;
      existing.avgCost = (existing.avgCost * existing.shares + cost) / totalShares;
      existing.shares = totalShares;
    } else {
      state.holdings[symbol] = { shares, avgCost: price };
    }
  } else {
    const existing = state.holdings[symbol];
    if (!existing || existing.shares < shares - 1e-9) {
      throw new Error(`You don't own ${shares} shares of ${symbol} to sell.`);
    }
    existing.shares -= shares;
    state.cash += cost;
    if (existing.shares < 1e-9) delete state.holdings[symbol];
  }

  state.transactions.unshift({
    id: uid(),
    ts: Date.now(),
    symbol,
    side,
    shares,
    price,
    total: cost,
  });

  lastQuotes[symbol] = { price, change: lastQuotes[symbol] ? lastQuotes[symbol].change : 0, ts: Date.now() };
  takeSnapshot();
  saveState();
}

// ---------- rendering: shell ----------

function fmtMoney(n) {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

function fmtPct(n) {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

function switchTab(name) {
  document.querySelectorAll("nav.tabs button").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === name);
  });
  document.querySelectorAll("main .panel").forEach((p) => {
    p.classList.toggle("active", p.id === `panel-${name}`);
  });
  if (name === "watchlist") renderWatchlist();
  if (name === "congress") renderCongressPanel();
}

function renderStatBar() {
  const tv = totalValue();
  const pnl = tv - STARTING_CASH;
  const pnlPct = (pnl / STARTING_CASH) * 100;
  document.getElementById("stat-cash").textContent = fmtMoney(state.cash);
  document.getElementById("stat-holdings").textContent = fmtMoney(holdingsValue());
  document.getElementById("stat-total").textContent = fmtMoney(tv);
  const pnlEl = document.getElementById("stat-pnl");
  pnlEl.textContent = `${fmtMoney(pnl)} (${fmtPct(pnlPct)})`;
  pnlEl.classList.toggle("good", pnl >= 0);
  pnlEl.classList.toggle("bad", pnl < 0);
}

// ---------- rendering: portfolio panel ----------

function renderHoldingsTable() {
  const tbody = document.getElementById("holdings-body");
  const rows = Object.entries(state.holdings);
  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state">No positions yet. Place a trade below.</div></td></tr>`;
    return;
  }
  tbody.innerHTML = rows
    .map(([sym, h]) => {
      const price = lastQuotes[sym] ? lastQuotes[sym].price : h.avgCost;
      const value = price * h.shares;
      const pnl = value - h.avgCost * h.shares;
      const pnlPct = (pnl / (h.avgCost * h.shares)) * 100;
      return `<tr>
        <td>${sym}</td>
        <td>${h.shares.toFixed(4).replace(/\.?0+$/, "")}</td>
        <td>${fmtMoney(h.avgCost)}</td>
        <td>${fmtMoney(price)}</td>
        <td>${fmtMoney(value)}</td>
        <td class="${pnl >= 0 ? "good" : "bad"}" style="color:${pnl >= 0 ? "var(--good-text)" : "var(--critical)"}">${fmtMoney(pnl)} (${fmtPct(pnlPct)})</td>
      </tr>`;
    })
    .join("");
}

function renderTransactionsTable() {
  const tbody = document.getElementById("tx-body");
  if (state.transactions.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state">No trades yet.</div></td></tr>`;
    return;
  }
  tbody.innerHTML = state.transactions
    .slice(0, 50)
    .map(
      (t) => `<tr>
        <td>${new Date(t.ts).toLocaleDateString()}</td>
        <td><span class="pill ${t.side}">${t.side}</span></td>
        <td>${t.symbol}</td>
        <td>${t.shares} @ ${fmtMoney(t.price)}</td>
        <td>${fmtMoney(t.total)}</td>
      </tr>`
    )
    .join("");
}

async function handleFetchPriceClick() {
  const symEl = document.getElementById("trade-symbol");
  const priceEl = document.getElementById("trade-price");
  const statusEl = document.getElementById("trade-status");
  const sym = symEl.value.trim().toUpperCase();
  if (!sym) return;
  statusEl.textContent = "Fetching quote...";
  try {
    const price = await fetchQuote(sym);
    priceEl.value = price.toFixed(2);
    statusEl.textContent = `${sym} last price: $${price.toFixed(2)}`;
  } catch (e) {
    statusEl.textContent = e.message;
  }
}

function handleTradeSubmit(side) {
  const symEl = document.getElementById("trade-symbol");
  const sharesEl = document.getElementById("trade-shares");
  const priceEl = document.getElementById("trade-price");
  const statusEl = document.getElementById("trade-status");
  try {
    executeTrade(symEl.value, side, sharesEl.value, priceEl.value);
    statusEl.textContent = `${side === "buy" ? "Bought" : "Sold"} ${sharesEl.value} ${symEl.value.toUpperCase()} @ $${Number(priceEl.value).toFixed(2)}.`;
    sharesEl.value = "";
    renderAll();
  } catch (e) {
    statusEl.textContent = e.message;
  }
}

function renderPortfolioPanel() {
  renderHoldingsTable();
  renderTransactionsTable();
  drawPortfolioChart();
}

// ---------- rendering: watchlist panel ----------

function renderWatchlistSkeleton() {
  const el = document.getElementById("watchlist-body");
  el.innerHTML = WATCHLIST.map(
    (w) => `<div class="watchlist-row" data-symbol="${w.symbol}">
      <div>
        <span class="sym">${w.symbol}</span>
        <span class="pill ${w.group}" style="margin-left:8px;">${w.group}</span>
        <div class="meta">${w.label} -- ${w.note}</div>
      </div>
      <div style="display:flex; align-items:center; gap:10px;">
        <span class="price" id="price-${w.symbol}">--</span>
        <button class="btn secondary" data-quick-buy="${w.symbol}">Buy</button>
      </div>
    </div>`
  ).join("");

  el.querySelectorAll("[data-quick-buy]").forEach((btn) => {
    btn.addEventListener("click", () => {
      switchTab("portfolio");
      document.getElementById("trade-symbol").value = btn.dataset.quickBuy;
      handleFetchPriceClick();
    });
  });
}

async function renderWatchlist() {
  if (!state.settings.finnhubKey.trim()) {
    document.getElementById("watchlist-warning").style.display = "block";
  } else {
    document.getElementById("watchlist-warning").style.display = "none";
  }
  for (const w of WATCHLIST) {
    const priceEl = document.getElementById(`price-${w.symbol}`);
    if (!priceEl) continue;
    if (!state.settings.finnhubKey.trim()) {
      priceEl.textContent = "no API key";
      continue;
    }
    try {
      const price = await fetchQuote(w.symbol);
      const chg = lastQuotes[w.symbol].change;
      const chgStr = typeof chg === "number" ? ` (${fmtPct(chg)})` : "";
      priceEl.textContent = `$${price.toFixed(2)}${chgStr}`;
      priceEl.style.color = chg >= 0 ? "var(--good-text)" : "var(--critical)";
    } catch (e) {
      priceEl.textContent = "error";
      priceEl.title = e.message;
    }
  }
  renderHoldingsTable();
}

// ---------- rendering: congress panel ----------

const CONGRESS_METRIC_INFO = {
  timing: "Same ticker, same direction as a Trump trade, within the configured window. Raw count/rate -- easy to over-read on its own; see the chance-corrected metric before trusting a name here.",
  permutation: "Members whose match count beats a random shuffle of their OWN trade dates (p<0.05, lower = stronger). Corrects the raw timing match for \"trades a lot\" / \"trades popular stocks\" effects.",
  performance: "Ranked by median return-vs-market (excess_since) on their own disclosed trades -- independent of Trump entirely. Answers \"do their trades make money,\" not \"do they copy Trump.\"",
  committee: "Ranked by lift: how much more their trades concentrate in their own committees' sectors than market-wide baseline predicts. Positive lift = trading their own jurisdiction more than chance would suggest.",
};

function congressConfig() {
  return state.settings.congressConfig;
}

function getCongressLeaderboard() {
  if (typeof CONGRESS_DATA === "undefined") return [];
  const cfg = congressConfig();
  let rows = [];

  if (cfg.rankBy === "timing") {
    rows = (CONGRESS_DATA.matches_by_window[String(cfg.window)] || []).map((r) => ({
      ...r,
      metricPrimary: `${r.match_count}`,
      metricSecondary: `${r.match_rate}%`,
    }));
  } else if (cfg.rankBy === "permutation") {
    rows = (CONGRESS_DATA.permutation_by_window[String(cfg.window)] || []).map((r) => ({
      filer_id: r.filer_id,
      name: r.name,
      chamber: r.chamber,
      party: r.party,
      state: r.state,
      total_trades: r.own_trades_used,
      metricPrimary: `p=${r.p_value}`,
      metricSecondary: `${r.observed_matches} matches`,
    }));
  } else if (cfg.rankBy === "performance") {
    rows = CONGRESS_DATA.performance_leaderboard.map((r) => ({
      filer_id: r.filer_id,
      name: r.name,
      chamber: r.chamber,
      party: r.party,
      state: r.state,
      total_trades: r.trades_scored,
      metricPrimary: r.median_decision_score,
      metricSecondary: `avg ${r.avg_decision_score}`,
    }));
  } else if (cfg.rankBy === "committee") {
    rows = CONGRESS_DATA.committee_conflicts.map((r) => ({
      filer_id: r.filer_id,
      name: r.name,
      chamber: r.chamber,
      party: r.party,
      state: r.state,
      total_trades: r.sector_tagged_trades,
      metricPrimary: `${r.lift_pct > 0 ? "+" : ""}${r.lift_pct}`,
      metricSecondary: `${r.in_jurisdiction_pct}% vs ${r.baseline_pct}% base`,
    }));
  }

  return rows.filter((r) => {
    if (cfg.chamber !== "all" && r.chamber !== cfg.chamber) return false;
    if (cfg.party !== "all" && r.party !== cfg.party) return false;
    if (cfg.minTrades && (r.total_trades || 0) < Number(cfg.minTrades)) return false;
    return true;
  });
}

function renderCongressPanel() {
  const cfg = congressConfig();
  const metricLabels = {
    timing: "Timing match (raw)",
    permutation: "Timing match (chance-corrected)",
    performance: "Trade performance",
    committee: "Committee/sector lift",
  };
  document.getElementById("congress-active-config").textContent =
    `${metricLabels[cfg.rankBy]}, ${["timing", "permutation"].includes(cfg.rankBy) ? `±${cfg.window}d, ` : ""}` +
    `chamber: ${cfg.chamber}, party: ${cfg.party}`;
  document.getElementById("congress-metric-explainer").textContent = CONGRESS_METRIC_INFO[cfg.rankBy] || "";

  const head = document.getElementById("congress-table-head");
  const metricColLabel = {
    timing: ["Matches", "Rate"],
    permutation: ["p-value", "Matches"],
    performance: ["Median score", "Avg"],
    committee: ["Lift", "Detail"],
  }[cfg.rankBy];
  head.innerHTML = `<th>Name</th><th>Chamber</th><th>Party</th><th>${metricColLabel[0]}</th><th>${metricColLabel[1]}</th><th></th>`;

  const rows = getCongressLeaderboard();
  const body = document.getElementById("congress-leaderboard-body");
  if (typeof CONGRESS_DATA === "undefined") {
    body.innerHTML = `<tr><td colspan="6"><div class="empty-state">Congress data bundle (js/congress-data.js) didn't load.</div></td></tr>`;
    return;
  }
  if (rows.length === 0) {
    body.innerHTML = `<tr><td colspan="6"><div class="empty-state">No members match the current filters. Loosen them in Settings &rarr; Tracking config.</div></td></tr>`;
    return;
  }
  body.innerHTML = rows
    .map((r) => {
      const isFollowed = state.followed.includes(r.filer_id);
      return `<tr>
        <td>${escapeHtml(r.name)}</td>
        <td>${r.chamber || ""}</td>
        <td>${r.party || ""}</td>
        <td>${r.metricPrimary}</td>
        <td>${r.metricSecondary}</td>
        <td><button class="btn ${isFollowed ? "danger" : "secondary"}" data-follow-toggle="${r.filer_id}">${isFollowed ? "Unfollow" : "Follow"}</button></td>
      </tr>`;
    })
    .join("");

  body.querySelectorAll("[data-follow-toggle]").forEach((btn) => {
    btn.addEventListener("click", () => handleFollowToggle(btn.dataset.followToggle));
  });

  renderFollowedSection();
}

function handleFollowToggle(filerId) {
  const idx = state.followed.indexOf(filerId);
  if (idx >= 0) state.followed.splice(idx, 1);
  else state.followed.push(filerId);
  saveState();
  renderCongressPanel();
  renderSettings();
}

function renderFollowedSection() {
  const el = document.getElementById("followed-body");
  if (typeof CONGRESS_DATA === "undefined" || state.followed.length === 0) {
    el.innerHTML = `<div class="empty-state">Not following anyone yet. Hit "Follow" on someone in the leaderboard above.</div>`;
    return;
  }
  el.innerHTML = state.followed
    .map((filerId) => {
      const member = CONGRESS_DATA.members[filerId];
      const trades = CONGRESS_DATA.recent_trades[filerId] || [];
      if (!member) return "";
      const tradeRows = trades
        .slice(0, 8)
        .map((t) => {
          const side = (t.type || "").toLowerCase().includes("purchase") ? "buy" : "sell";
          return `<tr>
            <td>${t.date || "?"}</td>
            <td><span class="pill ${side}">${side}</span></td>
            <td>${t.ticker ? escapeHtml(t.ticker) : `<span title="${escapeHtml(t.asset_name || "")}">(unresolved)</span>`}</td>
            <td>${escapeHtml(t.amount_range || "")}</td>
            <td>
              ${t.ticker ? `<button class="btn secondary" data-quick-buy="${t.ticker}">Quick buy</button>` : ""}
              <button class="btn secondary" data-log-trade='${escapeHtml(JSON.stringify(t))}'>Log to journal</button>
            </td>
          </tr>`;
        })
        .join("");
      return `<div class="card" style="margin-bottom:12px;">
        <h2 style="font-size:14px;">${escapeHtml(member.name)} <span class="pill family">${member.chamber || ""}</span></h2>
        <table>
          <thead><tr><th>Date</th><th>Side</th><th>Ticker</th><th>Amount</th><th></th></tr></thead>
          <tbody>${tradeRows || `<tr><td colspan="5"><div class="empty-state">No resolved recent trades on file.</div></td></tr>`}</tbody>
        </table>
      </div>`;
    })
    .join("");

  el.querySelectorAll("[data-quick-buy]").forEach((btn) => {
    btn.addEventListener("click", () => {
      switchTab("portfolio");
      document.getElementById("trade-symbol").value = btn.dataset.quickBuy;
      handleFetchPriceClick();
    });
  });
  el.querySelectorAll("[data-log-trade]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const t = JSON.parse(btn.dataset.logTrade);
      state.journal.push({
        id: uid(),
        ts: Date.now(),
        title: `Disclosed: ${t.type || "trade"} of ${t.ticker || t.asset_name || "unknown"}`,
        note: `Trade date ${t.date || "?"}, amount ${t.amount_range || "?"}. Filed ${t.filing_date || "?"}.`,
        symbol: t.ticker || "",
      });
      saveState();
      renderJournal();
      btn.textContent = "Logged!";
      btn.disabled = true;
    });
  });
}

// ---------- rendering: timeline panel ----------

function renderTimeline() {
  const el = document.getElementById("timeline-body");
  const items = [...TIMELINE].sort((a, b) => (a.date < b.date ? -1 : 1));
  el.innerHTML = items
    .map(
      (item) => `<div class="timeline-item">
        <div class="timeline-date">${item.date}</div>
        <div class="timeline-body">
          <div class="term">${item.term}</div>
          <div class="title">${escapeHtml(item.title)}</div>
          <div class="detail">${escapeHtml(item.detail)}</div>
        </div>
      </div>`
    )
    .join("");
}

// ---------- rendering: journal panel ----------

function renderJournal() {
  const el = document.getElementById("journal-body");
  if (state.journal.length === 0) {
    el.innerHTML = `<div class="empty-state">No signals logged yet. Use this to note things like "Trump announced tariffs on X" and whether you traded on it.</div>`;
    return;
  }
  el.innerHTML = state.journal
    .slice()
    .sort((a, b) => b.ts - a.ts)
    .map(
      (j) => `<div class="timeline-item">
        <div class="timeline-date">${new Date(j.ts).toLocaleDateString()}</div>
        <div class="timeline-body">
          ${j.symbol ? `<div class="term">${escapeHtml(j.symbol)}</div>` : ""}
          <div class="title">${escapeHtml(j.title)}</div>
          <div class="detail">${escapeHtml(j.note)}</div>
        </div>
      </div>`
    )
    .join("");
}

function handleJournalSubmit() {
  const titleEl = document.getElementById("journal-title");
  const noteEl = document.getElementById("journal-note");
  const symEl = document.getElementById("journal-symbol");
  if (!titleEl.value.trim()) return;
  state.journal.push({
    id: uid(),
    ts: Date.now(),
    title: titleEl.value.trim(),
    note: noteEl.value.trim(),
    symbol: symEl.value.trim().toUpperCase(),
  });
  titleEl.value = "";
  noteEl.value = "";
  symEl.value = "";
  saveState();
  renderJournal();
}

// ---------- rendering: settings panel ----------

function renderSettings() {
  document.getElementById("settings-key").value = state.settings.finnhubKey;

  const cfg = congressConfig();
  document.getElementById("config-rank-by").value = cfg.rankBy;
  document.getElementById("config-window").value = String(cfg.window);
  document.getElementById("config-chamber").value = cfg.chamber;
  document.getElementById("config-party").value = cfg.party;
  document.getElementById("config-min-trades").value = cfg.minTrades;

  document.getElementById("followed-count").textContent = state.followed.length;
  const inlineEl = document.getElementById("followed-list-inline");
  if (state.followed.length === 0) {
    inlineEl.textContent = "none yet -- follow someone from the Congress tab.";
  } else if (typeof CONGRESS_DATA !== "undefined") {
    inlineEl.innerHTML = state.followed
      .map((id) => {
        const m = CONGRESS_DATA.members[id];
        return m ? `${escapeHtml(m.name)} <button class="btn secondary" data-unfollow="${id}" style="padding:2px 8px; font-size:11px;">x</button>` : "";
      })
      .join(" &middot; ");
    inlineEl.querySelectorAll("[data-unfollow]").forEach((btn) => {
      btn.addEventListener("click", () => handleFollowToggle(btn.dataset.unfollow));
    });
  }
}

function handleSaveSettings() {
  state.settings.finnhubKey = document.getElementById("settings-key").value.trim();
  saveState();
  document.getElementById("settings-status").textContent = "Saved.";
}

function handleSaveConfig() {
  state.settings.congressConfig = {
    rankBy: document.getElementById("config-rank-by").value,
    window: Number(document.getElementById("config-window").value),
    chamber: document.getElementById("config-chamber").value,
    party: document.getElementById("config-party").value,
    minTrades: Number(document.getElementById("config-min-trades").value) || 0,
  };
  saveState();
  document.getElementById("config-status").textContent = "Saved -- check the Congress tab.";
}

function handleResetPortfolio() {
  if (!confirm("Reset your paper portfolio back to $100 cash? This clears holdings and trade history (journal and API key are kept).")) return;
  const kept = { journal: state.journal, settings: state.settings, followed: state.followed };
  state = Object.assign(defaultState(), kept);
  lastQuotes = {};
  saveState();
  renderAll();
}

function handleExport() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `trump-trade-sim-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
}

function handleImport(evt) {
  const file = evt.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      state = Object.assign(defaultState(), parsed);
      saveState();
      renderAll();
      document.getElementById("settings-status").textContent = "Imported.";
    } catch (e) {
      document.getElementById("settings-status").textContent = "Import failed: invalid file.";
    }
  };
  reader.readAsText(file);
}

// ---------- chart ----------

function drawPortfolioChart() {
  const wrap = document.getElementById("chart-wrap");
  const tooltip = document.getElementById("chart-tooltip");
  const points = state.snapshots;
  wrap.querySelectorAll("svg").forEach((s) => s.remove());

  if (points.length < 2) {
    return;
  }

  const width = wrap.clientWidth || 600;
  const height = 200;
  const padL = 44;
  const padR = 10;
  const padT = 14;
  const padB = 24;

  const values = points.map((p) => p.value);
  const minV = Math.min(...values, STARTING_CASH);
  const maxV = Math.max(...values, STARTING_CASH);
  const range = maxV - minV || 1;
  const yFor = (v) => padT + (1 - (v - minV) / range) * (height - padT - padB);
  const xFor = (i) => padL + (i / (points.length - 1)) * (width - padL - padR);

  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("width", width);
  svg.setAttribute("height", height);
  svg.style.display = "block";

  // gridlines + y labels
  const steps = 4;
  for (let i = 0; i <= steps; i++) {
    const v = minV + (range * i) / steps;
    const y = yFor(v);
    const line = document.createElementNS(svgNS, "line");
    line.setAttribute("x1", padL);
    line.setAttribute("x2", width - padR);
    line.setAttribute("y1", y);
    line.setAttribute("y2", y);
    line.setAttribute("stroke", "var(--gridline)");
    line.setAttribute("stroke-width", "1");
    svg.appendChild(line);

    const label = document.createElementNS(svgNS, "text");
    label.setAttribute("x", 4);
    label.setAttribute("y", y + 4);
    label.setAttribute("fill", "var(--text-muted)");
    label.setAttribute("font-size", "10");
    label.textContent = `$${v.toFixed(0)}`;
    svg.appendChild(label);
  }

  // baseline at $100 (starting cash)
  const baseY = yFor(STARTING_CASH);
  const baseline = document.createElementNS(svgNS, "line");
  baseline.setAttribute("x1", padL);
  baseline.setAttribute("x2", width - padR);
  baseline.setAttribute("y1", baseY);
  baseline.setAttribute("y2", baseY);
  baseline.setAttribute("stroke", "var(--baseline)");
  baseline.setAttribute("stroke-width", "1");
  baseline.setAttribute("stroke-dasharray", "3,3");
  svg.appendChild(baseline);

  // line
  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"}${xFor(i)},${yFor(p.value)}`).join(" ");
  const path = document.createElementNS(svgNS, "path");
  path.setAttribute("d", pathD);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "var(--series-1)");
  path.setAttribute("stroke-width", "2");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  svg.appendChild(path);

  // last point marker
  const lastI = points.length - 1;
  const dot = document.createElementNS(svgNS, "circle");
  dot.setAttribute("cx", xFor(lastI));
  dot.setAttribute("cy", yFor(points[lastI].value));
  dot.setAttribute("r", 4);
  dot.setAttribute("fill", "var(--series-1)");
  svg.appendChild(dot);

  // hover layer
  const hoverLine = document.createElementNS(svgNS, "line");
  hoverLine.setAttribute("y1", padT);
  hoverLine.setAttribute("y2", height - padB);
  hoverLine.setAttribute("stroke", "var(--baseline)");
  hoverLine.setAttribute("stroke-width", "1");
  hoverLine.style.display = "none";
  svg.appendChild(hoverLine);

  const overlay = document.createElementNS(svgNS, "rect");
  overlay.setAttribute("x", padL);
  overlay.setAttribute("y", padT);
  overlay.setAttribute("width", Math.max(width - padL - padR, 0));
  overlay.setAttribute("height", height - padT - padB);
  overlay.setAttribute("fill", "transparent");
  overlay.addEventListener("mousemove", (e) => {
    const rect = svg.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const idx = Math.max(0, Math.min(points.length - 1, Math.round(((x - padL) / (width - padL - padR)) * (points.length - 1))));
    const p = points[idx];
    hoverLine.setAttribute("x1", xFor(idx));
    hoverLine.setAttribute("x2", xFor(idx));
    hoverLine.style.display = "block";
    tooltip.style.display = "block";
    tooltip.style.left = `${xFor(idx) + 8}px`;
    tooltip.style.top = `${yFor(p.value) - 10}px`;
    tooltip.innerHTML = `<strong>${fmtMoney(p.value)}</strong><br>${new Date(p.ts).toLocaleString()}`;
  });
  overlay.addEventListener("mouseleave", () => {
    hoverLine.style.display = "none";
    tooltip.style.display = "none";
  });
  svg.appendChild(overlay);

  wrap.appendChild(svg);
}

// ---------- misc ----------

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

function renderAll() {
  renderStatBar();
  renderPortfolioPanel();
  renderTimeline();
  renderJournal();
  renderSettings();
}

// ---------- wire up ----------

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("nav.tabs button").forEach((b) => {
    b.addEventListener("click", () => switchTab(b.dataset.tab));
  });

  document.getElementById("btn-fetch-price").addEventListener("click", handleFetchPriceClick);
  document.getElementById("btn-buy").addEventListener("click", () => handleTradeSubmit("buy"));
  document.getElementById("btn-sell").addEventListener("click", () => handleTradeSubmit("sell"));

  document.getElementById("btn-journal-add").addEventListener("click", handleJournalSubmit);

  document.getElementById("btn-save-settings").addEventListener("click", handleSaveSettings);
  document.getElementById("btn-save-config").addEventListener("click", handleSaveConfig);
  document.getElementById("btn-reset-portfolio").addEventListener("click", handleResetPortfolio);
  document.getElementById("btn-export").addEventListener("click", handleExport);
  document.getElementById("import-file").addEventListener("change", handleImport);

  document.getElementById("theme-toggle").addEventListener("click", () => {
    const root = document.documentElement;
    const current = root.getAttribute("data-theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = current === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
    drawPortfolioChart();
  });
  const savedTheme = localStorage.getItem("theme");
  if (savedTheme) document.documentElement.setAttribute("data-theme", savedTheme);

  renderWatchlistSkeleton();
  renderAll();
  window.addEventListener("resize", () => drawPortfolioChart());
});
