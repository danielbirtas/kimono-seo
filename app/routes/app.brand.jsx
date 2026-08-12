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
  if (!storeId) return { brandSerp: null, citations: null, brandName: "", domain: "", serpControl: 0, citationCount: 0 };

  const store = await prisma.store.findUnique({ where: { id: storeId } }).catch(() => null);

  const [brandSerpSaved, citationSaved, brandSetting, domainSetting] = await Promise.all([
    prisma.seoSetting.findUnique({ where: { storeId_key: { storeId, key: "brand_serp_results" } } }).catch(() => null),
    prisma.seoSetting.findUnique({ where: { storeId_key: { storeId, key: "citation_results" } } }).catch(() => null),
    prisma.seoSetting.findUnique({ where: { storeId_key: { storeId, key: "brand_name" } } }).catch(() => null),
    prisma.seoSetting.findUnique({ where: { storeId_key: { storeId, key: "seo_gsc_site_url" } } }).catch(() => null),
  ]);

  let brandSerp = null;
  if (brandSerpSaved?.value) { try { brandSerp = JSON.parse(brandSerpSaved.value); } catch {} }

  let citations = null;
  if (citationSaved?.value) { try { citations = JSON.parse(citationSaved.value); } catch {} }

  const brandName = brandSetting?.value || store?.shopName || "";
  const domain = domainSetting?.value?.replace(/https?:\/\//, "").replace(/\/$/, "") || store?.shopDomain?.replace(".myshopify.com", "") || "";

  // Compute SERP control count
  let serpControl = 0;
  if (brandSerp?.results) {
    serpControl = brandSerp.results.filter(r => r.owned || r.type === "owned" || r.controlled).length;
  }

  // Citation count
  let citationCount = 0;
  if (citations?.mentions) {
    citationCount = citations.mentions.length;
  } else if (citations?.total) {
    citationCount = citations.total;
  }

  // Social media profiles
  const socialKeys = ["social_facebook","social_instagram","social_youtube","social_tiktok","social_pinterest","social_linkedin","social_twitter"];
  const socialSettings = await prisma.seoSetting.findMany({
    where: { storeId, key: { in: socialKeys } },
  }).catch(() => []);
  const social = Object.fromEntries(socialSettings.map(s => [s.key.replace("social_",""), s.value]));

  return { brandSerp, citations, brandName, domain, serpControl, citationCount, social };
};

export default function BrandMonitoring() {
  const data = useLoaderData();
  const [activeTab, setActiveTab] = useState("br-serp");
  const [tblPage, setTblPage] = useState(1);
  const [tblPerPage, setTblPerPage] = useState(25);

  const brandSerp = data?.brandSerp;
  const citations = data?.citations;
  const brandName = data?.brandName || "Brand";
  const domain = data?.domain || "";
  const serpControl = data?.serpControl || 0;
  const citationCount = data?.citationCount || 0;

  const serpResults = brandSerp?.results || brandSerp?.organic || [];
  const citationList = citations?.mentions || citations?.citations || [];
  const sentiment = citations?.sentiment || {};

  return (
    <div className="page active" id="page-brand">

      <div className="page-head">
        <div>
          <div className="greet-kicker">
            <span className="live-dot"></span>
            <span>Brand SERP monitorizat · {fmt(citationCount)} citations tracked · IndexNow activ</span>
          </div>
          <h1 className="page-title">Brand &amp; <em>Monitoring</em></h1>
          <p className="page-sub">Brand SERP, citations web, IndexNow sync cu motoare &amp; agentic commerce (MCP).</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost">Refresh SERP</button>
          <button className="btn btn-primary">Ping IndexNow</button>
        </div>
      </div>

      <div className="metric-grid">
        <div className="metric"><div className="metric-label">Brand SERP control</div><div className="metric-value">{serpControl}<span className="unit">/10</span></div><div className="metric-foot"><span className="kpi-sub">top 10 rezultate</span></div></div>
        <div className="metric"><div className="metric-label">Knowledge Panel</div><div className="metric-value"><span style={{"color":"var(--accent-ink)","fontSize":"14px"}}>{brandSerp ? "Activ" : "Necunoscut"}</span></div><div className="metric-foot"><span className="kpi-sub">cu logo + sameAs</span></div></div>
        <div className="metric"><div className="metric-label">Citations</div><div className="metric-value">{fmt(citationCount)}</div><div className="metric-foot"><span className="kpi-sub">total tracked</span></div></div>
        <div className="metric"><div className="metric-label">Brand Name</div><div className="metric-value"><span style={{"fontSize":"14px"}}>{brandName || "N/A"}</span></div><div className="metric-foot"><span className="kpi-sub">{domain}</span></div></div>
      </div>

      <div className="subnav">
        <button className={`subnav-tab ${activeTab === "br-serp" ? "active" : ""}`} onClick={() => setActiveTab("br-serp")} data-subtab="br-serp">Brand SERP</button>
        <button className={`subnav-tab ${activeTab === "br-citations" ? "active" : ""}`} onClick={() => setActiveTab("br-citations")} data-subtab="br-citations">Citations</button>
        <button className={`subnav-tab ${activeTab === "br-indexnow" ? "active" : ""}`} onClick={() => setActiveTab("br-indexnow")} data-subtab="br-indexnow">IndexNow</button>
        <button className={`subnav-tab ${activeTab === "br-agentic" ? "active" : ""}`} onClick={() => setActiveTab("br-agentic")} data-subtab="br-agentic">Agentic Commerce <span className="sn-pill">MCP</span></button>
      </div>

      {/* PANEL: SERP */}
      <div className={`subnav-panel ${activeTab === "br-serp" ? "active" : ""}`} id="br-serp">
        <div className="two-col-sm">
          <div className="card">
            <div className="card-head"><div className="card-title">SERP pentru &ldquo;{brandName}&rdquo; · google.ro</div></div>
            <div style={{"padding":"16px 18px","display":"flex","flexDirection":"column","gap":"12px"}}>
              {serpResults.length > 0 ? serpResults.slice(0, 5).map((r, i) => (
                <div className="serp-preview" key={i}>
                  <div className="serp-bread">{r.domain || r.url || "—"}</div>
                  <div className="serp-title">{r.title || "Untitled"}</div>
                  <div className="serp-desc">{r.description || r.snippet || ""}</div>
                </div>
              )) : (
                <div style={{padding:"20px 0",color:"var(--ink-3)",fontSize:"13px",textAlign:"center"}}>
                  Nicio scanare Brand SERP inca. Foloseste pagina Brand SERP pentru a rula prima scanare.
                </div>
              )}
            </div>
          </div>

          <div>
            <div className="card">
              <div className="card-head"><div className="card-title">Knowledge Panel · preview</div></div>
              <div style={{"padding":"16px 18px"}}>
                <div style={{"padding":"16px","background":"var(--surface-2)","borderRadius":"var(--r)","border":"1px solid var(--line)"}}>
                  <div style={{"display":"flex","alignItems":"center","gap":"12px","marginBottom":"10px"}}>
                    <div style={{"width":"48px","height":"48px","borderRadius":"8px","background":"var(--ink-0)","color":"#fff","display":"flex","alignItems":"center","justifyContent":"center","fontWeight":"700","fontSize":"14px","fontFamily":"var(--mono)"}}>{brandName?.slice(0, 2)?.toUpperCase() || "BR"}</div>
                    <div>
                      <div style={{"fontSize":"15px","fontWeight":"600","color":"var(--ink-0)"}}>{brandName || "Brand"}</div>
                      <div style={{"fontSize":"11.5px","color":"var(--ink-3)"}}>Magazin online</div>
                    </div>
                  </div>
                  <div style={{"fontSize":"12px","color":"var(--ink-2)","lineHeight":"1.5","marginBottom":"10px"}}>{brandSerp?.knowledgePanel?.description || "Magazin online romanesc."}</div>
                  <div style={{"fontSize":"11px","color":"var(--ink-3)","marginBottom":"4px"}}><b>Domain:</b> {domain || "—"}</div>
                </div>
              </div>
            </div>

            <div className="card" style={{"marginTop":"14px"}}>
              <div className="card-head"><div className="card-title">Top 10 control SERP</div></div>
              <div style={{"padding":"4px 0"}}>
                {serpResults.length > 0 ? serpResults.slice(0, 10).map((r, i) => {
                  const owned = r.owned || r.type === "owned";
                  const controlled = r.controlled || r.type === "controlled";
                  const posClass = i < 3 ? "top" : i < 7 ? "mid" : "low";
                  return (
                    <div className="data-row" style={{"gridTemplateColumns":"30px 1fr auto"}} key={i}>
                      <span className={`pos-pill ${posClass}`} style={{"marginLeft":"6px"}}>{i + 1}</span>
                      <div className="data-row-main">
                        <div className="data-row-title">{r.domain || r.url || "—"}</div>
                        <div className="data-row-meta">{r.title?.slice(0, 40) || ""}</div>
                      </div>
                      <span className={`mod-status ${owned ? "live" : controlled ? "live" : "dev"}`}>
                        <span className="dot"></span>{owned ? "OWN" : controlled ? "CTRL" : "EXT"}
                      </span>
                    </div>
                  );
                }) : (
                  <div style={{padding:"14px 18px",color:"var(--ink-3)",fontSize:"13px"}}>Nicio scanare disponibila.</div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="card" style={{marginTop:"16px"}}>
          <div className="card-head">
            <div className="card-title">Social Media Profiles</div>
            <a href="/app/settings" className="card-action">Edit in Settings &rarr;</a>
          </div>
          <div className="data-list">
            {Object.entries(data.social || {}).filter(([k,v]) => v).map(([platform, url]) => (
              <div className="data-row" key={platform}>
                <span style={{fontWeight:500,textTransform:"capitalize"}}>{platform}</span>
                <a href={url} target="_blank" rel="noopener" style={{color:"var(--accent)",fontSize:"13px"}}>{url}</a>
              </div>
            ))}
            {Object.values(data.social || {}).filter(Boolean).length === 0 && (
              <div style={{padding:"16px",textAlign:"center",color:"var(--ink-3)",fontSize:"13px"}}>
                No social profiles configured. <a href="/app/settings" style={{color:"var(--accent)"}}>Add them in Settings</a>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* PANEL: CITATIONS */}
      <div className={`subnav-panel ${activeTab === "br-citations" ? "active" : ""}`} id="br-citations">
        <div className="card">
          <div className="card-head">
            <div className="card-title">Brand citations web · {fmt(citationCount)} total</div>
            <button className="card-action">Adauga citation</button>
          </div>
          <div className="table-wrap" style={{"border":"none","borderRadius":"0"}}>
            <table className="tbl">
              <thead><tr><th>Domain</th><th>Tip</th><th className="right">Traffic</th><th>Anchor</th><th>Context</th><th className="center">Sentiment</th></tr></thead>
              <tbody>
                {citationList.length > 0 ? citationList.slice((tblPage-1)*tblPerPage, tblPage*tblPerPage).map((c, i) => (
                  <tr key={i}>
                    <td className="mono">{c.domain || c.url || "—"}</td>
                    <td>{c.type || c.mention_type || "web"}</td>
                    <td className="right mono">{c.traffic ? fmt(c.traffic) : "—"}</td>
                    <td className="mono">{c.anchor || c.title || "—"}</td>
                    <td>{c.context || c.snippet?.slice(0, 50) || "—"}</td>
                    <td className="center">
                      <span className={`mod-status ${c.sentiment === "positive" ? "live" : c.sentiment === "negative" ? "err" : "dev"}`}>
                        <span className="dot"></span>{c.sentiment || "neutral"}
                      </span>
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan="6" style={{textAlign:"center",padding:"20px",color:"var(--ink-3)"}}>Nicio citatie monitorizata inca. Foloseste pagina Citation Monitor pentru a rula prima scanare.</td></tr>
                )}
              </tbody>
            </table>
            {citationList.length > tblPerPage && (
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
                  <span>{(tblPage-1)*tblPerPage+1}–{Math.min(tblPage*tblPerPage, citationList.length)} din {citationList.length}</span>
                  <button style={{padding:"4px 8px",border:"1px solid var(--line)",borderRadius:"6px",background:"var(--surface)",cursor:"pointer"}} disabled={tblPage <= 1} onClick={() => setTblPage(p => p-1)}>←</button>
                  <button style={{padding:"4px 8px",border:"1px solid var(--line)",borderRadius:"6px",background:"var(--surface)",cursor:"pointer"}} disabled={tblPage >= Math.ceil(citationList.length/tblPerPage)} onClick={() => setTblPage(p => p+1)}>→</button>
                </div>
              </div>
            )}
          </div>
        </div>

        {(sentiment.positive != null || sentiment.neutral != null || sentiment.negative != null) && (
        <div className="two-col-lg" style={{"marginTop":"14px"}}>
          <div className="card">
            <div className="card-head"><div className="card-title">Sentiment breakdown</div></div>
            <div style={{"padding":"14px 18px"}}>
              <div className="bar-list-item" style={{"border":"none","padding":"8px 0"}}>
                <div><div className="bar-list-name">Pozitiv</div><div className="bar-list-bar"><div className="bar-list-bar-fill" style={{"width":`${Math.min(100, (sentiment.positive || 0))}%`,"background":"var(--accent)"}}></div></div></div>
                <div className="bar-list-val">{sentiment.positive || 0}</div>
              </div>
              <div className="bar-list-item" style={{"padding":"8px 0"}}>
                <div><div className="bar-list-name">Neutru</div><div className="bar-list-bar"><div className="bar-list-bar-fill" style={{"width":`${Math.min(100, (sentiment.neutral || 0))}%`,"background":"var(--ink-4)"}}></div></div></div>
                <div className="bar-list-val">{sentiment.neutral || 0}</div>
              </div>
              <div className="bar-list-item" style={{"padding":"8px 0"}}>
                <div><div className="bar-list-name">Negativ</div><div className="bar-list-bar"><div className="bar-list-bar-fill" style={{"width":`${Math.min(100, (sentiment.negative || 0))}%`,"background":"var(--danger)"}}></div></div></div>
                <div className="bar-list-val">{sentiment.negative || 0}</div>
              </div>
            </div>
          </div>
        </div>
        )}
      </div>

      {/* PANEL: INDEXNOW */}
      <div className={`subnav-panel ${activeTab === "br-indexnow" ? "active" : ""}`} id="br-indexnow">
        <div className="two-col-sm">
          <div className="card">
            <div className="card-head">
              <div className="card-title">IndexNow · status</div>
              <span className="count" style={{"fontSize":"10.5px","color":"var(--accent-ink)","background":"var(--accent-soft)","padding":"2px 7px","borderRadius":"10px","fontWeight":"600"}}>Bing + Yandex · Active</span>
            </div>
            <div className="config-list" style={{"border":"none","borderRadius":"0"}}>
              <div className="config-row"><div className="config-row-main"><div className="config-row-title">Auto-submit la publish/update</div><div className="config-row-desc">Shopify webhook &rarr; IndexNow API</div></div><label className="switch"><input type="checkbox" defaultChecked /><span className="switch-track"></span></label></div>
              <div className="config-row"><div className="config-row-main"><div className="config-row-title">Auto-submit la schimbare schema</div><div className="config-row-desc">Re-ping cand JSON-LD e actualizat</div></div><label className="switch"><input type="checkbox" defaultChecked /><span className="switch-track"></span></label></div>
              <div className="config-row"><div className="config-row-main"><div className="config-row-title">Batching submissions</div><div className="config-row-desc">Max 10,000 URLs per request</div></div><div style={{"fontFamily":"var(--mono)","fontSize":"12px","color":"var(--ink-1)"}}>Active</div></div>
            </div>
          </div>

          <div className="card">
            <div className="card-head"><div className="card-title">Submissions · 30 zile</div></div>
            <div style={{"padding":"14px 16px"}}>
              <svg viewBox="0 0 320 120" style={{"width":"100%"}}>
                <line stroke="#e5e5e5" strokeWidth="1" strokeDasharray="2 3" x1="0" y1="30" x2="320" y2="30"/>
                <line stroke="#e5e5e5" strokeWidth="1" strokeDasharray="2 3" x1="0" y1="60" x2="320" y2="60"/>
                <line stroke="#e5e5e5" strokeWidth="1" strokeDasharray="2 3" x1="0" y1="90" x2="320" y2="90"/>
                <polyline points="0,80 11,75 22,68 33,72 44,58 55,52 66,48 77,54 88,42 99,38 110,32 121,28 132,34 143,22 154,18 165,24 176,14 187,20 198,16 209,10 220,18 231,22 242,14 253,8 264,12 275,6 286,14 297,10 308,18 320,12" fill="none" stroke="#16a34a" strokeWidth="2"/>
                <text x="0" y="116" fill="#737373" fontSize="9" fontFamily="Geist Mono">-30d</text>
                <text x="160" y="116" textAnchor="middle" fill="#737373" fontSize="9" fontFamily="Geist Mono">-15d</text>
                <text x="320" y="116" textAnchor="end" fill="#737373" fontSize="9" fontFamily="Geist Mono">azi</text>
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* PANEL: AGENTIC */}
      <div className={`subnav-panel ${activeTab === "br-agentic" ? "active" : ""}`} id="br-agentic">
        <div className="alert-banner info">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
          <span><b>Agentic Commerce</b> — permite AI agents (ChatGPT, Claude, etc.) sa descopere, recomande si cumpere produsele {brandName} prin MCP (Model Context Protocol) server dedicat.</span>
        </div>

        <div className="two-col-sm">
          <div className="card">
            <div className="card-head">
              <div className="card-title">MCP Server · mcp.{domain}</div>
              <span className="count" style={{"fontSize":"10.5px","color":"var(--accent-ink)","background":"var(--accent-soft)","padding":"2px 7px","borderRadius":"10px","fontWeight":"600"}}>Config</span>
            </div>
            <div style={{"padding":"4px 0"}}>
              <div className="data-row"><div className="data-row-main"><div className="data-row-title">search_products(query, filters)</div><div className="data-row-meta mono">Cautare in catalog</div></div><span className="mod-status live"><span className="dot"></span>Active</span></div>
              <div className="data-row"><div className="data-row-main"><div className="data-row-title">get_product_details(sku)</div><div className="data-row-meta mono">Detalii complet produs + stock</div></div><span className="mod-status live"><span className="dot"></span>Active</span></div>
              <div className="data-row"><div className="data-row-main"><div className="data-row-title">check_availability(sku, qty)</div><div className="data-row-meta mono">Stock real-time</div></div><span className="mod-status live"><span className="dot"></span>Active</span></div>
              <div className="data-row"><div className="data-row-main"><div className="data-row-title">get_shipping_estimate(address, sku)</div><div className="data-row-meta mono">Cost livrare + timp</div></div><span className="mod-status live"><span className="dot"></span>Active</span></div>
              <div className="data-row"><div className="data-row-main"><div className="data-row-title">create_cart_link(items)</div><div className="data-row-meta mono">Genereaza URL carucior pre-populat</div></div><span className="mod-status live"><span className="dot"></span>Active</span></div>
              <div className="data-row"><div className="data-row-main"><div className="data-row-title">compare_products(sku_list)</div><div className="data-row-meta mono">Comparare side-by-side</div></div><span className="mod-status dev"><span className="dot"></span>Beta</span></div>
            </div>
          </div>

          <div className="card">
            <div className="card-head"><div className="card-title">Conversii via AI agents · 30 zile</div></div>
            <div style={{"padding":"14px 16px"}}>
              <div style={{"fontSize":"12px","color":"var(--ink-2)","lineHeight":"1.6"}}>
                Datele de conversie via MCP necesita integrare cu analytics. Configureaza tracking-ul pe pagina de setari.
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
