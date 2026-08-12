// app/routes/app.robots.jsx
// Kimono SEO #33 — Robots.txt AI Crawlers Audit

import { useEffect, useState } from "react";
import { useNavigate } from "react-router";

const IMPACT_CLASS = { critical: "critical", high: "warn", medium: "info", low: "" };

export default function RobotsAuditPage() {
  const navigate = useNavigate();
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [auditing, setAuditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  useEffect(() => { fetchResult(); }, []);

  async function fetchResult() {
    setLoading(true);
    try {
      const r = await fetch("/api/robots");
      const d = await r.json();
      setResult(d.result || null);
    } catch {}
    setLoading(false);
  }

  async function runAudit() {
    setAuditing(true);
    try {
      const r = await fetch("/api/robots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "audit" }),
      });
      const d = await r.json();
      if (d.success) setResult(d.result);
    } catch {}
    setAuditing(false);
  }

  function copyFix() {
    const blocked = result?.bots?.filter(b => b.blocked) || [];
    const fix = blocked.map(b => `User-agent: ${b.name}\nAllow: /`).join("\n\n");
    navigator.clipboard.writeText(fix);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const blocked   = result?.bots?.filter(b => b.blocked) || [];
  const allowed   = result?.bots?.filter(b => !b.blocked) || [];
  const fetchedAt = result?.fetchedAt ? new Date(result.fetchedAt).toLocaleString("ro-RO") : null;

  return (
    <div className="page active">
      {/* Header */}
      <div className="page-head">
        <div>
          <h1 className="page-title">Robots.txt <em>AI Crawlers</em> Audit</h1>
          <p className="page-sub">Check if GPTBot, ClaudeBot, PerplexityBot and other AI crawlers can access your store</p>
        </div>
        <div className="page-actions">
          <button onClick={runAudit} disabled={auditing} className={`btn ${auditing ? "btn-ghost" : "btn-primary"}`}
            style={{ opacity: auditing ? 0.7 : 1 }}>
            {auditing ? "Auditing..." : result ? "Re-audit" : "Run Audit"}
          </button>
        </div>
      </div>

      {loading && <div style={{ color: "var(--ink-3)", textAlign: "center", padding: "40px" }}>Loading...</div>}

      {!loading && !result && (
        <div className="card" style={{ textAlign: "center", padding: "60px 20px" }}>
          <div style={{ fontSize: "28px", marginBottom: "16px", color: "var(--ink-0)", fontWeight: "500" }}>Robots.txt Audit</div>
          <p style={{ fontSize: "14px", color: "var(--ink-3)", marginBottom: "24px" }}>
            Check if AI crawlers like GPTBot, ClaudeBot and PerplexityBot can access your Shopify store.
          </p>
          <button onClick={runAudit} disabled={auditing} className="btn btn-primary">
            {auditing ? "Auditing..." : "Run Audit Now"}
          </button>
        </div>
      )}

      {result && (
        <>
          {/* Status banner */}
          <div className={`alert-banner ${result.status === "ok" ? "ok" : result.status === "critical" ? "warn" : "info"}`}
            style={{ marginBottom: "20px", display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: "700", fontSize: "14px" }}>
                {result.status === "ok"       && "All AI crawlers are allowed"}
                {result.status === "critical" && `${blocked.filter(b => b.impact === "critical").length} critical AI crawlers are BLOCKED`}
                {result.status === "warning"  && `${blocked.length} AI crawlers are blocked`}
                {result.status === "fetch_error" && `Could not fetch robots.txt: ${result.error}`}
              </div>
              <div style={{ fontSize: "12px", opacity: 0.8, marginTop: "4px" }}>
                {fetchedAt && `Audited: ${fetchedAt}`} &middot; <a href={result.url} target="_blank" rel="noopener noreferrer" style={{ color: "inherit" }}>{result.url}</a>
              </div>
            </div>
            {blocked.length > 0 && (
              <button onClick={copyFix} className="btn btn-primary" style={{ flexShrink: 0 }}>
                {copied ? "Copied!" : "Copy Fix"}
              </button>
            )}
          </div>

          {/* Fix snippet */}
          {blocked.length > 0 && (
            <div className="card" style={{ background: "var(--warn-soft)", borderColor: "var(--warn)", marginBottom: "20px" }}>
              <div className="card-title" style={{ marginBottom: "8px" }}>Fix &mdash; add to your robots.txt</div>
              <p style={{ fontSize: "13px", color: "var(--ink-2)", marginBottom: "12px" }}>
                Add these lines to your <code style={{ background: "var(--surface-2)", padding: "1px 4px", borderRadius: "3px" }}>robots.txt</code> file in Shopify Admin &rarr; Online Store &rarr; Themes &rarr; Edit Code &rarr; <code style={{ background: "var(--surface-2)", padding: "1px 4px", borderRadius: "3px" }}>robots.txt.liquid</code>
              </p>
              <div className="code-wrap">
                <pre>{blocked.map(b => `User-agent: ${b.name}\nAllow: /`).join("\n\n")}</pre>
              </div>
              <div style={{ marginTop: "10px", display: "flex", gap: "8px" }}>
                <button onClick={copyFix} className="btn btn-ghost">{copied ? "Copied!" : "Copy to clipboard"}</button>
                <a
                  href={`https://${result.url.split("/")[2]}/admin/themes/current/editor`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-primary"
                  style={{ textDecoration: "none" }}
                >
                  Open Shopify Theme Editor
                </a>
              </div>
            </div>
          )}

          {/* Recommendations */}
          {result.recommendations?.length > 0 && (
            <div className="card" style={{ marginBottom: "20px" }}>
              <div className="card-head"><div className="card-title">Recommendations</div></div>
              <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: "8px" }}>
                {result.recommendations.map((rec, i) => (
                  <div key={i} className={`alert-banner ${rec.priority === "critical" ? "warn" : rec.priority === "high" ? "warn" : "info"}`}
                    style={{ margin: 0, flexDirection: "column", alignItems: "flex-start" }}>
                    <div style={{ fontSize: "11px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>
                      {rec.priority === "critical" ? "Critical" : rec.priority === "high" ? "High" : "Info"}
                    </div>
                    <div style={{ fontSize: "13px" }}>{rec.text}</div>
                    {rec.fix && rec.fix.length < 200 && (
                      <div className="code-wrap" style={{ marginTop: "8px", width: "100%" }}>
                        <pre style={{ fontSize: "11px" }}>{rec.fix}</pre>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Bots grid — neutral card design */}
          <div className="card" style={{ marginBottom: "20px" }}>
            <div className="card-head">
              <div className="card-title">AI Crawlers Status <span className="count">{result.bots?.length || 0} checked</span></div>
              <div style={{ display: "flex", gap: "12px", fontSize: "12px" }}>
                <span style={{ color: "var(--accent-ink)", fontWeight: "600" }}>{allowed.length} allowed</span>
                {blocked.length > 0 && <span style={{ color: "var(--danger)", fontWeight: "600" }}>{blocked.length} blocked</span>}
              </div>
            </div>

            <div style={{ padding: "12px 16px", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "12px" }}>
              {result.bots?.map(bot => (
                <div key={bot.name} style={{
                  background: "var(--card)",
                  border: "1px solid var(--line)",
                  borderRadius: "var(--r)",
                  padding: "14px 16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px"
                }}>
                  <div style={{ fontWeight: "700", fontSize: "13px", color: "var(--ink-0)" }}>{bot.name}</div>
                  <div style={{ fontSize: "11px", color: "var(--ink-3)", lineHeight: "1.4" }}>{bot.company} &middot; {bot.description}</div>
                  <div style={{ marginTop: "4px" }}>
                    {bot.blocked ? (
                      <span className="q-tag" style={{ background: "var(--danger-soft)", color: "var(--danger)", fontSize: "11px", fontWeight: "600" }}>Blocked &middot; {bot.impact.toUpperCase()}</span>
                    ) : (
                      <span className="q-tag" style={{ background: "var(--ok-soft)", color: "var(--ok)", fontSize: "11px", fontWeight: "600" }}>Allowed</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Raw robots.txt */}
          <div className="card" style={{ marginTop: "20px", marginBottom: "20px" }}>
            <div className="card-head">
              <div className="card-title">Raw robots.txt content</div>
              <button onClick={() => setShowRaw(!showRaw)} className="btn btn-ghost">{showRaw ? "Hide" : "Show"}</button>
            </div>
            {showRaw && (
              <div style={{ padding: "0" }}>
                <div className="code-wrap">
                  <pre>{result.rawContent || "(empty)"}</pre>
                </div>
              </div>
            )}
          </div>

          {/* Info */}
          <div className="card" style={{ background: "var(--surface-2)", fontSize: "12px", color: "var(--ink-2)", lineHeight: "1.7", marginTop: "20px" }}>
            <strong style={{ color: "var(--ink-0)" }}>Why this matters:</strong> AI search engines (ChatGPT, Perplexity, Google AI Overviews) use crawlers to index your store content. If these bots are blocked in robots.txt, your products won't be cited in AI-generated answers.
            <br />
            <strong style={{ color: "var(--ink-0)" }}>Note:</strong> Cloudflare Bot Fight Mode can block AI crawlers at the network level regardless of robots.txt settings.
          </div>
        </>
      )}
    </div>
  );
}
