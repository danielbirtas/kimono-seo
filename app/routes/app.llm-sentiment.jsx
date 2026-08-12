// app/routes/app.llm-sentiment.jsx
// Kimono SEO #32 — LLM Sentiment Analysis UI

import { useLoaderData, useNavigate } from "react-router";
import { useState } from "react";
import prisma from "../db.server.js";

export const loader = async ({ request }) => {
  const { requireAuth } = await import("../lib/auth/index.server.js");
  const { storeId, connection } = await requireAuth(request);
  if (!storeId) return {};
  const store = await prisma.store.findUnique({ where: { id: storeId } });

  const [savedData, brandSetting, domainSetting] = await Promise.all([
    prisma.seoSetting.findUnique({ where: { storeId_key: { storeId: store.id, key: "llm_sentiment_results" } } }),
    prisma.seoSetting.findUnique({ where: { storeId_key: { storeId: store.id, key: "brand_name" } } }),
    prisma.seoSetting.findUnique({ where: { storeId_key: { storeId: store.id, key: "seo_gsc_site_url" } } }),
  ]);

  let data = null;
  if (savedData?.value) { try { data = JSON.parse(savedData.value); } catch {} }

  const dfsActive = !!(process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD);
  const defaultDomain = domainSetting?.value?.replace(/https?:\/\//, "").replace(/\/$/, "") || connection.shopDomain.replace(".myshopify.com", "") + ".ro";

  return {
    data,
    brandName: brandSetting?.value || connection.shopDomain.replace(".myshopify.com", "").replace(/-/g, " "),
    domain: defaultDomain,
    dfsActive,
  };
};


const PLATFORM_META = {
  chatgpt:    { label: "ChatGPT",    color: "#10A37F" },
  perplexity: { label: "Perplexity", color: "#5c4fff" },
  claude:     { label: "Claude",     color: "#cc785c" },
  gemini:     { label: "Gemini",     color: "#4285F4" },
  copilot:    { label: "Copilot",    color: "#0078D4" },
  unknown:    { label: "Other AI",   color: "#6B7280" },
};

const SENTIMENT_META = {
  positive: { label: "Positive", cls: "ok" },
  neutral:  { label: "Neutral",  cls: "warn" },
  negative: { label: "Negative", cls: "critical" },
  no_data:  { label: "No data",  cls: "info" },
};

export default function LlmSentimentPage() {
  const { data: initialData, brandName: initBrand, domain: initDomain, dfsActive } = useLoaderData();
  const navigate  = useNavigate();
  const [data,     setData]     = useState(initialData);
  const [scanning, setScanning] = useState(false);
  const [error,    setError]    = useState(null);
  const [brand,    setBrand]    = useState(initBrand);
  const [domain,   setDomain]   = useState(initDomain);
  const [filter,   setFilter]   = useState("all");
  const [saving,   setSaving]   = useState(false);

  async function saveBrand() {
    setSaving(true);
    await fetch("/api/llm-sentiment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intent: "save_brand", brandName: brand, domain }),
    });
    setSaving(false);
  }

  async function runScan() {
    setScanning(true);
    setError(null);
    try {
      await saveBrand();
      const r = await fetch("/api/llm-sentiment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "scan" }),
      });
      const d = await r.json();
      if (d.success) setData(d);
      else setError(d.error || "Scan failed");
    } catch (e) {
      setError(e.message);
    }
    setScanning(false);
  }

  const sentiment = data ? SENTIMENT_META[data.overallSentiment] || SENTIMENT_META.no_data : null;
  const filteredMentions = data?.mentions?.filter(m => filter === "all" || m.platform === filter) || [];

  return (
    <div className="page active">
      {/* Header */}
      <div className="page-head">
        <div>
          <h1 className="page-title">LLM Sentiment Analysis</h1>
          <p className="page-sub">How often your brand is mentioned by ChatGPT, Perplexity, Claude, Gemini &mdash; and what they say</p>
        </div>
        <div className="page-actions">
          <button
            className="btn btn-primary"
            onClick={runScan}
            disabled={scanning || !dfsActive}
          >
            {scanning ? "Scanning..." : "Scan Now"}
          </button>
        </div>
      </div>

      {/* DataForSEO not configured */}
      {!dfsActive && (
        <div className="alert-banner warn">
          <b>DataForSEO not configured</b> &mdash; Add DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD in Railway to enable LLM mentions tracking.
        </div>
      )}

      {/* Brand + Domain config */}
      <div className="card" style={{ padding: "16px 20px", marginBottom: "18px" }}>
        <div style={{ display: "flex", gap: "16px", alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: "200px" }}>
            <div className="editor-label">Brand Name</div>
            <input
              value={brand}
              onChange={e => setBrand(e.target.value)}
              placeholder="Ex: Vivimall"
              className="editor-input"
              style={{ border: "1px solid var(--line)", borderRadius: "var(--r-sm)", padding: "8px 12px" }}
            />
          </div>
          <div style={{ flex: 2, minWidth: "280px" }}>
            <div className="editor-label">Domain (without https://)</div>
            <input
              value={domain}
              onChange={e => setDomain(e.target.value)}
              placeholder="Ex: vivimall.ro"
              className="editor-input"
              style={{ border: "1px solid var(--line)", borderRadius: "var(--r-sm)", padding: "8px 12px" }}
            />
          </div>
          <button onClick={saveBrand} disabled={saving} className="btn btn-ghost">
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && <div className="alert-banner warn">{error}</div>}

      {/* Results */}
      {data ? (
        <>
          {/* Overall sentiment + stats */}
          <div className="metric-grid">
            <div className="metric">
              <div className="metric-label">Overall Sentiment</div>
              <div className="metric-value">
                <span className={`q-tag ${sentiment.cls}`}>{sentiment.label}</span>
              </div>
            </div>
            <div className="metric">
              <div className="metric-label">Total Mentions</div>
              <div className="metric-value" style={{ color: "var(--accent)" }}>{data.totalMentions}</div>
            </div>
            <div className="metric">
              <div className="metric-label">Positive</div>
              <div className="metric-value" style={{ color: "var(--accent)" }}>{data.sentimentCounts?.positive || 0}</div>
            </div>
            <div className="metric">
              <div className="metric-label">Negative</div>
              <div className="metric-value" style={{ color: "var(--danger)" }}>{data.sentimentCounts?.negative || 0}</div>
            </div>
          </div>

          {/* By platform */}
          {Object.keys(data.byPlatform).length > 0 && (
            <div className="card" style={{ padding: "16px 20px", marginBottom: "18px" }}>
              <div className="card-head" style={{ border: "none", padding: "0 0 14px" }}>
                <div className="card-title">Mentions by AI Platform</div>
              </div>
              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                {Object.entries(data.byPlatform).map(([platform, count]) => {
                  const meta = PLATFORM_META[platform] || PLATFORM_META.unknown;
                  const pct  = data.totalMentions > 0 ? Math.round((count / data.totalMentions) * 100) : 0;
                  return (
                    <div key={platform} className="engine-stat" style={{ flex: 1, minWidth: "120px" }}>
                      <div className="engine-stat-val" style={{ color: meta.color }}>{count}</div>
                      <div className="engine-stat-lbl">{meta.label}</div>
                      <div className="prog" style={{ marginTop: "8px" }}>
                        <div className="prog-fill ok" style={{ width: `${pct}%`, background: meta.color }} />
                      </div>
                      <div style={{ fontSize: "10px", color: "var(--ink-4)", marginTop: "2px" }}>{pct}%</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Top cited pages */}
          {data.topPages?.length > 0 && (
            <div className="card" style={{ padding: "16px 20px", marginBottom: "18px" }}>
              <div className="card-head" style={{ border: "none", padding: "0 0 14px" }}>
                <div className="card-title">Top Cited Pages</div>
              </div>
              {data.topPages.map((p, i) => (
                <div key={i} className="bar-list-item">
                  <div className="bar-list-name">
                    <span style={{ color: "var(--ink-4)", marginRight: "8px", fontSize: "11px" }}>#{i + 1}</span>
                    {p.url || p.page || ""}
                  </div>
                  <div className="bar-list-val" style={{ color: "var(--accent)" }}>
                    {p.count || p.mentions_count || 0} mentions
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Mentions list */}
          {data.mentions?.length > 0 && (
            <div className="card" style={{ overflow: "hidden" }}>
              <div className="card-head">
                <div className="card-title">Recent Mentions</div>
                <div className="chip-group">
                  <button onClick={() => setFilter("all")} className={`chip ${filter === "all" ? "active" : ""}`}>All</button>
                  {Object.keys(data.byPlatform).map(p => (
                    <button key={p} onClick={() => setFilter(p)} className={`chip ${filter === p ? "active" : ""}`}>
                      {PLATFORM_META[p]?.label || p}
                    </button>
                  ))}
                </div>
              </div>
              {filteredMentions.slice(0, 20).map((m, i) => {
                const meta = PLATFORM_META[m.platform] || PLATFORM_META.unknown;
                const sentMeta = SENTIMENT_META[m.sentiment] || SENTIMENT_META.neutral;
                return (
                  <div key={i} className="data-row" style={{ gridTemplateColumns: "1fr auto" }}>
                    <div className="data-row-main">
                      <div className="data-row-title">
                        <span style={{ fontWeight: 600, color: meta.color, marginRight: "8px" }}>{meta.label}</span>
                        {m.query && <span style={{ fontSize: "11px", color: "var(--ink-4)" }}>&middot; "{m.query}"</span>}
                      </div>
                      {m.context && <div className="data-row-meta" style={{ marginTop: "4px" }}>{m.context}</div>}
                      {m.url && (
                        <a href={m.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: "11px", color: "var(--accent)", display: "block", marginTop: "4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {m.url}
                        </a>
                      )}
                    </div>
                    <span className={`q-tag ${sentMeta.cls}`}>{sentMeta.label}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* No mentions */}
          {data.totalMentions === 0 && (
            <div className="card" style={{ textAlign: "center", padding: "48px 24px" }}>
              <div style={{ fontSize: "32px", marginBottom: "12px" }}>&#x1F50D;</div>
              <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "6px" }}>No mentions found</h3>
              <p className="page-sub">
                Your brand "{data.brandName}" was not found in AI engine responses for domain "{data.domain}".
                This is common for newer or smaller brands &mdash; focus on LLMs.txt and blog content to improve visibility.
              </p>
            </div>
          )}

          <div style={{ marginTop: "12px", fontSize: "11px", color: "var(--ink-4)" }}>
            Last scanned: {data.scannedAt ? new Date(data.scannedAt).toLocaleString("ro-RO") : "never"} &middot; Data source: DataForSEO AI Optimization API
          </div>
        </>
      ) : (
        <div className="card" style={{ textAlign: "center", padding: "48px 24px" }}>
          <div style={{ fontSize: "40px", marginBottom: "12px" }}>&#x1F916;</div>
          <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "8px" }}>No scan yet</h3>
          <p className="page-sub" style={{ marginBottom: "20px" }}>
            Set your brand name and domain above, then run a scan to see how AI engines perceive your brand.
          </p>
          {dfsActive && (
            <button onClick={runScan} className="btn btn-primary">Run First Scan</button>
          )}
        </div>
      )}
    </div>
  );
}
