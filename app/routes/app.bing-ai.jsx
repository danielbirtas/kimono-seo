// app/routes/app.bing-ai.jsx
// Kimono SEO #31 — Bing AI Performance UI

import { useLoaderData, useNavigate } from "react-router";
import { useState } from "react";
import prisma from "../db.server.js";

export const loader = async ({ request }) => {
  const { requireAuth } = await import("../lib/auth/index.server.js");
  const { storeId, connection } = await requireAuth(request);
  if (!storeId) return {};
  const store = await prisma.store.findUnique({ where: { id: storeId } });
  const { getBingAiResults } = await import("../lib/seo/bing-ai-performance.server.js");
  return getBingAiResults(store.id);
};


export default function BingAiPage() {
  const { data: init, apiKey: initKey, siteUrl: initUrl, connected: initConnected } = useLoaderData();
  const navigate   = useNavigate();
  const [data,     setData]     = useState(init);
  const [apiKey,   setApiKey]   = useState(initKey);
  const [siteUrl,  setSiteUrl]  = useState(initUrl);
  const [loading,  setLoading]  = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState(null);
  const [success,  setSuccess]  = useState(null);

  async function saveSettings() {
    setSaving(true);
    setError(null);
    try {
      await fetch("/api/bing-ai", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ intent: "save_settings", apiKey, siteUrl }),
      });
      setSuccess("Settings saved");
      setTimeout(() => setSuccess(null), 2000);
    } catch (e) { setError(e.message); }
    setSaving(false);
  }

  async function fetchData() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/bing-ai", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ intent: "fetch" }),
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
          <h1 className="page-title">Bing AI Performance</h1>
          <p className="page-sub">How your content is cited in Microsoft Copilot and Bing AI answers.</p>
        </div>
        <div className="page-actions">
          <button onClick={fetchData} disabled={loading || !apiKey} className="btn btn-primary">
            {loading ? "Fetching..." : "Fetch Data"}
          </button>
        </div>
      </div>

      {/* API Status banner */}
      <div className="code-preview" style={{ marginBottom: "18px", padding: "20px 24px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: "14px" }}>
          <span style={{ fontSize: "24px", flexShrink: 0 }}>&#x1F535;</span>
          <div>
            <div style={{ fontSize: "14px", fontWeight: 700, color: "#E2E8F0", marginBottom: "6px" }}>
              Bing AI Performance &mdash; Public Preview (Feb 2026)
            </div>
            <div style={{ fontSize: "13px", color: "#94A3B8", lineHeight: 1.6, marginBottom: "10px" }}>
              Microsoft launched AI Performance in Bing Webmaster Tools showing citations in Copilot and Bing AI answers. The <strong style={{ color: "#CBD5E1" }}>dashboard data is not yet available via API</strong> &mdash; Microsoft confirmed this is on their backlog for 2026. Kimono SEO will automatically pull this data when the API becomes available.
            </div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {[
                { label: "Total Citations", status: "coming" },
                { label: "Avg Cited Pages", status: "coming" },
                { label: "Grounding Queries", status: "coming" },
                { label: "Page-level Citations", status: "coming" },
                { label: "Crawl Stats", status: "available" },
                { label: "Traffic Stats", status: "available" },
              ].map(f => (
                <span key={f.label} className={`q-tag ${f.status === "available" ? "ok" : "info"}`} style={{ fontSize: "11px" }}>
                  {f.status === "available" ? "\u2713" : "\u23F3"} {f.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Settings */}
      <div className="card" style={{ padding: "16px 20px", marginBottom: "18px" }}>
        <div style={{ fontSize: "13px", fontWeight: 700, marginBottom: "14px" }}>Bing Webmaster Tools Connection</div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
          <div>
            <div className="editor-label">API Key</div>
            <input
              type="password"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="Paste Bing Webmaster API key"
              className="editor-input"
              style={{ border: "1px solid var(--line)", borderRadius: "var(--r-sm)", padding: "8px 12px" }}
            />
          </div>
          <div>
            <div className="editor-label">Site URL</div>
            <input
              type="text"
              value={siteUrl}
              onChange={e => setSiteUrl(e.target.value)}
              placeholder="https://yourdomain.ro"
              className="editor-input"
              style={{ border: "1px solid var(--line)", borderRadius: "var(--r-sm)", padding: "8px 12px" }}
            />
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: "12px", color: "var(--ink-3)" }}>
            Get API key: <a href="https://www.bing.com/webmasters" target="_blank" rel="noopener noreferrer" style={{ color: "var(--info)" }}>bing.com/webmasters</a> &rarr; Settings &rarr; API Access &rarr; Generate Key
          </div>
          <button onClick={saveSettings} disabled={saving} className="btn btn-ghost">
            {saving ? "Saving..." : success || "Save"}
          </button>
        </div>
      </div>

      {error && <div className="alert-banner warn">{error}</div>}

      {/* Data display */}
      {data && (
        <>
          {/* AI Performance placeholder */}
          <div className="card" style={{ textAlign: "center", padding: "32px", marginBottom: "18px", borderStyle: "dashed" }}>
            <div style={{ fontSize: "32px", marginBottom: "10px" }}>&#x1F916;</div>
            <div style={{ fontSize: "15px", fontWeight: 700, marginBottom: "6px" }}>AI Citations Data</div>
            <p className="page-sub" style={{ maxWidth: "400px", margin: "0 auto 16px" }}>
              Microsoft's AI Performance data will appear here automatically when the API is released. You can view your AI Performance data directly in Bing Webmaster Tools now.
            </p>
            <a href="https://www.bing.com/webmasters" target="_blank" rel="noopener noreferrer" className="btn btn-primary" style={{ textDecoration: "none", display: "inline-flex" }}>
              View in Bing Webmaster Tools
            </a>
          </div>

          {/* Available data now */}
          {(data.traffic || data.crawl || data.siteInfo) && (
            <div className="card" style={{ padding: "16px 20px" }}>
              <div style={{ fontSize: "13px", fontWeight: 700, marginBottom: "14px" }}>
                Available Now &mdash; Site Stats from Bing Webmaster API
              </div>

              {data.siteInfo && (
                <div style={{ marginBottom: "14px" }}>
                  <div className="editor-label">Site Info</div>
                  <div className="metric-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
                    {[
                      { label: "Indexed Pages", value: data.siteInfo.IndexedPages },
                      { label: "Crawl Errors",  value: data.siteInfo.CrawlErrors },
                      { label: "Status",        value: data.siteInfo.IsVerified ? "Verified" : "Unverified" },
                    ].map(s => s.value !== undefined && (
                      <div key={s.label} className="metric">
                        <div className="metric-label">{s.label}</div>
                        <div className="metric-value">{s.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!data.apiConnected && (
                <div style={{ fontSize: "13px", color: "var(--ink-3)" }}>
                  Add your Bing Webmaster API key above to see crawl stats, indexed pages, and traffic data.
                </div>
              )}
            </div>
          )}

          <div style={{ marginTop: "10px", fontSize: "11px", color: "var(--ink-4)" }}>
            Last fetched: {new Date(data.fetchedAt).toLocaleString("ro-RO")}
          </div>
        </>
      )}

      {/* How to set up */}
      <div className="card" style={{ padding: "20px 24px", marginTop: "18px" }}>
        <div style={{ fontSize: "13px", fontWeight: 700, marginBottom: "14px" }}>Setup Guide &mdash; Bing Webmaster Tools</div>
        <ol style={{ paddingLeft: "18px", margin: 0 }}>
          {[
            "Go to bing.com/webmasters and sign in with your Microsoft account",
            "Add and verify your site (XML file, meta tag, or DNS)",
            "Settings \u2192 API Access \u2192 Generate API key",
            "Paste the API key above + your site URL and click Save",
            "Once verified, click AI Performance in the left nav to see citation data (manual for now)",
            "Kimono SEO will pull AI citation data automatically when Microsoft releases the API",
          ].map((step, i) => (
            <li key={i} style={{ fontSize: "13px", color: "var(--ink-1)", padding: "5px 0", lineHeight: 1.5 }}>{step}</li>
          ))}
        </ol>
      </div>
    </div>
  );
}
