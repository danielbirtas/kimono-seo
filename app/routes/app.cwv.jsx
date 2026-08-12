// app/routes/app.cwv.jsx
// Kimono SEO #25 — Core Web Vitals Monitor UI

import { useLoaderData, useNavigate } from "react-router";
import { useState } from "react";
import prisma from "../db.server.js";

export const loader = async ({ request }) => {
  const { requireAuth } = await import("../lib/auth/index.server.js");
  const { storeId, connection } = await requireAuth(request);
  if (!storeId) return {};
  const store = await prisma.store.findUnique({ where: { id: storeId } });
  const saved = await prisma.seoSetting.findUnique({
    where: { storeId_key: { storeId: store.id, key: "cwv_results" } },
  });
  let data = null;
  if (saved?.value) { try { data = JSON.parse(saved.value); } catch {} }
  return { data };
};

const STATUS_CLASS = {
  good:              "ok",
  needs_improvement: "warn",
  poor:              "critical",
  "n/a":             "",
};
const STATUS_LABEL = {
  good:              "Good",
  needs_improvement: "Needs work",
  poor:              "Poor",
  "n/a":             "N/A",
};

function ScoreRing({ score }) {
  const r = 18, c = 2 * Math.PI * r;
  const pct = Math.min(score, 100);
  const cls = score >= 90 ? "ok" : score >= 50 ? "warn" : "danger";
  const color = cls === "ok" ? "var(--accent)" : cls === "warn" ? "var(--warn)" : "var(--danger)";
  return (
    <div className="score-ring" style={{ width: "56px", height: "56px" }}>
      <svg viewBox="0 0 42 42">
        <circle className="score-ring-bg" cx="21" cy="21" r={r} strokeWidth="3" />
        <circle className="score-ring-fg" cx="21" cy="21" r={r} strokeWidth="3"
          stroke={color}
          strokeDasharray={c}
          strokeDashoffset={c - (c * pct / 100)} />
      </svg>
      <span className="score-ring-num" style={{ fontSize: "14px" }}>{score}</span>
    </div>
  );
}

function MetricPill({ metric }) {
  const cls = STATUS_CLASS[metric.status] || "";
  const label = STATUS_LABEL[metric.status] || "N/A";
  const val = metric.value !== null ? `${metric.value}${metric.unit}` : "\u2014";
  return (
    <div className="metric" style={{ minWidth: "90px", padding: "10px 14px", textAlign: "center" }}>
      <div className="metric-label" style={{ justifyContent: "center" }}>{metric.label}</div>
      <div className="metric-value" style={{ justifyContent: "center" }}>{val}</div>
      <div style={{ fontSize: "10px", color: cls === "ok" ? "var(--accent-ink)" : cls === "warn" ? "var(--warn)" : cls === "critical" ? "var(--danger)" : "var(--ink-3)", marginTop: "4px" }}>{label}</div>
    </div>
  );
}

export default function CwvPage() {
  const { data: init } = useLoaderData();
  const navigate  = useNavigate();
  const [data,    setData]    = useState(init);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const [tab,     setTab]     = useState("mobile");

  async function audit() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/cwv", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ intent: "audit" }),
      });
      const d = await r.json();
      if (d.success) setData(d);
      else setError(d.error);
    } catch (e) { setError(e.message); }
    setLoading(false);
  }

  return (
    <div className="page active">
      {/* Header */}
      <div className="page-head">
        <div>
          <h1 className="page-title">Core Web Vitals</h1>
          <p className="page-sub">PageSpeed Insights audit &mdash; LCP, CLS, FCP, TTFB per page. Google ranking signal.</p>
        </div>
        <div className="page-actions">
          <button onClick={audit} disabled={loading}
            className={`btn ${loading ? "btn-ghost" : "btn-primary"}`}
            style={{ opacity: loading ? 0.7 : 1 }}>
            {loading ? "Auditing..." : "Run Audit"}
          </button>
        </div>
      </div>

      {loading && (
        <div className="alert-banner info">
          Running PageSpeed Insights &mdash; auditing mobile + desktop for each page. Takes ~30 seconds...
        </div>
      )}

      {error && <div className="alert-banner warn">{error}</div>}

      {data && (
        <>
          {/* Summary */}
          <div className="metric-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
            {[
              { label: "Pages Audited",     value: data.summary?.pagesAudited },
              { label: "Avg Mobile Score",  value: data.summary?.avgMobileScore },
              { label: "Avg Desktop Score", value: data.summary?.avgDesktopScore },
            ].map(s => (
              <div key={s.label} className="metric">
                <div className="metric-label">{s.label}</div>
                <div className="metric-value">{s.value}</div>
              </div>
            ))}
          </div>

          <p style={{ fontSize: "12px", color: "var(--ink-3)", marginBottom: "16px" }}>
            {data.siteUrl} &middot; Audited {new Date(data.auditedAt).toLocaleString("ro-RO")}
          </p>

          {/* Mobile / Desktop tab */}
          <div className="chip-group" style={{ marginBottom: "16px" }}>
            {[["mobile", "Mobile"], ["desktop", "Desktop"]].map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} className={`chip${tab === k ? " active" : ""}`}>{l}</button>
            ))}
          </div>

          {/* Pages */}
          {data.pages?.map((page, i) => {
            const metrics = page[tab];
            if (!metrics) return (
              <div key={i} className="card" style={{ padding: "16px 20px", marginBottom: "12px" }}>
                <div style={{ fontSize: "13px", color: "var(--ink-3)" }}>{page.url} &mdash; {page.error || "No data"}</div>
              </div>
            );
            return (
              <div key={i} className="card" style={{ padding: "20px", marginBottom: "12px" }}>
                {/* Page header */}
                <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "16px" }}>
                  <ScoreRing score={metrics.score} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "13px", fontWeight: "600", color: "var(--ink-0)" }}>
                      {page.url.replace(/https?:\/\/[^/]+/, "") || "/"}
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--ink-3)", marginTop: "2px" }}>
                      <a href={page.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--ink-3)" }}>{page.url}</a>
                    </div>
                  </div>
                  <div style={{ fontSize: "12px", fontWeight: "700", color: metrics.score >= 90 ? "var(--accent-ink)" : metrics.score >= 50 ? "var(--warn)" : "var(--danger)" }}>
                    {metrics.score >= 90 ? "Good" : metrics.score >= 50 ? "Needs work" : "Poor"}
                  </div>
                </div>

                {/* Metrics row */}
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: metrics.opportunities?.length ? "16px" : "0" }}>
                  {[metrics.lcp, metrics.cls, metrics.fcp, metrics.ttfb, metrics.tbt].map(m => m && (
                    <MetricPill key={m.label} metric={m} />
                  ))}
                </div>

                {/* Opportunities */}
                {metrics.opportunities?.length > 0 && (
                  <div style={{ borderTop: "1px solid var(--line)", paddingTop: "12px" }}>
                    <div style={{ fontSize: "11px", fontWeight: "700", color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" }}>Top Opportunities</div>
                    {metrics.opportunities.map((op, oi) => (
                      <div key={oi} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: oi < metrics.opportunities.length - 1 ? "1px solid var(--line)" : "none" }}>
                        <span style={{ fontSize: "12px", color: "var(--ink-1)" }}>{op.title}</span>
                        <span style={{ fontSize: "11px", fontWeight: "700", color: "var(--warn)", whiteSpace: "nowrap", marginLeft: "12px" }}>&minus;{op.savings}ms</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}

      {/* AI Recommendations */}
      {data?.aiRecommendations && (
        <div className="card" style={{ background: "#0a0a0a", color: "#e7e5e4", marginTop: "20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
            <span style={{ fontSize: "20px" }}>&#x2726;</span>
            <div style={{ fontSize: "15px", fontWeight: "700" }}>AI Performance Recommendations</div>
            <span style={{ background: "var(--purple-soft)", color: "var(--purple)", borderRadius: "4px", padding: "2px 8px", fontSize: "10px", fontWeight: "700" }}>Claude</span>
          </div>

          <div style={{ background: "rgba(255,255,255,.05)", borderRadius: "8px", padding: "14px 16px", marginBottom: "16px", fontSize: "13px", lineHeight: "1.6" }}>
            {data.aiRecommendations.overallAssessment}
          </div>

          {data.aiRecommendations.priorityIssues?.length > 0 && (
            <div style={{ marginBottom: "16px" }}>
              <div style={{ fontSize: "11px", fontWeight: "700", color: "#64748B", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "10px" }}>Priority Issues</div>
              {data.aiRecommendations.priorityIssues.map((issue, i) => {
                const sevColor = issue.severity === "critical" ? "#F87171" : issue.severity === "high" ? "#FB923C" : "#FBBF24";
                return (
                  <div key={i} style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", borderRadius: "8px", padding: "14px 16px", marginBottom: "8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                      <span style={{ background: `${sevColor}20`, color: sevColor, borderRadius: "4px", padding: "1px 7px", fontSize: "10px", fontWeight: "700" }}>{issue.severity?.toUpperCase()}</span>
                      <span style={{ background: "rgba(99,102,241,.15)", color: "#2DD4BF", borderRadius: "4px", padding: "1px 7px", fontSize: "10px", fontWeight: "700" }}>{issue.metric}</span>
                      <span style={{ fontSize: "13px", fontWeight: "600" }}>{issue.title}</span>
                    </div>
                    <div style={{ fontSize: "12px", color: "#94A3B8", marginBottom: "8px", lineHeight: "1.5" }}>{issue.explanation}</div>
                    <div style={{ background: "rgba(16,185,129,.08)", border: "1px solid rgba(16,185,129,.2)", borderRadius: "6px", padding: "8px 12px", fontSize: "12px", color: "#6EE7B7", lineHeight: "1.5" }}>
                      <strong style={{ color: "#34D399" }}>Fix: </strong>{issue.shopifyFix}
                    </div>
                    {issue.estimatedImpact && (
                      <div style={{ fontSize: "11px", color: "#64748B", marginTop: "6px" }}>Expected: {issue.estimatedImpact}</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {data.aiRecommendations.quickWins?.length > 0 && (
            <div style={{ marginBottom: "16px" }}>
              <div style={{ fontSize: "11px", fontWeight: "700", color: "#64748B", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "10px" }}>Quick Wins (&lt;1 hour)</div>
              {data.aiRecommendations.quickWins.map((win, i) => (
                <div key={i} style={{ display: "flex", gap: "8px", alignItems: "flex-start", padding: "6px 0", borderBottom: i < data.aiRecommendations.quickWins.length - 1 ? "1px solid rgba(255,255,255,.05)" : "none" }}>
                  <span style={{ color: "#34D399", fontWeight: "700", flexShrink: 0 }}>{i + 1}.</span>
                  <span style={{ fontSize: "13px" }}>{win}</span>
                </div>
              ))}
            </div>
          )}

          {data.aiRecommendations.shopifySpecificTips?.length > 0 && (
            <div>
              <div style={{ fontSize: "11px", fontWeight: "700", color: "#64748B", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "10px" }}>Shopify-Specific Tips</div>
              {data.aiRecommendations.shopifySpecificTips.map((tip, i) => (
                <div key={i} style={{ display: "flex", gap: "8px", alignItems: "flex-start", padding: "6px 0", borderBottom: i < data.aiRecommendations.shopifySpecificTips.length - 1 ? "1px solid rgba(255,255,255,.05)" : "none" }}>
                  <span style={{ color: "#2DD4BF", flexShrink: 0 }}>&rarr;</span>
                  <span style={{ fontSize: "13px" }}>{tip}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {data && !data.aiRecommendations && (
        <div className="card" style={{ textAlign: "center", padding: "20px", marginTop: "16px", borderStyle: "dashed" }}>
          <div style={{ fontSize: "13px", color: "var(--ink-3)" }}>AI recommendations will appear here after the next audit.</div>
        </div>
      )}

      {!data && !loading && (
        <div className="card" style={{ textAlign: "center", padding: "48px 20px" }}>
          <div style={{ fontSize: "28px", marginBottom: "16px", color: "var(--ink-0)", fontWeight: "500" }}>Core Web Vitals</div>
          <p style={{ fontSize: "13px", color: "var(--ink-3)", marginBottom: "16px" }}>Click <strong>Run Audit</strong> to check your site's Core Web Vitals via Google PageSpeed Insights.</p>
          <p style={{ fontSize: "12px", color: "var(--ink-4)", lineHeight: "1.6", maxWidth: "480px", margin: "0 auto" }}>
            The audit uses the free PageSpeed Insights API. For higher rate limits, add <code style={{ background: "var(--surface-2)", padding: "1px 5px", borderRadius: "3px" }}>PAGESPEED_API_KEY</code> in Railway environment variables (free from <a href="https://console.cloud.google.com/apis/library/pagespeedonline.googleapis.com" target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>Google Cloud Console</a> &mdash; 25,000 queries/day).
          </p>
        </div>
      )}
    </div>
  );
}
