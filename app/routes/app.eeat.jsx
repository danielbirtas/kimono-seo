// app/routes/app.eeat.jsx — Kimono SEO M15 E-E-A-T Analyzer
import { useLoaderData, useFetcher, Link } from "react-router";
import { useState } from "react";
import { requireAuth } from "../lib/auth/index.server.js";
import { runEEATAudit, getLatestEEAT } from "../lib/seo/eeat-analyzer.server.js";

export const loader = async ({ request }) => {
  const { storeId } = await requireAuth(request);
  if (!storeId) return { storeId: null, audit: null };
  const audit = await getLatestEEAT(storeId);
  return { storeId, audit };
};

export const action = async ({ request }) => {
  const { storeId } = await requireAuth(request);
  if (!storeId) return { error: "Niciun magazin conectat." };
  const formData = await request.formData();
  const intent = formData.get("intent");
  try {
    if (intent === "run") {
      await runEEATAudit(storeId);
      return { success: "Audit E-E-A-T complet. Scoruri actualizate." };
    }
    return { error: "Intent necunoscut." };
  } catch (e) { return { error: e.message }; }
};

function scoreColor(s) {
  if (s >= 80) return "var(--accent)";
  if (s >= 60) return "var(--warn)";
  if (s >= 40) return "#f59e0b";
  return "var(--danger)";
}

export default function EEATPage() {
  const { audit, storeId } = useLoaderData();
  const fetcher = useFetcher();
  const busy = fetcher.state !== "idle";
  const data = fetcher.data;
  const [tblPage, setTblPage] = useState(1);
  const [tblPerPage, setTblPerPage] = useState(25);

  return (
    <div className="page active">
      <div className="page-head">
        <div>
          <h1 className="page-title">E-E-A-T Analyzer</h1>
          <p className="page-sub">Audit pe 16 puncte cheie din Google Quality Rater Guidelines. Scor 0-100 per categorie + plan de imbunatatire prioritizat.</p>
        </div>
        <div className="page-actions">
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="run" />
            <button className="btn btn-primary" disabled={busy}>
              {audit ? "Re-ruleaza" : "Ruleaza primul audit"}
            </button>
          </fetcher.Form>
        </div>
      </div>

      {data?.error && <div className="alert-banner warn">{data.error}</div>}
      {data?.success && <div className="alert-banner ok">{data.success}</div>}
      {!storeId && <div className="alert-banner warn">Conecteaza un magazin. <Link to="/connect-store">Connect Store</Link></div>}

      {!audit && storeId && (
        <div className="card" style={{ textAlign: "center", padding: "48px 24px" }}>
          <div style={{ fontSize: "32px", marginBottom: "12px", color: "var(--ink-4)" }}>&#x1F6E1;</div>
          <h3 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "8px" }}>Niciun audit inca</h3>
          <p className="page-sub">E-E-A-T este un factor critic pentru ranking in Google si citare in AI. Ruleaza primul audit pentru a vedea unde esti.</p>
        </div>
      )}

      {audit && (
        <>
          <div className="metric-grid" style={{ gridTemplateColumns: "repeat(5, 1fr)" }}>
            <ScoreCard label="Overall" score={audit.overallScore} big />
            <ScoreCard label="Experience" score={audit.experienceScore} />
            <ScoreCard label="Expertise" score={audit.expertiseScore} />
            <ScoreCard label="Authoritativeness" score={audit.authoritativenessScore} />
            <ScoreCard label="Trustworthiness" score={audit.trustworthinessScore} />
          </div>

          {Array.isArray(audit.findings) && audit.findings.length > 0 && (
            <div style={{ marginBottom: "20px" }}>
              <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: "10px" }}>Findings ({audit.findings.length})</div>
              <div className="card">
                {audit.findings.map((f, i) => (
                  <div key={i} className="data-row" style={{ gridTemplateColumns: "20px 1fr" }}>
                    <span style={{ fontSize: "14px" }}>
                      {f.status === "pass" ? "\u2705" : f.status === "warn" ? "\u26A0\uFE0F" : "\u274C"}
                    </span>
                    <div className="data-row-main">
                      <div className="data-row-title">
                        <span className="q-tag info" style={{ marginRight: "6px" }}>{f.category}</span>
                        {f.point}
                      </div>
                      {f.note && <div className="data-row-meta">{f.note}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {Array.isArray(audit.plan) && audit.plan.length > 0 && (
            <div style={{ marginBottom: "20px" }}>
              <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: "10px" }}>Plan de imbunatatire</div>
              <div className="table-wrap">
                <table className="tbl">
                  <thead><tr><th>Actiune</th><th style={{ width: 100 }}>Prioritate</th><th style={{ width: 200 }}>Impact estimat</th></tr></thead>
                  <tbody>
                    {audit.plan.slice((tblPage-1)*tblPerPage, tblPage*tblPerPage).map((p, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 600 }}>{p.action}</td>
                        <td>
                          <span className={`q-tag ${p.priority === "high" ? "critical" : p.priority === "med" ? "warn" : "info"}`}>
                            {p.priority}
                          </span>
                        </td>
                        <td style={{ color: "var(--ink-3)", fontSize: "12px" }}>{p.estimatedImpact}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            {audit.plan.length > tblPerPage && (
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
                  <span>{(tblPage-1)*tblPerPage+1}–{Math.min(tblPage*tblPerPage, audit.plan.length)} din {audit.plan.length}</span>
                  <button style={{padding:"4px 8px",border:"1px solid var(--line)",borderRadius:"6px",background:"var(--surface)",cursor:"pointer"}} disabled={tblPage <= 1} onClick={() => setTblPage(p => p-1)}>←</button>
                  <button style={{padding:"4px 8px",border:"1px solid var(--line)",borderRadius:"6px",background:"var(--surface)",cursor:"pointer"}} disabled={tblPage >= Math.ceil(audit.plan.length/tblPerPage)} onClick={() => setTblPage(p => p+1)}>→</button>
                </div>
              </div>
            )}
            </div>
          )}

          <p style={{ fontSize: "12px", color: "var(--ink-3)" }}>
            Audit rulat: {new Date(audit.runAt).toLocaleString("ro")}
          </p>
        </>
      )}
    </div>
  );
}

function ScoreCard({ label, score, big }) {
  return (
    <div className="metric">
      <div className="metric-label">{label}</div>
      <div className="metric-value" style={{ color: scoreColor(score) }}>
        {score}<span className="unit">/100</span>
      </div>
    </div>
  );
}
