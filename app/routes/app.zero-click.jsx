// app/routes/app.zero-click.jsx — Kimono SEO M13 Zero-Click
import { useLoaderData, useFetcher, Link } from "react-router";
import { requireAuth } from "../lib/auth/index.server.js";
import prisma from "../db.server.js";
import { scanKeywordsForZeroClick, generateRecommendation, markApplied, dismissOpt } from "../lib/seo/zero-click.server.js";

export const loader = async ({ request }) => {
  const { storeId } = await requireAuth(request);
  if (!storeId) return { storeId: null, rows: [], counts: {} };

  const [rows, kwCount, pending, approved, applied] = await Promise.all([
    prisma.seoZeroClickOpt.findMany({
      where:   { storeId },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take:    100,
    }),
    prisma.seoKeyword.count({ where: { storeId } }),
    prisma.seoZeroClickOpt.count({ where: { storeId, status: "pending"  } }),
    prisma.seoZeroClickOpt.count({ where: { storeId, status: "approved" } }),
    prisma.seoZeroClickOpt.count({ where: { storeId, status: "applied"  } }),
  ]);

  return { storeId, rows, counts: { keywords: kwCount, pending, approved, applied } };
};

export const action = async ({ request }) => {
  const { storeId } = await requireAuth(request);
  if (!storeId) return { error: "Niciun magazin conectat." };

  const formData = await request.formData();
  const intent   = formData.get("intent");

  try {
    if (intent === "scan") {
      const res = await scanKeywordsForZeroClick(storeId, 10);
      return { success: `Scan: ${res.keywords} keywords verificate, ${res.features} oportunitati gasite in SERP.` };
    }
    if (intent === "generate") {
      await generateRecommendation(storeId, formData.get("id"));
      return { success: "Text optimizat generat." };
    }
    if (intent === "apply") {
      await markApplied(storeId, formData.get("id"), formData.get("url") || null);
      return { success: "Marcat ca aplicat." };
    }
    if (intent === "dismiss") {
      await dismissOpt(storeId, formData.get("id"));
      return { success: "Dismiss." };
    }
    return { error: "Intent necunoscut." };
  } catch (e) {
    return { error: e.message };
  }
};

const FEATURE_LABELS = {
  featured_snippet: "Featured Snippet",
  people_also_ask:  "People Also Ask",
  definition:       "Definition Box",
  video_pack:       "Video Pack",
  knowledge_panel:  "Knowledge Panel",
};

export default function ZeroClickPage() {
  const { rows, counts, storeId } = useLoaderData();
  const fetcher = useFetcher();
  const busy = fetcher.state !== "idle";
  const data = fetcher.data;

  return (
    <div className="page active">
      <div className="page-head">
        <div>
          <h1 className="page-title">Featured Snippets &amp; AI Overviews</h1>
          <p className="page-sub">Identifica keyword-urile cu SERP features (featured snippet, PAA, definition) si genereaza texte optimizate pentru citation/citabilitate. Top 10 keywords dupa volum.</p>
        </div>
        <div className="page-actions">
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="scan" />
            <button className="btn btn-primary" disabled={busy || counts.keywords === 0}>
              {busy ? "Se scaneaza SERP..." : "Scaneaza top 10 keywords"}
            </button>
          </fetcher.Form>
        </div>
      </div>

      {data?.error   && <div className="alert-banner warn">{data.error}</div>}
      {data?.success && <div className="alert-banner ok">{data.success}</div>}
      {!storeId      && <div className="alert-banner warn">Conecteaza un magazin. <Link to="/connect-store">Connect Store</Link></div>}
      {storeId && counts.keywords === 0 && (
        <div className="alert-banner warn">Nu ai keywords in baza. <Link to="/app/seo/keywords">Importa din GSC/DFS</Link></div>
      )}

      <div className="metric-grid">
        <StatCard label="Pending" count={counts.pending || 0} />
        <StatCard label="Aprobat" count={counts.approved || 0} color="var(--accent)" />
        <StatCard label="Aplicat" count={counts.applied || 0} color="var(--accent-ink)" />
        <StatCard label="Keywords baza" count={counts.keywords || 0} />
      </div>

      {rows.length === 0 && storeId && counts.keywords > 0 && (
        <div className="card" style={{ textAlign: "center", padding: "48px 24px" }}>
          <div style={{ fontSize: "32px", marginBottom: "12px", color: "var(--ink-4)" }}>&#x1F3AF;</div>
          <h3 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "8px" }}>Niciun scan inca</h3>
          <p className="page-sub">Apasa "Scaneaza top 10 keywords" pentru a detecta SERP features.</p>
        </div>
      )}

      {rows.length > 0 && rows.map(row => (
        <div key={row.id} className="card" style={{ marginBottom: "14px", padding: "16px 18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", marginBottom: "10px" }}>
            <div>
              <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "6px" }}>
                <span className="q-tag info">
                  {FEATURE_LABELS[row.serpFeature] || row.serpFeature}
                </span>
                {row.recommendedFormat && (
                  <span className="q-tag">{row.recommendedFormat}</span>
                )}
              </div>
              <h3 style={{ fontSize: "16px", fontWeight: 700 }}>"{row.keyword}"</h3>
            </div>
            <StatusBadge status={row.status} />
          </div>

          {row.competitorText && (
            <details style={{ marginBottom: "8px" }}>
              <summary style={{ cursor: "pointer", fontSize: "12px", fontWeight: 600, color: "var(--ink-3)" }}>
                SERP actual {row.competitorUrl && `- ${new URL(row.competitorUrl).hostname}`}
              </summary>
              <div className="code-preview" style={{ marginTop: "6px", fontSize: "12px", whiteSpace: "pre-wrap" }}>
                {row.competitorText}
              </div>
            </details>
          )}

          {row.recommendedText ? (
            <div>
              <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: "6px" }}>Text optimizat propus</div>
              <div style={{ background: "var(--accent-soft)", padding: "12px 14px", borderRadius: "var(--r)", border: "1px solid var(--accent)", fontSize: "13px", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                {row.recommendedText}
              </div>
            </div>
          ) : (
            <fetcher.Form method="post">
              <input type="hidden" name="intent" value="generate" />
              <input type="hidden" name="id" value={row.id} />
              <button className="btn btn-ghost" disabled={busy}>Genereaza text optimizat</button>
            </fetcher.Form>
          )}

          {row.status === "approved" && (
            <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
              <fetcher.Form method="post" style={{ display: "flex", gap: "8px", flex: 1 }}>
                <input type="hidden" name="intent" value="apply" />
                <input type="hidden" name="id" value={row.id} />
                <input name="url" type="url" placeholder="URL unde ai aplicat (optional)" className="editor-input" style={{ flex: 1, border: "1px solid var(--line)", borderRadius: "var(--r-sm)", padding: "6px 10px" }} />
                <button className="btn btn-primary" style={{ fontSize: "12px" }} disabled={busy}>Marcheaza aplicat</button>
              </fetcher.Form>
              <fetcher.Form method="post">
                <input type="hidden" name="intent" value="dismiss" />
                <input type="hidden" name="id" value={row.id} />
                <button className="btn btn-ghost" style={{ fontSize: "12px" }} disabled={busy}>Respinge</button>
              </fetcher.Form>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function StatCard({ label, count, color }) {
  return (
    <div className="metric">
      <div className="metric-label">{label}</div>
      <div className="metric-value" style={{ color: color || "var(--ink-0)" }}>{count}</div>
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    pending:  { label: "Pending",  cls: "queue" },
    approved: { label: "Generat",  cls: "live"  },
    applied:  { label: "Aplicat",  cls: "live"  },
    rejected: { label: "Respins",  cls: "queue" },
  };
  const s = map[status] || map.pending;
  return <span className={`mod-status ${s.cls}`}><span className="dot"></span>{s.label}</span>;
}
