import { useState, useEffect, useCallback } from "react";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip, Cell,
  LineChart, Line, CartesianGrid,
} from "recharts";

// ── API ───────────────────────────────────────────────────────────────────────
async function fetchTrades() {
  const res = await fetch("/api/trades", { cache: "no-store" });
  if (!res.ok) { const js = await res.json().catch(() => ({})); throw new Error(js?.details || js?.error || `HTTP ${res.status}`); }
  return res.json();
}
async function fetchAccounts() {
  const res = await fetch("/api/accounts", { cache: "no-store" });
  if (!res.ok) { const js = await res.json().catch(() => ({})); throw new Error(js?.details || js?.error || `HTTP ${res.status}`); }
  return res.json();
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
const netPnl = (t) => (t.pnl ?? 0) - Math.abs(t.commission ?? 0);

// Affiche le nombre exact, sans arrondi — garde tous les décimales significatifs
function fmtNum(n, opts = {}) {
  if (n == null) return "—";
  const { prefix = "", sign = false, decimals = null } = opts;
  const abs = Math.abs(n);
  let str;
  if (decimals !== null) {
    str = abs.toFixed(decimals);
  } else {
    str = abs.toFixed(2);
  }
  const s = sign ? (n >= 0 ? "+" : "-") : n < 0 ? "-" : "";
  return `${s}${prefix}${str}`;
}

const fmt   = (n) => fmtNum(n, { prefix: "$", sign: true });
const fmtK  = (n) => {
  if (n == null) return "—";
  if (Math.abs(n) >= 1000) return fmtNum(n, { prefix: "$", sign: true, decimals: 1 }).replace(/(\d)(\d{3})/, "$1.$2K").replace(/\.\d{3}K/, "K");
  return fmt(n);
};

function getWeekKey(dateStr) {
  const d = new Date(dateStr);
  const start = new Date(d.getFullYear(), 0, 1);
  return `W${Math.ceil(((d - start) / 86400000 + start.getDay() + 1) / 7)}`;
}

function useIsMobile() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const check = () => setMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return mobile;
}

// ── SHARED STYLES ─────────────────────────────────────────────────────────────
const INPUT_STYLE = {
  background: "#080b12", border: "1px solid #1e2433", borderRadius: 8,
  color: "#e8eaf0", padding: "11px 12px", fontSize: 14,
  fontFamily: "'DM Mono', monospace", width: "100%", outline: "none",
};
const LABEL_STYLE = {
  fontSize: 9, color: "#5a6478", fontFamily: "'DM Mono', monospace",
  letterSpacing: 1, textTransform: "uppercase", marginBottom: 5, display: "block",
};

// ── MODULE-LEVEL COMPONENTS (prevent remount on parent re-render) ─────────────
function Field({ label, children }) {
  return <div><label style={LABEL_STYLE}>{label}</label>{children}</div>;
}

function ToggleBtn({ active, fg, bg, bd, onClick, children, style = {} }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, background: active ? bg : "#080b12",
      border: `1px solid ${active ? bd : "#1e2433"}`,
      color: active ? fg : "#5a6478", borderRadius: 8, padding: "11px 0",
      cursor: "pointer", fontSize: 12, fontFamily: "'DM Mono', monospace",
      fontWeight: active ? 700 : 400, transition: "all .15s", ...style,
    }}>{children}</button>
  );
}

// ── SPINNER ───────────────────────────────────────────────────────────────────
function Spinner() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "60vh", gap: 16 }}>
      <div style={{ width: 36, height: 36, border: "2px solid #1e2433", borderTop: "2px solid #4ade80", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <div style={{ color: "#3a4255", fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: 2 }}>LOADING...</div>
    </div>
  );
}

// ── KPI CARD ──────────────────────────────────────────────────────────────────
function KPICard({ label, value, color, icon, sub }) {
  return (
    <div style={{ flex: 1, minWidth: 0, background: "#0f1117", border: "1px solid #1e2433", borderRadius: 12, padding: "14px 16px", position: "relative", overflow: "hidden" }}>
      <div style={{ fontSize: 9, color: "#5a6478", fontFamily: "'DM Mono', monospace", letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color, fontFamily: "'Syne', sans-serif", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 9, color: "#5a6478", marginTop: 4 }}>{sub}</div>}
      <div style={{ position: "absolute", top: 0, right: 0, fontSize: 14, opacity: 0.15, padding: 10 }}>{icon}</div>
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${color}55, transparent)` }} />
    </div>
  );
}

// ── CALENDAR ─────────────────────────────────────────────────────────────────
function CalendarView({ trades, year, month }) {
  const [curMonth, setCurMonth] = useState(month);
  const [curYear, setCurYear] = useState(year);
  const isMobile = useIsMobile();
  const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const days = new Date(curYear, curMonth + 1, 0).getDate();
  const firstAdj = (new Date(curYear, curMonth, 1).getDay() + 6) % 7;

  const byDate = {};
  trades.forEach((t) => { if (!t.date) return; const d = t.date.slice(0,10); if (!byDate[d]) byDate[d] = []; byDate[d].push(t); });

  const cells = [];
  for (let i = 0; i < firstAdj; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(d);

  const cols = isMobile ? 7 : 8;
  const headers = isMobile ? ["Mo","Tu","We","Th","Fr","Sa","Su"] : ["Mon","Tue","Wed","Thu","Fri","Sat","Sun","Week"];

  const rows = [];
  let weekBuf = [], col = 0;
  cells.forEach((day, i) => {
    if (day === null) {
      rows.push(<div key={`e${i}`} style={{ minHeight: isMobile ? 44 : 60, background: "#0a0d14", borderRadius: 4 }} />);
    } else {
      const ds = `${curYear}-${String(curMonth+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
      const dt = byDate[ds] || [];
      const dp = dt.reduce((s,t) => s + netPnl(t), 0);
      weekBuf.push(...dt);
      rows.push(
        <div key={day} style={{ minHeight: isMobile ? 44 : 60, background: dt.length ? (dp>=0?"#0d2117":"#1a0d0d") : "#0a0d14", borderRadius: 4, padding: "4px 5px", border: dt.length ? `1px solid ${dp>=0?"#1a4a2a":"#3a1a1a"}` : "1px solid #0f1520" }}>
          <div style={{ fontSize: 9, color: "#3a4255", marginBottom: 2 }}>{day}</div>
          {dt.length > 0 && <div style={{ fontSize: isMobile?8:10, fontWeight: 700, color: dp>=0?"#4ade80":"#f87171", fontFamily: "'DM Mono',monospace" }}>{fmt(dp)}</div>}
        </div>
      );
    }
    col++;
    if (col === 7 || i === cells.length - 1) {
      if (!isMobile) {
        const wp = weekBuf.reduce((s,t)=>s+netPnl(t),0);
        rows.push(
          <div key={`w${i}`} style={{ minHeight: 60, background: "#0c0f1a", borderRadius: 4, padding: "4px 5px", border: "1px solid #0f1520", display: "flex", flexDirection: "column", justifyContent: "center" }}>
            {weekBuf.length > 0 && <><div style={{fontSize:8,color:"#5a6478"}}>{weekBuf.length}T</div><div style={{fontSize:10,fontWeight:700,color:wp>=0?"#4ade80":"#f87171",fontFamily:"'DM Mono',monospace"}}>{fmt(wp)}</div></>}
          </div>
        );
      }
      col = 0; weekBuf = [];
    }
  });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <button onClick={() => { let m=curMonth-1,y=curYear; if(m<0){m=11;y--;} setCurMonth(m);setCurYear(y); }} style={{ background:"none",border:"1px solid #1e2433",color:"#fff",borderRadius:6,width:28,height:28,cursor:"pointer",flexShrink:0 }}>‹</button>
        <span style={{ fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:13,color:"#e8eaf0" }}>{MONTHS[curMonth]} {curYear}</span>
        <button onClick={() => { let m=curMonth+1,y=curYear; if(m>11){m=0;y++;} setCurMonth(m);setCurYear(y); }} style={{ background:"none",border:"1px solid #1e2433",color:"#fff",borderRadius:6,width:28,height:28,cursor:"pointer",flexShrink:0 }}>›</button>
        <div style={{ marginLeft:"auto",fontSize:9,color:"#5a6478",fontFamily:"'DM Mono',monospace" }}>{fmt(trades.reduce((s,t)=>s+netPnl(t),0))} · {trades.length}T</div>
      </div>
      <div style={{ display:"grid",gridTemplateColumns:`repeat(${cols},1fr)`,gap:2,marginBottom:3 }}>
        {headers.map(d=><div key={d} style={{fontSize:8,color:"#3a4255",textAlign:"center",padding:"2px 0"}}>{d}</div>)}
      </div>
      <div style={{ display:"grid",gridTemplateColumns:`repeat(${cols},1fr)`,gap:2 }}>{rows}</div>
    </div>
  );
}

// ── TRADE TABLE (with sortable columns) ───────────────────────────────────────
const COLUMNS = [
  { key: "index",     label: "#",       sort: null },
  { key: "date",      label: "Date",    sort: (a,b)=>(a.date||"").localeCompare(b.date||"") },
  { key: "pair",      label: "Pair",    sort: (a,b)=>(a.pair||"").localeCompare(b.pair||"") },
  { key: "direction", label: "Dir",     sort: (a,b)=>(a.direction||"").localeCompare(b.direction||"") },
  { key: "lot",       label: "Lot",     sort: (a,b)=>(a.lot??0)-(b.lot??0) },
  { key: "pnl",       label: "P&L",     sort: (a,b)=>(a.pnl??0)-(b.pnl??0) },
  { key: "commission",label: "Comm",    sort: (a,b)=>Math.abs(a.commission??0)-Math.abs(b.commission??0) },
  { key: "netpnl",    label: "Net P&L", sort: (a,b)=>netPnl(a)-netPnl(b) },
  { key: "setup",     label: "Setup",   sort: (a,b)=>(a.setup||"").localeCompare(b.setup||"") },
  { key: "outcome",   label: "Outcome", sort: (a,b)=>(a.outcome||"").localeCompare(b.outcome||"") },
];

function TradeTable({ trades, filter }) {
  const now = new Date();
  const isMobile = useIsMobile();
  const [sortKey, setSortKey] = useState("date");
  const [sortDir, setSortDir] = useState(-1); // -1 = desc, 1 = asc

  const filtered = filter === "week"
    ? trades.filter(t => t.date && new Date(t.date) >= new Date(now - 7*86400000))
    : filter === "month"
    ? trades.filter(t => t.date && t.date.slice(0,7) === now.toISOString().slice(0,7))
    : trades;

  const col = COLUMNS.find(c => c.key === sortKey);
  const sorted = col?.sort
    ? [...filtered].sort((a,b) => col.sort(a,b) * sortDir)
    : filtered;

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => -d);
    else { setSortKey(key); setSortDir(-1); }
  };

  if (isMobile) {
    return (
      <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
        {sorted.length === 0 ? (
          <div style={{padding:32,textAlign:"center",color:"#3a4255",fontFamily:"'DM Mono',monospace",fontSize:11}}>No trades in this period</div>
        ) : sorted.map((t,i) => (
          <div key={t.id||i} style={{background:"#080b12",border:"1px solid #1e2433",borderRadius:10,padding:"12px 14px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <div style={{display:"flex",gap:6,alignItems:"center"}}>
                <span style={{background:t.pair==="XAUUSD"?"#2a1f00":"#1a1a2e",color:t.pair==="XAUUSD"?"#f59e0b":"#818cf8",padding:"2px 7px",borderRadius:4,fontSize:9,fontWeight:600}}>{t.pair||"—"}</span>
                <span style={{color:t.direction==="BUY"?"#4ade80":"#f87171",fontSize:10,fontFamily:"'DM Mono',monospace",fontWeight:700}}>{t.direction||"—"}</span>
              </div>
              {t.outcome && <span style={{background:t.outcome==="WIN"?"#0d2117":"#1a0d0d",color:t.outcome==="WIN"?"#4ade80":"#f87171",padding:"2px 8px",borderRadius:20,fontSize:9,fontWeight:700,border:`1px solid ${t.outcome==="WIN"?"#1a4a2a":"#3a1a1a"}`}}>{t.outcome}</span>}
            </div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontSize:9,color:"#5a6478"}}>{t.date||"—"} · Lot {t.lot??"—"}</div>
                {t.setup && <div style={{fontSize:9,color:"#8899aa",marginTop:2}}>{t.setup}</div>}
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:16,fontWeight:700,color:netPnl(t)>=0?"#4ade80":"#f87171",fontFamily:"'DM Mono',monospace"}}>{fmt(netPnl(t))}</div>
                {t.commission!=null && <div style={{fontSize:9,color:"#f87171",fontFamily:"'DM Mono',monospace"}}>-${Math.abs(t.commission).toFixed(2)} comm</div>}
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  const SortIcon = ({ k }) => {
    if (sortKey !== k) return <span style={{color:"#2a3040",marginLeft:3}}>⇅</span>;
    return <span style={{color:"#4ade80",marginLeft:3}}>{sortDir === -1 ? "↓" : "↑"}</span>;
  };

  return (
    <div style={{overflowX:"auto"}}>
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
        <thead>
          <tr style={{borderBottom:"1px solid #1e2433"}}>
            {COLUMNS.map(c => (
              <th key={c.key} onClick={c.sort ? ()=>handleSort(c.key) : undefined}
                style={{padding:"8px 10px",textAlign:"left",color:sortKey===c.key?"#4ade80":"#3a4255",fontFamily:"'DM Mono',monospace",fontWeight:400,fontSize:9,letterSpacing:1,whiteSpace:"nowrap",cursor:c.sort?"pointer":"default",userSelect:"none"}}>
                {c.label}{c.sort && <SortIcon k={c.key} />}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr><td colSpan={10} style={{padding:32,textAlign:"center",color:"#3a4255",fontFamily:"'DM Mono',monospace"}}>No trades in this period</td></tr>
          ) : sorted.map((t,i) => (
            <tr key={t.id||i} style={{borderBottom:"1px solid #0f1520"}}
              onMouseEnter={e=>e.currentTarget.style.background="#0f1520"}
              onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              <td style={{padding:"8px 10px",color:"#3a4255",fontFamily:"'DM Mono',monospace"}}>{String(i+1).padStart(2,"0")}</td>
              <td style={{padding:"8px 10px",color:"#8899aa",fontFamily:"'DM Mono',monospace"}}>{t.date||"—"}</td>
              <td style={{padding:"8px 10px"}}><span style={{background:t.pair==="XAUUSD"?"#2a1f00":"#1a1a2e",color:t.pair==="XAUUSD"?"#f59e0b":"#818cf8",padding:"2px 7px",borderRadius:4,fontSize:9,fontWeight:600}}>{t.pair||"—"}</span></td>
              <td style={{padding:"8px 10px",color:t.direction==="BUY"?"#4ade80":"#f87171",fontFamily:"'DM Mono',monospace",fontSize:11}}>{t.direction||"—"}</td>
              <td style={{padding:"8px 10px",color:"#8899aa",fontFamily:"'DM Mono',monospace"}}>{t.lot??"—"}</td>
              <td style={{padding:"8px 10px",color:(t.pnl??0)>=0?"#4ade80":"#f87171",fontFamily:"'DM Mono',monospace"}}>{t.pnl!=null?fmtNum(t.pnl,{prefix:"$",sign:true}):"—"}</td>
              <td style={{padding:"8px 10px",color:"#f87171",fontFamily:"'DM Mono',monospace"}}>{t.commission!=null?`-$${Math.abs(t.commission).toFixed(2)}`:"—"}</td>
              <td style={{padding:"8px 10px",fontWeight:700,color:netPnl(t)>=0?"#4ade80":"#f87171",fontFamily:"'DM Mono',monospace"}}>{fmt(netPnl(t))}</td>
              <td style={{padding:"8px 10px"}}>{t.setup&&<span style={{background:"#1a1f2e",color:"#8899aa",padding:"2px 7px",borderRadius:4,fontSize:9}}>{t.setup}</span>}</td>
              <td style={{padding:"8px 10px"}}>{t.outcome&&<span style={{background:t.outcome==="WIN"?"#0d2117":"#1a0d0d",color:t.outcome==="WIN"?"#4ade80":"#f87171",padding:"2px 9px",borderRadius:20,fontSize:9,fontWeight:700,border:`1px solid ${t.outcome==="WIN"?"#1a4a2a":"#3a1a1a"}`}}>{t.outcome}</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── ADD TRADE MODAL ───────────────────────────────────────────────────────────
function AddTradeModal({ onClose, onSuccess }) {
  const [date, setDate]             = useState(new Date().toISOString().slice(0,10));
  const [pair, setPair]             = useState("XAUUSD");
  const [direction, setDirection]   = useState("BUY");
  const [lot, setLot]               = useState("");
  const [pnl, setPnl]               = useState("");
  const [commission, setCommission] = useState("");
  const [outcome, setOutcome]       = useState("WIN");
  const [setup, setSetup]           = useState("");
  const [sl, setSl]                 = useState("");
  const [tp, setTp]                 = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState(null);

  useEffect(() => {
    if (pair !== "XAUUSD") return;
    if (lot === "") {
      setCommission("");
      return;
    }
    const parsedLot = Number(lot);
    if (Number.isNaN(parsedLot)) return;
    setCommission((parsedLot * 7).toFixed(2));
  }, [pair, lot]);

  const handleSubmit = async () => {
    setSubmitting(true); setError(null);
    try {
      const res = await fetch("/api/trades", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date, pair, direction, outcome, setup,
          lot:        lot        !== "" ? parseFloat(lot)        : null,
          pnl:        pnl        !== "" ? parseFloat(pnl)        : null,
          commission: commission !== "" ? parseFloat(commission) : null,
          sl:         sl         !== "" ? parseFloat(sl)         : null,
          tp:         tp         !== "" ? parseFloat(tp)         : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error || "Unknown error");
      onSuccess(); onClose();
    } catch (e) { setError(e.message); }
    setSubmitting(false);
  };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(8,11,18,0.9)",backdropFilter:"blur(8px)",zIndex:1000,display:"flex",alignItems:"flex-end",justifyContent:"center"}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:"#0f1117",border:"1px solid #1e2433",borderTopLeftRadius:20,borderTopRightRadius:20,padding:"20px 20px 40px",width:"100%",maxWidth:520,maxHeight:"92vh",overflowY:"auto",animation:"slideUp .25s ease"}}>
        <div style={{width:36,height:4,background:"#1e2433",borderRadius:2,margin:"0 auto 20px"}} />
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <div>
            <div style={{fontFamily:"'Syne', sans-serif",fontWeight:800,fontSize:18,color:"#e8eaf0"}}>+ New Trade</div>
            <div style={{fontSize:10,color:"#5a6478",fontFamily:"'DM Mono', monospace",marginTop:2}}>Saved directly to Notion</div>
          </div>
          <button onClick={onClose} style={{background:"#080b12",border:"1px solid #1e2433",color:"#5a6478",cursor:"pointer",fontSize:16,borderRadius:8,width:36,height:36}}>✕</button>
        </div>

        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <Field label="Trade Date">
            <input type="date" value={date} onChange={e=>setDate(e.target.value)} style={{...INPUT_STYLE,colorScheme:"dark"}} />
          </Field>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <Field label="Pair">
              <div style={{display:"flex",gap:6}}>
                <ToggleBtn active={pair==="XAUUSD"} fg="#4ade80" bg="#0d2117" bd="#1a4a2a" onClick={()=>setPair("XAUUSD")}>XAUUSD</ToggleBtn>
                <ToggleBtn active={pair==="BTCUSD"} fg="#4ade80" bg="#0d2117" bd="#1a4a2a" onClick={()=>setPair("BTCUSD")}>BTCUSD</ToggleBtn>
              </div>
            </Field>
            <Field label="Direction">
              <div style={{display:"flex",gap:6}}>
                <ToggleBtn active={direction==="BUY"}  fg="#4ade80" bg="#0d2117" bd="#1a4a2a" onClick={()=>setDirection("BUY")}>BUY</ToggleBtn>
                <ToggleBtn active={direction==="SELL"} fg="#f87171" bg="#1a0d0d" bd="#3a1a1a" onClick={()=>setDirection("SELL")}>SELL</ToggleBtn>
              </div>
            </Field>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <Field label="Lot Size">
              <input type="number" step="0.01" placeholder="0.10" value={lot} onChange={e=>setLot(e.target.value)} style={INPUT_STYLE} />
            </Field>
            <Field label="Profit / Loss ($)">
              <input type="number" step="0.01" placeholder="150.00" value={pnl} onChange={e=>setPnl(e.target.value)} style={INPUT_STYLE} />
            </Field>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <Field label="Commission ($)">
              <input
                type="number"
                step="0.01"
                placeholder="3.50"
                value={commission}
                onChange={e=>setCommission(e.target.value)}
                disabled={pair === "XAUUSD"}
                style={{
                  ...INPUT_STYLE,
                  opacity: pair === "XAUUSD" ? 0.7 : 1,
                  cursor: pair === "XAUUSD" ? "not-allowed" : "text",
                }}
              />
              {pair === "XAUUSD" && (
                <div style={{marginTop:4,fontSize:9,color:"#5a6478",fontFamily:"'DM Mono', monospace"}}>
                  Auto: commission = lot x $7.00
                </div>
              )}
            </Field>
            <Field label="Setup">
              <select value={setup} onChange={e=>setSetup(e.target.value)} style={{...INPUT_STYLE,cursor:"pointer"}}>
                <option value="">— Select —</option>
                {["Trend","Range","Breakout","Reversal","News"].map(s=><option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <Field label="Stop Loss">
              <input type="number" step="0.01" placeholder="1920.00" value={sl} onChange={e=>setSl(e.target.value)} style={INPUT_STYLE} />
            </Field>
            <Field label="Take Profit">
              <input type="number" step="0.01" placeholder="1950.00" value={tp} onChange={e=>setTp(e.target.value)} style={INPUT_STYLE} />
            </Field>
          </div>

          <Field label="Outcome">
            <div style={{display:"flex",gap:8}}>
              <ToggleBtn active={outcome==="WIN"}  fg="#4ade80" bg="#0d2117" bd="#1a4a2a" onClick={()=>setOutcome("WIN")}  style={{padding:"13px 0",fontSize:13}}>✓ WIN</ToggleBtn>
              <ToggleBtn active={outcome==="LOSS"} fg="#f87171" bg="#1a0d0d" bd="#3a1a1a" onClick={()=>setOutcome("LOSS")} style={{padding:"13px 0",fontSize:13}}>✗ LOSS</ToggleBtn>
            </div>
          </Field>

          {error && <div style={{background:"#1a0d0d",border:"1px solid #3a1a1a",borderRadius:8,padding:"10px 14px",fontSize:11,color:"#f87171",fontFamily:"'DM Mono', monospace"}}>⚠ {error}</div>}

          <button onClick={handleSubmit} disabled={submitting}
            style={{background:submitting?"#1a2e1a":"linear-gradient(135deg,#4ade80,#22c55e)",border:"none",borderRadius:12,color:"#080b12",padding:"16px",cursor:submitting?"not-allowed":"pointer",fontSize:14,fontWeight:800,fontFamily:"'Syne', sans-serif",letterSpacing:1}}>
            {submitting ? "SAVING TO NOTION..." : "SAVE TRADE →"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
export default function TradingDashboard() {
  const [trades, setTrades]       = useState([]);
  const [accounts, setAccounts]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [activeTab, setActiveTab] = useState("analytics");
  const [chartTab, setChartTab]   = useState("daily");
  const [tableFilter, setTableFilter] = useState("all");
  const [showAddTrade, setShowAddTrade] = useState(false);
  const isMobile = useIsMobile();

  const loadData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [tr, ac] = await Promise.all([fetchTrades(), fetchAccounts()]);
      if (Array.isArray(tr)) setTrades(tr);
      if (Array.isArray(ac)) setAccounts(ac);
    } catch (e) { setError("Failed to load: " + (e?.message || String(e))); }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Stats ──
  const validTrades  = trades.filter(t => t.pnl != null);
  const totalNetPnl  = validTrades.reduce((s,t) => s + netPnl(t), 0);
  const wins         = validTrades.filter(t => t.outcome === "WIN");
  const losses       = validTrades.filter(t => t.outcome === "LOSS");
  const winRate      = validTrades.length ? ((wins.length / validTrades.length) * 100).toFixed(1) : "0.0";
  const avgWin       = wins.length   ? wins.reduce((s,t)=>s+netPnl(t),0)   / wins.length   : 0;
  const avgLoss      = losses.length ? Math.abs(losses.reduce((s,t)=>s+netPnl(t),0) / losses.length) : 1;
  const grossWin     = wins.reduce((s,t)=>s+netPnl(t),0);
  const grossLoss    = Math.abs(losses.reduce((s,t)=>s+netPnl(t),0));
  const profitFactor = grossLoss > 0 ? (grossWin / grossLoss).toFixed(2) : wins.length ? "∞" : "0";

  const activeAccounts = accounts.filter(a => a.status === "Active");
  const totalDeposit   = activeAccounts.reduce((s,a) => s + (a.initial||0) + (a.added||0), 0);
  const capitalNow     = totalDeposit + totalNetPnl;
  const returns        = totalDeposit > 0 ? ((totalNetPnl / totalDeposit) * 100).toFixed(2) : "0.00";
  const totalComm      = validTrades.reduce((s,t) => s + Math.abs(t.commission||0), 0);

  // ── Chart data ──
  const dayMap   = {}; validTrades.forEach(t=>{ if(!t.date)return; const d=t.date.slice(0,10); dayMap[d]=(dayMap[d]||0)+netPnl(t); });
  const dailyData = Object.entries(dayMap).sort(([a],[b])=>a.localeCompare(b)).map(([date,pnl])=>({label:date.slice(5),pnl}));
  const weekMap  = {}; validTrades.forEach(t=>{ if(!t.date)return; const w=getWeekKey(t.date); weekMap[w]=(weekMap[w]||0)+netPnl(t); });
  const weeklyData = Object.entries(weekMap).sort(([a],[b])=>a.localeCompare(b)).map(([label,pnl])=>({label,pnl}));
  const monthMap = {}; validTrades.forEach(t=>{ if(!t.date)return; const m=t.date.slice(0,7); monthMap[m]=(monthMap[m]||0)+netPnl(t); });
  const monthlyData = Object.entries(monthMap).sort(([a],[b])=>a.localeCompare(b)).map(([m,pnl])=>({label:m,pnl}));
  const pairMap  = {}; validTrades.forEach(t=>{ if(t.pair) pairMap[t.pair]=(pairMap[t.pair]||0)+netPnl(t); });
  const pairData = Object.entries(pairMap).map(([pair,pnl])=>({pair,pnl}));
  let cum = totalDeposit;
  const cumData  = validTrades.slice().sort((a,b)=>(a.date||"").localeCompare(b.date||"")).map(t=>{ cum+=netPnl(t); return {date:(t.date||"").slice(5),capital:parseFloat(cum.toFixed(2))}; });
  const consistency = losses.length > 0 ? Math.min((wins.length/losses.length)*30,100) : 100;
  const radarData = [
    {metric:"Win Rate",   value:parseFloat(winRate)},
    {metric:"Prof.Factor",value:Math.min(parseFloat(profitFactor)*18,100)},
    {metric:"Recovery",   value:Math.min(parseFloat(profitFactor)*10,100)},
    {metric:"Consistency",value:consistency},
    {metric:"Avg R:R",    value:Math.min((avgWin/Math.max(avgLoss,1))*33,100)},
  ];
  const currentChartData = ({daily:dailyData,weekly:weeklyData,monthly:monthlyData})[chartTab]||[];

  const TABS = [{id:"analytics",label:"📊",full:"Analytics"},{id:"journal",label:"📋",full:"Journal"},{id:"accounts",label:"💰",full:"Accounts"}];
  const pad = isMobile ? "12px 14px" : "22px 28px";

  return (
    <div style={{minHeight:"100vh",background:"#080b12",color:"#e8eaf0",fontFamily:"'DM Sans',sans-serif"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        ::-webkit-scrollbar{width:3px;height:3px;}
        ::-webkit-scrollbar-track{background:#0a0d14;}
        ::-webkit-scrollbar-thumb{background:#1e2433;border-radius:2px;}
        @keyframes spin{to{transform:rotate(360deg);}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:translateY(0);}}
        @keyframes slideUp{from{transform:translateY(100%);}to{transform:translateY(0);}}
        .fadein{animation:fadeIn .3s ease forwards;}
        input[type=number]::-webkit-outer-spin-button,input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none;}
        input[type=date]::-webkit-calendar-picker-indicator{filter:invert(0.5);}
        select option{background:#0f1117;color:#e8eaf0;}
        th:hover{color:#8899aa!important;}
      `}</style>

      {/* HEADER */}
      <div style={{borderBottom:"1px solid #1e2433",padding:isMobile?"0 14px":"0 28px",display:"flex",alignItems:"center",background:"#080b12",position:"sticky",top:0,zIndex:100,gap:8}}>
        <div style={{display:"flex",alignItems:"center",gap:6,paddingRight:12,borderRight:"1px solid #1e2433",flexShrink:0}}>
          <div style={{width:6,height:6,borderRadius:"50%",background:"#4ade80",boxShadow:"0 0 6px #4ade80"}} />
          {!isMobile && <span style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:11,letterSpacing:2,textTransform:"uppercase",color:"#e8eaf0"}}>TRADE JOURNAL</span>}
        </div>
        <div style={{display:"flex",flex:1}}>
          {TABS.map(tab=>(
            <button key={tab.id} onClick={()=>setActiveTab(tab.id)} style={{background:"none",border:"none",cursor:"pointer",padding:isMobile?"14px 10px":"18px 16px",fontSize:isMobile?16:10,color:activeTab===tab.id?"#4ade80":"#3a4255",borderBottom:`2px solid ${activeTab===tab.id?"#4ade80":"transparent"}`,fontFamily:isMobile?"inherit":"'DM Mono',monospace",letterSpacing:isMobile?0:1,transition:"all .2s",whiteSpace:"nowrap"}}>
              {isMobile ? tab.label : `${tab.label} ${tab.full.toUpperCase()}`}
            </button>
          ))}
        </div>
        <div style={{display:"flex",gap:6,flexShrink:0}}>
          <button onClick={()=>setShowAddTrade(true)} style={{background:"linear-gradient(135deg,#4ade80,#22c55e)",border:"none",color:"#080b12",padding:isMobile?"7px 12px":"7px 14px",borderRadius:8,cursor:"pointer",fontSize:isMobile?12:10,fontFamily:"'DM Mono',monospace",fontWeight:800,whiteSpace:"nowrap"}}>
            {isMobile?"+ Add":"+ ADD TRADE"}
          </button>
          <button onClick={loadData} style={{background:"#0f1520",border:"1px solid #1e2433",color:"#4ade80",padding:"7px 10px",borderRadius:8,cursor:"pointer",fontSize:14}}>↻</button>
        </div>
      </div>

      {/* CONTENT */}
      <div style={{padding:pad}}>
        {loading ? <Spinner /> : error ? (
          <div style={{textAlign:"center",padding:60,color:"#f87171",fontFamily:"'DM Mono',monospace",fontSize:12}}>{error}</div>
        ) : (<>

          {/* ── ANALYTICS ── */}
          {activeTab === "analytics" && (
            <div className="fadein" style={{display:"flex",flexDirection:isMobile?"column":"row",gap:14}}>
              {isMobile && (<>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                  <KPICard label="Win Rate"    value={`${winRate}%`}   color="#4ade80" icon="🎯" sub={`${wins.length}W/${losses.length}L`} />
                  <KPICard label="Net P&L"     value={fmt(totalNetPnl)} color={totalNetPnl>=0?"#4ade80":"#f87171"} icon="💹" sub="after comm" />
                  <KPICard label="Returns"     value={`${returns}%`}   color="#60a5fa" icon="📈" sub={`$${totalDeposit.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`} />
                  <KPICard label="Prof.Factor" value={profitFactor}    color="#f59e0b" icon="⚡" sub={`+${fmtNum(avgWin,{prefix:"$"})} avg`} />
                </div>
                <div style={{background:"#0f1117",border:"1px solid #1e2433",borderRadius:12,padding:"14px 16px"}}>
                  <div style={{fontSize:9,color:"#5a6478",fontFamily:"'DM Mono',monospace",letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>Capital actuel</div>
                  <div style={{fontSize:26,fontWeight:800,fontFamily:"'Syne',sans-serif",color:"#e8eaf0",marginBottom:10}}>${capitalNow.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
                    {[["Dépôt","$"+activeAccounts.reduce((s,a)=>s+(a.initial||0),0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}),"#8899aa"],["P&L net",fmt(totalNetPnl),totalNetPnl>=0?"#4ade80":"#f87171"],["Comm.",`-$${totalComm.toFixed(2)}`,"#f87171"]].map(([l,v,c])=>(
                      <div key={l} style={{background:"#080b12",borderRadius:8,padding:"8px 10px"}}>
                        <div style={{fontSize:8,color:"#5a6478",marginBottom:2}}>{l}</div>
                        <div style={{fontFamily:"'DM Mono',monospace",fontSize:11,color:c,fontWeight:600}}>{v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </>)}

              {/* Left sidebar */}
              <div style={{width:isMobile?"100%":270,flexShrink:0,display:"flex",flexDirection:"column",gap:12}}>
                <div style={{background:"#0f1117",border:"1px solid #1e2433",borderRadius:12,padding:14}}>
                  <div style={{fontSize:9,color:"#5a6478",fontFamily:"'DM Mono',monospace",letterSpacing:1,textTransform:"uppercase",marginBottom:8}}>Performance Profile</div>
                  <ResponsiveContainer width="100%" height={170}>
                    <RadarChart data={radarData} margin={{top:6,right:14,bottom:6,left:14}}>
                      <PolarGrid stroke="#1e2433" />
                      <PolarAngleAxis dataKey="metric" tick={{fill:"#5a6478",fontSize:7,fontFamily:"'DM Mono',monospace"}} />
                      <Radar dataKey="value" stroke="#4ade80" fill="#4ade80" fillOpacity={0.15} strokeWidth={1.5} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>

                <div style={{background:"#0f1117",border:"1px solid #1e2433",borderRadius:12,padding:14}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                    <div style={{fontSize:9,color:"#5a6478",fontFamily:"'DM Mono',monospace",letterSpacing:1,textTransform:"uppercase"}}>Performance</div>
                    <div style={{display:"flex",gap:4}}>
                      {["daily","weekly","monthly"].map(f=>(
                        <button key={f} onClick={()=>setChartTab(f)} style={{background:chartTab===f?"#0d2117":"none",border:`1px solid ${chartTab===f?"#1a4a2a":"#1e2433"}`,color:chartTab===f?"#4ade80":"#3a4255",padding:"2px 8px",borderRadius:4,cursor:"pointer",fontSize:8,fontFamily:"'DM Mono',monospace"}}>
                          {f[0].toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>
                  {currentChartData.length===0 ? (
                    <div style={{textAlign:"center",padding:28,color:"#3a4255",fontSize:10,fontFamily:"'DM Mono',monospace"}}>No data</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={120}>
                      <BarChart data={currentChartData} margin={{top:0,right:0,bottom:0,left:-24}}>
                        <XAxis dataKey="label" tick={{fill:"#3a4255",fontSize:7,fontFamily:"'DM Mono',monospace"}} axisLine={false} tickLine={false} />
                        <YAxis tick={{fill:"#3a4255",fontSize:7}} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={{background:"#0f1520",border:"1px solid #1e2433",borderRadius:8,fontSize:10}} formatter={v=>[fmt(v),"Net P&L"]} />
                        <Bar dataKey="pnl" radius={[3,3,0,0]}>
                          {currentChartData.map((_,i)=><Cell key={i} fill={currentChartData[i].pnl>=0?"#4ade80":"#f87171"}/>)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>

                {pairData.length>0 && (
                  <div style={{background:"#0f1117",border:"1px solid #1e2433",borderRadius:12,padding:14}}>
                    <div style={{fontSize:9,color:"#5a6478",fontFamily:"'DM Mono',monospace",letterSpacing:1,textTransform:"uppercase",marginBottom:10}}>By Pair</div>
                    {pairData.map(p=>(
                      <div key={p.pair} style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                        <span style={{fontSize:10,color:"#8899aa",width:56}}>{p.pair}</span>
                        <span style={{fontSize:11,fontWeight:700,color:p.pnl>=0?"#4ade80":"#f87171",fontFamily:"'DM Mono',monospace",width:56,textAlign:"right"}}>{fmt(p.pnl)}</span>
                        <div style={{flex:1,height:4,background:"#1e2433",borderRadius:2,overflow:"hidden"}}>
                          <div style={{height:"100%",width:`${Math.min((Math.abs(p.pnl)/Math.max(...pairData.map(x=>Math.abs(x.pnl))))*100,100)}%`,background:p.pnl>=0?"#4ade80":"#f87171",borderRadius:2}} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Right */}
              <div style={{flex:1,minWidth:0,display:"flex",flexDirection:"column",gap:12}}>
                {!isMobile && (<>
                  <div style={{display:"flex",gap:10}}>
                    <KPICard label="Win Rate"     value={`${winRate}%`}   color="#4ade80" icon="🎯" sub={`${wins.length}W / ${losses.length}L`} />
                    <KPICard label="Total P&L"    value={fmt(totalNetPnl)} color={totalNetPnl>=0?"#4ade80":"#f87171"} icon="💹" sub="Net of commissions" />
                    <KPICard label="Returns"      value={`${returns}%`}   color="#60a5fa" icon="📈" sub={`on $${totalDeposit.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`} />
                    <KPICard label="Profit Factor" value={profitFactor}   color="#f59e0b" icon="⚡" sub={`avg win ${fmtNum(avgWin,{prefix:"$"})}`} />
                  </div>
                  <div style={{background:"#0f1117",border:"1px solid #1e2433",borderRadius:12,padding:"14px 20px",display:"flex",gap:24,alignItems:"center",flexWrap:"wrap"}}>
                    <div>
                      <div style={{fontSize:9,color:"#5a6478",fontFamily:"'DM Mono',monospace",letterSpacing:1,textTransform:"uppercase",marginBottom:4}}>Capital actuel</div>
                      <div style={{fontSize:28,fontWeight:800,fontFamily:"'Syne',sans-serif",color:"#e8eaf0"}}>${capitalNow.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
                    </div>
                    <div style={{width:1,height:36,background:"#1e2433"}} />
                    {[
                      ["Dépôt",        "$"+activeAccounts.reduce((s,a)=>s+(a.initial||0),0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}), "#8899aa"],
                      ["Ajouts",       "+$"+activeAccounts.reduce((s,a)=>s+(a.added||0),0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}), "#8899aa"],
                      ["P&L net",      fmt(totalNetPnl), totalNetPnl>=0?"#4ade80":"#f87171"],
                      ["Commissions",  `-$${totalComm.toFixed(2)}`, "#f87171"],
                    ].map(([l,v,c])=>(
                      <div key={l}><div style={{fontSize:9,color:"#5a6478",marginBottom:2}}>{l}</div><div style={{fontFamily:"'DM Mono',monospace",color:c,fontSize:12}}>{v}</div></div>
                    ))}
                    <div style={{marginLeft:"auto",textAlign:"right"}}>
                      <div style={{fontSize:9,color:"#5a6478",marginBottom:2}}>Trades</div>
                      <div style={{fontFamily:"'DM Mono',monospace",fontSize:22,fontWeight:700,color:"#e8eaf0"}}>{validTrades.length}</div>
                    </div>
                  </div>
                </>)}
                <div style={{background:"#0f1117",border:"1px solid #1e2433",borderRadius:12,padding:14,flex:1}}>
                  <CalendarView trades={validTrades} year={new Date().getFullYear()} month={new Date().getMonth()} />
                </div>
              </div>
            </div>
          )}

          {/* ── JOURNAL ── */}
          {activeTab === "journal" && (
            <div className="fadein" style={{background:"#0f1117",border:"1px solid #1e2433",borderRadius:12,padding:isMobile?14:20}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14,flexWrap:"wrap",gap:8}}>
                <div>
                  <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:15}}>Trade Journal</div>
                  {!isMobile && <div style={{fontSize:9,color:"#5a6478",fontFamily:"'DM Mono',monospace",marginTop:3}}>Cliquez sur un en-tête pour trier</div>}
                </div>
                <div style={{display:"flex",gap:6}}>
                  {[["all","All"],["week","Week"],["month","Month"]].map(([f,l])=>(
                    <button key={f} onClick={()=>setTableFilter(f)} style={{background:tableFilter===f?"#0d2117":"none",border:`1px solid ${tableFilter===f?"#1a4a2a":"#1e2433"}`,color:tableFilter===f?"#4ade80":"#3a4255",padding:"5px 10px",borderRadius:6,cursor:"pointer",fontSize:9,fontFamily:"'DM Mono',monospace",letterSpacing:1,textTransform:"uppercase"}}>{l}</button>
                  ))}
                </div>
              </div>
              <TradeTable trades={validTrades} filter={tableFilter} />
              <div style={{marginTop:12,paddingTop:12,borderTop:"1px solid #1e2433",display:"flex",gap:16,flexWrap:"wrap"}}>
                {[["Trades",String(validTrades.length),"#e8eaf0"],["Net P&L",fmt(totalNetPnl),totalNetPnl>=0?"#4ade80":"#f87171"],["Win Rate",`${winRate}%`,"#4ade80"]].map(([l,v,c])=>(
                  <div key={l} style={{fontSize:10,color:"#5a6478"}}>{l}: <span style={{color:c,fontFamily:"'DM Mono',monospace",fontWeight:700}}>{v}</span></div>
                ))}
              </div>
            </div>
          )}

          {/* ── ACCOUNTS ── */}
          {activeTab === "accounts" && (
            <div className="fadein" style={{display:"flex",flexDirection:"column",gap:14}}>
              <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"repeat(auto-fill,minmax(260px,1fr))",gap:12}}>
                {activeAccounts.map(a=>{
                  const acTrades  = validTrades.filter((t) => {
                    if (Array.isArray(t.accountIds)) return t.accountIds.includes(a.id);
                    if (t.accountId) return t.accountId === a.id;
                    return true;
                  });
                  const acPnl     = acTrades.reduce((s,t)=>s+netPnl(t),0);
                  const acCapital = (a.initial||0)+(a.added||0)+acPnl;
                  return (
                    <div key={a.id} style={{background:"#0f1117",border:"1px solid #1e2433",borderRadius:12,padding:18,position:"relative",overflow:"hidden"}}>
                      <div style={{position:"absolute",top:0,left:0,right:0,height:2,background:"linear-gradient(90deg,#4ade80,transparent)"}} />
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
                        <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:14}}>{a.name||"Account"}</div>
                        <span style={{background:a.status==="Active"?"#0d2117":"#1a1a2e",color:a.status==="Active"?"#4ade80":"#818cf8",padding:"2px 8px",borderRadius:20,fontSize:9,fontWeight:700,border:`1px solid ${a.status==="Active"?"#1a4a2a":"#2a2a4e"}`}}>{a.status}</span>
                      </div>
                      <div style={{fontSize:26,fontWeight:800,fontFamily:"'Syne',sans-serif",marginBottom:12}}>${acCapital.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                        {[["Initial","$"+(a.initial||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}),"#8899aa"],["Ajouts","+"+"$"+(a.added||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}),"#60a5fa"],["P&L net",fmt(acPnl),acPnl>=0?"#4ade80":"#f87171"],["Depuis",a.depositDate||"—","#8899aa"]].map(([l,v,c])=>(
                          <div key={l} style={{background:"#080b12",borderRadius:8,padding:"10px 12px"}}>
                            <div style={{fontSize:9,color:"#5a6478",marginBottom:3}}>{l}</div>
                            <div style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:c,fontWeight:600}}>{v}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{background:"#0f1117",border:"1px solid #1e2433",borderRadius:12,padding:isMobile?14:20}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:14}}>
                  <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:14}}>Courbe d'équité</div>
                  <div style={{fontSize:9,color:"#5a6478",fontFamily:"'DM Mono',monospace"}}>Capital cumulé</div>
                </div>
                {cumData.length===0 ? (
                  <div style={{textAlign:"center",padding:40,color:"#3a4255",fontSize:11,fontFamily:"'DM Mono',monospace"}}>Add trades to see equity curve</div>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={cumData}>
                      <CartesianGrid stroke="#0f1520" strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{fill:"#3a4255",fontSize:8,fontFamily:"'DM Mono',monospace"}} axisLine={false} tickLine={false} />
                      <YAxis tick={{fill:"#3a4255",fontSize:8}} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{background:"#0f1520",border:"1px solid #1e2433",borderRadius:8,fontSize:11}} formatter={v=>[`$${Number(v).toLocaleString(undefined,{maximumFractionDigits:2})}`,"Capital"]} />
                      <Line type="monotone" dataKey="capital" stroke="#4ade80" strokeWidth={2} dot={{fill:"#4ade80",r:3}} activeDot={{r:5,fill:"#4ade80"}} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div style={{background:"#0f1117",border:"1px solid #1e2433",borderRadius:12,padding:isMobile?14:20}}>
                <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:14,marginBottom:14}}>Statistiques globales</div>
                <div style={{display:"grid",gridTemplateColumns:isMobile?"repeat(2,1fr)":"repeat(4,1fr)",gap:10}}>
                  {[
                    ["Meilleur", validTrades.length?fmt(Math.max(...validTrades.map(netPnl))):"—", "#4ade80"],
                    ["Pire",     validTrades.length?fmt(Math.min(...validTrades.map(netPnl))):"—", "#f87171"],
                    ["Avg Win",  fmtNum(avgWin,{prefix:"$"}), "#4ade80"],
                    ["Avg Loss", `-${fmtNum(avgLoss,{prefix:"$"})}`, "#f87171"],
                    ["Trades",   String(validTrades.length), "#e8eaf0"],
                    ["Wins",     String(wins.length),   "#4ade80"],
                    ["Losses",   String(losses.length), "#f87171"],
                    ["Prof.Factor", profitFactor,       "#f59e0b"],
                  ].map(([l,v,c])=>(
                    <div key={l} style={{background:"#080b12",borderRadius:10,padding:"12px 14px",border:"1px solid #0f1520"}}>
                      <div style={{fontSize:8,color:"#5a6478",fontFamily:"'DM Mono',monospace",letterSpacing:1,marginBottom:5,textTransform:"uppercase"}}>{l}</div>
                      <div style={{fontSize:18,fontWeight:700,color:c,fontFamily:"'Syne',sans-serif"}}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>)}
      </div>

      {showAddTrade && <AddTradeModal onClose={()=>setShowAddTrade(false)} onSuccess={loadData} />}
    </div>
  );
}
