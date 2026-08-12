// app/routes/app.seo.jsx
// Kimono SEO — SEO Taxonomy Engine

import { useLoaderData, useNavigate, useRevalidator, useFetcher } from "react-router";
import { useState, useCallback, useEffect, useRef } from "react";
import prisma from "../db.server.js";
import { requireAuth } from "../lib/auth/index.server.js";
import GscPanel from "../components/GscPanel.jsx";

const JOB_LABELS = {
  SYNC:     "Syncing products",
  EXTRACT:  "Extracting candidates",
  ENRICH:   "Enriching with DataForSEO",
  TAXONOMY: "Analyzing taxonomy",
};
const JOB_STEP = { SYNC: 1, EXTRACT: 2, ENRICH: 3, TAG: 4, TAXONOMY: 5 };

export const loader = async ({ request }) => {
  const { getAllSeoSettings, isGscConnected } = await import("../lib/seo/settings.server.js");
  const { buildGscAuthUrl } = await import("../lib/seo/gsc.server.js");
  const { hasDfsConfig }    = await import("../lib/seo/dataforseo.server.js");
  const { connection, storeId } = await requireAuth(request);
  const shopId = connection?.shopDomain || "";
  if (!storeId || !connection) {
    return { stats: { totalProducts: 0, totalCandidates: 0, enrichedCandidates: 0, taggedProducts: 0, pendingProposals: 0, approvedProposals: 0, appliedProposals: 0 }, lastSyncAt: null, hasAI: !!process.env.ANTHROPIC_API_KEY, hasDfs: false, proposals: [], gscConnected: false, gscSiteUrl: "", gscAuthUrl: "", activeJob: null };
  }
  const [
    totalProducts, totalCandidates, enrichedCandidates, taggedProducts,
    pendingProposals, approvedProposals, appliedProposals,
    untaggedProducts, unenrichedCandidates, deletedProducts,
    lastSync, settings, activeJob, storeSettings,
  ] = await Promise.all([
    prisma.seoProduct.count({ where: { storeId, status: { not: "deleted" } } }),
    prisma.seoCandidate.count({ where: { storeId } }),
    prisma.seoCandidate.count({ where: { storeId, enrichedAt: { not: null } } }),
    prisma.seoProduct.count({ where: { storeId, aiTag: { not: null }, NOT: { aiTag: "" }, status: { not: "deleted" } } }),
    prisma.seoTaxonomyProposal.count({ where: { storeId, status: "PENDING" } }),
    prisma.seoTaxonomyProposal.count({ where: { storeId, status: "APPROVED" } }),
    prisma.seoTaxonomyProposal.count({ where: { storeId, status: "APPLIED" } }),
    prisma.seoProduct.count({ where: { storeId, status: { not: "deleted" }, OR: [{ aiTag: null }, { aiTag: "" }] } }),
    prisma.seoCandidate.count({ where: { storeId, enrichedAt: null } }),
    prisma.seoProduct.count({ where: { storeId, status: "deleted" } }),
    prisma.seoSyncLog.findFirst({ where: { storeId, status: "DONE" }, orderBy: { finishedAt: "desc" } }),
    getAllSeoSettings(storeId),
    prisma.seoJob.findFirst({ where: { storeId, status: { in: ["QUEUED", "RUNNING"] } }, orderBy: { queuedAt: "desc" } }),
    prisma.storeSettings.findUnique({ where: { storeId }, select: { pipelineMode: true } }),
  ]);

  const proposals = await prisma.seoTaxonomyProposal.findMany({
    where:   { storeId, status: "PENDING" },
    orderBy: { proposedVolume: "desc" },
    take:    20,
    select:  { id: true, currentTag: true, proposedTag: true, categoryL1: true, categoryL2: true, currentVolume: true, proposedVolume: true, affectedCount: true },
  });

  const allTags = await prisma.seoProduct.findMany({
    where:   { storeId, aiTag: { not: null }, status: { not: "deleted" }, NOT: { aiTag: "" } },
    select:  { aiTag: true },
    distinct: ["aiTag"],
  });
  const proposedTagSet = new Set((await prisma.seoTaxonomyProposal.findMany({ where: { storeId }, select: { currentTag: true } })).map(p => p.currentTag));
  const newTagsCount = allTags.filter(t => !proposedTagSet.has(t.aiTag)).length;

  return {
    stats: { totalProducts, totalCandidates, enrichedCandidates, taggedProducts, pendingProposals, approvedProposals, appliedProposals },
    pipeline: {
      mode:                 storeSettings?.pipelineMode || "AUTO_PILOT",
      untaggedProducts,
      unenrichedCandidates,
      deletedProducts,
      newTagsCount,
    },
    lastSyncAt:   lastSync?.finishedAt || null,
    hasAI:        !!process.env.ANTHROPIC_API_KEY,
    hasDfs:       hasDfsConfig(),
    proposals,
    gscConnected: isGscConnected(settings),
    gscSiteUrl:   settings.gscSiteUrl || "",
    gscAuthUrl:   buildGscAuthUrl(shopId),
    activeJob:    activeJob ? { id: activeJob.id, type: activeJob.type, status: activeJob.status, progressPct: activeJob.progressPct, statusMessage: activeJob.statusMessage, processedItems: activeJob.processedItems, totalItems: activeJob.totalItems } : null,
  };
};

export const action = async ({ request }) => {
  const { connection, storeId } = await requireAuth(request);
  const shopDomain = connection?.shopDomain || "";
  if (!storeId || !connection) return { success: false };
  const formData = await request.formData();
  const intent   = formData.get("intent");

  if (intent === "refresh") {
    const [totalProducts, totalCandidates, enrichedCandidates, taggedProducts, pendingProposals, approvedProposals, appliedProposals, proposals, activeJob] = await Promise.all([
      prisma.seoProduct.count({ where: { storeId } }),
      prisma.seoCandidate.count({ where: { storeId } }),
      prisma.seoCandidate.count({ where: { storeId, enrichedAt: { not: null } } }),
      prisma.seoProduct.count({ where: { storeId, aiTag: { not: null }, NOT: { aiTag: "" } } }),
      prisma.seoTaxonomyProposal.count({ where: { storeId, status: "PENDING" } }),
      prisma.seoTaxonomyProposal.count({ where: { storeId, status: "APPROVED" } }),
      prisma.seoTaxonomyProposal.count({ where: { storeId, status: "APPLIED" } }),
      prisma.seoTaxonomyProposal.findMany({ where: { storeId, status: "PENDING" }, orderBy: { proposedVolume: "desc" }, take: 20, select: { id: true, currentTag: true, proposedTag: true, categoryL1: true, categoryL2: true, currentVolume: true, proposedVolume: true, affectedCount: true } }),
      prisma.seoJob.findFirst({ where: { storeId, status: { in: ["QUEUED", "RUNNING"] } }, orderBy: { queuedAt: "desc" } }),
    ]);
    return { success: true, data: { stats: { totalProducts, totalCandidates, enrichedCandidates, taggedProducts, pendingProposals, approvedProposals, appliedProposals }, proposals, activeJob: activeJob ? { id: activeJob.id, type: activeJob.type, status: activeJob.status, progressPct: activeJob.progressPct, statusMessage: activeJob.statusMessage, processedItems: activeJob.processedItems, totalItems: activeJob.totalItems } : null } };
  }

  if (intent === "reset") {
    await prisma.seoTaxonomyProposal.deleteMany({ where: { storeId } });
    await prisma.seoCandidate.deleteMany({ where: { storeId } });
    await prisma.seoProduct.deleteMany({ where: { storeId } });
    await prisma.seoSyncLog.deleteMany({ where: { storeId } });
    await prisma.seoJob.updateMany({ where: { storeId, status: { in: ["QUEUED", "RUNNING"] } }, data: { status: "CANCELLED", finishedAt: new Date() } });
    return { success: true };
  }

  if (intent === "job_status") {
    const job = await prisma.seoJob.findFirst({
      where:   { storeId, status: { in: ["QUEUED", "RUNNING"] } },
      orderBy: { queuedAt: "desc" },
      select:  { id: true, type: true, status: true, totalItems: true, processedItems: true, progressPct: true, statusMessage: true, errorMessage: true },
    });
    return { success: true, job: job || null };
  }

  if (intent === "job_cancel") {
    await prisma.seoJob.updateMany({ where: { storeId, status: { in: ["QUEUED", "RUNNING"] } }, data: { status: "CANCELLED", finishedAt: new Date() } });
    return { success: true };
  }

  const typeMap = { sync: "SYNC", extract: "EXTRACT", enrich: "ENRICH", tag: "TAG", taxonomy: "TAXONOMY" };
  const jobType = typeMap[intent];
  if (jobType) {
    await prisma.seoJob.updateMany({ where: { storeId, type: jobType, status: { in: ["QUEUED", "RUNNING"] } }, data: { status: "CANCELLED", finishedAt: new Date() } });
    if (intent === "sync") {
      await prisma.seoSyncLog.create({ data: { storeId, status: "RUNNING" } });
    }
    const activeCount = await prisma.seoJob.count({ where: { storeId, status: { in: ["QUEUED", "RUNNING"] } } });
    if (activeCount >= 2) {
      return { success: false, error: `Ai deja ${activeCount} joburi active.` };
    }
    const job = await prisma.seoJob.create({ data: { storeId, type: jobType, status: "QUEUED", statusMessage: `${jobType} queued...` } });
    const url = `${process.env.APP_URL}/api/seo/job-runner`;
    setTimeout(() => { fetch(url, { headers: { "X-Cron-Secret": process.env.CRON_SECRET || "" } }).catch(() => {}); }, 200);
    return { success: true, jobId: job.id, type: jobType };
  }

  return { success: false };
};

export default function SeoEngine() {
  const loaderData = useLoaderData();
  const navigate   = useNavigate();
  const [stats,     setStats]     = useState(loaderData.stats);
  const [proposals, setProposals] = useState(loaderData.proposals);
  const [activeJob, setActiveJob] = useState(loaderData.activeJob);
  const [tblPage, setTblPage] = useState(1);
  const [tblPerPage, setTblPerPage] = useState(25);
  const { hasAI, hasDfs, gscConnected, gscSiteUrl, gscAuthUrl, lastSyncAt } = loaderData;

  const pollingRef     = useRef(null);
  const { revalidate } = useRevalidator();
  const jobFetcher     = useFetcher();
  const statFetcher    = useFetcher();

  const pollStatus = useCallback(() => {
    const fd = new FormData();
    fd.set("intent", "job_status");
    jobFetcher.submit(fd, { method: "POST" });
  }, [jobFetcher]);

  useEffect(() => {
    if (jobFetcher.data?.success) {
      const { job } = jobFetcher.data;
      if (job) {
        setActiveJob({ id: job.id, type: job.type, status: job.status, progressPct: job.progressPct, statusMessage: job.statusMessage, processedItems: job.processedItems, totalItems: job.totalItems });
      } else {
        setActiveJob(null);
        revalidate();
      }
    }
  }, [jobFetcher.data]);

  useEffect(() => {
    const isActive = activeJob && (activeJob.status === "QUEUED" || activeJob.status === "RUNNING");
    if (isActive) {
      pollingRef.current = setInterval(pollStatus, 20000);
    } else {
      clearInterval(pollingRef.current);
    }
    return () => clearInterval(pollingRef.current);
  }, [activeJob?.status, pollStatus]);

  useEffect(() => {
    setStats(loaderData.stats);
    setProposals(loaderData.proposals);
  }, [loaderData]);

  const queueJob = useCallback((type) => {
    setActiveJob({ id: null, type: type.toUpperCase(), status: "QUEUED", progressPct: 0, statusMessage: "Queued...", processedItems: 0, totalItems: 0 });
    const fd = new FormData();
    fd.set("intent", type);
    statFetcher.submit(fd, { method: "POST" });
  }, [statFetcher]);

  useEffect(() => {
    if (statFetcher.data?.success && statFetcher.data?.jobId) {
      setActiveJob((prev) => prev ? { ...prev, id: statFetcher.data.jobId } : null);
      pollStatus();
    }
  }, [statFetcher.data]);

  const cancelJob = useCallback(() => {
    const fd = new FormData();
    fd.set("intent", "job_cancel");
    statFetcher.submit(fd, { method: "POST" });
    setActiveJob(null);
    clearInterval(pollingRef.current);
    revalidate();
  }, [statFetcher, revalidate]);

  const isJobActive = activeJob && (activeJob.status === "QUEUED" || activeJob.status === "RUNNING");
  const activeStep  = isJobActive ? JOB_STEP[activeJob.type] : null;

  const stepState = (n) => {
    if (activeStep === n) return "active";
    const done = [
      null,
      stats.totalProducts > 0,
      stats.totalCandidates > 0,
      stats.enrichedCandidates > 0,
      (stats.taggedProducts || 0) >= stats.totalProducts && stats.totalProducts > 0,
      stats.pendingProposals > 0 || stats.appliedProposals > 0,
    ];
    return done[n] ? "done" : null;
  };

  const steps = [
    { num: 1, title: "Sync Products",      desc: "Import all active products from Shopify.",                          btn: "Sync",    type: "sync",     enabled: !isJobActive,                                                                                              done: `${stats.totalProducts} products`,          hint: lastSyncAt ? `Last: ${new Date(lastSyncAt).toLocaleDateString()}` : "Never synced" },
    { num: 2, title: "Extract Candidates", desc: "Claude extracts keyword candidates from product titles.",           btn: "Extract", type: "extract",  enabled: !isJobActive && stats.totalProducts > 0 && hasAI,                                                          done: `${stats.totalCandidates} candidates`,      hint: "~$0.01 / 20 products" },
    { num: 3, title: "DataForSEO Enrich",  desc: "Real volume, CPC, difficulty, SERP features. Cached 30 days.",     btn: "Enrich",  type: "enrich",   enabled: !isJobActive && stats.totalCandidates > 0,                                                                 done: `${stats.enrichedCandidates} enriched`,     hint: hasDfs ? "DataForSEO active" : "DFS not configured" },
    { num: 4, title: "Tag Products",       desc: "Claude assigns semantic category tags to group similar products.",  btn: "Tag",     type: "tag",      enabled: !isJobActive && stats.totalProducts > 0 && hasAI,                                                          done: `${stats.taggedProducts || 0} tagged`,      hint: "~$0.02 / 20 products" },
    { num: 5, title: "Claude Taxonomy",    desc: "Claude decides optimal collection names, L1/L2/L3, URL handles.", btn: "Analyze", type: "taxonomy", enabled: !isJobActive && (stats.taggedProducts || 0) > 0 && hasAI, done: `${stats.pendingProposals} proposals`,  hint: "~$0.05 per session" },
  ];

  return (
    <div className="page active">
      {/* Header */}
      <div className="page-head">
        <div>
          <h1 className="page-title">SEO Taxonomy <em>Engine</em></h1>
          <p className="page-sub">Sync &rarr; Extract &rarr; Enrich &rarr; Taxonomy &rarr; Review</p>
        </div>
        <div className="page-actions">
          <button onClick={() => navigate("/app/seo/keywords")} className="btn btn-ghost">Keywords</button>
          <button onClick={() => navigate("/app/seo/settings")} className="btn btn-ghost">Settings</button>
        </div>
      </div>

      {/* Warnings */}
      {!hasAI && <div className="alert-banner warn">Anthropic API key missing. <button onClick={() => navigate("/app/settings")} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: "inherit", padding: 0, textDecoration: "underline" }}>Settings</button></div>}
      {!hasDfs && <div className="alert-banner info">DataForSEO not configured &mdash; Step 3 will skip volume data. <button onClick={() => navigate("/app/seo/settings")} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: "inherit", padding: 0, textDecoration: "underline" }}>Configure</button></div>}

      {/* Pipeline incremental status */}
      {(loaderData.pipeline?.untaggedProducts > 0 || loaderData.pipeline?.unenrichedCandidates > 0 || loaderData.pipeline?.newTagsCount > 0 || loaderData.pipeline?.deletedProducts > 0) && (
        <div className="alert-banner info" style={{ flexDirection: "column", alignItems: "stretch" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
            <div style={{ fontWeight: "600" }}>
              Pipeline incremental &mdash; {loaderData.pipeline.mode === "AUTO_PILOT" ? "Auto-pilot activ" : "Review manual"}
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px", fontSize: "12px" }}>
            {loaderData.pipeline.untaggedProducts > 0 && (
              <div style={{ background: "var(--surface)", padding: "10px 12px", borderRadius: "6px" }}>
                <div style={{ fontWeight: "600" }}>{loaderData.pipeline.untaggedProducts.toLocaleString()} produse fara tag AI</div>
                <div style={{ color: "var(--ink-3)", marginTop: "2px" }}>Vor fi procesate prin TAG</div>
              </div>
            )}
            {loaderData.pipeline.unenrichedCandidates > 0 && (
              <div style={{ background: "var(--surface)", padding: "10px 12px", borderRadius: "6px" }}>
                <div style={{ fontWeight: "600" }}>{loaderData.pipeline.unenrichedCandidates.toLocaleString()} candidati de imbogatit</div>
                <div style={{ color: "var(--ink-3)", marginTop: "2px" }}>Vor cere volume reale DFS</div>
              </div>
            )}
            {loaderData.pipeline.newTagsCount > 0 && (
              <div style={{ background: "var(--surface)", padding: "10px 12px", borderRadius: "6px" }}>
                <div style={{ fontWeight: "600" }}>{loaderData.pipeline.newTagsCount} categorii noi</div>
                <div style={{ color: "var(--ink-3)", marginTop: "2px" }}>Propuneri taxonomie noi</div>
              </div>
            )}
            {loaderData.pipeline.deletedProducts > 0 && (
              <div style={{ background: "var(--danger-soft)", padding: "10px 12px", borderRadius: "6px" }}>
                <div style={{ fontWeight: "600", color: "var(--danger)" }}>{loaderData.pipeline.deletedProducts.toLocaleString()} produse sterse</div>
                <div style={{ color: "var(--ink-3)", marginTop: "2px" }}>Din Shopify &mdash; pastrate pentru istoric</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Active job banner */}
      {isJobActive && (
        <div className="card" style={{ background: "var(--ink-0)", color: "#fff", display: "flex", alignItems: "center", gap: "16px", marginBottom: "18px" }}>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <span style={{ display: "inline-block", width: "16px", height: "16px", borderRadius: "50%", border: "2px solid #374151", borderTopColor: "var(--info)", animation: "spin 0.8s linear infinite", flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
              <span style={{ fontSize: "13px", fontWeight: "600" }}>{JOB_LABELS[activeJob.type] || activeJob.type}</span>
              <span style={{ fontSize: "10px", background: "#374151", color: "#9CA3AF", padding: "1px 6px", borderRadius: "4px" }}>{activeJob.status}</span>
              {activeJob.totalItems > 0 && <span style={{ fontSize: "12px", color: "#6B7280" }}>{activeJob.processedItems?.toLocaleString()} / {activeJob.totalItems?.toLocaleString()}</span>}
            </div>
            <div style={{ fontSize: "12px", color: "#6B7280" }}>{activeJob.statusMessage || "Processing..."}</div>
            {activeJob.progressPct > 0 && (
              <div className="prog" style={{ marginTop: "8px", background: "#374151" }}>
                <div className="prog-fill ok" style={{ width: `${activeJob.progressPct}%` }} />
              </div>
            )}
          </div>
          {activeJob.progressPct > 0 && <span style={{ fontSize: "18px", fontWeight: "800", color: "var(--info)", flexShrink: 0, fontFamily: "var(--mono)" }}>{activeJob.progressPct}%</span>}
          <button onClick={cancelJob} className="btn btn-ghost" style={{ background: "transparent", borderColor: "#374151", color: "#6B7280", flexShrink: 0 }}>Cancel</button>
        </div>
      )}

      {/* Stats */}
      <div className="snapshot">
        {[
          { label: "Products",   value: stats.totalProducts },
          { label: "Candidates", value: stats.totalCandidates },
          { label: "Enriched",   value: stats.enrichedCandidates },
          { label: "Proposals",  value: stats.pendingProposals },
          { label: "Approved",   value: stats.approvedProposals },
          { label: "Applied",    value: stats.appliedProposals },
        ].map((s, i) => (
          <div key={i} className="kpi">
            <div className="kpi-label">{s.label}</div>
            <div className="kpi-value">{(s.value || 0).toLocaleString()}</div>
          </div>
        ))}
      </div>

      {/* Pipeline Steps */}
      {steps.map((step) => {
        const state = stepState(step.num);
        return (
          <div key={step.num} className="card" style={{
            borderLeftWidth: "4px",
            borderLeftColor: state === "done" ? "var(--accent)" : state === "active" ? "var(--info)" : "var(--line)",
            opacity: step.enabled || state === "done" ? 1 : 0.55,
            marginBottom: "10px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "16px", padding: "14px 16px" }}>
              <div style={{
                width: 36, height: 36, borderRadius: "8px",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "14px", fontWeight: "700", flexShrink: 0,
                background: state === "done" ? "var(--accent-soft)" : state === "active" ? "var(--info-soft)" : "var(--surface-2)",
                color: state === "done" ? "var(--accent-ink)" : state === "active" ? "var(--info)" : "var(--ink-3)",
              }}>
                {state === "done" ? "\u2713" : state === "active" ? "\u21BB" : step.num}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "15px", fontWeight: "600", color: "var(--ink-0)" }}>{step.title}</div>
                <div style={{ fontSize: "13px", color: "var(--ink-3)", marginTop: "2px" }}>{step.desc}</div>
                <div style={{ fontSize: "11px", color: "var(--ink-4)", marginTop: "3px" }}>{step.hint}</div>
              </div>
              {state === "done" && !isJobActive && <span className="q-tag ok">{step.done}</span>}
              {state === "active" && <span className="q-tag info">Running</span>}
              <button onClick={() => queueJob(step.type)} disabled={!step.enabled}
                className={`btn ${step.enabled ? "btn-primary" : "btn-ghost"}`}
                style={{ opacity: step.enabled ? 1 : 0.4, fontSize: "13px" }}>
                {state === "active" ? "Running..." : step.btn}
              </button>
            </div>
          </div>
        );
      })}

      {/* Proposals preview */}
      {proposals.length > 0 && (
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Taxonomy Proposals <span className="count">{proposals.length}</span></div>
              <div style={{ fontSize: "12px", color: "var(--ink-3)", marginTop: "2px" }}>Approve / reject in full view.</div>
            </div>
            <button onClick={() => navigate("/app/seo/keywords")} className="btn btn-ghost">Full view</button>
          </div>
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Current Tag</th>
                  <th>Proposed</th>
                  <th className="right">Cur Vol</th>
                  <th className="right">New Vol</th>
                  <th className="right">Products</th>
                  <th>Category</th>
                </tr>
              </thead>
              <tbody>
                {proposals.slice((tblPage-1)*tblPerPage, tblPage*tblPerPage).map((p) => (
                  <tr key={p.id}>
                    <td className="mono" style={{ fontSize: "12px", color: "var(--ink-3)" }}>{p.currentTag}</td>
                    <td className="kw">{p.proposedTag}</td>
                    <td className="right mono">{(p.currentVolume || 0).toLocaleString()}</td>
                    <td className="right mono" style={{ color: p.proposedVolume > p.currentVolume ? "var(--accent-ink)" : "var(--ink-2)", fontWeight: p.proposedVolume > p.currentVolume ? "700" : "400" }}>
                      {(p.proposedVolume || 0).toLocaleString()}{p.proposedVolume > p.currentVolume ? " \u2191" : ""}
                    </td>
                    <td className="right mono">{p.affectedCount}</td>
                    <td style={{ fontSize: "11px", color: "var(--ink-3)" }}>{[p.categoryL1, p.categoryL2].filter(Boolean).join(" / ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {proposals.length > tblPerPage && (
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 0",fontSize:"13px",color:"var(--ink-3)"}}>
                <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
                  <span>Randuri per pagina:</span>
                  <select value={tblPerPage} onChange={(e) => { setTblPerPage(Number(e.target.value)); setTblPage(1); }} style={{padding:"4px 8px",fontSize:"12px",borderRadius:"6px",border:"1px solid var(--line)"}}>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:"4px"}}>
                  <span>{(tblPage-1)*tblPerPage+1}–{Math.min(tblPage*tblPerPage, proposals.length)} din {proposals.length}</span>
                  <button style={{padding:"4px 8px",border:"1px solid var(--line)",borderRadius:"6px",background:"var(--surface)",cursor:"pointer"}} disabled={tblPage <= 1} onClick={() => setTblPage(p => p-1)}>←</button>
                  <button style={{padding:"4px 8px",border:"1px solid var(--line)",borderRadius:"6px",background:"var(--surface)",cursor:"pointer"}} disabled={tblPage >= Math.ceil(proposals.length/tblPerPage)} onClick={() => setTblPage(p => p+1)}>→</button>
                </div>
              </div>
            )}
        </div>
      )}

      <GscPanel gscConnected={gscConnected} gscSiteUrl={gscSiteUrl} gscAuthUrl={gscAuthUrl} />

      {/* Danger Zone */}
      <div className="card" style={{ borderLeftWidth: "4px", borderLeftColor: "var(--danger)", background: "var(--danger-soft)" }}>
        <div style={{ padding: "14px 16px" }}>
          <div style={{ fontSize: "14px", fontWeight: "600", color: "var(--danger)", marginBottom: "4px" }}>Danger Zone</div>
          <div style={{ fontSize: "12px", color: "var(--danger)", opacity: 0.8, marginBottom: "12px" }}>Delete all SEO data. Shopify collections remain.</div>
          <button
            onClick={() => {
              if (!confirm("Delete ALL SEO data? This cannot be undone.")) return;
              const fd = new FormData();
              fd.set("intent", "reset");
              statFetcher.submit(fd, { method: "POST" });
              setTimeout(() => revalidate(), 500);
            }}
            disabled={!!isJobActive}
            className="btn btn-ghost"
            style={{ color: "var(--danger)", borderColor: "var(--danger)" }}
          >
            Reset All
          </button>
        </div>
      </div>
    </div>
  );
}
