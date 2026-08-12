// app/routes/app.cannibalization.jsx
// Kimono SEO #21 — Keyword Cannibalization Detector UI

import { useLoaderData, useNavigate } from "react-router";
import { useState } from "react";
import prisma from "../db.server.js";

export const loader = async ({ request }) => {
  const { requireAuth } = await import("../lib/auth/index.server.js");
  const { storeId, connection } = await requireAuth(request);
  if (!storeId) return {};
  const store = await prisma.store.findUnique({ where: { id: storeId } });

  const [saved, gscToken] = await Promise.all([
    prisma.seoSetting.findUnique({ where: { storeId_key: { storeId: store.id, key: "cannibalization_results" } } }),
    prisma.seoSetting.findUnique({ where: { storeId_key: { storeId: store.id, key: "seo_gsc_refresh_token" } } }),
  ]);

  let data = null;
  if (saved?.value) { try { data = JSON.parse(saved.value); } catch {} }

  return { data, gscConnected: !!gscToken?.value };
};

const SEV_CLASS = { high: "critical", medium: "warn", low: "ok" };
const SEV_LABEL = { high: "High", medium: "Medium", low: "Low" };

const FIX = {
  canonical:     { label: "Set canonical", desc: "Point duplicate URL to winner with rel=canonical" },
  merge_content: { label: "Merge content", desc: "Merge weaker article into the stronger one + 301 redirect" },
};

export default function CannibalizationPage() {
  const { data: init, gscConnected } = useLoaderData();
  const navigate    = useNavigate();
  const [data,      setData]      = useState(init);
  const [analyzing, setAnalyzing] = useState(false);
  const [error,     setError]     = useState(null);
  const [filter,    setFilter]    = useState("all");
  const [expanded,  setExpanded]  = useState(null);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);

  async function analyze() {
    setAnalyzing(true);
    setError(null);
    try {
      const r = await fetch("/api/cannibalization", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ intent: "analyze" }),
      });
      const d = await r.json();
      if (d.success) setData(d);
      else setError(d.error);
    } catch (e) { setError(e.message); }
    setAnalyzing(false);
  }

  const filtered = (data?.keywords || []).filter(k =>
    filter === "all" ? true : k.severity === filter
  );
  const paginatedFiltered = filtered.slice((page - 1) * perPage, page * perPage);

  return (
    <div className="page active">
      {/* Header */}
      <div className="page-head">
        <div>
          <h1 className="page-title">Cannibalization Detector</h1>
          <p className="page-sub">Keywords where multiple pages compete in Google &mdash; hurting your rankings.</p>
        </div>
        <div className="page-actions">
          <button onClick={analyze} disabled={analyzing || !gscConnected}
            className={`btn ${analyzing || !gscConnected ? "btn-ghost" : "btn-primary"}`}
            style={{ opacity: analyzing || !gscConnected ? 0.6 : 1 }}>
            {analyzing ? "Analyzing..." : "Analyze"}
          </button>
        </div>
      </div>

      {!gscConnected && (
        <div className="alert-banner warn">
          GSC not connected &mdash; <button onClick={() => navigate("/app/settings")} style={{ background: "none", border: "none", padding: 0, color: "inherit", textDecoration: "underline", fontSize: "inherit", cursor: "pointer" }}>Connect Google Search Console</button>
        </div>
      )}

      {error && <div className="alert-banner warn">{error}</div>}

      {data && (
        <>
          {/* Stats */}
          <div className="metric-grid">
            {[
              { label: "Cannibalized",  value: data.cannibalized },
              { label: "High severity", value: data.highSeverity },
              { label: "Medium",        value: data.mediumSeverity },
              { label: "Low",           value: data.lowSeverity },
            ].map(s => (
              <div key={s.label} className="metric">
                <div className="metric-label">{s.label}</div>
                <div className="metric-value">{s.value}</div>
              </div>
            ))}
          </div>

          <p style={{ fontSize: "12px", color: "var(--ink-3)", marginBottom: "12px" }}>
            {data.siteUrl} &middot; {data.dateRange} &middot; {data.totalKeywords?.toLocaleString()} keywords analyzed &middot; {new Date(data.analyzedAt).toLocaleString("ro-RO")}
          </p>

          {/* Filter */}
          <div className="chip-group" style={{ marginBottom: "16px" }}>
            {[["all", `All (${data.cannibalized})`], ["high", `High (${data.highSeverity})`], ["medium", `Medium (${data.mediumSeverity})`], ["low", `Low (${data.lowSeverity})`]].map(([k, l]) => (
              <button key={k} onClick={() => { setFilter(k); setPage(1); }} className={`chip${filter === k ? " active" : ""}`}>{l}</button>
            ))}
          </div>

          {/* Results */}
          <div className="card">
            {filtered.length === 0 ? (
              <div style={{ padding: "40px", textAlign: "center", color: "var(--ink-3)", fontSize: "13px" }}>No cannibalization found for this filter.</div>
            ) : (
              <>
                <div className="table-wrap">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Severity</th>
                        <th>Keyword</th>
                        <th className="right">URLs</th>
                        <th className="right">Impressions</th>
                        <th>Fix</th>
                        <th style={{ width: "30px" }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedFiltered.map((k, i) => {
                        const fix  = FIX[k.fix] || FIX.canonical;
                        const absIdx = (page - 1) * perPage + i;
                        const open = expanded === absIdx;
                        return (
                          <tr key={i} onClick={() => setExpanded(open ? null : absIdx)} style={{ cursor: "pointer" }}>
                            <td>
                              <span className={`q-tag ${SEV_CLASS[k.severity] || "info"}`}>{SEV_LABEL[k.severity]}</span>
                            </td>
                            <td className="kw">{k.keyword}</td>
                            <td className="right mono">{k.urlCount}</td>
                            <td className="right mono">{k.totalImpressions.toLocaleString()}</td>
                            <td><span className="q-tag ok">{fix.label}</span></td>
                            <td className="right" style={{ color: "var(--ink-4)", fontSize: "12px" }}>{open ? "\u25B2" : "\u25BC"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Expanded detail */}
                {expanded !== null && (() => {
                  const k = filtered[expanded]; if (!k) return null;
                  const fix = FIX[k.fix] || FIX.canonical;
                  return (
                    <div style={{ background: "var(--surface-2)", padding: "14px 16px", borderTop: "1px solid var(--line)" }}>
                      <p style={{ fontSize: "12px", color: "var(--ink-2)", marginBottom: "10px" }}>
                        <strong>Recommended fix:</strong> {fix.desc} &middot; Position spread: {k.positionSpread} positions
                      </p>
                      <div className="table-wrap">
                        <table className="tbl">
                          <thead>
                            <tr>
                              <th style={{ width: "60px" }}></th>
                              <th>URL</th>
                              <th className="center">Position</th>
                              <th className="center">Clicks</th>
                              <th className="center">Impressions</th>
                              <th className="center">CTR</th>
                            </tr>
                          </thead>
                          <tbody>
                            {[k.winner, ...k.losers].map((u, ui) => (
                              <tr key={ui} style={{ background: ui === 0 ? "var(--accent-soft)" : "transparent" }}>
                                <td className="center">
                                  <span style={{ fontSize: "9px", fontWeight: "700", color: ui === 0 ? "var(--accent-ink)" : "var(--danger)" }}>{ui === 0 ? "WINNER" : "LOSER"}</span>
                                </td>
                                <td style={{ maxWidth: "350px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  <a href={u.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>{u.url.replace(/https?:\/\/[^/]+/, "")}</a>
                                </td>
                                <td className="center mono" style={{ fontWeight: "600", color: u.position <= 10 ? "var(--accent-ink)" : "var(--warn)" }}>#{u.position}</td>
                                <td className="center mono">{u.clicks}</td>
                                <td className="center mono">{u.impressions.toLocaleString()}</td>
                                <td className="center mono">{u.ctr}%</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })()}
              </>
            )}
          </div>

{filtered.length > perPage && (
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 0",fontSize:"13px",color:"var(--ink-3)"}}>
              <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
                <span>Randuri per pagina:</span>
                <select value={perPage} onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }} style={{padding:"4px 8px",fontSize:"12px",borderRadius:"6px",border:"1px solid var(--line)"}}>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:"4px"}}>
                <span>{(page-1)*perPage+1}–{Math.min(page*perPage, filtered.length)} din {filtered.length}</span>
                <button style={{padding:"4px 8px",border:"1px solid var(--line)",borderRadius:"6px",background:"var(--surface)",cursor:"pointer"}} disabled={page <= 1} onClick={() => setPage(p => p-1)}>←</button>
                <button style={{padding:"4px 8px",border:"1px solid var(--line)",borderRadius:"6px",background:"var(--surface)",cursor:"pointer"}} disabled={page >= Math.ceil(filtered.length/perPage)} onClick={() => setPage(p => p+1)}>→</button>
              </div>
            </div>
          )}

          <p style={{ marginTop: "10px", fontSize: "11px", color: "var(--ink-4)" }}>
            Showing {filtered.length} of {data.cannibalized} cannibalized keywords. Click any row to see URLs and fix recommendation.
          </p>
        </>
      )}

      {!data && !analyzing && (
        <div className="card" style={{ textAlign: "center", padding: "48px 20px" }}>
          <div style={{ fontSize: "28px", marginBottom: "16px", color: "var(--ink-0)", fontWeight: "500" }}>Cannibalization</div>
          <p style={{ fontSize: "13px", color: "var(--ink-3)", marginBottom: "24px" }}>{gscConnected ? "Click Analyze to scan for keyword cannibalization." : "Connect GSC first, then click Analyze."}</p>
        </div>
      )}
    </div>
  );
}
