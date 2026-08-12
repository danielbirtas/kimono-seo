import { useLoaderData } from "react-router";
import { useState } from "react";
import { requireAuth } from "../lib/auth/index.server.js";
import prisma from "../db.server.js";

const fmt = (n) => {
  if (n == null) return "0";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
};

export const loader = async ({ request }) => {
  const { storeId } = await requireAuth(request);
  if (!storeId) return { gscQueries: [], kwStats: { totalKw: 0, avgVol: 0, totalVol: 0 }, triageResults: [] };

  const [
    gscTriageResults,
    keywordStats,
  ] = await Promise.all([
    prisma.gscTriageResult.findMany({
      where: { storeId },
      orderBy: { clicks: "desc" },
      take: 30,
      select: { id: true, keyword: true, clicks: true, impressions: true, position: true, ctr: true, action: true, priority: true },
    }).catch(() => []),
    prisma.seoKeyword.aggregate({
      where: { storeId },
      _count: true,
      _sum: { volume: true },
      _avg: { volume: true },
    }).catch(() => ({ _count: 0, _sum: { volume: 0 }, _avg: { volume: 0 } })),
  ]);

  // Compute GSC totals from triage results
  const totalClicks = gscTriageResults.reduce((s, r) => s + (r.clicks || 0), 0);
  const totalImpressions = gscTriageResults.reduce((s, r) => s + (r.impressions || 0), 0);
  const avgCtr = gscTriageResults.length > 0 ? gscTriageResults.reduce((s, r) => s + (r.ctr || 0), 0) / gscTriageResults.length : 0;
  const avgPosition = gscTriageResults.length > 0 ? gscTriageResults.reduce((s, r) => s + (r.position || 0), 0) / gscTriageResults.length : 0;

  return {
    gscQueries: gscTriageResults,
    kwStats: {
      totalKw: keywordStats._count || 0,
      avgVol: Math.round(keywordStats._avg?.volume || 0),
      totalVol: keywordStats._sum?.volume || 0,
    },
    gscTotals: { totalClicks, totalImpressions, avgCtr, avgPosition },
  };
};

export default function Analytics() {
  const data = useLoaderData();
  const [activeTab, setActiveTab] = useState("an-overview");
  const [tblPage, setTblPage] = useState(1);
  const [tblPerPage, setTblPerPage] = useState(25);
  const [tblPage2, setTblPage2] = useState(1);
  const [tblPerPage2, setTblPerPage2] = useState(25);

  const gscQueries = data?.gscQueries || [];
  const kwStats = data?.kwStats || { totalKw: 0, avgVol: 0, totalVol: 0 };
  const gscTotals = data?.gscTotals || { totalClicks: 0, totalImpressions: 0, avgCtr: 0, avgPosition: 0 };

  const posClass = (p) => p <= 3 ? "top" : p <= 10 ? "mid" : "low";

  return (
    <div className="page active" id="page-analytics">

      <div className="page-head">
        <div>
          <div className="greet-kicker">
            <span className="live-dot"></span>
            <span>{fmt(kwStats.totalKw)} keywords tracked · {fmt(gscQueries.length)} GSC queries · date din DB</span>
          </div>
          <h1 className="page-title"><em>Analytics</em></h1>
          <p className="page-sub">Trafic, keywords si date GSC. Conecteaza GA4 in Settings pentru analytics complet.</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost">Export CSV</button>
          <button className="btn btn-primary">Refresh data</button>
        </div>
      </div>

      {/* Top KPIs */}
      <div className="metric-grid" style={{"gridTemplateColumns":"repeat(6,1fr)"}}>
        <div className="metric">
          <div className="metric-label">GSC Clicks</div>
          <div className="metric-value">{fmt(gscTotals.totalClicks)}</div>
          <div className="metric-foot"><span className="kpi-sub">total din triage</span></div>
        </div>
        <div className="metric">
          <div className="metric-label">GSC Impressions</div>
          <div className="metric-value">{fmt(gscTotals.totalImpressions)}</div>
          <div className="metric-foot"><span className="kpi-sub">total din triage</span></div>
        </div>
        <div className="metric">
          <div className="metric-label">Avg CTR</div>
          <div className="metric-value">{gscTotals.avgCtr > 0 ? gscTotals.avgCtr.toFixed(1) : "0"}<span className="unit">%</span></div>
          <div className="metric-foot"><span className="kpi-sub">media queries</span></div>
        </div>
        <div className="metric">
          <div className="metric-label">Avg Position</div>
          <div className="metric-value">{gscTotals.avgPosition > 0 ? gscTotals.avgPosition.toFixed(1) : "—"}</div>
          <div className="metric-foot"><span className="kpi-sub">media GSC</span></div>
        </div>
        <div className="metric">
          <div className="metric-label">Keywords DB</div>
          <div className="metric-value">{fmt(kwStats.totalKw)}</div>
          <div className="metric-foot"><span className="kpi-sub">avg vol: {fmt(kwStats.avgVol)}</span></div>
        </div>
        <div className="metric">
          <div className="metric-label">Vol total</div>
          <div className="metric-value">{fmt(kwStats.totalVol)}</div>
          <div className="metric-foot"><span className="kpi-sub">cautari/luna</span></div>
        </div>
      </div>

      <div className="subnav">
        <button className={`subnav-tab ${activeTab === "an-overview" ? "active" : ""}`} onClick={() => setActiveTab("an-overview")} data-subtab="an-overview">Overview</button>
        <button className={`subnav-tab ${activeTab === "an-pages" ? "active" : ""}`} onClick={() => setActiveTab("an-pages")} data-subtab="an-pages">Top Pages</button>
        <button className={`subnav-tab ${activeTab === "an-gsc" ? "active" : ""}`} onClick={() => setActiveTab("an-gsc")} data-subtab="an-gsc">Search Console</button>
      </div>

      {/* PANEL: OVERVIEW */}
      <div className={`subnav-panel ${activeTab === "an-overview" ? "active" : ""}`} id="an-overview">
        <div className="two-col-sm">
          <div className="card">
            <div className="card-head"><div className="card-title">Top GSC queries dupa clicks</div></div>
            <div style={{"padding":"14px 18px"}}>
              {gscQueries.slice(0, 10).map((q, i) => (
                <div className="bar-list-item" key={q.id} style={i === 0 ? {"border":"none","padding":"8px 0"} : {"padding":"8px 0"}}>
                  <div>
                    <div className="bar-list-name">{q.keyword}</div>
                    <div className="bar-list-bar">
                      <div className="bar-list-bar-fill" style={{"width":`${Math.min(100, gscQueries[0]?.clicks > 0 ? (q.clicks / gscQueries[0].clicks * 100) : 0)}%`,"background":"var(--accent)"}}></div>
                    </div>
                  </div>
                  <div className="bar-list-val">{fmt(q.clicks)} clicks</div>
                </div>
              ))}
              {gscQueries.length === 0 && (
                <div style={{padding:"20px 0",color:"var(--ink-3)",fontSize:"13px",textAlign:"center"}}>Nicio data GSC triage disponibila.</div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-head"><div className="card-title">GSC Actions breakdown</div></div>
            <div style={{"padding":"14px 18px"}}>
              {(() => {
                const actions = {};
                gscQueries.forEach(q => { actions[q.action] = (actions[q.action] || 0) + 1; });
                const entries = Object.entries(actions).sort((a, b) => b[1] - a[1]);
                const colors = { AUDIT: "var(--danger)", BLOG: "var(--accent)", MONITOR: "var(--info)" };
                return entries.length > 0 ? entries.map(([action, count], i) => (
                  <div className="bar-list-item" key={action} style={i === 0 ? {"border":"none","padding":"8px 0"} : {"padding":"8px 0"}}>
                    <div>
                      <div className="bar-list-name">{action}</div>
                      <div className="bar-list-bar">
                        <div className="bar-list-bar-fill" style={{"width":`${Math.min(100, count / gscQueries.length * 100)}%`,"background":colors[action] || "var(--ink-4)"}}></div>
                      </div>
                    </div>
                    <div className="bar-list-val">{count} queries</div>
                  </div>
                )) : (
                  <div style={{padding:"20px 0",color:"var(--ink-3)",fontSize:"13px",textAlign:"center"}}>Nicio data disponibila.</div>
                );
              })()}
            </div>
          </div>
        </div>
      </div>

      {/* PANEL: PAGES */}
      <div className={`subnav-panel ${activeTab === "an-pages" ? "active" : ""}`} id="an-pages">
        {gscQueries.length > 0 ? (
          <div className="card">
            <div className="card-head"><div className="card-title">Top pagini dupa clicks (GSC)</div></div>
            <div className="table-wrap" style={{"border":"none","borderRadius":"0"}}>
              <table className="tbl">
                <thead><tr><th>Query</th><th className="right">Clicks</th><th className="right">Impressions</th><th className="right">CTR</th><th className="right">Pozitie</th><th>Actiune</th></tr></thead>
                <tbody>
                  {gscQueries.slice((tblPage-1)*tblPerPage, tblPage*tblPerPage).map((q) => (
                    <tr key={q.id}>
                      <td className="kw">{q.keyword}</td>
                      <td className="right mono">{fmt(q.clicks)}</td>
                      <td className="right mono">{fmt(q.impressions)}</td>
                      <td className="right mono">{q.ctr > 0 ? q.ctr.toFixed(1) + "%" : "—"}</td>
                      <td className="right"><span className={`pos-pill ${posClass(q.position)}`}>{q.position > 0 ? q.position.toFixed(1) : "—"}</span></td>
                      <td><span className={`q-tag ${q.action === "AUDIT" ? "warn" : q.action === "BLOG" ? "info" : "ok"}`}>{q.action}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {gscQueries.length > tblPerPage && (
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
                    <span>{(tblPage-1)*tblPerPage+1}–{Math.min(tblPage*tblPerPage, gscQueries.length)} din {gscQueries.length}</span>
                    <button style={{padding:"4px 8px",border:"1px solid var(--line)",borderRadius:"6px",background:"var(--surface)",cursor:"pointer"}} disabled={tblPage <= 1} onClick={() => setTblPage(p => p-1)}>←</button>
                    <button style={{padding:"4px 8px",border:"1px solid var(--line)",borderRadius:"6px",background:"var(--surface)",cursor:"pointer"}} disabled={tblPage >= Math.ceil(gscQueries.length/tblPerPage)} onClick={() => setTblPage(p => p+1)}>→</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="card" style={{textAlign:"center",padding:"48px 24px"}}>
            <div style={{fontSize:18,fontWeight:600,color:"var(--ink-0)",marginBottom:8}}>Nicio data de trafic disponibila</div>
            <p style={{color:"var(--ink-3)",fontSize:14,maxWidth:440,margin:"0 auto"}}>
              Conecteaza Google Analytics 4 in Settings pentru a vedea date de trafic detaliate.
            </p>
          </div>
        )}
      </div>

      {/* PANEL: GSC */}
      <div className={`subnav-panel ${activeTab === "an-gsc" ? "active" : ""}`} id="an-gsc">
        <div className="metric-grid">
          <div className="metric"><div className="metric-label">Total clicks</div><div className="metric-value">{fmt(gscTotals.totalClicks)}</div><div className="metric-foot"><span className="kpi-sub">din triage</span></div></div>
          <div className="metric"><div className="metric-label">Total impressions</div><div className="metric-value">{fmt(gscTotals.totalImpressions)}</div><div className="metric-foot"><span className="kpi-sub">din triage</span></div></div>
          <div className="metric"><div className="metric-label">Avg. CTR</div><div className="metric-value">{gscTotals.avgCtr > 0 ? gscTotals.avgCtr.toFixed(2) : "0"}<span className="unit">%</span></div><div className="metric-foot"><span className="kpi-sub">media queries</span></div></div>
          <div className="metric"><div className="metric-label">Avg. position</div><div className="metric-value">{gscTotals.avgPosition > 0 ? gscTotals.avgPosition.toFixed(1) : "—"}</div><div className="metric-foot"><span className="kpi-sub">media GSC</span></div></div>
        </div>

        <div className="card">
          <div className="card-head"><div className="card-title">GSC Triage · top queries cu oportunitati</div></div>
          <div className="table-wrap" style={{"border":"none","borderRadius":"0"}}>
            <table className="tbl">
              <thead><tr><th>Query</th><th className="right">Impressions</th><th className="right">Clicks</th><th className="right">CTR</th><th className="right">Pozitie</th><th>Actiune</th><th className="right">Priority</th></tr></thead>
              <tbody>
                {gscQueries.length > 0 ? gscQueries.slice((tblPage2-1)*tblPerPage2, tblPage2*tblPerPage2).map((q) => (
                  <tr key={q.id}>
                    <td className="kw">{q.keyword}</td>
                    <td className="right mono">{fmt(q.impressions)}</td>
                    <td className="right mono">{fmt(q.clicks)}</td>
                    <td className="right mono">{q.ctr > 0 ? q.ctr.toFixed(1) + "%" : "—"}</td>
                    <td className="right"><span className={`pos-pill ${posClass(q.position)}`}>{q.position > 0 ? q.position.toFixed(1) : "—"}</span></td>
                    <td>
                      <span className={`q-tag ${q.action === "AUDIT" ? "warn" : q.action === "BLOG" ? "info" : "ok"}`}>{q.action}</span>
                    </td>
                    <td className="right mono">{q.priority}</td>
                  </tr>
                )) : (
                  <tr><td colSpan="7" style={{textAlign:"center",padding:"20px",color:"var(--ink-3)"}}>Nicio data GSC triage. Conecteaza Search Console si ruleaza triage-ul.</td></tr>
                )}
              </tbody>
            </table>
            {gscQueries.length > tblPerPage2 && (
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 0",fontSize:"13px",color:"var(--ink-3)"}}>
                <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
                  <span>Randuri per pagina:</span>
                  <select value={tblPerPage2} onChange={(e) => { setTblPerPage2(Number(e.target.value)); setTblPage2(1); }} style={{padding:"4px 8px",fontSize:"12px",borderRadius:"6px",border:"1px solid var(--line)"}}>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:"4px"}}>
                  <span>{(tblPage2-1)*tblPerPage2+1}–{Math.min(tblPage2*tblPerPage2, gscQueries.length)} din {gscQueries.length}</span>
                  <button style={{padding:"4px 8px",border:"1px solid var(--line)",borderRadius:"6px",background:"var(--surface)",cursor:"pointer"}} disabled={tblPage2 <= 1} onClick={() => setTblPage2(p => p-1)}>←</button>
                  <button style={{padding:"4px 8px",border:"1px solid var(--line)",borderRadius:"6px",background:"var(--surface)",cursor:"pointer"}} disabled={tblPage2 >= Math.ceil(gscQueries.length/tblPerPage2)} onClick={() => setTblPage2(p => p+1)}>→</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
