// app/routes/app._index.jsx — Kimono SEO Dashboard
import { useLoaderData, Link } from "react-router";
import { useState } from "react";
import { requireAuth } from "../lib/auth/index.server.js";
import prisma from "../db.server.js";

export const loader = async ({ request }) => {
  const { user, connection, storeId } = await requireAuth(request);
  const shopDomain = connection?.shopDomain ?? null;

  const userOut = {
    name:             user.name,
    email:            user.email,
    plan:             user.plan ?? "TRIAL",
    role:             user.role,
    trialCreditUsed:  Number(user.trialCreditUsed ?? 0),
  };

  const emptySetup = { storeConnected: !!storeId, gscConnected: false, ga4Connected: false };

  if (!storeId) {
    return { user: userOut, shopDomain, stats: null, activeJob: null, setup: emptySetup, usageCostUsd: 0, usageByFeature: [] };
  }

  const [
    productsTotal, productsAudited, productsTagged,
    avgScoreAgg, scoreGood, scoreWarn, scoreCrit,
    keywordsTotal, articlesTotal, redirectsTotal,
    proposalsApplied, pSeoPublished,
    imagesWithoutAlt, entityAudit, schemaInvalid,
    zeroClickOpps, lowConfidence,
    eeatLatest, broken404,
    llmsTxt, activeJob, seoSettings,
    usageAgg, usageByFeature,
  ] = await Promise.all([
    prisma.seoProduct.count({ where: { storeId } }).catch(() => 0),
    prisma.seoAudit.count({ where: { storeId } }).catch(() => 0),
    prisma.seoProduct.count({ where: { storeId, aiTag: { not: null } } }).catch(() => 0),
    prisma.seoAudit.aggregate({ where: { storeId }, _avg: { score: true } }).catch(() => ({ _avg: { score: 0 } })),
    prisma.seoAudit.count({ where: { storeId, score: { gte: 80 } } }).catch(() => 0),
    prisma.seoAudit.count({ where: { storeId, score: { gte: 50, lt: 80 } } }).catch(() => 0),
    prisma.seoAudit.count({ where: { storeId, score: { lt: 50 } } }).catch(() => 0),
    prisma.seoKeyword.count({ where: { storeId } }).catch(() => 0),
    prisma.blogArticle.count({ where: { storeId } }).catch(() => 0),
    prisma.redirectSuggestion.count({ where: { storeId } }).catch(() => 0),
    prisma.seoTaxonomyProposal.count({ where: { storeId, status: "APPLIED" } }).catch(() => 0),
    prisma.pSeoRow.count({ where: { storeId, status: "PUBLISHED" } }).catch(() => 0),
    prisma.seoImageAlt.count({ where: { storeId, status: { in: ["pending", "error"] } } }).catch(() => 0),
    prisma.seoEntityAudit.findUnique({ where: { storeId }, select: { issues: true } }).catch(() => null),
    prisma.seoSchemaValidation.count({ where: { storeId, isValid: false } }).catch(() => 0),
    prisma.seoZeroClickOpt.count({ where: { storeId, status: { in: ["pending", "approved"] } } }).catch(() => 0),
    prisma.seoAnswerConfidence.count({ where: { storeId, overallScore: { lt: 60 } } }).catch(() => 0),
    prisma.seoEEATAudit.findFirst({ where: { storeId }, orderBy: { runAt: "desc" }, select: { overallScore: true } }).catch(() => null),
    prisma.seo404Detection.count({ where: { storeId, status: "open" } }).catch(() => 0),
    prisma.llmsTxt.findUnique({ where: { storeId }, select: { score: true, publishedAt: true } }).catch(() => null),
    prisma.seoJob.findFirst({
      where: { storeId, status: { in: ["QUEUED", "RUNNING"] } },
      orderBy: { queuedAt: "desc" },
      select: { id: true, type: true, status: true, progressPct: true, statusMessage: true },
    }).catch(() => null),
    prisma.seoSetting.findMany({ where: { storeId }, select: { key: true, value: true } }).catch(() => []),
    prisma.usageLog.aggregate({ where: { userId: user.id }, _sum: { costUsd: true } }).catch(() => ({ _sum: { costUsd: 0 } })),
    prisma.usageLog.groupBy({ by: ["feature"], where: { userId: user.id }, _sum: { costUsd: true }, orderBy: { _sum: { costUsd: "desc" } }, take: 6 }).catch(() => []),
  ]);

  const settings = Object.fromEntries(seoSettings.map(s => [s.key, s.value]));

  return {
    user: userOut,
    shopDomain,
    stats: {
      productsTotal,
      productsAudited,
      productsTagged,
      avgScore:       Math.round(avgScoreAgg._avg?.score ?? 0),
      scoreDistrib:   { good: scoreGood, warning: scoreWarn, critical: scoreCrit },
      keywordsTotal,
      articlesTotal,
      redirectsTotal,
      proposalsApplied,
      pSeoPublished,
      imagesWithoutAlt,
      entityIssues:   Array.isArray(entityAudit?.issues) ? entityAudit.issues.length : 0,
      schemaInvalid,
      zeroClickOpps,
      lowConfidence,
      eeatScore:      eeatLatest?.overallScore ?? 0,
      broken404,
      llmsTxtScore:   llmsTxt?.score ?? 0,
      llmsTxtActive:  !!llmsTxt,
    },
    activeJob,
    setup: {
      storeConnected: true,
      gscConnected:   !!settings["seo_gsc_refresh_token"],
      ga4Connected:   !!settings["ga4_property_id"],
    },
    usageCostUsd:    Number(usageAgg._sum?.costUsd ?? user.trialCreditUsed ?? 0),
    usageByFeature:  usageByFeature.map(r => ({ feature: r.feature, cost: Number(r._sum?.costUsd ?? 0) })),
  };
};

/* ── helpers ───────────────────────────────────────────── */

function fmt(n) {
  if (n == null) return "\u2014";
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "K";
  return n.toLocaleString();
}

function pct(part, total) {
  if (!total) return "0%";
  return Math.round((part / total) * 100) + "%";
}

function buildActionQueue(stats) {
  const items = [];
  if (stats.broken404 > 0)
    items.push({ tag: "critical", label: "Critic", text: `${stats.broken404} pagini 404 detectate`, module: "404 Detection" });
  if (stats.imagesWithoutAlt > 0)
    items.push({ tag: "warn", label: "Review", text: `${stats.imagesWithoutAlt} imagini fara alt text`, module: "Image Optimizer" });
  if (stats.lowConfidence > 0)
    items.push({ tag: "warn", label: "Review", text: `${stats.lowConfidence} articole cu confidence scazut`, module: "Blog Generator" });
  if (stats.schemaInvalid > 0)
    items.push({ tag: "warn", label: "Warning", text: `${stats.schemaInvalid} validari schema invalide`, module: "Schema Validator" });
  if (stats.zeroClickOpps > 0)
    items.push({ tag: "info", label: "Sugestie", text: `${stats.zeroClickOpps} oportunitati zero-click`, module: "Zero-Click Optimizer" });
  return items;
}

/* ── component ─────────────────────────────────────────── */

export default function Dashboard() {
  const data = useLoaderData();
  const userName = data?.user?.name?.split(" ")[0] || "User";
  const s = data.stats;
  const setup = data.setup;

  /* No store connected → setup prompt */
  if (!s) {
    return (
      <div className="page active" id="page-overview">
        <div className="page-head">
          <div>
            <h1 className="page-title">Buna, <em>{userName}</em></h1>
            <p className="page-sub">Conecteaza magazinul pentru a incepe.</p>
          </div>
        </div>
        <div className="card" style={{ textAlign: "center", padding: "3rem" }}>
          <h2>Setup necesar</h2>
          <p style={{ margin: "1rem 0", opacity: 0.7 }}>
            Nu ai niciun magazin conectat. Mergi la Settings pentru a conecta Shopify, GSC si GA4.
          </p>
          <Link to="/app/settings" className="btn btn-primary">Configureaza acum</Link>
        </div>
        <footer className="footer-note">
          <div>Kimono SEO &middot; Kimono Group</div>
          <div className="footer-links">
            <Link to="/app/knowledge">Knowledge</Link>
            <a>Changelog</a>
            <a>Status</a>
            <a>Help</a>
          </div>
        </footer>
      </div>
    );
  }

  const actionItems = buildActionQueue(s);
  const connList = [
    setup.storeConnected && "Store",
    setup.gscConnected && "GSC",
    setup.ga4Connected && "GA4",
  ].filter(Boolean);
  const connCount = connList.length;
  const connTotal = 3;

  return (
    <div className="page active" id="page-overview">

      <div className="page-head">
        <div>
          <div className="greet-kicker">
            <span className="live-dot"></span>
            <span>
              {data.activeJob
                ? `Job activ: ${data.activeJob.type} — ${data.activeJob.progressPct ?? 0}%`
                : "Idle · niciun job activ"}
            </span>
          </div>
          <h1 className="page-title">Buna, <em>{userName}</em></h1>
          <p className="page-sub">
            {data.shopDomain
              ? `Dashboard pentru ${data.shopDomain}`
              : "Sistemul a lucrat peste noapte. Iata ce s-a intamplat si ce asteapta decizia ta."}
          </p>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 12a9 9 0 1 1-6.2-8.6"/><path d="M21 3v5h-5"/></svg>
            Sync
          </button>
          <button className="btn btn-primary">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            Run audit
          </button>
        </div>
      </div>

      {/* 6 KPI cards */}
      <div className="snapshot">
        <div className="kpi">
          <div className="kpi-label">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
            Produse
          </div>
          <div className="kpi-value">{fmt(s.productsTotal)}</div>
          <div className="kpi-foot"><span className="kpi-sub">sincronizate</span></div>
        </div>
        <div className="kpi">
          <div className="kpi-label">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg>
            Auditate
          </div>
          <div className="kpi-value">{fmt(s.productsAudited)}</div>
          <div className="kpi-foot"><span className="delta up">{pct(s.productsAudited, s.productsTotal)}</span><span className="kpi-sub">din total</span></div>
        </div>
        <div className="kpi">
          <div className="kpi-label">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
            Scor mediu
          </div>
          <div className="kpi-value">{s.avgScore}<span className="unit">/100</span></div>
          <div className="kpi-foot">
            <span className="delta ok">{s.scoreDistrib.good} bune</span>
            <span className="kpi-sub">{s.scoreDistrib.warning} warn &middot; {s.scoreDistrib.critical} crit</span>
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            Keywords
          </div>
          <div className="kpi-value">{fmt(s.keywordsTotal)}</div>
          <div className="kpi-foot"><span className="kpi-sub">tracked</span></div>
        </div>
        <div className="kpi">
          <div className="kpi-label">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
            Articole
          </div>
          <div className="kpi-value">{fmt(s.articlesTotal)}</div>
          <div className="kpi-foot"><span className="kpi-sub">generate</span></div>
        </div>
        <div className="kpi">
          <div className="kpi-label">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
            Schema erori
          </div>
          <div className="kpi-value">{fmt(s.schemaInvalid)}</div>
          <div className="kpi-foot">
            <span className={`delta ${s.schemaInvalid === 0 ? "up" : "down"}`}>
              {s.schemaInvalid === 0 ? "Valid" : "invalide"}
            </span>
          </div>
        </div>
      </div>

      {/* ACTION QUEUE hero card */}
      <div className="card queue-card">
        <div className="card-head">
          <div className="card-title">Trebuie decizia ta <span className="count">{actionItems.length}</span></div>
          <Link to="/app/queue" className="card-action">Vezi toate <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 12h14M12 5l7 7-7 7"/></svg></Link>
        </div>
        <div className="queue">
          {actionItems.length === 0 && (
            <div className="q-item" style={{ opacity: 0.6, textAlign: "center", padding: "2rem" }}>
              Nicio actiune in asteptare. Totul arata bine!
            </div>
          )}
          {actionItems.map((item, i) => (
            <div className="q-item" key={i}>
              <div className="q-left">
                <div className="q-head">
                  <span className={`q-tag ${item.tag}`}>{item.label}</span>
                  <span className="q-module">{item.module}</span>
                </div>
                <div className="q-text">{item.text}</div>
              </div>
              <div className="q-actions">
                <button className="q-btn ghost">Detalii</button>
                <button className="q-btn">Actioneaza</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3 COLUMNS */}
      <div className="main-grid-3">

        {/* Activitate / Stats overview */}
        <div className="card">
          <div className="card-head">
            <div className="card-title">Activitate</div>
            <Link to="/app/activity" className="card-action">Istoric <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 12h14M12 5l7 7-7 7"/></svg></Link>
          </div>
          <div className="activity">
            {data.activeJob && (
              <div className="act-item">
                <div className="act-ico info">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                </div>
                <div className="act-body">
                  <div className="act-title">Job activ: <span className="hl">{data.activeJob.type}</span></div>
                  <div className="act-meta">{data.activeJob.status} &middot; {data.activeJob.progressPct ?? 0}% &middot; {data.activeJob.statusMessage || ""}</div>
                </div>
                <div className="act-time">acum</div>
              </div>
            )}
            <div className="act-item">
              <div className="act-ico ok"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg></div>
              <div className="act-body">
                <div className="act-title">Produse auditate: <span className="hl">{fmt(s.productsAudited)}</span> din {fmt(s.productsTotal)}</div>
                <div className="act-meta">Scor mediu: {s.avgScore}/100 &middot; {s.scoreDistrib.good} bune</div>
              </div>
            </div>
            <div className="act-item">
              <div className="act-ico info"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg></div>
              <div className="act-body">
                <div className="act-title">Articole blog: <span className="hl">{fmt(s.articlesTotal)}</span></div>
                <div className="act-meta">{s.lowConfidence > 0 ? `${s.lowConfidence} cu confidence scazut` : "Toate OK"}</div>
              </div>
            </div>
            <div className="act-item">
              <div className="act-ico info"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg></div>
              <div className="act-body">
                <div className="act-title">Keywords tracked: <span className="hl">{fmt(s.keywordsTotal)}</span></div>
                <div className="act-meta">Redirects: {fmt(s.redirectsTotal)} &middot; Proposals: {fmt(s.proposalsApplied)}</div>
              </div>
            </div>
            <div className="act-item">
              <div className={`act-ico ${s.imagesWithoutAlt > 0 ? "warn" : "ok"}`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/></svg>
              </div>
              <div className="act-body">
                <div className="act-title">Imagini fara alt: <span className="hl">{fmt(s.imagesWithoutAlt)}</span></div>
                <div className="act-meta">Produse tagged AI: {fmt(s.productsTagged)}</div>
              </div>
            </div>
            <div className="act-item">
              <div className="act-ico neutral"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg></div>
              <div className="act-body">
                <div className="act-title">pSEO publicat: <span className="hl">{fmt(s.pSeoPublished)}</span></div>
                <div className="act-meta">Entity issues: {fmt(s.entityIssues)} &middot; Schema invalid: {fmt(s.schemaInvalid)}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Score distribution */}
        <div className="card">
          <div className="card-head">
            <div className="card-title">Distributie scoruri <span className="count">audit</span></div>
            <Link to="/app/audits" className="card-action">Detalii <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 12h14M12 5l7 7-7 7"/></svg></Link>
          </div>
          <div className="ai-list">
            <div className="ai-row">
              <div className="ai-logo" style={{background:"#16a34a"}}>OK</div>
              <div className="ai-info">
                <div className="ai-name">Bun (&ge;80)</div>
                <div className="ai-bar-wrap"><div className="ai-bar"><div className="ai-bar-fill" style={{width: s.productsAudited ? `${Math.round((s.scoreDistrib.good / s.productsAudited) * 100)}%` : "0%", background:"#16a34a"}}></div></div></div>
              </div>
              <div className="ai-val"><span className="n">{fmt(s.scoreDistrib.good)}</span></div>
            </div>
            <div className="ai-row">
              <div className="ai-logo" style={{background:"#d97706"}}>WN</div>
              <div className="ai-info">
                <div className="ai-name">Warning (50–79)</div>
                <div className="ai-bar-wrap"><div className="ai-bar"><div className="ai-bar-fill" style={{width: s.productsAudited ? `${Math.round((s.scoreDistrib.warning / s.productsAudited) * 100)}%` : "0%", background:"#d97706"}}></div></div></div>
              </div>
              <div className="ai-val"><span className="n">{fmt(s.scoreDistrib.warning)}</span></div>
            </div>
            <div className="ai-row">
              <div className="ai-logo" style={{background:"#dc2626"}}>CR</div>
              <div className="ai-info">
                <div className="ai-name">Critic (&lt;50)</div>
                <div className="ai-bar-wrap"><div className="ai-bar"><div className="ai-bar-fill" style={{width: s.productsAudited ? `${Math.round((s.scoreDistrib.critical / s.productsAudited) * 100)}%` : "0%", background:"#dc2626"}}></div></div></div>
              </div>
              <div className="ai-val"><span className="n">{fmt(s.scoreDistrib.critical)}</span></div>
            </div>
          </div>
          <div style={{ padding: "0.75rem 1.25rem", borderTop: "1px solid var(--line, #e5e7eb)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem", opacity: 0.7 }}>
              <span>E-E-A-T: <strong>{s.eeatScore}/100</strong></span>
              <span>LLMs.txt: <strong>{s.llmsTxtActive ? `${s.llmsTxtScore}/100` : "Inactiv"}</strong></span>
            </div>
          </div>
        </div>

        {/* Conexiuni status */}
        <div className="card">
          <div className="card-head">
            <div className="card-title">Conexiuni</div>
            <Link to="/app/settings" className="card-action">Settings →</Link>
          </div>
          <div style={{padding:"16px"}}>
            <div className="data-list">
              <div className="data-row">
                <span>Shopify Store</span>
                <span className={`q-tag ${data.setup?.storeConnected ? "" : "critical"}`}>{data.setup?.storeConnected ? "Connected" : "Not connected"}</span>
              </div>
              <div className="data-row">
                <span>Google Search Console</span>
                <span className={`q-tag ${data.setup?.gscConnected ? "" : "warn"}`}>{data.setup?.gscConnected ? "Connected" : "Not connected"}</span>
              </div>
              <div className="data-row">
                <span>Google Analytics 4</span>
                <span className={`q-tag ${data.setup?.ga4Connected ? "" : "warn"}`}>{data.setup?.ga4Connected ? "Connected" : "Not connected"}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* HEALTH STRIP */}
      <div className="health">
        <div className="health-cell">
          <div className="health-label"><span className={`dot-sm ${connCount === connTotal ? "ok" : "warn"}`}></span>Conexiuni</div>
          <div className="health-value">{connCount} / {connTotal}</div>
          <div className="health-meta">{connList.join(" · ") || "Niciuna"}</div>
        </div>
        <div className="health-cell">
          <div className="health-label"><span className={`dot-sm ${data.activeJob ? "info" : "ok"}`}></span>Job activ</div>
          <div className="health-value">{data.activeJob ? `${data.activeJob.progressPct ?? 0}%` : "Idle"}</div>
          <div className="health-meta">{data.activeJob ? `${data.activeJob.type} · ${data.activeJob.status}` : "Niciun job in curs"}</div>
        </div>
        <div className="health-cell">
          <div className="health-label"><span className={`dot-sm ${s.avgScore >= 70 ? "ok" : s.avgScore >= 50 ? "warn" : "critical"}`}></span>Scor audit</div>
          <div className="health-value">{s.avgScore}/100</div>
          <div className="health-meta">{s.scoreDistrib.good} bune &middot; {s.scoreDistrib.critical} critice</div>
        </div>
        <div className="health-cell">
          <div className="health-label"><span className={`dot-sm ${s.eeatScore >= 70 ? "ok" : s.eeatScore >= 50 ? "warn" : "critical"}`}></span>E-E-A-T</div>
          <div className="health-value">{s.eeatScore}/100</div>
          <div className="health-meta">Overall score</div>
        </div>
        <div className="health-cell">
          <div className="health-label"><span className={`dot-sm ${s.llmsTxtActive ? "ok" : "warn"}`}></span>LLMs.txt</div>
          <div className="health-value">{s.llmsTxtActive ? `${s.llmsTxtScore}/100` : "Inactiv"}</div>
          <div className="health-meta">{s.llmsTxtActive ? "Publicat" : "Neactivat"}</div>
        </div>

      </div>

      <footer className="footer-note">
        <div>Kimono SEO &middot; Kimono Group</div>
        <div className="footer-links">
          <Link to="/app/knowledge">Knowledge</Link>
          <a>Changelog</a>
          <a>Status</a>
          <a>Help</a>
        </div>
      </footer>

    </div>
  );
}
