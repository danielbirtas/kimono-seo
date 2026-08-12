// app/routes/app.content-decay.jsx
// Kimono SEO #19 — Content Decay Detection UI

import { useLoaderData, useNavigate } from "react-router";
import { useState } from "react";
import prisma from "../db.server.js";

export const loader = async ({ request }) => {
  const { requireAuth } = await import("../lib/auth/index.server.js");
  const { storeId, connection } = await requireAuth(request);
  if (!storeId) return {};
  const gscToken = await prisma.seoSetting.findUnique({
    where: { storeId_key: { storeId, key: "seo_gsc_refresh_token" } },
  });
  const saved = await prisma.seoSetting.findUnique({
    where: { storeId_key: { storeId, key: "content_decay_results" } },
  });

  let data = null;
  if (saved?.value) {
    try { data = JSON.parse(saved.value); } catch {}
  }

  return { data, gscConnected: !!gscToken?.value };
};


const SEVERITY_CLS = { high: "critical", medium: "warn", low: "info" };

export default function ContentDecayPage() {
  const { data, gscConnected } = useLoaderData();
  const navigate = useNavigate();
  const [scanning, setScanning]   = useState(false);
  const [results,  setResults]    = useState(data?.results || []);
  const [ranges,   setRanges]     = useState(data?.ranges || null);
  const [checkedAt, setCheckedAt] = useState(data?.checkedAt || null);
  const [error,    setError]      = useState(null);
  const [filter,   setFilter]     = useState("all");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [refresh,  setRefresh]    = useState(null);

  function openRefresh(row) {
    setRefresh({ step: "idle", row, article: null, analysis: null, paaQuestions: [], selectedTypes: [], fixes: null, publishing: false, published: false, error: null });
  }

  async function runAnalysis() {
    setRefresh(r => ({ ...r, step: "analyzing", error: null }));
    try {
      const resp = await fetch("/api/content-refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "analyze", articleUrl: refresh.row.page, decayInfo: refresh.row }),
      });
      const d = await resp.json();
      if (!d.success) throw new Error(d.error);
      setRefresh(r => ({ ...r, step: "review", article: d.article, analysis: d.analysis, paaQuestions: d.paaQuestions, selectedTypes: d.analysis.issues.map(i => i.type) }));
    } catch (e) {
      setRefresh(r => ({ ...r, step: "idle", error: e.message }));
    }
  }

  async function runGenerate() {
    setRefresh(r => ({ ...r, step: "generating", error: null }));
    try {
      const resp = await fetch("/api/content-refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "generate", articleUrl: refresh.row.page, analysis: refresh.analysis, selectedTypes: refresh.selectedTypes, paaQuestions: refresh.paaQuestions }),
      });
      const d = await resp.json();
      if (!d.success) throw new Error(d.error);
      setRefresh(r => ({ ...r, step: "preview", fixes: d.fixes }));
    } catch (e) {
      setRefresh(r => ({ ...r, step: "review", error: e.message }));
    }
  }

  async function runPublish() {
    setRefresh(r => ({ ...r, publishing: true, error: null }));
    try {
      const resp = await fetch("/api/content-refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "publish", articleUrl: refresh.row.page, articleId: refresh.article.id, blogId: refresh.article.blogId, fixes: refresh.fixes }),
      });
      const d = await resp.json();
      if (!d.success) throw new Error(d.error);
      setRefresh(r => ({ ...r, publishing: false, published: true, step: "done" }));
    } catch (e) {
      setRefresh(r => ({ ...r, publishing: false, error: e.message }));
    }
  }

  async function runScan() {
    setScanning(true);
    setError(null);
    try {
      const r = await fetch("/api/content-decay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "scan" }),
      });
      const d = await r.json();
      if (d.success) {
        setResults(d.results);
        setRanges(d.ranges);
        setCheckedAt(new Date().toISOString());
      } else {
        setError(d.error || "Scan failed");
      }
    } catch (e) {
      setError(e.message);
    }
    setScanning(false);
  }

  const filtered = filter === "all" ? results : results.filter(r => r.severity === filter);
  const paginatedFiltered = filtered.slice((page - 1) * perPage, page * perPage);
  const counts = {
    high:   results.filter(r => r.severity === "high").length,
    medium: results.filter(r => r.severity === "medium").length,
    low:    results.filter(r => r.severity === "low").length,
  };

  return (
    <div className="page active">
      {/* Header */}
      <div className="page-head">
        <div>
          <h1 className="page-title">Content Decay Detection</h1>
          <p className="page-sub">Blog articles losing positions in Google — compared last 28 days vs previous 28 days via GSC</p>
        </div>
        <div className="page-actions">
          <button
            onClick={runScan}
            disabled={scanning || !gscConnected}
            className="btn btn-primary"
            style={{ opacity: scanning || !gscConnected ? 0.5 : 1 }}
          >
            {scanning ? "Scanning GSC..." : "Scan Now"}
          </button>
        </div>
      </div>

      {/* GSC not connected */}
      {!gscConnected && (
        <div className="alert-banner warn">
          <b>Google Search Console not connected</b> — Connect GSC in <a href="/app/seo/settings" style={{ color: "var(--accent)" }}>Settings</a> to detect content decay.
        </div>
      )}

      {/* Error */}
      {error && <div className="alert-banner warn">{error}</div>}

      {/* Stats */}
      {results.length > 0 && (
        <div className="metric-grid">
          <div className="metric">
            <div className="metric-label">Total Decaying</div>
            <div className="metric-value">{results.length}</div>
          </div>
          <div className="metric">
            <div className="metric-label">High Severity</div>
            <div className="metric-value" style={{ color: "var(--danger)" }}>{counts.high}</div>
          </div>
          <div className="metric">
            <div className="metric-label">Medium</div>
            <div className="metric-value" style={{ color: "var(--warn)" }}>{counts.medium}</div>
          </div>
          <div className="metric">
            <div className="metric-label">Low</div>
            <div className="metric-value" style={{ color: "var(--accent)" }}>{counts.low}</div>
          </div>
        </div>
      )}

      {/* Date range */}
      {ranges && (
        <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 16 }}>
          Comparing <strong>{ranges.previous.start} &rarr; {ranges.previous.end}</strong> vs <strong>{ranges.current.start} &rarr; {ranges.current.end}</strong>
          {checkedAt && ` · Last scanned ${new Date(checkedAt).toLocaleString("ro-RO")}`}
        </div>
      )}

      {/* Filter chips */}
      {results.length > 0 && (
        <div className="chip-group" style={{ marginBottom: 16 }}>
          {[
            { key: "all",    label: `All (${results.length})` },
            { key: "high",   label: `High (${counts.high})` },
            { key: "medium", label: `Medium (${counts.medium})` },
            { key: "low",    label: `Low (${counts.low})` },
          ].map(f => (
            <button key={f.key} onClick={() => { setFilter(f.key); setPage(1); }} className={`chip ${filter === f.key ? "active" : ""}`}>
              {f.label}
            </button>
          ))}
        </div>
      )}

      {/* Results table */}
      {filtered.length > 0 ? (
        <>
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Article</th>
                <th className="center">Severity</th>
                <th className="center">Position</th>
                <th className="center">Clicks</th>
                <th className="center">Impressions</th>
                <th className="right">Action</th>
              </tr>
            </thead>
            <tbody>
              {paginatedFiltered.map((r) => {
                const slug = r.page.split("/").pop();
                return (
                  <tr key={r.page}>
                    <td style={{ maxWidth: 360 }}>
                      <div className="kw" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {slug.replace(/-/g, " ")}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {r.page}
                      </div>
                    </td>
                    <td className="center">
                      <span className={`q-tag ${SEVERITY_CLS[r.severity] || "info"}`}>{r.severity}</span>
                    </td>
                    <td className="center">
                      <div style={{ fontWeight: 600, color: "var(--danger)" }}>
                        {r.prevPosition} &rarr; {r.currPosition}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--danger)" }}>&darr; {r.positionDelta}%</div>
                    </td>
                    <td className="center">
                      <div style={{ fontWeight: 600, color: r.clicksDelta < 0 ? "var(--danger)" : "var(--accent)" }}>
                        {r.prevClicks} &rarr; {r.currClicks}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{r.clicksDelta >= 0 ? "+" : ""}{r.clicksDelta}</div>
                    </td>
                    <td className="center" style={{ color: "var(--ink-3)" }}>
                      {r.impressions.toLocaleString()}
                    </td>
                    <td className="right">
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                        <a href={r.page} target="_blank" rel="noopener noreferrer" className="btn btn-ghost" style={{ fontSize: 11, padding: "4px 10px", textDecoration: "none" }}>
                          View
                        </a>
                        <button onClick={() => openRefresh(r)} className="btn btn-primary" style={{ fontSize: 11, padding: "4px 10px" }}>
                          Refresh
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
        </>
      ) : (
        <div className="card" style={{ textAlign: "center", padding: "48px 24px" }}>
          {scanning ? (
            <div style={{ color: "var(--ink-3)", fontSize: 14 }}>Fetching GSC data for last 56 days...</div>
          ) : results.length === 0 && checkedAt ? (
            <div>
              <div style={{ fontSize: 18, fontWeight: 600, color: "var(--ink-0)", marginBottom: 6 }}>No decay detected</div>
              <div style={{ fontSize: 13, color: "var(--ink-3)" }}>All blog articles maintained or improved their positions.</div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 18, fontWeight: 600, color: "var(--ink-0)", marginBottom: 6 }}>No scan yet</div>
              <div style={{ fontSize: 13, color: "var(--ink-3)", marginBottom: 16 }}>Run a scan to detect articles losing positions in Google.</div>
              {gscConnected && (
                <button onClick={runScan} className="btn btn-primary">Run First Scan</button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Refresh Modal */}
      {refresh && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "var(--surface)", borderRadius: "var(--r-lg)", width: "100%", maxWidth: 640, maxHeight: "90vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>

            {/* Modal header */}
            <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600, color: "var(--ink-0)" }}>Refresh Article</div>
                <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>{refresh.row?.page?.split("/").pop()?.replace(/-/g, " ")}</div>
              </div>
              <button onClick={() => setRefresh(null)} className="btn btn-ghost" style={{ fontSize: 12 }}>Close</button>
            </div>

            <div style={{ padding: 24 }}>
              {/* Error */}
              {refresh.error && <div className="alert-banner warn">{refresh.error}</div>}

              {/* STEP: idle */}
              {refresh.step === "idle" && (
                <div style={{ textAlign: "center", padding: "20px 0" }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink-0)", marginBottom: 8 }}>Analyze article for decay causes</div>
                  <div style={{ fontSize: 13, color: "var(--ink-3)", marginBottom: 20 }}>
                    Claude will fetch the article from Shopify and identify what's causing the ranking decline.
                  </div>
                  <button onClick={runAnalysis} className="btn btn-primary">Analyze Article</button>
                </div>
              )}

              {/* STEP: analyzing */}
              {refresh.step === "analyzing" && (
                <div style={{ textAlign: "center", padding: "30px 0", color: "var(--ink-3)" }}>Fetching article from Shopify and analyzing with Claude...</div>
              )}

              {/* STEP: review */}
              {refresh.step === "review" && refresh.analysis && (
                <div>
                  <div style={{ fontSize: 13, color: "var(--ink-2)", background: "var(--surface-2)", borderRadius: "var(--r-sm)", padding: "12px 16px", marginBottom: 16 }}>
                    {refresh.analysis.summary}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-0)", marginBottom: 10 }}>
                    Issues found — select what to fix:
                  </div>
                  {refresh.analysis.issues.map((issue, i) => {
                    const sel = refresh.selectedTypes.includes(issue.type);
                    return (
                      <div key={i} onClick={() => setRefresh(r => ({ ...r, selectedTypes: sel ? r.selectedTypes.filter(t => t !== issue.type) : [...r.selectedTypes, issue.type] }))}
                        style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: 12, borderRadius: "var(--r-sm)", border: `1px solid ${sel ? "var(--accent)" : "var(--line)"}`, background: sel ? "var(--accent-soft)" : "var(--surface)", cursor: "pointer", marginBottom: 8 }}>
                        <span style={{ fontSize: 16, marginTop: 1 }}>{sel ? "[x]" : "[ ]"}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-0)" }}>
                            <span className={`q-tag ${issue.severity === "high" ? "critical" : issue.severity === "medium" ? "warn" : "info"}`} style={{ marginRight: 6 }}>{issue.severity}</span>
                            {issue.type.replace(/_/g, " ")}
                          </div>
                          <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>{issue.description}</div>
                          <div style={{ fontSize: 11, color: "var(--accent)", marginTop: 2 }}>Fix: {issue.fix}</div>
                        </div>
                      </div>
                    );
                  })}
                  {refresh.paaQuestions.length > 0 && (
                    <div className="alert-banner ok" style={{ marginTop: 12 }}>
                      {refresh.paaQuestions.length} PAA questions found for FAQ section
                    </div>
                  )}
                  <button
                    onClick={runGenerate}
                    disabled={refresh.selectedTypes.length === 0}
                    className="btn btn-primary"
                    style={{ width: "100%", marginTop: 16, opacity: refresh.selectedTypes.length === 0 ? 0.5 : 1 }}
                  >
                    Generate Fixes ({refresh.selectedTypes.length} selected)
                  </button>
                </div>
              )}

              {/* STEP: generating */}
              {refresh.step === "generating" && (
                <div style={{ textAlign: "center", padding: "30px 0", color: "var(--ink-3)" }}>Claude is generating the fixes... this may take 20-40 seconds.</div>
              )}

              {/* STEP: preview */}
              {refresh.step === "preview" && refresh.fixes && (
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-0)", marginBottom: 14 }}>Preview changes</div>
                  {Object.entries(refresh.fixes).map(([key, value]) => (
                    <div key={key} style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>
                        {key.replace(/_/g, " ")}
                      </div>
                      {key === "faq_section" ? (
                        <div style={{ background: "var(--surface-2)", borderRadius: "var(--r-sm)", padding: 12, fontSize: 12 }}>
                          {Array.isArray(value) && value.map((faq, i) => (
                            <div key={i} style={{ marginBottom: 10 }}>
                              <strong>Q: {faq.question}</strong>
                              <div style={{ color: "var(--ink-2)", marginTop: 3 }}>{faq.answer}</div>
                            </div>
                          ))}
                        </div>
                      ) : key === "content_body" ? (
                        <div className="code-preview" style={{ maxHeight: 200, overflow: "auto", fontSize: 12 }}>
                          <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{String(value).slice(0, 600)}...</pre>
                        </div>
                      ) : (
                        <div style={{ background: "var(--surface-2)", borderRadius: "var(--r-sm)", padding: 12, fontSize: 13, color: "var(--ink-0)" }}>
                          {String(value)}
                          <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 4 }}>{String(value).length} chars</div>
                        </div>
                      )}
                    </div>
                  ))}
                  <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                    <button onClick={() => setRefresh(r => ({ ...r, step: "review" }))} className="btn btn-ghost" style={{ flex: 1 }}>Back</button>
                    <button onClick={runPublish} disabled={refresh.publishing} className="btn btn-primary" style={{ flex: 2, opacity: refresh.publishing ? 0.5 : 1 }}>
                      {refresh.publishing ? "Publishing..." : "Publish to Shopify"}
                    </button>
                  </div>
                </div>
              )}

              {/* STEP: done */}
              {refresh.step === "done" && (
                <div style={{ textAlign: "center", padding: "20px 0" }}>
                  <div style={{ fontSize: 16, fontWeight: 600, color: "var(--ink-0)", marginBottom: 8 }}>Article refreshed successfully!</div>
                  <div style={{ fontSize: 13, color: "var(--ink-3)", marginBottom: 20 }}>
                    Changes have been published to Shopify. Google will re-crawl the article in the next few days.
                  </div>
                  <button onClick={() => setRefresh(null)} className="btn btn-primary">Close</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Footer note */}
      <div style={{ marginTop: 20, fontSize: 11, color: "var(--ink-4)", lineHeight: 1.6 }}>
        <strong>How it works:</strong> Compares average position and clicks for each blog article between two consecutive 28-day windows.
        Articles with position decline &gt;20% are flagged. Minimum 50 impressions required to filter out low-traffic noise.
      </div>
    </div>
  );
}
