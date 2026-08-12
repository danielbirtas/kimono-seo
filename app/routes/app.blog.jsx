// app/routes/app.blog.jsx
// Kimono SEO — Blog Generator (#07)
// 3 tabs: Clusters | Articles | Generate

import { useLoaderData, useNavigate } from "react-router";
import { useState, useEffect, useCallback } from "react";
import prisma from "../db.server.js";
import { requireAuth } from "../lib/auth/index.server.js";

export const loader = async ({ request }) => {
  const { connection, storeId } = await requireAuth(request);
  if (!storeId) return { articles: [], clusters: [], hasAI: false };
  const urlParams = new URL(request.url).searchParams;
  const prefillKeyword = urlParams.get("keyword") || null;

  const [articles, clusters] = await Promise.all([
    prisma.blogArticle.findMany({
      where: { storeId }, orderBy: { createdAt: "desc" }, take: 50,
      select: { id: true, primaryKeyword: true, articleType: true, titleTag: true, urlSlug: true, wordCount: true, status: true, generatedAt: true, publishedAt: true },
    }),
    prisma.blogCluster.findMany({
      where: { storeId }, orderBy: { priorityScore: "desc" }, take: 30,
    }),
  ]);

  return {
    articles,
    clusters,
    hasAI: !!process.env.ANTHROPIC_API_KEY,
    prefillKeyword,
  };
};

const STATUS_CLS = {
  draft: "", review: "warn", published: "info", failed: "critical",
  pending: "", in_progress: "info", done: "info",
};
const TYPE_LABEL = { pillar: "Pillar", satellite: "Satellite", listicle: "Listicle", howto: "How-to", comparison: "Comparison" };

export default function BlogPage() {
  const { articles: initArticles, clusters: initClusters, hasAI, prefillKeyword } = useLoaderData();
  const navigate = useNavigate();

  const [articles,  setArticles] = useState(initArticles);
  const [clusters,  setClusters] = useState(initClusters);
  const [selected,  setSelected] = useState(null);
  const [msg,       setMsg]      = useState("");
  const [syncing,   setSyncing]  = useState(false);
  const [prefill,   setPrefill]  = useState(prefillKeyword ? { primaryKeyword: prefillKeyword } : null);
  const [tab,       setTab]      = useState(prefillKeyword ? "generate" : "clusters");

  useEffect(() => {
    const fromPaa = new URLSearchParams(window.location.search).get("from_paa");
    if (fromPaa === "1") {
      try {
        const stored = sessionStorage.getItem("paa_prefill");
        if (stored) {
          const { keyword, questions } = JSON.parse(stored);
          sessionStorage.removeItem("paa_prefill");
          if (keyword && questions?.length > 0) {
            setPrefill({ primaryKeyword: keyword, _goPaa: true, _paaQuestions: questions });
            setTab("generate");
          }
        }
      } catch {}
    }
  }, []);

  const refresh = useCallback(async () => {
    const resp = await fetch("/api/blog/generate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intent: "list" }),
    });
    const data = await resp.json();
    if (data.success) { setArticles(data.articles); setClusters(data.clusters); }
  }, []);

  const syncClusters = async () => {
    setSyncing(true);
    setMsg("");
    const resp = await fetch("/api/blog/generate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intent: "sync_clusters" }),
    });
    const data = await resp.json();
    setMsg(data.success ? `Synced ${data.synced} keyword clusters from GSC Triage.` : `Error: ${data.error}`);
    setSyncing(false);
    refresh();
  };

  const switchTab = (key) => { setMsg(""); setTab(key); };

  return (
    <div className="page active">
      {/* Header */}
      <div className="page-head">
        <div>
          <h1 className="page-title">Blog Generator</h1>
          <p className="page-sub">AEO + GEO + SEO optimized articles — powered by Claude {process.env.AI_MODEL_QUALITY || "claude-sonnet-4-6"}</p>
        </div>
        <div className="page-actions">
          <button onClick={() => setTab("generate")} className="btn btn-primary">+ New article</button>
        </div>
      </div>

      {!hasAI && <div className="alert-banner warn">ANTHROPIC_API_KEY missing — add it in Railway Variables.</div>}
      {msg && <div className={`alert-banner ${msg.startsWith("Synced") || msg.startsWith("Article") ? "ok" : "warn"}`}>{msg}</div>}

      {/* Tabs */}
      <div className="tabs-bar">
        {[
          ["articles", `Articles (${articles.length})`],
          ["clusters", `Clusters (${clusters.length})`],
          ["recommendations", "AI Recommendations"],
          ["calendar", "Content Calendar"],
          ["generate", "Generate"],
        ].map(([key, label]) => (
          <button key={key} onClick={() => switchTab(key)} className={`tab ${tab === key ? "active" : ""}`}>{label}</button>
        ))}
      </div>

      {tab === "articles" && (
        <ArticlesTab articles={articles} onRefresh={refresh} onSelect={setSelected} setMsg={setMsg} />
      )}
      {tab === "clusters" && (
        <ClustersTab clusters={clusters} onSync={syncClusters} syncing={syncing} onGenerate={(cluster) => { setPrefill(cluster); setTab("generate"); }} setMsg={setMsg} />
      )}
      {tab === "generate" && (
        <GenerateTab clusters={clusters} hasAI={hasAI} prefill={prefill} onDone={() => { setPrefill(null); setTab("articles"); refresh(); }} setMsg={setMsg} />
      )}
      {tab === "recommendations" && (
        <RecommendationsTab hasAI={hasAI}
          onGenerate={(brief) => { setPrefill(brief); setTab("generate"); }}
          onGenerateWithPaa={(brief) => { setPrefill({ ...brief, _goPaa: true }); setTab("generate"); }}
          setMsg={setMsg} />
      )}
      {tab === "calendar" && (
        <CalendarTab articles={articles} setMsg={setMsg} onRefresh={refresh} />
      )}

      {selected && (
        <ArticleModal articleId={selected} onClose={() => setSelected(null)} onRefresh={refresh} setMsg={setMsg} />
      )}
    </div>
  );
}

// ── Markdown renderer ──
function renderMarkdown(md) {
  if (!md) return "";
  let html = md
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/^### (.+)$/gm, "<h3 style='font-size:15px;font-weight:600;color:var(--ink-0);margin:20px 0 8px'>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2 style='font-size:18px;font-weight:700;color:var(--ink-0);margin:28px 0 10px;padding-bottom:6px;border-bottom:1px solid var(--line)'>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1 style='font-size:22px;font-weight:700;color:var(--ink-0);margin:0 0 16px'>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code style='background:var(--surface-2);padding:1px 4px;border-radius:3px;font-family:var(--mono);font-size:12px'>$1</code>")
    .replace(/^\&gt; (.+)$/gm, "<blockquote style='border-left:3px solid var(--purple);padding:8px 16px;margin:12px 0;background:var(--purple-soft);color:var(--ink-1);font-style:italic'>$1</blockquote>")
    .replace(/^\- (.+)$/gm, "<li style='margin:4px 0'>$1</li>")
    .replace(/^---$/gm, "<hr style='border:none;border-top:1px solid var(--line);margin:20px 0'>");
  html = html.replace(/\n\n/g, "</p><p style='margin:12px 0'>");
  html = html.replace(/^(?![<\s])(.+)$/gm, "<p style='margin:10px 0'>$1</p>");
  html = html.replace(/<p[^>]*><\/p>/g, "");
  return html;
}

// ── Articles Tab ──
function ArticlesTab({ articles, onRefresh, onSelect, setMsg }) {
  const [artPage, setArtPage] = useState(1);
  const [artPerPage, setArtPerPage] = useState(25);
  const deleteArticle = async (id) => {
    if (!confirm("Delete this article?")) return;
    await fetch("/api/blog/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ intent: "delete", articleId: id }) });
    setMsg("Article deleted.");
    onRefresh();
  };

  if (articles.length === 0) {
    return (
      <div className="card" style={{ textAlign: "center", padding: "48px 24px" }}>
        <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>No articles yet</div>
        <div style={{ color: "var(--ink-3)", fontSize: 13 }}>Go to the Generate tab to create your first article.</div>
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table className="tbl">
        <thead>
          <tr>
            <th>Keyword / Title</th>
            <th style={{ width: 90 }}>Type</th>
            <th className="right" style={{ width: 70 }}>Words</th>
            <th style={{ width: 80 }}>Status</th>
            <th style={{ width: 100 }}>Generated</th>
            <th style={{ width: 80 }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {articles.slice((artPage - 1) * artPerPage, artPage * artPerPage).map((a) => (
            <tr key={a.id}>
              <td>
                <div className="kw">{a.titleTag || a.primaryKeyword}</div>
                <div style={{ fontSize: 11, color: "var(--ink-4)", fontFamily: "var(--mono)" }}>{a.urlSlug}</div>
              </td>
              <td style={{ fontSize: 12, color: "var(--ink-3)" }}>{TYPE_LABEL[a.articleType] || a.articleType}</td>
              <td className="right mono">{a.wordCount > 0 ? a.wordCount.toLocaleString() : "--"}</td>
              <td><span className={`q-tag ${STATUS_CLS[a.status] || ""}`}>{a.status}</span></td>
              <td style={{ fontSize: 11, color: "var(--ink-4)" }}>{a.generatedAt ? new Date(a.generatedAt).toLocaleDateString() : "--"}</td>
              <td>
                <div style={{ display: "flex", gap: 4 }}>
                  <button onClick={() => onSelect(a.id)} className="btn btn-ghost" style={{ padding: "4px 8px", fontSize: 11 }}>View</button>
                  <button onClick={() => deleteArticle(a.id)} className="btn btn-ghost" style={{ padding: "4px 8px", fontSize: 11, color: "var(--danger)" }}>x</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {articles.length > artPerPage && (
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 0",fontSize:"13px",color:"var(--ink-3)"}}>
          <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
            <span>Randuri per pagina:</span>
            <select value={artPerPage} onChange={(e) => { setArtPerPage(Number(e.target.value)); setArtPage(1); }} style={{padding:"4px 8px",fontSize:"12px",borderRadius:"6px",border:"1px solid var(--line)"}}>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:"4px"}}>
            <span>{(artPage-1)*artPerPage+1}–{Math.min(artPage*artPerPage, articles.length)} din {articles.length}</span>
            <button style={{padding:"4px 8px",border:"1px solid var(--line)",borderRadius:"6px",background:"var(--surface)",cursor:"pointer"}} disabled={artPage <= 1} onClick={() => setArtPage(p => p-1)}>←</button>
            <button style={{padding:"4px 8px",border:"1px solid var(--line)",borderRadius:"6px",background:"var(--surface)",cursor:"pointer"}} disabled={artPage >= Math.ceil(articles.length/artPerPage)} onClick={() => setArtPage(p => p+1)}>→</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Clusters Tab ──
function ClustersTab({ clusters, onSync, syncing, onGenerate, setMsg }) {
  const [clPage, setClPage] = useState(1);
  const [clPerPage, setClPerPage] = useState(25);
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: "var(--ink-3)" }}>
          Topic clusters from GSC Triage — keywords where new content would improve rankings.
        </div>
        <button onClick={onSync} disabled={syncing} className="btn btn-ghost" style={{ opacity: syncing ? 0.6 : 1 }}>
          {syncing ? "Syncing..." : "Sync from GSC Triage"}
        </button>
      </div>

      {clusters.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "48px 24px" }}>
          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>No clusters yet</div>
          <div style={{ color: "var(--ink-3)", fontSize: 13 }}>Run GSC Triage in the Keywords page first, then sync here.</div>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Keyword</th>
                <th style={{ width: 90 }}>Type</th>
                <th className="right" style={{ width: 80 }}>Volume</th>
                <th style={{ width: 80 }}>Priority</th>
                <th style={{ width: 80 }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {clusters.slice((clPage - 1) * clPerPage, clPage * clPerPage).map((c) => (
                <tr key={c.id}>
                  <td className="kw">{c.primaryKeyword}</td>
                  <td style={{ fontSize: 12, color: "var(--ink-3)" }}>{TYPE_LABEL[c.articleType] || c.articleType}</td>
                  <td className="right mono">{c.estimatedVolume.toLocaleString()}</td>
                  <td><span className={`q-tag ${STATUS_CLS[c.status] || ""}`}>{c.status}</span></td>
                  <td>
                    {c.status === "pending" && (
                      <button onClick={() => onGenerate({
                        primaryKeyword: c.primaryKeyword,
                        supportingKeywords: JSON.parse(c.supportingKeywords || "[]"),
                        articleType: c.articleType,
                        targetWordCount: c.articleType === "satellite" ? 1200 : c.articleType === "listicle" ? 2000 : 2200,
                        brandVoice: "conversational_expert",
                      })} className="btn btn-primary" style={{ padding: "4px 10px", fontSize: 11 }}>Generate</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {clusters.length > clPerPage && (
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 0",fontSize:"13px",color:"var(--ink-3)"}}>
          <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
            <span>Randuri per pagina:</span>
            <select value={clPerPage} onChange={(e) => { setClPerPage(Number(e.target.value)); setClPage(1); }} style={{padding:"4px 8px",fontSize:"12px",borderRadius:"6px",border:"1px solid var(--line)"}}>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:"4px"}}>
            <span>{(clPage-1)*clPerPage+1}–{Math.min(clPage*clPerPage, clusters.length)} din {clusters.length}</span>
            <button style={{padding:"4px 8px",border:"1px solid var(--line)",borderRadius:"6px",background:"var(--surface)",cursor:"pointer"}} disabled={clPage <= 1} onClick={() => setClPage(p => p-1)}>←</button>
            <button style={{padding:"4px 8px",border:"1px solid var(--line)",borderRadius:"6px",background:"var(--surface)",cursor:"pointer"}} disabled={clPage >= Math.ceil(clusters.length/clPerPage)} onClick={() => setClPage(p => p+1)}>→</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Generate Tab ──
function GenerateTab({ clusters, hasAI, prefill, onDone, setMsg }) {
  const [screen, setScreen] = useState("brief");
  const [kw,         setKw]         = useState(prefill?.primaryKeyword || "");
  const [supporting, setSupporting] = useState((prefill?.supportingKeywords || []).join(", "));
  const [type,       setType]       = useState(prefill?.articleType || "pillar");
  const [wordCount,  setWordCount]  = useState(prefill?.targetWordCount || 2200);
  const [voice,      setVoice]      = useState(prefill?.brandVoice || "conversational_expert");
  const [language,   setLanguage]   = useState(prefill?.language || "ro");
  const [paaQuestions, setPaaQuestions] = useState([]);
  const [fetchingPaa,  setFetchingPaa]  = useState(false);
  const [paaSource,    setPaaSource]    = useState("");
  const [generating, setGenerating] = useState(false);
  const [progress,   setProgress]   = useState("");

  useEffect(() => {
    if (prefill) {
      setKw(prefill.primaryKeyword || "");
      setSupporting((prefill.supportingKeywords || []).join(", "));
      setType(prefill.articleType || "pillar");
      setWordCount(prefill.targetWordCount || 2200);
      setVoice(prefill.brandVoice || "conversational_expert");
      setPaaQuestions([]);
      if (prefill._goPaa) {
        if (prefill._paaQuestions?.length > 0) {
          setPaaQuestions(prefill._paaQuestions);
          setPaaSource("dataforseo");
          setScreen("paa");
        } else {
          setScreen("brief");
          setTimeout(() => goToPaaWithKeyword(prefill.primaryKeyword, prefill.language || "ro"), 100);
        }
      } else {
        setScreen("brief");
      }
    }
  }, [prefill]);

  async function goToPaaWithKeyword(keyword, lang) {
    if (!keyword?.trim()) return;
    setFetchingPaa(true);
    setScreen("paa");
    try {
      const resp = await fetch("/api/faq", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "preview", keyword: keyword.trim(), language: lang }),
      });
      const data = await resp.json();
      if (data.success && data.questions?.length > 0) {
        setPaaQuestions(data.questions.slice(0, 8));
        setPaaSource("dataforseo");
      } else {
        setPaaQuestions([]);
        setPaaSource("claude");
      }
    } catch {
      setPaaQuestions([]);
      setPaaSource("manual");
    }
    setFetchingPaa(false);
  }

  async function goToPaa() {
    if (!kw.trim()) { setMsg("Enter a primary keyword first."); return; }
    setFetchingPaa(true);
    setMsg("");
    try {
      const resp = await fetch("/api/faq", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "preview", keyword: kw.trim(), language }),
      });
      const data = await resp.json();
      if (data.success && data.questions?.length > 0) {
        setPaaQuestions(data.questions.slice(0, 8));
        setPaaSource("dataforseo");
      } else {
        setPaaQuestions([]);
        setPaaSource("claude");
      }
    } catch (e) {
      setPaaQuestions([]);
      setPaaSource("manual");
      setMsg(`Could not fetch PAA: ${e.message}`);
    }
    setFetchingPaa(false);
    setScreen("paa");
  }

  async function generate() {
    setGenerating(true);
    setScreen("confirm");
    setProgress("Sending brief to Claude...");
    setMsg("");
    const supportingArr  = supporting.split(",").map(s => s.trim()).filter(Boolean);
    const approvedQuestions = paaQuestions.filter(q => q.trim());
    try {
      setProgress(`Claude is writing your article${approvedQuestions.length > 0 ? ` with ${approvedQuestions.length} PAA questions` : ""} — this takes 30-60 seconds...`);
      const resp = await fetch("/api/blog/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intent: "generate", primaryKeyword: kw, supportingKeywords: supportingArr,
          articleType: type, targetWordCount: wordCount, brandVoice: voice, language,
          paaQuestions: approvedQuestions,
        }),
      });
      const data = await resp.json();
      if (data.success) {
        setProgress("");
        setMsg(`Article generated — ${data.wordCount?.toLocaleString() || "?"} words. Check the Articles tab.`);
        setScreen("brief");
        setPaaQuestions([]);
        onDone();
      } else {
        setProgress("");
        setScreen("paa");
        setMsg(`Error: ${data.error}`);
      }
    } catch (e) {
      setProgress("");
      setScreen("paa");
      setMsg(`Error: ${e.message}`);
    }
    setGenerating(false);
  }

  const wordCountOptions = {
    satellite: [1000, 1200, 1500],
    pillar:    [2500, 2800, 3200, 3500],
    default:   [1500, 1800, 2200, 2500],
  };
  const wcOpts = wordCountOptions[type] || wordCountOptions.default;

  const inputStyle = { width: "100%", padding: "8px 12px", border: "1px solid var(--line)", borderRadius: "var(--r-sm)", fontSize: 13, fontFamily: "var(--sans)", boxSizing: "border-box" };
  const selectStyle = { ...inputStyle, background: "var(--surface)" };
  const labelStyle = { display: "block", fontSize: 12, fontWeight: 500, color: "var(--ink-2)", marginBottom: 6 };

  // ── SCREEN 1: Brief ──
  if (screen === "brief") return (
    <div style={{ maxWidth: 620 }}>
      <StepBar current={1} />
      <div className="card" style={{ padding: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink-0)", marginBottom: 16 }}>Article Brief</div>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Primary keyword *</label>
          <input value={kw} onChange={e => setKw(e.target.value)} placeholder="e.g. cel mai bun kendama pentru copii" style={inputStyle} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Supporting keywords (comma separated)</label>
          <input value={supporting} onChange={e => setSupporting(e.target.value)} placeholder="e.g. kendama incepatori, kendama lemn" style={inputStyle} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
          <div>
            <label style={labelStyle}>Article type</label>
            <select value={type} onChange={e => { const t = e.target.value; setType(t); const def = { pillar: 2800, satellite: 1200, listicle: 1800, howto: 1800, comparison: 2200 }; setWordCount(def[t] || 2200); }} style={selectStyle}>
              <option value="pillar">Pillar (2500-3500w)</option>
              <option value="satellite">Satellite (1000-1500w)</option>
              <option value="listicle">Listicle / Best-of</option>
              <option value="howto">How-to / Tutorial</option>
              <option value="comparison">Comparison / Versus</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Target word count</label>
            <select value={wordCount} onChange={e => setWordCount(Number(e.target.value))} style={selectStyle}>
              {wcOpts.map(w => <option key={w} value={w}>{w.toLocaleString()} words</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
          <div>
            <label style={labelStyle}>Brand voice</label>
            <select value={voice} onChange={e => setVoice(e.target.value)} style={selectStyle}>
              <option value="conversational_expert">Conversational Expert</option>
              <option value="professional">Professional</option>
              <option value="friendly">Friendly</option>
              <option value="expert">Expert</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Language</label>
            <select value={language} onChange={e => setLanguage(e.target.value)} style={selectStyle}>
              <option value="ro">Romanian</option>
              <option value="en">English</option>
            </select>
          </div>
        </div>
        {prefill && <div className="alert-banner ok">Pre-filled from <strong>{prefill.primaryKeyword}</strong> — review and adjust if needed.</div>}
        <button onClick={goToPaa} disabled={fetchingPaa || !hasAI || !kw.trim()} className="btn btn-primary" style={{ width: "100%", padding: 12, fontSize: 14, opacity: (fetchingPaa || !hasAI || !kw.trim()) ? 0.5 : 1 }}>
          {fetchingPaa ? "Fetching PAA questions from Google..." : "Continue - Fetch PAA Questions"}
        </button>
      </div>
    </div>
  );

  // ── SCREEN 2: PAA Questions ──
  if (screen === "paa") return (
    <div style={{ maxWidth: 620 }}>
      <StepBar current={2} />
      <div className="card" style={{ padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink-0)" }}>PAA Questions for "{kw}"</div>
            <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>
              {paaSource === "dataforseo"
                ? `${paaQuestions.length} questions from Google PAA (real search data)`
                : paaSource === "claude"
                ? "No PAA data found — Claude will generate FAQ questions automatically during article generation"
                : "Add questions manually below"}
            </div>
          </div>
          <button onClick={goToPaa} disabled={fetchingPaa} className="btn btn-ghost" style={{ fontSize: 11 }}>
            {fetchingPaa ? "..." : "Re-fetch"}
          </button>
        </div>

        {paaQuestions.length === 0 && paaSource !== "manual" ? (
          <div className="alert-banner warn" style={{ marginBottom: 16 }}>
            <b>No PAA questions found.</b> This can happen when DataForSEO is not configured or the keyword has limited search data. Claude will auto-generate relevant FAQ questions during article generation. You can also add questions manually below.
          </div>
        ) : (
          <div style={{ marginBottom: 12 }}>
            {paaQuestions.map((q, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                <div style={{ width: 22, height: 22, borderRadius: "50%", background: "var(--info-soft)", color: "var(--info)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{i + 1}</div>
                <input value={q} onChange={e => setPaaQuestions(prev => prev.map((x, j) => j === i ? e.target.value : x))} style={{ ...inputStyle, flex: 1 }} placeholder="Question..." />
                <button onClick={() => setPaaQuestions(prev => prev.filter((_, j) => j !== i))} style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer", fontSize: 18, padding: "0 2px", flexShrink: 0, lineHeight: 1 }} title="Remove question">x</button>
              </div>
            ))}
          </div>
        )}

        <button onClick={() => setPaaQuestions(prev => [...prev, ""])} className="btn btn-ghost" style={{ marginBottom: 20, fontSize: 12 }}>+ Add question manually</button>

        <div className="alert-banner info" style={{ marginBottom: 20 }}>
          <b>These questions will appear in the article's FAQ section and FAQPage schema.</b> Approved questions are inserted in article body + JSON-LD schema, helping Google AI Overviews + featured snippets.
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => setScreen("brief")} className="btn btn-ghost" style={{ padding: "10px 18px" }}>Back</button>
          <button onClick={generate} disabled={generating || !hasAI} className="btn btn-primary" style={{ flex: 1, padding: 12, fontSize: 14, opacity: (generating || !hasAI) ? 0.5 : 1 }}>
            {paaQuestions.filter(q => q.trim()).length > 0
              ? `Generate Article with ${paaQuestions.filter(q => q.trim()).length} FAQ Questions`
              : "Generate Article (no FAQ)"}
          </button>
        </div>
      </div>
    </div>
  );

  // ── SCREEN 3: Generating ──
  return (
    <div style={{ maxWidth: 620 }}>
      <div className="card" style={{ textAlign: "center", padding: "48px 24px" }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: "var(--ink-0)", marginBottom: 8 }}>Generating Article</div>
        <div style={{ fontSize: 13, color: "var(--ink-3)", maxWidth: 400, margin: "0 auto", lineHeight: 1.6 }}>{progress}</div>
        <div className="alert-banner info" style={{ marginTop: 24, textAlign: "left" }}>
          <div><b>What Claude is doing:</b></div>
          <ul style={{ margin: "8px 0 0 16px", lineHeight: 1.8 }}>
            <li>Writing {wordCount.toLocaleString()}+ words ({type} article)</li>
            {paaQuestions.filter(q=>q.trim()).length > 0 && <li>Using {paaQuestions.filter(q=>q.trim()).length} PAA questions for FAQ section</li>}
            <li>Generating FAQPage + BlogPosting schema</li>
            <li>Creating internal link map + image brief</li>
            <li>SEO title, meta description, URL slug</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function StepBar({ current }) {
  const steps = [["1", "Brief"], ["2", "PAA Questions"], ["3", "Generate"]];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 24 }}>
      {steps.map(([n, label], i) => (
        <div key={n} style={{ display: "flex", alignItems: "center", flex: i < 2 ? 1 : 0 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: Number(n) <= current ? "var(--accent)" : "var(--surface-3)", color: Number(n) <= current ? "#fff" : "var(--ink-4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 }}>
              {Number(n) < current ? "OK" : n}
            </div>
            <span style={{ fontSize: 11, color: Number(n) === current ? "var(--accent)" : "var(--ink-4)", fontWeight: Number(n) === current ? 600 : 400, whiteSpace: "nowrap" }}>{label}</span>
          </div>
          {i < 2 && <div style={{ flex: 1, height: 2, background: Number(n) < current ? "var(--accent)" : "var(--line)", margin: "0 8px", marginBottom: 16 }} />}
        </div>
      ))}
    </div>
  );
}

// ── Article Preview Modal ──
function ArticleModal({ articleId, onClose, onRefresh, setMsg }) {
  const [article,    setArticle]    = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [view,       setView]       = useState("content");
  const [blogError,  setBlogError]  = useState("");

  useEffect(() => {
    fetch("/api/blog/generate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intent: "get", articleId }),
    }).then((r) => r.json()).then((d) => { if (d.success) setArticle(d.article); setLoading(false); });
  }, [articleId]);

  const publish = async () => {
    setPublishing(true);
    setBlogError("");
    const resp = await fetch("/api/blog/generate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intent: "publish", articleId }),
    });
    const data = await resp.json();
    if (data.success) {
      setMsg("Article published to Shopify Blog!");
      onRefresh();
      onClose();
    } else {
      if (data.error?.includes("No blog") || data.error?.includes("no article") || data.error?.includes("userErrors") || data.error?.includes("blog")) {
        setBlogError("no_blog");
      } else {
        setMsg(`Publish error: ${data.error}`);
      }
    }
    setPublishing(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "var(--surface)", borderRadius: "var(--r-lg)", width: "100%", maxWidth: 860, maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Modal header */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink-0)" }}>
            {loading ? "Loading..." : article?.titleTag || article?.primaryKeyword}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {article?.status === "review" && <ScheduleButton article={article} onScheduled={() => {}} />}
            <RelinkButton article={article} onDone={(result) => setMsg(`${result.linksAdded} internal link${result.linksAdded !== 1 ? "s" : ""} added`)} />
            {article?.status === "review" && (
              <button onClick={publish} disabled={publishing} className="btn btn-primary" style={{ fontSize: 12, opacity: publishing ? 0.6 : 1 }}>
                {publishing ? "Publishing..." : "Publish to Shopify"}
              </button>
            )}
            <button onClick={onClose} className="btn btn-ghost" style={{ fontSize: 12 }}>Close</button>
          </div>
        </div>

        {blogError === "no_blog" && (
          <div className="alert-banner warn" style={{ margin: "0 20px", marginTop: 14 }}>
            <b>No blog found in your Shopify store.</b> Create a blog in Shopify Admin &rarr; Online Store &rarr; Blog Posts &rarr; Manage blogs &rarr; Add blog. Then try again.
          </div>
        )}

        {/* View switcher */}
        <div className="tabs-bar" style={{ padding: "0 20px", marginBottom: 0 }}>
          {[["content", "Article"], ["meta", "SEO Fields"], ["schema", "Schema"], ["image", "Banner Image"], ["install", "Theme Install"]].map(([k, l]) => (
            <button key={k} onClick={() => setView(k)} className={`tab ${view === k ? "active" : ""}`}>{l}</button>
          ))}
        </div>

        {/* Modal content */}
        <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
          {loading && <div style={{ textAlign: "center", padding: 40, color: "var(--ink-4)" }}>Loading article...</div>}

          {!loading && article && view === "content" && (
            <div style={{ fontSize: 14, lineHeight: 1.8, color: "var(--ink-1)" }}
              dangerouslySetInnerHTML={{ __html: renderMarkdown(article.content || "No content generated.") }}
            />
          )}

          {!loading && article && view === "meta" && (
            <SeoFieldsTab article={article} onSaved={(updated) => setArticle(a => ({ ...a, ...updated }))} />
          )}

          {!loading && article && view === "image" && (
            <ImageBannerTab article={article} />
          )}

          {!loading && article && view === "install" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div className="alert-banner info">
                <b>Schema is applied automatically on publish.</b> Your theme must render the metafield <code>kimono.schema_json</code> in the head for Google to read it.
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-0)", marginBottom: 8 }}>Step 1 — Add snippet to your theme</div>
                <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 8 }}>
                  Go to <strong>Shopify Admin &rarr; Themes &rarr; Edit code &rarr; sections/main-article.liquid</strong> and add before closing article tag:
                </div>
                <div className="code-wrap">
                  <pre>{`{% if article.metafields.kimono.schema_json != blank %}
  <script type="application/ld+json">
    {{ article.metafields.kimono.schema_json.value | json }}
  </script>
{% endif %}`}</pre>
                </div>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-0)", marginBottom: 8 }}>Step 2 — Publish the article</div>
                <div style={{ fontSize: 12, color: "var(--ink-3)", lineHeight: 1.6 }}>
                  Click <strong>Publish to Shopify</strong> above. Kimono will create the article, save schema as metafield, and submit to IndexNow.
                </div>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-0)", marginBottom: 8 }}>Schema per article type</div>
                <div className="table-wrap">
                  <table className="tbl">
                    <thead><tr><th>Type</th><th>Schema</th></tr></thead>
                    <tbody>
                      {[
                        ["Pillar / Satellite",  "BlogPosting + FAQPage"],
                        ["Listicle / Best-of",  "BlogPosting + FAQPage + ItemList"],
                        ["How-to / Tutorial",   "BlogPosting + FAQPage + HowTo"],
                        ["Comparison",          "BlogPosting + FAQPage"],
                      ].map(([tp, schema]) => (
                        <tr key={tp}><td style={{ fontWeight: 500 }}>{tp}</td><td className="mono">{schema}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-0)", marginBottom: 8 }}>Step 3 — Validate</div>
                <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
                  After publishing, test at: <a href="https://search.google.com/test/rich-results" target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>search.google.com/test/rich-results</a>
                </div>
              </div>
            </div>
          )}

          {!loading && article && view === "schema" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-3)", textTransform: "uppercase", marginBottom: 6 }}>FAQPage Schema</div>
                <div className="code-wrap"><pre>{article.faqSchema ? JSON.stringify(JSON.parse(article.faqSchema), null, 2) : "Not generated"}</pre></div>
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-3)", textTransform: "uppercase", marginBottom: 6 }}>BlogPosting Schema</div>
                {article.blogPostingSchema && article.blogPostingSchema !== "{}" ? (
                  <div className="code-wrap"><pre>{JSON.stringify(JSON.parse(article.blogPostingSchema), null, 2)}</pre></div>
                ) : (
                  <div className="alert-banner ok">BlogPosting + FAQPage + ItemList schema is generated automatically on Publish.</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Recommendations Tab ──
function RecommendationsTab({ hasAI, onGenerate, onGenerateWithPaa, setMsg }) {
  const [recs,       setRecs]       = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [generating, setGenerating] = useState(false);
  const [filter,     setFilter]     = useState("pending");

  const loadRecs = useCallback(async (status = "pending") => {
    setLoading(true);
    try {
      const resp = await fetch("/api/blog/recommend", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ intent: "list_recommendations", status }) });
      const data = await resp.json();
      if (data.success) setRecs(data.recommendations);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { loadRecs(filter); }, [filter, loadRecs]);

  const generateRecs = async () => {
    setGenerating(true);
    setMsg("");
    const resp = await fetch("/api/blog/recommend", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ intent: "generate_recommendations" }) });
    const data = await resp.json();
    if (data.success) { setMsg(`Generated ${data.saved} new recommendations.`); loadRecs(filter); }
    else { setMsg(`Error: ${data.error}`); }
    setGenerating(false);
  };

  const accept = async (rec) => {
    const resp = await fetch("/api/blog/recommend", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ intent: "accept", recId: rec.id }) });
    const data = await resp.json();
    if (data.success) { setMsg(`"${rec.primaryKeyword}" — brief loaded in Generate tab.`); onGenerate(data.brief); loadRecs(filter); }
  };

  const acceptWithPaa = async (rec) => {
    const resp = await fetch("/api/blog/recommend", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ intent: "accept", recId: rec.id }) });
    const data = await resp.json();
    if (data.success) { setMsg(`"${rec.primaryKeyword}" — fetching PAA questions...`); onGenerateWithPaa(data.brief); loadRecs(filter); }
  };

  const dismiss = async (id) => {
    await fetch("/api/blog/recommend", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ intent: "dismiss", recId: id }) });
    loadRecs(filter);
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink-0)" }}>AI Recommendations</div>
          <div style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 2 }}>Claude analyzes your GSC Triage data and product catalog to recommend what to write next.</div>
        </div>
        <button onClick={generateRecs} disabled={generating || !hasAI} className="btn btn-primary" style={{ opacity: (generating || !hasAI) ? 0.5 : 1 }}>
          {generating ? "Analyzing..." : "Generate recommendations"}
        </button>
      </div>

      <div className="chip-group" style={{ marginBottom: 16 }}>
        {[["pending", "Pending"], ["accepted", "Accepted"], ["dismissed", "Dismissed"]].map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} className={`chip ${filter === k ? "active" : ""}`}>{l}</button>
        ))}
      </div>

      {loading && <div style={{ textAlign: "center", padding: 40, color: "var(--ink-4)" }}>Loading...</div>}

      {!loading && recs.length === 0 && (
        <div className="card" style={{ textAlign: "center", padding: "48px 24px" }}>
          {filter === "pending" ? "No recommendations yet. Click \"Generate recommendations\" to let Claude analyze your data." : `No ${filter} recommendations.`}
        </div>
      )}

      {!loading && recs.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {recs.map((r) => {
            const supporting = JSON.parse(r.supportingKeywords || "[]");
            return (
              <div key={r.id} className="card" style={{ padding: "16px 20px" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 15, fontWeight: 600, color: "var(--ink-0)" }}>{r.primaryKeyword}</span>
                      <span className="q-tag info">{TYPE_LABEL[r.articleType] || r.articleType}</span>
                      <span className={`q-tag ${r.estimatedImpact === "high" ? "warn" : ""}`}>{r.estimatedImpact} impact</span>
                      <span style={{ fontSize: 11, color: "var(--ink-4)" }}>Score: {r.priorityScore.toFixed(1)}</span>
                    </div>
                    <div style={{ fontSize: 13, color: "var(--ink-1)", lineHeight: 1.5, marginBottom: 10 }}>{r.rationale}</div>
                    <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12, color: "var(--ink-3)" }}>
                      <span>{r.targetWordCount.toLocaleString()} words</span>
                      <span>{r.brandVoice.replace(/_/g, " ")}</span>
                      {r.suggestedDate && <span>Suggested: {new Date(r.suggestedDate).toLocaleDateString()}</span>}
                      {supporting.length > 0 && <span>+ {supporting.slice(0, 3).join(", ")}{supporting.length > 3 ? "..." : ""}</span>}
                    </div>
                  </div>
                  {filter === "pending" && (
                    <div style={{ display: "flex", gap: 6, flexShrink: 0, flexDirection: "column", alignItems: "flex-end" }}>
                      <button onClick={() => acceptWithPaa(r)} className="btn btn-primary" style={{ fontSize: 12 }}>Accept + Fetch PAA</button>
                      <button onClick={() => accept(r)} className="btn btn-ghost" style={{ fontSize: 11 }}>Accept (skip PAA)</button>
                      <button onClick={() => dismiss(r.id)} className="btn btn-ghost" style={{ fontSize: 11, color: "var(--ink-4)" }}>Dismiss</button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Calendar Tab ──
function CalendarTab({ articles, setMsg, onRefresh }) {
  const today = new Date();
  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [calData, setCalData] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadCalendar = useCallback(async (y, m) => {
    setLoading(true);
    try {
      const resp = await fetch("/api/blog/recommend", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ intent: "calendar", year: y, month: m }) });
      const data = await resp.json();
      if (data.success) setCalData(data.calendarMap);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { loadCalendar(year, month); }, [year, month, loadCalendar]);

  const prevMonth = () => { if (month === 0) { setYear(y => y - 1); setMonth(11); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 11) { setYear(y => y + 1); setMonth(0); } else setMonth(m => m + 1); };

  const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const DAY_NAMES   = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

  const firstDay = new Date(year, month, 1);
  const lastDay  = new Date(year, month + 1, 0);
  const startDow = (firstDay.getDay() + 6) % 7;
  const totalDays = lastDay.getDate();

  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= totalDays; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const todayStr = today.toISOString().split("T")[0];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={prevMonth} className="btn btn-ghost" style={{ padding: "6px 12px" }}>&#8592;</button>
          <span style={{ fontSize: 18, fontWeight: 600, color: "var(--ink-0)", minWidth: 160, textAlign: "center" }}>{MONTH_NAMES[month]} {year}</span>
          <button onClick={nextMonth} className="btn btn-ghost" style={{ padding: "6px 12px" }}>&#8594;</button>
        </div>
      </div>

      {loading && <div style={{ textAlign: "center", padding: 40, color: "var(--ink-4)" }}>Loading calendar...</div>}

      {!loading && (
        <div className="table-wrap">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", background: "var(--surface-2)", borderBottom: "1px solid var(--line)" }}>
            {DAY_NAMES.map((d) => (
              <div key={d} style={{ padding: 8, textAlign: "center", fontSize: 11, fontWeight: 600, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: ".05em" }}>{d}</div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
            {cells.map((day, idx) => {
              if (!day) return <div key={`empty-${idx}`} style={{ minHeight: 90, background: "var(--surface-2)", borderBottom: "1px solid var(--line)", borderRight: idx % 7 !== 6 ? "1px solid var(--line)" : "none" }} />;
              const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const isToday = dateStr === todayStr;
              const dayData = calData?.[dateStr];
              return (
                <div key={dateStr} style={{ minHeight: 90, padding: "6px 8px", background: isToday ? "var(--purple-soft)" : "var(--surface)", borderBottom: "1px solid var(--line)", borderRight: idx % 7 !== 6 ? "1px solid var(--line)" : "none", borderLeft: isToday ? "2px solid var(--purple)" : "none" }}>
                  <div style={{ fontSize: 12, fontWeight: isToday ? 700 : 500, color: isToday ? "var(--purple)" : "var(--ink-1)", marginBottom: 4 }}>{day}</div>
                  {dayData?.articles?.map((a) => (
                    <div key={a.id} style={{ fontSize: 10, padding: "2px 5px", borderRadius: 3, marginBottom: 3, background: "var(--purple-soft)", color: "var(--purple)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={a.titleTag || a.primaryKeyword}>
                      {a.primaryKeyword}
                    </div>
                  ))}
                  {dayData?.recommendations?.map((r) => (
                    <div key={r.id} style={{ fontSize: 10, padding: "2px 5px", borderRadius: 3, marginBottom: 3, background: "var(--surface-2)", color: "var(--ink-3)", border: "1px dashed var(--line-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.primaryKeyword}>
                      {r.primaryKeyword}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!loading && calData && (
        <div style={{ marginTop: 16, display: "flex", gap: 16, flexWrap: "wrap" }}>
          {[
            { label: "Articles scheduled", count: Object.values(calData).reduce((s, d) => s + (d.articles?.length || 0), 0) },
            { label: "Recommendations", count: Object.values(calData).reduce((s, d) => s + (d.recommendations?.length || 0), 0) },
          ].map((s) => (
            <div key={s.label} style={{ fontSize: 13, color: "var(--ink-3)" }}>
              <span style={{ fontWeight: 700, color: "var(--ink-0)", fontSize: 18 }}>{s.count}</span> {s.label} this month
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Image Banner Tab ──
function ImageBannerTab({ article }) {
  const [productImg,      setProductImg]      = useState("");
  const [productDesc,     setProductDesc]     = useState("");
  const [category,        setCategory]        = useState("general");
  const [width,           setWidth]           = useState(1200);
  const [height,          setHeight]          = useState(630);
  const [matchedProducts, setMatchedProducts] = useState([]);
  const [findingProduct,  setFindingProduct]  = useState(false);
  const [productFound,    setProductFound]    = useState(false);
  const [imgSrc,          setImgSrc]          = useState(null);
  const [imgLoading,      setImgLoading]      = useState(false);
  const [imgError,        setImgError]        = useState(false);
  const [generating,      setGenerating]      = useState(false);
  const [genError,        setGenError]        = useState("");
  const [altText,         setAltText]         = useState("");
  const [applied,         setApplied]         = useState(false);
  const [prompt,          setPrompt]          = useState("");

  const PRESETS = [
    { label: "Blog 16:9", w: 1200, h: 630 },
    { label: "Square",    w: 1080, h: 1080 },
    { label: "Wide 2:1",  w: 1600, h: 800 },
    { label: "OG Image",  w: 1200, h: 628 },
  ];

  const categories = [
    ["general","General"],["apparel","Apparel"],["electronics","Electronics"],
    ["home","Home & Kitchen"],["beauty","Beauty"],["outdoor","Outdoor"],
    ["pets","Pets"],["food","Food"],["toys","Toys"],
  ];

  useEffect(() => {
    if (!article?.id) return;
    setFindingProduct(true);
    fetch("/api/blog/banner", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ intent: "find_product_image", articleId: article.id }) })
      .then((r) => r.json())
      .then((data) => { if (data.success && data.found) { setMatchedProducts(data.products); setProductImg(data.bestMatch.imageUrl); setProductDesc(data.bestMatch.title); setProductFound(true); } })
      .catch(console.error)
      .finally(() => setFindingProduct(false));
  }, [article?.id]);

  const FALLBACK_SERVICES = [
    (p, w, h) => `https://image.pollinations.ai/prompt/${encodeURIComponent(p)}?width=${w}&height=${h}&nologo=true&seed=${Math.floor(Math.random()*9999)}`,
    (p, w, h) => `https://image.pollinations.ai/prompt/${encodeURIComponent(p)}?width=${w}&height=${h}&nologo=true&model=flux&seed=${Math.floor(Math.random()*9999)}`,
  ];

  const generate = async () => {
    setGenerating(true); setGenError(""); setImgSrc(null); setImgError(false); setApplied(false);
    try {
      const resp = await fetch("/api/blog/banner", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ intent: "generate_banner_prompt", articleId: article.id, productImageUrl: productImg, productDescription: productDesc, productCategory: category, width, height }) });
      const data = await resp.json();
      if (!data.success) throw new Error(data.error);
      setPrompt(data.banner.imagePrompt);
      setAltText(data.banner.altText || article.primaryKeyword);
      setImgSrc(FALLBACK_SERVICES[0](data.banner.imagePrompt, width, height));
      setImgLoading(true);
    } catch (e) { setGenError(e.message); }
    setGenerating(false);
  };

  const regenerate = () => { setImgError(false); setImgLoading(true); setImgSrc(FALLBACK_SERVICES[1](prompt || article.primaryKeyword + " product banner ecommerce", width, height)); };

  const inputStyle = { width: "100%", padding: "8px 12px", border: "1px solid var(--line)", borderRadius: "var(--r-sm)", fontSize: 13, fontFamily: "var(--sans)", boxSizing: "border-box" };
  const selectStyle = { ...inputStyle, background: "var(--surface)" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {findingProduct && <div style={{ fontSize: 12, color: "var(--ink-3)" }}>Searching for matching products...</div>}
      {!findingProduct && productFound && (
        <div className="alert-banner ok">
          <b>{matchedProducts.length} matching product{matchedProducts.length > 1 ? "s" : ""} found</b>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            {matchedProducts.map((p) => (
              <div key={p.id} onClick={() => { setProductImg(p.imageUrl); setProductDesc(p.title); setImgSrc(null); setApplied(false); }}
                style={{ cursor: "pointer", border: productImg === p.imageUrl ? "2px solid var(--accent)" : "1px solid var(--line)", borderRadius: "var(--r-sm)", overflow: "hidden", background: "var(--surface)", width: 80, flexShrink: 0 }}>
                <img src={p.imageUrl} alt={p.title} style={{ width: 80, height: 80, objectFit: "cover", display: "block" }} onError={(e) => e.target.style.display="none"} />
                <div style={{ fontSize: 9, color: "var(--ink-1)", padding: "3px 4px", textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title.slice(0,15)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--ink-2)", marginBottom: 6 }}>Category</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)} style={selectStyle}>
            {categories.map(([v,l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--ink-2)", marginBottom: 6 }}>Dimensions</label>
          <div className="chip-group" style={{ marginBottom: 6 }}>
            {PRESETS.map((p) => (
              <button key={p.label} onClick={() => { setWidth(p.w); setHeight(p.h); setImgSrc(null); }} className={`chip ${width===p.w && height===p.h ? "active" : ""}`} style={{ fontSize: 10, padding: "3px 7px" }}>
                {p.label}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <input type="number" value={width} onChange={(e) => { setWidth(Number(e.target.value)); setImgSrc(null); }} style={{ ...inputStyle, width: 65, padding: "4px 6px", fontSize: 12 }} />
            <span style={{ color: "var(--ink-4)" }}>x</span>
            <input type="number" value={height} onChange={(e) => { setHeight(Number(e.target.value)); setImgSrc(null); }} style={{ ...inputStyle, width: 65, padding: "4px 6px", fontSize: 12 }} />
          </div>
        </div>
      </div>

      <button onClick={generate} disabled={generating} className="btn btn-primary" style={{ padding: 11, fontSize: 14, opacity: generating ? 0.5 : 1 }}>
        {generating ? "Generating..." : "Generate image thumbnail"}
      </button>

      {genError && <div className="alert-banner warn">Error: {genError}</div>}

      {imgSrc && (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "10px 14px", background: "var(--surface-2)", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-1)" }}>
              {imgLoading ? "Generating..." : applied ? "Applied to article" : `${width}x${height}px`}
            </span>
            <div style={{ display: "flex", gap: 6 }}>
              {!imgLoading && !imgError && (
                <a href={imgSrc} download={`${article.urlSlug || "banner"}.jpg`} target="_blank" rel="noreferrer" className="btn btn-ghost" style={{ fontSize: 11, padding: "4px 10px", textDecoration: "none" }}>Download</a>
              )}
              {!imgLoading && !imgError && article.shopifyArticleId && (
                <button onClick={async () => {
                  const resp = await fetch("/api/blog/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ intent: "apply_image", articleId: article.id, imageUrl: imgSrc, altText }) });
                  const data = await resp.json();
                  if (data.success) setApplied(true); else alert(`Error: ${data.error}`);
                }} className="btn btn-primary" style={{ fontSize: 11, padding: "4px 10px" }}>
                  {applied ? "Applied" : "Set as featured image"}
                </button>
              )}
              <button onClick={regenerate} disabled={imgLoading} className="btn btn-ghost" style={{ fontSize: 11, padding: "4px 10px" }}>Regenerate</button>
            </div>
          </div>
          <div style={{ padding: 12 }}>
            <img src={imgSrc} alt={altText} onLoad={() => setImgLoading(false)} onError={() => { setImgLoading(false); setImgError(true); }} style={{ maxWidth: "100%", maxHeight: 380, objectFit: "contain", borderRadius: "var(--r-sm)", display: imgError ? "none" : "block", margin: "0 auto" }} />
            {imgError && (
              <div style={{ padding: 20, color: "var(--ink-4)", fontSize: 13, textAlign: "center" }}>
                Image generation failed. <button onClick={regenerate} style={{ color: "var(--accent)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", fontFamily: "inherit" }}>Try again</button>
              </div>
            )}
            {!imgLoading && !imgError && (
              <div style={{ marginTop: 10 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4, display: "block" }}>Alt text</label>
                <input value={altText} onChange={(e) => setAltText(e.target.value)} style={inputStyle} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── SEO Fields Tab ──
function SeoFieldsTab({ article, onSaved }) {
  const [fields, setFields] = useState({
    titleTag: article.titleTag || "", metaDescription: article.metaDescription || "",
    urlSlug: article.urlSlug || "", h1: article.h1 || "",
  });
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const resp = await fetch("/api/blog/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ intent: "update_seo", articleId: article.id, ...fields }) });
      const data = await resp.json();
      if (data.success) { setSaved(true); onSaved?.(fields); setTimeout(() => setSaved(false), 2000); }
    } finally { setSaving(false); }
  };

  const inputStyle = { width: "100%", padding: "8px 12px", border: "1px solid var(--line)", borderRadius: "var(--r-sm)", fontSize: 13, fontFamily: "var(--sans)", boxSizing: "border-box" };

  const fieldDefs = [
    { key: "titleTag", label: "Title tag", hint: `${fields.titleTag.length}/60 chars`, mono: false, rows: 1 },
    { key: "metaDescription", label: "Meta description", hint: `${fields.metaDescription.length}/160 chars`, mono: false, rows: 2 },
    { key: "urlSlug", label: "URL slug", hint: "kebab-case, no spaces", mono: true, rows: 1 },
    { key: "h1", label: "H1 heading", hint: "Visible article title", mono: false, rows: 1 },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {fieldDefs.map(({ key, label, hint, mono, rows }) => (
        <div key={key}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: ".05em" }}>{label}</label>
            <span style={{ fontSize: 10, color: "var(--ink-4)" }}>{hint}</span>
          </div>
          {rows > 1 ? (
            <textarea value={fields[key]} onChange={e => setFields(f => ({ ...f, [key]: e.target.value }))} rows={rows}
              style={{ ...inputStyle, fontFamily: mono ? "var(--mono)" : "var(--sans)", resize: "vertical" }} />
          ) : (
            <input value={fields[key]} onChange={e => setFields(f => ({ ...f, [key]: e.target.value }))}
              style={{ ...inputStyle, fontFamily: mono ? "var(--mono)" : "var(--sans)" }} />
          )}
        </div>
      ))}
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={save} disabled={saving} className={`btn ${saved ? "btn-ghost" : "btn-primary"}`} style={{ opacity: saving ? 0.5 : 1 }}>
          {saving ? "Saving..." : saved ? "Saved" : "Save changes"}
        </button>
      </div>
      <div style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 6 }}>Word count</div>
        <div style={{ fontSize: 13, color: "var(--ink-0)" }}>{article.wordCount?.toLocaleString() || "--"} words</div>
      </div>
    </div>
  );
}

// ── Schedule Button ──
function ScheduleButton({ article, onScheduled }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(article.scheduledDate ? new Date(article.scheduledDate).toISOString().split("T")[0] : "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await fetch("/api/blog/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ intent: "schedule", articleId: article.id, scheduledDate: date || null }) });
      setSaved(true); onScheduled?.(date); setTimeout(() => { setSaved(false); setOpen(false); }, 1500);
    } finally { setSaving(false); }
  };

  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOpen(o => !o)} className="btn btn-ghost" style={{ fontSize: 12 }}>
        {date ? `Scheduled: ${date}` : "Schedule"}
      </button>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--r)", boxShadow: "0 8px 24px rgba(0,0,0,0.12)", padding: 14, zIndex: 100, minWidth: 220 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-1)", marginBottom: 8 }}>Schedule publication date</div>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} min={new Date().toISOString().split("T")[0]}
            style={{ width: "100%", padding: "7px 10px", border: "1px solid var(--line)", borderRadius: "var(--r-sm)", fontSize: 13, fontFamily: "var(--sans)", boxSizing: "border-box", marginBottom: 8 }} />
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={save} disabled={saving} className={`btn ${saved ? "btn-ghost" : "btn-primary"}`} style={{ flex: 1, fontSize: 12 }}>
              {saving ? "..." : saved ? "Saved" : "Save"}
            </button>
            {date && <button onClick={() => { setDate(""); save(); }} className="btn btn-ghost" style={{ fontSize: 12, color: "var(--danger)" }}>Clear</button>}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Relink Button ──
function RelinkButton({ article, onDone }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const relink = async () => {
    setLoading(true); setResult(null);
    try {
      const resp = await fetch("/api/blog/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ intent: "relink", articleId: article.id }) });
      const data = await resp.json();
      setResult(data);
      if (data.success) onDone?.(data);
    } catch (e) { setResult({ success: false, error: e.message }); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ position: "relative" }}>
      <button onClick={relink} disabled={loading} title="Find and insert internal links" className="btn btn-ghost" style={{ fontSize: 12, opacity: loading ? 0.5 : 1 }}>
        {loading ? "Linking..." : "Apply links"}
      </button>
      {result && !loading && (
        <div className={`alert-banner ${result.success ? "ok" : "warn"}`} style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 100, minWidth: 200, whiteSpace: "nowrap", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
          {result.success
            ? `${result.linksAdded} link${result.linksAdded !== 1 ? "s" : ""} added`
            : `Error: ${result.error}`}
        </div>
      )}
    </div>
  );
}
