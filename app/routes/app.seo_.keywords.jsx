// app/routes/app.seo_.keywords.jsx
// Kimono SEO — SEO Keywords Page

import { useLoaderData, useNavigate, useFetcher } from "react-router";
import { useState, useCallback, useEffect, useRef } from "react";
import prisma from "../db.server.js";
import { requireAuth } from "../lib/auth/index.server.js";

export const action = async ({ request }) => {
  const { storeId } = await requireAuth(request);
  if (!storeId) return { success: false };
  const body   = await request.json().catch(() => ({}));
  const { intent, proposalId } = body;

  if (intent === "approve") {
    await prisma.seoTaxonomyProposal.update({ where: { id: proposalId }, data: { status: "APPROVED" } });
    return { success: true };
  }
  if (intent === "reject") {
    await prisma.seoTaxonomyProposal.update({ where: { id: proposalId }, data: { status: "REJECTED" } });
    return { success: true };
  }
  if (intent === "approve_all") {
    await prisma.seoTaxonomyProposal.updateMany({ where: { storeId, status: "PENDING" }, data: { status: "APPROVED" } });
    return { success: true };
  }
  if (intent === "deduplicate") {
    const allActive = await prisma.seoTaxonomyProposal.findMany({
      where: { storeId, status: { in: ["PENDING", "APPROVED"] } },
      select: { id: true, proposedHandle: true, proposedVolume: true, affectedCount: true, status: true },
      orderBy: [{ proposedVolume: "desc" }, { affectedCount: "desc" }],
    });
    const handleSeen = new Map();
    const keepIds = new Set();
    for (const p of allActive) {
      const h = p.proposedHandle || "";
      if (!handleSeen.has(h)) { handleSeen.set(h, p.id); keepIds.add(p.id); }
    }
    const toReject = allActive.filter(p => !keepIds.has(p.id)).map(p => p.id);
    if (toReject.length > 0) {
      await prisma.seoTaxonomyProposal.updateMany({ where: { id: { in: toReject } }, data: { status: "REJECTED" } });
    }
    return { success: true, rejected: toReject.length, kept: keepIds.size };
  }
  if (intent === "restore") {
    await prisma.seoTaxonomyProposal.update({ where: { id: proposalId }, data: { status: "PENDING" } });
    return { success: true };
  }
  return { success: false, error: "Unknown intent" };
};

export const loader = async ({ request }) => {
  const { connection, storeId } = await requireAuth(request);
  const shopId = connection?.shopDomain || "";
  const rawCandidates = await prisma.seoCandidate.findMany({
    where:   { storeId, enrichedAt: { not: null } },
    orderBy: { score: "desc" },
    take:    5000,
    select: {
      id: true, keyword: true, keywordNorm: true, productTitle: true, productId: true,
      volume: true, difficulty: true, cpc: true, competition: true,
      serpFeatures: true, paaCount: true, score: true,
    },
  });

  const kwMap = new Map();
  for (const c of rawCandidates) {
    const key = c.keywordNorm || c.keyword.toLowerCase().trim();
    if (!kwMap.has(key)) {
      kwMap.set(key, { ...c, productCount: 1, productTitles: [c.productTitle] });
    } else {
      const ex = kwMap.get(key);
      ex.productCount++;
      if (c.productTitle && !ex.productTitles.includes(c.productTitle)) ex.productTitles.push(c.productTitle);
      if ((c.score || 0) > (ex.score || 0)) Object.assign(ex, { id: c.id, volume: c.volume, difficulty: c.difficulty, cpc: c.cpc, competition: c.competition, serpFeatures: c.serpFeatures, paaCount: c.paaCount, score: c.score });
    }
  }
  const candidates = [...kwMap.values()].sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 500);

  const proposals = await prisma.seoTaxonomyProposal.findMany({
    where:   { storeId },
    orderBy: { proposedVolume: "desc" },
    select: {
      id: true, currentTag: true, proposedTag: true, proposedHandle: true,
      categoryL1: true, categoryL2: true, categoryL3: true,
      currentVolume: true, proposedVolume: true, justification: true,
      affectedCount: true, status: true,
    },
  });

  const handleGroups = new Map();
  for (const p of proposals) {
    if (p.status === "REJECTED") continue;
    const h = p.proposedHandle || "";
    if (!h) continue;
    if (!handleGroups.has(h)) handleGroups.set(h, []);
    handleGroups.get(h).push(p.id);
  }
  const cannibalizedHandles = new Set(
    [...handleGroups.entries()].filter(([, ids]) => ids.length > 1).map(([h]) => h)
  );

  let gscQueryMap = new Map();
  try {
    const { getAllSeoSettings, isGscConnected } = await import("../lib/seo/settings.server.js");
    const settings = await getAllSeoSettings(storeId);
    if (isGscConnected(settings) && settings.gscSiteUrl) {
      const { getValidGscToken, getTopQueries } = await import("../lib/seo/gsc.server.js");
      const accessToken = await getValidGscToken(storeId, settings);
      const rows = await getTopQueries(accessToken, settings.gscSiteUrl, 90);
      for (const row of rows) {
        const kw = (row.keys?.[0] || "").toLowerCase().trim();
        if (kw) {
          gscQueryMap.set(kw, {
            clicks:      row.clicks      || 0,
            impressions: row.impressions || 0,
            position:    Math.round((row.position || 0) * 10) / 10,
            ctr:         Math.round((row.ctr || 0) * 1000) / 10,
          });
        }
      }
    }
  } catch (gscErr) {
    console.warn("[Keywords] GSC fetch failed:", gscErr.message);
  }

  const gscEntries = [...gscQueryMap.entries()];
  const proposalsWithGsc = proposals.map((p) => {
    const cannibalized = cannibalizedHandles.has(p.proposedHandle || "");
    const kwNorm  = (p.proposedTag  || "").toLowerCase().trim();
    const l1Norm  = (p.categoryL1  || "").toLowerCase().trim();
    const l2Norm  = (p.categoryL2  || "").toLowerCase().trim();
    let gsc = gscQueryMap.get(kwNorm) || gscQueryMap.get(l2Norm) || null;
    if (!gsc) {
      const terms = [kwNorm, l2Norm, l1Norm].filter(Boolean);
      for (const [gscKw, gscData] of gscEntries) {
        for (const term of terms) {
          if (term.length >= 4 && (gscKw.includes(term) || term.includes(gscKw))) { gsc = gscData; break; }
        }
        if (gsc) break;
      }
    }
    return { ...p, gsc: gsc || null, cannibalized };
  });

  const candidatesWithGsc = candidates.map((c) => {
    const kwNorm = (c.keyword || "").toLowerCase().trim();
    let gsc = gscQueryMap.get(kwNorm) || null;
    if (!gsc) {
      for (const [gscKw, gscData] of gscEntries) {
        if (kwNorm.length >= 4 && (gscKw.includes(kwNorm) || kwNorm.includes(gscKw))) { gsc = gscData; break; }
      }
    }
    return { ...c, gsc: gsc || null };
  });

  const totalVolume = candidates.reduce((s, c) => s + (c.volume || 0), 0);
  const avgScore    = candidates.length > 0 ? candidates.reduce((s, c) => s + (c.score || 0), 0) / candidates.length : 0;
  const topKeyword  = candidates[0]?.keyword || "";
  const topVolume   = candidates[0]?.volume  || 0;
  const gscValidated = proposalsWithGsc.filter((p) => p.gsc && p.gsc.clicks > 0).length;
  const gscValidatedCandidates = candidatesWithGsc.filter((c) => c.gsc && c.gsc.clicks > 0).length;
  const cannibalizedCount = proposalsWithGsc.filter((p) => p.cannibalized).length;

  return {
    candidates:       candidatesWithGsc,
    proposals:        proposalsWithGsc,
    cannibalizedCount,
    stats: { totalCandidates: candidates.length, totalVolume, avgScore, topKeyword, topVolume, gscValidated: Math.max(gscValidated, gscValidatedCandidates) },
  };
};

export default function KeywordsPage() {
  const { candidates, proposals, stats, cannibalizedCount = 0 } = useLoaderData();
  const { gscValidated = 0 } = stats;
  const navigate        = useNavigate();
  const proposalFetcher = useFetcher();
  const applyFetcher    = useFetcher();

  const [view,          setView]          = useState("candidates");
  const [filterComp,    setFilterComp]    = useState("all");
  const [sortBy,        setSortBy]        = useState("score");
  const [showJustification, setShowJustification] = useState(null);
  const [localProposals, setLocalProposals] = useState(proposals);
  const [showRejected, setShowRejected] = useState(false);
  const [applyMsg,      setApplyMsg]      = useState("");
  const [applying,      setApplying]      = useState(false);
  const [paaPanel,      setPaaPanel]      = useState(null);
  const [paaLoading,    setPaaLoading]    = useState(null);
  const [batchRunning,  setBatchRunning]  = useState(false);
  const [candPage, setCandPage] = useState(1);
  const [candPerPage, setCandPerPage] = useState(25);
  const [propPage, setPropPage] = useState(1);
  const [propPerPage, setPropPerPage] = useState(25);
  const [gscPage, setGscPage] = useState(1);
  const [gscPerPage, setGscPerPage] = useState(25);
  const [batchJob,      setBatchJob]      = useState(null);
  const [paaCounts,     setPaaCounts]     = useState({});
  const pollingInterval = useRef(null);

  useEffect(() => { checkBatchStatus(); return () => clearInterval(pollingInterval.current); }, []);

  async function checkBatchStatus() {
    try {
      const r = await fetch("/api/paa/batch");
      const d = await r.json();
      if (d.job?.status === "QUEUED" || d.job?.status === "RUNNING") { setBatchJob(d.job); setBatchRunning(true); startPolling(); }
      else { setBatchJob(null); setBatchRunning(false); }
    } catch {}
  }

  function startPolling() {
    clearInterval(pollingInterval.current);
    pollingInterval.current = setInterval(async () => {
      try {
        const r = await fetch("/api/paa/batch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ intent: "status" }) });
        const d = await r.json();
        if (d.job) {
          setBatchJob(d.job);
          if (["DONE", "FAILED", "CANCELLED"].includes(d.job.status)) {
            setBatchRunning(false); clearInterval(pollingInterval.current);
            if (d.job.status === "DONE") setTimeout(() => window.location.reload(), 2000);
            else setTimeout(() => setBatchJob(null), 5000);
          }
        }
      } catch {}
    }, 2000);
  }

  async function fetchPaaBatch() {
    setBatchRunning(true);
    setBatchJob({ status: "QUEUED", progressPct: 0, processedItems: 0, totalItems: 0, statusMessage: "Starting..." });
    try {
      const r = await fetch("/api/paa/batch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ intent: "start" }) });
      const d = await r.json();
      if (d.success) startPolling();
      else { setBatchRunning(false); setBatchJob(null); }
    } catch { setBatchRunning(false); setBatchJob(null); }
  }

  async function fetchPaaForKeyword(keyword) {
    if (paaLoading === keyword) return;
    if (paaPanel?.keyword === keyword) { setPaaPanel(null); return; }
    setPaaLoading(keyword);
    try {
      const r = await fetch("/api/faq", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ intent: "debug_paa", keyword, language: "ro" }) });
      const d = await r.json();
      if (d.paaQuestions?.length > 0) setPaaPanel({ keyword, questions: d.paaQuestions.map(q => ({ question: q, answer: "" })) });
      else setPaaPanel({ keyword, questions: [], empty: true });
    } catch { setPaaPanel({ keyword, questions: [], empty: true }); }
    setPaaLoading(null);
  }

  function generateArticleWithPaa(keyword) {
    if (paaPanel?.questions?.length > 0) {
      const questions = paaPanel.questions.map(q => q.question).filter(Boolean);
      sessionStorage.setItem("paa_prefill", JSON.stringify({ keyword, questions }));
    }
    window.location.href = `/app/blog?keyword=${encodeURIComponent(keyword)}&from_paa=1`;
  }

  const handleApprove = (id) => { proposalFetcher.submit({ intent: "approve", proposalId: id }, { method: "POST", encType: "application/json" }); setLocalProposals((prev) => prev.map((p) => p.id === id ? { ...p, status: "APPROVED" } : p)); };
  const handleReject = (id) => { proposalFetcher.submit({ intent: "reject", proposalId: id }, { method: "POST", encType: "application/json" }); setLocalProposals((prev) => prev.map((p) => p.id === id ? { ...p, status: "REJECTED" } : p)); };
  const handleApproveAll = () => { proposalFetcher.submit({ intent: "approve_all" }, { method: "POST", encType: "application/json" }); setLocalProposals((prev) => prev.map((p) => p.status === "PENDING" ? { ...p, status: "APPROVED" } : p)); };
  const handleDeduplicate = () => {
    proposalFetcher.submit({ intent: "deduplicate" }, { method: "POST", encType: "application/json" });
    setLocalProposals((prev) => {
      const sorted = [...prev].sort((a, b) => (b.proposedVolume || 0) - (a.proposedVolume || 0) || (b.affectedCount || 0) - (a.affectedCount || 0));
      const handleSeen = new Map(); const keepIds = new Set();
      for (const p of sorted) { if (p.status === "APPLIED" || p.status === "REJECTED") { keepIds.add(p.id); continue; } const h = p.proposedHandle || ""; if (!handleSeen.has(h)) { handleSeen.set(h, p.id); keepIds.add(p.id); } }
      return prev.map(p => keepIds.has(p.id) ? p : { ...p, status: "REJECTED" });
    });
  };
  const handleRestore = (id) => { proposalFetcher.submit({ intent: "restore", proposalId: id }, { method: "POST", encType: "application/json" }); setLocalProposals((prev) => prev.map((p) => p.id === id ? { ...p, status: "PENDING" } : p)); };
  const handleApply = async () => {
    setApplying(true); setApplyMsg("");
    try {
      const resp = await fetch("/api/seo/proposals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ intent: "apply" }) });
      const data = await resp.json();
      if (data.success) { setApplyMsg(`Applied ${data.applied} proposals. ${data.remaining || 0} remaining.`); setLocalProposals((prev) => prev.map((p) => p.status === "APPROVED" ? { ...p, status: "APPLIED" } : p)); }
      else setApplyMsg(`Error: ${data.error}`);
    } catch (e) { setApplyMsg(`Error: ${e.message}`); }
    setApplying(false);
  };

  const filteredCandidates = candidates
    .filter((c) => filterComp === "all" || c.competition === filterComp)
    .sort((a, b) => { if (sortBy === "score") return (b.score||0)-(a.score||0); if (sortBy === "volume") return (b.volume||0)-(a.volume||0); if (sortBy === "cpc") return (b.cpc||0)-(a.cpc||0); return 0; });
  const gscFilteredCandidates = candidates.filter((c) => c.gsc && (c.gsc.clicks > 0 || c.gsc.impressions > 0)).sort((a, b) => (b.gsc?.clicks || 0) - (a.gsc?.clicks || 0));

  const compClass = (c) => c === "HIGH" ? "critical" : c === "MEDIUM" ? "warn" : "ok";

  return (
    <div className="page active">
      {/* Header */}
      <div className="page-head">
        <div>
          <h1 className="page-title">Keyword <em>Research</em></h1>
          <p className="page-sub">Enriched candidates + taxonomy proposals</p>
        </div>
        <div className="page-actions">
          <button onClick={() => navigate("/app/seo")} className="btn btn-ghost">SEO Engine</button>
        </div>
      </div>

      {/* Summary metrics */}
      <div className="metric-grid" style={{ gridTemplateColumns: "repeat(5, 1fr)" }}>
        {[
          { label: "Keywords",     value: stats.totalCandidates.toLocaleString() },
          { label: "Total Volume", value: stats.totalVolume.toLocaleString() },
          { label: "Avg Score",    value: stats.avgScore.toFixed(3) },
          { label: "GSC Traffic",  value: stats.gscValidated > 0 ? `${stats.gscValidated} kw` : "\u2014" },
          { label: "With PAA",     value: candidates.filter((c) => c.paaCount > 0).length || "\u2014" },
        ].map((s, i) => (
          <div key={i} className="metric">
            <div className="metric-label">{s.label}</div>
            <div className="metric-value">{s.value}</div>
          </div>
        ))}
      </div>

      {candidates.length === 0 && proposals.length === 0 && (
        <div className="alert-banner info">
          No keyword data yet. Run the SEO pipeline from <button onClick={() => navigate("/app/seo")} style={{ background: "none", border: "none", color: "inherit", fontWeight: "600", cursor: "pointer", padding: 0, textDecoration: "underline" }}>SEO Engine</button> first.
        </div>
      )}

      {/* Batch PAA */}
      {candidates.length > 0 && (
        <div style={{ marginBottom: "16px" }}>
          {!batchRunning && !batchJob && (
            <button onClick={fetchPaaBatch} className="btn btn-primary">Find PAA Questions for All Keywords</button>
          )}
          {(batchRunning || batchJob) && (
            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px" }}>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: "14px", fontWeight: "600", color: "var(--ink-0)" }}>
                    {batchJob?.status === "DONE" ? "PAA fetch complete!" : "Searching PAA Questions..."}
                  </span>
                  <span style={{ fontSize: "12px", color: "var(--ink-3)", marginLeft: "10px" }}>
                    {batchJob?.processedItems || 0}/{batchJob?.totalItems || "?"} keywords
                  </span>
                </div>
                <span style={{ fontSize: "11px", color: "var(--ink-4)", fontStyle: "italic" }}>runs in background</span>
              </div>
              <div style={{ padding: "0 16px 14px" }}>
                <div className="prog">
                  <div className={`prog-fill ${batchJob?.status === "DONE" ? "ok" : "warn"}`} style={{ width: `${batchJob?.progressPct || 0}%` }} />
                </div>
                {batchJob?.status !== "DONE" && batchJob?.statusMessage && (
                  <div style={{ marginTop: "8px", fontSize: "11px", color: "var(--ink-4)" }}>{batchJob.statusMessage}</div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* View toggle */}
      <div className="chip-group" style={{ marginBottom: "16px" }}>
        <button onClick={() => setView("candidates")} className={`chip${view === "candidates" ? " active" : ""}`}>Keywords ({candidates.length})</button>
        <button onClick={() => setView("proposals")} className={`chip${view === "proposals" ? " active" : ""}`}>Proposals ({proposals.length})</button>
        {stats.gscValidated > 0 && (
          <button onClick={() => setView("gsc")} className={`chip${view === "gsc" ? " active" : ""}`}>GSC Traffic ({stats.gscValidated} kw)</button>
        )}
        {cannibalizedCount > 0 && (
          <button onClick={() => setView("cannibalization")} className={`chip${view === "cannibalization" ? " active" : ""}`}>Duplicate URLs ({cannibalizedCount})</button>
        )}
        <button onClick={() => setView("triage")} className={`chip${view === "triage" ? " active" : ""}`}>GSC Triage</button>
      </div>

      {/* CANDIDATES VIEW */}
      {view === "candidates" && (
        <div className="card" style={{ padding: 0 }}>
          {/* Filters */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px 16px", borderBottom: "1px solid var(--line)", flexWrap: "wrap" }}>
            <span style={{ fontSize: "11px", color: "var(--ink-3)", fontFamily: "var(--mono)" }}>FILTER:</span>
            {["all", "HIGH", "MEDIUM", "LOW"].map((f) => (
              <button key={f} onClick={() => { setFilterComp(f); setCandPage(1); }} className={`chip${filterComp === f ? " active" : ""}`} style={{ padding: "3px 10px" }}>
                {f === "all" ? "All" : f}
              </button>
            ))}
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "4px" }}>
              <span style={{ fontSize: "11px", color: "var(--ink-3)", fontFamily: "var(--mono)" }}>SORT:</span>
              {["score", "volume", "cpc"].map((s) => (
                <button key={s} onClick={() => { setSortBy(s); setCandPage(1); }} className={`chip${sortBy === s ? " active" : ""}`} style={{ padding: "3px 10px" }}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Keyword</th>
                  <th className="right">Volume</th>
                  <th className="right">Score</th>
                  <th className="right">CPC</th>
                  <th className="right">Diff.</th>
                  <th>Comp.</th>
                  <th>Product</th>
                </tr>
              </thead>
              <tbody>
                {filteredCandidates.slice((candPage - 1) * candPerPage, candPage * candPerPage).map((c) => {
                  const features = JSON.parse(c.serpFeatures || "[]");
                  return (
                    <tr key={c.id}>
                      <td className="kw">
                        {c.keyword}
                        {features.includes("shopping") && <span className="q-tag ok" style={{ marginLeft: "4px", fontSize: "9px" }}>shop</span>}
                        {(paaCounts[c.keyword] || c.paaCount) > 0 ? (
                          <button onClick={() => fetchPaaForKeyword(c.keyword)} className="q-tag info" style={{ marginLeft: "6px", fontSize: "10px", cursor: "pointer", border: "none" }}>
                            PAA {paaCounts[c.keyword] || c.paaCount}
                          </button>
                        ) : (
                          <button onClick={() => fetchPaaForKeyword(c.keyword)} style={{ marginLeft: "6px", background: "transparent", color: "var(--ink-4)", border: "1px solid var(--line)", borderRadius: "4px", padding: "2px 6px", fontSize: "9px", cursor: "pointer" }}>PAA</button>
                        )}
                        {features.includes("featured_snippet") && <span className="q-tag warn" style={{ marginLeft: "4px", fontSize: "9px" }}>snippet</span>}
                      </td>
                      <td className="right mono" style={{ color: (c.volume || 0) > 500 ? "var(--accent-ink)" : "var(--ink-2)", fontWeight: (c.volume || 0) > 500 ? "700" : "400" }}>
                        {(c.volume || 0).toLocaleString()}
                      </td>
                      <td className="right mono">{(c.score || 0).toFixed(3)}</td>
                      <td className="right mono">{c.cpc ? `$${c.cpc.toFixed(2)}` : "\u2014"}</td>
                      <td className="right mono">{c.difficulty || "\u2014"}</td>
                      <td><span className={`q-tag ${compClass(c.competition)}`}>{c.competition || "\u2014"}</span></td>
                      <td style={{ fontSize: "11px", color: "var(--ink-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "120px" }} title={c.productTitle}>
                        {c.productTitle?.substring(0, 20)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filteredCandidates.length > candPerPage && (
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",fontSize:"13px",color:"var(--ink-3)"}}>
              <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
                <span>Randuri per pagina:</span>
                <select value={candPerPage} onChange={(e) => { setCandPerPage(Number(e.target.value)); setCandPage(1); }} style={{padding:"4px 8px",fontSize:"12px",borderRadius:"6px",border:"1px solid var(--line)"}}>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:"4px"}}>
                <span>{(candPage-1)*candPerPage+1}\u2013{Math.min(candPage*candPerPage, filteredCandidates.length)} din {filteredCandidates.length}</span>
                <button style={{padding:"4px 8px",border:"1px solid var(--line)",borderRadius:"6px",background:"var(--surface)",cursor:"pointer"}} disabled={candPage <= 1} onClick={() => setCandPage(p => p-1)}>\u2190</button>
                <button style={{padding:"4px 8px",border:"1px solid var(--line)",borderRadius:"6px",background:"var(--surface)",cursor:"pointer"}} disabled={candPage >= Math.ceil(filteredCandidates.length/candPerPage)} onClick={() => setCandPage(p => p+1)}>\u2192</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* PROPOSALS VIEW */}
      {view === "proposals" && (
        <div className="card">
          {localProposals.length === 0 ? (
            <div style={{ fontSize: "13px", color: "var(--ink-3)", padding: "16px" }}>
              No proposals yet. Run Step 4 (Claude Taxonomy) from <button onClick={() => navigate("/app/seo")} style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", padding: 0 }}>SEO Engine</button>.
            </div>
          ) : (
            <>
              {cannibalizedCount > 0 && (
                <div className="alert-banner warn" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <strong>{cannibalizedCount} proposals</strong> share the same URL handle. Review and reject duplicates before applying.
                  <button onClick={handleDeduplicate} className="btn btn-ghost" style={{ marginLeft: "auto" }}>Auto-Deduplicate</button>
                </div>
              )}

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", flexWrap: "wrap", gap: "8px" }}>
                <div style={{ fontSize: "13px", color: "var(--ink-2)" }}>
                  <strong style={{ color: "var(--warn)" }}>{localProposals.filter((p) => p.status === "PENDING").length} pending</strong>
                  {" \u00B7 "}
                  <strong style={{ color: "var(--accent-ink)" }}>{localProposals.filter((p) => p.status === "APPROVED").length} approved</strong>
                  {" \u00B7 "}
                  <strong>{localProposals.filter((p) => p.status === "APPLIED").length} applied</strong>
                  {" \u00B7 "}
                  <button onClick={() => setShowRejected(s => !s)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-3)", fontSize: "13px", padding: 0, textDecoration: "underline" }}>
                    {showRejected ? "Hide" : "Show"} rejected ({localProposals.filter((p) => p.status === "REJECTED").length})
                  </button>
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button onClick={handleApproveAll} className="btn btn-ghost">Approve All Pending</button>
                  <button onClick={handleApply} disabled={applying || localProposals.filter((p) => p.status === "APPROVED").length === 0}
                    className={`btn ${applying || localProposals.filter((p) => p.status === "APPROVED").length === 0 ? "btn-ghost" : "btn-primary"}`}
                    style={{ opacity: applying || localProposals.filter((p) => p.status === "APPROVED").length === 0 ? 0.5 : 1 }}>
                    {applying ? "Applying..." : `Apply & Create Collections (${localProposals.filter((p) => p.status === "APPROVED").length})`}
                  </button>
                </div>
              </div>

              {applyMsg && <div className="alert-banner ok">{applyMsg}</div>}

              {localProposals.filter((p) => showRejected || p.status !== "REJECTED").slice((propPage - 1) * propPerPage, propPage * propPerPage).map((p) => (
                <div key={p.id} className="data-row" style={{
                  display: "block", padding: "14px 16px",
                  borderLeft: `3px solid ${p.status === "APPLIED" ? "var(--ink-4)" : p.status === "APPROVED" ? "var(--accent)" : p.status === "REJECTED" ? "var(--ink-5)" : p.proposedVolume > p.currentVolume ? "var(--accent)" : "var(--line)"}`,
                  opacity: p.status === "REJECTED" ? 0.5 : 1,
                }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px", flexWrap: "wrap" }}>
                        <span style={{ fontFamily: "var(--mono)", fontSize: "11px", color: "var(--ink-3)", background: "var(--surface-2)", padding: "2px 6px", borderRadius: "4px" }}>{p.currentTag}</span>
                        <span style={{ color: "var(--ink-4)" }}>&rarr;</span>
                        <span style={{ fontWeight: "700", fontSize: "14px", color: "var(--ink-0)" }}>{p.proposedTag}</span>
                        <span style={{ fontFamily: "var(--mono)", fontSize: "11px", color: "var(--ink-3)" }}>/{p.proposedHandle}</span>
                      </div>
                      <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginBottom: "4px" }}>
                        {p.categoryL1 && <span className="q-tag">{p.categoryL1}</span>}
                        {p.categoryL2 && <span className="q-tag info">{p.categoryL2}</span>}
                        {p.categoryL3 && <span className="q-tag" style={{ fontSize: "10px" }}>{p.categoryL3}</span>}
                        <span className="q-tag">{p.affectedCount} products</span>
                        <span className={`q-tag ${p.status === "APPLIED" ? "ok" : p.status === "APPROVED" ? "info" : p.status === "REJECTED" ? "critical" : ""}`}>{p.status}</span>
                        {p.cannibalized && p.status === "PENDING" && <span className="q-tag warn">Duplicate URL</span>}
                        {p.gsc && p.gsc.clicks > 0 && <span className="q-tag ok">GSC: {p.gsc.clicks} clicks &middot; #{p.gsc.position}</span>}
                        {p.gsc && p.gsc.impressions > 0 && p.gsc.clicks === 0 && <span className="q-tag info">GSC: {p.gsc.impressions} impr</span>}
                      </div>
                      <div style={{ display: "flex", gap: "16px", fontSize: "12px" }}>
                        <span style={{ color: "var(--ink-3)" }}>Current: <strong style={{ color: "var(--ink-1)" }}>{(p.currentVolume || 0).toLocaleString()}/mo</strong></span>
                        <span style={{ color: "var(--ink-3)" }}>Proposed: <strong style={{ color: p.proposedVolume > p.currentVolume ? "var(--accent-ink)" : "var(--ink-1)" }}>{(p.proposedVolume || 0).toLocaleString()}/mo{p.proposedVolume > p.currentVolume ? " \u2191" : ""}</strong></span>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "4px", flexShrink: 0, alignItems: "center" }}>
                      <button onClick={() => setShowJustification(showJustification === p.id ? null : p.id)} className="btn btn-ghost" style={{ fontSize: "11px", padding: "4px 10px" }}>
                        {showJustification === p.id ? "Hide" : "Why?"}
                      </button>
                      {p.status === "PENDING" && (
                        <>
                          <button onClick={() => handleApprove(p.id)} className="btn btn-ghost" style={{ fontSize: "11px", padding: "4px 10px", color: "var(--accent-ink)", borderColor: "var(--accent)" }}>Approve</button>
                          <button onClick={() => handleReject(p.id)} className="btn btn-ghost" style={{ fontSize: "11px", padding: "4px 10px", color: "var(--danger)" }}>Reject</button>
                        </>
                      )}
                      {p.status === "APPROVED" && <span style={{ fontSize: "12px", color: "var(--accent-ink)", fontWeight: "600" }}>Approved</span>}
                      {p.status === "REJECTED" && <button onClick={() => handleRestore(p.id)} className="btn btn-ghost" style={{ fontSize: "11px", padding: "4px 10px" }}>Restore</button>}
                      {p.status === "APPLIED" && <span style={{ fontSize: "12px", color: "var(--ink-2)", fontWeight: "600" }}>Applied</span>}
                    </div>
                  </div>
                  {showJustification === p.id && p.justification && (
                    <div style={{ marginTop: "8px", padding: "8px 12px", background: "var(--surface-2)", borderRadius: "var(--r-sm)", fontSize: "12px", color: "var(--ink-2)", lineHeight: "1.7" }}>
                      {p.justification}
                    </div>
                  )}
                </div>
              ))}
              {localProposals.filter((p) => showRejected || p.status !== "REJECTED").length > propPerPage && (
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",fontSize:"13px",color:"var(--ink-3)"}}>
                  <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
                    <span>Randuri per pagina:</span>
                    <select value={propPerPage} onChange={(e) => { setPropPerPage(Number(e.target.value)); setPropPage(1); }} style={{padding:"4px 8px",fontSize:"12px",borderRadius:"6px",border:"1px solid var(--line)"}}>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:"4px"}}>
                    <span>{(propPage-1)*propPerPage+1}\u2013{Math.min(propPage*propPerPage, localProposals.filter((p) => showRejected || p.status !== "REJECTED").length)} din {localProposals.filter((p) => showRejected || p.status !== "REJECTED").length}</span>
                    <button style={{padding:"4px 8px",border:"1px solid var(--line)",borderRadius:"6px",background:"var(--surface)",cursor:"pointer"}} disabled={propPage <= 1} onClick={() => setPropPage(p => p-1)}>\u2190</button>
                    <button style={{padding:"4px 8px",border:"1px solid var(--line)",borderRadius:"6px",background:"var(--surface)",cursor:"pointer"}} disabled={propPage >= Math.ceil(localProposals.filter((p) => showRejected || p.status !== "REJECTED").length/propPerPage)} onClick={() => setPropPage(p => p+1)}>\u2192</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* GSC TRAFFIC VIEW */}
      {view === "gsc" && (
        <div className="card" style={{ padding: 0 }}>
          <div className="card-head">
            <div>
              <div className="card-title">GSC Traffic &mdash; Keywords with Organic Clicks</div>
              <div style={{ fontSize: "13px", color: "var(--ink-3)", marginTop: "4px" }}>Keywords from your list that already bring organic traffic (last 90 days).</div>
            </div>
          </div>
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr><th>Keyword</th><th className="right">Clicks</th><th className="right">Impr.</th><th className="right">CTR%</th><th className="right">Pos.</th><th>Product</th></tr>
              </thead>
              <tbody>
                {gscFilteredCandidates.slice((gscPage - 1) * gscPerPage, gscPage * gscPerPage).map((c) => (
                  <tr key={c.id}>
                    <td className="kw">{c.keyword} {c.volume > 0 && <span className="mono" style={{ fontSize: "10px", color: "var(--ink-3)", marginLeft: "6px" }}>{c.volume.toLocaleString()}/mo</span>}</td>
                    <td className="right mono" style={{ color: (c.gsc?.clicks || 0) > 0 ? "var(--accent-ink)" : "var(--ink-4)", fontWeight: "700" }}>{c.gsc?.clicks || 0}</td>
                    <td className="right mono">{(c.gsc?.impressions || 0).toLocaleString()}</td>
                    <td className="right mono" style={{ color: (c.gsc?.ctr || 0) > 3 ? "var(--accent-ink)" : "var(--ink-3)" }}>{c.gsc?.ctr || 0}%</td>
                    <td className="right mono" style={{ fontWeight: "600", color: (c.gsc?.position || 99) <= 10 ? "var(--accent-ink)" : (c.gsc?.position || 99) <= 20 ? "var(--warn)" : "var(--ink-3)" }}>#{c.gsc?.position || "\u2014"}</td>
                    <td style={{ fontSize: "11px", color: "var(--ink-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "120px" }} title={c.productTitle}>{c.productTitle?.substring(0, 18)}</td>
                  </tr>
                ))}
                {gscFilteredCandidates.length === 0 && (
                  <tr><td colSpan="6" style={{ textAlign: "center", padding: "24px", color: "var(--ink-3)" }}>No GSC traffic data matched.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {gscFilteredCandidates.length > gscPerPage && (
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",fontSize:"13px",color:"var(--ink-3)"}}>
              <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
                <span>Randuri per pagina:</span>
                <select value={gscPerPage} onChange={(e) => { setGscPerPage(Number(e.target.value)); setGscPage(1); }} style={{padding:"4px 8px",fontSize:"12px",borderRadius:"6px",border:"1px solid var(--line)"}}>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:"4px"}}>
                <span>{(gscPage-1)*gscPerPage+1}\u2013{Math.min(gscPage*gscPerPage, gscFilteredCandidates.length)} din {gscFilteredCandidates.length}</span>
                <button style={{padding:"4px 8px",border:"1px solid var(--line)",borderRadius:"6px",background:"var(--surface)",cursor:"pointer"}} disabled={gscPage <= 1} onClick={() => setGscPage(p => p-1)}>\u2190</button>
                <button style={{padding:"4px 8px",border:"1px solid var(--line)",borderRadius:"6px",background:"var(--surface)",cursor:"pointer"}} disabled={gscPage >= Math.ceil(gscFilteredCandidates.length/gscPerPage)} onClick={() => setGscPage(p => p+1)}>\u2192</button>
              </div>
            </div>
          )}
          <div style={{ padding: "14px 16px", background: "var(--accent-soft)", fontSize: "12px", color: "var(--accent-ink)" }}>
            <strong>Interpretation:</strong> Position 11-20 + clicks = quick wins. Many impressions but few clicks = CTR optimization needed. Position 1-3 = protect and expand.
          </div>
        </div>
      )}

      {/* GSC TRIAGE VIEW */}
      {view === "triage" && <GscTriageView />}

      {/* PAA Panel */}
      {paaPanel && (
        <div className="card" style={{ border: "2px solid var(--accent)", marginTop: "16px" }}>
          <div className="card-head">
            <div>
              <div className="card-title">PAA &mdash; {paaPanel.keyword}</div>
              <div style={{ fontSize: "11px", color: "var(--ink-3)", marginTop: "2px" }}>{paaPanel.questions.length} questions from Google</div>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={() => generateArticleWithPaa(paaPanel.keyword)} className="btn btn-primary">Generate Article</button>
              <button onClick={() => setPaaPanel(null)} className="btn btn-ghost">&times;</button>
            </div>
          </div>
          <div style={{ maxHeight: "360px", overflowY: "auto", padding: "12px 16px" }}>
            {paaPanel.questions.length > 0 ? paaPanel.questions.map((q, i) => (
              <div key={i} style={{ marginBottom: "14px", paddingBottom: "14px", borderBottom: i < paaPanel.questions.length - 1 ? "1px solid var(--line)" : "none" }}>
                <div style={{ fontSize: "13px", fontWeight: "600", color: "var(--ink-0)" }}>{q.question}</div>
              </div>
            )) : (
              <div style={{ textAlign: "center", padding: "20px 0" }}>
                <div style={{ fontSize: "13px", color: "var(--ink-3)" }}>{paaPanel.empty ? "No PAA questions found." : "Loading..."}</div>
              </div>
            )}
          </div>
          <div style={{ padding: "12px 16px", borderTop: "1px solid var(--line)", fontSize: "11px", color: "var(--ink-4)" }}>
            Click "Generate Article" to create content using these PAA questions as FAQ.
          </div>
        </div>
      )}
    </div>
  );
}

// GSC Triage Component
const ACTION_MAP = { AUDIT: { cls: "info", label: "Optimize" }, BLOG: { cls: "ok", label: "Create content" }, MONITOR: { cls: "", label: "Monitor" } };

function GscTriageView() {
  const [triPage, setTriPage] = useState(1);
  const [triPerPage, setTriPerPage] = useState(25);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [filter,  setFilter]  = useState("all");
  const [msg,     setMsg]     = useState("");

  const fetchResults = useCallback(async () => {
    setLoading(true);
    try { const resp = await fetch("/api/gsc/triage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ intent: "results" }) }); const data = await resp.json(); if (data.success) setResults(data); } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchResults(); }, [fetchResults]);

  const runTriage = async () => {
    setRunning(true); setMsg("");
    try { const resp = await fetch("/api/gsc/triage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ intent: "run" }) }); const data = await resp.json(); if (data.success) { setMsg(`Triage complete \u2014 ${data.audit} to audit, ${data.blog} blog opportunities, ${data.monitor} to monitor.`); fetchResults(); } else setMsg(`Error: ${data.error}`); } catch (e) { setMsg(`Error: ${e.message}`); }
    setRunning(false);
  };

  const filtered = !results ? [] : filter === "all" ? results.results : results.results.filter((r) => r.action === filter.toUpperCase());

  return (
    <div className="card" style={{ padding: 0 }}>
      <div className="card-head" style={{ flexDirection: "column", alignItems: "stretch", gap: "12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div className="card-title">GSC Keyword Triage</div>
            <div style={{ fontSize: "13px", color: "var(--ink-3)", marginTop: "4px" }}>Analyzes your GSC keywords and decides: optimize, create content, or monitor.</div>
          </div>
          <button onClick={runTriage} disabled={running} className={`btn ${running ? "btn-ghost" : "btn-primary"}`} style={{ opacity: running ? 0.6 : 1 }}>
            {running ? "Running..." : "Run triage now"}
          </button>
        </div>
      </div>

      {msg && <div className={`alert-banner ${msg.startsWith("Triage") ? "ok" : "warn"}`} style={{ margin: "12px 16px" }}>{msg}</div>}

      <div style={{ padding: "12px 16px", background: "var(--purple-soft)", fontSize: "12px", color: "var(--purple)", lineHeight: "1.6" }}>
        <strong>Decision logic:</strong> Position &le;7 &rarr; Optimize. Position 8-20 + impressions &ge;100 &rarr; Create content. Rest &rarr; Monitor.
      </div>

      {results && (
        <div className="chip-group" style={{ padding: "12px 16px" }}>
          {[
            { key: "all", label: "All" },
            { key: "audit", label: `Optimize (${results.counts.audit})` },
            { key: "blog", label: `Create (${results.counts.blog})` },
            { key: "monitor", label: `Monitor (${results.counts.monitor})` },
          ].map(s => (
            <button key={s.key} onClick={() => { setFilter(filter === s.key ? "all" : s.key); setTriPage(1); }} className={`chip${filter === s.key ? " active" : ""}`}>{s.label}</button>
          ))}
        </div>
      )}

      {loading && <div style={{ textAlign: "center", padding: "32px", color: "var(--ink-3)", fontSize: "13px" }}>Loading...</div>}

      {!loading && results && filtered.length > 0 && (
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Keyword</th><th className="right">Clicks</th><th className="right">Impressions</th><th className="right">CTR%</th><th className="right">Pos.</th><th>Action</th></tr></thead>
            <tbody>
              {filtered.slice((triPage - 1) * triPerPage, triPage * triPerPage).map((r) => {
                const a = ACTION_MAP[r.action] || ACTION_MAP.MONITOR;
                return (
                  <tr key={r.keyword}>
                    <td className="kw">{r.keyword}</td>
                    <td className="right mono" style={{ color: r.clicks > 0 ? "var(--accent-ink)" : "var(--ink-4)", fontWeight: r.clicks > 0 ? "700" : "400" }}>{r.clicks}</td>
                    <td className="right mono">{r.impressions.toLocaleString()}</td>
                    <td className="right mono" style={{ color: r.ctr > 3 ? "var(--accent-ink)" : "var(--ink-3)" }}>{r.ctr}%</td>
                    <td className="right mono" style={{ fontWeight: "600", color: r.position <= 7 ? "var(--accent-ink)" : r.position <= 20 ? "var(--warn)" : "var(--ink-3)" }}>#{r.position}</td>
                    <td><span className={`q-tag ${a.cls}`}>{a.label}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {filtered.length > triPerPage && (
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",fontSize:"13px",color:"var(--ink-3)"}}>
          <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
            <span>Randuri per pagina:</span>
            <select value={triPerPage} onChange={(e) => { setTriPerPage(Number(e.target.value)); setTriPage(1); }} style={{padding:"4px 8px",fontSize:"12px",borderRadius:"6px",border:"1px solid var(--line)"}}>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:"4px"}}>
            <span>{(triPage-1)*triPerPage+1}\u2013{Math.min(triPage*triPerPage, filtered.length)} din {filtered.length}</span>
            <button style={{padding:"4px 8px",border:"1px solid var(--line)",borderRadius:"6px",background:"var(--surface)",cursor:"pointer"}} disabled={triPage <= 1} onClick={() => setTriPage(p => p-1)}>\u2190</button>
            <button style={{padding:"4px 8px",border:"1px solid var(--line)",borderRadius:"6px",background:"var(--surface)",cursor:"pointer"}} disabled={triPage >= Math.ceil(filtered.length/triPerPage)} onClick={() => setTriPage(p => p+1)}>\u2192</button>
          </div>
        </div>
      )}

      {!loading && results && filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px", color: "var(--ink-3)", fontSize: "13px" }}>
          {results.results.length === 0 ? "No triage data yet. Click \"Run triage now\"." : "No keywords in this category."}
        </div>
      )}

      {!loading && !results && (
        <div style={{ textAlign: "center", padding: "40px", color: "var(--ink-3)", fontSize: "13px" }}>Click "Run triage now" to start.</div>
      )}
    </div>
  );
}
