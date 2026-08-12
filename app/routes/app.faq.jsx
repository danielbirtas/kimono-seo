// app/routes/app.faq.jsx
// Kimono SEO #20 — FAQ + PAA Extraction

import { useEffect, useState } from "react";
import { useNavigate } from "react-router";

function ArticleRow({ article, onApply, onOpen }) {
  const [applying, setApplying] = useState(false);

  async function handleApply() {
    setApplying(true);
    await onApply(article.id);
    setApplying(false);
  }

  return (
    <div className="data-row" style={{ gridTemplateColumns: "1fr auto auto auto" }}>
      <div className="data-row-main">
        <div className="data-row-title">
          {article.h1 || article.titleTag || article.primaryKeyword}
        </div>
        <div className="data-row-meta">{article.primaryKeyword}</div>
      </div>
      <span className={`q-tag ${article.hasFaq ? "info" : "warn"}`}>
        {article.hasFaq ? `${article.faqCount} questions` : "No FAQ"}
      </span>
      <button onClick={handleApply} disabled={applying} className="btn btn-ghost" style={{ fontSize: 12, opacity: applying ? 0.7 : 1 }}>
        {applying ? "..." : article.hasFaq ? "Regenerate" : "Generate FAQ"}
      </button>
      {article.hasFaq && (
        <button onClick={() => onOpen(article)} className="btn btn-ghost" style={{ fontSize: 12 }}>Edit</button>
      )}
    </div>
  );
}

function FaqEditor({ article, faqData, onSave, onClose }) {
  const [pairs, setPairs] = useState(faqData?.mainEntity?.map(e => ({ question: e.name, answer: e.acceptedAnswer?.text || "" })) || []);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    await onSave(article.id, pairs);
    setSaving(false);
  }

  function update(idx, field, value) {
    setPairs(prev => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p));
  }

  return (
    <div className="card" style={{ border: "2px solid var(--accent)", marginBottom: 18 }}>
      <div className="card-head">
        <div>
          <div className="card-title">Edit FAQ — {article.primaryKeyword}</div>
          <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{pairs.length} questions &middot; FAQPage schema will update on save</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setPairs(prev => [...prev, { question: "", answer: "" }])} className="btn btn-ghost" style={{ fontSize: 12 }}>+ Add Q</button>
          <button onClick={save} disabled={saving} className="btn btn-primary" style={{ fontSize: 12, opacity: saving ? 0.7 : 1 }}>{saving ? "Saving..." : "Save"}</button>
          <button onClick={onClose} className="btn btn-ghost" style={{ fontSize: 12 }}>Close</button>
        </div>
      </div>

      <div style={{ padding: 16 }}>
        {pairs.map((p, i) => (
          <div key={i} style={{ background: "var(--surface-2)", borderRadius: "var(--r-sm)", padding: 14, marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-3)", textTransform: "uppercase" }}>Q{i + 1}</span>
              <button onClick={() => setPairs(prev => prev.filter((_, j) => j !== i))} style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer", fontSize: 16, padding: 0 }}>x</button>
            </div>
            <input
              style={{ width: "100%", marginBottom: 8, padding: "8px 12px", border: "1px solid var(--line)", borderRadius: "var(--r-sm)", fontSize: 13, fontFamily: "var(--sans)", fontWeight: 600, boxSizing: "border-box" }}
              value={p.question}
              onChange={e => update(i, "question", e.target.value)}
              placeholder="Question..."
            />
            <textarea
              style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--line)", borderRadius: "var(--r-sm)", fontSize: 13, fontFamily: "var(--sans)", resize: "vertical", minHeight: 80, boxSizing: "border-box" }}
              value={p.answer}
              onChange={e => update(i, "answer", e.target.value)}
              placeholder="Answer (40-80 words, direct answer first)..."
            />
            <div style={{ fontSize: 11, color: p.answer.split(/\s+/).length > 80 ? "var(--danger)" : "var(--ink-4)", marginTop: 4 }}>
              {p.answer.split(/\s+/).filter(Boolean).length} words {p.answer.split(/\s+/).length > 80 ? "(too long)" : ""}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function FaqPaaPage() {
  const navigate = useNavigate();
  const [articles, setArticles] = useState([]);
  const [hasDfs, setHasDfs] = useState(false);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);
  const [previewKeyword, setPreviewKeyword] = useState("");
  const [previewResult, setPreviewResult] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [editingArticle, setEditingArticle] = useState(null);
  const [editingFaq, setEditingFaq] = useState(null);
  const [batchRunning, setBatchRunning] = useState(false);

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const r = await fetch("/api/faq");
      const d = await r.json();
      setArticles(d.articles || []);
      setHasDfs(d.hasDfs || false);
    } catch {}
    setLoading(false);
  }

  async function preview() {
    if (!previewKeyword.trim()) return;
    setPreviewing(true);
    setPreviewResult(null);
    try {
      const r = await fetch("/api/faq", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "preview", keyword: previewKeyword }),
      });
      const d = await r.json();
      if (d.success) setPreviewResult(d);
      else setMsg({ type: "err", text: d.error });
    } catch (e) { setMsg({ type: "err", text: e.message }); }
    setPreviewing(false);
  }

  async function applyToArticle(articleId) {
    try {
      const r = await fetch("/api/faq", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "apply_article", articleId }),
      });
      const d = await r.json();
      if (d.success) {
        setMsg({ type: "ok", text: `Generated ${d.faqPairs?.length || 0} FAQ questions` });
        await fetchData();
      } else {
        setMsg({ type: "err", text: d.error });
      }
    } catch (e) { setMsg({ type: "err", text: e.message }); }
  }

  async function openEditor(article) {
    const articleData = articles.find(a => a.id === article.id);
    let faqData = null;
    try {
      if (articleData?.faqSchema) faqData = JSON.parse(articleData.faqSchema);
    } catch {}
    setEditingArticle(article);
    setEditingFaq(faqData);
  }

  async function saveFaq(articleId, pairs) {
    const r = await fetch("/api/faq", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intent: "save_faq", articleId, faqPairs: pairs }),
    });
    const d = await r.json();
    if (d.success) {
      setMsg({ type: "ok", text: "FAQ saved and schema updated" });
      setEditingArticle(null);
      await fetchData();
    } else {
      setMsg({ type: "err", text: d.error });
    }
  }

  async function batchGenerate() {
    setBatchRunning(true);
    try {
      const r = await fetch("/api/faq", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "batch_generate", limit: 5 }),
      });
      const d = await r.json();
      if (d.success) {
        setMsg({ type: "ok", text: `Generated FAQ for ${d.success} articles (${d.failed} failed)` });
        await fetchData();
      } else {
        setMsg({ type: "err", text: d.error });
      }
    } catch (e) { setMsg({ type: "err", text: e.message }); }
    setBatchRunning(false);
  }

  const withFaq    = articles.filter(a => a.hasFaq).length;
  const withoutFaq = articles.filter(a => !a.hasFaq).length;

  return (
    <div className="page active">
      {/* Header */}
      <div className="page-head">
        <div>
          <h1 className="page-title">FAQ + PAA Extraction</h1>
          <p className="page-sub">Extract People Also Ask questions, generate AI-optimized answers, insert FAQPage schema</p>
        </div>
        <div className="page-actions">
          {withoutFaq > 0 && (
            <button onClick={batchGenerate} disabled={batchRunning} className="btn btn-primary" style={{ opacity: batchRunning ? 0.7 : 1 }}>
              {batchRunning ? "Generating..." : `Generate All (${withoutFaq} missing)`}
            </button>
          )}
        </div>
      </div>

      {msg && <div className={`alert-banner ${msg.type === "ok" ? "ok" : "warn"}`}>{msg.text}</div>}

      {/* Status metrics */}
      <div className="metric-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        <div className="metric">
          <div className="metric-label">Articles with FAQ</div>
          <div className="metric-value" style={{ color: "var(--accent)" }}>{withFaq}</div>
        </div>
        <div className="metric">
          <div className="metric-label">Articles without FAQ</div>
          <div className="metric-value" style={{ color: "var(--warn)" }}>{withoutFaq}</div>
        </div>
        <div className="metric">
          <div className="metric-label">DataForSEO</div>
          <div className="metric-value" style={{ color: hasDfs ? "var(--accent)" : "var(--ink-4)" }}>
            {hasDfs ? "Connected" : "N/A"}
          </div>
        </div>
      </div>

      {!hasDfs && (
        <div className="alert-banner warn">
          <b>DataForSEO not configured</b> — FAQ questions will be generated by Claude AI instead of real PAA data. Add DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD to Railway env.
        </div>
      )}

      {/* Preview tool */}
      <div className="card" style={{ marginBottom: 18, padding: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>Preview PAA Questions for a Keyword</div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            style={{ flex: 1, padding: "8px 12px", border: "1px solid var(--line)", borderRadius: "var(--r-sm)", fontSize: 13, fontFamily: "var(--sans)" }}
            value={previewKeyword}
            onChange={e => setPreviewKeyword(e.target.value)}
            onKeyDown={e => e.key === "Enter" && preview()}
            placeholder="Enter a keyword to preview questions..."
          />
          <button onClick={preview} disabled={previewing || !previewKeyword} className="btn btn-primary" style={{ opacity: previewing ? 0.7 : 1 }}>
            {previewing ? "..." : "Preview"}
          </button>
        </div>

        {previewResult && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 10 }}>
              {previewResult.questions?.length} questions found {!hasDfs ? "(generated by Claude)" : "(from Google PAA)"}
            </div>
            {previewResult.faqPairs?.map((p, i) => (
              <div key={i} style={{ background: "var(--surface-2)", borderRadius: "var(--r-sm)", padding: 14, marginBottom: 10 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-0)", marginBottom: 8 }}>{p.question}</div>
                <div style={{ fontSize: 13, color: "var(--ink-1)", lineHeight: 1.6 }}>{p.answer}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* FAQ editor (inline) */}
      {editingArticle && (
        <FaqEditor
          article={editingArticle}
          faqData={editingFaq}
          onSave={saveFaq}
          onClose={() => setEditingArticle(null)}
        />
      )}

      {/* Articles list */}
      <div className="card">
        <div className="card-head">
          <div className="card-title">Published Articles <span className="count">{articles.length}</span></div>
        </div>
        {loading && <div style={{ color: "var(--ink-3)", padding: 20, textAlign: "center" }}>Loading...</div>}
        {!loading && articles.length === 0 && (
          <div style={{ color: "var(--ink-3)", padding: 20, textAlign: "center", fontSize: 13 }}>
            No published articles found. Go to Blog Generator to create and publish articles first.
          </div>
        )}
        <div className="data-list" style={{ border: "none", borderRadius: 0 }}>
          {articles.map(a => (
            <ArticleRow
              key={a.id}
              article={a}
              onApply={applyToArticle}
              onOpen={openEditor}
            />
          ))}
        </div>
      </div>

      {/* Info */}
      <div className="card" style={{ marginTop: 18, padding: 16 }}>
        <div style={{ fontSize: 12, color: "var(--ink-3)", lineHeight: 1.7 }}>
          <strong style={{ color: "var(--ink-1)" }}>How it works:</strong> Kimono SEO fetches real "People Also Ask" questions from Google (via DataForSEO) for each article's primary keyword. Claude generates direct, concise answers (40-80 words) optimized for AI Overviews and featured snippets. The FAQPage JSON-LD schema is saved to the article metafield and rendered in the page source.
          <br />
          <strong style={{ color: "var(--ink-1)" }}>Impact:</strong> FAQPage schema increases chances of appearing in Google's AI Mode, featured snippets, and PAA boxes.
        </div>
      </div>
    </div>
  );
}
