// app/components/GscPanel.jsx
// Kimono SEO — Google Search Console Panel
// 100% inline styles, no design-system dependency

import { useState, useCallback } from "react";

const card        = { background: "#fff", border: "1px solid #E5E7EB", borderRadius: "10px", padding: "20px", marginBottom: "16px" };
const btnPrimary  = { padding: "7px 16px", background: "#111827", color: "#fff", border: "1px solid transparent", borderRadius: "8px", fontSize: "13px", cursor: "pointer", fontFamily: "inherit", fontWeight: "500" };
const btnSecondary = { padding: "7px 16px", background: "#fff", color: "#374151", border: "1px solid #D1D5DB", borderRadius: "8px", fontSize: "13px", cursor: "pointer", fontFamily: "inherit", fontWeight: "500" };
const btnDisabled  = { ...btnSecondary, opacity: 0.4, cursor: "not-allowed" };
const select = { padding: "6px 10px", border: "1px solid #D1D5DB", borderRadius: "6px", fontSize: "12px", fontFamily: "inherit", outline: "none", background: "#fff" };

const VIEWS   = [{ key: "queries", label: "Top Queries" }, { key: "pages", label: "Top Pages" }, { key: "trend", label: "Trend" }];
const PERIODS = [{ value: 7, label: "7 days" }, { value: 28, label: "28 days" }, { value: 90, label: "90 days" }];

export default function GscPanel({ gscConnected, gscSiteUrl, gscAuthUrl }) {
  const [view,    setView]    = useState("queries");
  const [days,    setDays]    = useState(28);
  const [loaded,  setLoaded]  = useState(false);
  const [result,  setResult]  = useState(null);
  const [error,   setError]   = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (v, d) => {
    setLoading(true);
    setError("");
    try {
      const resp = await fetch(`/api/gsc/data?view=${v}&days=${d}`);
      const data = await resp.json();
      if (data.success) {
        setResult(data.data);
      } else {
        setError(data.error || "Failed to load GSC data.");
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, []);

  const handleConnect = useCallback(() => { window.top.location.href = gscAuthUrl; }, [gscAuthUrl]);

  if (!gscConnected) {
    return (
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: "15px", fontWeight: "600", color: "#111827", marginBottom: "4px" }}>Google Search Console</div>
            <div style={{ fontSize: "13px", color: "#6B7280" }}>Connect GSC to see real clicks, impressions and keyword rankings.</div>
          </div>
          <button onClick={handleConnect} style={btnPrimary}>Connect GSC →</button>
        </div>
        <div style={{ marginTop: "12px", fontSize: "12px", color: "#9CA3AF" }}>Opens in a new tab. After connecting, refresh this page.</div>
      </div>
    );
  }

  const posColor = (pos) => pos <= 3 ? "#16A34A" : pos <= 10 ? "#D97706" : "#9CA3AF";

  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
        <div>
          <div style={{ fontSize: "15px", fontWeight: "600", color: "#111827", marginBottom: "2px" }}>Google Search Console</div>
          {gscSiteUrl && <div style={{ fontSize: "12px", color: "#6B7280" }}>{gscSiteUrl}</div>}
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <select value={days} onChange={(e) => { const d = Number(e.target.value); setDays(d); load(view, d); }} style={select}>
            {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          {!loaded ? (
            <button onClick={() => load(view, days)} style={btnPrimary}>Load Data</button>
          ) : (
            <button onClick={() => load(view, days)} disabled={loading} style={loading ? btnDisabled : btnSecondary}>
              {loading ? "Loading..." : "Refresh"}
            </button>
          )}
        </div>
      </div>

      {!loaded && !loading && <div style={{ fontSize: "13px", color: "#6B7280", padding: "12px 0" }}>Click "Load Data" to fetch your GSC performance data.</div>}

      {loading && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px 0", fontSize: "13px", color: "#6B7280" }}>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <span style={{ display: "inline-block", width: "12px", height: "12px", borderRadius: "50%", border: "2px solid #E5E7EB", borderTopColor: "#3B82F6", animation: "spin 0.8s linear infinite" }} />
          Loading from Google Search Console...
        </div>
      )}

      {error && <div style={{ padding: "10px 14px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: "8px", fontSize: "13px", color: "#991B1B", marginBottom: "12px" }}>{error}</div>}

      {loaded && !loading && result && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px", marginBottom: "16px" }}>
            {[
              { label: "Clicks",       value: result.summary.totalClicks.toLocaleString(),      color: "#3B82F6" },
              { label: "Impressions",  value: result.summary.totalImpressions.toLocaleString(), color: "#0284C7" },
              { label: "Avg CTR",      value: `${result.summary.avgCtr}%`,                      color: "#16A34A" },
              { label: "Avg Position", value: `#${result.summary.avgPosition}`,                 color: "#D97706" },
            ].map((m) => (
              <div key={m.label} style={{ background: "#F9FAFB", border: "1px solid #F3F4F6", borderRadius: "8px", padding: "12px", textAlign: "center" }}>
                <div style={{ fontSize: "22px", fontWeight: "700", color: m.color, fontFamily: "monospace" }}>{m.value}</div>
                <div style={{ fontSize: "10px", color: "#9CA3AF", marginTop: "3px", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: "600" }}>{m.label}</div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: "4px", marginBottom: "16px" }}>
            {VIEWS.map((v) => (
              <button key={v.key} onClick={() => { setView(v.key); load(v.key, days); }} style={{ ...btnSecondary, fontSize: "12px", padding: "5px 14px", background: view === v.key ? "#111827" : "#fff", color: view === v.key ? "#fff" : "#374151", borderColor: view === v.key ? "#111827" : "#D1D5DB" }}>
                {v.label}
              </button>
            ))}
          </div>

          {result.rows.length === 0 ? (
            <div style={{ fontSize: "13px", color: "#6B7280" }}>No data for this period.</div>
          ) : (
            <div style={{ maxHeight: "400px", overflowY: "auto" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 100px 70px 80px", gap: "8px", padding: "4px 0", borderBottom: "2px solid #F3F4F6", marginBottom: "4px" }}>
                {["Keyword / URL", "Clicks", "Impressions", "CTR", "Position"].map((h) => (
                  <div key={h} style={{ fontSize: "10px", color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: "600" }}>{h}</div>
                ))}
              </div>
              {result.rows.map((row, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 80px 100px 70px 80px", gap: "8px", padding: "6px 0", borderBottom: "1px solid #F9FAFB", fontSize: "13px", alignItems: "center" }}>
                  <span style={{ color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={row.label}>{row.label}</span>
                  <span style={{ fontFamily: "monospace", fontSize: "12px", color: "#3B82F6", fontWeight: "700" }}>{row.clicks.toLocaleString()}</span>
                  <span style={{ fontFamily: "monospace", fontSize: "12px", color: "#0284C7" }}>{row.impressions.toLocaleString()}</span>
                  <span style={{ fontFamily: "monospace", fontSize: "12px", color: "#16A34A" }}>{row.ctr}%</span>
                  <span style={{ fontFamily: "monospace", fontSize: "12px", color: posColor(row.position), fontWeight: row.position <= 3 ? "700" : "500" }}>#{row.position}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
