import { useLoaderData } from "react-router";
import { useState } from "react";
import { requireAuth } from "../lib/auth/index.server.js";
import prisma from "../db.server.js";

const fmt = (n) => n == null ? "\u2014" : Number(n).toLocaleString("ro-RO");
const scoreColor = (s) => s >= 80 ? "#16a34a" : s >= 60 ? "#d97706" : "#dc2626";
const scoreDash  = (s) => 113.1 - (113.1 * Math.min(s, 100) / 100);

export const loader = async ({ request }) => {
  const { user, connection, storeId } = await requireAuth(request);
  if (!storeId) return { stats: null, keywords: [], audits: [], images: [], triage: [], triageCounts: {} };

  const [
    keywordsTotal, keywordsEnriched,
    keywordsTop3, keywordsTop10,
    auditsTotal, auditsCritical, auditsWarning, auditsOk, avgScoreAgg,
    imagesTotal, imagesApplied, imagesPending, imagesMissing,
    productsTotal,
    keywords,
    audits,
    images,
    lastJob,
    triageRows,
    triageCounts,
  ] = await Promise.all([
    // Keyword counts
    prisma.seoCandidate.count({ where: { storeId } }),
    prisma.seoCandidate.count({ where: { storeId, enrichedAt: { not: null } } }),
    prisma.seoCandidate.count({ where: { storeId, enrichedAt: { not: null }, score: { gte: 80 } } }),
    prisma.seoCandidate.count({ where: { storeId, enrichedAt: { not: null }, score: { gte: 50 } } }),
    // Audit counts
    prisma.seoAudit.count({ where: { storeId } }),
    prisma.seoAudit.count({ where: { storeId, score: { lt: 60 } } }),
    prisma.seoAudit.count({ where: { storeId, score: { gte: 60, lt: 80 } } }),
    prisma.seoAudit.count({ where: { storeId, score: { gte: 80 } } }),
    prisma.seoAudit.aggregate({ where: { storeId }, _avg: { score: true } }),
    // Image counts
    prisma.seoImageAlt.count({ where: { storeId } }),
    prisma.seoImageAlt.count({ where: { storeId, status: "applied" } }),
    prisma.seoImageAlt.count({ where: { storeId, status: "pending" } }),
    prisma.seoImageAlt.count({ where: { storeId, originalAlt: "" } }),
    // Products
    prisma.seoProduct.count({ where: { storeId, status: { not: "deleted" } } }),
    // Actual keyword rows (top 20 by volume)
    prisma.seoCandidate.findMany({
      where: { storeId, enrichedAt: { not: null } },
      distinct: ["keyword"],
      orderBy: { volume: "desc" },
      take: 500,
      select: {
        id: true, keyword: true, productTitle: true, volume: true,
        difficulty: true, score: true, competition: true, trend: true,
      },
    }),
    // Actual audit rows (worst 20 by score)
    prisma.seoAudit.findMany({
      where: { storeId },
      orderBy: { score: "asc" },
      take: 20,
      select: {
        id: true, productTitle: true, productHandle: true,
        score: true, metaTitleScore: true, metaDescScore: true,
        h1Score: true, handleScore: true, imageScore: true, ogScore: true,
        findings: true, auditedAt: true,
      },
    }),
    // Actual image rows (recent 20)
    prisma.seoImageAlt.findMany({
      where: { storeId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true, productTitle: true, imageUrl: true,
        originalAlt: true, suggestedAlt: true, status: true,
        suggestedFilename: true,
      },
    }),
    // Last finished job
    prisma.seoJob.findFirst({
      where: { storeId, status: "DONE" },
      orderBy: { finishedAt: "desc" },
      select: { type: true, finishedAt: true },
    }),
    // Triage results
    prisma.gscTriageResult.findMany({
      where: { storeId },
      orderBy: { priority: "desc" },
      take: 50,
      select: { id: true, keyword: true, clicks: true, impressions: true, position: true, ctr: true, action: true, priority: true },
    }).catch(() => []),
    prisma.gscTriageResult.groupBy({ by: ["action"], where: { storeId }, _count: true }).catch(() => []),
  ]);

  const avgScore = Math.round(avgScoreAgg?._avg?.score || 0);

  // Parse findings JSON for audits
  const parsedAudits = audits.map(a => {
    let parsedFindings = [];
    try { parsedFindings = JSON.parse(a.findings || "[]"); } catch {}
    return { ...a, parsedFindings };
  });

  return {
    stats: {
      keywordsTotal, keywordsEnriched, keywordsTop3, keywordsTop10,
      auditsTotal, auditsCritical, auditsWarning, auditsOk, avgScore,
      imagesTotal, imagesApplied, imagesPending, imagesMissing,
      productsTotal,
    },
    keywords,
    audits: parsedAudits,
    images,
    lastJob,
    triage: triageRows || [],
    triageCounts: Object.fromEntries((triageCounts || []).map(c => [c.action, c._count])),
  };
};

export default function SeoEngine() {
  const data = useLoaderData();
  const [activeTab, setActiveTab] = useState("kw");
  const [kwFilter, setKwFilter] = useState("all");
  const [triageFilter, setTriageFilter] = useState("all");
  const [kwSearch, setKwSearch] = useState("");
  const [kwPage, setKwPage] = useState(1);
  const [kwPerPage, setKwPerPage] = useState(25);

  const s = data?.stats;
  const lastJobText = data?.lastJob
    ? `Ultimul job ${data.lastJob.type} finalizat ${new Date(data.lastJob.finishedAt).toLocaleString("ro-RO")}`
    : "Niciun job finalizat inca";

  return (
    <div className="page active" id="page-seo">

      <div className="page-head">
        <div>
          <div className="greet-kicker">
            <span className="live-dot"></span>
            <span>{lastJobText}</span>
          </div>
          <h1 className="page-title">SEO <em>Engine</em></h1>
          <p className="page-sub">Keywords, on-page audit, imagini si internal linking — toate intr-un singur loc de control.</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
            Export CSV
          </button>
          <button className="btn btn-primary">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            Run audit
          </button>
        </div>
      </div>

      {/* TABS for SEO sub-sections */}
      <div className="tabs-bar">
        <button className={`tab ${activeTab === "kw" ? "active" : ""}`} onClick={() => setActiveTab("kw")} data-tab="kw">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          Keywords <span className="tab-count">{s ? fmt(s.keywordsEnriched) : "\u2014"}</span>
        </button>
        <button className={`tab ${activeTab === "audit" ? "active" : ""}`} onClick={() => setActiveTab("audit")} data-tab="audit">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13l2 2 4-4"/></svg>
          On-page Audit <span className="tab-count">{s ? fmt(s.auditsTotal) : "\u2014"}</span>
        </button>
        <button className={`tab ${activeTab === "img" ? "active" : ""}`} onClick={() => setActiveTab("img")} data-tab="img">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/></svg>
          Images <span className="tab-count">{s ? fmt(s.imagesTotal) : "\u2014"}</span>
        </button>
        <button className={`tab ${activeTab === "links" ? "active" : ""}`} onClick={() => setActiveTab("links")} data-tab="links">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M10 13a5 5 0 0 0 7.5 1L21 11a5 5 0 0 0-7-7l-1.5 1.5"/><path d="M14 11a5 5 0 0 0-7.5-1L3 13a5 5 0 0 0 7 7l1.5-1.5"/></svg>
          Internal Links
        </button>
        <button className={`tab ${activeTab === "triage" ? "active" : ""}`} onClick={() => setActiveTab("triage")} data-tab="triage">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 2v20M2 12h20"/></svg>
          Triage Routes
        </button>
      </div>

      {/* TAB: KEYWORDS */}
      <div className={`tab-panel ${activeTab === "kw" ? "active" : ""}`} id="tab-kw">

        <div className="toolbar">
          <div className="toolbar-left">
            <div className="search-input">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
              <input type="text" placeholder="Cauta keyword..." value={kwSearch} onChange={(e) => { setKwSearch(e.target.value); setKwPage(1); }} />
            </div>
            <div className="chip-group">
              <button className={`chip ${kwFilter === "all" ? "active" : ""}`} onClick={() => { setKwFilter("all"); setKwPage(1); }}>Toate <span className="ct">{s ? fmt(s.keywordsEnriched) : "\u2014"}</span></button>
              <button className={`chip ${kwFilter === "top3" ? "active" : ""}`} onClick={() => { setKwFilter("top3"); setKwPage(1); }}>Top 3 <span className="ct">{s ? fmt(s.keywordsTop3) : "\u2014"}</span></button>
              <button className={`chip ${kwFilter === "top10" ? "active" : ""}`} onClick={() => { setKwFilter("top10"); setKwPage(1); }}>Top 10 <span className="ct">{s ? fmt(s.keywordsTop10) : "\u2014"}</span></button>
              <button className={`chip ${kwFilter === "total" ? "active" : ""}`} onClick={() => { setKwFilter("total"); setKwPage(1); }}>Total <span className="ct">{s ? fmt(s.keywordsTotal) : "\u2014"}</span></button>
            </div>
          </div>
          <div className="toolbar-right">
            <button className="select">Intent: toate <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="m4 6 4 4 4-4"/></svg></button>
            <div className="seg">
              <button className="active">7d</button>
              <button>30d</button>
              <button>90d</button>
            </div>
          </div>
        </div>

        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Keyword <span className="sort">{"\u2195"}</span></th>
                <th>Produs</th>
                <th className="right">Volum <span className="sort">{"\u2195"}</span></th>
                <th className="right">KD</th>
                <th className="right">Score <span className="sort">{"\u2195"}</span></th>
                <th className="center">Competitie</th>
                <th className="center">Actiune</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const filteredKw = (data?.keywords || []).filter(kw => {
                  if (kwSearch && !kw.keyword.toLowerCase().includes(kwSearch.toLowerCase())) return false;
                  if (kwFilter === "top3") return (kw.score || 0) >= 80;
                  if (kwFilter === "top10") return (kw.score || 0) >= 50;
                  return true;
                });
                const totalPages = Math.ceil(filteredKw.length / kwPerPage);
                const paginatedKw = filteredKw.slice((kwPage - 1) * kwPerPage, kwPage * kwPerPage);
                return paginatedKw.length > 0 ? paginatedKw.map((kw) => (
                <tr key={kw.id}>
                  <td className="kw">{kw.keyword}</td>
                  <td className="mono" style={{maxWidth:"200px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{kw.productTitle}</td>
                  <td className="right mono">{fmt(kw.volume)}</td>
                  <td className="right mono">{kw.difficulty != null ? kw.difficulty : "\u2014"}</td>
                  <td className="right"><span className={`pos-pill ${(kw.score||0) >= 70 ? "top" : (kw.score||0) >= 40 ? "mid" : "low"}`}>{Math.round(kw.score || 0)}</span></td>
                  <td className="center"><span className={`intent ${kw.competition === "HIGH" ? "trans" : kw.competition === "MEDIUM" ? "comm" : "info"}`}>{kw.competition || "\u2014"}</span></td>
                  <td className="center"><button className="row-action">Audit</button></td>
                </tr>
              )) : (
                <tr><td colSpan={7} style={{textAlign:"center",padding:"32px",color:"#9ca3af"}}>Niciun keyword imbogatit inca. Ruleaza pipeline-ul SEO pentru a vedea date.</td></tr>
              );
              })()}
            </tbody>
          </table>
          {(() => {
            const filteredKw = (data?.keywords || []).filter(kw => {
              if (kwSearch && !kw.keyword.toLowerCase().includes(kwSearch.toLowerCase())) return false;
              if (kwFilter === "top3") return (kw.score || 0) >= 80;
              if (kwFilter === "top10") return (kw.score || 0) >= 50;
              return true;
            });
            const totalPages = Math.ceil(filteredKw.length / kwPerPage);
            return filteredKw.length > 0 ? (
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 0",fontSize:"13px",color:"var(--ink-3)"}}>
                <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
                  <span>Randuri per pagina:</span>
                  <select value={kwPerPage} onChange={(e) => { setKwPerPage(Number(e.target.value)); setKwPage(1); }} className="select" style={{padding:"4px 8px",fontSize:"12px"}}>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:"4px"}}>
                  <span>{(kwPage-1)*kwPerPage+1}-{Math.min(kwPage*kwPerPage, filteredKw.length)} din {filteredKw.length}</span>
                  <button className="btn btn-ghost" style={{padding:"4px 8px"}} disabled={kwPage <= 1} onClick={() => setKwPage(p => p-1)}>←</button>
                  <button className="btn btn-ghost" style={{padding:"4px 8px"}} disabled={kwPage >= totalPages} onClick={() => setKwPage(p => p+1)}>→</button>
                </div>
              </div>
            ) : null;
          })()}
        </div>
      </div>

      {/* TAB: ON-PAGE AUDIT */}
      <div className={`tab-panel ${activeTab === "audit" ? "active" : ""}`} id="tab-audit">

        <div className="toolbar">
          <div className="toolbar-left">
            <div className="search-input">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
              <input type="text" placeholder="Cauta URL sau pagina..." />
            </div>
            <div className="chip-group">
              <span className="chip active">Toate <span className="ct">{s ? fmt(s.auditsTotal) : "\u2014"}</span></span>
              <span className="chip">Critice <span className="ct">{s ? fmt(s.auditsCritical) : "\u2014"}</span></span>
              <span className="chip">Warning <span className="ct">{s ? fmt(s.auditsWarning) : "\u2014"}</span></span>
              <span className="chip">OK <span className="ct">{s ? fmt(s.auditsOk) : "\u2014"}</span></span>
            </div>
          </div>
          <div className="toolbar-right">
            <span style={{fontFamily:"var(--mono)",fontSize:"11.5px",color:"var(--ink-3)"}}>
              Scor mediu: <span style={{color: scoreColor(s?.avgScore || 0), fontWeight: "600"}}>{s?.avgScore || "\u2014"}</span>
            </span>
          </div>
        </div>

        <div className="audit-grid">
          {data?.audits?.length > 0 ? data.audits.map((a) => {
            const findings = a.parsedFindings || [];
            return (
              <div className="audit-card" key={a.id}>
                <div className="audit-head">
                  <div>
                    <div className="audit-url">/products/{a.productHandle}</div>
                  </div>
                  <div className="score-ring">
                    <svg viewBox="0 0 42 42">
                      <circle className="score-ring-bg" cx="21" cy="21" r="18" strokeWidth="4"/>
                      <circle className="score-ring-fg" cx="21" cy="21" r="18" strokeWidth="4" stroke={scoreColor(a.score)} strokeDasharray="113.1" strokeDashoffset={scoreDash(a.score)}/>
                    </svg>
                    <div className="score-ring-num">{a.score}</div>
                  </div>
                </div>
                <div className="audit-title">{a.productTitle}</div>
                <div className="audit-issues">
                  {findings.length > 0 ? findings.slice(0, 3).map((f, i) => {
                    const sev = f.severity === "error" || f.severity === "critical" ? "err" : f.severity === "warning" ? "warn" : "ok";
                    return (
                      <div className={`audit-issue ${sev}`} key={i}>
                        {sev === "err" ? (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                        ) : sev === "warn" ? (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/></svg>
                        ) : (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg>
                        )}
                        {f.field || f.message || f.label || "Check"}
                      </div>
                    );
                  }) : (
                    <>
                      <div className={`audit-issue ${a.metaTitleScore >= 80 ? "ok" : a.metaTitleScore >= 60 ? "warn" : "err"}`}>
                        {a.metaTitleScore >= 80 ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg> : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/></svg>}
                        Meta Title: {a.metaTitleScore}
                      </div>
                      <div className={`audit-issue ${a.metaDescScore >= 80 ? "ok" : a.metaDescScore >= 60 ? "warn" : "err"}`}>
                        {a.metaDescScore >= 80 ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg> : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/></svg>}
                        Meta Desc: {a.metaDescScore}
                      </div>
                      <div className={`audit-issue ${a.imageScore >= 80 ? "ok" : a.imageScore >= 60 ? "warn" : "err"}`}>
                        {a.imageScore >= 80 ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg> : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/></svg>}
                        Images: {a.imageScore}
                      </div>
                    </>
                  )}
                </div>
                <div className="audit-foot">
                  <span className="audit-meta">Score {a.score} / 100</span>
                  <button className="row-action">Apply fix</button>
                </div>
              </div>
            );
          }) : (
            <div style={{textAlign:"center",padding:"48px 24px",color:"#9ca3af",gridColumn:"1/-1"}}>Niciun audit inca. Ruleaza un On-page Audit din pagina dedicata.</div>
          )}
        </div>
      </div>

      {/* TAB: IMAGES */}
      <div className={`tab-panel ${activeTab === "img" ? "active" : ""}`} id="tab-img">

        <div className="toolbar">
          <div className="toolbar-left">
            <div className="search-input">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
              <input type="text" placeholder="Cauta imagine sau produs..." />
            </div>
            <div className="chip-group">
              <span className="chip active">Toate <span className="ct">{s ? fmt(s.imagesTotal) : "\u2014"}</span></span>
              <span className="chip">Aplicate <span className="ct">{s ? fmt(s.imagesApplied) : "\u2014"}</span></span>
              <span className="chip">Review <span className="ct">{s ? fmt(s.imagesPending) : "\u2014"}</span></span>
              <span className="chip">Lipsa alt <span className="ct">{s ? fmt(s.imagesMissing) : "\u2014"}</span></span>
            </div>
          </div>
          <div className="toolbar-right">
            <button className="btn btn-ghost">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg>
              Bulk approve ({s ? s.imagesPending : 0})
            </button>
          </div>
        </div>

        <div className="img-grid">
          {data?.images?.length > 0 ? data.images.map((img) => {
            const isOpt = img.status === "applied";
            const isPending = img.status === "pending";
            return (
              <div className="img-card" key={img.id}>
                <div className="img-thumb" style={{background: isOpt ? "linear-gradient(135deg,#e4ece2,#b8ccb0)" : isPending ? "linear-gradient(135deg,#f5eadd,#e2cfa9)" : "linear-gradient(135deg,#ece1d5,#c9b89a)"}}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/></svg>
                  <span className={`status ${isOpt ? "opt" : "pending"}`}>{isOpt ? "Aplicat" : isPending ? "Review" : img.status}</span>
                </div>
                <div className="img-body">
                  <div className="img-alt">{img.suggestedAlt || img.originalAlt || "Fara alt text"}</div>
                  <div className="img-meta">
                    <span style={{maxWidth:"140px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{img.suggestedFilename || img.productTitle}</span>
                    <span>{isOpt ? "Aplicat" : "Pending"}</span>
                  </div>
                </div>
              </div>
            );
          }) : (
            <div style={{textAlign:"center",padding:"48px 24px",color:"#9ca3af",gridColumn:"1/-1"}}>Niciun alt text generat inca. Ruleaza Image Optimizer.</div>
          )}
        </div>
      </div>

      {/* TAB: INTERNAL LINKS */}
      <div className={`tab-panel ${activeTab === "links" ? "active" : ""}`} id="tab-links">

        <div style={{padding:"12px 16px",borderRadius:"8px",fontSize:"13px",marginBottom:"16px",background:"#eff6ff",color:"#1d4ed8",border:"1px solid #bfdbfe"}}>
          Coming soon \u2014 Modulul Internal Links este in dezvoltare. Datele de mai jos sunt doar preview.
        </div>

        <div className="link-stats">
          <div className="link-stat">
            <div className="link-stat-label">Total links</div>
            <div className="link-stat-value">{"\u2014"}</div>
            <div className="link-stat-meta">coming soon</div>
          </div>
          <div className="link-stat">
            <div className="link-stat-label">Orphan pages</div>
            <div className="link-stat-value">{"\u2014"}</div>
            <div className="link-stat-meta">pagini fara inbound links</div>
          </div>
          <div className="link-stat">
            <div className="link-stat-label">Avg links / page</div>
            <div className="link-stat-value">{"\u2014"}</div>
            <div className="link-stat-meta">ideal: 5-10</div>
          </div>
          <div className="link-stat">
            <div className="link-stat-label">Broken internal</div>
            <div className="link-stat-value">{"\u2014"}</div>
            <div className="link-stat-meta">detectate la ultimul crawl</div>
          </div>
        </div>

        <div className="two-col">
          <div className="card">
            <div className="card-head">
              <div className="card-title">Pagini cu cele mai multe linkuri catre</div>
              <button className="card-action">Export <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 12h14M12 5l7 7-7 7"/></svg></button>
            </div>
            <div className="table-wrap" style={{border:"none",borderRadius:"0"}}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Pagina</th>
                    <th className="right">Inbound</th>
                    <th className="right">Outbound</th>
                    <th className="right">Score</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td colSpan={4} style={{textAlign:"center",padding:"24px",color:"#9ca3af"}}>Date disponibile in curand</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <div className="card-title">Oportunitati de linking</div>
              <button className="card-action">Toate <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 12h14M12 5l7 7-7 7"/></svg></button>
            </div>
            <div className="queue">
              <div style={{textAlign:"center",padding:"24px",color:"#9ca3af"}}>Date disponibile in curand</div>
            </div>
          </div>
        </div>

      </div>

      {/* TAB: TRIAGE ROUTES */}
      <div className={`tab-panel ${activeTab === "triage" ? "active" : ""}`} id="tab-triage">

        <div style={{padding:"12px 16px",borderRadius:"8px",fontSize:"13px",marginBottom:"16px",background:"#eff6ff",color:"#1d4ed8",border:"1px solid #bfdbfe"}}>
          Coming soon \u2014 Modulul Triage Routes este in dezvoltare. Datele de mai jos sunt doar preview.
        </div>

        <div className="toolbar">
          <div className="toolbar-left">
            <div className="chip-group">
              <span className="chip active">Toate <span className="ct">{"\u2014"}</span></span>
              <span className="chip">Audit route <span className="ct">{"\u2014"}</span></span>
              <span className="chip">Cluster route <span className="ct">{"\u2014"}</span></span>
              <span className="chip">No action <span className="ct">{"\u2014"}</span></span>
            </div>
          </div>
          <div className="toolbar-right">
            <button className="btn btn-primary">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 12a9 9 0 1 1-6.2-8.6"/><path d="M21 3v5h-5"/></svg>
              Run triage
            </button>
          </div>
        </div>

        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Keyword</th>
                <th className="right">Clicks</th>
                <th className="right">Impresii</th>
                <th className="right">Pozitie</th>
                <th className="right">CTR</th>
                <th className="center">Decizie</th>
                <th className="right">Priority</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const rows = (data?.triage || []).filter(t => triageFilter === "all" || t.action === triageFilter);
                return rows.length > 0 ? rows.map((t) => (
                  <tr key={t.id}>
                    <td className="kw">{t.keyword}</td>
                    <td className="right mono">{fmt(t.clicks)}</td>
                    <td className="right mono">{fmt(t.impressions)}</td>
                    <td className="right"><span className={`pos-pill ${t.position <= 3 ? "top" : t.position <= 10 ? "mid" : "low"}`}>{t.position?.toFixed(1)}</span></td>
                    <td className="right mono">{(t.ctr * 100).toFixed(1)}%</td>
                    <td className="center"><span className={`intent ${t.action === "AUDIT" ? "trans" : t.action === "BLOG" ? "comm" : "info"}`}>{t.action}</span></td>
                    <td className="right mono">{t.priority}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={7} style={{textAlign:"center",padding:"32px",color:"#9ca3af"}}>Niciun rezultat triage.</td></tr>
                );
              })()}
            </tbody>
          </table>
        </div>

      </div>

    </div>



  );
}
