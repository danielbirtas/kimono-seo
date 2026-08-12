// app/routes/app.crawl-budget.jsx
// Kimono SEO #22 — Crawl Budget Optimizer UI

import { useLoaderData, useNavigate } from "react-router";
import { useState } from "react";
import prisma from "../db.server.js";

export const loader = async ({ request }) => {
  const { requireAuth } = await import("../lib/auth/index.server.js");
  const { storeId, connection } = await requireAuth(request);
  if (!storeId) return {};
  const store = await prisma.store.findUnique({ where: { id: storeId } });

  const [saved, gscToken] = await Promise.all([
    prisma.seoSetting.findUnique({ where: { storeId_key: { storeId: store.id, key: "crawl_budget_results" } } }),
    prisma.seoSetting.findUnique({ where: { storeId_key: { storeId: store.id, key: "seo_gsc_refresh_token" } } }),
  ]);

  let data = null;
  if (saved?.value) { try { data = JSON.parse(saved.value); } catch {} }

  return { data, gscConnected: !!gscToken?.value };
};

const SEV_CLASS = { high: "critical", medium: "warn", low: "ok" };
const SEV_LABEL = { high: "High", medium: "Medium", low: "Low" };

const CAT_LABELS = {
  filter_url:            "Filter/Sort URL",
  variant_url:           "Variant URL",
  deep_pagination:       "Deep Pagination",
  search_results:        "Search Results",
  preview_page:          "Preview Page",
  zero_traffic_article:  "Zero Traffic Article",
  zero_traffic_product:  "Zero Traffic Product",
  poor_performer:        "Poor Performer",
};

const ACTION_LABELS = {
  noindex:            { label: "Add noindex",           cls: "critical" },
  canonical:          { label: "Add canonical",         cls: "warn" },
  improve_or_noindex: { label: "Improve or noindex",    cls: "warn" },
  review:             { label: "Review manually",       cls: "" },
};

export default function CrawlBudgetPage() {
  const { data: init, gscConnected } = useLoaderData();
  const navigate    = useNavigate();
  const [data,      setData]       = useState(init);
  const [auditing,  setAuditing]   = useState(false);
  const [applying,  setApplying]   = useState(false);
  const [error,     setError]      = useState(null);
  const [success,   setSuccess]    = useState(null);
  const [activeFilter, setActiveFilter] = useState("all");
  const [expanded,  setExpanded]   = useState(null);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [robotsEnabled, setRobotsEnabled] = useState(false);

  async function audit() {
    setAuditing(true);
    setError(null);
    setSuccess(null);
    try {
      const r = await fetch("/api/crawl-budget", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ intent: "audit" }),
      });
      const d = await r.json();
      if (d.success) setData(d);
      else setError(d.error);
    } catch (e) { setError(e.message); }
    setAuditing(false);
  }

  async function applyRobots() {
    if (!data?.robotsRules?.length) return;
    setApplying(true);
    setError(null);
    try {
      const r = await fetch("/api/crawl-budget", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ intent: "apply_robots", rules: data.robotsRules }),
      });
      const d = await r.json();
      if (d.success) setSuccess(`Applied ${d.rulesApplied} rules to robots.txt`);
      else setError(d.error);
    } catch (e) { setError(e.message); }
    setApplying(false);
  }

  const filtered = (data?.issues || []).filter(i =>
    activeFilter === "all" ? true :
    activeFilter === "auto" ? i.canAutoFix :
    i.severity === activeFilter
  );

  const highCount   = data?.summary?.bySeverity?.high   || 0;
  const medCount    = data?.summary?.bySeverity?.medium  || 0;
  const lowCount    = data?.summary?.bySeverity?.low     || 0;
  const autoCount   = data?.summary?.autoFixable || 0;

  return (
    <div className="page active">
      {/* Header */}
      <div className="page-head">
        <div>
          <h1 className="page-title">Crawl Budget <em>Optimizer</em></h1>
          <p className="page-sub">Identifies pages wasting Googlebot crawl budget &mdash; filter URLs, duplicate variants, zero-traffic pages.</p>
        </div>
        <div className="page-actions">
          <button onClick={audit} disabled={auditing}
            className={`btn ${auditing ? "btn-ghost" : "btn-primary"}`}
            style={{ opacity: auditing ? 0.7 : 1 }}>
            {auditing ? "Analyzing..." : "Run Audit"}
          </button>
        </div>
      </div>

      {!gscConnected && (
        <div className="alert-banner warn">
          GSC not connected &mdash; audit will work but without real crawl data. <button onClick={() => navigate("/app/settings")} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontWeight: "600", padding: 0, textDecoration: "underline" }}>Connect GSC</button>
        </div>
      )}

      {error && <div className="alert-banner warn">{error}</div>}
      {success && <div className="alert-banner ok">{success}</div>}

      {data && (
        <>
          {/* Stats */}
          <div className="metric-grid" style={{ gridTemplateColumns: "repeat(5, 1fr)" }}>
            {[
              { label: "Pages Analyzed", value: data.summary?.totalAnalyzed },
              { label: "Total Issues",   value: data.summary?.totalIssues },
              { label: "High",           value: highCount },
              { label: "Medium",         value: medCount },
              { label: "Auto-fixable",   value: autoCount },
            ].map(s => (
              <div key={s.label} className="metric">
                <div className="metric-label">{s.label}</div>
                <div className="metric-value">{s.value}</div>
              </div>
            ))}
          </div>

          <p style={{ fontSize: "12px", color: "var(--ink-3)", marginBottom: "16px" }}>
            {data.siteUrl || data.shopDomain} &middot; {new Date(data.analyzedAt).toLocaleString("ro-RO")}
            {!data.hasGsc && <span style={{ color: "var(--warn)", marginLeft: "8px" }}>Without GSC data &mdash; connect GSC for full analysis</span>}
          </p>

          {/* AI Recommendations */}
          {data.aiRecommendations && (
            <div className="card" style={{ background: "#0a0a0a", color: "#e7e5e4" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
                <span>&#x2726;</span>
                <span style={{ fontSize: "14px", fontWeight: "700" }}>AI Analysis</span>
                <span style={{ background: "var(--purple-soft)", color: "var(--purple)", borderRadius: "4px", padding: "1px 7px", fontSize: "10px", fontWeight: "700" }}>Claude</span>
              </div>
              {data.aiRecommendations.estimatedImpact && (
                <div style={{ fontSize: "13px", color: "#CBD5E1", marginBottom: "12px", lineHeight: "1.5" }}>{data.aiRecommendations.estimatedImpact}</div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                {data.aiRecommendations.priorityActions?.length > 0 && (
                  <div>
                    <div style={{ fontSize: "10px", fontWeight: "700", color: "#64748B", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px" }}>Priority Actions</div>
                    {data.aiRecommendations.priorityActions.map((a, i) => (
                      <div key={i} style={{ display: "flex", gap: "6px", padding: "4px 0", fontSize: "12px", color: "#CBD5E1" }}>
                        <span style={{ color: "#34D399", fontWeight: "700", flexShrink: 0 }}>{i + 1}.</span>{a}
                      </div>
                    ))}
                  </div>
                )}
                {data.aiRecommendations.robotsTxtRules?.length > 0 && (
                  <div>
                    <div style={{ fontSize: "10px", fontWeight: "700", color: "#64748B", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px" }}>Suggested robots.txt Rules</div>
                    {data.aiRecommendations.robotsTxtRules.map((r, i) => (
                      <div key={i} style={{ fontFamily: "var(--mono)", fontSize: "11px", color: "#94A3B8", padding: "2px 0" }}>{r}</div>
                    ))}
                  </div>
                )}
              </div>
              {data.aiRecommendations.shopifyNote && (
                <div style={{ marginTop: "12px", background: "rgba(99,102,241,.08)", border: "1px solid rgba(99,102,241,.2)", borderRadius: "6px", padding: "8px 12px", fontSize: "12px", color: "#2DD4BF" }}>
                  {data.aiRecommendations.shopifyNote}
                </div>
              )}
            </div>
          )}

          {/* Robots.txt Apply */}
          {data.robotsRules?.length > 0 && (
            <div className="card">
              <div className="card-head">
                <div className="card-title">Recommended robots.txt Rules</div>
                <button onClick={applyRobots} disabled={applying || !robotsEnabled}
                  className={`btn ${applying || !robotsEnabled ? "btn-ghost" : "btn-primary"}`}
                  style={{ opacity: applying || !robotsEnabled ? 0.5 : 1 }}>
                  {applying ? "Applying..." : "Apply to Theme"}
                </button>
              </div>
              <div style={{ padding: "14px 16px" }}>
                <div className="code-wrap">
                  <pre>{data.robotsRules.join("\n")}</pre>
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: "var(--ink-2)", cursor: "pointer", marginTop: "10px" }}>
                  <input type="checkbox" checked={robotsEnabled} onChange={e => setRobotsEnabled(e.target.checked)} />
                  I reviewed these rules and want to apply them to robots.txt.liquid
                </label>
              </div>
            </div>
          )}

          {/* Filter */}
          <div className="chip-group" style={{ marginBottom: "14px" }}>
            {[
              ["all",    `All (${data.summary?.totalIssues})`],
              ["high",   `High (${highCount})`],
              ["medium", `Medium (${medCount})`],
              ["low",    `Low (${lowCount})`],
              ["auto",   `Auto-fixable (${autoCount})`],
            ].map(([k, l]) => (
              <button key={k} onClick={() => { setActiveFilter(k); setPage(1); }} className={`chip${activeFilter === k ? " active" : ""}`}>{l}</button>
            ))}
          </div>

          {/* Issues list */}
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Severity</th>
                    <th>Category</th>
                    <th>URL</th>
                    <th className="right">Impr.</th>
                    <th>Action</th>
                    <th style={{ width: "30px" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan="6" style={{ padding: "40px", textAlign: "center", color: "var(--ink-3)", fontSize: "13px" }}>No issues for this filter.</td></tr>
                  ) : filtered.slice((page - 1) * perPage, page * perPage).map((issue, i) => {
                    const action = ACTION_LABELS[issue.action] || { label: issue.action, cls: "" };
                    const absIdx = (page - 1) * perPage + i;
                    const open   = expanded === absIdx;
                    return (
                      <tr key={i} onClick={() => setExpanded(open ? null : absIdx)} style={{ cursor: "pointer" }}>
                        <td><span className={`q-tag ${SEV_CLASS[issue.severity] || ""}`}>{SEV_LABEL[issue.severity] || issue.severity}</span></td>
                        <td><span className="q-tag">{CAT_LABELS[issue.category] || issue.category}</span></td>
                        <td className="mono" style={{ fontSize: "12px", maxWidth: "300px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {issue.url.replace(/https?:\/\/[^/]+/, "")}
                        </td>
                        <td className="right mono">{issue.gsc?.impressions > 0 ? issue.gsc.impressions.toLocaleString() : "\u2014"}</td>
                        <td>
                          <span className={`q-tag ${action.cls}`}>{action.label}</span>
                          {issue.canAutoFix && <span className="q-tag ok" style={{ marginLeft: "4px" }}>AUTO</span>}
                        </td>
                        <td className="right" style={{ color: "var(--ink-4)", fontSize: "11px" }}>{open ? "\u25B2" : "\u25BC"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Expanded detail */}
            {expanded !== null && (() => {
              const issue = filtered[expanded]; if (!issue) return null;
              const action = ACTION_LABELS[issue.action] || { label: issue.action, cls: "" };
              return (
                <div style={{ background: "var(--surface-2)", padding: "12px 14px", borderTop: "1px solid var(--line)" }}>
                  <div style={{ fontSize: "12px", color: "var(--ink-2)", marginBottom: "6px" }}>
                    <strong style={{ color: "var(--ink-0)" }}>URL:</strong> <a href={issue.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>{issue.url}</a>
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--ink-2)", marginBottom: "6px" }}>
                    <strong style={{ color: "var(--ink-0)" }}>Issue:</strong> {issue.reason}
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--ink-2)", marginBottom: "6px" }}>
                    <strong style={{ color: "var(--ink-0)" }}>Fix:</strong> {action.label}
                    {issue.canAutoFix && <span style={{ color: "var(--accent-ink)", marginLeft: "6px" }}>&mdash; included in robots.txt rules above</span>}
                  </div>
                  {issue.gsc?.impressions > 0 && (
                    <div style={{ fontSize: "11px", color: "var(--ink-3)" }}>
                      GSC: {issue.gsc.impressions} impressions &middot; {issue.gsc.clicks} clicks &middot; avg position #{issue.gsc.position}
                    </div>
                  )}
                </div>
              );
            })()}
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
      )}

      {!data && !auditing && (
        <div className="card" style={{ textAlign: "center", padding: "48px 20px" }}>
          <div style={{ fontSize: "28px", marginBottom: "16px", color: "var(--ink-0)", fontWeight: "500" }}>Crawl Budget</div>
          <p style={{ fontSize: "13px", color: "var(--ink-3)" }}>Click Run Audit to identify pages wasting your crawl budget.</p>
        </div>
      )}
    </div>
  );
}
