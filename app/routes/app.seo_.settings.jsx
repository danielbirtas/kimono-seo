// app/routes/app.seo_.settings.jsx
// Kimono SEO — SEO Settings

import { useLoaderData, useSubmit, useNavigation, useSearchParams, useNavigate } from "react-router";
import { useState, useEffect, useCallback } from "react";
import { requireAuth } from "../lib/auth/index.server.js";
import { getAllSeoSettings, saveAllSeoSettings, isGscConnected, clearGscTokens } from "../lib/seo/settings.server.js";
import { buildGscAuthUrl } from "../lib/seo/gsc.server.js";
import { hasDfsConfig } from "../lib/seo/dataforseo.server.js";
import { DEFAULT_TAG_PROMPT } from "../lib/seo/constants.js";

export const loader = async ({ request }) => {
  const { connection, store, storeId } = await requireAuth(request);
  const shopDomain = connection?.shopDomain || "";
  if (!storeId || !connection) return { settings: {}, pipeline: defaultPipeline(), gscConnected: false, dfsActive: false, gscAuthUrl: "", gscSiteUrl: "", robotsAudit: null, indexNowEnabled: false, shopDomain: "" };

  const prisma       = (await import("../db.server.js")).default;
  const storeSettings = await prisma.storeSettings.findUnique({ where: { storeId } });
  const pipeline = storeSettings ? {
    pipelineMode:          storeSettings.pipelineMode,
    taxonomyAutoApply:     storeSettings.taxonomyAutoApply,
    taxonomyAutoMinVolume: storeSettings.taxonomyAutoMinVolume,
    weeklyDigestEnabled:   storeSettings.weeklyDigestEnabled,
    deletedProductPolicy:  storeSettings.deletedProductPolicy,
  } : defaultPipeline();

  const settings    = await getAllSeoSettings(storeId);
  settings.indexnow_auto_products    = settings.indexnow_auto_products    ?? "true";
  settings.indexnow_auto_articles    = settings.indexnow_auto_articles    ?? "true";
  settings.indexnow_auto_collections = settings.indexnow_auto_collections ?? "true";
  const gscConnected = isGscConnected(settings);
  const dfsActive    = hasDfsConfig();
  const gscAuthUrl   = buildGscAuthUrl(shopDomain);

  let robotsAudit = null;
  try {
    const { auditRobotsTxt } = await import("../lib/seo/robots-audit.server.js");
    robotsAudit = await auditRobotsTxt(shopDomain);
  } catch (rErr) {
    console.warn("[Settings] robots audit failed:", rErr.message);
  }

  return { settings, pipeline, gscConnected, dfsActive, gscAuthUrl, gscSiteUrl: settings.gscSiteUrl || "", robotsAudit, indexNowEnabled: settings.indexNowEnabled || false, shopDomain };
};

function defaultPipeline() {
  return {
    pipelineMode:          "AUTO_PILOT",
    taxonomyAutoApply:     false,
    taxonomyAutoMinVolume: 100,
    weeklyDigestEnabled:   true,
    deletedProductPolicy:  "WARN_ONLY",
  };
}

export const action = async ({ request }) => {
  const { connection, store, storeId } = await requireAuth(request);
  const shopDomain = connection?.shopDomain || "";
  if (!storeId || !connection) return { error: "No store connected" };

  const formData = await request.formData();
  const intent   = formData.get("intent");

  if (intent === "disconnect_gsc") {
    await clearGscTokens(storeId);
    return { disconnected: true };
  }

  if (intent === "save_pipeline") {
    const prisma = (await import("../db.server.js")).default;
    const data = {
      pipelineMode:          formData.get("pipelineMode") === "REVIEW_MANUAL" ? "REVIEW_MANUAL" : "AUTO_PILOT",
      taxonomyAutoApply:     formData.get("taxonomyAutoApply") === "on",
      taxonomyAutoMinVolume: Math.max(0, parseInt(formData.get("taxonomyAutoMinVolume") || "100", 10)),
      weeklyDigestEnabled:   formData.get("weeklyDigestEnabled") === "on",
      deletedProductPolicy:  formData.get("deletedProductPolicy") === "AUTO_UNPUBLISH" ? "AUTO_UNPUBLISH" : "WARN_ONLY",
    };
    await prisma.storeSettings.upsert({
      where:  { storeId },
      update: data,
      create: { storeId, ...data },
    });
    return { saved: true, pipelineSaved: true };
  }

  const indexNowEnabled = formData.get("indexNowEnabled");
  if (indexNowEnabled !== null) {
    const { setSeoSetting } = await import("../lib/seo/settings.server.js");
    const { SEO_KEYS }      = await import("../lib/seo/constants.js");
    await setSeoSetting(storeId, SEO_KEYS.INDEXNOW_ENABLED, String(indexNowEnabled === "true"));
    return { saved: true };
  }

  const indexNowSetting = formData.get("indexNowSetting");
  const indexNowValue   = formData.get("indexNowValue");
  if (indexNowSetting && indexNowValue !== null) {
    const { setSeoSetting } = await import("../lib/seo/settings.server.js");
    await setSeoSetting(storeId, indexNowSetting, indexNowValue);
    return { saved: true };
  }

  await saveAllSeoSettings(storeId, {
    aiPrompt:    formData.get("aiPrompt"),
    batchSize:   formData.get("batchSize"),
    kwPerBucket: formData.get("kwPerBucket"),
    minVolume:   formData.get("minVolume"),
  });
  return { saved: true };
};

export default function SeoSettings() {
  const { settings, pipeline, gscConnected, dfsActive, gscAuthUrl, gscSiteUrl, robotsAudit, indexNowEnabled, shopDomain } = useLoaderData();
  const navigate   = useNavigate();
  const submit     = useSubmit();
  const navigation = useNavigation();
  const isSaving   = navigation.state === "submitting";
  const [searchParams] = useSearchParams();

  const gscJustConnected = searchParams.get("gsc_connected") === "1";
  const gscError         = searchParams.get("gsc_error") || "";
  const pickSite         = searchParams.get("pick_site")  === "1";

  const [form, setForm] = useState({
    aiPrompt:    settings.aiPrompt    || DEFAULT_TAG_PROMPT,
    batchSize:   String(settings.batchSize   || 20),
    kwPerBucket: String(settings.kwPerBucket || 10),
    minVolume:   String(settings.minVolume   || 50),
  });
  const [showPrompt,   setShowPrompt]   = useState(false);
  const [sites,        setSites]        = useState([]);
  const [loadingSites, setLoadingSites] = useState(false);
  const [selectedSite, setSelectedSite] = useState(gscSiteUrl || "");

  const h = (field) => (e) => setForm((p) => ({ ...p, [field]: e.target.value }));

  const handleSave = useCallback(() => {
    const fd = new FormData();
    fd.set("intent", "save");
    for (const [k, v] of Object.entries(form)) fd.append(k, v);
    submit(fd, { method: "POST" });
  }, [form, submit]);

  const handleDisconnectGsc = useCallback(() => {
    if (!confirm("Disconnect Google Search Console?")) return;
    const fd = new FormData();
    fd.set("intent", "disconnect_gsc");
    submit(fd, { method: "POST" });
  }, [submit]);

  useEffect(() => {
    if (!pickSite || !gscConnected) return;
    setLoadingSites(true);
    fetch("/api/gsc/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intent: "list_sites" }),
    })
      .then((r) => r.json())
      .then((d) => { if (d.success) setSites(d.sites || []); })
      .finally(() => setLoadingSites(false));
  }, [pickSite, gscConnected]);

  const handleSelectSite = useCallback(async (siteUrl) => {
    await fetch("/api/gsc/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intent: "set_site", siteUrl }),
    });
    setSelectedSite(siteUrl);
    window.history.replaceState({}, "", "/app/seo/settings?gsc_connected=1");
  }, []);

  const handleConnectGsc = useCallback(() => {
    window.top.location.href = gscAuthUrl;
  }, [gscAuthUrl]);

  const [pl, setPl] = useState({
    pipelineMode:          pipeline?.pipelineMode || "AUTO_PILOT",
    taxonomyAutoApply:     pipeline?.taxonomyAutoApply ?? false,
    taxonomyAutoMinVolume: String(pipeline?.taxonomyAutoMinVolume ?? 100),
    weeklyDigestEnabled:   pipeline?.weeklyDigestEnabled ?? true,
    deletedProductPolicy:  pipeline?.deletedProductPolicy || "WARN_ONLY",
  });
  const savePipeline = useCallback(() => {
    const fd = new FormData();
    fd.set("intent", "save_pipeline");
    fd.set("pipelineMode",          pl.pipelineMode);
    if (pl.taxonomyAutoApply)       fd.set("taxonomyAutoApply", "on");
    fd.set("taxonomyAutoMinVolume", pl.taxonomyAutoMinVolume);
    if (pl.weeklyDigestEnabled)     fd.set("weeklyDigestEnabled", "on");
    fd.set("deletedProductPolicy",  pl.deletedProductPolicy);
    submit(fd, { method: "POST" });
  }, [pl, submit]);

  return (
    <div className="page active">
      {/* Header */}
      <div className="page-head">
        <div>
          <button className="btn btn-ghost" onClick={() => navigate("/app/seo")} style={{marginBottom:8,fontSize:13}}>&larr; SEO Engine</button>
          <h1 className="page-title">SEO Settings</h1>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </div>

      {/* Banners */}
      {gscJustConnected && !pickSite && (
        <div className="alert-banner ok">Google Search Console connected.{selectedSite && <> Tracking: <strong>{selectedSite}</strong></>}</div>
      )}
      {gscError && <div className="alert-banner warn">GSC error: {decodeURIComponent(gscError)}</div>}

      {/* Pipeline SEO automat */}
      <div className="card" style={{marginBottom:20}}>
        <div className="card-head"><div className="card-title">Pipeline SEO automat</div></div>
        <div style={{padding:"14px 16px"}}>
          <div className="alert-banner info" style={{marginBottom:16}}>
            Configureaza cum proceseaza platforma produsele noi si tag-urile detectate automat.
          </div>

          <div className="editor-row">
            <label className="editor-label">Mod procesare</label>
            <select className="editor-input" value={pl.pipelineMode} onChange={(e) => setPl(p => ({ ...p, pipelineMode: e.target.value }))} style={{border:"1px solid var(--line)",borderRadius:"var(--r-sm)",padding:"7px 11px",background:"var(--surface)"}}>
              <option value="AUTO_PILOT">Auto-pilot — proceseaza automat produsele noi</option>
              <option value="REVIEW_MANUAL">Review manual — afiseaza in dashboard, asteapta aprobare</option>
            </select>
            <div className="editor-hint">In Auto-pilot, pipeline-ul porneste singur la fiecare 15 min.</div>
          </div>

          <div className="config-list" style={{marginTop:12}}>
            <div className="config-row">
              <div className="config-row-main">
                <div className="config-row-title">Taxonomie auto-apply</div>
                <div className="config-row-desc">Aplica automat propunerile taxonomiei fara confirmare — doar pentru tag-uri cu volum suficient.</div>
              </div>
              <label className="switch">
                <input type="checkbox" checked={pl.taxonomyAutoApply} onChange={(e) => setPl(p => ({ ...p, taxonomyAutoApply: e.target.checked }))} />
                <span className="switch-track"></span>
              </label>
            </div>

            {pl.taxonomyAutoApply && (
              <div className="editor-row">
                <label className="editor-label">Volum minim keyword pentru auto-apply</label>
                <input type="number" className="editor-input" value={pl.taxonomyAutoMinVolume} onChange={(e) => setPl(p => ({ ...p, taxonomyAutoMinVolume: e.target.value }))} style={{border:"1px solid var(--line)",borderRadius:"var(--r-sm)",padding:"7px 11px",maxWidth:200}} />
                <div className="editor-hint">Sub acest volum, propunerile raman PENDING.</div>
              </div>
            )}

            <div className="config-row">
              <div className="config-row-main">
                <div className="config-row-title">Email saptamanal cu sumar</div>
                <div className="config-row-desc">Lunea la 9 AM primesti un email cu produse noi procesate, tag-uri noi, pagini auto-generate.</div>
              </div>
              <label className="switch">
                <input type="checkbox" checked={pl.weeklyDigestEnabled} onChange={(e) => setPl(p => ({ ...p, weeklyDigestEnabled: e.target.checked }))} />
                <span className="switch-track"></span>
              </label>
            </div>
          </div>

          <div className="editor-row" style={{marginTop:12}}>
            <label className="editor-label">Cand un produs e sters in Shopify</label>
            <select className="editor-input" value={pl.deletedProductPolicy} onChange={(e) => setPl(p => ({ ...p, deletedProductPolicy: e.target.value }))} style={{border:"1px solid var(--line)",borderRadius:"var(--r-sm)",padding:"7px 11px",background:"var(--surface)"}}>
              <option value="WARN_ONLY">Doar avertizeaza — pastreaza paginile programatice</option>
              <option value="AUTO_UNPUBLISH">Auto-unpublish — dezactiveaza paginile care-l referentiaza</option>
            </select>
          </div>

          <div style={{paddingTop:12}}>
            <button className="btn btn-primary" onClick={savePipeline} disabled={isSaving}>
              {isSaving ? "Se salveaza..." : "Salveaza pipeline"}
            </button>
          </div>
        </div>
      </div>

      {/* Google Search Console */}
      <div className="card" style={{marginBottom:20}}>
        <div className="card-head">
          <div className="card-title">Google Search Console</div>
          {gscConnected && <span className="delta up">Connected</span>}
        </div>
        <div style={{padding:"14px 16px"}}>
          {!gscConnected ? (
            <>
              <div className="alert-banner info" style={{marginBottom:16}}>
                Connect your Google Search Console property to see real search performance data — clicks, impressions, average position.
              </div>
              <button className="btn btn-primary" onClick={handleConnectGsc} style={{display:"inline-flex",alignItems:"center",gap:8}}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Connect with Google
              </button>
            </>
          ) : (
            <>
              {pickSite && sites.length > 0 && (
                <div style={{marginBottom:16}}>
                  <label className="editor-label">Select property to track</label>
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    {sites.map((site) => (
                      <button key={site} onClick={() => handleSelectSite(site)} className={`btn ${selectedSite === site ? "btn-primary" : "btn-ghost"}`} style={{textAlign:"left"}}>
                        {site}
                      </button>
                    ))}
                  </div>
                  {loadingSites && <div style={{fontSize:13,color:"var(--ink-3)",marginTop:8}}>Loading...</div>}
                </div>
              )}
              {gscSiteUrl && !pickSite && (
                <div style={{fontSize:13,color:"var(--ink-1)",marginBottom:16}}>
                  Tracking: <strong style={{color:"var(--ink-0)"}}>{gscSiteUrl}</strong>
                </div>
              )}
              <div style={{display:"flex",gap:8}}>
                <button className="btn btn-ghost" onClick={handleConnectGsc}>Reconnect / Change Account</button>
                <button className="btn btn-ghost" onClick={handleDisconnectGsc} style={{color:"var(--danger)",borderColor:"var(--danger)"}}>Disconnect</button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* DataForSEO Status */}
      <div className="card" style={{marginBottom:20}}>
        <div className="card-head"><div className="card-title">DataForSEO</div></div>
        <div style={{padding:"14px 16px",display:"flex",alignItems:"center",gap:8}}>
          <span className={`health-label`}><span className={`dot-sm ${dfsActive ? "ok" : ""}`} style={{width:8,height:8,borderRadius:"50%",background:dfsActive ? "var(--accent)" : "var(--ink-4)"}}></span></span>
          <span style={{fontSize:13,color:"var(--ink-1)"}}>
            {dfsActive ? "Configured — keyword data active" : "Not configured — set DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD in Railway variables"}
          </span>
        </div>
      </div>

      {/* Keyword Research Settings */}
      <div className="card" style={{marginBottom:20}}>
        <div className="card-head"><div className="card-title">Keyword Research Settings</div></div>
        <div style={{padding:"14px 16px"}}>
          <div className="alert-banner info" style={{marginBottom:16}}>
            <strong>Keywords per level:</strong> For each AI tag, the system generates keywords at 3 competition levels (HIGH, MEDIUM, LOW). 10 = 30 total per tag.
            <strong> Min volume:</strong> Only create Smart Collections for keywords above this monthly search volume.
          </div>
          <div className="two-col-lg">
            <div>
              <label className="editor-label">Keywords per competition level</label>
              <input type="number" className="editor-input" value={form.kwPerBucket} onChange={h("kwPerBucket")} min="1" max="50" style={{border:"1px solid var(--line)",borderRadius:"var(--r-sm)",padding:"7px 11px",width:120}} />
              <div className="editor-hint">N HIGH + N MEDIUM + N LOW per tag</div>
            </div>
            <div>
              <label className="editor-label">Minimum volume for collections</label>
              <input type="number" className="editor-input" value={form.minVolume} onChange={h("minVolume")} min="0" max="5000" style={{border:"1px solid var(--line)",borderRadius:"var(--r-sm)",padding:"7px 11px",width:120}} />
              <div className="editor-hint">Skip keywords below this volume</div>
            </div>
          </div>
        </div>
      </div>

      {/* IndexNow */}
      <div className="card" style={{marginBottom:20}}>
        <div className="card-head">
          <div className="card-title" style={{flex:1}}>
            IndexNow — Instant Indexing
            <div style={{fontSize:13,color:"var(--ink-3)",marginTop:4,fontWeight:400}}>Notifies Bing, Copilot and Yandex instantly when content is updated.</div>
          </div>
          <button className={`btn ${indexNowEnabled ? "btn-primary" : "btn-ghost"}`} onClick={() => {
            const fd = new FormData();
            fd.set("indexNowEnabled", String(!indexNowEnabled));
            submit(fd, { method: "POST" });
          }} style={{minWidth:72}}>
            {indexNowEnabled ? "ON" : "OFF"}
          </button>
        </div>

        {indexNowEnabled && (
          <div style={{padding:"14px 16px"}}>
            <div className="editor-label">Auto-submit on update</div>
            <div className="config-list" style={{marginBottom:16}}>
              {[
                { key: "indexnow_auto_products",    label: "Products",    desc: "When a product is created or updated" },
                { key: "indexnow_auto_articles",    label: "Blog articles", desc: "When an article is published or updated" },
                { key: "indexnow_auto_collections", label: "Collections", desc: "When a collection is created via SEO Engine" },
              ].map((item) => (
                <IndexNowToggle key={item.key} settingKey={item.key} label={item.label} desc={item.desc} submit={submit} currentValue={settings[item.key] !== "false"} />
              ))}
            </div>

            <div style={{background:"var(--surface-2)",border:"1px solid var(--line)",borderRadius:"var(--r)",padding:14}}>
              <div className="editor-label">Verification Key &amp; Manual Submit</div>
              <IndexNowStatus />
            </div>
          </div>
        )}
      </div>

      {/* Robots.txt AI Crawlers Audit */}
      {robotsAudit && (
        <div className="card" style={{marginBottom:20,borderLeft:`4px solid ${robotsAudit.status === "ok" ? "var(--accent)" : robotsAudit.status === "critical" ? "var(--danger)" : "var(--warn)"}`}}>
          <div className="card-head">
            <div className="card-title">AI Crawlers Access</div>
            <span className={`delta ${robotsAudit.status === "ok" ? "up" : "down"}`}>
              {robotsAudit.status === "ok" ? "All bots allowed" : robotsAudit.status === "critical" ? `${robotsAudit.criticalBlock} critical bots blocked` : `${robotsAudit.blockedCount} bots blocked`}
            </span>
          </div>
          <div>
            {robotsAudit.bots.map((bot) => (
              <div key={bot.name} className="data-row" style={{gridTemplateColumns:"auto 180px 1fr auto"}}>
                <span style={{width:8,height:8,borderRadius:"50%",background: bot.blocked ? (bot.critical ? "var(--danger)" : "var(--warn)") : "var(--accent)",flexShrink:0}} />
                <span style={{fontWeight:600,color:"var(--ink-0)"}}>{bot.name}</span>
                <span style={{color:"var(--ink-3)",fontSize:12}}>{bot.owner}</span>
                <span className={bot.blocked ? "delta down" : "delta up"}>{bot.blocked ? "BLOCKED" : "Allowed"}</span>
              </div>
            ))}
          </div>
          {robotsAudit.blockedCount > 0 && (
            <div className="alert-banner warn" style={{margin:"0 16px 16px"}}>
              <strong>Fix:</strong> Add the blocked bots to your robots.txt with <code>Allow: /</code> rules. Go to <strong>Shopify Admin &rarr; Online Store &rarr; Preferences &rarr; robots.txt</strong>.
            </div>
          )}
        </div>
      )}

      {/* Save */}
      <div style={{paddingTop:8,textAlign:"right"}}>
        <button className="btn btn-primary" onClick={handleSave} disabled={isSaving}>
          {isSaving ? "Saving..." : "Save Settings"}
        </button>
      </div>
    </div>
  );
}

// IndexNow Toggle Component
function IndexNowToggle({ settingKey, label, desc, submit, currentValue }) {
  const [enabled, setEnabled] = useState(currentValue);

  const toggle = () => {
    const newVal = !enabled;
    setEnabled(newVal);
    const fd = new FormData();
    fd.set("indexNowSetting", settingKey);
    fd.set("indexNowValue", String(newVal));
    submit(fd, { method: "POST" });
  };

  return (
    <div className="config-row">
      <div className="config-row-main">
        <div className="config-row-title">{label}</div>
        <div className="config-row-desc">{desc}</div>
      </div>
      <button className={`btn ${enabled ? "btn-primary" : "btn-ghost"}`} onClick={toggle} style={{fontSize:12,padding:"5px 14px"}}>
        {enabled ? "Auto" : "Off"}
      </button>
    </div>
  );
}

// IndexNow Status + Manual Submit Component
function IndexNowStatus() {
  const [status,     setStatus]     = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [submitting, setSubmitting] = useState(null);
  const [msg,        setMsg]        = useState("");
  const [customUrl,  setCustomUrl]  = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await fetch("/api/indexnow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "status" }),
      });
      const data = await resp.json();
      if (data.success) setStatus(data);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const submitProducts = async () => {
    setSubmitting("products");
    setMsg("");
    try {
      const resp = await fetch("/api/indexnow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "submit_products" }),
      });
      const data = await resp.json();
      setMsg(data.success
        ? `Submitted ${data.submitted} / ${data.total} product URLs.`
        : `Error: ${data.error}`);
    } catch (e) { setMsg(`Error: ${e.message}`); }
    setSubmitting(null);
  };

  const submitCustom = async () => {
    if (!customUrl.trim()) return;
    const urls = customUrl.split("\n").map((u) => u.trim()).filter(Boolean);
    setSubmitting("custom");
    setMsg("");
    try {
      const resp = await fetch("/api/indexnow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "submit_urls", urls }),
      });
      const data = await resp.json();
      setMsg(data.success
        ? `Submitted ${data.submitted} URL(s).`
        : `Error: ${data.error}`);
    } catch (e) { setMsg(`Error: ${e.message}`); }
    setSubmitting(null);
  };

  if (loading) return <div style={{fontSize:12,color:"var(--ink-4)"}}>Loading...</div>;
  if (!status) return <div style={{fontSize:12,color:"var(--ink-4)"}}>Could not load IndexNow status.</div>;

  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <div>
        <div className="editor-hint" style={{marginBottom:4}}>Verification key (auto-generated)</div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <code style={{fontSize:12,fontFamily:"var(--mono)",background:"var(--surface-2)",padding:"4px 10px",borderRadius:4,color:"var(--ink-1)",flex:1}}>{status.apiKey}</code>
          <a href={status.keyUrl} target="_blank" rel="noreferrer" className="card-action">Verify &rarr;</a>
        </div>
        <div className="editor-hint">Key file served at: <code style={{fontFamily:"var(--mono)"}}>{status.keyUrl}</code></div>
      </div>

      <div>
        <div className="editor-hint" style={{marginBottom:6}}>Manual submit — all synced products</div>
        <button className="btn btn-primary" onClick={submitProducts} disabled={!!submitting}>
          {submitting === "products" ? "Submitting..." : "Submit all products now"}
        </button>
      </div>

      <div>
        <div className="editor-hint" style={{marginBottom:6}}>Manual submit — custom URLs (one per line)</div>
        <textarea className="editor-input" value={customUrl} onChange={(e) => setCustomUrl(e.target.value)} placeholder={"https://yourstore.com/products/slug\nhttps://yourstore.com/collections/slug"} rows={3} style={{border:"1px solid var(--line)",borderRadius:"var(--r-sm)",padding:"7px 11px",fontFamily:"var(--mono)",fontSize:12,resize:"vertical"}} />
        <button className="btn btn-ghost" onClick={submitCustom} disabled={!!submitting || !customUrl.trim()} style={{marginTop:6}}>
          {submitting === "custom" ? "Submitting..." : "Submit URLs"}
        </button>
      </div>

      {msg && (
        <div className={`alert-banner ${msg.startsWith("Submitted") ? "ok" : "warn"}`}>{msg}</div>
      )}
    </div>
  );
}
