// app/routes/app.entity-seo.jsx — Kimono SEO M14 Entity SEO
import { useLoaderData, useFetcher, Link } from "react-router";
import { useState } from "react";
import { requireAuth } from "../lib/auth/index.server.js";
import { runEntityAudit, applyEntityToTheme, getEntityAudit } from "../lib/seo/entity-seo.server.js";

export const loader = async ({ request }) => {
  const { storeId } = await requireAuth(request);
  if (!storeId) return { storeId: null, audit: null };
  const audit = await getEntityAudit(storeId);
  return { storeId, audit };
};

export const action = async ({ request }) => {
  const { storeId } = await requireAuth(request);
  if (!storeId) return { error: "Niciun magazin conectat." };

  const formData = await request.formData();
  const intent   = formData.get("intent");

  try {
    if (intent === "run_audit") {
      await runEntityAudit(storeId);
      return { success: "Audit complet. Entitatile au fost re-evaluate." };
    }
    if (intent === "apply") {
      await applyEntityToTheme(storeId);
      return { success: "Organization schema aplicat pe Shop (metafield openclaw.organization_schema)." };
    }
    return { error: "Intent necunoscut." };
  } catch (e) {
    return { error: e.message };
  }
};

export default function EntitySeoPage() {
  const { audit, storeId } = useLoaderData();
  const fetcher = useFetcher();
  const busy    = fetcher.state !== "idle";
  const data    = fetcher.data;

  const entities = audit?.entities || [];
  const issues   = audit?.issues   || [];
  const [tblPage, setTblPage] = useState(1);
  const [tblPerPage, setTblPerPage] = useState(25);

  return (
    <div className="page active">
      <div className="page-head">
        <div>
          <h1 className="page-title">Entity SEO &amp; Organization Schema</h1>
          <p className="page-sub">Identifica entitatile principale (branduri, categorii, persoane), evalueaza consistenta si aplica Organization JSON-LD cu sameAs catre profilele sociale.</p>
        </div>
        <div className="page-actions">
          {audit && (
            <fetcher.Form method="post">
              <input type="hidden" name="intent" value="run_audit" />
              <button className="btn btn-ghost" disabled={busy}>Re-ruleaza audit</button>
            </fetcher.Form>
          )}
          {audit?.organizationJson && !audit.appliedToTheme && (
            <fetcher.Form method="post">
              <input type="hidden" name="intent" value="apply" />
              <button className="btn btn-primary" disabled={busy}>Aplica pe magazin</button>
            </fetcher.Form>
          )}
        </div>
      </div>

      {data?.error   && <div className="alert-banner warn">{data.error}</div>}
      {data?.success && <div className="alert-banner ok">{data.success}</div>}
      {!storeId      && <div className="alert-banner warn">Conecteaza un magazin pentru a folosi Entity SEO. <Link to="/connect-store">Connect Store</Link></div>}

      {!audit && storeId && (
        <div className="card" style={{ textAlign: "center", padding: "48px 24px" }}>
          <div style={{ fontSize: "32px", marginBottom: "12px", color: "var(--ink-4)" }}>&#x1F578;</div>
          <h3 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "8px" }}>Niciun audit inca</h3>
          <p className="page-sub" style={{ marginBottom: "16px" }}>
            Ruleaza primul audit pentru a identifica entitatile magazinului tau. Analizam produse, articole si informatii despre shop.
          </p>
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="run_audit" />
            <button className="btn btn-primary" disabled={busy}>{busy ? "Se analizeaza..." : "Ruleaza primul audit"}</button>
          </fetcher.Form>
        </div>
      )}

      {audit && (
        <>
          {/* Score + status */}
          <div className="metric-grid">
            <div className="metric">
              <div className="metric-label">Consistency Score</div>
              <div className="metric-value" style={{ color: audit.consistencyScore >= 80 ? "var(--accent)" : audit.consistencyScore >= 50 ? "var(--warn)" : "var(--danger)" }}>
                {audit.consistencyScore}<span className="unit">/100</span>
              </div>
            </div>
            <div className="metric">
              <div className="metric-label">Entitati detectate</div>
              <div className="metric-value">{entities.length}</div>
            </div>
            <div className="metric">
              <div className="metric-label">Issue-uri</div>
              <div className="metric-value" style={{ color: issues.length > 0 ? "var(--warn)" : "var(--accent)" }}>{issues.length}</div>
            </div>
            <div className="metric">
              <div className="metric-label">Status aplicare</div>
              <div style={{ fontSize: "14px", fontWeight: 700, marginTop: "8px", color: audit.appliedToTheme ? "var(--accent)" : "var(--ink-3)" }}>
                {audit.appliedToTheme
                  ? <>&#x2705; Aplicat {new Date(audit.appliedAt).toLocaleDateString("ro")}</>
                  : "Nu e aplicat"}
              </div>
            </div>
          </div>

          {/* Entities table */}
          {entities.length > 0 && (
            <div style={{ marginBottom: "20px" }}>
              <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: "10px" }}>Entitati identificate</div>
              <div className="table-wrap">
                <table className="tbl">
                  <thead>
                    <tr><th>Entitate</th><th>Tip</th><th className="right">Frecventa</th><th>Surse</th></tr>
                  </thead>
                  <tbody>
                    {entities.slice((tblPage-1)*tblPerPage, tblPage*tblPerPage).map((e, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 600 }}>{e.name}</td>
                        <td><span className="q-tag info">{e.type}</span></td>
                        <td className="right mono">{e.frequency}</td>
                        <td style={{ fontSize: "12px", color: "var(--ink-3)" }}>{(e.sources || []).join(", ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {entities.length > tblPerPage && (
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
                    <span>{(tblPage-1)*tblPerPage+1}–{Math.min(tblPage*tblPerPage, entities.length)} din {entities.length}</span>
                    <button style={{padding:"4px 8px",border:"1px solid var(--line)",borderRadius:"6px",background:"var(--surface)",cursor:"pointer"}} disabled={tblPage <= 1} onClick={() => setTblPage(p => p-1)}>←</button>
                    <button style={{padding:"4px 8px",border:"1px solid var(--line)",borderRadius:"6px",background:"var(--surface)",cursor:"pointer"}} disabled={tblPage >= Math.ceil(entities.length/tblPerPage)} onClick={() => setTblPage(p => p+1)}>→</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Issues */}
          {issues.length > 0 && (
            <div style={{ marginBottom: "20px" }}>
              <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: "10px" }}>Inconsistente de rezolvat</div>
              <div className="card">
                {issues.map((issue, i) => (
                  <div key={i} className="data-row" style={{ gridTemplateColumns: "16px 1fr" }}>
                    <span style={{ color: "var(--warn)", fontSize: "14px" }}>{"\u26A0\uFE0F"}</span>
                    <div className="data-row-main">
                      <div className="data-row-title">{issue.entity} &mdash; {issue.issue}</div>
                      <div className="data-row-meta">{issue.recommendation}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Organization JSON-LD preview */}
          {audit.organizationJson && (
            <div style={{ marginBottom: "20px" }}>
              <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: "10px" }}>Organization JSON-LD generat</div>
              <div className="code-wrap">
                <pre>
                  {audit.organizationJson}
                </pre>
              </div>
              <p style={{ fontSize: "12px", color: "var(--ink-3)", marginTop: "8px" }}>
                La "Aplica pe magazin" se salveaza ca metafield <code>openclaw.organization_schema</code>. Pentru a-l afisa pe site, adauga in theme: <code>{`{{ shop.metafields.openclaw.organization_schema | json }}`}</code> intr-un <code>&lt;script type="application/ld+json"&gt;</code> in layout.
              </p>
            </div>
          )}

          <p style={{ fontSize: "12px", color: "var(--ink-3)" }}>
            Ultimul audit: {new Date(audit.lastAuditedAt).toLocaleString("ro")}
          </p>
        </>
      )}
    </div>
  );
}
