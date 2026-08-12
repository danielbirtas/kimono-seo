// app/routes/app.redirects.jsx
// Kimono SEO #05 — Redirect Manager

import { useEffect, useState } from "react";
import { useNavigate } from "react-router";

export default function RedirectManagerPage() {
  const navigate = useNavigate();
  const [suggestions, setSuggestions] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [msg, setMsg] = useState(null);
  const [activeTab, setActiveTab] = useState("pending");
  const [editingId, setEditingId] = useState(null);
  const [editPath, setEditPath] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);

  useEffect(() => { fetchData(); setPage(1); }, [activeTab]);

  async function fetchData() {
    setLoading(true);
    try {
      const r = await fetch(`/api/redirects?status=${activeTab}`);
      const d = await r.json();
      setSuggestions(d.suggestions || []);
      setStats(d.stats || {});
      setSelected(new Set());
    } catch {}
    setLoading(false);
  }

  async function scan() {
    setScanning(true);
    setMsg(null);
    try {
      const r = await fetch("/api/redirects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "scan" }),
      });
      const d = await r.json();
      if (d.success) {
        setMsg({ type: "ok", text: `Scan complete \u2014 ${d.total} broken URLs found, ${d.autoApplied} auto-applied (confidence \u2265 80%)` });
        await fetchData();
      } else {
        setMsg({ type: "err", text: d.error || "Scan failed" });
      }
    } catch (e) { setMsg({ type: "err", text: e.message }); }
    setScanning(false);
  }

  async function apply(id) {
    try {
      const r = await fetch("/api/redirects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "apply", suggestionId: id }),
      });
      const d = await r.json();
      if (d.success) {
        setSuggestions(prev => prev.filter(s => s.id !== id));
        setStats(prev => ({ ...prev, pending: (prev.pending || 1) - 1, applied: (prev.applied || 0) + 1 }));
        setMsg({ type: "ok", text: "Redirect applied in Shopify" });
      } else {
        setMsg({ type: "err", text: d.error });
      }
    } catch (e) { setMsg({ type: "err", text: e.message }); }
  }

  async function dismiss(id) {
    await fetch("/api/redirects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intent: "dismiss", suggestionId: id }),
    });
    setSuggestions(prev => prev.filter(s => s.id !== id));
    setStats(prev => ({ ...prev, pending: Math.max(0, (prev.pending || 1) - 1), dismissed: (prev.dismissed || 0) + 1 }));
  }

  async function applySelected() {
    const ids = [...selected];
    for (const id of ids) await apply(id);
    setSelected(new Set());
  }

  async function dismissSelected() {
    const ids = [...selected];
    await fetch("/api/redirects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intent: "dismiss_all", ids }),
    });
    setSuggestions(prev => prev.filter(s => !ids.includes(s.id)));
    setSelected(new Set());
  }

  async function applyAllHigh() {
    const r = await fetch("/api/redirects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intent: "apply_all", threshold: 80 }),
    });
    const d = await r.json();
    if (d.success) {
      setMsg({ type: "ok", text: `Applied ${d.applied} high-confidence redirects` });
      await fetchData();
    }
  }

  async function saveEdit(id) {
    await fetch("/api/redirects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intent: "update_destination", suggestionId: id, toPath: editPath }),
    });
    setSuggestions(prev => prev.map(s => s.id === id ? { ...s, toPath: editPath, confidence: 100 } : s));
    setEditingId(null);
  }

  function toggleSelect(id) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === suggestions.length) setSelected(new Set());
    else setSelected(new Set(suggestions.map(s => s.id)));
  }

  const confidenceColor = (n) => n >= 80 ? "var(--accent-ink)" : n >= 50 ? "var(--warn)" : "var(--danger)";

  return (
    <div className="page active">
      {/* Header */}
      <div className="page-head">
        <div>
          <h1 className="page-title">Redirect Manager</h1>
          <p className="page-sub">Detect 404 errors, get AI-suggested destinations, auto-apply high confidence redirects</p>
        </div>
        <div className="page-actions">
          <button onClick={scan} disabled={scanning} className={`btn ${scanning ? "btn-ghost" : "btn-primary"}`}
            style={{ opacity: scanning ? 0.7 : 1 }}>
            {scanning ? "Scanning..." : "Scan for 404s"}
          </button>
        </div>
      </div>

      {msg && (
        <div className={`alert-banner ${msg.type === "ok" ? "ok" : "warn"}`}>{msg.text}</div>
      )}

      {/* Stats */}
      <div className="metric-grid">
        {[
          { label: "Pending",              value: stats.pending || 0 },
          { label: "Applied",             value: stats.applied || 0 },
          { label: "Dismissed",           value: stats.dismissed || 0 },
          { label: "High Confidence (\u226580%)", value: stats.highConfidence || 0 },
        ].map(s => (
          <div key={s.label} className="metric">
            <div className="metric-label">{s.label}</div>
            <div className="metric-value">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      {activeTab === "pending" && (stats.highConfidence || 0) > 0 && (
        <div className="alert-banner info" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span><b>{stats.highConfidence} redirects</b> with confidence &ge; 80% ready to apply automatically</span>
          <button onClick={applyAllHigh} className="btn btn-primary">Apply All High Confidence</button>
        </div>
      )}

      {/* Tabs */}
      <div className="tabs-bar">
        {["pending", "applied", "dismissed", "all"].map(tab => (
          <button key={tab} className={`tab${activeTab === tab ? " active" : ""}`} onClick={() => setActiveTab(tab)}>
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
            {tab === "pending" && stats.pending > 0 && (
              <span className="tab-count">{stats.pending}</span>
            )}
          </button>
        ))}
      </div>

      {/* Bulk actions */}
      {selected.size > 0 && activeTab === "pending" && (
        <div className="alert-banner ok" style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <span style={{ fontWeight: "600" }}>{selected.size} selected</span>
          <button onClick={applySelected} className="btn btn-primary" style={{ fontSize: "12px", padding: "5px 10px" }}>Apply Selected</button>
          <button onClick={dismissSelected} className="btn btn-ghost" style={{ fontSize: "12px", padding: "5px 10px" }}>Dismiss Selected</button>
          <button onClick={() => setSelected(new Set())} className="btn btn-ghost" style={{ fontSize: "12px", padding: "5px 10px" }}>Clear</button>
        </div>
      )}

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    {activeTab === "pending" && (
                      <input type="checkbox" checked={selected.size === suggestions.length && suggestions.length > 0} onChange={toggleSelectAll} style={{ cursor: "pointer" }} />
                    )}
                    From (broken URL)
                  </div>
                </th>
                <th>To (destination)</th>
                <th className="center">Confidence</th>
                <th className="center">Clicks</th>
                <th className="center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan="5" style={{ textAlign: "center", padding: "40px", color: "var(--ink-3)" }}>Loading...</td></tr>
              )}

              {!loading && suggestions.length === 0 && (
                <tr><td colSpan="5" style={{ textAlign: "center", padding: "40px", color: "var(--ink-3)" }}>
                  {activeTab === "pending"
                    ? "No broken URLs detected. Run a scan to check for 404 errors."
                    : `No ${activeTab} redirects.`}
                </td></tr>
              )}

              {suggestions.slice((page - 1) * perPage, page * perPage).map(s => (
                <tr key={s.id} style={{ background: selected.has(s.id) ? "var(--accent-soft)" : "transparent" }}>
                  {/* From */}
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      {activeTab === "pending" && (
                        <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggleSelect(s.id)} style={{ cursor: "pointer", flexShrink: 0 }} />
                      )}
                      <div style={{ minWidth: 0 }}>
                        <div className="mono" style={{ fontSize: "12px", color: "var(--danger)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={s.fromPath}>
                          {s.fromPath}
                        </div>
                        <div style={{ fontSize: "11px", color: "var(--ink-4)", marginTop: "2px" }}>{s.reason}</div>
                      </div>
                    </div>
                  </td>

                  {/* To */}
                  <td>
                    {editingId === s.id ? (
                      <div style={{ display: "flex", gap: "4px" }}>
                        <input value={editPath} onChange={e => setEditPath(e.target.value)} onKeyDown={e => e.key === "Enter" && saveEdit(s.id)} autoFocus
                          style={{ border: "1px solid var(--line)", borderRadius: "5px", padding: "4px 8px", fontSize: "12px", fontFamily: "var(--mono)", width: "100%", outline: "none" }} />
                        <button onClick={() => saveEdit(s.id)} className="btn btn-primary" style={{ padding: "4px 8px", fontSize: "11px" }}>&check;</button>
                        <button onClick={() => setEditingId(null)} className="btn btn-ghost" style={{ padding: "4px 8px", fontSize: "11px" }}>&times;</button>
                      </div>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span className="mono" style={{ fontSize: "12px", color: "var(--accent-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={s.toPath}>
                          {s.toPath}
                        </span>
                        {activeTab === "pending" && (
                          <button onClick={() => { setEditingId(s.id); setEditPath(s.toPath); }} className="btn btn-ghost" style={{ padding: "2px 6px", fontSize: "10px" }}>Edit</button>
                        )}
                      </div>
                    )}
                  </td>

                  {/* Confidence */}
                  <td className="center mono" style={{ fontWeight: "700", color: confidenceColor(s.confidence) }}>{s.confidence}%</td>

                  {/* Clicks */}
                  <td className="center mono" style={{ color: "var(--ink-2)" }}>
                    {s.clicks > 0 ? <strong style={{ color: "var(--ink-0)" }}>{s.clicks}</strong> : "\u2014"}
                  </td>

                  {/* Actions */}
                  <td className="center">
                    <div style={{ display: "flex", gap: "4px", justifyContent: "center" }}>
                      {s.status === "pending" && (
                        <>
                          <button onClick={() => apply(s.id)} className="btn btn-primary" style={{ padding: "4px 8px", fontSize: "11px" }} title="Apply redirect">&check;</button>
                          <button onClick={() => dismiss(s.id)} className="btn btn-ghost" style={{ padding: "4px 8px", fontSize: "11px", color: "var(--danger)" }} title="Dismiss">&times;</button>
                        </>
                      )}
                      {s.status === "applied" && <span className="q-tag ok">Applied</span>}
                      {s.status === "dismissed" && <span className="q-tag">Dismissed</span>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {suggestions.length > perPage && (
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
            <span>{(page-1)*perPage+1}–{Math.min(page*perPage, suggestions.length)} din {suggestions.length}</span>
            <button style={{padding:"4px 8px",border:"1px solid var(--line)",borderRadius:"6px",background:"var(--surface)",cursor:"pointer"}} disabled={page <= 1} onClick={() => setPage(p => p-1)}>←</button>
            <button style={{padding:"4px 8px",border:"1px solid var(--line)",borderRadius:"6px",background:"var(--surface)",cursor:"pointer"}} disabled={page >= Math.ceil(suggestions.length/perPage)} onClick={() => setPage(p => p+1)}>→</button>
          </div>
        </div>
      )}

      {/* Info */}
      <div className="card" style={{ background: "var(--surface-2)", fontSize: "12px", color: "var(--ink-2)", lineHeight: "1.7" }}>
        <strong style={{ color: "var(--ink-0)" }}>How it works:</strong> Scans your GSC data and sitemap to find URLs returning 404. Claude suggests the best destination based on URL similarity. Redirects with confidence &ge; 80% are auto-applied. You can edit any destination before applying.
        <br />
        <strong style={{ color: "var(--ink-0)" }}>Sources:</strong> Google Search Console (real 404 data with click counts) + Shopify sitemap crawl as fallback.
      </div>
    </div>
  );
}
