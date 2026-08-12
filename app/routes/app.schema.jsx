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
  if (!storeId) return { storeId: null, validations: [], stats: {}, entityAudit: null, zeroClickPaa: [] };

  const [
    validations,
    totalValid,
    totalInvalid,
    totalChecked,
    entityAudit,
    zeroClickPaa,
    schemaByType,
  ] = await Promise.all([
    prisma.seoSchemaValidation.findMany({
      where: { storeId },
      orderBy: [{ isValid: "asc" }, { lastCheckedAt: "desc" }],
      take: 20,
    }).catch(() => []),
    prisma.seoSchemaValidation.count({ where: { storeId, isValid: true } }).catch(() => 0),
    prisma.seoSchemaValidation.count({ where: { storeId, isValid: false } }).catch(() => 0),
    prisma.seoSchemaValidation.count({ where: { storeId } }).catch(() => 0),
    prisma.seoEntityAudit.findUnique({ where: { storeId } }).catch(() => null),
    prisma.seoZeroClickOpt.findMany({
      where: { storeId, serpFeature: "people_also_ask" },
      orderBy: { createdAt: "desc" },
      take: 10,
    }).catch(() => []),
    prisma.seoSchemaValidation.groupBy({
      by: ["schemaType"],
      where: { storeId },
      _count: { id: true },
    }).catch(() => []),
  ]);

  const pctCoverage = totalChecked > 0 ? Math.round((totalValid / totalChecked) * 100) : 0;

  let entities = [];
  let entityIssues = [];
  let consistencyScore = 0;
  try {
    if (entityAudit) {
      entities = typeof entityAudit.entities === "string" ? JSON.parse(entityAudit.entities) : (entityAudit.entities || []);
      entityIssues = typeof entityAudit.issues === "string" ? JSON.parse(entityAudit.issues) : (entityAudit.issues || []);
      consistencyScore = entityAudit.consistencyScore || 0;
    }
  } catch {}

  // Build type distribution
  const typeMap = {};
  if (Array.isArray(schemaByType)) {
    schemaByType.forEach(g => { typeMap[g.schemaType] = g._count?.id || 0; });
  }

  // Parse errors from invalid validations
  const invalidRows = validations.filter(v => !v.isValid);
  const errorRows = [];
  invalidRows.forEach(v => {
    let errs = [];
    try { errs = typeof v.errors === "string" ? JSON.parse(v.errors) : (v.errors || []); } catch {}
    errs.forEach(e => {
      errorRows.push({ url: v.pageUrl, schemaType: v.schemaType, message: e.message || e.path || "Unknown error", severity: e.severity || "error", id: v.id });
    });
  });

  return {
    storeId,
    validations,
    stats: {
      valid: totalValid,
      invalid: totalInvalid,
      total: totalChecked,
      coverage: pctCoverage,
    },
    typeMap,
    errorRows: errorRows.slice(0, 15),
    entityAudit: entityAudit ? { entities, issues: entityIssues, consistencyScore, organizationJson: entityAudit.organizationJson } : null,
    zeroClickPaa,
  };
};

export default function SchemaPage() {
  const data = useLoaderData() || {};
  const {
    validations = [],
    stats = {},
    typeMap = {},
    errorRows = [],
    entityAudit = null,
    zeroClickPaa = [],
  } = data;

  const [activeTab, setActiveTab] = useState("sch-types");
  const [tblPage, setTblPage] = useState(1);
  const [tblPerPage, setTblPerPage] = useState(25);

  const entities = entityAudit?.entities || [];
  const entityIssues = entityAudit?.issues || [];

  const SCHEMA_TYPES = [
    { key: "Product", icon: "cube", color: "var(--accent-soft)", iconColor: "var(--accent-ink)", desc: "Name, description, image, offers, aggregateRating, brand, SKU." },
    { key: "Article", icon: "file", color: "var(--info-soft)", iconColor: "var(--info)", desc: "Headline, author, datePublished, dateModified, image, articleBody." },
    { key: "FAQPage", icon: "question", color: "var(--warn-soft)", iconColor: "var(--warn)", desc: "mainEntity cu Question + acceptedAnswer. Generat din PAA." },
    { key: "BreadcrumbList", icon: "list", color: "var(--purple-soft)", iconColor: "var(--purple)", desc: "itemListElement cu pozitie + nume + URL." },
    { key: "Organization", icon: "building", color: "var(--accent-soft)", iconColor: "var(--accent-ink)", desc: "Nume, logo, URL, sameAs, contactPoint." },
    { key: "WebSite", icon: "search", color: "var(--info-soft)", iconColor: "var(--info)", desc: "SearchAction pentru search box in SERP." },
  ];

  const severityPill = (sev) => {
    if (sev === "error" || sev === "critical") return "p0";
    if (sev === "warning") return "p1";
    return "p2";
  };

  return (
    <div className="page active" id="page-schema">

      <div className="page-head">
        <div>
          <div className="greet-kicker">
            <span className="live-dot"></span>
            <span>{stats.total > 0 ? `Schema validata pe ${fmt(stats.total)} pagini \u00b7 ${Object.keys(typeMap).length} tipuri in uz` : "Nicio validare inca"}</span>
          </div>
          <h1 className="page-title">Schema &amp; <em>Structured Data</em></h1>
          <p className="page-sub">JSON-LD, validare Rich Results, entity linking si extragere FAQ din &bdquo;People Also Ask&rdquo;.</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost">Valideaza tot</button>
          <button className="btn btn-primary">Regenereaza</button>
        </div>
      </div>

      <div className="metric-grid" style={{"gridTemplateColumns":"repeat(5,1fr)"}}>
        <div className="metric"><div className="metric-label">Pagini cu schema</div><div className="metric-value">{fmt(stats.valid)}</div><div className="metric-foot"><span className="delta up">{stats.total > 0 ? `din ${fmt(stats.total)} verificate` : "0 verificate"}</span></div></div>
        <div className="metric"><div className="metric-label">Coverage</div><div className="metric-value">{stats.coverage != null ? stats.coverage : "\u2014"}<span className="unit">{stats.coverage != null ? "%" : ""}</span></div><div className="metric-foot"><span className="kpi-sub">{fmt(stats.total)} total</span></div></div>
        <div className="metric"><div className="metric-label">Rich Results eligibil</div><div className="metric-value">{fmt(stats.valid)}</div><div className="metric-foot"><span className="delta up">eligible</span></div></div>
        <div className="metric"><div className="metric-label">Erori validare</div><div className="metric-value">{fmt(stats.invalid)}</div><div className="metric-foot"><span className="kpi-sub">{stats.total > 0 ? `~${((stats.invalid / stats.total) * 100).toFixed(1)}% din total` : "\u2014"}</span></div></div>
        <div className="metric"><div className="metric-label">Entitati mapate</div><div className="metric-value">{entities.length > 0 ? fmt(entities.length) : "\u2014"}</div><div className="metric-foot"><span className="kpi-sub">{entityAudit ? `consistency: ${entityAudit.consistencyScore}/100` : "nicio analiza"}</span></div></div>
      </div>

      <div className="subnav">
        <button className={`subnav-tab ${activeTab === "sch-types" ? "active" : ""}`} onClick={() => setActiveTab("sch-types")} data-subtab="sch-types">Tipuri Schema</button>
        <button className={`subnav-tab ${activeTab === "sch-generator" ? "active" : ""}`} onClick={() => setActiveTab("sch-generator")} data-subtab="sch-generator">Generator JSON-LD</button>
        <button className={`subnav-tab ${activeTab === "sch-validator" ? "active" : ""}`} onClick={() => setActiveTab("sch-validator")} data-subtab="sch-validator">Validator <span className="sn-pill">{fmt(stats.invalid)}</span></button>
        <button className={`subnav-tab ${activeTab === "sch-faq" ? "active" : ""}`} onClick={() => setActiveTab("sch-faq")} data-subtab="sch-faq">FAQ / PAA</button>
        <button className={`subnav-tab ${activeTab === "sch-entity" ? "active" : ""}`} onClick={() => setActiveTab("sch-entity")} data-subtab="sch-entity">Entity SEO</button>
      </div>

      {/* PANEL: TYPES */}
      <div className={`subnav-panel ${activeTab === "sch-types" ? "active" : ""}`} id="sch-types">
        <div className="three-col" style={{"gridTemplateColumns":"repeat(4,1fr)"}}>
          {SCHEMA_TYPES.map((st) => {
            const count = typeMap[st.key] || 0;
            return (
              <div className="module-card" key={st.key}>
                <div className="module-card-head">
                  <div className="module-card-left">
                    <div className="module-card-icon" style={{"background":st.color,"color":st.iconColor}}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
                    </div>
                    <div className="module-card-body"><div className="module-card-title">{st.key}</div><div className="module-card-num">type &middot; {fmt(count)} pages</div></div>
                  </div>
                </div>
                <div className="module-card-desc">{st.desc}</div>
                <div className="module-card-foot"><div className="module-card-stat"><span>Pagini: <b>{fmt(count)}</b></span></div><button className="row-action">Config</button></div>
              </div>
            );
          })}

          {/* Show any additional types found in data but not in the predefined list */}
          {Object.entries(typeMap).filter(([key]) => !SCHEMA_TYPES.find(s => s.key === key)).map(([key, count]) => (
            <div className="module-card" key={key}>
              <div className="module-card-head">
                <div className="module-card-left">
                  <div className="module-card-icon" style={{"background":"var(--surface-2)","color":"var(--ink-3)"}}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M3 9h18"/></svg>
                  </div>
                  <div className="module-card-body"><div className="module-card-title">{key}</div><div className="module-card-num">type &middot; {fmt(count)} pages</div></div>
                </div>
              </div>
              <div className="module-card-desc">Schema type detectat automat.</div>
              <div className="module-card-foot"><div className="module-card-stat"><span>Pagini: <b>{fmt(count)}</b></span></div><button className="row-action">Config</button></div>
            </div>
          ))}
        </div>
      </div>

      {/* PANEL: GENERATOR */}
      <div className={`subnav-panel ${activeTab === "sch-generator" ? "active" : ""}`} id="sch-generator">
        <div className="two-col-sm">
          <div className="card">
            <div className="card-head">
              <div className="card-title">Product JSON-LD &mdash; exemplu</div>
              <button className="card-action">Source URL</button>
            </div>
            {validations.length > 0 ? (
              <div style={{"padding":"14px 16px"}}>
                <div style={{"fontSize":"11px","color":"var(--ink-3)","marginBottom":"8px"}}>Ultima pagina validata:</div>
                <div style={{"fontFamily":"var(--mono)","fontSize":"12px","color":"var(--ink-1)","wordBreak":"break-all"}}>{validations[0]?.pageUrl || "\u2014"}</div>
                <div style={{"marginTop":"12px","display":"flex","gap":"6px","alignItems":"center"}}>
                  <span className={`mod-status ${validations[0]?.isValid ? "live" : "err"}`}><span className="dot"></span>{validations[0]?.isValid ? "Valid" : "Invalid"}</span>
                  <span style={{"fontSize":"11px","color":"var(--ink-3)"}}>{validations[0]?.schemaType}</span>
                </div>
              </div>
            ) : (
              <div style={{"padding":"30px","textAlign":"center","color":"var(--ink-3)","fontSize":"13px"}}>Nicio validare inca. Ruleaza validatorul pentru a genera JSON-LD preview.</div>
            )}
          </div>

          <div>
            <div className="card">
              <div className="card-head"><div className="card-title">Validare status</div></div>
              <div style={{"padding":"4px 0"}}>
                <div className="data-row"><div className="data-row-main"><div className="data-row-title" style={{"display":"flex","alignItems":"center","gap":"8px"}}><span style={{"color": stats.valid > 0 ? "var(--accent-ink)" : "var(--ink-3)"}}>&#10003;</span>Pagini valide</div><div className="data-row-meta">{fmt(stats.valid)} din {fmt(stats.total)}</div></div></div>
                <div className="data-row"><div className="data-row-main"><div className="data-row-title" style={{"display":"flex","alignItems":"center","gap":"8px"}}><span style={{"color": stats.invalid > 0 ? "var(--danger)" : "var(--accent-ink)"}}>&#10003;</span>Pagini cu erori</div><div className="data-row-meta">{fmt(stats.invalid)}</div></div></div>
                <div className="data-row"><div className="data-row-main"><div className="data-row-title" style={{"display":"flex","alignItems":"center","gap":"8px"}}><span style={{"color":"var(--accent-ink)"}}>&#10003;</span>Coverage</div><div className="data-row-meta">{stats.coverage != null ? `${stats.coverage}%` : "\u2014"}</div></div></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* PANEL: VALIDATOR */}
      <div className={`subnav-panel ${activeTab === "sch-validator" ? "active" : ""}`} id="sch-validator">
        {errorRows.length > 0 ? (
          <>
            <div className="alert-banner warn">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><line x1="12" y1="9" x2="12" y2="13"/></svg>
              <span><b>{fmt(stats.invalid)} erori detectate</b> la ultima rulare.</span>
            </div>
            <div className="data-list">
              {errorRows.map((err, i) => (
                <div className="data-row" style={{"gridTemplateColumns":"30px 1fr auto auto"}} key={i}>
                  <span className={`q-card-prio ${severityPill(err.severity)}`}>{err.severity === "error" ? "P0" : err.severity === "warning" ? "P1" : "P2"}</span>
                  <div className="data-row-main"><div className="data-row-title">{err.message}</div><div className="data-row-meta mono">{err.url}</div></div>
                  <span className="tl-module">{err.schemaType}</span>
                  <button className="row-action">Fix</button>
                </div>
              ))}
            </div>
          </>
        ) : stats.total > 0 ? (
          <div className="alert-banner info" style={{"background":"var(--accent-soft)","borderColor":"var(--accent)"}}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
            <span><b>0 erori!</b> Toate cele {fmt(stats.total)} pagini validate sunt OK.</span>
          </div>
        ) : (
          <div className="card" style={{"textAlign":"center","padding":"40px","color":"var(--ink-3)"}}>
            <p>Nicio validare rulata inca. Foloseste butonul &bdquo;Valideaza tot&rdquo; pentru a incepe.</p>
          </div>
        )}

        {/* Show recent validations table */}
        {validations.length > 0 && (
          <div className="card" style={{"marginTop":"14px"}}>
            <div className="card-head"><div className="card-title">Validari recente <span className="count">{fmt(validations.length)}</span></div></div>
            <div className="table-wrap" style={{"border":"none","borderRadius":"0"}}>
              <table className="tbl">
                <thead>
                  <tr><th>URL</th><th>Tip</th><th className="center">Status</th><th className="right">Ultima verificare</th></tr>
                </thead>
                <tbody>
                  {validations.slice((tblPage-1)*tblPerPage, tblPage*tblPerPage).map((v) => (
                    <tr key={v.id}>
                      <td className="mono" style={{"maxWidth":"300px","overflow":"hidden","textOverflow":"ellipsis","whiteSpace":"nowrap"}}>{v.pageUrl}</td>
                      <td><span className="tl-module">{v.schemaType}</span></td>
                      <td className="center"><span className={`mod-status ${v.isValid ? "live" : "err"}`}><span className="dot"></span>{v.isValid ? "Valid" : "Invalid"}</span></td>
                      <td className="right mono" style={{"fontSize":"11px","color":"var(--ink-3)"}}>{v.lastCheckedAt ? new Date(v.lastCheckedAt).toLocaleDateString("ro-RO") : "\u2014"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {validations.length > tblPerPage && (
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
                  <span>{(tblPage-1)*tblPerPage+1}–{Math.min(tblPage*tblPerPage, validations.length)} din {validations.length}</span>
                  <button style={{padding:"4px 8px",border:"1px solid var(--line)",borderRadius:"6px",background:"var(--surface)",cursor:"pointer"}} disabled={tblPage <= 1} onClick={() => setTblPage(p => p-1)}>←</button>
                  <button style={{padding:"4px 8px",border:"1px solid var(--line)",borderRadius:"6px",background:"var(--surface)",cursor:"pointer"}} disabled={tblPage >= Math.ceil(validations.length/tblPerPage)} onClick={() => setTblPage(p => p+1)}>→</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* PANEL: FAQ */}
      <div className={`subnav-panel ${activeTab === "sch-faq" ? "active" : ""}`} id="sch-faq">
        <div className="two-col-sm">
          <div className="card">
            <div className="card-head">
              <div className="card-title">Extras din &bdquo;People Also Ask&rdquo;</div>
              <span className="count" style={{"fontSize":"10.5px","color":"var(--info)","background":"var(--info-soft)","padding":"2px 7px","borderRadius":"10px","fontWeight":"600"}}>Zero-Click PAA</span>
            </div>
            {zeroClickPaa.length > 0 ? (
              <div style={{"padding":"4px 0"}}>
                {zeroClickPaa.map((p, i) => (
                  <div className="data-row" style={{"gridTemplateColumns":"1fr auto"}} key={i}>
                    <div className="data-row-main">
                      <div className="data-row-title">{p.keyword}</div>
                      <div className="data-row-meta">{p.recommendedFormat ? `Format: ${p.recommendedFormat}` : ""} {p.status ? `\u00b7 ${p.status}` : ""}</div>
                    </div>
                    <button className="row-action">Raspunde</button>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{"padding":"30px","textAlign":"center","color":"var(--ink-3)","fontSize":"13px"}}>Nicio intrebare PAA extrase inca. Ruleaza Zero-Click scan.</div>
            )}
          </div>

          <div className="card">
            <div className="card-head">
              <div className="card-title">FAQ schema coverage</div>
              <span className="count" style={{"fontSize":"10.5px","color":"var(--accent-ink)","background":"var(--accent-soft)","padding":"2px 7px","borderRadius":"10px","fontWeight":"600"}}>{fmt(typeMap["FAQPage"] || 0)} pagini</span>
            </div>
            <div style={{"padding":"14px 16px"}}>
              <div style={{"display":"grid","gridTemplateColumns":"1fr 1fr","gap":"10px","marginBottom":"14px"}}>
                <div style={{"textAlign":"center","padding":"10px","background":"var(--accent-soft)","borderRadius":"6px"}}>
                  <div style={{"fontSize":"20px","fontWeight":"600","color":"var(--accent-ink)","fontVariantNumeric":"tabular-nums"}}>{fmt(typeMap["FAQPage"] || 0)}</div>
                  <div style={{"fontSize":"11px","color":"var(--accent-ink)","marginTop":"2px"}}>Cu FAQ schema</div>
                </div>
                <div style={{"textAlign":"center","padding":"10px","background":"var(--info-soft)","borderRadius":"6px"}}>
                  <div style={{"fontSize":"20px","fontWeight":"600","color":"var(--info)","fontVariantNumeric":"tabular-nums"}}>{fmt(zeroClickPaa.length)}</div>
                  <div style={{"fontSize":"11px","color":"var(--info)","marginTop":"2px"}}>PAA oportunitati</div>
                </div>
              </div>
              {zeroClickPaa.length === 0 && (typeMap["FAQPage"] || 0) === 0 && (
                <div style={{"textAlign":"center","color":"var(--ink-3)","fontSize":"13px"}}>No FAQ data yet</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* PANEL: ENTITY */}
      <div className={`subnav-panel ${activeTab === "sch-entity" ? "active" : ""}`} id="sch-entity">
        <div className="two-col-sm">
          <div className="card">
            <div className="card-head">
              <div className="card-title">Entity audit</div>
              {entityAudit && <span className="count" style={{"fontSize":"10.5px","color":"var(--accent-ink)","background":"var(--accent-soft)","padding":"2px 7px","borderRadius":"10px","fontWeight":"600"}}>Score: {entityAudit.consistencyScore}/100</span>}
            </div>
            {entities.length > 0 ? (
              <div style={{"padding":"4px 0"}}>
                {entities.slice(0, 10).map((e, i) => (
                  <div className="data-row" style={{"gridTemplateColumns":"1fr auto"}} key={i}>
                    <div className="data-row-main">
                      <div className="data-row-title">{e.name || `Entity ${i + 1}`}</div>
                      <div className="data-row-meta">{e.type || "\u2014"} &middot; {e.frequency ? `${e.frequency} mentiuni` : "\u2014"} {Array.isArray(e.sources) ? `\u00b7 ${e.sources.join(", ")}` : ""}</div>
                    </div>
                    <span className="mod-status live"><span className="dot"></span>OK</span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{"padding":"30px","textAlign":"center","color":"var(--ink-3)","fontSize":"13px"}}>Nicio entitate analizata inca. Ruleaza Entity SEO audit.</div>
            )}
          </div>

          <div className="card">
            <div className="card-head"><div className="card-title">Entity issues</div></div>
            {entityIssues.length > 0 ? (
              <div style={{"padding":"4px 0"}}>
                {entityIssues.slice(0, 8).map((iss, i) => (
                  <div className="data-row" key={i}>
                    <div className="data-row-main">
                      <div className="data-row-title">{iss.entity || "Unknown"}: {iss.issue || "Issue"}</div>
                      <div className="data-row-meta">{iss.recommendation || "\u2014"}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : entityAudit ? (
              <div style={{"padding":"30px","textAlign":"center","color":"var(--accent-ink)","fontSize":"13px"}}>Nicio problema detectata. Toate entitatile sunt consistente.</div>
            ) : (
              <div style={{"padding":"30px","textAlign":"center","color":"var(--ink-3)","fontSize":"13px"}}>Ruleaza Entity SEO audit pentru a vedea probleme.</div>
            )}
          </div>
        </div>
      </div>

    </div>



  );
}
