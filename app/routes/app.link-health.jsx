// app/routes/app.link-health.jsx — Kimono SEO M05a 404 Detection
import { useLoaderData, useFetcher, Link } from "react-router";
import { useState } from "react";
import { requireAuth } from "../lib/auth/index.server.js";
import prisma from "../db.server.js";
import { crawl404s, markResolved, ignore404 } from "../lib/seo/crawl-404.server.js";

export const loader = async ({ request }) => {
  const { storeId } = await requireAuth(request);
  if (!storeId) return { storeId: null, rows: [], counts: {} };

  const [rows, open, redirected, ignored] = await Promise.all([
    prisma.seo404Detection.findMany({
      where:   { storeId },
      orderBy: [{ status: "asc" }, { occurrences: "desc" }],
      take:    100,
    }),
    prisma.seo404Detection.count({ where: { storeId, status: "open" } }),
    prisma.seo404Detection.count({ where: { storeId, status: "redirected" } }),
    prisma.seo404Detection.count({ where: { storeId, status: "ignored" } }),
  ]);

  return { storeId, rows, counts: { open, redirected, ignored } };
};

export const action = async ({ request }) => {
  const { storeId } = await requireAuth(request);
  if (!storeId) return { error: "Niciun magazin conectat." };
  const formData = await request.formData();
  const intent = formData.get("intent");
  try {
    if (intent === "crawl") {
      const res = await crawl404s(storeId);
      return { success: `Crawl complet: ${res.checked}/${res.totalCandidates} URL-uri verificate, ${res.broken} 404-uri gasite.` };
    }
    if (intent === "resolve") {
      await markResolved(storeId, formData.get("id"), formData.get("redirectTo"));
      return { success: "Marcat ca redirectionat." };
    }
    if (intent === "ignore") {
      await ignore404(storeId, formData.get("id"));
      return { success: "Ignorat." };
    }
    return { error: "Intent necunoscut." };
  } catch (e) { return { error: e.message }; }
};

export default function LinkHealthPage() {
  const { rows, counts, storeId } = useLoaderData();
  const fetcher = useFetcher();
  const busy = fetcher.state !== "idle";
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const data = fetcher.data;

  return (
    <div className="page active">
      <div className="page-head">
        <div>
          <h1 className="page-title">Detectare 404 &amp; Broken Links</h1>
          <p className="page-sub">Crawl-uim sitemap-ul complet + homepage, verificam status-code si logam 404-urile. Rezolva-le cu redirect sau ignora-le.</p>
        </div>
        <div className="page-actions">
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="crawl" />
            <button className="btn btn-primary" disabled={busy}>
              {busy ? "Se crawl-uieste..." : "Ruleaza crawl"}
            </button>
          </fetcher.Form>
        </div>
      </div>

      {data?.error   && <div className="alert-banner warn">{data.error}</div>}
      {data?.success && <div className="alert-banner ok">{data.success}</div>}
      {!storeId      && <div className="alert-banner info">Conecteaza un magazin. <Link to="/connect-store">Connect Store</Link></div>}

      <div className="metric-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        <div className="metric">
          <div className="metric-label">404-uri deschise</div>
          <div className="metric-value" style={{ color: "var(--danger)" }}>{counts.open || 0}</div>
        </div>
        <div className="metric">
          <div className="metric-label">Rezolvate</div>
          <div className="metric-value" style={{ color: "var(--accent)" }}>{counts.redirected || 0}</div>
        </div>
        <div className="metric">
          <div className="metric-label">Ignorate</div>
          <div className="metric-value" style={{ color: "var(--ink-3)" }}>{counts.ignored || 0}</div>
        </div>
      </div>

      {rows.length === 0 && storeId && (
        <div className="card" style={{ textAlign: "center", padding: "48px 24px" }}>
          <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Niciun 404 gasit</h3>
          <p style={{ color: "var(--ink-3)", fontSize: 14 }}>Apasa "Ruleaza crawl" pentru a verifica sitemap-ul.</p>
        </div>
      )}

      {rows.length > 0 && (
        <>
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr>
              <th>URL</th>
              <th className="center" style={{ width: 60 }}>Status</th>
              <th className="right" style={{ width: 60 }}>Ocur.</th>
              <th style={{ width: 110 }}>Ultima oara</th>
              <th className="right" style={{ width: 260 }}>Actiune</th>
            </tr></thead>
            <tbody>
              {rows.slice((page - 1) * perPage, page * perPage).map(row => (
                <tr key={row.id}>
                  <td style={{ wordBreak: "break-all", fontSize: 12 }}>
                    {row.url}
                    {row.redirectedTo && <div style={{ fontSize: 11, color: "var(--accent)", marginTop: 2 }}>&rarr; {row.redirectedTo}</div>}
                  </td>
                  <td className="center" style={{ fontWeight: 700, color: "var(--danger)" }}>{row.statusCode}</td>
                  <td className="right">{row.occurrences}</td>
                  <td style={{ fontSize: 12, color: "var(--ink-3)" }}>{new Date(row.lastSeenAt).toLocaleDateString("ro")}</td>
                  <td className="right">
                    {row.status === "open" && (
                      <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                        <fetcher.Form method="post" style={{ display: "flex", gap: 4 }}>
                          <input type="hidden" name="intent" value="resolve" />
                          <input type="hidden" name="id" value={row.id} />
                          <input name="redirectTo" type="url" placeholder="nou URL" style={{ width: 140, padding: "4px 6px", fontSize: 11, border: "1px solid var(--line)", borderRadius: "var(--r-sm)" }} />
                          <button className="btn btn-primary" style={{ fontSize: 11, padding: "4px 8px" }} disabled={busy}>OK</button>
                        </fetcher.Form>
                        <fetcher.Form method="post">
                          <input type="hidden" name="intent" value="ignore" />
                          <input type="hidden" name="id" value={row.id} />
                          <button className="btn btn-ghost" style={{ fontSize: 11, padding: "4px 8px" }} disabled={busy}>Ignora</button>
                        </fetcher.Form>
                      </div>
                    )}
                    {row.status === "redirected" && <span style={{ fontSize: 11, color: "var(--accent)", fontWeight: 700 }}>Rezolvat</span>}
                    {row.status === "ignored" && <span style={{ fontSize: 11, color: "var(--ink-3)", fontWeight: 700 }}>Ignorat</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      {rows.length > perPage && (
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 0",fontSize:"13px",color:"var(--ink-3)"}}>
          <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
            <span>Randuri per pagina:</span>
            <select value={perPage} onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }} style={{padding:"4px 8px",fontSize:"12px",borderRadius:"6px",border:"1px solid var(--line)"}}>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:"4px"}}>
            <span>{(page-1)*perPage+1}–{Math.min(page*perPage, rows.length)} din {rows.length}</span>
            <button style={{padding:"4px 8px",border:"1px solid var(--line)",borderRadius:"6px",background:"var(--surface)",cursor:"pointer"}} disabled={page <= 1} onClick={() => setPage(p => p-1)}>←</button>
            <button style={{padding:"4px 8px",border:"1px solid var(--line)",borderRadius:"6px",background:"var(--surface)",cursor:"pointer"}} disabled={page >= Math.ceil(rows.length/perPage)} onClick={() => setPage(p => p+1)}>→</button>
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
}
