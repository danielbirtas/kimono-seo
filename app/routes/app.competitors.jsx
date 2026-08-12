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
  if (!storeId) return { gapData: null, topicalMap: null, competitors: "", gapKeywords: [] };

  const [gapSaved, compSetting, topicalMapRaw] = await Promise.all([
    prisma.seoSetting.findUnique({ where: { storeId_key: { storeId, key: "competitor_gap_results" } } }).catch(() => null),
    prisma.seoSetting.findUnique({ where: { storeId_key: { storeId, key: "gap_competitors" } } }).catch(() => null),
    prisma.seoTopicalMap.findFirst({ where: { storeId }, orderBy: { runAt: "desc" } }).catch(() => null),
  ]);

  let gapData = null;
  if (gapSaved?.value) { try { gapData = JSON.parse(gapSaved.value); } catch {} }

  const competitors = compSetting?.value || "";
  const competitorList = competitors.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);

  // Parse gap keywords
  let gapKeywords = [];
  if (gapData?.keywords) {
    gapKeywords = gapData.keywords;
  } else if (gapData?.gaps) {
    gapKeywords = gapData.gaps;
  }

  // Parse topical map
  let topicalMap = null;
  if (topicalMapRaw) {
    topicalMap = {
      topics: topicalMapRaw.topics || [],
      gaps: topicalMapRaw.gaps || [],
      editorialPlan: topicalMapRaw.editorialPlan || [],
      competitors: topicalMapRaw.competitors || [],
    };
  }

  return { gapData, topicalMap, competitors, competitorList, gapKeywords };
};

export default function Competitors() {
  const data = useLoaderData();
  const [activeTab, setActiveTab] = useState("cp-gap");
  const [tblPage, setTblPage] = useState(1);
  const [tblPerPage, setTblPerPage] = useState(25);
  const [tblPage2, setTblPage2] = useState(1);
  const [tblPerPage2, setTblPerPage2] = useState(25);

  const gapData = data?.gapData;
  const topicalMap = data?.topicalMap;
  const competitorList = data?.competitorList || [];
  const gapKeywords = data?.gapKeywords || [];
  const topics = topicalMap?.topics || [];
  const gaps = topicalMap?.gaps || [];

  const totalGap = gapKeywords.length;

  return (
    <div className="page active" id="page-competitors">

      <div className="page-head">
        <div>
          <div className="greet-kicker">
            <span className="live-dot"></span>
            <span>{competitorList.length} competitori tracked · {fmt(totalGap)} keywords gap · {topics.length > 0 ? topics.length + " topics mapped" : "topical map pending"}</span>
          </div>
          <h1 className="page-title">Competitor <em>Intelligence</em></h1>
          <p className="page-sub">Comparatie cu competitorii directi. Keywords gap, topical map, strategie de continut si gaps.</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost">Adauga competitor</button>
          <button className="btn btn-primary">Export report</button>
        </div>
      </div>

      {/* Competitor overview cards */}
      {competitorList.length > 0 && (
      <div className="three-col" style={{"gridTemplateColumns":`repeat(${Math.min(4, competitorList.length)},1fr)`,"marginBottom":"18px"}}>
        {competitorList.slice(0, 4).map((comp, i) => {
          const colors = [
            {bg:"#fee2e2",color:"#dc2626"},
            {bg:"#fef3c7",color:"#d97706"},
            {bg:"#dbeafe",color:"#2563eb"},
            {bg:"#ede9fe",color:"#7c3aed"},
          ];
          const c = colors[i % colors.length];
          return (
            <div className="module-card" key={i}>
              <div className="module-card-head">
                <div className="module-card-left">
                  <div className="module-card-icon" style={{"background":c.bg,"color":c.color}}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"/></svg>
                  </div>
                  <div className="module-card-body">
                    <div className="module-card-title">{comp}</div>
                    <div className="module-card-num">Competitor {i + 1}</div>
                  </div>
                </div>
              </div>
              <div className="module-card-desc">Competitor direct tracked in gap analysis.</div>
              <div className="module-card-foot">
                <div className="module-card-stat">
                  <span>Domain</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      )}

      {competitorList.length === 0 && (
        <div className="alert-banner info" style={{marginBottom:"18px"}}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
          <span>Niciun competitor configurat. Foloseste pagina <b>Competitor Gap</b> pentru a adauga competitori si rula prima analiza.</span>
        </div>
      )}

      <div className="subnav">
        <button className={`subnav-tab ${activeTab === "cp-gap" ? "active" : ""}`} onClick={() => setActiveTab("cp-gap")} data-subtab="cp-gap">Keywords Gap <span className="sn-pill">{fmt(totalGap)}</span></button>
        <button className={`subnav-tab ${activeTab === "cp-topics" ? "active" : ""}`} onClick={() => setActiveTab("cp-topics")} data-subtab="cp-topics">Topical Map</button>
        <button className={`subnav-tab ${activeTab === "cp-gaps" ? "active" : ""}`} onClick={() => setActiveTab("cp-gaps")} data-subtab="cp-gaps">Content Gaps</button>
      </div>

      {/* PANEL: GAP */}
      <div className={`subnav-panel ${activeTab === "cp-gap" ? "active" : ""}`} id="cp-gap">
        <div className="card">
          <div className="card-head">
            <div className="card-title">Keywords gap — unde competitorii sunt, noi lipsim</div>
            <button className="card-action">Filtreaza</button>
          </div>
          <div className="table-wrap" style={{"border":"none","borderRadius":"0"}}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Keyword</th>
                  <th className="right">Volum</th>
                  <th className="right">KD</th>
                  <th className="right">Noi</th>
                  {competitorList.slice(0, 4).map((c, i) => (
                    <th className="right" key={i}>{c.length > 12 ? c.slice(0, 10) + ".." : c}</th>
                  ))}
                  <th className="center">Score</th>
                </tr>
              </thead>
              <tbody>
                {gapKeywords.length > 0 ? gapKeywords.slice((tblPage-1)*tblPerPage, tblPage*tblPerPage).map((kw, i) => {
                  const keyword = kw.keyword || kw.query || kw;
                  const volume = kw.volume || kw.search_volume || 0;
                  const kd = kw.difficulty || kw.kd || kw.competition_index || "—";
                  const ourPos = kw.our_position || kw.ourRank || "—";
                  const positions = kw.competitor_positions || kw.competitors || {};
                  const score = kw.score || kw.opportunity_score || "—";

                  return (
                    <tr key={i}>
                      <td className="kw">{typeof keyword === "string" ? keyword : "—"}</td>
                      <td className="right mono">{fmt(volume)}</td>
                      <td className="right mono">{kd}</td>
                      <td className="right">{ourPos === "—" || ourPos === 0 || ourPos == null ? "—" : <span className={`pos-pill ${ourPos <= 3 ? "top" : ourPos <= 10 ? "mid" : "low"}`}>{ourPos}</span>}</td>
                      {competitorList.slice(0, 4).map((c, ci) => {
                        const pos = positions[c] || positions[ci] || "—";
                        return (
                          <td className="right" key={ci}>
                            {pos === "—" || pos === 0 || pos == null ? "—" : <span className={`pos-pill ${pos <= 3 ? "top" : pos <= 10 ? "mid" : "low"}`}>{pos}</span>}
                          </td>
                        );
                      })}
                      <td className="center"><span className="q-tag info">{score}</span></td>
                    </tr>
                  );
                }) : (
                  <tr><td colSpan={4 + competitorList.length} style={{textAlign:"center",padding:"20px",color:"var(--ink-3)"}}>
                    Niciun keyword gap detectat. Ruleaza analiza din pagina Competitor Gap.
                  </td></tr>
                )}
              </tbody>
            </table>
            {gapKeywords.length > tblPerPage && (
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
                  <span>{(tblPage-1)*tblPerPage+1}–{Math.min(tblPage*tblPerPage, gapKeywords.length)} din {gapKeywords.length}</span>
                  <button style={{padding:"4px 8px",border:"1px solid var(--line)",borderRadius:"6px",background:"var(--surface)",cursor:"pointer"}} disabled={tblPage <= 1} onClick={() => setTblPage(p => p-1)}>←</button>
                  <button style={{padding:"4px 8px",border:"1px solid var(--line)",borderRadius:"6px",background:"var(--surface)",cursor:"pointer"}} disabled={tblPage >= Math.ceil(gapKeywords.length/tblPerPage)} onClick={() => setTblPage(p => p+1)}>→</button>
                </div>
              </div>
            )}
          </div>
        </div>

        {gapData?.summary && (
          <div className="card" style={{marginTop:"14px"}}>
            <div className="card-head"><div className="card-title">Summary</div></div>
            <div style={{padding:"14px 18px",fontSize:"13px",color:"var(--ink-2)",lineHeight:"1.6"}}>
              {typeof gapData.summary === "string" ? gapData.summary : JSON.stringify(gapData.summary)}
            </div>
          </div>
        )}
      </div>

      {/* PANEL: TOPICS */}
      <div className={`subnav-panel ${activeTab === "cp-topics" ? "active" : ""}`} id="cp-topics">
        <div className="card">
          <div className="card-head"><div className="card-title">Topical Authority Map</div></div>
          {topics.length > 0 ? (
          <div className="table-wrap" style={{"border":"none","borderRadius":"0"}}>
            <table className="tbl">
              <thead><tr><th>Topic</th><th className="right">Own Keywords</th><th className="right">Own Avg Vol</th><th className="right">Competitor KW</th><th className="right">Gap Score</th></tr></thead>
              <tbody>
                {topics.slice((tblPage2-1)*tblPerPage2, tblPage2*tblPerPage2).map((t, i) => (
                  <tr key={i}>
                    <td className="kw">{t.topic || "—"}</td>
                    <td className="right mono">{fmt(t.ownKwCount)}</td>
                    <td className="right mono">{fmt(t.ownAvgVol)}</td>
                    <td className="right mono">{fmt(t.competitorKwCount)}</td>
                    <td className="right">
                      <span className={`pos-pill ${(t.gapScore || 0) > 70 ? "low" : (t.gapScore || 0) > 40 ? "mid" : "top"}`}>
                        {t.gapScore?.toFixed ? t.gapScore.toFixed(0) : t.gapScore || "—"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {topics.length > tblPerPage2 && (
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
                  <span>{(tblPage2-1)*tblPerPage2+1}–{Math.min(tblPage2*tblPerPage2, topics.length)} din {topics.length}</span>
                  <button style={{padding:"4px 8px",border:"1px solid var(--line)",borderRadius:"6px",background:"var(--surface)",cursor:"pointer"}} disabled={tblPage2 <= 1} onClick={() => setTblPage2(p => p-1)}>←</button>
                  <button style={{padding:"4px 8px",border:"1px solid var(--line)",borderRadius:"6px",background:"var(--surface)",cursor:"pointer"}} disabled={tblPage2 >= Math.ceil(topics.length/tblPerPage2)} onClick={() => setTblPage2(p => p+1)}>→</button>
                </div>
              </div>
            )}
          </div>
          ) : (
            <div style={{padding:"20px 18px",color:"var(--ink-3)",fontSize:"13px",textAlign:"center"}}>
              Niciun topical map generat. Ruleaza modulul Topical Authority Map din pagina SEO.
            </div>
          )}
        </div>
      </div>

      {/* PANEL: GAPS */}
      <div className={`subnav-panel ${activeTab === "cp-gaps" ? "active" : ""}`} id="cp-gaps">
        <div className="card">
          <div className="card-head"><div className="card-title">Content Gaps · oportunitati de continut</div></div>
          {gaps.length > 0 ? (
          <div style={{"padding":"4px 0"}}>
            {gaps.slice(0, 15).map((g, i) => (
              <div className="data-row" style={{"gridTemplateColumns":"1fr auto auto auto"}} key={i}>
                <div className="data-row-main">
                  <div className="data-row-title">{g.topic || g.keyword || "—"}</div>
                  <div className="data-row-meta">
                    {g.opportunity || g.reason || ""}{g.estimatedVolume ? ` · vol: ${fmt(g.estimatedVolume)}` : ""}{g.estimatedKeywords ? ` · ${g.estimatedKeywords} kw` : ""}
                  </div>
                </div>
                <span className={`q-tag ${g.priority === "high" ? "warn" : g.priority === "medium" ? "info" : "ok"}`}>{g.priority || "—"}</span>
                <span className="count">{g.estimatedKeywords ? `${g.estimatedKeywords} kw` : ""}</span>
                <button className="row-action">Plan</button>
              </div>
            ))}
          </div>
          ) : (
            <div style={{padding:"20px 18px",color:"var(--ink-3)",fontSize:"13px",textAlign:"center"}}>
              Niciun gap de continut detectat. Ruleaza Topical Authority Map pentru a identifica oportunitati.
            </div>
          )}
        </div>

        {topicalMap?.editorialPlan && topicalMap.editorialPlan.length > 0 && (
          <div className="card" style={{marginTop:"14px"}}>
            <div className="card-head"><div className="card-title">Editorial Plan sugerat</div></div>
            <div style={{"padding":"4px 0"}}>
              {topicalMap.editorialPlan.slice(0, 6).map((month, i) => (
                <div className="data-row" key={i}>
                  <div className="data-row-main">
                    <div className="data-row-title">Luna {month.month || i + 1}</div>
                    <div className="data-row-meta">
                      {(month.articles || []).slice(0, 3).map(a => a.title || a.keyword).join(", ")}
                      {(month.articles || []).length > 3 && ` + ${month.articles.length - 3} altele`}
                    </div>
                  </div>
                  <span className="count">{(month.articles || []).length} articole</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
