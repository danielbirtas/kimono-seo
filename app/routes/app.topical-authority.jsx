// app/routes/app.topical-authority.jsx — Kimono SEO M17 Topical Authority
import { useLoaderData, useFetcher, Link } from "react-router";
import { useState } from "react";
import { requireAuth } from "../lib/auth/index.server.js";
import { runTopicalAudit, getLatestMap } from "../lib/seo/topical-authority.server.js";

export const loader = async ({ request }) => {
  const { storeId } = await requireAuth(request);
  if (!storeId) return { storeId: null, map: null };
  const map = await getLatestMap(storeId);
  return { storeId, map };
};

export const action = async ({ request }) => {
  const { storeId } = await requireAuth(request);
  if (!storeId) return { error: "Niciun magazin conectat." };
  const formData = await request.formData();
  const intent = formData.get("intent");
  try {
    if (intent === "run") {
      const raw = (formData.get("competitors") || "").toString();
      const competitors = raw.split(/[,\n]/).map(s => s.trim()).filter(Boolean).slice(0, 2);
      if (competitors.length === 0) return { error: "Adauga cel putin 1 domeniu competitor." };
      await runTopicalAudit(storeId, competitors);
      return { success: `Audit topical complet cu ${competitors.length} competitor(i).` };
    }
    return { error: "Intent necunoscut." };
  } catch (e) { return { error: e.message }; }
};

export default function TopicalAuthPage() {
  const { map, storeId } = useLoaderData();
  const fetcher = useFetcher();
  const busy = fetcher.state !== "idle";
  const data = fetcher.data;

  const [competitors, setCompetitors] = useState((map?.competitors || []).join(", "));
  const [tblPage, setTblPage] = useState(1);
  const [tblPerPage, setTblPerPage] = useState(25);

  const topics = Array.isArray(map?.topics) ? map.topics : [];
  const gaps   = Array.isArray(map?.gaps)   ? map.gaps   : [];
  const plan   = Array.isArray(map?.editorialPlan) ? map.editorialPlan : [];

  return (
    <div className="page active">
      <div className="page-head">
        <div>
          <h1 className="page-title">Harta topica &amp; editorial plan</h1>
          <p className="page-sub">Grupeaza keywords in topice, compara cu competitorii si primeste un plan editorial 12 luni prioritizat pe baza gap-urilor.</p>
        </div>
      </div>

      {data?.error   && <div className="alert-banner warn">{data.error}</div>}
      {data?.success && <div className="alert-banner ok">{data.success}</div>}
      {!storeId      && <div className="alert-banner info">Conecteaza un magazin. <Link to="/connect-store">Connect Store</Link></div>}

      {/* Input competitors */}
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-head" style={{ borderBottom: "none", padding: "13px 16px 6px" }}>
          <div className="card-title">Competitori (1-2 domenii)</div>
        </div>
        <div style={{ padding: "0 16px 16px" }}>
          <p style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 8 }}>Domain-uri separate prin virgula. Ex: <code>emag.ro, libris.ro</code>.</p>
          <fetcher.Form method="post" style={{ display: "flex", gap: 8 }}>
            <input type="hidden" name="intent" value="run" />
            <input
              name="competitors"
              value={competitors}
              onChange={e => setCompetitors(e.target.value)}
              placeholder="competitor1.ro, competitor2.ro"
              style={{ flex: 1, padding: "8px 12px", border: "1px solid var(--line)", borderRadius: "var(--r-sm)", fontSize: 13, fontFamily: "var(--sans)" }}
              required
            />
            <button className="btn btn-primary" disabled={busy}>
              {busy ? "Se analizeaza..." : map ? "Re-ruleaza" : "Analizeaza"}
            </button>
          </fetcher.Form>
        </div>
      </div>

      {!map && storeId && (
        <div className="card" style={{ textAlign: "center", padding: "48px 24px" }}>
          <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Fara harta topica</h3>
          <p style={{ color: "var(--ink-3)", fontSize: 14 }}>Adauga 1-2 competitori mai sus si apasa "Analizeaza".</p>
        </div>
      )}

      {map && (
        <>
          {/* Topics table */}
          {topics.length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <div className="card">
                <div className="card-head">
                  <div className="card-title">Topice — coverage own vs competitor <span className="count">{topics.length}</span></div>
                </div>
                <div style={{ overflow: "auto" }}>
                  <table className="tbl">
                    <thead><tr>
                      <th>Topic</th>
                      <th className="right" style={{ width: 90 }}>KW proprii</th>
                      <th className="right" style={{ width: 90 }}>Vol. mediu</th>
                      <th className="right" style={{ width: 110 }}>KW competitori</th>
                      <th style={{ width: 180 }}>Gap score</th>
                    </tr></thead>
                    <tbody>
                      {topics.sort((a, b) => (b.gapScore ?? 0) - (a.gapScore ?? 0)).slice((tblPage-1)*tblPerPage, tblPage*tblPerPage).map((t, i) => (
                        <tr key={i}>
                          <td className="kw">{t.topic}</td>
                          <td className="right">{t.ownKwCount ?? 0}</td>
                          <td className="right" style={{ color: "var(--ink-3)" }}>{t.ownAvgVol ?? 0}</td>
                          <td className="right">{t.competitorKwCount ?? 0}</td>
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div className="prog" style={{ flex: 1, marginTop: 0 }}>
                                <div className={`prog-fill ${(t.gapScore ?? 0) > 70 ? "danger" : (t.gapScore ?? 0) > 40 ? "warn" : "ok"}`} style={{ width: `${t.gapScore ?? 0}%` }} />
                              </div>
                              <span style={{ fontSize: 11, fontWeight: 700, fontVariantNumeric: "tabular-nums", minWidth: 28 }}>{t.gapScore ?? 0}</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              {topics.length > tblPerPage && (
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
                      <span>{(tblPage-1)*tblPerPage+1}–{Math.min(tblPage*tblPerPage, topics.length)} din {topics.length}</span>
                      <button style={{padding:"4px 8px",border:"1px solid var(--line)",borderRadius:"6px",background:"var(--surface)",cursor:"pointer"}} disabled={tblPage <= 1} onClick={() => setTblPage(p => p-1)}>←</button>
                      <button style={{padding:"4px 8px",border:"1px solid var(--line)",borderRadius:"6px",background:"var(--surface)",cursor:"pointer"}} disabled={tblPage >= Math.ceil(topics.length/tblPerPage)} onClick={() => setTblPage(p => p+1)}>→</button>
                    </div>
                  </div>
                )}
            </div>
          )}

          {/* Gaps */}
          {gaps.length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <div className="card">
                <div className="card-head">
                  <div className="card-title">Top oportunitati <span className="count">{gaps.length}</span></div>
                </div>
                <div className="data-list" style={{ border: "none", borderRadius: 0 }}>
                  {gaps.map((g, i) => (
                    <div key={i} className="data-row" style={{ gridTemplateColumns: "60px 1fr" }}>
                      <div style={{ textAlign: "center" }}>
                        <span className={`q-tag ${g.priority === "high" ? "critical" : g.priority === "med" ? "warn" : "info"}`}>{g.priority}</span>
                      </div>
                      <div className="data-row-main">
                        <div className="data-row-title">{g.topic}</div>
                        <div className="data-row-meta">{g.opportunity}</div>
                        <div className="data-row-meta">~{g.estimatedKeywords} keywords &middot; volum estimat {g.estimatedVolume}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Editorial plan */}
          {plan.length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <div className="card" style={{ marginBottom: 8 }}>
                <div className="card-head">
                  <div className="card-title">Plan editorial 12 luni</div>
                </div>
              </div>
              <div className="three-col">
                {plan.map(month => (
                  <div key={month.month} className="card" style={{ padding: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>Luna {month.month}</div>
                    {(month.articles || []).map((a, i) => (
                      <div key={i} style={{ padding: "8px 0", borderBottom: i < (month.articles || []).length - 1 ? "1px solid var(--line)" : "none" }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>
                          {a.type === "pillar" && <span className="q-tag info" style={{ fontSize: 9, marginRight: 4 }}>PILLAR</span>}
                          {a.title}
                        </div>
                        {Array.isArray(a.keywords) && a.keywords.length > 0 && (
                          <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>
                            {a.keywords.slice(0, 3).join(", ")}{a.keywords.length > 3 && ` +${a.keywords.length - 3}`}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          <p style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 14 }}>
            Analiza rulata: {new Date(map.runAt).toLocaleString("ro")}
          </p>
        </>
      )}
    </div>
  );
}
