// app/routes/app.schema-validator.jsx — Kimono SEO M23 Schema Validator
import { useLoaderData, useFetcher, Link } from "react-router";
import { useState } from "react";
import { requireAuth } from "../lib/auth/index.server.js";
import prisma from "../db.server.js";
import { validatePage, validateBatch, sampleStoreUrls } from "../lib/seo/schema-validator.server.js";

export const loader = async ({ request }) => {
  const { storeId } = await requireAuth(request);
  if (!storeId) return { storeId: null, rows: [], stats: {} };

  const [rows, totalValid, totalInvalid, totalChecked] = await Promise.all([
    prisma.seoSchemaValidation.findMany({
      where: { storeId },
      orderBy: [{ isValid: "asc" }, { lastCheckedAt: "desc" }],
      take: 200,
    }),
    prisma.seoSchemaValidation.count({ where: { storeId, isValid: true  } }),
    prisma.seoSchemaValidation.count({ where: { storeId, isValid: false } }),
    prisma.seoSchemaValidation.count({ where: { storeId } }),
  ]);

  return { storeId, rows, stats: { valid: totalValid, invalid: totalInvalid, total: totalChecked } };
};

export const action = async ({ request }) => {
  const { storeId } = await requireAuth(request);
  if (!storeId) return { error: "Niciun magazin conectat." };

  const formData = await request.formData();
  const intent   = formData.get("intent");

  try {
    if (intent === "validate_url") {
      const url = (formData.get("url") || "").toString().trim();
      if (!url) return { error: "URL lipsa." };
      const res = await validatePage(storeId, url);
      return { success: `Validat: ${res.schemas.length} schema(s) gasite pe ${url}` };
    }
    if (intent === "validate_sample") {
      const store = await prisma.store.findUnique({ where: { id: storeId }, select: { shopDomain: true } });
      const conn  = await prisma.storeConnection.findFirst({
        where: { shopDomain: store.shopDomain, isActive: true, platform: "SHOPIFY" },
        orderBy: { connectedAt: "desc" },
      });
      if (!conn?.accessToken) return { error: "Nu exista conexiune Shopify activa." };
      const urls = await sampleStoreUrls(storeId, store.shopDomain, conn.accessToken, 200);
      if (urls.length === 0) return { error: "Nu am gasit produse de validat." };
      const res = await validateBatch(storeId, urls, 3);
      const ok = res.filter(r => !r.error).length;
      return { success: `Validare batch: ${ok}/${res.length} URL-uri verificate.` };
    }
    return { error: "Intent necunoscut." };
  } catch (e) {
    return { error: e.message };
  }
};

export default function SchemaValidatorPage() {
  const { rows, stats, storeId } = useLoaderData();
  const fetcher = useFetcher();
  const busy = fetcher.state !== "idle";
  const data = fetcher.data;

  const [urlInput, setUrlInput] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);

  const pctValid = stats.total > 0 ? Math.round((stats.valid / stats.total) * 100) : 0;

  return (
    <div className="page active">
      <div className="page-head">
        <div>
          <h1 className="page-title">Schema Validator</h1>
          <p className="page-sub">Extrage blocurile JSON-LD din paginile tale si le valideaza impotriva cerintelor schema.org &amp; Google Rich Results.</p>
        </div>
        <div className="page-actions">
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="validate_sample" />
            <button className="btn btn-primary" disabled={busy}>{busy ? "Se valideaza..." : "Valideaza toate produsele"}</button>
          </fetcher.Form>
        </div>
      </div>

      {data?.error   && <div className="alert-banner warn">{data.error}</div>}
      {data?.success && <div className="alert-banner ok">{data.success}</div>}
      {!storeId      && <div className="alert-banner info">Conecteaza un magazin. <Link to="/connect-store">Connect Store</Link></div>}

      {/* Stats */}
      <div className="metric-grid">
        <div className="metric">
          <div className="metric-label">Total verificate</div>
          <div className="metric-value">{stats.total || 0}</div>
        </div>
        <div className="metric">
          <div className="metric-label">Valide</div>
          <div className="metric-value" style={{ color: "var(--accent)" }}>{stats.valid || 0}</div>
        </div>
        <div className="metric">
          <div className="metric-label">Cu erori</div>
          <div className="metric-value" style={{ color: "var(--danger)" }}>{stats.invalid || 0}</div>
        </div>
        <div className="metric">
          <div className="metric-label">% valide</div>
          <div className="metric-value" style={{ color: pctValid >= 80 ? "var(--accent)" : pctValid >= 50 ? "var(--warn)" : "var(--danger)" }}>{pctValid}%</div>
        </div>
      </div>

      {/* URL input */}
      <div className="card" style={{ marginBottom: 18, padding: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>Validare URL specific</div>
        <fetcher.Form method="post" style={{ display: "flex", gap: 8 }}>
          <input type="hidden" name="intent" value="validate_url" />
          <input
            name="url"
            type="url"
            value={urlInput}
            onChange={e => setUrlInput(e.target.value)}
            placeholder="https://magazin.ro/products/..."
            style={{ flex: 1, padding: "8px 12px", border: "1px solid var(--line)", borderRadius: "var(--r-sm)", fontSize: 13, fontFamily: "var(--sans)" }}
            required
          />
          <button className="btn btn-ghost" disabled={busy || !urlInput}>Valideaza</button>
        </fetcher.Form>
      </div>

      {rows.length === 0 && storeId && (
        <div className="card" style={{ textAlign: "center", padding: "48px 24px" }}>
          <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Nicio validare inca</h3>
          <p style={{ color: "var(--ink-3)", fontSize: 14 }}>Apasa "Valideaza toate produsele" pentru un scan complet.</p>
        </div>
      )}

      {rows.length > 0 && (
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 30 }}></th>
                <th>URL / Schema type</th>
                <th style={{ width: 100 }}>Status</th>
                <th className="right" style={{ width: 80 }}>Erori</th>
                <th className="right" style={{ width: 80 }}>Warnings</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice((page - 1) * perPage, page * perPage).map(row => {
                const isOpen = expandedId === row.id;
                const errors   = Array.isArray(row.errors)   ? row.errors   : [];
                const warnings = Array.isArray(row.warnings) ? row.warnings : [];
                return (
                  <>{/* Fragment for expandable rows */}
                    <tr key={row.id} onClick={() => setExpandedId(isOpen ? null : row.id)} style={{ cursor: "pointer" }}>
                      <td>
                        <span style={{ color: row.isValid ? "var(--accent)" : "var(--danger)", fontWeight: 700 }}>
                          {row.isValid ? "OK" : "X"}
                        </span>
                      </td>
                      <td>
                        <div style={{ fontSize: 12, fontWeight: 600, wordBreak: "break-all" }}>{shortenUrl(row.pageUrl)}</div>
                        <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>
                          <strong>{row.schemaType}</strong>
                          {Array.isArray(row.eligibleRichResults) && row.eligibleRichResults.length > 0 && (
                            <> &middot; eligibil: {row.eligibleRichResults.join(", ")}</>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className={`q-tag ${row.isValid ? "info" : "critical"}`}>
                          {row.isValid ? "VALID" : "INVALID"}
                        </span>
                      </td>
                      <td className="right" style={{ color: errors.length > 0 ? "var(--danger)" : "var(--ink-3)" }}>{errors.length}</td>
                      <td className="right" style={{ color: warnings.length > 0 ? "var(--warn)" : "var(--ink-3)" }}>{warnings.length}</td>
                    </tr>
                    {isOpen && (errors.length > 0 || warnings.length > 0) && (
                      <tr key={`${row.id}-details`}>
                        <td colSpan={5} style={{ background: "var(--surface-2)", padding: 16 }}>
                          {errors.map((e, i) => (
                            <div key={`e${i}`} style={{ display: "flex", gap: 8, padding: "4px 0", fontSize: 12 }}>
                              <span style={{ color: "var(--danger)", fontWeight: 700, flexShrink: 0 }}>ERR</span>
                              <code style={{ background: "var(--surface)", padding: "1px 6px", borderRadius: 3, border: "1px solid var(--line)" }}>{e.path}</code>
                              <span>{e.message}</span>
                            </div>
                          ))}
                          {warnings.map((w, i) => (
                            <div key={`w${i}`} style={{ display: "flex", gap: 8, padding: "4px 0", fontSize: 12 }}>
                              <span style={{ color: "var(--warn)", fontWeight: 700, flexShrink: 0 }}>WARN</span>
                              <code style={{ background: "var(--surface)", padding: "1px 6px", borderRadius: 3, border: "1px solid var(--line)" }}>{w.path}</code>
                              <span>{w.message}</span>
                            </div>
                          ))}
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
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
    </div>
  );
}

function shortenUrl(url) {
  try {
    const u = new URL(url);
    return u.pathname.length > 60 ? u.pathname.slice(0, 57) + "..." : u.hostname + u.pathname;
  } catch { return url.slice(0, 60); }
}
