// app/routes/app.intent-shift.jsx
// Kimono SEO #26 — Search Intent Shift Detection UI

import { useLoaderData, useNavigate } from "react-router";
import { useState } from "react";
import prisma from "../db.server.js";

export const loader = async ({ request }) => {
  const { requireAuth } = await import("../lib/auth/index.server.js");
  const { storeId, connection } = await requireAuth(request);
  if (!storeId) return {};
  const store = await prisma.store.findUnique({ where: { id: storeId } });

  const [saved, kwSetting] = await Promise.all([
    prisma.seoSetting.findUnique({ where: { storeId_key: { storeId: store.id, key: "intent_shift_results" } } }),
    prisma.seoSetting.findUnique({ where: { storeId_key: { storeId: store.id, key: "intent_shift_keywords" } } }),
  ]);

  let data = null;
  if (saved?.value) { try { data = JSON.parse(saved.value); } catch {} }

  return {
    data,
    keywords:  kwSetting?.value || "",
    dfsActive: !!(process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD),
  };
};

const TYPE_LABELS = {
  product:       "Product",
  category:      "Category",
  blog:          "Blog",
  informational: "Informational",
  commercial:    "Commercial",
  listicle:      "Listicle",
  video:         "Video",
  forum:         "Forum",
  other:         "Other",
};

function TypeBadge({ type, count }) {
  return (
    <span className="q-tag info">
      {TYPE_LABELS[type] || type}{count !== undefined && <span style={{opacity:.7}}> x{count}</span>}
    </span>
  );
}

function SerpBar({ typeCounts, total = 10 }) {
  const types = Object.entries(typeCounts || {}).sort((a, b) => b[1] - a[1]);
  return (
    <div className="prog" style={{display:"flex",overflow:"hidden"}}>
      {types.map(([type, count]) => (
        <div key={type} className="prog-fill ok" style={{width:`${(count / total) * 100}%`,borderRadius:0}} />
      ))}
    </div>
  );
}

export default function IntentShiftPage() {
  const { data: init, keywords: initKw, dfsActive } = useLoaderData();
  const navigate  = useNavigate();
  const [data,    setData]    = useState(init);
  const [keywords, setKeywords] = useState(initKw);
  const [running,  setRunning]  = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [activeTab, setActiveTab] = useState("shifts");

  async function saveAndRun() {
    setRunning(true);
    setError(null);
    try {
      if (keywords.trim()) {
        await fetch("/api/intent-shift", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ intent: "save_keywords", keywords }),
        });
      }
      const r = await fetch("/api/intent-shift", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "run" }),
      });
      const d = await r.json();
      if (d.success) { setData(d); setActiveTab(d.shiftsFound > 0 ? "shifts" : "all"); }
      else setError(d.error);
    } catch (e) { setError(e.message); }
    setRunning(false);
  }

  const withShifts = (data?.results || []).filter(r => r.hasShift);
  const allResults = (data?.results || []);
  const displayList = activeTab === "shifts" ? withShifts : allResults;

  return (
    <div className="page active">
      <div className="page-head">
        <div>
          <h1 className="page-title">Search Intent Shift Detection</h1>
          <p className="page-sub">Monitors SERP composition weekly — alerts when Google changes what type of content ranks for your keywords.</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={saveAndRun} disabled={running || !dfsActive}>
            {running ? "Checking..." : "Run Check"}
          </button>
        </div>
      </div>

      {!dfsActive && <div className="alert-banner warn">DataForSEO not configured</div>}

      {/* Keywords input */}
      <div className="card" style={{marginBottom:20}}>
        <div className="card-head"><div className="card-title">Keywords to Monitor</div></div>
        <div style={{padding:"14px 16px"}}>
          <textarea className="editor-input" value={keywords} onChange={e => setKeywords(e.target.value)} placeholder={"tigai fonta\nvase ceramica\nset cratite\nset tacamuri"} rows={4} style={{border:"1px solid var(--line)",borderRadius:"var(--r-sm)",padding:"7px 11px",resize:"vertical",fontFamily:"var(--mono)"}} />
          <div className="editor-hint">Leave empty to use top GSC keywords. First run saves SERP snapshot. Second run detects changes.</div>
        </div>
      </div>

      {error && <div className="alert-banner warn">{error}</div>}

      {data && (
        <>
          <div className="metric-grid">
            {[
              { label: "Keywords Checked", value: data.checked },
              { label: "Shifts Detected",  value: data.shiftsFound },
              { label: "First Run",        value: data.isFirstRun ? "Yes" : "No" },
              { label: "Checked At",       value: new Date(data.checkedAt).toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" }) },
            ].map(s => (
              <div key={s.label} className="metric">
                <div className="metric-label">{s.label}</div>
                <div className="metric-value">{s.value}</div>
              </div>
            ))}
          </div>

          {data.isFirstRun && <div className="alert-banner ok">First run complete — SERP snapshot saved. Run again next week to detect shifts.</div>}

          {/* Tabs */}
          <div className="subnav">
            <button onClick={() => setActiveTab("shifts")} className={`subnav-tab ${activeTab === "shifts" ? "active" : ""}`}>
              Shifts <span className="sn-pill">{withShifts.length}</span>
            </button>
            <button onClick={() => setActiveTab("all")} className={`subnav-tab ${activeTab === "all" ? "active" : ""}`}>
              All Keywords <span className="sn-pill">{allResults.length}</span>
            </button>
          </div>

          {/* Results */}
          <div className="card">
            {displayList.length === 0 ? (
              <div style={{padding:40,textAlign:"center",color:"var(--ink-4)",fontSize:13}}>
                {activeTab === "shifts" ? "No intent shifts detected — your SERP landscape is stable." : "No results yet."}
              </div>
            ) : displayList.map((r, i) => {
              const open = expanded === i;
              const current = r.current || {};
              return (
                <div key={i}>
                  <div className="data-row" onClick={() => setExpanded(open ? null : i)} style={{gridTemplateColumns:"auto 1fr auto auto auto auto",cursor:"pointer"}}>
                    <span>{r.hasShift ? "⚠️" : "✅"}</span>
                    <span style={{fontWeight:600,color:"var(--ink-0)",fontSize:13}}>{r.keyword}</span>
                    <TypeBadge type={current.dominant} />
                    <div style={{width:120}}><SerpBar typeCounts={current.typeCounts} /></div>
                    {r.hasShift && <span className="q-tag critical">{r.shifts?.length} shift{r.shifts?.length !== 1 ? "s" : ""}</span>}
                    {r.isNew && <span className="q-tag info">NEW</span>}
                    <span style={{color:"var(--ink-4)",fontSize:11}}>{open ? "▲" : "▼"}</span>
                  </div>

                  {open && (
                    <div style={{background:"var(--surface-2)",padding:"14px 16px",borderTop:"1px solid var(--line)"}}>
                      {r.shifts?.length > 0 && (
                        <div style={{marginBottom:14}}>
                          <div className="editor-label" style={{color:"var(--danger)"}}>Detected Shifts</div>
                          {r.shifts.map((shift, si) => (
                            <div key={si} className="alert-banner warn" style={{marginBottom:6}}>
                              <div style={{fontWeight:600,marginBottom:4}}>{shift.description}</div>
                              <div>{shift.recommendation}</div>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="two-col-lg">
                        <div>
                          <div className="editor-label">Current SERP Composition</div>
                          <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:8}}>
                            {Object.entries(current.typeCounts || {}).sort((a,b) => b[1]-a[1]).map(([type, count]) => (
                              <TypeBadge key={type} type={type} count={count} />
                            ))}
                          </div>
                          <div style={{display:"flex",gap:8,fontSize:11,color:"var(--ink-4)"}}>
                            {current.features?.hasFeaturedSnip && <span>Featured Snippet</span>}
                            {current.features?.hasPaa && <span>PAA</span>}
                            {current.features?.hasShoppingAds && <span>Shopping Ads</span>}
                            {current.features?.hasVideos && <span>Videos</span>}
                          </div>
                        </div>
                        {r.previous && (
                          <div>
                            <div className="editor-label">Previous Snapshot</div>
                            <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                              {Object.entries(r.previous.typeCounts || {}).sort((a,b) => b[1]-a[1]).map(([type, count]) => (
                                <TypeBadge key={type} type={type} count={count} />
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      <div style={{marginTop:12}}>
                        <div className="editor-label">Top 5 Results Now</div>
                        {current.pages?.slice(0, 5).map((page, pi) => (
                          <div key={pi} className="data-row" style={{gridTemplateColumns:"auto auto 1fr",padding:"4px 0"}}>
                            <span className="pos-pill low">#{page.position}</span>
                            <TypeBadge type={page.type} />
                            <span style={{fontSize:11,color:"var(--ink-1)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{page.title}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {!data && !running && (
        <div className="card" style={{padding:48,textAlign:"center"}}>
          <div style={{fontSize:40,marginBottom:12}}>📡</div>
          <div style={{fontSize:16,fontWeight:700,color:"var(--ink-0)",marginBottom:8}}>No data yet</div>
          <div style={{fontSize:13,color:"var(--ink-3)"}}>Add keywords above (or leave empty to use GSC data) and click Run Check.<br/>First run saves snapshot. Second run detects shifts.</div>
        </div>
      )}
    </div>
  );
}
