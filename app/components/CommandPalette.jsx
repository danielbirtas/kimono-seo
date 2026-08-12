// app/components/CommandPalette.jsx
// Cmd+K (Ctrl+K on Windows/Linux) global command palette. Indexes every
// module by label, category, description and synonyms — the single best fix
// for "I can't find feature X" in a 30+ module app per the Polaris guidance.
//
// Pattern: Polaris OptionList inside Modal in spirit; implemented with
// inline styles to stay consistent with the rest of the codebase. No
// dependency on @shopify/polaris-react at runtime.

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { MODULES, CATEGORIES } from "../lib/module-registry.js";

const MAX_RESULTS = 12;

// Score a module against the query: heavy weight on label prefix, then
// synonym hit, then substring in label, then substring in description.
// Returns 0 if no match.
function scoreMatch(m, q) {
  if (!q) return 1;
  const qn = q.toLowerCase().trim();
  if (!qn) return 1;

  const label = m.label.toLowerCase();
  if (label.startsWith(qn))        return 100;
  if (label.includes(qn))          return 60;
  for (const s of m.synonyms || []) {
    const sn = s.toLowerCase();
    if (sn.startsWith(qn)) return 80;
    if (sn.includes(qn))   return 40;
  }
  if ((m.description || "").toLowerCase().includes(qn)) return 20;
  // Loose token match — split query into words, every word must hit somewhere
  const hay = `${label} ${(m.synonyms || []).join(" ")} ${m.description || ""}`.toLowerCase();
  const words = qn.split(/\s+/).filter(Boolean);
  if (words.length > 1 && words.every(w => hay.includes(w))) return 25;
  return 0;
}

export default function CommandPalette() {
  const navigate = useNavigate();
  const [open, setOpen]       = useState(false);
  const [query, setQuery]     = useState("");
  const [cursor, setCursor]   = useState(0);
  const inputRef              = useRef(null);

  // Global Cmd+K / Ctrl+K listener.
  useEffect(() => {
    const onKey = (e) => {
      const cmdK = (e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K");
      if (cmdK) {
        e.preventDefault();
        setOpen(o => !o);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Auto-focus when opened and reset state when closed.
  useEffect(() => {
    if (open) {
      setQuery("");
      setCursor(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const results = useMemo(() => {
    const scored = MODULES
      .map(m => ({ m, s: scoreMatch(m, query) }))
      .filter(x => x.s > 0)
      .sort((a, b) => b.s - a.s || a.m.label.localeCompare(b.m.label))
      .slice(0, MAX_RESULTS);
    return scored.map(x => x.m);
  }, [query]);

  // Keep cursor in range when results change.
  useEffect(() => {
    if (cursor >= results.length) setCursor(Math.max(0, results.length - 1));
  }, [results.length, cursor]);

  const selectAt = (i) => {
    const m = results[i];
    if (!m) return;
    setOpen(false);
    navigate(m.href);
  };

  if (!open) return null;

  return (
    <div
      onClick={() => setOpen(false)}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(17, 24, 39, 0.55)",
        display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: "12vh",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(620px, 92vw)",
          background: "#fff",
          borderRadius: 12,
          boxShadow: "0 24px 60px rgba(0,0,0,0.25)",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "14px 16px", borderBottom: "1px solid #F3F4F6", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 16, color: "#9CA3AF" }}>⌘</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setCursor(0); }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setCursor(c => Math.min(results.length - 1, c + 1)); }
              if (e.key === "ArrowUp")   { e.preventDefault(); setCursor(c => Math.max(0, c - 1)); }
              if (e.key === "Enter")     { e.preventDefault(); selectAt(cursor); }
            }}
            placeholder="Caută modul, feature, sau scrie un keyword (ex: 'alt text', 'schema', 'reddit')…"
            style={{ flex: 1, border: "none", outline: "none", fontSize: 16, fontFamily: "inherit", color: "#111827" }}
          />
          <kbd style={{ fontSize: 10, padding: "2px 6px", background: "#F3F4F6", color: "#6B7280", borderRadius: 4, fontFamily: "monospace" }}>ESC</kbd>
        </div>

        <div style={{ maxHeight: "60vh", overflowY: "auto" }}>
          {results.length === 0 && (
            <div style={{ padding: 30, textAlign: "center", color: "#9CA3AF", fontSize: 13 }}>
              Niciun rezultat pentru „{query}". Încearcă alt termen sau sinonim.
            </div>
          )}
          {results.map((m, i) => {
            const active = i === cursor;
            const cat    = CATEGORIES.find(c => c.id === m.category);
            return (
              <button
                key={m.id}
                onMouseEnter={() => setCursor(i)}
                onClick={() => selectAt(i)}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  width: "100%", padding: "12px 16px",
                  background: active ? "#F3F4F6" : "transparent",
                  border: "none", borderBottom: "1px solid #F9FAFB",
                  cursor: "pointer", textAlign: "left", fontFamily: "inherit",
                }}
              >
                <span style={{ fontSize: 20, width: 24, textAlign: "center", flexShrink: 0 }}>{m.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 2 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{m.label}</span>
                    <span style={{ fontSize: 10, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: 0.5 }}>{cat?.label}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "#6B7280", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.description}</div>
                </div>
                {active && <span style={{ fontSize: 10, color: "#9CA3AF", fontFamily: "monospace" }}>↵</span>}
              </button>
            );
          })}
        </div>

        <div style={{ padding: "8px 14px", borderTop: "1px solid #F3F4F6", display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 10, color: "#9CA3AF", fontFamily: "monospace" }}>
          <span>↑ ↓ navighează · ↵ deschide · ESC închide</span>
          <span>{results.length} / {MODULES.length}</span>
        </div>
      </div>
    </div>
  );
}
