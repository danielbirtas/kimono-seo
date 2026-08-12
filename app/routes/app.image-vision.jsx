// app/routes/app.image-vision.jsx — Kimono SEO M03 Image Vision
import { useLoaderData, useFetcher, Link } from "react-router";
import { useState } from "react";
import { requireAuth } from "../lib/auth/index.server.js";
import prisma from "../db.server.js";
import {
  scanImagesWithoutAlt, generateAltText, generateAltTextBatch,
  applyAltText, applyAltTextBatch, rejectAlt,
} from "../lib/seo/image-vision.server.js";

export const loader = async ({ request }) => {
  const { storeId } = await requireAuth(request);
  if (!storeId) return { storeId: null, rows: [], counts: {} };

  const [rows, countPending, countApproved, countApplied, countErr] = await Promise.all([
    prisma.seoImageAlt.findMany({
      where: { storeId },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 500,
    }),
    prisma.seoImageAlt.count({ where: { storeId, status: "pending"  } }),
    prisma.seoImageAlt.count({ where: { storeId, status: "approved" } }),
    prisma.seoImageAlt.count({ where: { storeId, status: "applied"  } }),
    prisma.seoImageAlt.count({ where: { storeId, status: "error"    } }),
  ]);

  return { storeId, rows, counts: { pending: countPending, approved: countApproved, applied: countApplied, error: countErr } };
};

export const action = async ({ request }) => {
  const { storeId } = await requireAuth(request);
  if (!storeId) return { error: "Niciun magazin conectat." };

  const formData = await request.formData();
  const intent   = formData.get("intent");

  try {
    if (intent === "scan") {
      const limit = parseInt(formData.get("limit") || "20", 10);
      const res   = await scanImagesWithoutAlt(storeId, limit);
      return { success: `Scan complet: ${res.productsScanned} produse verificate, ${res.found} imagini fara alt text gasite.` };
    }
    if (intent === "generate_one") {
      const id = formData.get("id");
      await generateAltText(storeId, id);
      return { success: "Alt text generat." };
    }
    if (intent === "generate_batch") {
      const ids = (formData.get("ids") || "").toString().split(",").filter(Boolean);
      if (ids.length === 0) return { error: "Niciun ID selectat." };
      const res = await generateAltTextBatch(storeId, ids);
      return { success: `Generate batch: ${res.ok} OK, ${res.failed} esuate.` };
    }
    if (intent === "apply_one") {
      const id = formData.get("id");
      await applyAltText(storeId, id);
      return { success: "Alt text aplicat pe Shopify." };
    }
    if (intent === "apply_batch") {
      const ids = (formData.get("ids") || "").toString().split(",").filter(Boolean);
      if (ids.length === 0) return { error: "Niciun ID selectat." };
      const res = await applyAltTextBatch(storeId, ids);
      return { success: `Apply batch: ${res.ok} OK, ${res.failed} esuate.`, errors: res.errors };
    }
    if (intent === "reject_one") {
      const id = formData.get("id");
      await rejectAlt(storeId, id);
      return { success: "Respins." };
    }
    return { error: "Intent necunoscut." };
  } catch (e) {
    return { error: e.message };
  }
};

export default function ImageVisionPage() {
  const { rows, counts, storeId } = useLoaderData();
  const fetcher = useFetcher();
  const busy = fetcher.state !== "idle";
  const data = fetcher.data;

  const [selected, setSelected] = useState(new Set());
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);

  const toggleSelect = (id) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const selectAllPending = () => {
    setSelected(new Set(rows.filter(r => r.status === "pending").map(r => r.id)));
  };

  const selectedIds = [...selected].join(",");

  return (
    <div className="page active">
      <div className="page-head">
        <div>
          <h1 className="page-title">Alt Text AI pentru imagini</h1>
          <p className="page-sub">Claude Vision analizeaza imaginile produselor fara alt text si genereaza descrieri SEO optimizate. Aplicarea scrie direct pe Shopify.</p>
        </div>
        <div className="page-actions">
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="scan" />
            <input type="hidden" name="limit"  value="99999" />
            <button className="btn btn-ghost" disabled={busy}>Scaneaza toate produsele</button>
          </fetcher.Form>
        </div>
      </div>

      {data?.error   && <div className="alert-banner warn">{data.error}</div>}
      {data?.success && <div className="alert-banner ok">{data.success}</div>}
      {!storeId      && <div className="alert-banner info">Conecteaza un magazin. <Link to="/connect-store">Connect Store</Link></div>}

      <div className="metric-grid">
        <div className="metric">
          <div className="metric-label">Pending</div>
          <div className="metric-value" style={{ color: "var(--ink-3)" }}>{counts.pending || 0}</div>
        </div>
        <div className="metric">
          <div className="metric-label">Approved</div>
          <div className="metric-value" style={{ color: "var(--accent)" }}>{counts.approved || 0}</div>
        </div>
        <div className="metric">
          <div className="metric-label">Applied</div>
          <div className="metric-value" style={{ color: "var(--accent-ink)" }}>{counts.applied || 0}</div>
        </div>
        <div className="metric">
          <div className="metric-label">Error</div>
          <div className="metric-value" style={{ color: "var(--danger)" }}>{counts.error || 0}</div>
        </div>
      </div>

      {rows.length === 0 && storeId && (
        <div className="card" style={{ textAlign: "center", padding: "48px 24px" }}>
          <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Niciun produs scanat</h3>
          <p style={{ color: "var(--ink-3)", fontSize: 14 }}>Apasa "Scaneaza produse" pentru a gasi imagini fara alt text.</p>
        </div>
      )}

      {rows.length > 0 && (
        <>
          <div className="card" style={{ padding: "10px 16px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{selected.size} selectate</span>
            <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={selectAllPending}>Selecteaza toate pending</button>
            <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => setSelected(new Set())}>Deselecteaza</button>

            <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              <fetcher.Form method="post">
                <input type="hidden" name="intent" value="generate_batch" />
                <input type="hidden" name="ids" value={selectedIds} />
                <button className="btn btn-ghost" disabled={busy || selected.size === 0}>Genereaza pentru selectate</button>
              </fetcher.Form>
              <fetcher.Form method="post">
                <input type="hidden" name="intent" value="apply_batch" />
                <input type="hidden" name="ids" value={selectedIds} />
                <button className="btn btn-primary" disabled={busy || selected.size === 0}>Aplica selectate pe Shopify</button>
              </fetcher.Form>
            </div>
          </div>

          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: 30 }}></th>
                  <th style={{ width: 70 }}>Img</th>
                  <th>Produs / Alt sugerat</th>
                  <th style={{ width: 100 }}>Status</th>
                  <th className="right" style={{ width: 160 }}>Actiuni</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice((page - 1) * perPage, page * perPage).map(row => (
                  <tr key={row.id}>
                    <td><input type="checkbox" checked={selected.has(row.id)} onChange={() => toggleSelect(row.id)} /></td>
                    <td><img src={row.imageUrl} alt="" style={{ width: 50, height: 50, objectFit: "cover", borderRadius: "var(--r-sm)" }} /></td>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{row.productTitle}</div>
                      {row.suggestedAlt && <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>"{row.suggestedAlt}"</div>}
                      {row.errorMessage && <div style={{ fontSize: 11, color: "var(--danger)", marginTop: 2 }}>Eroare: {row.errorMessage}</div>}
                    </td>
                    <td><StatusBadge status={row.status} /></td>
                    <td className="right" style={{ whiteSpace: "nowrap" }}>
                      {row.status === "pending" && (
                        <fetcher.Form method="post" style={{ display: "inline" }}>
                          <input type="hidden" name="intent" value="generate_one" />
                          <input type="hidden" name="id" value={row.id} />
                          <button className="btn btn-ghost" style={{ fontSize: 11, padding: "4px 8px" }} disabled={busy}>Genereaza</button>
                        </fetcher.Form>
                      )}
                      {row.status === "approved" && (
                        <>
                          <fetcher.Form method="post" style={{ display: "inline", marginRight: 4 }}>
                            <input type="hidden" name="intent" value="apply_one" />
                            <input type="hidden" name="id" value={row.id} />
                            <button className="btn btn-primary" style={{ fontSize: 11, padding: "4px 8px" }} disabled={busy}>Aplica</button>
                          </fetcher.Form>
                          <fetcher.Form method="post" style={{ display: "inline" }}>
                            <input type="hidden" name="intent" value="reject_one" />
                            <input type="hidden" name="id" value={row.id} />
                            <button className="btn btn-ghost" style={{ fontSize: 11, padding: "4px 8px" }} disabled={busy}>Respinge</button>
                          </fetcher.Form>
                        </>
                      )}
                      {row.status === "error" && (
                        <fetcher.Form method="post" style={{ display: "inline" }}>
                          <input type="hidden" name="intent" value="generate_one" />
                          <input type="hidden" name="id" value={row.id} />
                          <button className="btn btn-ghost" style={{ fontSize: 11, padding: "4px 8px" }} disabled={busy}>Retry</button>
                        </fetcher.Form>
                      )}
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

function StatusBadge({ status }) {
  const map = {
    pending:  { label: "Pending",  cls: "" },
    approved: { label: "Generat",  cls: "info" },
    applied:  { label: "Aplicat",  cls: "ok" },
    rejected: { label: "Respins",  cls: "" },
    error:    { label: "Eroare",   cls: "warn" },
  };
  const s = map[status] || map.pending;
  return <span className={`q-tag ${s.cls}`}>{s.label}</span>;
}
