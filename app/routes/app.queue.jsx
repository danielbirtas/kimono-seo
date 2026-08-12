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

const timeAgo = (d) => {
  if (!d) return "";
  const ms = Date.now() - new Date(d).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "acum";
  if (m < 60) return m + "m ago";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h ago";
  return Math.floor(h / 24) + "d ago";
};

export const loader = async ({ request }) => {
  const { storeId } = await requireAuth(request);
  if (!storeId) return { critical: { open404s: [], schemaInvalidCount: 0, redirectSuggestions: [] }, review: { imgCount: 0, lowConfCount: 0, lowConfArticles: [] }, suggestions: [], stats: { pending: 0, critical: 0, reviewCount: 0, suggestionsCount: 0, schemaInvalid: 0 } };

  const [
    open404s,
    imgPendingCount,
    schemaInvalidCount,
    lowConfCount,
    lowConfArticles,
    zeroClickPending,
    redirectSuggestions,
  ] = await Promise.all([
    prisma.seo404Detection.findMany({ where: { storeId, status: "open" }, take: 10, orderBy: { lastSeenAt: "desc" } }).catch(() => []),
    prisma.seoImageAlt.count({ where: { storeId, status: { in: ["pending", "error"] } } }).catch(() => 0),
    prisma.seoSchemaValidation.count({ where: { storeId, isValid: false } }).catch(() => 0),
    prisma.seoAnswerConfidence.count({ where: { storeId, overallScore: { lt: 60 } } }).catch(() => 0),
    prisma.seoAnswerConfidence.findMany({ where: { storeId, overallScore: { lt: 60 } }, take: 5, orderBy: { overallScore: "asc" }, select: { id: true, sourceTitle: true, sourceUrl: true, overallScore: true, sourceType: true, runAt: true } }).catch(() => []),
    prisma.seoZeroClickOpt.findMany({ where: { storeId, status: "pending" }, take: 5, orderBy: { keyword: "asc" }, select: { id: true, keyword: true, serpFeature: true, recommendedFormat: true, applicableUrl: true, competitorUrl: true, recommendedText: true } }).catch(() => []),
    prisma.redirectSuggestion.findMany({ where: { storeId, status: "pending" }, take: 5, orderBy: { clicks: "desc" }, select: { id: true, fromPath: true, toPath: true, confidence: true, reason: true, clicks: true } }).catch(() => []),
  ]);

  const criticalCount = open404s.length + (schemaInvalidCount > 0 ? 1 : 0);
  const reviewCount = (imgPendingCount > 0 ? 1 : 0) + (lowConfCount > 0 ? 1 : 0);
  const suggestionsCount = zeroClickPending.length;
  const pending = criticalCount + reviewCount + suggestionsCount;

  return {
    critical: { open404s, schemaInvalidCount, redirectSuggestions },
    review: { imgCount: imgPendingCount, lowConfCount, lowConfArticles },
    suggestions: zeroClickPending,
    stats: { pending, critical: criticalCount, reviewCount, suggestionsCount, schemaInvalid: schemaInvalidCount },
  };
};

export default function ActionQueue() {
  const data = useLoaderData();
  const [filter, setFilter] = useState("all");

  const s = data?.stats || { pending: 0, critical: 0, reviewCount: 0, suggestionsCount: 0, schemaInvalid: 0 };
  const crit = data?.critical || { open404s: [], schemaInvalidCount: 0, redirectSuggestions: [] };
  const rev = data?.review || { imgCount: 0, lowConfCount: 0, lowConfArticles: [] };
  const sugg = data?.suggestions || [];

  const showCritical = filter === "all" || filter === "critical";
  const showReview = filter === "all" || filter === "review";
  const showSugestii = filter === "all" || filter === "sugestii";

  return (
    <div className="page active" id="page-queue">

      <div className="page-head">
        <div>
          <div className="greet-kicker">
            <span className="live-dot"></span>
            <span>{s.pending} actiuni pending · {s.critical} critice · ultima actualizare acum</span>
          </div>
          <h1 className="page-title">Action <em>Queue</em></h1>
          <p className="page-sub">Decizii care asteapta input-ul tau. Aplica sau respinge pentru ca sistemul sa continue.</p>
        </div>
        <div className="page-actions">
          <div className="view-toggle">
            <button className="active">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="3" width="7" height="18"/><rect x="14" y="3" width="7" height="18"/></svg>
              Board
            </button>
            <button>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
              List
            </button>
          </div>
          <button className="btn btn-ghost">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg>
            Bulk apply ({s.pending})
          </button>
          <button className="btn btn-primary">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 12a9 9 0 1 1-6.2-8.6"/><path d="M21 3v5h-5"/></svg>
            Re-triage
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="act-stats">
        <div className="act-stat">
          <div className="act-stat-label">Pending</div>
          <div className="act-stat-value">{s.pending}</div>
          <div className="act-stat-meta">{s.critical} critice · {s.reviewCount} review · {s.suggestionsCount} sugestii</div>
        </div>
        <div className="act-stat">
          <div className="act-stat-label">404s deschise</div>
          <div className="act-stat-value">{fmt(crit.open404s?.length || 0)}</div>
          <div className="act-stat-meta">necesita redirect</div>
        </div>
        <div className="act-stat">
          <div className="act-stat-label">Schema invalid</div>
          <div className="act-stat-value">{fmt(s.schemaInvalid)}</div>
          <div className="act-stat-meta">pagini cu erori</div>
        </div>
        <div className="act-stat">
          <div className="act-stat-label">Imagini fara alt</div>
          <div className="act-stat-value">{fmt(rev.imgCount)}</div>
          <div className="act-stat-meta">pending sau eroare</div>
        </div>
        <div className="act-stat">
          <div className="act-stat-label">Low confidence</div>
          <div className="act-stat-value">{fmt(rev.lowConfCount)}</div>
          <div className="act-stat-meta">articole sub 60%</div>
        </div>
      </div>

      {/* Filter toolbar */}
      <div className="toolbar">
        <div className="toolbar-left">
          <div className="chip-group">
            <span className={`chip ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")}>Toate <span className="ct">{s.pending}</span></span>
            <span className={`chip ${filter === "critical" ? "active" : ""}`} onClick={() => setFilter("critical")}>Critic <span className="ct">{s.critical}</span></span>
            <span className={`chip ${filter === "review" ? "active" : ""}`} onClick={() => setFilter("review")}>Review <span className="ct">{s.reviewCount}</span></span>
            <span className={`chip ${filter === "sugestii" ? "active" : ""}`} onClick={() => setFilter("sugestii")}>Sugestii <span className="ct">{s.suggestionsCount}</span></span>
          </div>
        </div>
        <div className="toolbar-right">
          <button className="select">Modul: toate <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="m4 6 4 4 4-4"/></svg></button>
          <button className="select">Sortare: priority <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="m4 6 4 4 4-4"/></svg></button>
        </div>
      </div>

      {/* Kanban board */}
      <div className="queue-layout">

        {/* CRITIC column */}
        {showCritical && (
        <div className="q-col">
          <div className="q-col-head">
            <div className="q-col-title">
              <span className="cdot crit"></span>
              Critic
            </div>
            <span className="q-col-count">{s.critical}</span>
          </div>

          {/* 404 cards */}
          {(crit.open404s || []).map((item) => (
            <div className="q-card" key={item.id}>
              <div className="q-card-head">
                <div className="q-card-meta">
                  <span>404 Broken</span>
                  <span className="mdot"></span>
                  <span>{timeAgo(item.lastSeenAt)}</span>
                </div>
                <span className="q-card-prio p0">P0</span>
              </div>
              <div className="q-card-title">404 pe {item.url?.length > 40 ? item.url.slice(0, 40) + "..." : item.url}</div>
              <div className="q-card-desc">
                Status code <span className="code">{item.statusCode}</span> · vazut de {item.occurrences} ori.
                {Array.isArray(item.referrers) && item.referrers.length > 0 && <> Referreri: {item.referrers.length}</>}
              </div>
              <div className="q-card-impact">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m7 14 4-4 4 4 5-5"/><path d="M21 3v18H3"/></svg>
                <div className="q-card-impact-text">Aparitii: <span>{item.occurrences}</span> · Prima: <span>{new Date(item.firstSeenAt).toLocaleDateString("ro")}</span></div>
              </div>
              <div className="q-card-foot">
                <div className="q-card-foot-left">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                  Est. 30s
                </div>
                <div className="q-card-actions">
                  <button className="q-card-btn">Detalii</button>
                  <button className="q-card-btn primary">Redirect</button>
                </div>
              </div>
            </div>
          ))}

          {/* Redirect suggestions */}
          {(crit.redirectSuggestions || []).map((r) => (
            <div className="q-card" key={r.id}>
              <div className="q-card-head">
                <div className="q-card-meta">
                  <span>Redirect</span>
                  <span className="mdot"></span>
                  <span>{r.clicks} clicks pierdute</span>
                </div>
                <span className="q-card-prio p0">P0</span>
              </div>
              <div className="q-card-title">Redirect: {r.fromPath?.length > 35 ? r.fromPath.slice(0, 35) + "..." : r.fromPath}</div>
              <div className="q-card-desc">
                Sugestie: <span className="code">{r.toPath}</span> · confidence {r.confidence}%.
                {r.reason && <> {r.reason}</>}
              </div>
              <div className="q-card-impact">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m7 14 4-4 4 4 5-5"/><path d="M21 3v18H3"/></svg>
                <div className="q-card-impact-text">Clicks pierdute: <span>{r.clicks}/luna</span></div>
              </div>
              <div className="q-card-foot">
                <div className="q-card-foot-left">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                  Est. 30s
                </div>
                <div className="q-card-actions">
                  <button className="q-card-btn">Ignora</button>
                  <button className="q-card-btn primary">Aplica 301</button>
                </div>
              </div>
            </div>
          ))}

          {/* Schema invalid card */}
          {(crit.schemaInvalidCount || 0) > 0 && (
            <div className="q-card">
              <div className="q-card-head">
                <div className="q-card-meta">
                  <span>Schema lipsa</span>
                  <span className="mdot"></span>
                  <span>acum</span>
                </div>
                <span className="q-card-prio p0">P0</span>
              </div>
              <div className="q-card-title">Schema invalida pe {crit.schemaInvalidCount} pagini</div>
              <div className="q-card-desc">Pagini cu schema JSON-LD invalida sau erori detectate. Necesita corectie pentru Rich Results.</div>
              <div className="q-card-impact">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m7 14 4-4 4 4 5-5"/><path d="M21 3v18H3"/></svg>
                <div className="q-card-impact-text">Rich Results: <span>+{crit.schemaInvalidCount} pagini eligible</span></div>
              </div>
              <div className="q-card-foot">
                <div className="q-card-foot-left">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                  Est. 5m
                </div>
                <div className="q-card-actions">
                  <button className="q-card-btn">Review</button>
                  <button className="q-card-btn primary">Auto-fix</button>
                </div>
              </div>
            </div>
          )}

          {s.critical === 0 && (
            <div className="q-add" style={{opacity:.5}}>Nicio actiune critica</div>
          )}
        </div>
        )}

        {/* REVIEW column */}
        {showReview && (
        <div className="q-col">
          <div className="q-col-head">
            <div className="q-col-title">
              <span className="cdot warn"></span>
              Review necesar
            </div>
            <span className="q-col-count">{s.reviewCount}</span>
          </div>

          {/* Images without alt */}
          {rev.imgCount > 0 && (
            <div className="q-card">
              <div className="q-card-head">
                <div className="q-card-meta">
                  <span>Image Optimizer</span>
                  <span className="mdot"></span>
                  <span>acum</span>
                </div>
                <span className="q-card-prio p1">P1</span>
              </div>
              <div className="q-card-title">{fmt(rev.imgCount)} imagini fara alt text</div>
              <div className="q-card-desc">Imagini cu status pending sau eroare care necesita alt text generat sau review manual.</div>
              <div className="q-card-impact">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m7 14 4-4 4 4 5-5"/><path d="M21 3v18H3"/></svg>
                <div className="q-card-impact-text">Accessibility + SEO imagini</div>
              </div>
              <div className="q-card-foot">
                <div className="q-card-foot-left">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                  Est. 8m
                </div>
                <div className="q-card-actions">
                  <button className="q-card-btn">Respinge</button>
                  <button className="q-card-btn primary">Review</button>
                </div>
              </div>
            </div>
          )}

          {/* Low confidence articles */}
          {rev.lowConfCount > 0 && (
            <div className="q-card">
              <div className="q-card-head">
                <div className="q-card-meta">
                  <span>Answer Confidence</span>
                  <span className="mdot"></span>
                  <span>acum</span>
                </div>
                <span className="q-card-prio p1">P1</span>
              </div>
              <div className="q-card-title">{rev.lowConfCount} articole cu confidence scazut</div>
              <div className="q-card-desc">
                {(rev.lowConfArticles || []).slice(0, 3).map((a, i) => (
                  <span key={a.id}>{i > 0 && ", "}<span className="code">{a.sourceTitle?.slice(0, 30)}</span> ({a.overallScore}%)</span>
                ))}
                {rev.lowConfCount > 3 && <span> + altele</span>}
              </div>
              <div className="q-card-impact">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m7 14 4-4 4 4 5-5"/><path d="M21 3v18H3"/></svg>
                <div className="q-card-impact-text">Recuperare: <span>imbunatatire calitate continut</span></div>
              </div>
              <div className="q-card-foot">
                <div className="q-card-foot-left">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                  Est. 12m
                </div>
                <div className="q-card-actions">
                  <button className="q-card-btn">Later</button>
                  <button className="q-card-btn primary">Refresh</button>
                </div>
              </div>
            </div>
          )}

          {s.reviewCount === 0 && (
            <div className="q-add" style={{opacity:.5}}>Nimic de review</div>
          )}

          <div className="q-add">+ Adauga actiune manuala</div>
        </div>
        )}

        {/* SUGESTII column */}
        {showSugestii && (
        <div className="q-col">
          <div className="q-col-head">
            <div className="q-col-title">
              <span className="cdot info"></span>
              Sugestii AI
            </div>
            <span className="q-col-count">{s.suggestionsCount}</span>
          </div>

          {sugg.map((item) => (
            <div className="q-card" key={item.id}>
              <div className="q-card-head">
                <div className="q-card-meta">
                  <span>Zero-Click</span>
                  <span className="mdot"></span>
                  <span>{item.serpFeature?.replace(/_/g, " ")}</span>
                </div>
                <span className="q-card-prio p2">P2</span>
              </div>
              <div className="q-card-title">Oportunitate: &ldquo;{item.keyword}&rdquo;</div>
              <div className="q-card-desc">
                Format recomandat: <span className="code">{item.recommendedFormat || "paragraph"}</span>.
                {item.applicableUrl && <> Target: <span className="code">{item.applicableUrl.length > 35 ? item.applicableUrl.slice(0, 35) + "..." : item.applicableUrl}</span></>}
              </div>
              <div className="q-card-impact">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m7 14 4-4 4 4 5-5"/><path d="M21 3v18H3"/></svg>
                <div className="q-card-impact-text">SERP Feature: <span>{item.serpFeature?.replace(/_/g, " ")}</span></div>
              </div>
              <div className="q-card-foot">
                <div className="q-card-foot-left">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                  Est. 10m
                </div>
                <div className="q-card-actions">
                  <button className="q-card-btn">Ignore</button>
                  <button className="q-card-btn primary">Aplica</button>
                </div>
              </div>
            </div>
          ))}

          {sugg.length === 0 && (
            <div className="q-add" style={{opacity:.5}}>Nicio sugestie pending</div>
          )}

          <div className="q-add">+ Adauga din GSC opportunities</div>
        </div>
        )}

      </div>

    </div>
  );
}
