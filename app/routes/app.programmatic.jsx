// app/routes/app.programmatic.jsx — Programmatic SEO UI
import { useLoaderData, useFetcher, useNavigate, useSearchParams } from "react-router";
import { useState } from "react";
import { requireAuth } from "../lib/auth/index.server.js";

export const loader = async ({ request }) => {
  const { storeId } = await requireAuth(request);
  if (!storeId) return { templates: [], rows: [], stats: null, activeTemplateId: null };

  const url = new URL(request.url);
  const activeTemplateId = url.searchParams.get("t");

  const lib = await import("../lib/seo/programmatic-seo.server.js");
  const templates = await lib.listTemplates(storeId);

  let rows = [];
  let stats = null;
  if (activeTemplateId) {
    rows  = await lib.listRows(activeTemplateId, { limit: 200 });
    stats = await lib.statsForTemplate(activeTemplateId);
  }

  return {
    templates: templates.map((t) => ({
      id: t.id, name: t.name, pattern: t.pattern, status: t.status,
      rows: t._count?.rows ?? 0, batches: t._count?.batches ?? 0,
    })),
    rows: rows.map((r) => ({
      id: r.id, title: r.title, url: r.url, targetKeyword: r.targetKeyword,
      searchVolume: r.searchVolume, kd: r.kd, productCount: r.productCount,
      cannibalFlag: r.cannibalFlag, qualityScore: r.qualityScore,
      status: r.status, publishedAt: r.publishedAt?.toISOString() ?? null,
      contentsWords: (r.contents || []).reduce((n, c) => n + (c.wordCount || 0), 0),
    })),
    stats,
    activeTemplateId,
  };
};

const PATTERNS = [
  { value: "BEST_X_FOR_Y",   label: "Cele mai bune [produs] pentru [utilizare]",  tokenFields: ["productType", "useCase"] },
  { value: "ATTRIBUTE_X",    label: "[Atribut] [produs]",                         tokenFields: ["attribute", "productType"] },
  { value: "X_VS_Y",         label: "[Produs A] vs [Produs B]",                   tokenFields: ["productA", "productB"] },
  { value: "X_UNDER_PRICE",  label: "[Produs] sub [pret] lei",                    tokenFields: ["productType", "priceLimit"] },
  { value: "GIFT_GUIDE",     label: "Cadouri pentru [persoana] de [ocazie]",      tokenFields: ["recipient", "occasion"] },
];

const STATUS_CLS = {
  DRAFT:     "",
  APPROVED:  "info",
  PUBLISHED: "ok",
  SKIPPED:   "warn",
  FAILED:    "critical",
};

export default function ProgrammaticSeo() {
  const { templates, rows, stats, activeTemplateId } = useLoaderData();
  const fetcher = useFetcher();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showNewTemplate, setShowNewTemplate] = useState(false);

  const activeTemplate = templates.find((t) => t.id === activeTemplateId);
  const busy = fetcher.state !== "idle";

  async function callApi(intent, payload = {}) {
    fetcher.submit(
      JSON.stringify({ intent, ...payload }),
      { method: "post", action: "/api/programmatic", encType: "application/json" }
    );
  }

  function selectTemplate(id) {
    const p = new URLSearchParams(searchParams);
    p.set("t", id);
    setSearchParams(p);
  }

  return (
    <div className="page active">
      <div className="page-head">
        <div>
          <h1 className="page-title">Pagini la scara pentru long-tail</h1>
          <p className="page-sub">
            Genereaza zeci de pagini template-based pe Shopify din catalogul tau, enriched cu DataForSEO si AI.
          </p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={() => setShowNewTemplate(!showNewTemplate)}>
            + Sablon nou
          </button>
        </div>
      </div>

      <div className="alert-banner info">
        <b>Cum functioneaza:</b> 1) Alegi un pattern si definesti dictionarele de token-uri.
        2) Sistemul face combinatii, aduce volum cautare din DataForSEO, match-uieste produse si AI genereaza intro + ghid + FAQ.
        3) Dupa quality check, publici batch pe Shopify ca Pages.
      </div>

      {showNewTemplate && <NewTemplateForm onCreate={(input) => { callApi("create_template", { input }); setShowNewTemplate(false); }} />}

      {fetcher.data?.error && <div className="alert-banner warn">Eroare: {fetcher.data.error}</div>}
      {fetcher.data?.success && fetcher.data?.created !== undefined && (
        <div className="alert-banner ok">Generat {fetcher.data.created} randuri (skip: {fetcher.data.skipped}).</div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 14, marginTop: 18 }}>
        <TemplateList templates={templates} activeId={activeTemplateId} onSelect={selectTemplate} />

        <div>
          {!activeTemplate ? (
            <div className="card" style={{ textAlign: "center", padding: "48px 24px" }}>
              <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Selecteaza sau creeaza un sablon</h3>
              <p style={{ fontSize: 13, color: "var(--ink-3)" }}>
                Fiecare sablon defineste pattern-ul si dictionarele de token-uri.
              </p>
            </div>
          ) : (
            <TemplateDetail
              template={activeTemplate}
              rows={rows}
              stats={stats}
              busy={busy}
              onAction={callApi}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function TemplateList({ templates, activeId, onSelect }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>Sabloane ({templates.length})</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {templates.length === 0 && (
          <div className="card" style={{ fontSize: 13, color: "var(--ink-3)", padding: 12 }}>
            Niciun sablon inca.
          </div>
        )}
        {templates.map((t) => (
          <div
            key={t.id}
            onClick={() => onSelect(t.id)}
            className="card"
            style={{
              cursor: "pointer",
              padding: 12,
              borderColor: t.id === activeId ? "var(--accent)" : undefined,
              borderWidth: t.id === activeId ? 2 : undefined,
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{t.name}</div>
            <div style={{ fontSize: 11, color: "var(--ink-3)", display: "flex", gap: 8, fontVariantNumeric: "tabular-nums" }}>
              <span>{t.pattern}</span>
              <span>&middot;</span>
              <span>{t.rows} randuri</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TemplateDetail({ template, rows, stats, busy, onAction }) {
  const [pgPage, setPgPage] = useState(1);
  const [pgPerPage, setPgPerPage] = useState(25);
  const approved  = rows.filter((r) => r.status === "APPROVED").length;

  return (
    <div>
      <div className="card" style={{ marginBottom: 14, padding: 16 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>{template.name}</h2>
            <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4, fontFamily: "var(--mono)" }}>
              Pattern: <strong>{template.pattern}</strong> &middot; {template.rows} randuri &middot; {template.batches} batch-uri
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn btn-ghost" disabled={busy} onClick={() => onAction("generate_rows", { templateId: template.id })}>Genereaza randuri</button>
            <button className="btn btn-ghost" disabled={busy} onClick={() => onAction("enrich_template", { templateId: template.id, limit: 50 })}>Enrich volum (50)</button>
            <button className="btn btn-primary" disabled={busy || approved === 0} onClick={async () => {
              const b = await fetch("/api/programmatic", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ intent: "create_batch", templateId: template.id, size: 50 }) }).then(r => r.json());
              if (b.success) onAction("run_batch", { batchId: b.batchId });
            }}>Publica batch ({approved})</button>
          </div>
        </div>
      </div>

      {stats && (
        <div className="snapshot" style={{ gridTemplateColumns: "repeat(6, 1fr)", marginBottom: 14 }}>
          {[
            { label: "Total", value: stats.total },
            { label: "Draft", value: stats.draft },
            { label: "Aprobate", value: stats.approved },
            { label: "Publicate", value: stats.published },
            { label: "Skipped", value: stats.skipped },
            { label: "Failed", value: stats.failed },
          ].map((s) => (
            <div key={s.label} className="kpi">
              <div className="kpi-label">{s.label}</div>
              <div className="kpi-value">{s.value}</div>
            </div>
          ))}
        </div>
      )}

      <div className="table-wrap">
        {rows.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--ink-3)" }}>
            Niciun rand. Defineste token-urile si apasa "Genereaza randuri".
          </div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Target keyword</th>
                <th className="right" style={{ width: 80 }}>Volum</th>
                <th className="right" style={{ width: 60 }}>KD</th>
                <th className="right" style={{ width: 90 }}>Produse</th>
                <th className="right" style={{ width: 80 }}>Cuvinte</th>
                <th className="right" style={{ width: 70 }}>Scor</th>
                <th style={{ width: 110 }}>Status</th>
                <th style={{ width: 170 }}>Actiuni</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice((pgPage - 1) * pgPerPage, pgPage * pgPerPage).map((r) => (
                <tr key={r.id}>
                  <td style={{ maxWidth: 260 }}>
                    <div className="kw">{r.targetKeyword}</div>
                    <div style={{ fontSize: 11, color: "var(--ink-3)", fontFamily: "var(--mono)" }}>{r.url}</div>
                    {r.cannibalFlag && (
                      <div style={{ fontSize: 11, color: "var(--danger)", marginTop: 3 }}>Cannibalization</div>
                    )}
                  </td>
                  <td className="right" style={{ color: r.searchVolume ? "var(--ink-0)" : "var(--ink-4)" }}>
                    {r.searchVolume ?? "--"}
                  </td>
                  <td className="right" style={{ color: "var(--ink-3)" }}>{r.kd ?? "--"}</td>
                  <td className="right">{r.productCount}</td>
                  <td className="right" style={{ color: "var(--ink-3)" }}>{r.contentsWords || "--"}</td>
                  <td className="right" style={{ fontWeight: 700, color: r.qualityScore >= 70 ? "var(--accent)" : r.qualityScore >= 50 ? "var(--warn)" : r.qualityScore ? "var(--danger)" : "var(--ink-4)" }}>
                    {r.qualityScore ?? "--"}
                  </td>
                  <td>
                    <span className={`q-tag ${STATUS_CLS[r.status] || ""}`}>{r.status}</span>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button className="btn btn-ghost" style={{ padding: "3px 8px", fontSize: 10 }} disabled={busy} onClick={() => onAction("generate_content", { rowId: r.id })}>AI</button>
                      <button className="btn btn-ghost" style={{ padding: "3px 8px", fontSize: 10 }} disabled={busy} onClick={() => onAction("quality_check", { rowId: r.id })}>QC</button>
                      <button className="btn btn-ghost" style={{ padding: "3px 8px", fontSize: 10 }} disabled={busy} onClick={() => onAction("check_cannibal", { rowId: r.id })}>Cann</button>
                      {r.status === "APPROVED" && (
                        <button className="btn btn-primary" style={{ padding: "3px 8px", fontSize: 10 }} disabled={busy} onClick={() => onAction("publish_row", { rowId: r.id })}>Publish</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {rows.length > pgPerPage && (
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 0",fontSize:"13px",color:"var(--ink-3)"}}>
          <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
            <span>Randuri per pagina:</span>
            <select value={pgPerPage} onChange={(e) => { setPgPerPage(Number(e.target.value)); setPgPage(1); }} style={{padding:"4px 8px",fontSize:"12px",borderRadius:"6px",border:"1px solid var(--line)"}}>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:"4px"}}>
            <span>{(pgPage-1)*pgPerPage+1}–{Math.min(pgPage*pgPerPage, rows.length)} din {rows.length}</span>
            <button style={{padding:"4px 8px",border:"1px solid var(--line)",borderRadius:"6px",background:"var(--surface)",cursor:"pointer"}} disabled={pgPage <= 1} onClick={() => setPgPage(p => p-1)}>←</button>
            <button style={{padding:"4px 8px",border:"1px solid var(--line)",borderRadius:"6px",background:"var(--surface)",cursor:"pointer"}} disabled={pgPage >= Math.ceil(rows.length/pgPerPage)} onClick={() => setPgPage(p => p+1)}>→</button>
          </div>
        </div>
      )}
    </div>
  );
}

function NewTemplateForm({ onCreate }) {
  const [pattern, setPattern] = useState("BEST_X_FOR_Y");
  const [name, setName] = useState("");
  const [tokens, setTokens] = useState({});
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState(null);

  const fields = PATTERNS.find((p) => p.value === pattern)?.tokenFields || [];

  async function autoFillFromCatalog() {
    setSuggesting(true);
    setSuggestError(null);
    try {
      const resp = await fetch("/api/programmatic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "suggest_tokens", pattern }),
      });
      const data = await resp.json();
      if (!data.success) throw new Error(data.error || "Eroare necunoscuta");
      const newTokens = { ...tokens };
      for (const f of fields) {
        if (Array.isArray(data.suggestions?.[f]) && data.suggestions[f].length) {
          newTokens[f] = data.suggestions[f].join(", ");
        }
      }
      setTokens(newTokens);
      if (data.suggestions?._error) setSuggestError(`Fallback folosit: ${data.suggestions._error}`);
    } catch (e) {
      setSuggestError(e.message);
    } finally {
      setSuggesting(false);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    const tokenDicts = {};
    for (const f of fields) {
      tokenDicts[f] = (tokens[f] || "").split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
    }
    onCreate({ pattern, name: name || undefined, tokenDicts });
  }

  return (
    <form onSubmit={handleSubmit} className="card" style={{ marginBottom: 18, padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Sablon nou</h3>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={suggesting}
          onClick={autoFillFromCatalog}
          style={{ fontSize: 12 }}
          title="Claude analizeaza catalogul tau si sugereaza valori relevante"
        >
          {suggesting ? "Analizez catalogul..." : "Auto-fill din catalog"}
        </button>
      </div>

      {suggestError && <div className="alert-banner warn" style={{ fontSize: 12 }}>Nu am putut sugera automat: {suggestError}</div>}

      <div style={{ marginBottom: 14 }}>
        <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--ink-2)", marginBottom: 6 }}>Pattern</label>
        <select style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--line)", borderRadius: "var(--r-sm)", fontSize: 13, fontFamily: "var(--sans)", background: "var(--surface)" }} value={pattern} onChange={(e) => { setPattern(e.target.value); setTokens({}); }}>
          {PATTERNS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--ink-2)", marginBottom: 6 }}>Nume sablon (optional)</label>
        <input style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--line)", borderRadius: "var(--r-sm)", fontSize: 13, fontFamily: "var(--sans)", boxSizing: "border-box" }} value={name} onChange={(e) => setName(e.target.value)} placeholder="Lasa gol pentru default" />
      </div>

      {fields.map((f) => (
        <div key={f} style={{ marginBottom: 14 }}>
          <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: 12, fontWeight: 500, color: "var(--ink-2)", marginBottom: 6 }}>
            <span>Valori pentru <code>{`{${f}}`}</code></span>
            {tokens[f] && (
              <span style={{ fontSize: 11, color: "var(--ink-4)", fontWeight: 400 }}>
                {tokens[f].split(/[,\n]/).filter((s) => s.trim()).length} valori
              </span>
            )}
          </label>
          <textarea
            style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--line)", borderRadius: "var(--r-sm)", fontSize: 13, fontFamily: "var(--mono)", minHeight: 80, resize: "vertical", boxSizing: "border-box" }}
            value={tokens[f] || ""}
            onChange={(e) => setTokens({ ...tokens, [f]: e.target.value })}
            placeholder={f === "productType" ? "rochii, pantofi, genti" : f === "useCase" ? "birou, nunta, plaja" : f === "attribute" ? "rosii, din piele, lungi" : f === "priceLimit" ? "50, 100, 200, 500" : f === "recipient" ? "ea, el, mama, copii" : f === "occasion" ? "Craciun, Paste, nunta" : ""}
          />
        </div>
      ))}

      <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 12, lineHeight: 1.5 }}>
        <strong>Total pagini generate:</strong>{" "}
        <span style={{ color: "var(--ink-0)", fontWeight: 700 }}>
          {fields.reduce((acc, f) => acc * Math.max(1, (tokens[f] || "").split(/[,\n]/).filter((s) => s.trim()).length), 1)}
        </span>
        {" "}(produs cartezian al token-urilor).
      </div>

      <button type="submit" className="btn btn-primary">+ Creeaza sablon</button>
    </form>
  );
}
