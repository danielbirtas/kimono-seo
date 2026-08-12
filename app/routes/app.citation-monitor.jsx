// app/routes/app.citation-monitor.jsx
// Kimono SEO #28 — Citation & Mention Monitoring UI

import { useLoaderData, useNavigate } from "react-router";
import { useState } from "react";
import prisma from "../db.server.js";

export const loader = async ({ request }) => {
  const { requireAuth } = await import("../lib/auth/index.server.js");
  const { storeId, connection } = await requireAuth(request);
  if (!storeId) return {};
  const store = await prisma.store.findUnique({ where: { id: storeId } });

  const [saved, brandSetting, compSetting] = await Promise.all([
    prisma.seoSetting.findUnique({ where: { storeId_key: { storeId: store.id, key: "citation_results" } } }),
    prisma.seoSetting.findUnique({ where: { storeId_key: { storeId: store.id, key: "brand_name" } } }),
    prisma.seoSetting.findUnique({ where: { storeId_key: { storeId: store.id, key: "citation_competitors" } } }),
  ]);

  let data = null;
  if (saved?.value) { try { data = JSON.parse(saved.value); } catch {} }

  return {
    data,
    brandName:   brandSetting?.value  || "",
    competitors: compSetting?.value   || "",
    dfsActive:   !!(process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD),
  };
};

const SENTIMENT_MAP = {
  positive: { cls: "ok",   label: "Positive" },
  neutral:  { cls: "info", label: "Neutral" },
  negative: { cls: "warn", label: "Negative" },
};

const TYPE_MAP = {
  news:      "News",
  blog:      "Blog",
  social:    "Social",
  review:    "Review",
  directory: "Directory",
  web:       "Web",
};

function SentimentBar({ sentiment }) {
  if (!sentiment) return null;
  const total = (sentiment.positive || 0) + (sentiment.neutral || 0) + (sentiment.negative || 0);
  if (total === 0) return null;
  return (
    <div className="sent-bar" style={{height:6}}>
      <div className="sent-seg pos" style={{width: `${(sentiment.positive / total) * 100}%`}} />
      <div className="sent-seg neu" style={{width: `${(sentiment.neutral  / total) * 100}%`}} />
      <div className="sent-seg neg" style={{width: `${(sentiment.negative / total) * 100}%`}} />
    </div>
  );
}

export default function CitationMonitorPage() {
  const { data: init, brandName: initBrand, competitors: initComp, dfsActive } = useLoaderData();
  const navigate    = useNavigate();
  const [data,      setData]        = useState(init);
  const [competitors, setCompetitors] = useState(initComp);
  const [monitoring, setMonitoring]  = useState(false);
  const [error,      setError]       = useState(null);
  const [activeTab,  setActiveTab]   = useState("overview");

  async function saveAndMonitor() {
    setMonitoring(true);
    setError(null);
    try {
      await fetch("/api/citation-monitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "save_settings", competitors }),
      });
      const r = await fetch("/api/citation-monitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "monitor" }),
      });
      const d = await r.json();
      if (d.success) setData(d);
      else setError(d.error);
    } catch (e) { setError(e.message); }
    setMonitoring(false);
  }

  const ownMentions  = data?.ownMentions || {};
  const gaps         = data?.gaps        || [];
  const aiOpp        = data?.aiOpportunities;

  return (
    <div className="page active">
      <div className="page-head">
        <div>
          <h1 className="page-title">Citation &amp; Mention Monitoring</h1>
          <p className="page-sub">
            Where your brand is mentioned online — and where competitors appear but you don't.
            {initBrand && <strong> Monitoring: {initBrand}</strong>}
          </p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={saveAndMonitor} disabled={monitoring || !dfsActive}>
            {monitoring ? "Monitoring..." : "Run Monitor"}
          </button>
        </div>
      </div>

      {!dfsActive && <div className="alert-banner warn">DataForSEO not configured</div>}

      {/* Settings */}
      <div className="card" style={{marginBottom:20}}>
        <div className="card-head"><div className="card-title">Competitor Brands to Compare</div></div>
        <div style={{padding:"14px 16px"}}>
          <textarea className="editor-input" value={competitors} onChange={e => setCompetitors(e.target.value)} placeholder={"competitor brand 1\ncompetitor brand 2\ncompetitor brand 3"} rows={3} style={{border:"1px solid var(--line)",borderRadius:"var(--r-sm)",padding:"7px 11px",resize:"vertical",fontFamily:"var(--mono)"}} />
          <div className="editor-hint">Brand name monitors from Brand SERP settings. Competitors are compared to find gap opportunities. Max 3.</div>
        </div>
      </div>

      {error && <div className="alert-banner warn">{error}</div>}

      {data && (
        <>
          {!data.dfsAvailable && <div className="alert-banner warn">DataForSEO Content Analysis requires a separate subscription. Results below are limited.</div>}

          {/* Stats */}
          <div className="metric-grid">
            {[
              { label: "Total Mentions Found",   value: ownMentions.total  || 0 },
              { label: "Positive",               value: ownMentions.sentiment?.positive || 0 },
              { label: "Negative",               value: ownMentions.sentiment?.negative || 0 },
              { label: "Gap Opportunities",      value: gaps.length },
            ].map(s => (
              <div key={s.label} className="metric">
                <div className="metric-label">{s.label}</div>
                <div className="metric-value">{s.value}</div>
              </div>
            ))}
          </div>

          {/* Sentiment bar */}
          {ownMentions.sentiment && (
            <div className="card" style={{marginBottom:16}}>
              <div className="card-head"><div className="card-title">Sentiment Distribution — {data.brandName}</div></div>
              <div style={{padding:"14px 16px"}}>
                <SentimentBar sentiment={ownMentions.sentiment} />
                <div style={{display:"flex",gap:16,marginTop:8,fontSize:12}}>
                  {Object.entries(ownMentions.sentiment).map(([k, v]) => (
                    <span key={k} style={{color: k === "positive" ? "var(--accent)" : k === "negative" ? "var(--danger)" : "var(--ink-3)"}}>
                      {SENTIMENT_MAP[k]?.label || k}: <strong>{v}</strong>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* AI Opportunities */}
          {aiOpp && (
            <div className="card" style={{marginBottom:20,background:"var(--ink-0)",color:"#fff",border:"1px solid var(--ink-0)"}}>
              <div className="card-head" style={{borderColor:"rgba(255,255,255,.1)"}}>
                <div className="card-title" style={{color:"#fff"}}>AI Placement Opportunities <span className="q-tag info" style={{marginLeft:8}}>Claude</span></div>
              </div>
              <div style={{padding:"14px 16px"}}>
                {aiOpp.priorityAction && (
                  <div className="alert-banner info" style={{marginBottom:12}}>
                    <strong>Priority this week: </strong>{aiOpp.priorityAction}
                  </div>
                )}
                <div className="two-col-lg">
                  {aiOpp.opportunities?.length > 0 && (
                    <div>
                      <div className="editor-label" style={{color:"var(--ink-4)"}}>Opportunities</div>
                      {aiOpp.opportunities.map((op, i) => (
                        <div key={i} style={{fontSize:12,color:"#CBD5E1",padding:"4px 0"}}>
                          <span style={{color:"#34D399",fontWeight:700}}>{i + 1}.</span> {op}
                        </div>
                      ))}
                    </div>
                  )}
                  {aiOpp.gaps?.length > 0 && (
                    <div>
                      <div className="editor-label" style={{color:"var(--ink-4)"}}>Gaps vs Competitors</div>
                      {aiOpp.gaps.map((gap, i) => (
                        <div key={i} style={{fontSize:12,color:"#CBD5E1",padding:"4px 0"}}>
                          <span style={{color:"#F87171"}}>&rarr;</span> {gap}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {aiOpp.estimatedImpact && <div style={{marginTop:10,fontSize:11,color:"var(--ink-4)"}}>Expected impact: {aiOpp.estimatedImpact}</div>}
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className="subnav">
            {[
              ["overview", "Overview"],
              ["mentions", `Your Mentions (${ownMentions.fetched || 0})`],
              ["gaps",     `Gap Opportunities (${gaps.length})`],
              ["competitors", `Competitors (${data.competitorMentions?.length || 0})`],
            ].map(([k, l]) => (
              <button key={k} onClick={() => setActiveTab(k)} className={`subnav-tab ${activeTab === k ? "active" : ""}`}>{l}</button>
            ))}
          </div>

          {/* Overview tab */}
          {activeTab === "overview" && (
            <div className="two-col-lg">
              <div className="card">
                <div className="card-head"><div className="card-title">Mentions by Type</div></div>
                <div style={{padding:"14px 16px"}}>
                  {Object.entries(ownMentions.byType || {}).sort((a,b) => b[1]-a[1]).map(([type, count]) => (
                    <div key={type} className="data-row" style={{gridTemplateColumns:"1fr auto",padding:"5px 0"}}>
                      <span className="q-tag info">{TYPE_MAP[type] || type}</span>
                      <span style={{fontSize:13,fontWeight:700,color:"var(--ink-0)"}}>{count}</span>
                    </div>
                  ))}
                  {Object.keys(ownMentions.byType || {}).length === 0 && <div style={{fontSize:12,color:"var(--ink-4)"}}>No data yet</div>}
                </div>
              </div>
              <div className="card">
                <div className="card-head"><div className="card-title">Competitor Comparison</div></div>
                <div style={{padding:"14px 16px"}}>
                  {data.competitorMentions?.map(comp => (
                    <div key={comp.brand} className="data-row" style={{gridTemplateColumns:"1fr auto",padding:"7px 0"}}>
                      <span style={{fontSize:13,fontWeight:600,color:"var(--ink-0)"}}>{comp.brand}</span>
                      <span style={{fontSize:13,color:"var(--accent)",fontWeight:700}}>{comp.total?.toLocaleString() || comp.fetched} mentions</span>
                    </div>
                  ))}
                  <div className="data-row" style={{gridTemplateColumns:"1fr auto",padding:"7px 0"}}>
                    <span style={{fontSize:13,color:"var(--accent)",fontWeight:700}}>{data.brandName} (you)</span>
                    <span style={{fontSize:13,color:"var(--accent)",fontWeight:700}}>{ownMentions.total?.toLocaleString() || ownMentions.fetched} mentions</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Your mentions tab */}
          {activeTab === "mentions" && (
            <div className="card">
              {(ownMentions.topMentions || []).length === 0
                ? <div style={{padding:40,textAlign:"center",color:"var(--ink-4)",fontSize:13}}>No mentions found — try enabling DataForSEO Content Analysis</div>
                : (ownMentions.topMentions || []).map((m, i) => (
                    <div key={i} className="data-row" style={{gridTemplateColumns:"1fr"}}>
                      <div>
                        <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:4,flexWrap:"wrap"}}>
                          <span className="q-tag info">{TYPE_MAP[m.type] || m.type}</span>
                          <span className={`q-tag ${m.sentiment === "positive" ? "info" : m.sentiment === "negative" ? "critical" : "warn"}`}>{SENTIMENT_MAP[m.sentiment]?.label || m.sentiment}</span>
                          <a href={m.url} target="_blank" rel="noopener noreferrer" className="card-action" style={{flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.title || m.domain}</a>
                          {m.rating > 0 && <span style={{fontSize:11,color:"var(--ink-4)"}}>Authority: {m.rating}</span>}
                        </div>
                        {m.snippet && <div style={{fontSize:12,color:"var(--ink-3)",lineHeight:1.5}}>{m.snippet}</div>}
                        <div className="data-row-meta">{m.domain}</div>
                      </div>
                    </div>
                  ))
              }
            </div>
          )}

          {/* Gaps tab */}
          {activeTab === "gaps" && (
            <div className="card">
              {gaps.length === 0
                ? <div style={{padding:40,textAlign:"center",color:"var(--ink-4)",fontSize:13}}>No gap opportunities found.</div>
                : gaps.map((gap, i) => (
                    <div key={i} className="data-row" style={{gridTemplateColumns:"1fr"}}>
                      <div>
                        <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:4}}>
                          <span className="q-tag info">{TYPE_MAP[gap.type] || gap.type}</span>
                          <span style={{fontSize:13,fontWeight:600,color:"var(--ink-0)"}}>{gap.domain}</span>
                          <span style={{fontSize:11,color:"var(--danger)"}}>&larr; {gap.competitor} is here</span>
                          {gap.rating > 0 && <span style={{fontSize:11,color:"var(--ink-4)",marginLeft:"auto"}}>Authority: {gap.rating}</span>}
                        </div>
                        {gap.title && <div style={{fontSize:12,color:"var(--ink-3)"}}>{gap.title}</div>}
                        <a href={gap.url} target="_blank" rel="noopener noreferrer" className="card-action">{gap.url.slice(0, 80)}</a>
                      </div>
                    </div>
                  ))
              }
            </div>
          )}

          {/* Competitors tab */}
          {activeTab === "competitors" && (
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              {(data.competitorMentions || []).map(comp => (
                <div key={comp.brand} className="card">
                  <div className="card-head"><div className="card-title">{comp.brand} — {comp.total?.toLocaleString() || comp.fetched} total mentions</div></div>
                  <div>
                    {comp.topMentions?.map((m, i) => (
                      <div key={i} className="data-row" style={{gridTemplateColumns:"auto 1fr auto"}}>
                        <span className="q-tag info">{TYPE_MAP[m.type] || m.type}</span>
                        <a href={m.url} target="_blank" rel="noopener noreferrer" className="card-action" style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.title || m.domain}</a>
                        <span style={{fontSize:11,color:"var(--ink-4)"}}>{m.domain}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {(data.competitorMentions || []).length === 0 && (
                <div className="card" style={{padding:40,textAlign:"center",color:"var(--ink-4)",fontSize:13}}>No competitors configured.</div>
              )}
            </div>
          )}

          <div style={{marginTop:10,fontSize:11,color:"var(--ink-4)"}}>
            Monitored at {new Date(data.monitoredAt).toLocaleString("ro-RO")}
          </div>
        </>
      )}

      {!data && !monitoring && (
        <div className="card" style={{padding:48,textAlign:"center"}}>
          <div style={{fontSize:40,marginBottom:12}}>📡</div>
          <div style={{fontSize:16,fontWeight:700,color:"var(--ink-0)",marginBottom:8}}>No data yet</div>
          <div style={{fontSize:13,color:"var(--ink-3)"}}>
            Add competitor brands above and click Run Monitor.<br/>
            Uses DataForSEO Content Analysis API to find brand mentions across the web.
          </div>
        </div>
      )}
    </div>
  );
}
