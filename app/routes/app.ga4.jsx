// app/routes/app.ga4.jsx
// Kimono SEO #30 — AI Traffic Monitor

import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

const AI_SOURCES = [
  { id: "chatgpt",    name: "ChatGPT",    color: "#10B981", icon: "\u{1F916}" },
  { id: "perplexity", name: "Perplexity", color: "#0D9488", icon: "\u{1F52E}" },
  { id: "claude",     name: "Claude",     color: "#F97316", icon: "\u{1F9E0}" },
  { id: "gemini",     name: "Gemini",     color: "#3B82F6", icon: "\u{1F4AB}" },
  { id: "copilot",    name: "Copilot",    color: "#0EA5E9", icon: "\u{1FA81}" },
];

function MiniBar({ value, max, color }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="prog" style={{ flex: 1, marginTop: 0 }}>
      <div className="prog-fill" style={{ background: color, width: `${pct}%` }} />
    </div>
  );
}

function SimpleLineChart({ timeline, sources }) {
  if (!timeline || timeline.length === 0) return <div style={{ color: "var(--ink-4)", textAlign: "center", padding: "40px", fontSize: "13px" }}>No data for selected period</div>;

  const maxVal = Math.max(...timeline.map(d => d.total || 0), 1);
  const w = 600, h = 140, pad = 30;
  const xs = timeline.map((_, i) => pad + (i / Math.max(timeline.length - 1, 1)) * (w - pad * 2));
  const ys = timeline.map(d => h - pad - ((d.total || 0) / maxVal) * (h - pad * 2));

  const path = xs.map((x, i) => `${i === 0 ? "M" : "L"}${x},${ys[i]}`).join(" ");

  return (
    <div style={{ overflowX: "auto" }}>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", maxWidth: w, display: "block" }}>
        {[0, 0.25, 0.5, 0.75, 1].map(v => {
          const y = h - pad - v * (h - pad * 2);
          return <line key={v} x1={pad} x2={w - pad} y1={y} y2={y} stroke="var(--line)" strokeWidth="1" />;
        })}
        {[0, Math.round(maxVal / 2), maxVal].map((v, i) => {
          const y = h - pad - (v / maxVal) * (h - pad * 2);
          return <text key={i} x={pad - 4} y={y + 4} textAnchor="end" fontSize="9" fill="var(--ink-4)">{v}</text>;
        })}
        <path d={`${path} L${xs[xs.length - 1]},${h - pad} L${xs[0]},${h - pad} Z`} fill="var(--accent)" fillOpacity="0.08" />
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" />
        {xs.map((x, i) => <circle key={i} cx={x} cy={ys[i]} r="3" fill="var(--accent)" />)}
        {timeline.filter((_, i) => i === 0 || i === timeline.length - 1 || i % Math.max(1, Math.floor(timeline.length / 6)) === 0).map((d) => {
          const idx = timeline.indexOf(d);
          const dateStr = d.date ? `${d.date.slice(4, 6)}/${d.date.slice(6, 8)}` : "";
          return <text key={idx} x={xs[idx]} y={h - 4} textAnchor="middle" fontSize="9" fill="var(--ink-4)">{dateStr}</text>;
        })}
      </svg>
    </div>
  );
}

export default function Ga4Page() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [connected, setConnected] = useState(false);
  const [authUrl, setAuthUrl] = useState("");
  const [propertyName, setPropertyName] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [days, setDays] = useState(30);
  const [msg, setMsg] = useState(null);

  useEffect(() => { init(); }, []);
  useEffect(() => { if (connected) fetchData(); }, [days]);

  async function init() {
    setLoading(true);
    try {
      const r = await fetch("/api/ga4");
      const d = await r.json();
      setConnected(d.connected);
      setAuthUrl(d.authUrl || "");
      setPropertyName(d.propertyName || "");
      if (d.connected) fetchData();
      if (searchParams.get("connected") === "1") setMsg({ type: "ok", text: "Google Analytics 4 connected successfully!" });
    } catch {}
    setLoading(false);
  }

  async function fetchData() {
    setFetching(true);
    try {
      const r = await fetch("/api/ga4", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "fetch_data", days }),
      });
      const d = await r.json();
      if (d.success) setData(d.data);
      else setMsg({ type: "err", text: d.error || "Failed to fetch GA4 data" });
    } catch (e) { setMsg({ type: "err", text: e.message }); }
    setFetching(false);
  }

  async function disconnect() {
    await fetch("/api/ga4", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ intent: "disconnect" }) });
    setConnected(false);
    setData(null);
    setPropertyName("");
  }

  const totals = data?.totals || {};
  const maxSessions = Math.max(...(data?.sources || []).map(s => s.sessions), 1);

  return (
    <div className="page active">
      {/* Header */}
      <div className="page-head">
        <div>
          <h1 className="page-title">AI Traffic Monitor</h1>
          <p className="page-sub">Track traffic from ChatGPT, Perplexity, Claude, Gemini and Copilot via Google Analytics 4</p>
        </div>
        <div className="page-actions">
          {connected && (
            <>
              <select value={days} onChange={e => setDays(Number(e.target.value))} className="select">
                <option value={7}>Last 7 days</option>
                <option value={30}>Last 30 days</option>
                <option value={90}>Last 90 days</option>
              </select>
              <button onClick={fetchData} disabled={fetching} className="btn btn-primary">
                {fetching ? "Refreshing..." : "Refresh"}
              </button>
            </>
          )}
        </div>
      </div>

      {msg && (
        <div className={`alert-banner ${msg.type === "ok" ? "ok" : "warn"}`}>
          {msg.text}
        </div>
      )}

      {loading && <div style={{ textAlign: "center", color: "var(--ink-3)", padding: "60px" }}>Loading...</div>}

      {/* Not connected */}
      {!loading && !connected && (
        <div className="card" style={{ textAlign: "center", padding: "60px 20px" }}>
          <div style={{ fontSize: "40px", marginBottom: "16px" }}>&#x1F4CA;</div>
          <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "12px" }}>Connect Google Analytics 4</h2>
          <p className="page-sub" style={{ maxWidth: "480px", margin: "0 auto 24px" }}>
            Connect your GA4 account to track how much traffic your store receives from AI engines like ChatGPT, Perplexity, Claude and Gemini.
          </p>
          <div className="chip-group" style={{ justifyContent: "center", marginBottom: "20px" }}>
            {AI_SOURCES.map(s => (
              <span key={s.id} className="chip" style={{ color: s.color, borderColor: s.color }}>
                {s.icon} {s.name}
              </span>
            ))}
          </div>
          <button
            onClick={() => { if (authUrl) window.top.location.href = authUrl; }}
            className="btn btn-primary"
          >
            Connect Google Analytics 4
          </button>
          <p style={{ fontSize: "12px", color: "var(--ink-4)", marginTop: "16px" }}>
            Uses the same Google account as GSC. Scope: analytics.readonly
          </p>
        </div>
      )}

      {/* Connected + data */}
      {connected && !loading && (
        <>
          {/* Connection info */}
          <div className="alert-banner ok" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ color: "var(--accent)", fontSize: "16px" }}>{"\u2713"}</span>
              <span style={{ fontWeight: 600 }}>Connected to GA4</span>
              {propertyName && <span style={{ fontSize: "12px", color: "var(--ink-3)" }}>&middot; {propertyName}</span>}
            </div>
            <button onClick={disconnect} className="btn btn-ghost" style={{ color: "var(--danger)", borderColor: "var(--danger-soft)" }}>Disconnect</button>
          </div>

          {fetching && !data && <div style={{ textAlign: "center", color: "var(--ink-3)", padding: "40px" }}>Fetching data from GA4...</div>}

          {data && (
            <>
              {/* Totals */}
              <div className="metric-grid">
                {[
                  ["Total AI Sessions", totals.sessions?.toLocaleString() || "0", "var(--accent)"],
                  ["Unique Users", totals.users?.toLocaleString() || "0", "var(--accent-ink)"],
                  ["Conversions", totals.conversions?.toLocaleString() || "0", "var(--warn)"],
                  ["Revenue", totals.revenue ? `$${totals.revenue.toFixed(2)}` : "$0", "var(--accent)"],
                ].map(([label, val, color]) => (
                  <div key={label} className="metric">
                    <div className="metric-label">{label}</div>
                    <div className="metric-value" style={{ color }}>{val}</div>
                  </div>
                ))}
              </div>

              {/* Timeline chart */}
              <div className="chart-card" style={{ marginBottom: "18px" }}>
                <div className="chart-title">AI Traffic Over Time &mdash; last {days} days</div>
                <SimpleLineChart timeline={data.timeline} sources={data.sources} />
              </div>

              {/* By source */}
              <div className="card" style={{ padding: "16px 20px", marginBottom: "18px" }}>
                <div className="card-head" style={{ border: "none", padding: "0 0 14px" }}>
                  <div className="card-title">Sessions by AI Source</div>
                </div>
                {data.sources.length === 0 ? (
                  <div style={{ color: "var(--ink-4)", fontSize: "13px", textAlign: "center", padding: "20px" }}>
                    No AI referral traffic detected in this period. This is normal &mdash; AI traffic is still emerging.
                  </div>
                ) : data.sources.map(s => (
                  <div key={s.id} className="data-row" style={{ gridTemplateColumns: "24px 100px 1fr auto auto" }}>
                    <span style={{ fontSize: "18px" }}>{s.icon}</span>
                    <span style={{ fontSize: "13px", fontWeight: 600 }}>{s.name}</span>
                    <MiniBar value={s.sessions} max={maxSessions} color={s.color} />
                    <div style={{ textAlign: "right", minWidth: "120px" }}>
                      <span style={{ fontWeight: 700 }}>{s.sessions.toLocaleString()}</span>
                      <span style={{ fontSize: "12px", color: "var(--ink-3)" }}> sessions</span>
                    </div>
                    <div style={{ textAlign: "right", minWidth: "80px", fontSize: "12px", color: "var(--ink-3)" }}>
                      {s.users} users
                    </div>
                  </div>
                ))}
              </div>

              {/* Top pages */}
              {data.topPages?.length > 0 && (
                <div className="card" style={{ padding: "16px 20px", marginBottom: "18px" }}>
                  <div className="card-head" style={{ border: "none", padding: "0 0 14px" }}>
                    <div className="card-title">Top Pages from AI Traffic</div>
                  </div>
                  {data.topPages.slice(0, 10).map((p, i) => (
                    <div key={i} className="data-row" style={{ gridTemplateColumns: "20px 24px 1fr auto auto" }}>
                      <span style={{ color: "var(--ink-4)", fontSize: "12px" }}>{i + 1}</span>
                      <span style={{ fontSize: "14px" }}>{p.icon}</span>
                      <span style={{ fontFamily: "var(--mono)", fontSize: "12px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.path}</span>
                      <span style={{ fontSize: "12px", color: "var(--ink-3)", whiteSpace: "nowrap" }}>via {p.source}</span>
                      <span style={{ fontWeight: 700, minWidth: "60px", textAlign: "right" }}>{p.sessions}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Info */}
              <div className="card" style={{ padding: "16px 20px", background: "var(--surface-2)", fontSize: "12px", color: "var(--ink-3)", lineHeight: 1.7 }}>
                <strong style={{ color: "var(--ink-1)" }}>Data source:</strong> Google Analytics 4 Reporting API &middot; Referral sessions where source matches AI engine domains (chatgpt.com, perplexity.ai, claude.ai, gemini.google.com, copilot.microsoft.com)
                <br />
                <strong style={{ color: "var(--ink-1)" }}>Note:</strong> AI traffic converts 3-4x better than average organic traffic but volume is still small for most stores. Focus on LLMs.txt quality and blog content to grow AI citations.
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
