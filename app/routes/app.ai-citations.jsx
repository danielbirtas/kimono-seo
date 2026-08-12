// app/routes/app.ai-citations.jsx
// AI Citations / GEO tracking UI — Princeton 3-lever measurement system.
// Sends prompts to multiple LLMs × runs, aggregates citation share with CI.

import { useLoaderData, useFetcher } from "react-router";
import { useState } from "react";
import prisma from "../db.server.js";

export const loader = async ({ request }) => {
  const { requireAuth } = await import("../lib/auth/index.server.js");
  const { storeId } = await requireAuth(request);
  if (!storeId) return { storeId: null, brand: null, prompts: [], scans: [] };

  const [brand, prompts, scans] = await Promise.all([
    prisma.aiBrandConfig.findUnique({ where: { storeId } }),
    prisma.aiPrompt.findMany({
      where: { storeId, status: "active" },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.aiCitationScan.findMany({
      where: { storeId },
      orderBy: { startedAt: "desc" },
      take: 10,
    }),
  ]);

  return {
    storeId,
    brand: brand ? {
      ...brand,
      aliases: JSON.parse(brand.aliases || "[]"),
      domains: JSON.parse(brand.domains || "[]"),
      competitors: JSON.parse(brand.competitors || "[]"),
    } : null,
    prompts,
    scans: scans.map(s => ({ ...s, platforms: JSON.parse(s.platforms || "[]") })),
  };
};

export default function AiCitations() {
  const { brand, prompts, scans } = useLoaderData();
  const brandFetcher = useFetcher();
  const promptFetcher = useFetcher();
  const scanFetcher = useFetcher();

  const [brandForm, setBrandForm] = useState({
    brandName: brand?.brandName || "",
    aliases: (brand?.aliases || []).join(", "),
    domains: (brand?.domains || []).join(", "),
    competitors: (brand?.competitors || []).join(", "),
    scheduleFrequency: brand?.scheduleFrequency || "off",
    scheduleRunsPerPrompt: brand?.scheduleRunsPerPrompt || 3,
  });
  const [newPromptText, setNewPromptText] = useState("");

  function saveBrand() {
    brandFetcher.submit(
      JSON.stringify({
        intent: "save_brand",
        brandName: brandForm.brandName.trim(),
        aliases: brandForm.aliases.split(",").map(s => s.trim()).filter(Boolean),
        domains: brandForm.domains.split(",").map(s => s.trim()).filter(Boolean),
        competitors: brandForm.competitors.split(",").map(s => s.trim()).filter(Boolean),
        scheduleFrequency: brandForm.scheduleFrequency,
        scheduleRunsPerPrompt: parseInt(brandForm.scheduleRunsPerPrompt, 10) || 3,
      }),
      { method: "POST", action: "/api/ai-citations", encType: "application/json" }
    );
  }

  function generatePrompts(count = 25) {
    promptFetcher.submit(
      JSON.stringify({ intent: "generate_prompts", count }),
      { method: "POST", action: "/api/ai-citations", encType: "application/json" }
    );
  }

  function savePrompt() {
    if (!newPromptText.trim()) return;
    promptFetcher.submit(
      JSON.stringify({ intent: "save_prompt", text: newPromptText.trim() }),
      { method: "POST", action: "/api/ai-citations", encType: "application/json" }
    );
    setNewPromptText("");
  }

  function archivePrompt(id) {
    promptFetcher.submit(
      JSON.stringify({ intent: "archive_prompt", id }),
      { method: "POST", action: "/api/ai-citations", encType: "application/json" }
    );
  }

  function startScan() {
    scanFetcher.submit(
      JSON.stringify({ intent: "start_scan", platforms: ["claude", "chatgpt", "aio"], runsPerPrompt: 3 }),
      { method: "POST", action: "/api/ai-citations", encType: "application/json" }
    );
  }

  const brandSaving = brandFetcher.state !== "idle";
  const promptSaving = promptFetcher.state !== "idle";
  const scanStarting = scanFetcher.state !== "idle";

  return (
    <div className="page active">
      <div className="page-head">
        <div>
          <div className="eyebrow">AI Surfaces</div>
          <h1 className="page-title">Brand Citations Monitor</h1>
          <p className="page-sub">
            Trimite aceleași întrebări către mai mulți AI (ChatGPT, Claude, Google AI Overview) × runs și
            agregă cât de des e citat brandul tău. Single-run e nedefensabil; multi-run cu CI bootstrap arată
            realitatea.
          </p>
        </div>
      </div>

      {/* Brand Config */}
      <div className="card">
        <h2 className="page-title" style={{ fontSize: 18, marginBottom: 12 }}>Brand</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label>
            <div className="metric-label">Brand name *</div>
            <input
              type="text"
              value={brandForm.brandName}
              onChange={e => setBrandForm({ ...brandForm, brandName: e.target.value })}
              placeholder="ex: Vivimall"
              style={{ width: "100%", padding: 8, border: "2px solid #000" }}
            />
          </label>
          <label>
            <div className="metric-label">Aliases (comma-separated)</div>
            <input
              type="text"
              value={brandForm.aliases}
              onChange={e => setBrandForm({ ...brandForm, aliases: e.target.value })}
              placeholder="Vivi Mall, vivimall.ro"
              style={{ width: "100%", padding: 8, border: "2px solid #000" }}
            />
          </label>
          <label>
            <div className="metric-label">Owned domains</div>
            <input
              type="text"
              value={brandForm.domains}
              onChange={e => setBrandForm({ ...brandForm, domains: e.target.value })}
              placeholder="vivimall.ro, blog.vivimall.ro"
              style={{ width: "100%", padding: 8, border: "2px solid #000" }}
            />
          </label>
          <label>
            <div className="metric-label">Competitors (closed-pool SoV)</div>
            <input
              type="text"
              value={brandForm.competitors}
              onChange={e => setBrandForm({ ...brandForm, competitors: e.target.value })}
              placeholder="competitor1.ro, competitor2.ro"
              style={{ width: "100%", padding: 8, border: "2px solid #000" }}
            />
          </label>
          <label>
            <div className="metric-label">Auto-scan frequency</div>
            <select
              value={brandForm.scheduleFrequency}
              onChange={e => setBrandForm({ ...brandForm, scheduleFrequency: e.target.value })}
              style={{ width: "100%", padding: 8, border: "2px solid #000" }}
            >
              <option value="off">Off</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </label>
          <label>
            <div className="metric-label">Runs per prompt</div>
            <input
              type="number"
              min="1"
              max="10"
              value={brandForm.scheduleRunsPerPrompt}
              onChange={e => setBrandForm({ ...brandForm, scheduleRunsPerPrompt: e.target.value })}
              style={{ width: "100%", padding: 8, border: "2px solid #000" }}
            />
          </label>
        </div>
        <div style={{ marginTop: 12 }}>
          <button className="btn" onClick={saveBrand} disabled={brandSaving || !brandForm.brandName.trim()}>
            {brandSaving ? "Saving..." : "Save brand"}
          </button>
        </div>
      </div>

      {/* Prompts Library */}
      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 className="page-title" style={{ fontSize: 18 }}>Prompts ({prompts.length})</h2>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="btn"
              onClick={() => generatePrompts(25)}
              disabled={promptSaving || !brand?.brandName}
            >
              {promptSaving ? "Generating..." : "Generate 25 prompts (AI)"}
            </button>
          </div>
        </div>

        {!brand?.brandName ? (
          <div className="alert-banner warn" style={{ marginTop: 12 }}>
            Salvează brand-ul mai întâi ca să poți genera prompt-uri.
          </div>
        ) : null}

        <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
          <input
            type="text"
            value={newPromptText}
            onChange={e => setNewPromptText(e.target.value)}
            placeholder="Adaugă manual: ex: 'cel mai bun magazin online de mobilier in Romania'"
            style={{ flex: 1, padding: 8, border: "2px solid #000" }}
          />
          <button className="btn" onClick={savePrompt} disabled={promptSaving || !newPromptText.trim()}>
            Add
          </button>
        </div>

        <div style={{ marginTop: 12 }}>
          {prompts.length === 0 ? (
            <p className="page-sub">Niciun prompt încă. Generează 25 cu AI sau adaugă manual.</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #000" }}>
                  <th style={{ textAlign: "left", padding: 8 }}>Prompt</th>
                  <th style={{ textAlign: "left", padding: 8, width: 100 }}>Intent</th>
                  <th style={{ width: 80 }}></th>
                </tr>
              </thead>
              <tbody>
                {prompts.map(p => (
                  <tr key={p.id} style={{ borderBottom: "1px solid #ddd" }}>
                    <td style={{ padding: 8 }}>{p.text}</td>
                    <td style={{ padding: 8, fontSize: 13, color: "#666" }}>{p.intent || "—"}</td>
                    <td style={{ padding: 8 }}>
                      <button className="btn" onClick={() => archivePrompt(p.id)} disabled={promptSaving} style={{ fontSize: 12 }}>
                        Archive
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Scan History */}
      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 className="page-title" style={{ fontSize: 18 }}>Scan-uri recente</h2>
          <button
            className="btn"
            onClick={startScan}
            disabled={scanStarting || prompts.length === 0}
          >
            {scanStarting ? "Starting..." : "Start new scan"}
          </button>
        </div>

        <div style={{ marginTop: 12 }}>
          {scans.length === 0 ? (
            <p className="page-sub">Niciun scan încă. Adaugă prompt-uri și pornește primul scan.</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #000" }}>
                  <th style={{ textAlign: "left", padding: 8 }}>Started</th>
                  <th style={{ textAlign: "left", padding: 8 }}>Status</th>
                  <th style={{ textAlign: "left", padding: 8 }}>Platforms</th>
                  <th style={{ textAlign: "right", padding: 8 }}>Brand mentions</th>
                  <th style={{ textAlign: "right", padding: 8 }}>Citation rate</th>
                  <th style={{ textAlign: "right", padding: 8 }}>Cost</th>
                </tr>
              </thead>
              <tbody>
                {scans.map(s => (
                  <tr key={s.id} style={{ borderBottom: "1px solid #ddd" }}>
                    <td style={{ padding: 8 }}>{new Date(s.startedAt).toLocaleString("ro-RO")}</td>
                    <td style={{ padding: 8 }}>
                      <span className={s.status === "DONE" ? "metric-label" : "alert"}>
                        {s.status}
                      </span>
                    </td>
                    <td style={{ padding: 8 }}>{(s.platforms || []).join(", ")}</td>
                    <td style={{ padding: 8, textAlign: "right" }}>{s.brandMentions}</td>
                    <td style={{ padding: 8, textAlign: "right" }}>
                      {s.brandCitationRate != null ? `${(s.brandCitationRate * 100).toFixed(1)}%` : "—"}
                    </td>
                    <td style={{ padding: 8, textAlign: "right" }}>
                      ${(s.costCents / 100).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
