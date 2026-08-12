// app/routes/app.llmstxt.jsx
// Kimono SEO #16 — LLMs.txt Editor v2

import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router";

const TYPE_ICONS = { header: "\u{1F3EA}", nav: "\u{1F9ED}", collections: "\u{1F4E6}", category: "\u{1F3F7}\uFE0F", products: "\u{1F6CD}\uFE0F", blog: "\u{1F4DD}", info: "\u2139\uFE0F", sale: "\u{1F3F7}\uFE0F", new: "\u2728" };
const TYPE_LABELS = { header: "Store Header", nav: "Navigation", collections: "Collections", category: "Product Category", products: "Products", blog: "Blog & Articles", info: "Info & Support", sale: "Sale", new: "New Arrivals" };

// --- Recommendation action component ---
function RecommendationAction({ action, label }) {
  const navigate = useNavigate();
  function handleAction() {
    if (action === "go_onpage")  { navigate("/app/onpage"); return; }
    if (action === "go_blog")    { navigate("/app/blog");   return; }
    if (action === "go_header")  { navigate("/app/llmstxt"); return; }
    if (action === "go_shopify_collections") {
      const shop = window.shopify?.config?.shop || window.location.hostname;
      window.open(`https://${shop}/admin/collections`, "_blank");
    }
    if (action === "go_shopify_pages") {
      const shop = window.shopify?.config?.shop || window.location.hostname;
      window.open(`https://${shop}/admin/pages`, "_blank");
    }
  }
  return (
    <button onClick={handleAction} className="btn btn-ghost" style={{ marginTop: "6px", fontSize: "11px" }}>
      &rarr; {label}
    </button>
  );
}

// --- Score breakdown component ---
function ScorePanel({ score, breakdown }) {
  const items = [
    ["brandName", "Brand Name", 10],
    ["tagline", "Tagline", 10],
    ["description", "Description", 10],
    ["products", "Products", 25],
    ["collections", "Collections", 15],
    ["articles", "Blog Articles", 15],
    ["pages", "Info Pages", 10],
    ["sale", "Sale Section", 5],
  ];

  const [aiRecs, setAiRecs] = useState([]);
  const [loadingAiRecs, setLoadingAiRecs] = useState(false);

  async function fetchAiRecs() {
    setLoadingAiRecs(true);
    try {
      const r = await fetch("/api/llmstxt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "ai_recommendations" }),
      });
      const d = await r.json();
      if (d.success && d.recommendations) setAiRecs(d.recommendations);
    } catch {}
    setLoadingAiRecs(false);
  }

  // Static recommendations based on breakdown gaps
  const recommendations = [];
  const b = breakdown || {};
  if (!b.brandName) recommendations.push({ icon: "\u{1F3EA}", text: "Set your brand name \u2014 open the Store Header section in the editor and fill in the name field.", priority: "high", action: "go_header", actionLabel: "Open Editor" });
  if (!b.tagline)   recommendations.push({ icon: "\u{1F4AC}", text: "Add a one-sentence tagline describing what your store sells.", priority: "high", action: "go_header", actionLabel: "Open Editor" });
  if (!b.description) recommendations.push({ icon: "\u{1F4DD}", text: "Write a 2-3 sentence description covering your audience, key categories and shipping/returns.", priority: "high", action: "go_header", actionLabel: "Open Editor" });
  if (b.products < 25) {
    if (b.products === 0) recommendations.push({ icon: "\u{1F6CD}\uFE0F", text: "No products found. Run On-Page Audit (#02) to sync product handles from Shopify.", priority: "high", action: "go_onpage", actionLabel: "Run On-Page Audit" });
    else if (b.products < 18) recommendations.push({ icon: "\u{1F6CD}\uFE0F", text: "Only partial product coverage. Run On-Page Audit to sync more products (need 50+ for full score).", priority: "medium", action: "go_onpage", actionLabel: "Run Audit" });
    else recommendations.push({ icon: "\u{1F6CD}\uFE0F", text: "Need 50+ products with valid handles for max score. Run On-Page Audit.", priority: "low", action: "go_onpage", actionLabel: "Run Audit" });
  }
  if (b.collections < 15) recommendations.push({ icon: "\u{1F4E6}", text: "Need 10+ collections for full score. Create more collections in your Shopify Admin.", priority: "medium", action: "go_shopify_collections", actionLabel: "Shopify Collections" });
  if (b.articles < 15) {
    if (b.articles === 0) recommendations.push({ icon: "\u{1F4C4}", text: "No blog articles published yet. Go to Blog Generator to create and publish articles.", priority: "medium", action: "go_blog", actionLabel: "Blog Generator" });
    else recommendations.push({ icon: "\u{1F4C4}", text: "Publish more blog articles \u2014 need 10+ for full score.", priority: "low", action: "go_blog", actionLabel: "Blog Generator" });
  }
  if (b.pages < 10) recommendations.push({ icon: "\u2139\uFE0F", text: "Add About, Contact and Policy pages in Shopify Admin, then regenerate LLMs.txt.", priority: "medium", action: "go_shopify_pages", actionLabel: "Shopify Pages" });
  if (!b.sale) recommendations.push({ icon: "\u{1F3F7}\uFE0F", text: "Create a sale/discount collection in Shopify to unlock this section and earn +5 pts.", priority: "low", action: "go_shopify_collections", actionLabel: "Shopify Collections" });

  const prioCls = { high: "critical", medium: "warn", low: "info" };
  const prioLabel = { high: "Required", medium: "Recommended", low: "Optional" };
  const prioAiLabel = { high: "High Impact", medium: "Medium Impact", low: "Low Impact" };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "16px" }}>
        <div className="score-ring" style={{ width: "64px", height: "64px" }}>
          <svg viewBox="0 0 36 36">
            <circle className="score-ring-bg" cx="18" cy="18" r="15.9" strokeWidth="3" />
            <circle className="score-ring-fg" cx="18" cy="18" r="15.9" strokeWidth="3"
              stroke={score >= 80 ? "var(--accent)" : score >= 50 ? "var(--warn)" : "var(--danger)"}
              strokeDasharray={`${score} ${100 - score}`} strokeDashoffset="25" />
          </svg>
          <div className="score-ring-num">{score}</div>
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: "15px" }}>
            {score >= 80 ? "Excellent" : score >= 60 ? "Good" : score >= 40 ? "Fair" : "Needs Work"}
          </div>
          <div style={{ fontSize: "12px", color: "var(--ink-3)" }}>Completeness score</div>
        </div>
      </div>
      {items.map(([key, label, max]) => {
        const val = breakdown?.[key] || 0;
        const pct = (val / max) * 100;
        return (
          <div key={key} style={{ marginBottom: "8px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
              <span style={{ fontSize: "12px" }}>{label}</span>
              <span style={{ fontSize: "12px", color: val === max ? "var(--accent)" : "var(--ink-3)" }}>{val}/{max}</span>
            </div>
            <div className="prog">
              <div className={`prog-fill ${val === max ? "ok" : val > 0 ? "warn" : ""}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}

      {/* Recommendations */}
      {recommendations.length > 0 && score < 100 && (
        <div style={{ marginTop: "16px", borderTop: "1px solid var(--line)", paddingTop: "14px" }}>
          <div style={{ fontSize: "12px", fontWeight: 700, marginBottom: "10px" }}>
            How to reach {Math.min(score + recommendations.reduce((n, r) => n + (r.priority === "high" ? 15 : r.priority === "medium" ? 10 : 5), 0), 100)}/100
          </div>
          {recommendations.map((r, i) => (
            <div key={i} className={`alert-banner ${prioCls[r.priority]}`} style={{ marginBottom: "6px" }}>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", display: "block", marginBottom: "2px" }}>
                  {prioLabel[r.priority]}
                </span>
                <span style={{ fontSize: "12px", lineHeight: 1.5 }}>{r.text}</span>
                {r.action && <RecommendationAction action={r.action} label={r.actionLabel} />}
              </div>
            </div>
          ))}
        </div>
      )}

      {score === 100 && (
        <div className="alert-banner ok" style={{ marginTop: "14px", textAlign: "center" }}>
          Perfect score! Your LLMs.txt is fully optimized.
        </div>
      )}

      {/* AI Recommendations */}
      <div style={{ marginTop: "16px", borderTop: "1px solid var(--line)", paddingTop: "14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
          <div style={{ fontSize: "12px", fontWeight: 700 }}>AI Recommendations</div>
          <button
            onClick={fetchAiRecs}
            disabled={loadingAiRecs}
            className="btn btn-primary"
            style={{ fontSize: "11px", padding: "4px 10px" }}
          >
            {loadingAiRecs ? "Analyzing..." : aiRecs.length > 0 ? "Refresh" : "Analyze with AI"}
          </button>
        </div>

        {aiRecs.length === 0 && !loadingAiRecs && (
          <div style={{ fontSize: "12px", color: "var(--ink-4)", fontStyle: "italic" }}>
            Click "Analyze with AI" to get personalized recommendations based on your store content and gaps.
          </div>
        )}

        {aiRecs.map((r, i) => (
          <div key={i} className={`alert-banner ${prioCls[r.priority] || "info"}`} style={{ marginBottom: "6px" }}>
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", display: "block", marginBottom: "2px" }}>
                {prioAiLabel[r.priority] || "Low Impact"}
              </span>
              <span style={{ fontSize: "12px", lineHeight: 1.5 }}>{r.text}</span>
              {r.action && <RecommendationAction action={r.action} label={r.actionLabel} />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Section editor component ---
function SectionCard({ section, onUpdate, onRegenerate, expanded, onToggle }) {
  const [regenerating, setRegenerate] = useState(false);
  const [editingLinkIdx, setEditingLink] = useState(null);
  const links = section.links || [];
  const previewLinks = section.previewLimit ? links.slice(0, section.previewLimit) : links;
  const hiddenCount = links.length - previewLinks.length;

  async function handleRegenerate() {
    setRegenerate(true);
    await onRegenerate(section.id);
    setRegenerate(false);
  }

  function updateLink(idx, field, value) {
    const newLinks = [...links];
    newLinks[idx] = { ...newLinks[idx], [field]: value };
    onUpdate({ ...section, links: newLinks });
  }

  if (section.type === "header") {
    return (
      <div className="card" style={{ marginBottom: "12px" }}>
        <div className="card-head" style={{ cursor: "pointer" }} onClick={onToggle}>
          <div className="card-title">
            <span>{TYPE_ICONS[section.type]}</span>
            <span>{section.brandName || "Store Header"}</span>
            <span className="q-tag info">Required</span>
          </div>
          <span style={{ color: "var(--ink-3)", fontSize: "14px" }}>{expanded ? "\u25B2" : "\u25BC"}</span>
        </div>
        {expanded && (
          <div style={{ padding: "16px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
              <div>
                <div className="editor-label">Brand Name (H1)</div>
                <input className="editor-input" style={{ border: "1px solid var(--line)", borderRadius: "var(--r-sm)", padding: "8px 10px" }} value={section.brandName || ""} onChange={e => onUpdate({ ...section, brandName: e.target.value })} placeholder="Your Store Name" />
              </div>
              <div>
                <div className="editor-label">Domain</div>
                <input className="editor-input" style={{ border: "1px solid var(--line)", borderRadius: "var(--r-sm)", padding: "8px 10px" }} value={section.domain || ""} onChange={e => onUpdate({ ...section, domain: e.target.value })} placeholder="yourdomain.com" />
              </div>
            </div>
            <div style={{ marginBottom: "12px" }}>
              <div className="editor-label">Tagline (blockquote) <span style={{ color: "var(--ink-4)" }}>&mdash; shown as &gt; quote</span></div>
              <input className="editor-input" style={{ border: "1px solid var(--line)", borderRadius: "var(--r-sm)", padding: "8px 10px" }} value={section.tagline || ""} onChange={e => onUpdate({ ...section, tagline: e.target.value })} placeholder="One sentence describing what you sell" />
            </div>
            <div style={{ marginBottom: "12px" }}>
              <div className="editor-label">Description <span style={{ color: "var(--ink-4)" }}>&mdash; audience, differentiators, market</span></div>
              <textarea className="editor-input" style={{ border: "1px solid var(--line)", borderRadius: "var(--r-sm)", padding: "8px 10px", minHeight: "80px", resize: "vertical" }} value={section.description || ""} onChange={e => onUpdate({ ...section, description: e.target.value })} />
            </div>
            <div>
              <div className="editor-label">LLM Note <span style={{ color: "var(--ink-4)" }}>&mdash; context for AI crawlers</span></div>
              <textarea className="editor-input" style={{ border: "1px solid var(--line)", borderRadius: "var(--r-sm)", padding: "8px 10px", minHeight: "60px", resize: "vertical" }} value={section.llmNote || ""} onChange={e => onUpdate({ ...section, llmNote: e.target.value })} />
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="card" style={{ marginBottom: "12px" }}>
      <div className="card-head" style={{ cursor: "pointer" }} onClick={onToggle}>
        <div className="card-title">
          <span>{TYPE_ICONS[section.type] || "\u{1F4CB}"}</span>
          <span>{section.title}</span>
          <span className="tab-count">{links.length}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button onClick={e => { e.stopPropagation(); handleRegenerate(); }} disabled={regenerating} className="btn btn-ghost" style={{ fontSize: "11px", padding: "4px 10px", opacity: regenerating ? 0.6 : 1 }} title="Regenerate with AI">
            {regenerating ? "..." : "AI"}
          </button>
          <span style={{ color: "var(--ink-3)", fontSize: "14px" }}>{expanded ? "\u25B2" : "\u25BC"}</span>
        </div>
      </div>
      {expanded && (
        <div style={{ padding: "16px" }}>
          <div style={{ marginBottom: "12px" }}>
            <div className="editor-label">Section Title</div>
            <input className="editor-input" style={{ border: "1px solid var(--line)", borderRadius: "var(--r-sm)", padding: "8px 10px" }} value={section.title || ""} onChange={e => onUpdate({ ...section, title: e.target.value })} />
          </div>
          <div style={{ marginBottom: "8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div className="editor-label" style={{ margin: 0 }}>Links ({links.length}{hiddenCount > 0 ? `, showing first ${section.previewLimit}` : ""})</div>
            <button className="btn btn-ghost" style={{ fontSize: "11px" }} onClick={() => onUpdate({ ...section, links: [...links, { url: "", title: "", desc: "" }] })}>+ Add link</button>
          </div>
          {previewLinks.map((link, idx) => (
            <div key={idx} style={{ display: "flex", gap: "8px", alignItems: "flex-start", padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
              {editingLinkIdx === idx ? (
                <div style={{ flex: 1 }}>
                  <input className="editor-input" style={{ border: "1px solid var(--line)", borderRadius: "var(--r-sm)", padding: "6px 10px", marginBottom: "6px" }} value={link.title} onChange={e => updateLink(idx, "title", e.target.value)} placeholder="Title" />
                  <input className="editor-input" style={{ border: "1px solid var(--line)", borderRadius: "var(--r-sm)", padding: "6px 10px", marginBottom: "6px", fontFamily: "var(--mono)", fontSize: "11px" }} value={link.url} onChange={e => updateLink(idx, "url", e.target.value)} placeholder="https://..." />
                  <input className="editor-input" style={{ border: "1px solid var(--line)", borderRadius: "var(--r-sm)", padding: "6px 10px" }} value={link.desc} onChange={e => updateLink(idx, "desc", e.target.value)} placeholder="Description for AI crawlers" />
                  <button className="btn btn-primary" style={{ marginTop: "6px", fontSize: "11px" }} onClick={() => setEditingLink(null)}>Done</button>
                </div>
              ) : (
                <>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "13px", fontWeight: 500 }}>{link.title || <span style={{ color: "var(--ink-4)" }}>Untitled</span>}</div>
                    <div style={{ fontSize: "11px", color: "var(--ink-3)", fontFamily: "var(--mono)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "200px" }}>{link.url}</div>
                    {link.desc && <div style={{ fontSize: "12px", color: "var(--ink-3)", marginTop: "2px" }}>{link.desc.slice(0, 100)}{link.desc.length > 100 ? "..." : ""}</div>}
                  </div>
                  <button className="btn btn-ghost" style={{ fontSize: "11px" }} onClick={() => setEditingLink(idx)}>Edit</button>
                  <button className="btn btn-ghost" style={{ fontSize: "11px", color: "var(--danger)" }} onClick={() => onUpdate({ ...section, links: links.filter((_, i) => i !== idx) })}>{"\u2715"}</button>
                </>
              )}
            </div>
          ))}
          {hiddenCount > 0 && (
            <div style={{ textAlign: "center", padding: "10px", color: "var(--ink-3)", fontSize: "12px" }}>
              + {hiddenCount} more links (all included in generated file)
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- Client-side breakdown calculator (mirrors server computeScore) ---
function computeBreakdownFromSections(sections) {
  const header = sections.find(s => s.type === "header");
  const totalProducts = sections.filter(s => s.type === "category" || s.type === "products").reduce((n, s) => n + (s.links?.length || 0), 0);
  const colCount  = sections.find(s => s.type === "collections")?.links?.length || 0;
  const artCount  = sections.find(s => s.type === "blog")?.links?.length || 0;
  const pageCount = sections.find(s => s.type === "info")?.links?.length || 0;
  const hasSale   = sections.some(s => s.type === "sale" && s.links?.length > 0);
  return {
    brandName:   header?.brandName?.length > 2  ? 10 : 0,
    tagline:     header?.tagline?.length > 10    ? 10 : 0,
    description: header?.description?.length > 30 ? 10 : 0,
    products:    totalProducts >= 50 ? 25 : totalProducts >= 20 ? 18 : totalProducts >= 5 ? 10 : totalProducts > 0 ? 5 : 0,
    collections: colCount >= 10 ? 15 : colCount >= 5 ? 10 : colCount > 0 ? 5 : 0,
    articles:    artCount >= 10 ? 15 : artCount >= 3 ? 10 : artCount > 0 ? 5 : 0,
    pages:       pageCount >= 3 ? 10 : pageCount > 0 ? 5 : 0,
    sale:        hasSale ? 5 : 0,
  };
}

// --- Main page ---
export default function LlmsTxtPage() {
  const navigate = useNavigate();
  const [llmsTxt, setLlmsTxt] = useState(null);
  const [sections, setSections] = useState([]);
  const [score, setScore] = useState(0);
  const [breakdown, setBreakdown] = useState({});
  const [content, setContent] = useState("");
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [activeTab, setActiveTab] = useState("editor");
  const [expandedSections, setExpandedSections] = useState({ header: true });
  const [dirty, setDirty] = useState(false);

  useEffect(() => { fetchCurrent(); }, []);

  async function fetchCurrent() {
    setLoading(true);
    try {
      const r = await fetch("/api/llmstxt");
      const data = await r.json();
      if (data.llmsTxt) {
        setLlmsTxt(data.llmsTxt);
        let parsedSections = JSON.parse(data.llmsTxt.sections || "[]");
        setScore(data.llmsTxt.score || 0);
        setContent(data.llmsTxt.content || "");
        setHistory(data.llmsTxt.history || []);

        const roTitles = ["Navigare Principal\u0103", "Categorii de Produse", "Produse Disponibile", "Articole \u0219i Ghiduri", "Informa\u021Bii \u0219i Suport", "Reduceri \u0219i Oferte", "Nout\u0103\u021Bi"];
        const hasRo = parsedSections.some(s => roTitles.includes(s.title) || s.title?.startsWith("Produse: "));
        if (hasRo) {
          try {
            const r = await fetch("/api/llmstxt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ intent: "fix_titles" }) });
            const d = await r.json();
            if (d.success && d.sections) parsedSections = d.sections;
            if (d.content) setContent(d.content);
          } catch {}
        }

        setSections(parsedSections);
        if (parsedSections.length > 0) setBreakdown(computeBreakdownFromSections(parsedSections));
      }
    } catch {}
    setLoading(false);
  }

  async function generate() {
    setGenerating(true);
    setMsg(null);
    try {
      const r = await fetch("/api/llmstxt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ intent: "generate" }) });
      const data = await r.json();
      if (data.success) {
        setSections(data.sections || []);
        setScore(data.score || 0);
        setBreakdown(data.breakdown || {});
        setContent(data.content || "");
        setDirty(false);
        await fetchCurrent();
        setMsg({ type: "ok", text: `Generated \u2014 score ${data.score}/100, ${data.charCount} chars` });
      } else {
        setMsg({ type: "err", text: data.error || "Generation failed" });
      }
    } catch (e) { setMsg({ type: "err", text: e.message }); }
    setGenerating(false);
  }

  async function saveEdits() {
    setSaving(true);
    try {
      const r = await fetch("/api/llmstxt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ intent: "save_sections", sections }) });
      const data = await r.json();
      if (data.success) {
        setContent(data.content || "");
        setScore(data.score || 0);
        setDirty(false);
        setMsg({ type: "ok", text: "Changes saved" });
      }
    } catch (e) { setMsg({ type: "err", text: e.message }); }
    setSaving(false);
  }

  async function regenerateSection(sectionId) {
    try {
      const r = await fetch("/api/llmstxt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ intent: "regenerate_section", sectionId }) });
      const data = await r.json();
      if (data.success) {
        setSections(data.sections || sections);
        setScore(data.score || score);
        setMsg({ type: "ok", text: "Section regenerated with AI" });
      }
    } catch (e) { setMsg({ type: "err", text: e.message }); }
  }

  function updateSection(updated) {
    setSections(prev => {
      const next = prev.map(s => s.id === updated.id ? updated : s);
      setBreakdown(computeBreakdownFromSections(next));
      return next;
    });
    setDirty(true);
  }

  function toggleSection(id) {
    setExpandedSections(prev => ({ ...prev, [id]: !prev[id] }));
  }

  const publishedAt = llmsTxt?.publishedAt ? new Date(llmsTxt.publishedAt).toLocaleString("ro-RO") : null;

  return (
    <div className="page active">
      {/* Page header */}
      <div className="page-head">
        <div>
          <h1 className="page-title">LLMs.txt Generator</h1>
          <p className="page-sub">{publishedAt ? `Last published: ${publishedAt}` : "Not yet published"}</p>
        </div>
        <div className="page-actions">
          {/* Tabs */}
          {["editor", "preview", "history"].map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} className={`chip ${activeTab === tab ? "active" : ""}`}>
              {tab === "editor" ? "Editor" : tab === "preview" ? "Preview" : "History"}
            </button>
          ))}
          {dirty && <button onClick={saveEdits} disabled={saving} className="btn btn-primary">{saving ? "Saving..." : "Save"}</button>}
          <button onClick={generate} disabled={generating} className="btn btn-primary" style={{ opacity: generating ? 0.7 : 1 }}>
            {generating ? "Generating..." : llmsTxt ? "Regenerate" : "Generate"}
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: "20px" }}>
        {/* Editor / Preview / History */}
        <div>
          {msg && <div className={`alert-banner ${msg.type === "ok" ? "ok" : "warn"}`}>{msg.text}</div>}

          {loading && <div style={{ color: "var(--ink-3)", textAlign: "center", padding: "40px" }}>Loading...</div>}

          {!loading && !llmsTxt && activeTab === "editor" && (
            <div className="card" style={{ textAlign: "center", padding: "60px 20px" }}>
              <div style={{ fontSize: "40px", marginBottom: "16px" }}>&#x1F916;</div>
              <div style={{ fontSize: "18px", fontWeight: 700, marginBottom: "8px" }}>No LLMs.txt yet</div>
              <p className="page-sub" style={{ marginBottom: "24px" }}>Generate your first LLMs.txt file to help AI crawlers understand your store.</p>
              <button onClick={generate} disabled={generating} className="btn btn-primary">{generating ? "Generating..." : "Generate LLMs.txt"}</button>
            </div>
          )}

          {/* Editor tab */}
          {!loading && activeTab === "editor" && sections.length > 0 && (
            <div>
              <div style={{ marginBottom: "16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "13px", color: "var(--ink-3)" }}>{sections.length} sections &middot; {content.split("\n").filter(l => l.startsWith("- [")).length} total links</span>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button className="btn btn-ghost" style={{ fontSize: "11px" }} onClick={() => setExpandedSections(Object.fromEntries(sections.map(s => [s.id, true])))}>Expand all</button>
                  <button className="btn btn-ghost" style={{ fontSize: "11px" }} onClick={() => setExpandedSections({})}>Collapse all</button>
                </div>
              </div>
              {sections.map(sec => (
                <SectionCard
                  key={sec.id}
                  section={sec}
                  expanded={!!expandedSections[sec.id]}
                  onToggle={() => toggleSection(sec.id)}
                  onUpdate={updateSection}
                  onRegenerate={regenerateSection}
                />
              ))}
            </div>
          )}

          {/* Preview tab */}
          {activeTab === "preview" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                <span style={{ fontSize: "13px", color: "var(--ink-3)" }}>{content.length} chars &middot; {content.split("\n").length} lines</span>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button className="btn btn-ghost" style={{ fontSize: "11px" }} onClick={() => navigator.clipboard.writeText(content)}>Copy</button>
                  <a href={`data:text/plain;charset=utf-8,${encodeURIComponent(content)}`} download="llms.txt" className="btn btn-ghost" style={{ textDecoration: "none", fontSize: "11px" }}>Download</a>
                </div>
              </div>
              <div className="code-wrap">
                <pre>{content || "No content yet \u2014 click Generate"}</pre>
              </div>
            </div>
          )}

          {/* History tab */}
          {activeTab === "history" && (
            <div>
              <div style={{ fontSize: "13px", color: "var(--ink-3)", marginBottom: "16px" }}>Last 5 versions. Click Restore to revert to a previous version.</div>
              {history.length === 0 && <div style={{ color: "var(--ink-3)", fontSize: "13px" }}>No history yet &mdash; regenerate to create versions.</div>}
              {history.map((h, idx) => (
                <div key={h.id} className="card" style={{ padding: "14px 16px", marginBottom: "10px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: "13px", fontWeight: 600 }}>Version {history.length - idx}</div>
                      <div style={{ fontSize: "12px", color: "var(--ink-3)" }}>{new Date(h.createdAt).toLocaleString("ro-RO")} &middot; Score: {h.score}/100 &middot; {h.content?.length || 0} chars</div>
                    </div>
                    <button className="btn btn-ghost" style={{ fontSize: "11px" }} onClick={async () => {
                      const r = await fetch("/api/llmstxt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ intent: "restore_history", historyId: h.id }) });
                      const d = await r.json();
                      if (d.success) { setContent(d.content); setMsg({ type: "ok", text: "Restored" }); setActiveTab("preview"); }
                    }}>Restore</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div>
          {/* Score */}
          <div className="card" style={{ padding: "16px", marginBottom: "14px" }}>
            <div style={{ fontSize: "13px", fontWeight: 700, marginBottom: "12px" }}>Completeness Score</div>
            <ScorePanel score={score} breakdown={breakdown} />
          </div>

          <div className="card" style={{ padding: "16px", marginBottom: "14px" }}>
            <div style={{ fontSize: "13px", fontWeight: 700, marginBottom: "8px" }}>What is LLMs.txt?</div>
            <div style={{ fontSize: "12px", color: "var(--ink-3)", lineHeight: 1.6 }}>
              A structured Markdown file at <code style={{ fontFamily: "var(--mono)", fontSize: "11px", background: "var(--surface-2)", padding: "1px 3px", borderRadius: "3px" }}>/llms.txt</code> that tells AI crawlers what your store sells. GPTBot, ClaudeBot and PerplexityBot read it daily.
            </div>
          </div>

          <div className="card" style={{ padding: "16px" }}>
            <div style={{ fontSize: "13px", fontWeight: 700, marginBottom: "10px" }}>File Stats</div>
            {[
              ["Sections", sections.length],
              ["Total links", content.split("\n").filter(l => l.startsWith("- [")).length],
              ["Characters", content.length.toLocaleString()],
              ["Lines", content.split("\n").length],
            ].map(([label, val]) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
                <span style={{ fontSize: "12px", color: "var(--ink-3)" }}>{label}</span>
                <span style={{ fontSize: "12px", fontWeight: 600 }}>{val}</span>
              </div>
            ))}
          </div>

          {llmsTxt?.shopifyFileUrl && (
            <div style={{ marginTop: "14px" }}>
              <a href={llmsTxt.shopifyFileUrl} target="_blank" rel="noopener noreferrer" className="btn btn-ghost" style={{ display: "block", textAlign: "center", textDecoration: "none" }}>
                View published file
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
