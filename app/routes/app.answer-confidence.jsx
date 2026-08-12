// app/routes/app.answer-confidence.jsx — Kimono SEO M27 Answer Confidence
import { useLoaderData, useFetcher, Link } from "react-router";
import { useState } from "react";
import { requireAuth } from "../lib/auth/index.server.js";
import prisma from "../db.server.js";
import { scoreBlogArticle, scoreRecentArticles } from "../lib/seo/answer-confidence.server.js";

export const loader = async ({ request }) => {
  const { storeId } = await requireAuth(request);
  if (!storeId) return { storeId: null, scores: [], articles: [], avg: 0 };

  const [scores, articles, agg] = await Promise.all([
    prisma.seoAnswerConfidence.findMany({
      where:   { storeId },
      orderBy: [{ overallScore: "asc" }, { runAt: "desc" }],
      take:    50,
    }),
    prisma.blogArticle.findMany({
      where:   { storeId },
      select:  { id: true, h1: true, titleTag: true, primaryKeyword: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take:    30,
    }),
    prisma.seoAnswerConfidence.aggregate({ where: { storeId }, _avg: { overallScore: true } }),
  ]);

  return {
    storeId, scores, articles,
    avg: Math.round(agg._avg?.overallScore ?? 0),
  };
};

export const action = async ({ request }) => {
  const { storeId } = await requireAuth(request);
  if (!storeId) return { error: "Niciun magazin conectat." };

  const formData = await request.formData();
  const intent   = formData.get("intent");

  try {
    if (intent === "score_one") {
      const articleId = formData.get("articleId");
      await scoreBlogArticle(storeId, articleId);
      return { success: "Scoring complet." };
    }
    if (intent === "score_recent") {
      const res = await scoreRecentArticles(storeId, 10);
      return { success: `Batch: ${res.ok} OK, ${res.failed} esuat.` };
    }
    return { error: "Intent necunoscut." };
  } catch (e) {
    return { error: e.message };
  }
};

function scoreColor(score) {
  if (score >= 80) return "var(--accent)";
  if (score >= 60) return "var(--warn)";
  if (score >= 40) return "#f59e0b";
  return "var(--danger)";
}

export default function AnswerConfidencePage() {
  const { scores, articles, avg, storeId } = useLoaderData();
  const fetcher = useFetcher();
  const busy = fetcher.state !== "idle";
  const data = fetcher.data;
  const [tblPage, setTblPage] = useState(1);
  const [tblPerPage, setTblPerPage] = useState(25);

  const scoredIds = new Set(scores.map(s => s.sourceId).filter(Boolean));
  const unscored  = articles.filter(a => !scoredIds.has(a.id));

  return (
    <div className="page active">
      <div className="page-head">
        <div>
          <h1 className="page-title">Answer Confidence</h1>
          <p className="page-sub">Cat de probabil e ca Perplexity, ChatGPT, Claude sa citeze articolele tale? Scor 0-100 pe 8 criterii (raspuns direct, date numerice, autoritate, format).</p>
        </div>
        <div className="page-actions">
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="score_recent" />
            <button className="btn btn-primary" disabled={busy || articles.length === 0}>
              {busy ? "Se evalueaza..." : "Evalueaza top 10 articole"}
            </button>
          </fetcher.Form>
        </div>
      </div>

      {data?.error   && <div className="alert-banner warn">{data.error}</div>}
      {data?.success && <div className="alert-banner ok">{data.success}</div>}
      {!storeId      && <div className="alert-banner warn">Conecteaza un magazin. <Link to="/connect-store">Connect Store</Link></div>}
      {storeId && articles.length === 0 && (
        <div className="alert-banner warn">Nu exista articole de blog. <Link to="/app/blog">Genereaza primul</Link></div>
      )}

      {scores.length > 0 && (
        <div className="metric-grid">
          <div className="metric">
            <div className="metric-label">Scor mediu</div>
            <div className="metric-value" style={{ color: scoreColor(avg) }}>{avg}<span className="unit">/100</span></div>
          </div>
          <div className="metric">
            <div className="metric-label">Articole evaluate</div>
            <div className="metric-value">{scores.length}</div>
          </div>
          <div className="metric">
            <div className="metric-label">Sub 60 (de refacut)</div>
            <div className="metric-value" style={{ color: "var(--warn)" }}>
              {scores.filter(s => s.overallScore < 60).length}
            </div>
          </div>
          <div className="metric">
            <div className="metric-label">Peste 80 (citable)</div>
            <div className="metric-value" style={{ color: "var(--accent)" }}>
              {scores.filter(s => s.overallScore >= 80).length}
            </div>
          </div>
        </div>
      )}

      {/* Unscored articles */}
      {unscored.length > 0 && (
        <div style={{ marginBottom: "20px" }}>
          <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: "10px" }}>Neevaluat inca ({unscored.length})</div>
          <div className="table-wrap">
            <table className="tbl">
              <tbody>
                {unscored.slice((tblPage-1)*tblPerPage, tblPage*tblPerPage).map(a => (
                  <tr key={a.id}>
                    <td style={{ fontWeight: 600 }}>{a.h1 || a.titleTag || a.primaryKeyword}</td>
                    <td style={{ color: "var(--ink-3)", fontSize: "12px" }}>{new Date(a.updatedAt).toLocaleDateString("ro")}</td>
                    <td className="right">
                      <fetcher.Form method="post" style={{ display: "inline" }}>
                        <input type="hidden" name="intent" value="score_one" />
                        <input type="hidden" name="articleId" value={a.id} />
                        <button className="btn btn-ghost" style={{ fontSize: "11px" }} disabled={busy}>Evalueaza</button>
                      </fetcher.Form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {unscored.length > tblPerPage && (
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
                  <span>{(tblPage-1)*tblPerPage+1}–{Math.min(tblPage*tblPerPage, unscored.length)} din {unscored.length}</span>
                  <button style={{padding:"4px 8px",border:"1px solid var(--line)",borderRadius:"6px",background:"var(--surface)",cursor:"pointer"}} disabled={tblPage <= 1} onClick={() => setTblPage(p => p-1)}>←</button>
                  <button style={{padding:"4px 8px",border:"1px solid var(--line)",borderRadius:"6px",background:"var(--surface)",cursor:"pointer"}} disabled={tblPage >= Math.ceil(unscored.length/tblPerPage)} onClick={() => setTblPage(p => p+1)}>→</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Scored articles with details */}
      {scores.length > 0 && (
        <div>
          <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: "10px" }}>Articole evaluate — cele mai slabe primele</div>
          {scores.map(s => (
            <div key={s.id} className="card" style={{ marginBottom: "14px", padding: "16px 18px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", marginBottom: "10px" }}>
                <div style={{ flex: 1 }}>
                  <h3 style={{ fontSize: "15px", fontWeight: 700 }}>{s.sourceTitle}</h3>
                  <div style={{ fontSize: "11px", color: "var(--ink-3)", marginTop: "4px" }}>
                    {s.sourceType === "blog_article" ? "Blog article" : s.sourceType} &middot; evaluat {new Date(s.runAt).toLocaleDateString("ro")}
                  </div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "2rem", fontWeight: 900, color: scoreColor(s.overallScore), lineHeight: 1 }}>{s.overallScore}</div>
                  <div style={{ fontSize: "10px", color: "var(--ink-3)", fontWeight: 700 }}>/100</div>
                </div>
              </div>

              {/* Criteria breakdown */}
              {Array.isArray(s.criteria) && s.criteria.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "6px", marginBottom: "10px" }}>
                  {s.criteria.map((c, i) => (
                    <div key={i} className="engine-stat">
                      <span className="engine-stat-lbl">{c.name?.replace(/_/g, " ")}</span>
                      <span className="engine-stat-val" style={{ color: scoreColor(c.score) }}>{c.score}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Recommendations */}
              {Array.isArray(s.recommendations) && s.recommendations.length > 0 && (
                <details>
                  <summary style={{ cursor: "pointer", fontSize: "12px", fontWeight: 600, color: "var(--accent)" }}>
                    {s.recommendations.length} recomandari pentru imbunatatire
                  </summary>
                  <div style={{ marginTop: "8px" }}>
                    {s.recommendations.map((r, i) => (
                      <div key={i} className="data-row" style={{ gridTemplateColumns: "16px 1fr" }}>
                        <span style={{ color: "var(--warn)", fontSize: "14px" }}>{"\u26A0\uFE0F"}</span>
                        <div style={{ fontSize: "12px" }}>
                          {r.section && <div style={{ fontWeight: 700 }}>{r.section}</div>}
                          <div style={{ color: "var(--ink-3)" }}>{r.issue}</div>
                          <div style={{ color: "var(--ink-0)", marginTop: "2px" }}><strong>Fix:</strong> {r.fix}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
