// app/routes/app.brand-serp.jsx
// Kimono SEO #24 — Brand SERP Monitor UI

import React, { useState, useEffect } from "react";
import { useLoaderData, useNavigate } from "react-router";
import prisma from "../db.server.js";

export const loader = async ({ request }) => {
  const { requireAuth } = await import("../lib/auth/index.server.js");
  const { storeId, connection } = await requireAuth(request);
  if (!storeId) return {};
  const store = await prisma.store.findUnique({ where: { id: storeId } });

  const [saved, brandSetting, domainSetting, orgSchemaSetting, socialUrlsSetting] = await Promise.all([
    prisma.seoSetting.findUnique({ where: { storeId_key: { storeId: store.id, key: "brand_serp_results" } } }),
    prisma.seoSetting.findUnique({ where: { storeId_key: { storeId: store.id, key: "brand_name" } } }),
    prisma.seoSetting.findUnique({ where: { storeId_key: { storeId: store.id, key: "seo_gsc_site_url" } } }),
    prisma.seoSetting.findUnique({ where: { storeId_key: { storeId: store.id, key: "org_schema_added" } } }),
    prisma.seoSetting.findUnique({ where: { storeId_key: { storeId: store.id, key: "brand_social_urls" } } }),
  ]);

  let data = null;
  if (saved?.value) { try { data = JSON.parse(saved.value); } catch {} }

  const defaultDomain = domainSetting?.value?.replace(/https?:\/\//, "").replace(/\/$/, "") || connection.shopDomain.replace(".myshopify.com", "") + ".ro";

  return {
    data,
    dfsActive: !!(process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD),
    orgSchemaActive: !!orgSchemaSetting?.value,
    brandName: brandSetting?.value || "",
    domain: defaultDomain,
    socialUrls: socialUrlsSetting?.value || "",
  };
};

export default function BrandSerpPage() {
  const { data: init, dfsActive, orgSchemaActive = false, brandName: initBrand, domain: initDomain, socialUrls: initSocialUrls = "" } = useLoaderData();
  const navigate  = useNavigate();
  const [data,     setData]     = useState(init);
  const [scanning, setScanning] = useState(false);
  const [error,    setError]    = useState(null);
  const [brand,    setBrand]    = useState(initBrand);
  const [domain,   setDomain]   = useState(initDomain);
  const [saving,   setSaving]   = useState(false);
  const [socialUrls, setSocialUrls] = useState(initSocialUrls);
  const [addingSchema, setAddingSchema] = useState(false);
  const [schemaAdded,  setSchemaAdded]  = useState(orgSchemaActive);

  useEffect(() => {
    fetch("/api/brand-serp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intent: "cleanup_script_tags" }),
    }).then(r => r.json()).then(d => {
      if (d.deleted > 0) console.log(`[Brand SERP] Cleaned up ${d.deleted} old script tag(s)`);
    }).catch(() => {});
  }, []);

  async function addOrgSchema() {
    setAddingSchema(true);
    try {
      const r = await fetch("/api/brand-serp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "add_org_schema", brandName: brand, domain }),
      });
      const d = await r.json();
      if (d.success) setSchemaAdded(true);
      else setError(d.error);
    } catch (e) { setError(e.message); }
    setAddingSchema(false);
  }

  async function saveBrand() {
    setSaving(true);
    await fetch("/api/brand-serp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intent: "save_brand", brandName: brand, domain, socialUrls }),
    });
    setSaving(false);
  }

  async function runScan() {
    setScanning(true);
    setError(null);
    try {
      await saveBrand();
      const r = await fetch("/api/brand-serp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "scan" }),
      });
      const d = await r.json();
      if (d.success) setData(d);
      else setError(d.error);
    } catch (e) { setError(e.message); }
    setScanning(false);
  }

  const sevCls = (sev) => sev === "high" ? "warn" : sev === "medium" ? "warn" : "ok";

  return (
    <div className="page active">
      <div className="page-head">
        <div>
          <h1 className="page-title">Brand SERP Monitor</h1>
          <p className="page-sub">What Google shows when someone searches your brand name</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={runScan} disabled={scanning || !dfsActive}>
            {scanning ? "Scanning..." : "Scan Now"}
          </button>
        </div>
      </div>

      {error && <div className="alert-banner warn">{error}</div>}
      {!dfsActive && <div className="alert-banner warn">DataForSEO not configured</div>}

      {/* Brand config */}
      <div className="card" style={{marginBottom:18}}>
        <div className="card-head"><div className="card-title">Brand Configuration</div></div>
        <div style={{padding:"16px 18px",display:"flex",gap:14,flexWrap:"wrap",alignItems:"flex-end"}}>
          <div style={{flex:1,minWidth:180}}>
            <label className="editor-label">Brand Name to monitor</label>
            <input className="editor-input" value={brand} onChange={e => setBrand(e.target.value)} placeholder="Ex: Vivimall, 11 Goats" style={{border:"1px solid var(--line)",borderRadius:"var(--r-sm)",padding:"7px 11px"}} />
          </div>
          <div style={{flex:1,minWidth:220}}>
            <label className="editor-label">Your Domain</label>
            <input className="editor-input" value={domain} onChange={e => setDomain(e.target.value)} placeholder="Ex: vivimall.ro" style={{border:"1px solid var(--line)",borderRadius:"var(--r-sm)",padding:"7px 11px"}} />
          </div>
          <div style={{flex:2,minWidth:280}}>
            <label className="editor-label">Your Social Media (one URL per line)</label>
            <textarea className="editor-input" value={socialUrls} onChange={e => setSocialUrls(e.target.value)} placeholder={"https://www.facebook.com/vivimall\nhttps://www.instagram.com/vivimall.ro"} rows={3} style={{border:"1px solid var(--line)",borderRadius:"var(--r-sm)",padding:"7px 11px",resize:"vertical",fontFamily:"var(--mono)",fontSize:12}} />
            <div className="editor-hint">Any result from these domains will be marked as "Your social", not competitor</div>
          </div>
          <button className="btn btn-ghost" onClick={saveBrand} disabled={saving} style={{alignSelf:"flex-start",marginTop:22}}>
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      {data ? (
        <>
          <div style={{fontSize:12,color:"var(--ink-3)",marginBottom:16}}>
            Scanning: <strong style={{color:"var(--ink-0)"}}>&quot;{data.brandName}&quot;</strong> on Google.ro
            {data.scannedAt && ` · Last scanned ${new Date(data.scannedAt).toLocaleString("ro-RO")}`}
          </div>

          {/* Anomalies */}
          {data.anomalies?.length > 0 && (
            <div style={{marginBottom:20}}>
              {data.anomalies.filter(a => {
                if (schemaAdded && a.message?.includes("Knowledge Panel")) return false;
                return true;
              }).map((a, i) => (
                <div key={i} className={`alert-banner ${sevCls(a.severity)}`} style={{marginBottom:8}}>
                  {a.message}
                </div>
              ))}
            </div>
          )}

          {/* Cards grid */}
          <div className="two-col-lg" style={{marginBottom:20}}>
            {/* Knowledge Panel */}
            <div className="card">
              <div className="card-head"><div className="card-title">Knowledge Panel</div></div>
              <div style={{padding:"14px 16px"}}>
                {data.knowledgePanel ? (
                  <div>
                    <div style={{fontSize:15,fontWeight:700,color:"var(--ink-0)"}}>{data.knowledgePanel.title}</div>
                    {data.knowledgePanel.description && <div style={{fontSize:12,color:"var(--ink-3)",marginTop:4,lineHeight:1.5}}>{data.knowledgePanel.description.slice(0,150)}</div>}
                    {data.knowledgePanel.rating && <div style={{marginTop:8,fontSize:13,color:"var(--warn)"}}>{"⭐"} {data.knowledgePanel.rating} ({data.knowledgePanel.reviewCount} reviews)</div>}
                    <span className="delta up" style={{marginTop:8,display:"inline-block"}}>Present</span>
                  </div>
                ) : (
                  <div>
                    <div style={{fontSize:13,color:"var(--ink-4)",marginBottom:8}}>No Knowledge Panel found</div>
                    <div className="editor-hint">Add Organization schema markup and create/verify your Google Business Profile to establish brand entity.</div>
                    {schemaAdded ? (
                      <span className="delta up" style={{marginTop:8,display:"inline-block"}}>Organization schema added to theme!</span>
                    ) : (
                      <button className="btn btn-primary" onClick={addOrgSchema} disabled={addingSchema} style={{marginTop:8}}>
                        {addingSchema ? "Adding..." : "Add Organization Schema"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Your position */}
            <div className="card">
              <div className="card-head"><div className="card-title">Your Positions</div></div>
              <div style={{padding:"14px 16px"}}>
                {data.organicResults?.length > 0 ? (
                  data.organicResults.slice(0, 3).map((r, i) => (
                    <div key={i} className="data-row" style={{gridTemplateColumns:"auto 1fr",padding:"8px 0"}}>
                      <span className={`pos-pill ${r.position <= 3 ? "top" : "mid"}`}>#{r.position}</span>
                      <div className="data-row-main">
                        <div className="data-row-title" style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.title}</div>
                        <div className="data-row-meta" style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.url}</div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={{fontSize:13,color:"var(--danger)"}}>Your site not found in top 20 results</div>
                )}
              </div>
            </div>
          </div>

          {/* All top 10 SERP results */}
          {data.allResults?.length > 0 && (
            <div className="card" style={{marginBottom:16}}>
              <div className="card-head"><div className="card-title">Top {data.allResults.length} Google Results for &quot;{data.brandName}&quot;</div></div>
              <div>
                {data.allResults.map((r, i) => {
                  const pillCls = r.type === "own" ? "top" : r.type === "social" ? "mid" : "low";
                  const tagCls = r.type === "own" ? "info" : r.type === "social" ? "info" : "critical";
                  const typeLabel = r.type === "own" ? "Your site" : r.type === "social" ? "Your social" : "Competitor";
                  return (
                    <div key={i} className="data-row" style={{gridTemplateColumns:"auto 1fr auto auto"}}>
                      <span className={`pos-pill ${pillCls}`}>#{r.position}</span>
                      <div className="data-row-main">
                        <div className="data-row-title" style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.title}</div>
                        <div className="data-row-meta" style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.url}</div>
                      </div>
                      <span className={`q-tag ${tagCls}`}>{typeLabel}</span>
                      <a href={r.url} target="_blank" rel="noopener noreferrer" className="card-action">View &rarr;</a>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Sitelinks */}
          {data.sitelinks?.length > 0 && (
            <div className="card" style={{marginBottom:16}}>
              <div className="card-head">
                <div className="card-title">Sitelinks <span className="count">{data.sitelinks.length} found</span></div>
              </div>
              <div style={{padding:"14px 16px",display:"flex",flexWrap:"wrap",gap:8}}>
                {data.sitelinks.map((s, i) => (
                  <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" className="chip">{s.title}</a>
                ))}
              </div>
            </div>
          )}

          {/* Competitors */}
          {data.competitors?.length > 0 && (
            <div className="card" style={{marginBottom:16}}>
              <div className="card-head">
                <div className="card-title">Competitors on your brand name <span className="count">{data.competitors.length} found</span></div>
              </div>
              <div>
                {data.competitors.slice(0, 5).map((c, i) => (
                  <div key={i} className="data-row" style={{gridTemplateColumns:"auto 1fr auto"}}>
                    <span className="pos-pill low">#{c.position}</span>
                    <div className="data-row-main">
                      <div className="data-row-title" style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.title}</div>
                      <div className="data-row-meta" style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.url}</div>
                    </div>
                    <a href={c.url} target="_blank" rel="noopener noreferrer" className="card-action">View &rarr;</a>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Social Profiles */}
          {data.socialProfiles?.length > 0 && (
            <div className="card" style={{marginBottom:16}}>
              <div className="card-head">
                <div className="card-title">Your Social Profiles <span className="count">{data.socialProfiles.length} found</span></div>
              </div>
              <div style={{padding:"14px 16px",display:"flex",flexWrap:"wrap",gap:8}}>
                {data.socialProfiles.map((p, i) => (
                  <a key={i} href={p.url} target="_blank" rel="noopener noreferrer" className="chip">
                    #{p.position} {p.title?.slice(0, 40)}
                  </a>
                ))}
              </div>
            </div>
          )}

          <div style={{fontSize:12,color:"var(--ink-4)"}}>
            SERP features detected: {data.serpTypes?.join(", ") || "none"}
          </div>
        </>
      ) : (
        <div className="card" style={{padding:48,textAlign:"center"}}>
          <div style={{fontSize:40,marginBottom:12}}>🏷️</div>
          <div style={{fontSize:16,fontWeight:700,color:"var(--ink-0)",marginBottom:8}}>No scan yet</div>
          <div style={{fontSize:13,color:"var(--ink-3)",marginBottom:20}}>Run a scan to see what Google shows for your brand name.</div>
          {dfsActive && (
            <button className="btn btn-primary" onClick={runScan}>Run First Scan</button>
          )}
        </div>
      )}
    </div>
  );
}
