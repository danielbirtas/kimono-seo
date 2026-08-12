import { useLoaderData } from "react-router";
import { useState } from "react";
import { requireAuth } from "../lib/auth/index.server.js";
import prisma from "../db.server.js";

const fmt = (n) => {
  if (n == null) return "\u2014";
  if (typeof n === "number") return n.toLocaleString("ro-RO");
  return String(n);
};

export const loader = async ({ request }) => {
  const { storeId } = await requireAuth(request);
  if (!storeId) return { storeId: null, articles: [], clusters: [], articleStats: {}, topicalMap: null, recommendations: [] };

  const [
    articles,
    clusters,
    totalArticles,
    publishedCount,
    draftCount,
    reviewCount,
    topicalMap,
    recommendations,
  ] = await Promise.all([
    prisma.blogArticle.findMany({
      where: { storeId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true, primaryKeyword: true, articleType: true, titleTag: true,
        urlSlug: true, wordCount: true, status: true, generatedAt: true,
        publishedAt: true, h1: true, clusterId: true,
      },
    }).catch(() => []),
    prisma.blogCluster.findMany({
      where: { storeId },
      orderBy: { priorityScore: "desc" },
      take: 30,
      include: { _count: { select: { articles: true } } },
    }).catch(() => []),
    prisma.blogArticle.count({ where: { storeId } }).catch(() => 0),
    prisma.blogArticle.count({ where: { storeId, status: "published" } }).catch(() => 0),
    prisma.blogArticle.count({ where: { storeId, status: "draft" } }).catch(() => 0),
    prisma.blogArticle.count({ where: { storeId, status: "review" } }).catch(() => 0),
    prisma.seoTopicalMap.findFirst({ where: { storeId }, orderBy: { createdAt: "desc" } }).catch(() => null),
    prisma.blogRecommendation.findMany({
      where: { storeId },
      orderBy: { createdAt: "desc" },
      take: 10,
    }).catch(() => []),
  ]);

  const clusterCount = clusters.length;
  const activeClusterCount = clusters.filter(c => c.status === "in_progress" || c.status === "done").length;
  const proposedClusterCount = clusters.filter(c => c.status === "pending").length;

  return {
    storeId,
    articles,
    clusters,
    articleStats: {
      total: totalArticles,
      published: publishedCount,
      draft: draftCount,
      review: reviewCount,
      clusterCount,
      activeClusterCount,
      proposedClusterCount,
    },
    topicalMap,
    recommendations,
  };
};

export default function ContentBlog() {
  const data = useLoaderData() || {};
  const {
    articles = [],
    clusters = [],
    articleStats = {},
    topicalMap = null,
    recommendations = [],
  } = data;

  const [activeTab, setActiveTab] = useState("cnt-clusters");
  const [tblPage, setTblPage] = useState(1);
  const [tblPerPage, setTblPerPage] = useState(25);
  const [tblPage2, setTblPage2] = useState(1);
  const [tblPerPage2, setTblPerPage2] = useState(25);

  const published = articleStats.published || 0;
  const clusterCount = articleStats.clusterCount || 0;
  const activeClusterCount = articleStats.activeClusterCount || 0;
  const draftCount = articleStats.draft || 0;

  const statusLabel = (s) => {
    if (s === "published") return { label: "Live", cls: "live" };
    if (s === "draft") return { label: "Draft", cls: "dev" };
    if (s === "review") return { label: "Review", cls: "queue" };
    if (s === "in_progress") return { label: "Gen...", cls: "queue" };
    return { label: s || "\u2014", cls: "queue" };
  };

  const typeLabel = (t) => {
    if (t === "pillar") return { short: "PLR", bg: "var(--ink-0)", color: "#fff" };
    if (t === "satellite") return { short: "SAT", bg: "var(--accent-soft)", color: "var(--accent-ink)" };
    if (t === "howto") return { short: "HOW", bg: "var(--info-soft)", color: "var(--info)" };
    if (t === "comparison") return { short: "CMP", bg: "var(--warn-soft)", color: "var(--warn)" };
    if (t === "listicle") return { short: "LST", bg: "var(--purple-soft)", color: "var(--purple)" };
    return { short: (t || "?").slice(0, 3).toUpperCase(), bg: "var(--surface-2)", color: "var(--ink-3)" };
  };

  const clusterStatusBadge = (s) => {
    if (s === "done" || s === "in_progress") return { label: "ACTIVE", color: "var(--accent-ink)", bg: "var(--accent-soft)" };
    if (s === "pending") return { label: "PROPUS", color: "var(--info)", bg: "var(--info-soft)" };
    return { label: (s || "").toUpperCase(), color: "var(--ink-3)", bg: "var(--surface-2)" };
  };

  let topicalTopics = [];
  let topicalGaps = [];
  try {
    if (topicalMap?.topics) topicalTopics = typeof topicalMap.topics === "string" ? JSON.parse(topicalMap.topics) : topicalMap.topics;
    if (topicalMap?.gaps) topicalGaps = typeof topicalMap.gaps === "string" ? JSON.parse(topicalMap.gaps) : topicalMap.gaps;
  } catch {}

  const supportKws = (c) => {
    try {
      const arr = typeof c.supportingKeywords === "string" ? JSON.parse(c.supportingKeywords) : c.supportingKeywords;
      return Array.isArray(arr) ? arr : [];
    } catch { return []; }
  };

  return (
    <div className="page active" id="page-content">

      <div className="page-head">
        <div>
          <div className="greet-kicker">
            <span className="live-dot"></span>
            <span>{clusters.length > 0 || articles.length > 0 ? `${fmt(clusterCount)} clustere \u00b7 ${fmt(published)} articole publicate` : "Niciun articol inca"}</span>
          </div>
          <h1 className="page-title">Content &amp; <em>Blog</em></h1>
          <p className="page-sub">Clustere, articole generate, mining din recenzii, topical authority si detectia articolelor care pierd pozitii.</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 2v20M2 12h20"/></svg>
            Cluster nou
          </button>
          <button className="btn btn-primary">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
            Articol nou
          </button>
        </div>
      </div>

      <div className="metric-grid" style={{"gridTemplateColumns":"repeat(6,1fr)"}}>
        <div className="metric">
          <div className="metric-label">Articole publicate</div>
          <div className="metric-value">{fmt(published)}</div>
          <div className="metric-foot"><span className="kpi-sub">{fmt(articleStats.total)} total</span></div>
        </div>
        <div className="metric">
          <div className="metric-label">Clustere active</div>
          <div className="metric-value">{fmt(clusterCount)}</div>
          <div className="metric-foot"><span className="kpi-sub">{fmt(activeClusterCount)} active &middot; {fmt(articleStats.proposedClusterCount || 0)} propuse</span></div>
        </div>
        <div className="metric">
          <div className="metric-label">In draft</div>
          <div className="metric-value">{fmt(draftCount)}</div>
          <div className="metric-foot"><span className="kpi-sub">{fmt(articleStats.review || 0)} in review</span></div>
        </div>
        <div className="metric">
          <div className="metric-label">Topical coverage</div>
          <div className="metric-value">{topicalTopics.length > 0 ? `${Math.round((topicalTopics.filter(t => (t.ownKwCount || 0) > 0).length / Math.max(1, topicalTopics.length)) * 100)}` : "\u2014"}<span className="unit">{topicalTopics.length > 0 ? "%" : ""}</span></div>
          <div className="metric-foot"><span className="kpi-sub">{topicalTopics.length > 0 ? `${topicalTopics.length} topics` : "No data"}</span></div>
        </div>
        <div className="metric">
          <div className="metric-label">Topic gaps</div>
          <div className="metric-value">{topicalGaps.length > 0 ? fmt(topicalGaps.length) : "\u2014"}</div>
          <div className="metric-foot"><span className="kpi-sub">oportunitati</span></div>
        </div>
        <div className="metric">
          <div className="metric-label">Recomandari</div>
          <div className="metric-value">{fmt(recommendations.length)}</div>
          <div className="metric-foot"><span className="kpi-sub">sugestii noi</span></div>
        </div>
      </div>

      <div className="subnav">
        <button className={`subnav-tab ${activeTab === "cnt-clusters" ? "active" : ""}`} onClick={() => setActiveTab("cnt-clusters")} data-subtab="cnt-clusters">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="3"/><circle cx="5" cy="5" r="2"/><circle cx="19" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/></svg>
          Blog Clusters <span className="sn-pill">{fmt(clusterCount)}</span>
        </button>
        <button className={`subnav-tab ${activeTab === "cnt-articles" ? "active" : ""}`} onClick={() => setActiveTab("cnt-articles")} data-subtab="cnt-articles">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
          Articole <span className="sn-pill">{fmt(articleStats.total || 0)}</span>
        </button>
        <button className={`subnav-tab ${activeTab === "cnt-decay" ? "active" : ""}`} onClick={() => setActiveTab("cnt-decay")} data-subtab="cnt-decay">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 3v18h18"/></svg>
          Content Decay
        </button>
        <button className={`subnav-tab ${activeTab === "cnt-authority" ? "active" : ""}`} onClick={() => setActiveTab("cnt-authority")} data-subtab="cnt-authority">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 2L2 7l10 5 10-5-10-5z"/></svg>
          Topical Authority
        </button>
        <button className={`subnav-tab ${activeTab === "cnt-reviews" ? "active" : ""}`} onClick={() => setActiveTab("cnt-reviews")} data-subtab="cnt-reviews">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26"/></svg>
          Review Mining
        </button>
        <button className={`subnav-tab ${activeTab === "cnt-calendar" ? "active" : ""}`} onClick={() => setActiveTab("cnt-calendar")} data-subtab="cnt-calendar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
          Seasonal Calendar
        </button>
      </div>

      {/* PANEL: CLUSTERS */}
      <div className={`subnav-panel ${activeTab === "cnt-clusters" ? "active" : ""}`} id="cnt-clusters">

        <div className="toolbar">
          <div className="toolbar-left">
            <div className="search-input">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
              <input type="text" placeholder="Cauta cluster..." />
            </div>
            <div className="chip-group">
              <span className="chip active">Toate <span className="ct">{fmt(clusterCount)}</span></span>
              <span className="chip">Active <span className="ct">{fmt(activeClusterCount)}</span></span>
              <span className="chip">Propuse <span className="ct">{fmt(articleStats.proposedClusterCount || 0)}</span></span>
            </div>
          </div>
        </div>

        {clusters.length > 0 ? (
          <>
            <div className="three-col" style={{"marginBottom":"18px"}}>
              {clusters.slice(0, 6).map((c) => {
                const badge = clusterStatusBadge(c.status);
                const kws = supportKws(c);
                return (
                  <div className="card" key={c.id}>
                    <div className="card-head">
                      <div className="card-title">
                        <span style={{"width":"8px","height":"8px","borderRadius":"50%","background": badge.color,"display":"inline-block"}}></span>
                        {c.primaryKeyword}
                      </div>
                      <span className="count" style={{"fontFamily":"var(--mono)","fontSize":"10.5px","color":badge.color,"background":badge.bg,"padding":"2px 7px","borderRadius":"10px","fontWeight":"600"}}>{badge.label}</span>
                    </div>
                    <div style={{"padding":"14px 16px"}}>
                      <div style={{"display":"grid","gridTemplateColumns":"1fr 1fr 1fr","gap":"10px","padding":"10px 12px","background":"var(--surface-2)","borderRadius":"6px"}}>
                        <div><div style={{"fontSize":"10.5px","color":"var(--ink-3)"}}>Articles</div><div style={{"fontSize":"15px","fontWeight":"600","color":"var(--ink-0)","fontVariantNumeric":"tabular-nums"}}>{c._count?.articles != null ? c._count.articles : "\u2014"}</div></div>
                        <div><div style={{"fontSize":"10.5px","color":"var(--ink-3)"}}>Volum est.</div><div style={{"fontSize":"15px","fontWeight":"600","color":"var(--ink-0)","fontVariantNumeric":"tabular-nums"}}>{c.estimatedVolume ? fmt(c.estimatedVolume) : "\u2014"}</div></div>
                        <div><div style={{"fontSize":"10.5px","color":"var(--ink-3)"}}>Prioritate</div><div style={{"fontSize":"15px","fontWeight":"600","color":"var(--accent-ink)","fontVariantNumeric":"tabular-nums"}}>{c.priorityScore ? c.priorityScore.toFixed(1) : "\u2014"}</div></div>
                      </div>
                      {kws.length > 0 && (
                        <div style={{"marginTop":"12px","display":"flex","flexWrap":"wrap","gap":"4px"}}>
                          {kws.slice(0, 2).map((k, i) => <span className="q-tag info" style={{"fontSize":"10px"}} key={i}>{k}</span>)}
                          {kws.length > 2 && <span className="q-tag info" style={{"fontSize":"10px"}}>+{kws.length - 2}</span>}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {clusters[0] && (
              <div className="card">
                <div className="card-head">
                  <div className="card-title">Cluster: {clusters[0].primaryKeyword} <span className="count">{clusters[0]._count?.articles ?? 0} articles</span></div>
                </div>
                <div className="table-wrap" style={{"border":"none","borderRadius":"0"}}>
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th style={{"width":"40px"}}>Tip</th>
                        <th>Titlu</th>
                        <th>Keyword principal</th>
                        <th className="right">Cuvinte</th>
                        <th className="center">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {articles.filter(a => a.clusterId === clusters[0].id).slice((tblPage2-1)*tblPerPage2, tblPage2*tblPerPage2).map((a) => {
                        const t = typeLabel(a.articleType);
                        const s = statusLabel(a.status);
                        return (
                          <tr key={a.id}>
                            <td><span style={{"fontFamily":"var(--mono)","fontSize":"10px","fontWeight":"700","background":t.bg,"color":t.color,"padding":"2px 6px","borderRadius":"4px"}}>{t.short}</span></td>
                            <td className="kw">{a.titleTag || a.h1 || a.primaryKeyword}</td>
                            <td className="mono">{a.primaryKeyword}</td>
                            <td className="right mono">{a.wordCount ? fmt(a.wordCount) : "\u2014"}</td>
                            <td className="center"><span className={`mod-status ${s.cls}`}><span className="dot"></span>{s.label}</span></td>
                          </tr>
                        );
                      })}
                      {articles.filter(a => a.clusterId === clusters[0].id).length === 0 && (
                        <tr><td colSpan="5" style={{"textAlign":"center","color":"var(--ink-3)","padding":"20px"}}>Niciun articol in acest cluster</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="card" style={{"textAlign":"center","padding":"40px","color":"var(--ink-3)"}}>
            <p>Niciun cluster creat inca. Creeaza primul cluster pentru a organiza articolele.</p>
          </div>
        )}
      </div>

      {/* PANEL: ARTICLES */}
      <div className={`subnav-panel ${activeTab === "cnt-articles" ? "active" : ""}`} id="cnt-articles">
        {articles.length > 0 ? (
          <>
            <div className="card">
              <div className="card-head">
                <div className="card-title">Toate articolele <span className="count">{fmt(articleStats.total || articles.length)}</span></div>
              </div>
              <div className="table-wrap" style={{"border":"none","borderRadius":"0"}}>
                <table className="tbl">
                  <thead>
                    <tr>
                      <th style={{"width":"40px"}}>Tip</th>
                      <th>Titlu</th>
                      <th>Keyword</th>
                      <th className="right">Cuvinte</th>
                      <th className="center">Status</th>
                      <th className="right">Data</th>
                    </tr>
                  </thead>
                  <tbody>
                    {articles.slice((tblPage-1)*tblPerPage, tblPage*tblPerPage).map((a) => {
                      const t = typeLabel(a.articleType);
                      const s = statusLabel(a.status);
                      const d = a.publishedAt || a.generatedAt;
                      return (
                        <tr key={a.id}>
                          <td><span style={{"fontFamily":"var(--mono)","fontSize":"10px","fontWeight":"700","background":t.bg,"color":t.color,"padding":"2px 6px","borderRadius":"4px"}}>{t.short}</span></td>
                          <td className="kw">{a.titleTag || a.h1 || a.primaryKeyword}</td>
                          <td className="mono">{a.primaryKeyword}</td>
                          <td className="right mono">{a.wordCount ? fmt(a.wordCount) : "\u2014"}</td>
                          <td className="center"><span className={`mod-status ${s.cls}`}><span className="dot"></span>{s.label}</span></td>
                          <td className="right mono" style={{"fontSize":"11px","color":"var(--ink-3)"}}>{d ? new Date(d).toLocaleDateString("ro-RO") : "\u2014"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              {articles.length > tblPerPage && (
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
                    <span>{(tblPage-1)*tblPerPage+1}–{Math.min(tblPage*tblPerPage, articles.length)} din {articles.length}</span>
                    <button style={{padding:"4px 8px",border:"1px solid var(--line)",borderRadius:"6px",background:"var(--surface)",cursor:"pointer"}} disabled={tblPage <= 1} onClick={() => setTblPage(p => p-1)}>←</button>
                    <button style={{padding:"4px 8px",border:"1px solid var(--line)",borderRadius:"6px",background:"var(--surface)",cursor:"pointer"}} disabled={tblPage >= Math.ceil(articles.length/tblPerPage)} onClick={() => setTblPage(p => p+1)}>→</button>
                  </div>
                </div>
              )}
              </div>
            </div>

            {articles.filter(a => a.status === "draft").length > 0 && (
              <div className="card" style={{"marginTop":"14px"}}>
                <div className="card-head"><div className="card-title">Articole in draft <span className="count">{articles.filter(a => a.status === "draft").length}</span></div></div>
                <div className="activity">
                  {articles.filter(a => a.status === "draft").slice(0, 6).map((a) => (
                    <div className="act-item" key={a.id}>
                      <div className="act-ico info"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/></svg></div>
                      <div className="act-body"><div className="act-title">{a.titleTag || a.h1 || a.primaryKeyword}</div><div className="act-meta">{a.wordCount ? `${fmt(a.wordCount)} cuv.` : "\u2014"}</div></div>
                      <div className="act-time">{a.generatedAt ? new Date(a.generatedAt).toLocaleDateString("ro-RO") : "\u2014"}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="card" style={{"textAlign":"center","padding":"40px","color":"var(--ink-3)"}}>
            <p>Niciun articol generat inca. Foloseste generatorul pentru a crea primul articol.</p>
          </div>
        )}
      </div>

      {/* PANEL: DECAY */}
      <div className={`subnav-panel ${activeTab === "cnt-decay" ? "active" : ""}`} id="cnt-decay">
        <div className="alert-banner warn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><line x1="12" y1="9" x2="12" y2="13"/></svg>
          <span>Content decay detection vine curand. Articolele care pierd pozitii vor fi detectate automat din GSC.</span>
        </div>

        <div className="two-col-lg">
          <div className="chart-card">
            <div className="chart-head">
              <div>
                <div className="chart-title">Trafic organic articole decay &mdash; 90 zile</div>
                <div className="chart-meta">Detectie automata din GSC &middot; in curand</div>
              </div>
            </div>
            <svg className="chart-svg" viewBox="0 0 480 160" preserveAspectRatio="none">
              <line className="grid" x1="0" y1="32" x2="480" y2="32"/>
              <line className="grid" x1="0" y1="64" x2="480" y2="64"/>
              <line className="grid" x1="0" y1="96" x2="480" y2="96"/>
              <line className="grid" x1="0" y1="128" x2="480" y2="128"/>
              <text className="label" x="240" y="80" textAnchor="middle">No data yet</text>
            </svg>
          </div>

          <div className="card">
            <div className="card-head"><div className="card-title">Cauze frecvente de decay</div></div>
            <div style={{"padding":"4px 0"}}>
              <div className="data-row"><div className="data-row-main"><div className="data-row-title">Continut outdated (date vechi, preturi)</div><div className="data-row-meta">Detectie automata din GSC</div></div></div>
              <div className="data-row"><div className="data-row-main"><div className="data-row-title">Intent shift in SERP</div><div className="data-row-meta">Competitorii au continut mai bun</div></div></div>
              <div className="data-row"><div className="data-row-main"><div className="data-row-title">Lipsa FAQ / PAA actualizate</div><div className="data-row-meta">FAQ lipsa sau irelevant</div></div></div>
            </div>
          </div>
        </div>
      </div>

      {/* PANEL: AUTHORITY */}
      <div className={`subnav-panel ${activeTab === "cnt-authority" ? "active" : ""}`} id="cnt-authority">
        <div className="two-col-sm">
          <div className="chart-card">
            <div className="chart-head">
              <div>
                <div className="chart-title">Topical coverage</div>
                <div className="chart-meta">{topicalTopics.length > 0 ? `${topicalTopics.length} topics identificate` : "Niciun topic map inca"}</div>
              </div>
            </div>
            {topicalTopics.length > 0 ? (
              <div style={{"marginTop":"12px","display":"flex","flexDirection":"column","gap":"10px"}}>
                {topicalTopics.slice(0, 8).map((t, i) => {
                  const coverage = t.ownKwCount && t.competitorKwCount ? Math.min(100, Math.round((t.ownKwCount / Math.max(1, t.competitorKwCount)) * 100)) : 0;
                  return (
                    <div className="bar-list-item" style={{"border":"none","padding":"0"}} key={i}>
                      <div><div className="bar-list-name">{t.topic || `Topic ${i + 1}`}</div><div className="bar-list-bar"><div className="bar-list-bar-fill" style={{"width":`${coverage}%`,"background":"var(--ink-0)"}}></div></div></div>
                      <div className="bar-list-val">{coverage}%</div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{"padding":"30px","textAlign":"center","color":"var(--ink-3)","fontSize":"13px"}}>Ruleaza Topical Map pentru a vedea coverage-ul pe topics.</div>
            )}
          </div>

          <div className="card">
            <div className="card-head"><div className="card-title">Gap-uri prioritare</div></div>
            <div style={{"padding":"14px 16px"}}>
              {topicalGaps.length > 0 ? (
                <>
                  <div style={{"display":"grid","gridTemplateColumns":"1fr 1fr","gap":"10px","marginBottom":"14px"}}>
                    <div style={{"textAlign":"center","padding":"10px","background":"var(--accent-soft)","borderRadius":"6px"}}>
                      <div style={{"fontSize":"20px","fontWeight":"600","color":"var(--accent-ink)","fontVariantNumeric":"tabular-nums"}}>{topicalTopics.filter(t => (t.ownKwCount || 0) > 0).length}</div>
                      <div style={{"fontSize":"11px","color":"var(--accent-ink)","marginTop":"2px"}}>Acoperite</div>
                    </div>
                    <div style={{"textAlign":"center","padding":"10px","background":"var(--danger-soft)","borderRadius":"6px"}}>
                      <div style={{"fontSize":"20px","fontWeight":"600","color":"var(--danger)","fontVariantNumeric":"tabular-nums"}}>{topicalGaps.length}</div>
                      <div style={{"fontSize":"11px","color":"var(--danger)","marginTop":"2px"}}>Gaps</div>
                    </div>
                  </div>
                  <div style={{"fontSize":"11px","color":"var(--ink-3)","textTransform":"uppercase","letterSpacing":".08em","fontWeight":"600","marginBottom":"10px"}}>Top gap-uri</div>
                  <div style={{"display":"flex","flexDirection":"column","gap":"6px"}}>
                    {topicalGaps.slice(0, 5).map((g, i) => (
                      <div style={{"display":"flex","justifyContent":"space-between","fontSize":"12.5px","padding":"5px 0"}} key={i}>
                        <span style={{"color":"var(--ink-1)"}}>{g.topic || `Gap ${i + 1}`}</span>
                        <span style={{"fontFamily":"var(--mono)","color":"var(--ink-3)"}}>{g.estimatedVolume ? `${fmt(g.estimatedVolume)} vol` : "\u2014"}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div style={{"textAlign":"center","color":"var(--ink-3)","fontSize":"13px","padding":"20px"}}>No topical gaps data yet</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* PANEL: REVIEWS */}
      <div className={`subnav-panel ${activeTab === "cnt-reviews" ? "active" : ""}`} id="cnt-reviews">
        <div className="card" style={{"textAlign":"center","padding":"40px","color":"var(--ink-3)"}}>
          <p>Review mining vine curand. Vom extrage keywords si use cases din recenzii Judge.me &amp; Loox.</p>
        </div>
      </div>

      {/* PANEL: CALENDAR */}
      <div className={`subnav-panel ${activeTab === "cnt-calendar" ? "active" : ""}`} id="cnt-calendar">
        <div className="alert-banner info">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
          <span>Calendar editorial sezonier &mdash; vine curand.</span>
        </div>
        <div className="card" style={{"textAlign":"center","padding":"40px","color":"var(--ink-3)"}}>
          <p>Calendarul editorial va fi generat automat pe baza tendintelor de cautare si sezonalitatii.</p>
        </div>
      </div>

    </div>



  );
}
