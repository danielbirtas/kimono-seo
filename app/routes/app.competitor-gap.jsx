// app/routes/app.competitor-gap.jsx
// Kimono SEO #18 — Competitor Gap Analysis UI

import React, { useState, useEffect, useRef } from "react";
import { useLoaderData, useNavigate, useFetcher } from "react-router";
import prisma from "../db.server.js";

export const loader = async ({ request }) => {
  const { requireAuth } = await import("../lib/auth/index.server.js");
  const { storeId, connection } = await requireAuth(request);
  if (!storeId) return {};
  const store = await prisma.store.findUnique({ where: { id: storeId } });

  const [saved, compSetting, seedSetting, minVolSetting] = await Promise.all([
    prisma.seoSetting.findUnique({ where: { storeId_key: { storeId: store.id, key: "competitor_gap_results" } } }),
    prisma.seoSetting.findUnique({ where: { storeId_key: { storeId: store.id, key: "gap_competitors" } } }),
    prisma.seoSetting.findUnique({ where: { storeId_key: { storeId: store.id, key: "gap_seed_keywords" } } }),
    prisma.seoSetting.findUnique({ where: { storeId_key: { storeId: store.id, key: "gap_min_volume" } } }),
  ]);

  let data = null;
  if (saved?.value) { try { data = JSON.parse(saved.value); } catch {} }

  return {
    data,
    competitors: compSetting?.value || "",
    seedKeywords: seedSetting?.value || "",
    minVolume: parseInt(minVolSetting?.value || "100"),
    dfsActive:   !!(process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD),
  };
};

export default function CompetitorGapPage() {
  const { data: init, competitors: initComp, seedKeywords: initSeeds, minVolume: initMinVol, dfsActive } = useLoaderData();
  const navigate    = useNavigate();
  const [data,      setData]      = useState(init);
  const [competitors, setCompetitors] = useState(initComp);
  const [seeds, setSeeds] = useState(initSeeds);
  const [minVol, setMinVol] = useState(initMinVol);
  const kwFetcher = useFetcher();

  const prevKwData = React.useRef(null);
  useEffect(() => {
    if (kwFetcher.data && kwFetcher.data !== prevKwData.current) {
      prevKwData.current = kwFetcher.data;
      const raw = kwFetcher.data.keywords || [];
      const kws = raw.map(k => typeof k === "string" ? k : k.keyword || "").filter(Boolean).join("\n");
      if (kws) setSeeds(kws);
      else alert("No keywords found. Enter seed keywords manually.");
    }
  }, [kwFetcher.data]);
  const [analyzing, setAnalyzing] = useState(false);
  const [error,     setError]     = useState(null);
  const [filter,    setFilter]    = useState("all");
  const [sortBy,    setSortBy]    = useState("score");
  const [tblPage, setTblPage] = useState(1);
  const [tblPerPage, setTblPerPage] = useState(25);
  const [tblPage2, setTblPage2] = useState(1);
  const [tblPerPage2, setTblPerPage2] = useState(25);

  async function importFromKeywords() {
    try {
      const r = await fetch("/api/seo/keywords?intent=top_keywords&limit=5");
      const d = await r.json();
      if (d.keywords?.length) {
        setSeeds(d.keywords.map(k => k.keyword).join("\n"));
      }
    } catch (e) {
      console.error("Import failed:", e);
    }
  }

  async function saveAndAnalyze() {
    setAnalyzing(true);
    setError(null);
    try {
      await fetch("/api/competitor-gap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "save_competitors", competitors, seedKeywords: seeds, minVolume: minVol }),
      });
      const r = await fetch("/api/competitor-gap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "analyze" }),
      });
      const d = await r.json();
      if (d.success) setData(d);
      else setError(d.error);
    } catch (e) { setError(e.message); }
    setAnalyzing(false);
  }

  const filtered = (data?.gaps || []).sort((a, b) => b.score - a.score);

  return (
    <div className="page active">
      <div className="page-head">
        <div>
          <h1 className="page-title">Competitor Gap Analysis</h1>
          <p className="page-sub">Keywords your competitors rank for — that you don't. Sorted by opportunity score.</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={saveAndAnalyze} disabled={analyzing || !dfsActive || !competitors.trim()}>
            {analyzing ? "Analyzing..." : "Analyze"}
          </button>
        </div>
      </div>

      {!dfsActive && <div className="alert-banner warn">DataForSEO not configured</div>}

      {/* Competitor input */}
      <div className="card" style={{marginBottom:20}}>
        <div className="card-head"><div className="card-title">Configuration</div></div>
        <div style={{padding:"14px 16px"}}>
          <label className="editor-label">Competitor Domains (one per line, max 5)</label>
          <textarea className="editor-input" value={competitors} onChange={e => setCompetitors(e.target.value)} placeholder={"competitor1.ro\ncompetitor2.ro\ncompetitor3.ro"} rows={4} style={{border:"1px solid var(--line)",borderRadius:"var(--r-sm)",padding:"7px 11px",resize:"vertical",fontFamily:"var(--mono)"}} />
          <div className="editor-hint">Enter only the domain (e.g. emag.ro, dedeman.ro) — no https:// needed</div>

          <div style={{height:16}} />

          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <label className="editor-label" style={{margin:0}}>Seed Keywords (one per line, max 5)</label>
            <button className="btn btn-ghost" onClick={importFromKeywords} style={{fontSize:11,padding:"3px 10px"}}>Import din Keywords</button>
          </div>
          <textarea className="editor-input" value={seeds} onChange={e => setSeeds(e.target.value)} placeholder={"tigai fonta\nvase ceramica\ncutite bucatarie"} rows={3} style={{border:"1px solid var(--line)",borderRadius:"var(--r-sm)",padding:"7px 11px",resize:"vertical",fontFamily:"var(--mono)"}} />
          <div style={{display:"flex",gap:8,alignItems:"center",marginTop:8}}>
            <button className="btn btn-ghost" onClick={() => kwFetcher.load("/api/seo/keywords?intent=top_keywords&limit=10")} style={{fontSize:12}}>
              {kwFetcher.state !== "idle" ? "Loading..." : "Import from GSC"}
            </button>
            <button className="btn btn-ghost" onClick={() => kwFetcher.load("/api/seo/keywords?intent=top_product_keywords&limit=10")} style={{fontSize:12}}>
              {kwFetcher.state !== "idle" ? "Loading..." : "Import from Products"}
            </button>
            <span style={{fontSize:11,color:"var(--ink-4)"}}>or type manually</span>
          </div>
          <div className="editor-hint">Keywords din nisa ta — max 60 keywords verificate per analiza (~60 sec).</div>

          <div style={{height:16}} />

          <label className="editor-label">Minimum Search Volume</label>
          <div className="chip-group">
            {[0, 50, 100, 250, 500, 1000].map(v => (
              <button key={v} onClick={() => setMinVol(v)} className={`chip ${minVol === v ? "active" : ""}`}>
                {v === 0 ? "All" : v.toLocaleString() + "+"}
              </button>
            ))}
            <span style={{fontSize:12,color:"var(--ink-4)"}}>searches/mo</span>
          </div>
          <div className="editor-hint">Keywords cu volum mai mic sunt filtrate.</div>
        </div>
      </div>

      {error && <div className="alert-banner warn">{error}</div>}

      {data && (
        <>
          <div className="metric-grid">
            {[
              { label: "Gap Opportunities", value: data.gapCount },
              { label: "Keywords checked", value: data.keywordsChecked || 0 },
              { label: "1 competitor",  value: (data.gaps||[]).filter(g=>g.compCount===1).length },
              { label: "2+ competitors", value: (data.gaps||[]).filter(g=>g.compCount>=2).length },
            ].map(s => (
              <div key={s.label} className="metric">
                <div className="metric-label">{s.label}</div>
                <div className="metric-value">{s.value}</div>
              </div>
            ))}
          </div>

          <div style={{fontSize:12,color:"var(--ink-4)",marginBottom:12}}>
            Checked <strong style={{color:"var(--ink-1)"}}>{data.keywordsChecked}</strong> keywords | <strong style={{color:"var(--ink-1)"}}>{data.ownDomain}</strong> vs <strong style={{color:"var(--ink-1)"}}>{data.competitors?.join(", ")}</strong>
            {data.analyzedAt && ` · ${new Date(data.analyzedAt).toLocaleString("ro-RO")}`}
          </div>

          {/* Filter + Sort */}
          <div className="toolbar" style={{marginBottom:12}}>
            <div style={{fontSize:13,color:"var(--ink-3)"}}>Showing all {data.gapCount} gap opportunities</div>
            <div className="toolbar-right">
              <span style={{fontSize:12,color:"var(--ink-3)"}}>Sort:</span>
              <div className="seg">
                {[["score", "Opportunity"], ["volume", "Volume"]].map(([k, l]) => (
                  <button key={k} onClick={() => { setSortBy(k); setTblPage(1); }} className={sortBy === k ? "active" : ""}>{l}</button>
                ))}
              </div>
            </div>
          </div>

          {/* Results table */}
          <div className="table-wrap" style={{marginBottom:16}}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Keyword</th>
                  <th className="center">Competitors in top 10</th>
                  <th className="center">Difficulty</th>
                  <th className="center">Position</th>
                  <th className="right">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice((tblPage-1)*tblPerPage, tblPage*tblPerPage).map((g, i) => (
                  <tr key={i}>
                    <td className="kw">
                      <div>{g.keyword}</div>
                      <div className="data-row-meta">via {g.competitor}</div>
                    </td>
                    <td className="center"><span className="q-tag info">{g.compCount || 1} found</span></td>
                    <td className="center mono" style={{color:"var(--ink-4)"}}>N/A</td>
                    <td className="center">
                      <span style={{fontWeight:600,color: g.compPosition <= 3 ? "var(--danger)" : "var(--warn)"}}>#{g.compPosition}</span>
                      <div className="data-row-meta">{g.competitor}</div>
                    </td>
                    <td className="right">
                      <button onClick={() => navigate(`/app/blog?keyword=${encodeURIComponent(g.keyword)}`)} className="row-action">Create content</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filtered.length > tblPerPage && (
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
                <span>{(tblPage-1)*tblPerPage+1}–{Math.min(tblPage*tblPerPage, filtered.length)} din {filtered.length}</span>
                <button style={{padding:"4px 8px",border:"1px solid var(--line)",borderRadius:"6px",background:"var(--surface)",cursor:"pointer"}} disabled={tblPage <= 1} onClick={() => setTblPage(p => p-1)}>←</button>
                <button style={{padding:"4px 8px",border:"1px solid var(--line)",borderRadius:"6px",background:"var(--surface)",cursor:"pointer"}} disabled={tblPage >= Math.ceil(filtered.length/tblPerPage)} onClick={() => setTblPage(p => p+1)}>→</button>
              </div>
            </div>
          )}

          <div style={{fontSize:11,color:"var(--ink-4)"}}>
            Showing top {Math.min(filtered.length, 50)} of {filtered.length} gaps · Method: {data.method || "serp"}
          </div>

          {/* All competitors found */}
          {data.allCompetitors?.length > 0 && (
            <div className="card" style={{marginTop:20}}>
              <div className="card-head"><div className="card-title">All domains ranking for your seed keywords ({data.allCompetitors.length})</div></div>
              <div className="table-wrap" style={{border:"none",borderRadius:0}}>
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Domain</th>
                      <th className="center">Keywords overlap</th>
                      <th className="center">Avg Position</th>
                      <th className="center">Est. Traffic</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.allCompetitors.slice((tblPage2-1)*tblPerPage2, tblPage2*tblPerPage2).map((c, i) => {
                      const isOwn  = c.domain.includes(data.ownDomain?.split(".")[0] || "");
                      const isComp = data.competitors?.some(comp => c.domain.includes(comp.split(".")[0]));
                      const badge  = isOwn ? "You" : isComp ? "Competitor" : "";
                      const badgeCls = isOwn ? "info" : "critical";
                      return (
                        <tr key={i}>
                          <td className="kw">
                            {c.domain}
                            {badge && <span className={`q-tag ${badgeCls}`} style={{marginLeft:8}}>{badge}</span>}
                          </td>
                          <td className="center" style={{fontWeight:600,color: c.intersections > 2 ? "var(--danger)" : "var(--ink-0)"}}>{c.intersections}</td>
                          <td className="center mono">#{Math.round(c.avgPosition || 0)}</td>
                          <td className="center mono">{Math.round(c.etv || 0)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {data.allCompetitors.length > tblPerPage2 && (
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
                      <span>{(tblPage2-1)*tblPerPage2+1}–{Math.min(tblPage2*tblPerPage2, data.allCompetitors.length)} din {data.allCompetitors.length}</span>
                      <button style={{padding:"4px 8px",border:"1px solid var(--line)",borderRadius:"6px",background:"var(--surface)",cursor:"pointer"}} disabled={tblPage2 <= 1} onClick={() => setTblPage2(p => p-1)}>←</button>
                      <button style={{padding:"4px 8px",border:"1px solid var(--line)",borderRadius:"6px",background:"var(--surface)",cursor:"pointer"}} disabled={tblPage2 >= Math.ceil(data.allCompetitors.length/tblPerPage2)} onClick={() => setTblPage2(p => p+1)}>→</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {!data && !analyzing && (
        <div className="card" style={{padding:48,textAlign:"center"}}>
          <div style={{fontSize:40,marginBottom:12}}>🎯</div>
          <div style={{fontSize:16,fontWeight:700,color:"var(--ink-0)",marginBottom:8}}>No analysis yet</div>
          <div style={{fontSize:13,color:"var(--ink-3)"}}>Add competitor domains above and click Analyze to find keyword gaps.</div>
        </div>
      )}
    </div>
  );
}
