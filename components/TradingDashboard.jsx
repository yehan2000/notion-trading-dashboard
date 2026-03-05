import { useState, useEffect, useCallback } from "react";
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  LineChart,
  Line,
  CartesianGrid,
} from "recharts";

// ── API FETCHERS ────────────────────────────────────────────────────────────
async function fetchTrades() {
  const res = await fetch("/api/trades", { cache: "no-store" });
  if (!res.ok) {
    const js = await res.json().catch(() => ({}));
    throw new Error(js?.details || js?.error || `HTTP ${res.status} (/api/trades)`);
  }
  return res.json();
}

async function fetchAccounts() {
  const res = await fetch("/api/accounts", { cache: "no-store" });
  if (!res.ok) {
    const js = await res.json().catch(() => ({}));
    throw new Error(js?.details || js?.error || `HTTP ${res.status} (/api/accounts)`);
  }
  return res.json();
}

// ── HELPERS ────────────────────────────────────────────────────────────────
const netPnl = (t) => (t.pnl || 0) - Math.abs(t.commission || 0);
const fmt = (n) =>
  n == null ? "—" : n >= 0 ? `+$${Math.abs(n).toFixed(0)}` : `-$${Math.abs(n).toFixed(0)}`;
const fmtK = (n) =>
  n == null
    ? "—"
    : Math.abs(n) >= 1000
    ? `${n >= 0 ? "+" : "-"}$${(Math.abs(n) / 1000).toFixed(1)}K`
    : fmt(n);

function getWeekKey(dateStr) {
  const d = new Date(dateStr);
  const start = new Date(d.getFullYear(), 0, 1);
  return `W${Math.ceil(((d - start) / 86400000 + start.getDay() + 1) / 7)}`;
}

// ── SPINNER ────────────────────────────────────────────────────────────────
function Spinner() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "60vh", gap: 16 }}>
      <div style={{ width: 40, height: 40, border: "2px solid #1e2433", borderTop: "2px solid #4ade80", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <div style={{ color: "#3a4255", fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: 2 }}>LOADING NOTION DATA...</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── KPI CARD ───────────────────────────────────────────────────────────────
function KPICard({ label, value, color, icon, sub }) {
  return (
    <div style={{ flex: 1, background: "#0f1117", border: "1px solid #1e2433", borderRadius: 12, padding: "18px 22px", position: "relative", overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 10, color: "#5a6478", fontFamily: "'DM Mono', monospace", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>{label}</div>
          <div style={{ fontSize: 26, fontWeight: 700, color, fontFamily: "'Syne', sans-serif", lineHeight: 1 }}>{value}</div>
          {sub && <div style={{ fontSize: 10, color: "#5a6478", marginTop: 6 }}>{sub}</div>}
        </div>
        <div style={{ fontSize: 18, opacity: 0.25 }}>{icon}</div>
      </div>
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${color}55, transparent)` }} />
    </div>
  );
}

// ── CALENDAR VIEW ──────────────────────────────────────────────────────────
function CalendarView({ trades, year, month }) {
  const [curMonth, setCurMonth] = useState(month);
  const [curYear, setCurYear] = useState(year);

  const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const days = new Date(curYear, curMonth + 1, 0).getDate();
  const first = new Date(curYear, curMonth, 1).getDay();
  const firstAdj = (first + 6) % 7;

  const byDate = {};
  trades.forEach((t) => {
    if (!t.date) return;
    const d = t.date.slice(0, 10);
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(t);
  });

  const cells = [];
  for (let i = 0; i < firstAdj; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(d);

  const rows = [];
  let weekBuf = [];
  let col = 0;

  cells.forEach((day, i) => {
    if (day === null) {
      rows.push(<div key={`e${i}`} style={{ minHeight: 70, background: "#0a0d14", borderRadius: 6 }} />);
    } else {
      const ds = `${curYear}-${String(curMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const dt = byDate[ds] || [];
      const dp = dt.reduce((s, t) => s + netPnl(t), 0);
      weekBuf.push(...dt);
      rows.push(
        <div key={day} style={{ minHeight: 70, background: dt.length ? (dp >= 0 ? "#0d2117" : "#1a0d0d") : "#0a0d14", borderRadius: 6, padding: "6px 8px", border: dt.length ? `1px solid ${dp >= 0 ? "#1a4a2a" : "#3a1a1a"}` : "1px solid #0f1520" }}>
          <div style={{ fontSize: 10, color: "#3a4255", marginBottom: 3 }}>{day}</div>
          {dt.length > 0 && (
            <>
              <div style={{ fontSize: 9, color: "#5a6478" }}>{dt.length} trade{dt.length > 1 ? "s" : ""}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: dp >= 0 ? "#4ade80" : "#f87171", fontFamily: "'DM Mono',monospace" }}>{fmt(dp)}</div>
            </>
          )}
        </div>
      );
    }
    col++;
    if (col === 7 || i === cells.length - 1) {
      const wp = weekBuf.reduce((s, t) => s + netPnl(t), 0);
      rows.push(
        <div key={`w${i}`} style={{ minHeight: 70, background: "#0c0f1a", borderRadius: 6, padding: "6px 8px", border: "1px solid #0f1520", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          {weekBuf.length > 0 && (
            <>
              <div style={{ fontSize: 9, color: "#5a6478" }}>{weekBuf.length} trades</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: wp >= 0 ? "#4ade80" : "#f87171", fontFamily: "'DM Mono',monospace" }}>{fmt(wp)}</div>
            </>
          )}
        </div>
      );
      col = 0;
      weekBuf = [];
    }
  });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <button onClick={() => { let m = curMonth - 1, y = curYear; if (m < 0) { m = 11; y--; } setCurMonth(m); setCurYear(y); }} style={{ background: "none", border: "1px solid #1e2433", color: "#fff", borderRadius: 6, width: 26, height: 26, cursor: "pointer" }}>‹</button>
        <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 13, color: "#e8eaf0" }}>{MONTHS[curMonth]} {curYear}</span>
        <button onClick={() => { let m = curMonth + 1, y = curYear; if (m > 11) { m = 0; y++; } setCurMonth(m); setCurYear(y); }} style={{ background: "none", border: "1px solid #1e2433", color: "#fff", borderRadius: 6, width: 26, height: 26, cursor: "pointer" }}>›</button>
        <div style={{ marginLeft: "auto", fontSize: 10, color: "#5a6478", fontFamily: "'DM Mono',monospace" }}>
          P/L: {fmtK(trades.reduce((s, t) => s + netPnl(t), 0))} &nbsp;|&nbsp; {trades.length} trades
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(8,1fr)", gap: 2, marginBottom: 4 }}>
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun", "Week"].map((d) => (
          <div key={d} style={{ fontSize: 9, color: "#3a4255", textAlign: "center", padding: "3px 0" }}>{d}</div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(8,1fr)", gap: 2 }}>{rows}</div>
    </div>
  );
}

// ── TRADE TABLE ────────────────────────────────────────────────────────────
function TradeTable({ trades, filter }) {
  const now = new Date();
  const filtered =
    filter === "week" ? trades.filter((t) => t.date && new Date(t.date) >= new Date(now - 7 * 86400000))
    : filter === "month" ? trades.filter((t) => t.date && t.date.slice(0, 7) === now.toISOString().slice(0, 7))
    : trades;

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid #1e2433" }}>
            {["#", "Date", "Pair", "Direction", "Lot", "P&L", "Commission", "Net P&L", "Setup", "Outcome"].map((h) => (
              <th key={h} style={{ padding: "8px 12px", textAlign: "left", color: "#3a4255", fontFamily: "'DM Mono',monospace", fontWeight: 400, fontSize: 9, letterSpacing: 1, whiteSpace: "nowrap" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 ? (
            <tr><td colSpan={10} style={{ padding: 32, textAlign: "center", color: "#3a4255", fontFamily: "'DM Mono',monospace" }}>No trades in this period</td></tr>
          ) : (
            filtered.map((t, i) => (
              <tr key={t.id || i} style={{ borderBottom: "1px solid #0f1520", transition: "background .15s" }} onMouseEnter={(e) => (e.currentTarget.style.background = "#0f1520")} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                <td style={{ padding: "9px 12px", color: "#3a4255", fontFamily: "'DM Mono',monospace" }}>{String(i + 1).padStart(2, "0")}</td>
                <td style={{ padding: "9px 12px", color: "#8899aa", fontFamily: "'DM Mono',monospace" }}>{t.date || "—"}</td>
                <td style={{ padding: "9px 12px" }}>
                  <span style={{ background: t.pair === "XAUUSD" ? "#2a1f00" : "#1a1a2e", color: t.pair === "XAUUSD" ? "#f59e0b" : "#818cf8", padding: "2px 8px", borderRadius: 4, fontSize: 9, fontWeight: 600 }}>{t.pair || "—"}</span>
                </td>
                <td style={{ padding: "9px 12px", color: t.direction === "BUY" ? "#4ade80" : "#f87171", fontFamily: "'DM Mono',monospace", fontSize: 11 }}>{t.direction || "—"}</td>
                <td style={{ padding: "9px 12px", color: "#8899aa", fontFamily: "'DM Mono',monospace" }}>{t.lot ?? "—"}</td>
                <td style={{ padding: "9px 12px", color: t.pnl >= 0 ? "#4ade80" : "#f87171", fontFamily: "'DM Mono',monospace" }}>{fmt(t.pnl)}</td>
                <td style={{ padding: "9px 12px", color: "#f87171", fontFamily: "'DM Mono',monospace" }}>{t.commission ? `-$${Math.abs(t.commission).toFixed(2)}` : "—"}</td>
                <td style={{ padding: "9px 12px", fontWeight: 700, color: netPnl(t) >= 0 ? "#4ade80" : "#f87171", fontFamily: "'DM Mono',monospace" }}>{fmt(netPnl(t))}</td>
                <td style={{ padding: "9px 12px" }}>{t.setup && <span style={{ background: "#1a1f2e", color: "#8899aa", padding: "2px 8px", borderRadius: 4, fontSize: 9 }}>{t.setup}</span>}</td>
                <td style={{ padding: "9px 12px" }}>
                  {t.outcome && (
                    <span style={{ background: t.outcome === "WIN" ? "#0d2117" : "#1a0d0d", color: t.outcome === "WIN" ? "#4ade80" : "#f87171", padding: "2px 10px", borderRadius: 20, fontSize: 9, fontWeight: 700, border: `1px solid ${t.outcome === "WIN" ? "#1a4a2a" : "#3a1a1a"}` }}>{t.outcome}</span>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

// ── ADD TRADE MODAL ────────────────────────────────────────────────────────
function AddTradeModal({ onClose, onSuccess }) {
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    pair: "XAUUSD",
    direction: "BUY",
    lot: "",
    pnl: "",
    commission: "",
    outcome: "WIN",
    setup: "",
    sl: "",
    tp: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          lot: form.lot !== "" ? parseFloat(form.lot) : null,
          pnl: form.pnl !== "" ? parseFloat(form.pnl) : null,
          commission: form.commission !== "" ? parseFloat(form.commission) : null,
          sl: form.sl !== "" ? parseFloat(form.sl) : null,
          tp: form.tp !== "" ? parseFloat(form.tp) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error || "Unknown error");
      onSuccess();
      onClose();
    } catch (e) {
      setError(e.message);
    }
    setSubmitting(false);
  };

  const inputStyle = {
    background: "#080b12",
    border: "1px solid #1e2433",
    borderRadius: 8,
    color: "#e8eaf0",
    padding: "9px 12px",
    fontSize: 12,
    fontFamily: "'DM Mono', monospace",
    width: "100%",
    outline: "none",
  };

  const labelStyle = {
    fontSize: 9,
    color: "#5a6478",
    fontFamily: "'DM Mono', monospace",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 5,
    display: "block",
  };

  const Field = ({ label, children }) => (
    <div>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );

  const toggleBtn = (active, color, bgActive, borderActive) => ({
    flex: 1,
    background: active ? bgActive : "#080b12",
    border: `1px solid ${active ? borderActive : "#1e2433"}`,
    color: active ? color : "#5a6478",
    borderRadius: 8,
    padding: "9px 0",
    cursor: "pointer",
    fontSize: 10,
    fontFamily: "'DM Mono', monospace",
    fontWeight: active ? 700 : 400,
    letterSpacing: 1,
    transition: "all .15s",
  });

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(8,11,18,0.85)", backdropFilter: "blur(6px)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: "#0f1117", border: "1px solid #1e2433", borderRadius: 16, padding: 28, width: "100%", maxWidth: 480, position: "relative", animation: "fadeIn .2s ease" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
          <div>
            <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 16, color: "#e8eaf0" }}>+ New Trade</div>
            <div style={{ fontSize: 10, color: "#5a6478", fontFamily: "'DM Mono', monospace", marginTop: 2 }}>Saved directly to Notion</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#5a6478", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Date */}
          <Field label="Trade Date">
            <input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} style={{ ...inputStyle, colorScheme: "dark" }} />
          </Field>

          {/* Pair + Direction */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Pair">
              <div style={{ display: "flex", gap: 6 }}>
                {["XAUUSD", "BTCUSD"].map((p) => (
                  <button key={p} onClick={() => set("pair", p)} style={toggleBtn(form.pair === p, "#4ade80", "#0d2117", "#1a4a2a")}>{p}</button>
                ))}
              </div>
            </Field>
            <Field label="Direction">
              <div style={{ display: "flex", gap: 6 }}>
                {["BUY", "SELL"].map((d) => (
                  <button key={d} onClick={() => set("direction", d)} style={toggleBtn(form.direction === d, d === "BUY" ? "#4ade80" : "#f87171", d === "BUY" ? "#0d2117" : "#1a0d0d", d === "BUY" ? "#1a4a2a" : "#3a1a1a")}>{d}</button>
                ))}
              </div>
            </Field>
          </div>

          {/* Lot + P&L */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Lot Size">
              <input type="number" step="0.01" placeholder="0.10" value={form.lot} onChange={(e) => set("lot", e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Profit / Loss ($)">
              <input type="number" step="0.01" placeholder="e.g. 150.00" value={form.pnl} onChange={(e) => set("pnl", e.target.value)} style={inputStyle} />
            </Field>
          </div>

          {/* Commission + Setup */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Commission ($)">
              <input type="number" step="0.01" placeholder="e.g. 3.50" value={form.commission} onChange={(e) => set("commission", e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Setup">
              <select value={form.setup} onChange={(e) => set("setup", e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
                <option value="">— Select —</option>
                {["Trend", "Range", "Breakout", "Reversal", "News"].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </Field>
          </div>

          {/* SL + TP */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Stop Loss">
              <input type="number" step="0.01" placeholder="e.g. 1920.00" value={form.sl} onChange={(e) => set("sl", e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Take Profit">
              <input type="number" step="0.01" placeholder="e.g. 1950.00" value={form.tp} onChange={(e) => set("tp", e.target.value)} style={inputStyle} />
            </Field>
          </div>

          {/* Outcome */}
          <Field label="Outcome">
            <div style={{ display: "flex", gap: 8 }}>
              {["WIN", "LOSS"].map((o) => (
                <button key={o} onClick={() => set("outcome", o)} style={toggleBtn(form.outcome === o, o === "WIN" ? "#4ade80" : "#f87171", o === "WIN" ? "#0d2117" : "#1a0d0d", o === "WIN" ? "#1a4a2a" : "#3a1a1a")}>
                  {o === "WIN" ? "✓ WIN" : "✗ LOSS"}
                </button>
              ))}
            </div>
          </Field>

          {/* Error */}
          {error && (
            <div style={{ background: "#1a0d0d", border: "1px solid #3a1a1a", borderRadius: 8, padding: "10px 14px", fontSize: 11, color: "#f87171", fontFamily: "'DM Mono', monospace" }}>
              ⚠ {error}
            </div>
          )}

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={submitting}
            style={{ background: submitting ? "#1a2e1a" : "linear-gradient(135deg, #4ade80, #22c55e)", border: "none", borderRadius: 10, color: "#080b12", padding: "13px", cursor: submitting ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 800, fontFamily: "'Syne', sans-serif", letterSpacing: 1, marginTop: 4, transition: "all .2s" }}
          >
            {submitting ? "SAVING TO NOTION..." : "SAVE TRADE →"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── MAIN DASHBOARD ─────────────────────────────────────────────────────────
export default function TradingDashboard() {
  const [trades, setTrades] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("analytics");
  const [chartTab, setChartTab] = useState("daily");
  const [tableFilter, setTableFilter] = useState("all");
  const [showAddTrade, setShowAddTrade] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tradesResult, accountsResult] = await Promise.all([fetchTrades(), fetchAccounts()]);
      if (Array.isArray(tradesResult)) setTrades(tradesResult);
      if (Array.isArray(accountsResult)) setAccounts(accountsResult);
    } catch (e) {
      setError("Failed to load Notion data: " + (e?.message || String(e)));
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── STATS ─────────────────────────────────────────────────────────────────
  const validTrades = trades.filter((t) => t.pnl != null);
  const totalNetPnl = validTrades.reduce((s, t) => s + netPnl(t), 0);
  const wins = validTrades.filter((t) => t.outcome === "WIN");
  const losses = validTrades.filter((t) => t.outcome === "LOSS");
  const winRate = validTrades.length ? ((wins.length / validTrades.length) * 100).toFixed(1) : "0.0";
  const avgWin = wins.length ? wins.reduce((s, t) => s + netPnl(t), 0) / wins.length : 0;
  const avgLoss = losses.length ? Math.abs(losses.reduce((s, t) => s + netPnl(t), 0) / losses.length) : 1;
  const profitFactor = losses.length && avgLoss > 0
    ? (wins.reduce((s, t) => s + netPnl(t), 0) / Math.abs(losses.reduce((s, t) => s + netPnl(t), 0))).toFixed(2)
    : wins.length ? "∞" : "0";

  const activeAccounts = accounts.filter((a) => a.status === "Active");
  const totalDeposit = activeAccounts.reduce((s, a) => s + (a.initial || 0) + (a.added || 0), 0);
  const capitalNow = totalDeposit + totalNetPnl;
  const returns = totalDeposit > 0 ? ((totalNetPnl / totalDeposit) * 100).toFixed(1) : "0.0";

  // Charts
  const dayMap = {};
  validTrades.forEach((t) => { if (!t.date) return; const d = t.date.slice(0, 10); dayMap[d] = (dayMap[d] || 0) + netPnl(t); });
  const dailyData = Object.entries(dayMap).sort(([a], [b]) => a.localeCompare(b)).map(([date, pnl]) => ({ label: date.slice(5), pnl }));

  const weekMap = {};
  validTrades.forEach((t) => { if (!t.date) return; const w = getWeekKey(t.date); weekMap[w] = (weekMap[w] || 0) + netPnl(t); });
  const weeklyData = Object.entries(weekMap).sort(([a], [b]) => a.localeCompare(b)).map(([label, pnl]) => ({ label, pnl }));

  const monthMap = {};
  validTrades.forEach((t) => { if (!t.date) return; const m = t.date.slice(0, 7); monthMap[m] = (monthMap[m] || 0) + netPnl(t); });
  const monthlyData = Object.entries(monthMap).sort(([a], [b]) => a.localeCompare(b)).map(([m, pnl]) => ({ label: m, pnl }));

  const pairMap = {};
  validTrades.forEach((t) => { if (t.pair) pairMap[t.pair] = (pairMap[t.pair] || 0) + netPnl(t); });
  const pairData = Object.entries(pairMap).map(([pair, pnl]) => ({ pair, pnl }));

  let cum = totalDeposit;
  const cumData = validTrades.slice().sort((a, b) => (a.date || "").localeCompare(b.date || "")).map((t) => { cum += netPnl(t); return { date: (t.date || "").slice(5), capital: parseFloat(cum.toFixed(2)) }; });

  const consistency = losses.length > 0 ? Math.min((wins.length / losses.length) * 30, 100) : 100;
  const radarData = [
    { metric: "Win Rate", value: parseFloat(winRate) },
    { metric: "Profit\nFactor", value: Math.min(parseFloat(profitFactor) * 18, 100) },
    { metric: "Recovery", value: Math.min(parseFloat(profitFactor) * 10, 100) },
    { metric: "Consistency", value: consistency },
    { metric: "Avg R:R", value: Math.min((avgWin / Math.max(avgLoss, 1)) * 33, 100) },
  ];

  const currentChartData = ({ daily: dailyData, weekly: weeklyData, monthly: monthlyData })[chartTab] || [];

  const TABS = [
    { id: "analytics", label: "📊 Analytics" },
    { id: "journal", label: "📋 Journal" },
    { id: "accounts", label: "💰 Accounts" },
  ];

  // ── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "#080b12", color: "#e8eaf0", fontFamily: "'DM Sans',sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        ::-webkit-scrollbar{width:4px;height:4px;}
        ::-webkit-scrollbar-track{background:#0a0d14;}
        ::-webkit-scrollbar-thumb{background:#1e2433;border-radius:2px;}
        @keyframes spin{to{transform:rotate(360deg);}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:translateY(0);}}
        .fadein{animation:fadeIn .3s ease forwards;}
        input[type=number]::-webkit-outer-spin-button,input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none;}
        input[type=date]::-webkit-calendar-picker-indicator{filter:invert(0.5);}
        select option{background:#0f1117;color:#e8eaf0;}
      `}</style>

      {/* Header */}
      <div style={{ borderBottom: "1px solid #1e2433", padding: "0 28px", display: "flex", alignItems: "center", background: "#080b12", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginRight: 32, paddingRight: 28, borderRight: "1px solid #1e2433" }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#4ade80", boxShadow: "0 0 8px #4ade80" }} />
          <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 12, letterSpacing: 2.5, textTransform: "uppercase", color: "#e8eaf0" }}>TRADE JOURNAL</span>
        </div>

        <div style={{ display: "flex" }}>
          {TABS.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: "18px 22px", fontSize: 10, fontWeight: 500, color: activeTab === tab.id ? "#4ade80" : "#3a4255", borderBottom: `2px solid ${activeTab === tab.id ? "#4ade80" : "transparent"}`, letterSpacing: 1, textTransform: "uppercase", fontFamily: "'DM Mono',monospace", transition: "all .2s" }}>
              {tab.label}
            </button>
          ))}
        </div>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          {loading && <div style={{ fontSize: 10, color: "#3a4255", fontFamily: "'DM Mono',monospace", letterSpacing: 1 }}>SYNCING...</div>}
          <button
            onClick={() => setShowAddTrade(true)}
            style={{ background: "linear-gradient(135deg,#4ade80,#22c55e)", border: "none", color: "#080b12", padding: "7px 16px", borderRadius: 8, cursor: "pointer", fontSize: 10, fontFamily: "'DM Mono',monospace", fontWeight: 800, letterSpacing: 1 }}
          >
            + ADD TRADE
          </button>
          <button onClick={loadData} style={{ background: "#0f1520", border: "1px solid #1e2433", color: "#4ade80", padding: "7px 14px", borderRadius: 8, cursor: "pointer", fontSize: 10, fontFamily: "'DM Mono',monospace", letterSpacing: 1 }}>
            ↻ REFRESH
          </button>
        </div>
      </div>

      <div style={{ padding: "22px 28px" }}>
        {loading ? (
          <Spinner />
        ) : error ? (
          <div style={{ textAlign: "center", padding: 60, color: "#f87171", fontFamily: "'DM Mono',monospace", fontSize: 12 }}>{error}</div>
        ) : (
          <>
            {/* ── ANALYTICS ── */}
            {activeTab === "analytics" && (
              <div className="fadein" style={{ display: "flex", gap: 20 }}>
                {/* Left */}
                <div style={{ width: 280, flexShrink: 0, display: "flex", flexDirection: "column", gap: 14 }}>
                  <div style={{ background: "#0f1117", border: "1px solid #1e2433", borderRadius: 12, padding: 18 }}>
                    <div style={{ fontSize: 10, color: "#5a6478", fontFamily: "'DM Mono',monospace", letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 }}>Performance Profile</div>
                    <ResponsiveContainer width="100%" height={200}>
                      <RadarChart data={radarData} margin={{ top: 8, right: 16, bottom: 8, left: 16 }}>
                        <PolarGrid stroke="#1e2433" />
                        <PolarAngleAxis dataKey="metric" tick={{ fill: "#5a6478", fontSize: 8, fontFamily: "'DM Mono',monospace" }} />
                        <Radar dataKey="value" stroke="#4ade80" fill="#4ade80" fillOpacity={0.15} strokeWidth={1.5} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>

                  <div style={{ background: "#0f1117", border: "1px solid #1e2433", borderRadius: 12, padding: 18 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                      <div style={{ fontSize: 10, color: "#5a6478", fontFamily: "'DM Mono',monospace", letterSpacing: 1, textTransform: "uppercase" }}>Performance</div>
                      <div style={{ display: "flex", gap: 4 }}>
                        {["daily", "weekly", "monthly"].map((f) => (
                          <button key={f} onClick={() => setChartTab(f)} style={{ background: chartTab === f ? "#0d2117" : "none", border: `1px solid ${chartTab === f ? "#1a4a2a" : "#1e2433"}`, color: chartTab === f ? "#4ade80" : "#3a4255", padding: "2px 8px", borderRadius: 4, cursor: "pointer", fontSize: 8, fontFamily: "'DM Mono',monospace", textTransform: "capitalize" }}>
                            {f.slice(0, 1).toUpperCase()}
                          </button>
                        ))}
                      </div>
                    </div>
                    {currentChartData.length === 0 ? (
                      <div style={{ textAlign: "center", padding: 40, color: "#3a4255", fontSize: 11, fontFamily: "'DM Mono',monospace" }}>No data</div>
                    ) : (
                      <ResponsiveContainer width="100%" height={150}>
                        <BarChart data={currentChartData} margin={{ top: 0, right: 0, bottom: 0, left: -24 }}>
                          <XAxis dataKey="label" tick={{ fill: "#3a4255", fontSize: 8, fontFamily: "'DM Mono',monospace" }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fill: "#3a4255", fontSize: 8 }} axisLine={false} tickLine={false} />
                          <Tooltip contentStyle={{ background: "#0f1520", border: "1px solid #1e2433", borderRadius: 8, fontSize: 10 }} formatter={(v) => [fmt(v), "Net P&L"]} />
                          <Bar dataKey="pnl" radius={[3, 3, 0, 0]}>
                            {currentChartData.map((e, i) => <Cell key={i} fill={e.pnl >= 0 ? "#4ade80" : "#f87171"} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>

                  {pairData.length > 0 && (
                    <div style={{ background: "#0f1117", border: "1px solid #1e2433", borderRadius: 12, padding: 18 }}>
                      <div style={{ fontSize: 10, color: "#5a6478", fontFamily: "'DM Mono',monospace", letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 }}>By Pair</div>
                      {pairData.map((p) => (
                        <div key={p.pair} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                          <span style={{ fontSize: 10, color: "#8899aa", width: 60 }}>{p.pair}</span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: p.pnl >= 0 ? "#4ade80" : "#f87171", fontFamily: "'DM Mono',monospace", width: 64, textAlign: "right" }}>{fmt(p.pnl)}</span>
                          <div style={{ flex: 1, height: 4, background: "#1e2433", borderRadius: 2, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${Math.min((Math.abs(p.pnl) / Math.max(...pairData.map((x) => Math.abs(x.pnl)))) * 100, 100)}%`, background: p.pnl >= 0 ? "#4ade80" : "#f87171", borderRadius: 2 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Right */}
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14 }}>
                  <div style={{ display: "flex", gap: 10 }}>
                    <KPICard label="Win Rate" value={`${winRate}%`} color="#4ade80" icon="🎯" sub={`${wins.length}W / ${losses.length}L`} />
                    <KPICard label="Total P&L" value={fmtK(totalNetPnl)} color={totalNetPnl >= 0 ? "#4ade80" : "#f87171"} icon="💹" sub="Net of commissions" />
                    <KPICard label="Returns" value={`${returns}%`} color="#60a5fa" icon="📈" sub={`on $${totalDeposit.toLocaleString()}`} />
                    <KPICard label="Profit Factor" value={profitFactor} color="#f59e0b" icon="⚡" sub={`avg win $${avgWin.toFixed(0)}`} />
                  </div>

                  <div style={{ background: "#0f1117", border: "1px solid #1e2433", borderRadius: 12, padding: "14px 20px", display: "flex", gap: 28, alignItems: "center", flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontSize: 9, color: "#5a6478", fontFamily: "'DM Mono',monospace", letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>Capital actuel</div>
                      <div style={{ fontSize: 30, fontWeight: 800, fontFamily: "'Syne',sans-serif", color: "#e8eaf0" }}>${capitalNow.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                    </div>
                    <div style={{ width: 1, height: 36, background: "#1e2433" }} />
                    <div><div style={{ fontSize: 9, color: "#5a6478", marginBottom: 2 }}>Dépôt initial</div><div style={{ fontFamily: "'DM Mono',monospace", color: "#8899aa", fontSize: 12 }}>${activeAccounts.reduce((s, a) => s + (a.initial || 0), 0).toLocaleString()}</div></div>
                    <div><div style={{ fontSize: 9, color: "#5a6478", marginBottom: 2 }}>Ajouts</div><div style={{ fontFamily: "'DM Mono',monospace", color: "#8899aa", fontSize: 12 }}>+${activeAccounts.reduce((s, a) => s + (a.added || 0), 0).toLocaleString()}</div></div>
                    <div><div style={{ fontSize: 9, color: "#5a6478", marginBottom: 2 }}>P&L net</div><div style={{ fontFamily: "'DM Mono',monospace", color: totalNetPnl >= 0 ? "#4ade80" : "#f87171", fontWeight: 700, fontSize: 12 }}>{fmtK(totalNetPnl)}</div></div>
                    <div><div style={{ fontSize: 9, color: "#5a6478", marginBottom: 2 }}>Commissions</div><div style={{ fontFamily: "'DM Mono',monospace", color: "#f87171", fontSize: 12 }}>-${validTrades.reduce((s, t) => s + Math.abs(t.commission || 0), 0).toFixed(2)}</div></div>
                    <div style={{ marginLeft: "auto", textAlign: "right" }}><div style={{ fontSize: 9, color: "#5a6478", marginBottom: 2 }}>Trades</div><div style={{ fontFamily: "'DM Mono',monospace", fontSize: 24, fontWeight: 700, color: "#e8eaf0" }}>{validTrades.length}</div></div>
                  </div>

                  <div style={{ background: "#0f1117", border: "1px solid #1e2433", borderRadius: 12, padding: 18, flex: 1 }}>
                    <CalendarView trades={validTrades} year={new Date().getFullYear()} month={new Date().getMonth()} />
                  </div>
                </div>
              </div>
            )}

            {/* ── JOURNAL ── */}
            {activeTab === "journal" && (
              <div className="fadein" style={{ background: "#0f1117", border: "1px solid #1e2433", borderRadius: 12, padding: 20 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
                  <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 15 }}>Trade Journal</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {[["all","All Time"],["week","This Week"],["month","This Month"]].map(([f, l]) => (
                      <button key={f} onClick={() => setTableFilter(f)} style={{ background: tableFilter === f ? "#0d2117" : "none", border: `1px solid ${tableFilter === f ? "#1a4a2a" : "#1e2433"}`, color: tableFilter === f ? "#4ade80" : "#3a4255", padding: "6px 12px", borderRadius: 6, cursor: "pointer", fontSize: 9, fontFamily: "'DM Mono',monospace", letterSpacing: 1, textTransform: "uppercase" }}>{l}</button>
                    ))}
                  </div>
                </div>
                <TradeTable trades={validTrades} filter={tableFilter} />
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #1e2433", display: "flex", gap: 28, flexWrap: "wrap" }}>
                  <div style={{ fontSize: 10, color: "#5a6478" }}>Trades: <span style={{ color: "#e8eaf0", fontFamily: "'DM Mono',monospace" }}>{validTrades.length}</span></div>
                  <div style={{ fontSize: 10, color: "#5a6478" }}>Net P&L: <span style={{ color: totalNetPnl >= 0 ? "#4ade80" : "#f87171", fontFamily: "'DM Mono',monospace", fontWeight: 700 }}>{fmtK(totalNetPnl)}</span></div>
                  <div style={{ fontSize: 10, color: "#5a6478" }}>Commissions: <span style={{ color: "#f87171", fontFamily: "'DM Mono',monospace" }}>-${validTrades.reduce((s, t) => s + Math.abs(t.commission || 0), 0).toFixed(2)}</span></div>
                  <div style={{ fontSize: 10, color: "#5a6478" }}>Win Rate: <span style={{ color: "#4ade80", fontFamily: "'DM Mono',monospace" }}>{winRate}%</span></div>
                </div>
              </div>
            )}

            {/* ── ACCOUNTS ── */}
            {activeTab === "accounts" && (
              <div className="fadein" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 12 }}>
                  {activeAccounts.map((a) => {
                    const acTrades = validTrades.filter((t) => {
                      if (Array.isArray(t.accountIds)) return t.accountIds.includes(a.id);
                      if (t.accountId) return t.accountId === a.id;
                      return true;
                    });
                    const acPnl = acTrades.reduce((s, t) => s + netPnl(t), 0);
                    const acCapital = (a.initial || 0) + (a.added || 0) + acPnl;
                    return (
                      <div key={a.id} style={{ background: "#0f1117", border: "1px solid #1e2433", borderRadius: 12, padding: 20, position: "relative", overflow: "hidden" }}>
                        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "linear-gradient(90deg,#4ade80,transparent)" }} />
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                          <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 14 }}>{a.name || "Account"}</div>
                          <span style={{ background: a.status === "Active" ? "#0d2117" : "#1a1a2e", color: a.status === "Active" ? "#4ade80" : "#818cf8", padding: "2px 8px", borderRadius: 20, fontSize: 9, fontWeight: 700, border: `1px solid ${a.status === "Active" ? "#1a4a2a" : "#2a2a4e"}` }}>{a.status}</span>
                        </div>
                        <div style={{ fontSize: 26, fontWeight: 800, fontFamily: "'Syne',sans-serif", marginBottom: 12 }}>${acCapital.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                          {[["Initial","$"+(a.initial||0).toLocaleString(),"#8899aa"],["Ajouts","+"+"$"+(a.added||0).toLocaleString(),"#60a5fa"],["P&L net",fmtK(acPnl),acPnl>=0?"#4ade80":"#f87171"],["Depuis",a.depositDate||"—","#8899aa"]].map(([l,v,c])=>(
                            <div key={l} style={{ background: "#080b12", borderRadius: 8, padding: "10px 12px" }}>
                              <div style={{ fontSize: 9, color: "#5a6478", marginBottom: 3 }}>{l}</div>
                              <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 12, color: c, fontWeight: 600 }}>{v}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div style={{ background: "#0f1117", border: "1px solid #1e2433", borderRadius: 12, padding: 20 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
                    <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 14 }}>Courbe d'équité</div>
                    <div style={{ fontSize: 10, color: "#5a6478", fontFamily: "'DM Mono',monospace" }}>Capital cumulé dans le temps</div>
                  </div>
                  {cumData.length === 0 ? (
                    <div style={{ textAlign: "center", padding: 40, color: "#3a4255", fontSize: 11, fontFamily: "'DM Mono',monospace" }}>Add trades to see equity curve</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={cumData}>
                        <CartesianGrid stroke="#0f1520" strokeDasharray="3 3" />
                        <XAxis dataKey="date" tick={{ fill: "#3a4255", fontSize: 9, fontFamily: "'DM Mono',monospace" }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: "#3a4255", fontSize: 9 }} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={{ background: "#0f1520", border: "1px solid #1e2433", borderRadius: 8, fontSize: 11 }} formatter={(v) => [`$${Number(v).toLocaleString()}`, "Capital"]} />
                        <Line type="monotone" dataKey="capital" stroke="#4ade80" strokeWidth={2} dot={{ fill: "#4ade80", r: 3 }} activeDot={{ r: 5, fill: "#4ade80" }} />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>

                <div style={{ background: "#0f1117", border: "1px solid #1e2433", borderRadius: 12, padding: 20 }}>
                  <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 14, marginBottom: 14 }}>Statistiques globales</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
                    {[
                      ["Meilleur trade", fmt(validTrades.length ? Math.max(...validTrades.map(netPnl)) : 0), "#4ade80"],
                      ["Pire trade", fmt(validTrades.length ? Math.min(...validTrades.map(netPnl)) : 0), "#f87171"],
                      ["Avg Win", `$${avgWin.toFixed(0)}`, "#4ade80"],
                      ["Avg Loss", `-$${avgLoss.toFixed(0)}`, "#f87171"],
                      ["Total trades", String(validTrades.length), "#e8eaf0"],
                      ["Wins", String(wins.length), "#4ade80"],
                      ["Losses", String(losses.length), "#f87171"],
                      ["Profit Factor", profitFactor, "#f59e0b"],
                    ].map(([l, v, c]) => (
                      <div key={l} style={{ background: "#080b12", borderRadius: 10, padding: "14px 16px", border: "1px solid #0f1520" }}>
                        <div style={{ fontSize: 9, color: "#5a6478", fontFamily: "'DM Mono',monospace", letterSpacing: 1, marginBottom: 6, textTransform: "uppercase" }}>{l}</div>
                        <div style={{ fontSize: 20, fontWeight: 700, color: c, fontFamily: "'Syne',sans-serif" }}>{v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Add Trade Modal */}
      {showAddTrade && (
        <AddTradeModal
          onClose={() => setShowAddTrade(false)}
          onSuccess={loadData}
        />
      )}
    </div>
  );
}
