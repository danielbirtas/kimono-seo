// app/routes/app.settings.jsx
// Kimono SEO — Unified Settings (client-facing)

import { useState, useEffect, useCallback } from "react";
import { useFetcher, useLoaderData, useSearchParams, useNavigate } from "react-router";

/* ── loader ─────────────────────────────────────────────── */
export const loader = async ({ request }) => {
  const { requireAuth } = await import("../lib/auth/index.server.js");
  const prisma = (await import("../db.server.js")).default;
  const { getAllSeoSettings, isGscConnected } = await import("../lib/seo/settings.server.js");
  const { buildGscAuthUrl } = await import("../lib/seo/gsc.server.js");
  const { hasDfsConfig } = await import("../lib/seo/dataforseo.server.js");

  const { user, connection, store, storeId } = await requireAuth(request);
  const shopDomain = connection?.shopDomain || null;

  // Profile data
  const profile = {
    name:  user.name  || "",
    email: user.email || "",
    plan:  user.plan  || "FREE",
  };

  if (!storeId || !connection) {
    return {
      profile,
      shopDomain,
      settings: {},
      pipeline: defaultPipeline(),
      gscConnected: false,
      dfsActive: false,
      gscAuthUrl: "",
      gscSiteUrl: "",
      authorName: "Editor",
      aiLanguage: "ro",
      aiTone: "professional",
    };
  }

  // Store settings (AI config)
  const storeSettings = await prisma.storeSettings.findUnique({ where: { storeId } });

  // Pipeline
  const pipeline = storeSettings ? {
    pipelineMode:      storeSettings.pipelineMode,
    taxonomyAutoApply: storeSettings.taxonomyAutoApply,
  } : defaultPipeline();

  // Author name
  let authorName = "Editor";
  try {
    const authorSetting = await prisma.seoSetting.findUnique({
      where: { storeId_key: { storeId, key: "seo_author_name" } },
    });
    if (authorSetting?.value) authorName = authorSetting.value;
  } catch {}

  // SEO connections
  const settings     = await getAllSeoSettings(storeId);
  const gscConnected = isGscConnected(settings);
  const ga4Connected = !!settings["ga4_property_id"];
  const dfsActive    = hasDfsConfig();
  const gscAuthUrl   = buildGscAuthUrl(shopDomain);

  // Social media settings
  const socialKeys = ["social_facebook","social_instagram","social_youtube","social_tiktok","social_pinterest","social_linkedin","social_twitter"];
  const socialSettings = {};
  for (const key of socialKeys) {
    try {
      const row = await prisma.seoSetting.findUnique({
        where: { storeId_key: { storeId, key } },
      });
      socialSettings[key] = row?.value || "";
    } catch { socialSettings[key] = ""; }
  }

  return {
    profile,
    shopDomain,
    settings,
    pipeline,
    gscConnected,
    ga4Connected,
    dfsActive,
    gscAuthUrl,
    gscSiteUrl: settings.gscSiteUrl || "",
    ga4PropertyId: settings["ga4_property_id"] || "",
    authorName,
    aiLanguage: storeSettings?.aiLanguage || "ro",
    aiTone:     storeSettings?.aiTone     || "professional",
    socialSettings,
  };
};

function defaultPipeline() {
  return {
    pipelineMode:      "AUTO_PILOT",
    taxonomyAutoApply: false,
  };
}

/* ── action ─────────────────────────────────────────────── */
export const action = async ({ request }) => {
  const { requireAuth } = await import("../lib/auth/index.server.js");
  const prisma = (await import("../db.server.js")).default;
  const { clearGscTokens } = await import("../lib/seo/settings.server.js");

  const { user, connection, store, storeId } = await requireAuth(request);
  const shopDomain = connection?.shopDomain || "";
  if (!storeId || !connection) return { error: "No store connected" };

  const formData = await request.formData();
  const intent   = formData.get("intent");

  // Disconnect GSC
  if (intent === "disconnect_gsc") {
    await clearGscTokens(storeId);
    return { disconnected: true };
  }

  // Disconnect GA4
  if (intent === "disconnect_ga4") {
    await prisma.seoSetting.deleteMany({
      where: { storeId, key: { in: ["ga4_refresh_token", "ga4_access_token", "ga4_expires_at", "ga4_property_id", "ga4_property_name"] } },
    });
    return { disconnected: true };
  }

  // Disconnect Shopify — soft disconnect: pune isActive=false pe StoreConnection.
  // requireAuth filtrează prin isActive=true deci conexiunea dispare imediat.
  // Datele (Store + SeoProduct etc.) rămân; user poate reconnect ca să le reactiveze.
  if (intent === "disconnect_shopify") {
    await prisma.storeConnection.updateMany({
      where: { userId: user.id, platform: "SHOPIFY", isActive: true },
      data:  { isActive: false },
    });
    return { disconnected: "shopify" };
  }

  // Save pipeline
  if (intent === "save_pipeline") {
    const data = {
      pipelineMode:      formData.get("pipelineMode") === "REVIEW_MANUAL" ? "REVIEW_MANUAL" : "AUTO_PILOT",
      taxonomyAutoApply: formData.get("taxonomyAutoApply") === "on",
    };
    await prisma.storeSettings.upsert({
      where:  { storeId },
      update: data,
      create: { storeId, ...data },
    });
    return { saved: true };
  }

  // Save profile (author, language, tone)
  if (intent === "save_profile") {
    await prisma.storeSettings.upsert({
      where:  { storeId },
      update: {
        aiLanguage: formData.get("aiLanguage") || "ro",
        aiTone:     formData.get("aiTone")     || "professional",
      },
      create: {
        storeId,
        aiLanguage: formData.get("aiLanguage") || "ro",
        aiTone:     formData.get("aiTone")     || "professional",
      },
    });

    const authorName = formData.get("authorName");
    if (authorName) {
      await prisma.seoSetting.upsert({
        where: { storeId_key: { storeId, key: "seo_author_name" } },
        create: { storeId, key: "seo_author_name", value: authorName },
        update: { value: authorName },
      });
    }
    return { saved: true };
  }

  // Save social media
  if (intent === "save-social") {
    const socialKeys = ["social_facebook","social_instagram","social_youtube","social_tiktok","social_pinterest","social_linkedin","social_twitter"];
    for (const key of socialKeys) {
      const val = formData.get(key) || "";
      await prisma.seoSetting.upsert({
        where: { storeId_key: { storeId, key } },
        update: { value: val },
        create: { storeId, key, value: val },
      });
    }
    return { saved: true };
  }

  return { error: "Unknown intent" };
};

/* ── component ──────────────────────────────────────────── */
export default function Settings() {
  const {
    profile, shopDomain, pipeline, gscConnected, ga4Connected, dfsActive,
    gscAuthUrl, gscSiteUrl, ga4PropertyId, authorName, aiLanguage, aiTone,
    socialSettings,
  } = useLoaderData();

  const fetcher     = useFetcher();
  const navigate    = useNavigate();
  const [searchParams] = useSearchParams();
  const isSaving    = ["loading", "submitting"].includes(fetcher.state);

  const gscJustConnected = searchParams.get("gsc_connected") === "1";
  const gscError         = searchParams.get("gsc_error") || "";
  const pickSite         = searchParams.get("pick_site") === "1";

  // Profile form
  const [profileForm, setProfileForm] = useState({
    authorName: authorName || "",
    aiLanguage: aiLanguage || "ro",
    aiTone:     aiTone     || "professional",
  });

  // Social media form
  const [social, setSocial] = useState(socialSettings || {});

  const saveSocial = () => {
    const fd = new FormData();
    fd.set("intent", "save-social");
    const socialKeys = ["social_facebook","social_instagram","social_youtube","social_tiktok","social_pinterest","social_linkedin","social_twitter"];
    for (const key of socialKeys) {
      fd.set(key, social[key] || "");
    }
    fetcher.submit(fd, { method: "POST" });
  };

  // Pipeline form
  const [pl, setPl] = useState({
    pipelineMode:      pipeline?.pipelineMode || "AUTO_PILOT",
    taxonomyAutoApply: pipeline?.taxonomyAutoApply ?? false,
  });

  // GSC site picker
  const [sites,        setSites]        = useState([]);
  const [loadingSites, setLoadingSites] = useState(false);
  const [selectedSite, setSelectedSite] = useState(gscSiteUrl || "");

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
    window.history.replaceState({}, "", "/app/settings?gsc_connected=1");
  }, []);

  const handleConnectGsc = useCallback(() => {
    window.top.location.href = gscAuthUrl;
  }, [gscAuthUrl]);

  const handleDisconnectGsc = useCallback(() => {
    if (!confirm("Disconnect Google Search Console?")) return;
    const fd = new FormData();
    fd.set("intent", "disconnect_gsc");
    fetcher.submit(fd, { method: "POST" });
  }, [fetcher]);

  const handleDisconnectShopify = useCallback(() => {
    if (!confirm("Disconnect Shopify store?\n\nVa trebui să reconectezi pentru a folosi platforma. Datele (produse, audit-uri, keywords) se păstrează — doar tokenul de acces e dezactivat.")) return;
    const fd = new FormData();
    fd.set("intent", "disconnect_shopify");
    fetcher.submit(fd, { method: "POST" });
  }, [fetcher]);


  // GA4 handlers
  const [ga4AuthUrl, setGa4AuthUrl] = useState(null);

  useEffect(() => {
    fetch("/api/ga4")
      .then(r => r.json())
      .then(d => { if (d.authUrl) setGa4AuthUrl(d.authUrl); })
      .catch(() => {});
  }, []);

  const handleConnectGa4 = useCallback(() => {
    if (ga4AuthUrl) {
      window.top.location.href = ga4AuthUrl;
    } else {
      // Fallback: try fetching the URL
      fetch("/api/ga4")
        .then(r => r.json())
        .then(d => { if (d.authUrl) window.top.location.href = d.authUrl; })
        .catch(() => alert("Could not get GA4 auth URL"));
    }
  }, [ga4AuthUrl]);

  const handleDisconnectGa4 = useCallback(async () => {
    if (!confirm("Disconnect Google Analytics 4?")) return;
    try {
      await fetch("/api/ga4", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "disconnect" }),
      });
      window.location.reload();
    } catch {}
  }, []);
  const saveProfile = () => {
    const fd = new FormData();
    fd.set("intent", "save_profile");
    fd.set("authorName", profileForm.authorName);
    fd.set("aiLanguage", profileForm.aiLanguage);
    fd.set("aiTone",     profileForm.aiTone);
    fetcher.submit(fd, { method: "POST" });
  };

  const savePipeline = () => {
    const fd = new FormData();
    fd.set("intent", "save_pipeline");
    fd.set("pipelineMode", pl.pipelineMode);
    if (pl.taxonomyAutoApply) fd.set("taxonomyAutoApply", "on");
    fetcher.submit(fd, { method: "POST" });
  };

  return (
    <div className="page active">

      {/* ── Header ── */}
      <div className="page-head">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-sub">
            {shopDomain || "No store connected"}{" "}
            <span className="q-tag info">{profile.plan}</span>
          </p>
        </div>
      </div>

      {/* ── Banners ── */}
      {gscJustConnected && !pickSite && (
        <div className="alert-banner ok" style={{marginBottom:16}}>
          Google Search Console connected.
          {selectedSite && <> Tracking: <strong>{selectedSite}</strong></>}
        </div>
      )}
      {gscError && (
        <div className="alert-banner warn" style={{marginBottom:16}}>
          GSC error: {decodeURIComponent(gscError)}
        </div>
      )}

      {/* ═══════════ SECTION 1: Profile ═══════════ */}
      <div className="card" style={{marginBottom:20}}>
        <div className="card-head">
          <div className="card-title">Profile</div>
          <button className="btn btn-primary" onClick={saveProfile} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save Profile"}
          </button>
        </div>
        <div style={{padding:"14px 16px",display:"flex",flexDirection:"column",gap:16}}>

          {/* Name & Email (read-only) */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
            <div>
              <label className="editor-label">Name</label>
              <div style={{fontSize:14,color:"var(--ink-0)",fontWeight:600,padding:"7px 0"}}>
                {profile.name || "\u2014"}
              </div>
            </div>
            <div>
              <label className="editor-label">Email</label>
              <div style={{fontSize:14,color:"var(--ink-0)",padding:"7px 0"}}>
                {profile.email || "\u2014"}
              </div>
            </div>
          </div>

          {/* Author Name */}
          <div className="editor-row">
            <label className="editor-label">Article Author Name</label>
            <input
              type="text"
              className="editor-input"
              value={profileForm.authorName}
              onChange={(e) => setProfileForm(p => ({ ...p, authorName: e.target.value }))}
              placeholder="e.g. Maria Ionescu"
              style={{border:"1px solid var(--line)",borderRadius:"var(--r-sm)",padding:"7px 11px",maxWidth:360}}
            />
            <div className="editor-hint">Used in BlogPosting schema for E-E-A-T signals.</div>
          </div>

          {/* Language & Tone */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
            <div>
              <label className="editor-label">Content Language</label>
              <select
                className="editor-input"
                value={profileForm.aiLanguage}
                onChange={(e) => setProfileForm(p => ({ ...p, aiLanguage: e.target.value }))}
                style={{border:"1px solid var(--line)",borderRadius:"var(--r-sm)",padding:"7px 11px",background:"var(--surface)"}}
              >
                <option value="ro">Romana</option>
                <option value="en">English</option>
                <option value="de">Deutsch</option>
                <option value="fr">Francais</option>
                <option value="hu">Magyar</option>
              </select>
            </div>
            <div>
              <label className="editor-label">Tone</label>
              <select
                className="editor-input"
                value={profileForm.aiTone}
                onChange={(e) => setProfileForm(p => ({ ...p, aiTone: e.target.value }))}
                style={{border:"1px solid var(--line)",borderRadius:"var(--r-sm)",padding:"7px 11px",background:"var(--surface)"}}
              >
                <option value="professional">Professional</option>
                <option value="friendly">Friendly</option>
                <option value="concise">Concise</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════ SECTION 2: Connections ═══════════ */}
      <div className="card" style={{marginBottom:20}}>
        <div className="card-head">
          <div className="card-title">Connections</div>
        </div>
        <div>

          {/* Store */}
          <div className="data-row" style={{gridTemplateColumns:"1fr auto",alignItems:"center"}}>
            <div>
              <div style={{fontSize:13,fontWeight:600,color:"var(--ink-0)"}}>Shopify Store</div>
              <div style={{fontSize:12,color:"var(--ink-3)",marginTop:2}}>
                {shopDomain || "Not connected — connect your Shopify store to start using the platform"}
              </div>
            </div>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <span className={`q-tag ${shopDomain ? "ok" : "warn"}`}>
                {shopDomain ? "Connected" : "Not connected"}
              </span>
              {!shopDomain ? (
                <a href="/connect-store" className="btn btn-primary" style={{fontSize:12,padding:"5px 14px",textDecoration:"none"}}>
                  Connect
                </a>
              ) : (
                <div style={{display:"flex",gap:6}}>
                  <a href="/connect-store" className="btn btn-ghost" style={{fontSize:11,padding:"4px 10px",textDecoration:"none"}}>
                    Reconnect
                  </a>
                  <button className="btn btn-ghost" onClick={handleDisconnectShopify} style={{fontSize:11,padding:"4px 10px",color:"var(--danger)",borderColor:"var(--danger)"}}>
                    Disconnect
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Google Search Console */}
          <div className="data-row" style={{gridTemplateColumns:"1fr auto",alignItems:"center"}}>
            <div>
              <div style={{fontSize:13,fontWeight:600,color:"var(--ink-0)"}}>Google Search Console</div>
              <div style={{fontSize:12,color:"var(--ink-3)",marginTop:2}}>
                {gscConnected
                  ? (gscSiteUrl ? `Tracking: ${gscSiteUrl}` : "Connected")
                  : "Not connected \u2014 connect to see clicks, impressions & position data"}
              </div>
            </div>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <span className={`q-tag ${gscConnected ? "ok" : "warn"}`}>
                {gscConnected ? "Connected" : "Not connected"}
              </span>
              {!gscConnected ? (
                <button className="btn btn-primary" onClick={handleConnectGsc} style={{fontSize:12,padding:"5px 14px"}}>
                  Connect
                </button>
              ) : (
                <div style={{display:"flex",gap:6}}>
                  <button className="btn btn-ghost" onClick={handleConnectGsc} style={{fontSize:11,padding:"4px 10px"}}>
                    Reconnect
                  </button>
                  <button className="btn btn-ghost" onClick={handleDisconnectGsc} style={{fontSize:11,padding:"4px 10px",color:"var(--danger)",borderColor:"var(--danger)"}}>
                    Disconnect
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* GSC Site Picker */}
          {pickSite && gscConnected && sites.length > 0 && (
            <div style={{padding:"12px 16px",borderTop:"1px solid var(--line)"}}>
              <label className="editor-label">Select property to track</label>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {sites.map((site) => (
                  <button key={site} onClick={() => handleSelectSite(site)}
                    className={`btn ${selectedSite === site ? "btn-primary" : "btn-ghost"}`}
                    style={{textAlign:"left"}}>
                    {site}
                  </button>
                ))}
              </div>
              {loadingSites && <div style={{fontSize:12,color:"var(--ink-3)",marginTop:8}}>Loading sites...</div>}
            </div>
          )}

          {/* Google Analytics 4 */}
          <div className="data-row" style={{gridTemplateColumns:"1fr auto",alignItems:"center"}}>
            <div>
              <div style={{fontSize:13,fontWeight:600,color:"var(--ink-0)"}}>Google Analytics 4</div>
              <div style={{fontSize:12,color:"var(--ink-3)",marginTop:2}}>
                {ga4Connected
                  ? `Property ID: ${ga4PropertyId}`
                  : "Not connected \u2014 add your GA4 Property ID in AI Traffic settings"}
              </div>
            </div>
            <span className={`q-tag ${ga4Connected ? "ok" : "warn"}`}>
              {ga4Connected ? "Connected" : "Not connected"}
            </span>
          </div>

          {/* DataForSEO */}
          <div className="data-row" style={{gridTemplateColumns:"1fr auto",alignItems:"center"}}>
            <div>
              <div style={{fontSize:13,fontWeight:600,color:"var(--ink-0)"}}>DataForSEO</div>
              <div style={{fontSize:12,color:"var(--ink-3)",marginTop:2}}>Keyword volumes, SERP data and competition analysis</div>
            </div>
            <span className={`q-tag ${dfsActive ? "ok" : "warn"}`}>
              {dfsActive ? "Active" : "Not configured"}
            </span>
          </div>
        </div>
      </div>


      {/* =========== SECTION: Social Media =========== */}
      <div className="card" style={{marginBottom:20}}>
        <div className="card-head">
          <div className="card-title">Social Media</div>
          <button className="btn btn-primary" onClick={saveSocial} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save"}
          </button>
        </div>
        <div style={{padding:"14px 16px"}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px 20px"}}>
            {[
              ["social_facebook",  "Facebook URL"],
              ["social_instagram", "Instagram URL"],
              ["social_youtube",   "YouTube URL"],
              ["social_tiktok",    "TikTok URL"],
              ["social_pinterest", "Pinterest URL"],
              ["social_linkedin",  "LinkedIn URL"],
              ["social_twitter",   "Twitter / X URL"],
            ].map(([key, label]) => (
              <div className="editor-row" key={key} style={{marginBottom:0}}>
                <label className="editor-label">{label}</label>
                <input
                  type="url"
                  className="editor-input"
                  value={social[key] || ""}
                  onChange={(e) => setSocial(s => ({ ...s, [key]: e.target.value }))}
                  placeholder={"https://..."}
                  style={{border:"1px solid var(--line)",borderRadius:"var(--r-sm)",padding:"7px 11px",width:"100%",boxSizing:"border-box"}}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ═══════════ SECTION 3: Pipeline ═══════════ */}
      <div className="card" style={{marginBottom:20}}>
        <div className="card-head">
          <div className="card-title">Pipeline</div>
          <button className="btn btn-primary" onClick={savePipeline} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save Pipeline"}
          </button>
        </div>
        <div style={{padding:"14px 16px"}}>
          <div className="alert-banner info" style={{marginBottom:16}}>
            Configure how the platform processes new products and auto-detected tags.
          </div>

          <div className="editor-row">
            <label className="editor-label">Processing Mode</label>
            <select
              className="editor-input"
              value={pl.pipelineMode}
              onChange={(e) => setPl(p => ({ ...p, pipelineMode: e.target.value }))}
              style={{border:"1px solid var(--line)",borderRadius:"var(--r-sm)",padding:"7px 11px",background:"var(--surface)",maxWidth:480}}
            >
              <option value="AUTO_PILOT">Auto-pilot — automatically process new products</option>
              <option value="REVIEW_MANUAL">Review manual — show in dashboard, wait for approval</option>
            </select>
            <div className="editor-hint">In Auto-pilot mode, the pipeline runs automatically every 15 minutes.</div>
          </div>

          <div className="config-list" style={{marginTop:12}}>
            <div className="config-row">
              <div className="config-row-main">
                <div className="config-row-title">Auto-apply taxonomy proposals</div>
                <div className="config-row-desc">Automatically apply taxonomy proposals without manual confirmation.</div>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={pl.taxonomyAutoApply}
                  onChange={(e) => setPl(p => ({ ...p, taxonomyAutoApply: e.target.checked }))}
                />
                <span className="switch-track"></span>
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
