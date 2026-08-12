// app/routes/app.onpage.jsx v7 — modern SaaS design (template match)
import { useLoaderData, useFetcher, useRevalidator } from "react-router";
import { useState, useEffect, useRef, useCallback } from "react";
import prisma from "../db.server.js";
import { requireAuth } from "../lib/auth/index.server.js";

// ── helpers ──
const scoreColor = (s) => s >= 80 ? "#16a34a" : s >= 60 ? "#d97706" : "#dc2626";
const FIELD_LABELS = {
  "Meta Title": "SEO Title", "Meta Description": "SEO Description",
  "H1 / Title": "Product Title (H1)", "URL Handle": "URL Slug",
  "Alt Text": "Image Alt Text", "Images": "Images",
  "Open Graph": "Social (OG)", "Keyword Alignment": "Keyword Alignment",
};

function ScoreRing({ score }) {
  const r = 18, circ = 113.1;
  const color = scoreColor(score);
  const offset = circ * (1 - score / 100);
  return (
    <div style={{ position: "relative", width: "44px", height: "44px", flexShrink: 0 }}>
      <svg viewBox="0 0 42 42" style={{ width: "100%", height: "100%", transform: "rotate(-90deg)" }}>
        <circle cx="21" cy="21" r={r} strokeWidth="4" fill="none" stroke="#f0efee" />
        <circle cx="21" cy="21" r={r} strokeWidth="4" fill="none"
          stroke={color} strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset .5s" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: "600", color: "#0a0a0a", letterSpacing: "-.02em", fontVariantNumeric: "tabular-nums" }}>
        {score}
      </div>
    </div>
  );
}

// ── loader (unchanged) ──
export const loader = async ({ request }) => {
  const { getBrandSettings } = await import("../lib/seo/audit-processor.server.js");
  const { connection, storeId } = await requireAuth(request);
  if (!storeId || !connection) return { totalProducts: 0, auditedCount: 0, avgScore: 0, critCount: 0, warnCount: 0, goodCount: 0, brand: {}, audits: [], activeJob: null, hasProducts: false, hasAI: !!process.env.ANTHROPIC_API_KEY, storeId: null };
  const [totalProducts, auditedCount, activeJob] = await Promise.all([
    prisma.seoProduct.count({ where: { storeId } }),
    prisma.seoAudit.count({ where: { storeId } }),
    prisma.seoJob.findFirst({ where: { storeId, type: "AUDIT", status: { in: ["QUEUED", "RUNNING"] } }, orderBy: { queuedAt: "desc" } }),
  ]);
  const audits = await prisma.seoAudit.findMany({
    where: { storeId }, orderBy: { score: "asc" }, take: 200,
    select: { id: true, productId: true, productTitle: true, productHandle: true, score: true, metaTitleScore: true, metaDescScore: true, h1Score: true, handleScore: true, imageScore: true, ogScore: true, findings: true, suggestions: true, lastOptimizedAt: true, auditedAt: true },
  });
  const brand = await getBrandSettings(storeId);
  const scored = audits.filter((a) => a.auditedAt);
  const avgScore = scored.length > 0 ? Math.round(scored.reduce((s, a) => s + (a.score || 0), 0) / scored.length) : 0;
  return {
    totalProducts, auditedCount, avgScore,
    critCount: scored.filter((a) => (a.score || 0) < 60).length,
    warnCount: scored.filter((a) => (a.score || 0) >= 60 && (a.score || 0) < 80).length,
    goodCount: scored.filter((a) => (a.score || 0) >= 80).length,
    brand,
    audits: scored.map((a) => ({ ...a, findings: JSON.parse(a.findings || "[]"), suggestions: JSON.parse(a.suggestions || "{}") })),
    activeJob: activeJob ? { id: activeJob.id, status: activeJob.status, progressPct: activeJob.progressPct || 0, statusMessage: activeJob.statusMessage, processedItems: activeJob.processedItems || 0, totalItems: activeJob.totalItems || 0 } : null,
    hasProducts: totalProducts > 0,
    hasAI: !!process.env.ANTHROPIC_API_KEY,
    storeId,
  };
};

// ── action (unchanged) ──
export const action = async ({ request }) => {
  const { connection, storeId } = await requireAuth(request);
  const shopDomain = connection?.shopDomain || "";
  if (!storeId || !connection) return { success: false };
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "job_status") {
    const job = await prisma.seoJob.findFirst({ where: { storeId, type: "AUDIT", status: { in: ["QUEUED", "RUNNING"] } }, orderBy: { queuedAt: "desc" }, select: { id: true, status: true, totalItems: true, processedItems: true, progressPct: true, statusMessage: true } });
    return { success: true, job: job || null };
  }
  if (intent === "job_cancel") {
    await prisma.seoJob.updateMany({ where: { storeId, status: { in: ["QUEUED", "RUNNING"] } }, data: { status: "CANCELLED", finishedAt: new Date() } });
    return { success: true };
  }
  if (intent === "reset") {
    await prisma.seoAudit.deleteMany({ where: { storeId } });
    await prisma.seoJob.updateMany({ where: { storeId, status: { in: ["QUEUED", "RUNNING"] } }, data: { status: "CANCELLED", finishedAt: new Date() } });
    return { success: true };
  }
  if (intent === "audit") {
    await prisma.seoJob.updateMany({ where: { storeId, type: "AUDIT", status: { in: ["QUEUED", "RUNNING"] } }, data: { status: "CANCELLED", finishedAt: new Date() } });
    const job = await prisma.seoJob.create({ data: { storeId, type: "AUDIT", status: "QUEUED", statusMessage: "Audit started..." } });
    const { processAuditInBackground } = await import("../lib/seo/audit-processor.server.js");
    processAuditInBackground(job.id, storeId).then(() => console.log(`[Audit] ${job.id} done`)).catch((e) => { console.error("[Audit]", e.message); prisma.seoJob.update({ where: { id: job.id }, data: { status: "FAILED", errorMessage: e.message, finishedAt: new Date() } }).catch(() => {}); });
    return { success: true, jobId: job.id };
  }
  if (intent === "audit_single") {
    const productId = formData.get("productId");
    if (!productId || !connection?.accessToken) return { success: false };
    const platform = connection.platform || "SHOPIFY";
    const isWoo = platform === "WOOCOMMERCE";
    try {
      let details;
      if (isWoo) { const { fetchWooProductDetails } = await import("../lib/integrations/woocommerce/client.server.js"); details = await fetchWooProductDetails(shopDomain, connection.accessToken, [productId]); }
      else { const { fetchProductDetails } = await import("../lib/seo/audit-processor.server.js"); details = await fetchProductDetails(connection.accessToken, shopDomain, [productId]); }
      if (!details.length) return { success: false };
      const { auditProductInline, getBrandSettings: getBrand } = await import("../lib/seo/audit-processor.server.js");
      const brand = await getBrand(storeId);
      const result = await auditProductInline(process.env.ANTHROPIC_API_KEY, details[0], brand);
      await prisma.seoAudit.upsert({ where: { storeId_productId: { storeId, productId } }, update: { score: result.score, metaTitleScore: result.metaTitleScore, metaDescScore: result.metaDescScore, h1Score: result.h1Score, handleScore: result.handleScore, imageScore: result.imageScore, ogScore: result.ogScore, findings: JSON.stringify(result.findings), suggestions: JSON.stringify(result.suggestions), auditedAt: new Date() }, create: { storeId, productId, productTitle: details[0].title, productHandle: details[0].handle, score: result.score, metaTitleScore: result.metaTitleScore, metaDescScore: result.metaDescScore, h1Score: result.h1Score, handleScore: result.handleScore, imageScore: result.imageScore, ogScore: result.ogScore, findings: JSON.stringify(result.findings), suggestions: JSON.stringify(result.suggestions) } });
      return { success: true };
    } catch (e) { return { success: false }; }
  }
  if (intent === "generate_preview") {
    const productId = formData.get("productId");
    if (!productId || !connection?.accessToken) return { success: false, error: "No session" };
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return { success: false, error: "Anthropic key missing" };
    const isWoo = (connection.platform || "SHOPIFY") === "WOOCOMMERCE";
    try {
      let details;
      if (isWoo) { const { fetchWooProductDetails } = await import("../lib/integrations/woocommerce/client.server.js"); details = await fetchWooProductDetails(shopDomain, connection.accessToken, [productId]); }
      else { const { fetchProductDetails } = await import("../lib/seo/audit-processor.server.js"); details = await fetchProductDetails(connection.accessToken, shopDomain, [productId]); }
      if (!details.length) return { success: false, error: "Product not found" };
      const { generateOptimizedContent, getBrandSettings: getBrand } = await import("../lib/seo/audit-processor.server.js");
      const brand = await getBrand(storeId);
      const optimized = await generateOptimizedContent(apiKey, details[0], brand);
      return { success: true, preview: optimized, product: details[0] };
    } catch (e) {
      const msg = e.message?.includes("429") ? "Rate limit reached. Wait 30 seconds." : e.message || "Generation failed";
      return { success: false, error: msg };
    }
  }
  if (intent === "apply_product") {
    const productId = formData.get("productId");
    const productTitle = formData.get("productTitle");
    const metaTitle = formData.get("metaTitle");
    const metaDesc = formData.get("metaDesc");
    const altTexts = formData.get("altTexts");
    const newHandle = formData.get("newHandle");
    if (!connection?.accessToken) return { success: false, error: "No session" };
    const isWoo = (connection.platform || "SHOPIFY") === "WOOCOMMERCE";
    let details;
    if (isWoo) { const { fetchWooProductDetails } = await import("../lib/integrations/woocommerce/client.server.js"); details = await fetchWooProductDetails(shopDomain, connection.accessToken, [productId]); }
    else { const { fetchProductDetails: fetchShopify } = await import("../lib/seo/audit-processor.server.js"); details = await fetchShopify(connection.accessToken, shopDomain, [productId]); }
    if (!details.length) return { success: false, error: "Product not found" };
    const mutations = [];
    if (productTitle) mutations.push({ field: "product_title", value: productTitle });
    if (metaTitle) mutations.push({ field: "meta_title", value: metaTitle });
    if (metaDesc) mutations.push({ field: "meta_desc", value: metaDesc });
    if (altTexts) { try { mutations.push({ field: "alt_text", value: JSON.parse(altTexts) }); } catch (e) {} }
    if (mutations.length === 0) return { success: false, error: "No fields to apply" };
    try {
      if (isWoo) { const { applyWooSeo } = await import("../lib/integrations/woocommerce/client.server.js"); await applyWooSeo(shopDomain, connection.accessToken, details[0], mutations); if (newHandle && newHandle !== details[0].handle) await applyWooSeo(shopDomain, connection.accessToken, details[0], [{ field: "handle", value: newHandle }]); }
      else { const { applyToShopify, applyHandleToShopify } = await import("../lib/seo/audit-processor.server.js"); await applyToShopify(connection.accessToken, shopDomain, details[0], mutations); if (newHandle && newHandle !== details[0].handle) await applyHandleToShopify(connection.accessToken, shopDomain, details[0], newHandle); }
      await prisma.seoAudit.updateMany({ where: { storeId, productId }, data: { lastOptimizedAt: new Date(), optimizedFields: JSON.stringify(mutations.map((m) => m.field)) } });
      return { success: true, applied: mutations.length };
    } catch (e) { return { success: false, error: e.message }; }
  }
  if (intent === "save_brand") {
    const brandName = formData.get("brandName") || "";
    const separator = formData.get("separator") || "|";
    const brandInMeta = formData.get("brandInMeta") !== "false";
    await Promise.all([
      prisma.seoSetting.upsert({ where: { storeId_key: { storeId, key: "brand_name" } }, update: { value: brandName }, create: { storeId, key: "brand_name", value: brandName } }),
      prisma.seoSetting.upsert({ where: { storeId_key: { storeId, key: "brand_separator" } }, update: { value: separator }, create: { storeId, key: "brand_separator", value: separator } }),
      prisma.seoSetting.upsert({ where: { storeId_key: { storeId, key: "brand_in_meta" } }, update: { value: String(brandInMeta) }, create: { storeId, key: "brand_in_meta", value: String(brandInMeta) } }),
    ]);
    return { success: true, saved: true };
  }
  return { success: false };
};

// ── CSS tokens matching template ──
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&family=Geist+Mono:wght@400;500;600&display=swap');
  @keyframes kspin{to{transform:rotate(360deg)}}
  @keyframes pageIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
  @keyframes ping{0%{transform:scale(1);opacity:.4}100%{transform:scale(2.2);opacity:0}}
  .op-wrap{font-family:'Geist',-apple-system,BlinkMacSystemFont,system-ui,sans-serif;font-size:14px;color:#262626;letter-spacing:-.005em;-webkit-font-smoothing:antialiased}
  .op-page-head{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;margin-bottom:24px;flex-wrap:wrap}
  .op-kicker{display:flex;align-items:center;gap:8px;font-size:13px;color:#737373;font-weight:500;margin-bottom:6px}
  .op-live-dot{width:6px;height:6px;border-radius:50%;background:#16a34a;position:relative;flex-shrink:0}
  .op-live-dot::before{content:"";position:absolute;inset:-3px;border-radius:50%;background:#16a34a;opacity:.25;animation:ping 1.8s cubic-bezier(0,0,.2,1) infinite}
  .op-h1{font-size:26px;font-weight:500;color:#0a0a0a;letter-spacing:-.026em;line-height:1.2}
  .op-h1 em{font-family:'Georgia',serif;font-style:italic;font-weight:400;color:#262626}
  .op-sub{margin-top:4px;font-size:13.5px;color:#737373}
  .op-actions{display:flex;gap:8px;align-items:center;flex-shrink:0}
  .op-btn{display:inline-flex;align-items:center;gap:6px;padding:8px 13px;border-radius:6px;font-size:13px;font-weight:500;cursor:pointer;transition:all .12s;border:1px solid transparent;font-family:inherit;letter-spacing:-.005em;white-space:nowrap}
  .op-btn svg{width:14px;height:14px;stroke-width:2}
  .op-btn-ghost{background:#fff;color:#262626;border-color:#e7e5e4}
  .op-btn-ghost:hover{background:#f5f5f4;border-color:#d6d3d1}
  .op-btn-ghost:disabled{opacity:.4;cursor:not-allowed}
  .op-btn-primary{background:#0a0a0a;color:#fff}
  .op-btn-primary:hover:not(:disabled){background:#262626}
  .op-btn-primary:disabled{opacity:.4;cursor:not-allowed}
  .op-btn-danger{background:#fff;color:#dc2626;border-color:#fecaca}
  .op-btn-danger:hover{background:#fee2e2}
  .op-kpi-row{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px}
  .op-kpi{background:#fff;border:1px solid #e7e5e4;border-radius:10px;padding:14px 16px;cursor:pointer;transition:border-color .15s;min-height:100px;display:flex;flex-direction:column}
  .op-kpi:hover{border-color:#d6d3d1}
  .op-kpi-label{font-size:12px;color:#737373;font-weight:500;margin-bottom:10px;display:flex;align-items:center;gap:5px}
  .op-kpi-value{font-size:24px;font-weight:500;color:#0a0a0a;letter-spacing:-.025em;line-height:1;font-variant-numeric:tabular-nums}
  .op-kpi-foot{display:flex;align-items:center;gap:6px;margin-top:auto;padding-top:10px;font-size:12px;flex-wrap:wrap}
  .op-delta{display:inline-flex;align-items:center;gap:2px;padding:1.5px 6px;border-radius:4px;font-weight:600;font-size:11px;font-variant-numeric:tabular-nums}
  .op-delta-red{color:#dc2626;background:#fee2e2}
  .op-delta-amber{color:#d97706;background:#fef3c7}
  .op-delta-green{color:#166534;background:#dcfce7}
  .op-kpi-sub{color:#737373;font-size:11.5px}
  .op-warn-bar{padding:12px 16px;border-radius:8px;font-size:13px;font-weight:500;margin-bottom:16px;border:1px solid}
  .op-warn-amber{background:#fef3c7;color:#92400e;border-color:#fde68a}
  .op-warn-red{background:#fee2e2;color:#991b1b;border-color:#fecaca}
  .op-warn-green{background:#dcfce7;color:#166534;border-color:#bbf7d0}
  .op-brand-panel{background:#fff;border:1px solid #e7e5e4;border-radius:10px;padding:16px 20px;margin-bottom:16px}
  .op-brand-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}
  .op-brand-title{font-size:13px;font-weight:600;color:#0a0a0a}
  .op-close{background:none;border:none;cursor:pointer;font-size:18px;color:#a3a3a3;padding:0;line-height:1;transition:color .12s}
  .op-close:hover{color:#0a0a0a}
  .op-field-label{font-size:11.5px;font-weight:500;color:#737373;margin-bottom:4px}
  .op-input{width:100%;padding:7px 10px;background:#fff;border:1px solid #e7e5e4;border-radius:6px;font-size:13px;font-family:inherit;color:#0a0a0a;outline:none;transition:border-color .12s}
  .op-input:focus{border-color:#0a0a0a}
  .op-select{padding:7px 10px;background:#fff;border:1px solid #e7e5e4;border-radius:6px;font-size:13px;font-family:inherit;color:#0a0a0a;outline:none;cursor:pointer}
  .op-job-banner{background:#0a0a0a;border-radius:10px;padding:14px 18px;margin-bottom:16px;display:flex;align-items:center;gap:14px}
  .op-tabs-bar{display:flex;align-items:center;gap:2px;margin-bottom:18px;border-bottom:1px solid #e7e5e4;overflow-x:auto}
  .op-tab{padding:9px 14px;font-size:13px;font-weight:500;color:#737373;cursor:pointer;border:none;background:transparent;transition:all .12s;font-family:inherit;letter-spacing:-.005em;position:relative;display:inline-flex;align-items:center;gap:7px;white-space:nowrap}
  .op-tab:hover{color:#262626}
  .op-tab.active{color:#0a0a0a;font-weight:600}
  .op-tab.active::after{content:"";position:absolute;left:10px;right:10px;bottom:-1px;height:2px;background:#0a0a0a;border-radius:2px}
  .op-tab-count{font-size:10.5px;font-weight:600;padding:1px 6px;border-radius:10px;background:#f5f5f4;color:#737373;font-variant-numeric:tabular-nums}
  .op-tab.active .op-tab-count{background:#0a0a0a;color:#fff}
  .op-toolbar{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:14px;flex-wrap:wrap}
  .op-toolbar-left{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .op-search{display:flex;align-items:center;gap:7px;padding:7px 11px;border-radius:6px;background:#fff;border:1px solid #e7e5e4;font-size:12.5px;color:#262626;transition:all .12s;min-width:200px}
  .op-search:focus-within{border-color:#737373}
  .op-search svg{color:#a3a3a3;width:13px;height:13px;flex-shrink:0}
  .op-search input{border:none;outline:none;background:transparent;flex:1;font-family:inherit;font-size:12.5px;color:#262626;letter-spacing:-.005em}
  .op-search input::placeholder{color:#a3a3a3}
  .op-chips{display:flex;align-items:center;gap:5px;flex-wrap:wrap}
  .op-chip{font-size:11.5px;font-weight:500;padding:5px 10px;border-radius:6px;background:#fff;color:#525252;border:1px solid #e7e5e4;cursor:pointer;transition:all .12s;display:inline-flex;align-items:center;gap:5px;font-family:inherit;letter-spacing:-.005em}
  .op-chip:hover{background:#f5f5f4;border-color:#d6d3d1;color:#0a0a0a}
  .op-chip.active{background:#0a0a0a;color:#fff;border-color:#0a0a0a}
  .op-chip-ct{font-family:'Geist Mono',monospace;font-size:10px;color:#a3a3a3;letter-spacing:-.01em}
  .op-chip.active .op-chip-ct{color:rgba(255,255,255,.55)}
  .op-empty{background:#fff;border:1px solid #e7e5e4;border-radius:10px;text-align:center;padding:56px 32px}
  .op-row{background:#fff;border:1px solid #e7e5e4;border-radius:10px;margin-bottom:8px;overflow:hidden;transition:border-color .15s}
  .op-row.expanded{border-color:#d6d3d1;box-shadow:0 2px 8px rgba(15,15,15,.06)}
  .op-row-head{display:flex;align-items:center;gap:16px;padding:14px 18px;cursor:pointer;user-select:none}
  .op-row-head:hover{background:#fafaf9}
  .op-row.expanded .op-row-head{background:#fafaf9}
  .op-row-info{flex:1;min-width:0}
  .op-row-title{font-size:13.5px;font-weight:600;color:#0a0a0a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;letter-spacing:-.01em}
  .op-row-url{font-family:'Geist Mono',monospace;font-size:11px;color:#737373;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .op-row-tags{display:flex;gap:5px;margin-top:6px;flex-wrap:wrap}
  .op-tag{font-size:10px;font-weight:600;padding:2px 7px;border-radius:4px;letter-spacing:.02em;text-transform:uppercase;display:inline-flex;align-items:center;gap:3px}
  .op-tag-err{background:#fee2e2;color:#dc2626}
  .op-tag-warn{background:#fef3c7;color:#d97706}
  .op-tag-ok{background:#dcfce7;color:#166534}
  .op-tag-info{background:#dbeafe;color:#1d4ed8}
  .op-subscores{display:flex;gap:18px;flex-shrink:0}
  .op-subscore{text-align:center}
  .op-subscore-val{font-size:14px;font-weight:600;line-height:1;font-variant-numeric:tabular-nums}
  .op-subscore-lbl{font-size:9px;color:#a3a3a3;text-transform:uppercase;letter-spacing:.08em;margin-top:2px;font-weight:500}
  .op-chev{color:#a3a3a3;font-size:10px;flex-shrink:0;transition:transform .15s}
  .op-chev.open{transform:rotate(180deg)}
  .op-body{border-top:1px solid #f0efee;animation:pageIn .2s ease}
  .op-issues-section{padding:14px 18px}
  .op-issues-title{font-size:11px;font-weight:600;color:#a3a3a3;text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px}
  .op-issue{display:flex;align-items:center;gap:8px;padding:7px 12px;border-radius:6px;margin-bottom:4px;font-size:12.5px}
  .op-issue-err{background:#fff8f8;color:#262626}
  .op-issue-warn{background:#fffdf5;color:#262626}
  .op-issue-ok{background:#f8fff9;color:#262626}
  .op-issue svg{width:12px;height:12px;flex-shrink:0;stroke-width:2.5}
  .op-issue-err svg{color:#dc2626}
  .op-issue-warn svg{color:#d97706}
  .op-issue-ok svg{color:#16a34a}
  .op-preview-section{border-top:1px solid #f0efee;padding:16px 18px}
  .op-preview-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
  .op-preview-label{font-size:11px;font-weight:600;color:#737373;text-transform:uppercase;letter-spacing:.06em;display:flex;align-items:center;gap:6px}
  .op-preview-label::before{content:"";width:6px;height:6px;border-radius:50%;background:#16a34a}
  .op-field-block{margin-bottom:16px}
  .op-field-head{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px}
  .op-field-name{font-size:11.5px;font-weight:600;color:#525252;text-transform:uppercase;letter-spacing:.04em}
  .op-field-count{font-family:'Geist Mono',monospace;font-size:11px;font-weight:600}
  .op-textarea{width:100%;padding:9px 12px;background:#fff;border:1px solid #e7e5e4;border-radius:6px;font-size:13px;font-family:inherit;color:#0a0a0a;outline:none;resize:none;line-height:1.55;transition:border-color .12s}
  .op-textarea:focus{border-color:#737373}
  .op-textarea.teal{background:#f0fdf4;border-color:#bbf7d0}
  .op-bar{height:3px;background:#f0efee;border-radius:2px;overflow:hidden;margin-top:5px}
  .op-bar-fill{height:100%;border-radius:2px;transition:width .2s}
  .op-hint{font-size:11px;color:#a3a3a3;margin-top:3px;font-weight:500}
  .op-alt-item{display:flex;align-items:center;gap:10px;padding:7px 10px;background:#fafaf9;border:1px solid #f0efee;border-radius:6px;margin-bottom:4px;font-size:12.5px;color:#262626}
  .op-alt-num{width:20px;height:20px;border-radius:4px;background:#e7e5e4;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:600;color:#525252;flex-shrink:0}
  .op-slug-box{padding:12px 14px;background:#fffdf5;border:1px solid #fde68a;border-radius:6px;margin-bottom:16px}
  .op-slug-label{font-size:10px;font-weight:600;color:#92400e;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px}
  .op-slug-codes{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .op-slug-old{font-family:'Geist Mono',monospace;font-size:12px;color:#a3a3a3;text-decoration:line-through;background:#f5f5f4;padding:3px 8px;border-radius:4px}
  .op-slug-new{font-family:'Geist Mono',monospace;font-size:12px;color:#166534;font-weight:600;background:#dcfce7;padding:3px 8px;border-radius:4px}
  .op-apply-row{display:flex;gap:8px;align-items:center;padding-top:4px}
  .op-optimize-bar{padding:12px 18px;border-top:1px solid #f0efee;background:#fafaf9;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .op-optimize-label{font-size:11px;font-weight:600;color:#a3a3a3;text-transform:uppercase;letter-spacing:.06em;white-space:nowrap}
  .op-field-chip{font-size:11.5px;font-weight:500;padding:4px 10px;border-radius:5px;background:#fff;color:#525252;border:1px solid #e7e5e4;cursor:pointer;transition:all .12s;font-family:inherit;letter-spacing:-.005em}
  .op-field-chip:hover{background:#f5f5f4;color:#0a0a0a}
  .op-field-chip.on{background:#0a0a0a;color:#fff;border-color:#0a0a0a}
  .op-pager{display:flex;align-items:center;justify-content:space-between;padding:14px 0;font-size:12.5px;color:#737373}
  .op-apply-confirm{padding:14px 18px;background:#f0fdf4;border-bottom:1px solid #bbf7d0;animation:pageIn .2s ease}
  .op-apply-confirm-head{display:flex;align-items:center;gap:8px;margin-bottom:10px}
  .op-check-circle{width:20px;height:20px;border-radius:50%;background:#16a34a;display:flex;align-items:center;justify-content:center;flex-shrink:0}
  .op-check-circle svg{width:11px;height:11px;stroke:#fff;stroke-width:3}
  .op-applied-field{margin-bottom:6px}
  .op-applied-field-name{font-size:10px;font-weight:600;color:#166534;text-transform:uppercase;letter-spacing:.06em;margin-bottom:3px}
  .op-applied-field-val{font-size:13px;font-weight:500;color:#0a0a0a;background:#fff;padding:6px 10px;border-radius:5px;border:1px solid #bbf7d0}
  .op-schema-card{background:#fff;border:1px solid #e7e5e4;border-radius:10px;overflow:hidden;margin-bottom:14px}
  .op-schema-head{padding:12px 16px;border-bottom:1px solid #e7e5e4;display:flex;justify-content:space-between;align-items:center}
  .op-schema-title{font-size:13px;font-weight:600;color:#0a0a0a}
  .op-schema-row{display:grid;grid-template-columns:1fr 60px 90px 70px;gap:8px;padding:10px 16px;border-bottom:1px solid #f0efee;align-items:center;font-size:12.5px}
  .op-schema-row:last-child{border-bottom:none}
  .op-schema-row:hover{background:#fafaf9}
  .op-schema-thead{background:#f5f5f4;font-size:11px;font-weight:600;color:#737373;text-transform:uppercase;letter-spacing:.04em;padding:8px 16px;border-bottom:1px solid #e7e5e4;display:grid;grid-template-columns:1fr 60px 90px 70px;gap:8px}
  .op-pill{display:inline-flex;align-items:center;padding:2px 8px;border-radius:10px;font-size:10.5px;font-weight:600;letter-spacing:.01em}
  .op-pill-ok{background:#dcfce7;color:#166534}
  .op-pill-warn{background:#fef3c7;color:#d97706}
  .op-row-action{background:transparent;border:1px solid #e7e5e4;padding:4px 10px;border-radius:5px;font-size:11.5px;font-weight:500;color:#262626;cursor:pointer;transition:all .12s;font-family:inherit;letter-spacing:-.005em}
  .op-row-action:hover{background:#0a0a0a;color:#fff;border-color:#0a0a0a}
  .op-info-box{padding:12px 16px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;margin-bottom:18px;font-size:13px;color:#262626;line-height:1.6}
  .op-code{font-family:'Geist Mono',monospace;font-size:11.5px;background:#f5f5f4;padding:1px 5px;border-radius:3px;color:#0a0a0a}
  .op-pre{background:#0a0a0a;color:#d4d4d4;padding:14px 16px;border-radius:6px;font-family:'Geist Mono',monospace;font-size:12px;line-height:1.7;overflow-x:auto;margin:10px 0}
  @media(max-width:1024px){.op-kpi-row{grid-template-columns:repeat(2,1fr)}.op-subscores{display:none}}
  @media(max-width:768px){.op-kpi-row{grid-template-columns:1fr 1fr}.op-search{width:100%}}
`;

export default function OnPageAudit() {
  const data = useLoaderData();
  const { revalidate } = useRevalidator();
  const jobFetcher = useFetcher();
  const actionFetcher = useFetcher();
  const previewFetcher = useFetcher();
  const applyFetcher = useFetcher();
  const pollingRef = useRef(null);

  const [activeJob, setActiveJob] = useState(data.activeJob);
  const [expandedIds, setExpandedIds] = useState({});
  const [previews, setPreviews] = useState({});
  const [editedPreviews, setEditedPreviews] = useState({});
  const [loadingIds, setLoadingIds] = useState({});
  const [appliedIds, setAppliedIds] = useState({});
  const [pendingPreviewId, setPendingPreviewId] = useState(null);
  const [pendingApplyId, setPendingApplyId] = useState(null);
  const [applyResults, setApplyResults] = useState({});
  const [activeFields, setActiveFields] = useState({});
  const [filterTier, setFilterTier] = useState("all");
  const [searchQ, setSearchQ] = useState("");
  const [auditPage, setAuditPage] = useState(1);
  const [auditPerPage] = useState(25);
  const [activeTab, setActiveTab] = useState("audit");
  const [schemaStatus, setSchemaStatus] = useState(null);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [schemaApplying, setSchemaApplying] = useState(false);
  const [schemaMsg, setSchemaMsg] = useState("");
  const [showBrand, setShowBrand] = useState(false);
  const [brand, setBrand] = useState(data.brand);
  const [brandSaved, setBrandSaved] = useState(false);
  const [previewError, setPreviewError] = useState("");

  const { totalProducts, auditedCount, avgScore, critCount, warnCount, goodCount, audits, hasProducts, hasAI, storeId } = data;

  const getFields = (pid) => activeFields[pid] || { product_title: true, meta_title: true, meta_desc: true, alt_text: true, handle: false };
  const toggleField = (pid, field) => setActiveFields((p) => ({ ...p, [pid]: { ...getFields(pid), [field]: !getFields(pid)[field] } }));

  const pollStatus = useCallback(() => { const fd = new FormData(); fd.set("intent", "job_status"); jobFetcher.submit(fd, { method: "POST" }); }, [jobFetcher]);
  useEffect(() => { if (!jobFetcher.data?.success) return; if (jobFetcher.data.job) setActiveJob({ ...jobFetcher.data.job }); else if (activeJob) { setActiveJob(null); revalidate(); } }, [jobFetcher.data]);
  useEffect(() => { const isActive = activeJob && ["QUEUED", "RUNNING"].includes(activeJob.status); if (isActive) pollingRef.current = setInterval(pollStatus, 4000); else clearInterval(pollingRef.current); return () => clearInterval(pollingRef.current); }, [activeJob?.status, pollStatus]);

  useEffect(() => {
    if (!previewFetcher.data || previewFetcher.state !== "idle" || !pendingPreviewId) return;
    const pid = pendingPreviewId;
    setLoadingIds((p) => ({ ...p, [pid]: false }));
    if (previewFetcher.data.success && previewFetcher.data.preview) { setPreviews((p) => ({ ...p, [pid]: previewFetcher.data.preview })); setEditedPreviews((p) => ({ ...p, [pid]: { ...previewFetcher.data.preview } })); setPreviewError(""); }
    else { const err = previewFetcher.data?.error || "Generation failed"; setPreviewError(err.includes("429") ? "Rate limit — wait 10s and retry." : `Error: ${err}`); }
    setPendingPreviewId(null);
  }, [previewFetcher.data, previewFetcher.state]);

  useEffect(() => {
    if (!applyFetcher.data || applyFetcher.state !== "idle" || !pendingApplyId) return;
    const pid = pendingApplyId;
    setLoadingIds((p) => ({ ...p, [pid]: false }));
    if (applyFetcher.data.success) {
      const ap = editedPreviews[pid] || previews[pid];
      setAppliedIds((p) => ({ ...p, [pid]: true }));
      setApplyResults((p) => ({ ...p, [pid]: { productTitle: ap?.productTitle, metaTitle: ap?.metaTitle, metaDesc: ap?.metaDesc, appliedAt: new Date().toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" }) } }));
      setPreviews((p) => { const n = { ...p }; delete n[pid]; return n; });
      setTimeout(() => { const fd = new FormData(); fd.set("intent", "audit_single"); fd.set("productId", pid); actionFetcher.submit(fd, { method: "POST" }); }, 1500);
      setTimeout(() => revalidate(), 6000);
    }
    setPendingApplyId(null);
  }, [applyFetcher.data, applyFetcher.state]);

  const startAudit = () => { setActiveJob({ status: "QUEUED", progressPct: 0, statusMessage: "Starting...", processedItems: 0, totalItems: 0 }); const fd = new FormData(); fd.set("intent", "audit"); actionFetcher.submit(fd, { method: "POST" }); };
  const generatePreview = (pid) => { setPendingPreviewId(pid); setLoadingIds((p) => ({ ...p, [pid]: true })); const fd = new FormData(); fd.set("intent", "generate_preview"); fd.set("productId", pid); previewFetcher.submit(fd, { method: "POST" }); };
  const applyProduct = (pid) => {
    const ep = editedPreviews[pid] || previews[pid]; if (!ep) return;
    const fields = getFields(pid);
    setPendingApplyId(pid); setLoadingIds((p) => ({ ...p, [pid]: true }));
    const fd = new FormData(); fd.set("intent", "apply_product"); fd.set("productId", pid);
    if (fields.product_title && ep.productTitle) fd.set("productTitle", ep.productTitle);
    if (fields.meta_title && ep.metaTitle) fd.set("metaTitle", ep.metaTitle);
    if (fields.meta_desc && ep.metaDesc) fd.set("metaDesc", ep.metaDesc);
    if (fields.alt_text && ep.altTexts) fd.set("altTexts", JSON.stringify(ep.altTexts));
    if (fields.handle && ep.suggestedHandle) fd.set("newHandle", ep.suggestedHandle);
    applyFetcher.submit(fd, { method: "POST" });
  };

  const isJobActive = activeJob && ["QUEUED", "RUNNING"].includes(activeJob.status);
  const brandSuffixStr = brand.brandName && brand.brandInMeta ? ` ${brand.separator} ${brand.brandName}` : "";

  const filteredAudits = audits.filter((a) => {
    if (filterTier === "critical") return (a.score || 0) < 60;
    if (filterTier === "warning") return (a.score || 0) >= 60 && (a.score || 0) < 80;
    if (filterTier === "good") return (a.score || 0) >= 80;
    if (filterTier === "optimized") return !!appliedIds[a.productId] || !!a.lastOptimizedAt;
    return true;
  }).filter((a) => !searchQ || a.productTitle.toLowerCase().includes(searchQ.toLowerCase()) || a.productHandle?.toLowerCase().includes(searchQ.toLowerCase()));

  return (
    <div className="op-wrap">
      <style>{CSS}</style>

      {/* PAGE HEAD */}
      <div className="op-page-head">
        <div>
          <div className="op-kicker">
            <span className="op-live-dot" />
            <span>{auditedCount > 0 ? `${auditedCount} produse auditate` : "Gata de audit"}</span>
          </div>
          <h1 className="op-h1">On-Page <em>Audit</em></h1>
          <p className="op-sub">Analizează și optimizează titluri SEO, descrieri, URL slugs și alt texts cu Claude AI.</p>
        </div>
        <div className="op-actions">
          {auditedCount > 0 && <button className="op-btn op-btn-ghost" onClick={() => setShowBrand(!showBrand)}>⚙ Brand</button>}
          {auditedCount > 0 && (
            <button className="op-btn op-btn-danger" onClick={() => { if (!confirm("Ștergi toate datele de audit?")) return; const fd = new FormData(); fd.set("intent", "reset"); actionFetcher.submit(fd, { method: "POST" }); setTimeout(() => revalidate(), 300); }}>Reset</button>
          )}
          <button className="op-btn op-btn-primary" disabled={isJobActive || !hasAI || !storeId} onClick={startAudit}>
            {isJobActive ? (
              <><div style={{ width: "12px", height: "12px", border: "2px solid rgba(255,255,255,.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "kspin 0.8s linear infinite" }} />{" "}Auditing...</>
            ) : auditedCount > 0 ? "Re-audit all" : "Start audit →"}
          </button>
        </div>
      </div>

      {/* WARNINGS */}
      {!hasProducts && <div className="op-warn-bar op-warn-amber">No products synced. Run Sync Products in SEO Engine first.</div>}
      {!hasAI && <div className="op-warn-bar op-warn-red">Anthropic API key missing — add ANTHROPIC_API_KEY to .env.</div>}

      {/* BRAND PANEL */}
      {showBrand && (
        <div className="op-brand-panel">
          <div className="op-brand-head">
            <span className="op-brand-title">Brand Settings</span>
            <button className="op-close" onClick={() => setShowBrand(false)}>×</button>
          </div>
          <div style={{ fontSize: "12px", color: "#737373", marginBottom: "12px" }}>
            Preview: <code className="op-code">Aspirator Portabil {brand.separator} {brand.brandName || "Brand"}</code>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 110px", gap: "10px", marginBottom: "14px" }}>
            <div>
              <div className="op-field-label">Brand name</div>
              <input className="op-input" value={brand.brandName} onChange={(e) => setBrand((p) => ({ ...p, brandName: e.target.value }))} placeholder="e.g. Vivimall" />
            </div>
            <div>
              <div className="op-field-label">Separator</div>
              <select className="op-select" style={{ width: "100%" }} value={brand.separator} onChange={(e) => setBrand((p) => ({ ...p, separator: e.target.value }))}>
                {["|", "~", "-", "·", "—", "•"].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "7px", cursor: "pointer", fontSize: "13px", color: "#525252" }}>
              <input type="checkbox" checked={brand.brandInMeta} onChange={(e) => setBrand((p) => ({ ...p, brandInMeta: e.target.checked }))} />
              Append to all SEO titles
            </label>
            <button className="op-btn op-btn-primary" style={{ padding: "6px 12px" }} onClick={() => { const fd = new FormData(); fd.set("intent", "save_brand"); fd.set("brandName", brand.brandName); fd.set("separator", brand.separator); fd.set("brandInMeta", String(brand.brandInMeta)); actionFetcher.submit(fd, { method: "POST" }); setBrandSaved(true); setTimeout(() => setBrandSaved(false), 2000); }}>Save</button>
            {brandSaved && <span style={{ fontSize: "12.5px", color: "#166534", fontWeight: "600" }}>✓ Saved</span>}
          </div>
        </div>
      )}

      {/* JOB BANNER */}
      {isJobActive && (
        <div className="op-job-banner">
          <div style={{ width: "18px", height: "18px", minWidth: "18px", border: "2px solid #333", borderTopColor: "#16a34a", borderRadius: "50%", animation: "kspin 0.8s linear infinite" }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "13px", color: "#fff", fontWeight: "600" }}>
              Auditing products{activeJob.processedItems > 0 ? ` — ${activeJob.processedItems} / ${activeJob.totalItems}` : "..."}
            </div>
            <div style={{ fontSize: "12px", color: "#525252", marginTop: "3px" }}>{activeJob.statusMessage}</div>
            {activeJob.progressPct > 0 && (
              <div style={{ marginTop: "8px", height: "3px", background: "#1a1a1a", borderRadius: "2px", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${activeJob.progressPct}%`, background: "#16a34a", borderRadius: "2px", transition: "width .5s" }} />
              </div>
            )}
          </div>
          {activeJob.progressPct > 0 && <span style={{ fontFamily: "'Geist Mono',monospace", fontSize: "18px", color: "#16a34a", fontWeight: "600" }}>{activeJob.progressPct}%</span>}
          <button className="op-btn op-btn-ghost" style={{ background: "transparent", borderColor: "#333", color: "#737373", fontSize: "12px" }} onClick={() => { const fd = new FormData(); fd.set("intent", "job_cancel"); actionFetcher.submit(fd, { method: "POST" }); setActiveJob(null); }}>Cancel</button>
        </div>
      )}

      {/* KPI CARDS */}
      {audits.length > 0 && (
        <div className="op-kpi-row">
          {[
            { label: "Avg score", value: avgScore, sub: "out of 100", color: scoreColor(avgScore), click: null },
            { label: "Critical", value: critCount, sub: "score < 60", color: "#dc2626", click: "critical" },
            { label: "Needs work", value: warnCount, sub: "score 60–79", color: "#d97706", click: "warning" },
            { label: "Good", value: goodCount, sub: "score ≥ 80", color: "#16a34a", click: "good" },
          ].map((k, i) => (
            <div key={i} className="op-kpi" onClick={() => { if (k.click) { setFilterTier(k.click); setAuditPage(1); } }}>
              <div className="op-kpi-label">{k.label}</div>
              <div className="op-kpi-value" style={{ color: k.color }}>{k.value}</div>
              <div className="op-kpi-foot">
                <span className={`op-delta ${k.click === "critical" ? "op-delta-red" : k.click === "warning" ? "op-delta-amber" : k.click === "good" ? "op-delta-green" : ""}`} style={!k.click ? { background: "#f5f5f4", color: "#737373" } : {}}>
                  {k.sub}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TABS */}
      <div className="op-tabs-bar">
        {[
          { key: "audit", label: "On-Page Audit", count: audits.length },
          { key: "schema", label: "Schema Markup", count: null },
        ].map((t) => (
          <button key={t.key} className={`op-tab${activeTab === t.key ? " active" : ""}`} onClick={() => setActiveTab(t.key)}>
            {t.label}
            {t.count !== null && <span className="op-tab-count">{t.count}</span>}
          </button>
        ))}
      </div>

      {/* ─── SCHEMA TAB ─── */}
      {activeTab === "schema" && (
        <SchemaTab audits={audits} schemaStatus={schemaStatus} setSchemaStatus={setSchemaStatus} schemaLoading={schemaLoading} setSchemaLoading={setSchemaLoading} schemaApplying={schemaApplying} setSchemaApplying={setSchemaApplying} schemaMsg={schemaMsg} setSchemaMsg={setSchemaMsg} />
      )}

      {/* ─── AUDIT TAB ─── */}
      {activeTab === "audit" && (
        <>
          {/* TOOLBAR */}
          {audits.length > 0 && (
            <div className="op-toolbar">
              <div className="op-toolbar-left">
                <div className="op-search">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
                  <input placeholder="Caută produs sau URL..." value={searchQ} onChange={(e) => { setSearchQ(e.target.value); setAuditPage(1); }} />
                </div>
                <div className="op-chips">
                  {[
                    { key: "all",       label: "Toate",     count: audits.length },
                    { key: "critical",  label: "Critice",   count: critCount },
                    { key: "warning",   label: "Warning",   count: warnCount },
                    { key: "good",      label: "OK",        count: goodCount },
                    { key: "optimized", label: "Optimizate", count: audits.filter((a) => a.lastOptimizedAt).length },
                  ].map((f) => (
                    <span key={f.key} className={`op-chip${filterTier === f.key ? " active" : ""}`} onClick={() => { setFilterTier(f.key); setAuditPage(1); }}>
                      {f.label} <span className="op-chip-ct">{f.count}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* EMPTY STATE */}
          {audits.length === 0 && !isJobActive && (
            <div className="op-empty">
              <div style={{ fontSize: "36px", marginBottom: "16px" }}>🔍</div>
              {!storeId ? (
                <>
                  <div style={{ fontSize: "17px", fontWeight: "600", color: "#0a0a0a", marginBottom: "8px", letterSpacing: "-.01em" }}>Niciun magazin conectat</div>
                  <p style={{ fontSize: "13.5px", color: "#737373", maxWidth: "380px", margin: "0 auto 20px", lineHeight: "1.6" }}>Conectează mai întâi un magazin Shopify pentru a rula auditul SEO.</p>
                  <a href="/connect-store" className="op-btn op-btn-primary" style={{ textDecoration: "none" }}>Conectează magazin →</a>
                </>
              ) : (
                <>
                  <div style={{ fontSize: "17px", fontWeight: "600", color: "#0a0a0a", marginBottom: "8px", letterSpacing: "-.01em" }}>Gata de audit</div>
                  <p style={{ fontSize: "13.5px", color: "#737373", maxWidth: "400px", margin: "0 auto 20px", lineHeight: "1.6" }}>
                    {totalProducts > 0 ? `${totalProducts} produse sincronizate. Claude va analiza titluri SEO, descrieri, URL slugs și alt texts.` : "Auditul va sincroniza și analiza produsele cu Claude AI."}
                  </p>
                  <button className="op-btn op-btn-primary" disabled={!hasAI} onClick={startAudit}>{!hasAI ? "ANTHROPIC_API_KEY lipsește" : "Start audit →"}</button>
                </>
              )}
            </div>
          )}

          {/* PRODUCT ROWS */}
          {filteredAudits.slice((auditPage - 1) * auditPerPage, auditPage * auditPerPage).map((a) => {
            const isExpanded = !!expandedIds[a.id];
            const isLoading = !!loadingIds[a.productId];
            const hasPreview = !!previews[a.productId];
            const isApplied = !!appliedIds[a.productId];
            const preview = previews[a.productId];
            const ep = editedPreviews[a.productId] || {};
            const issues = a.findings.filter((f) => f.severity !== "ok");
            const errCount = issues.filter((f) => f.severity === "error").length;
            const warnCount2 = issues.filter((f) => f.severity === "warning").length;
            const score = a.score || 0;
            const fields = getFields(a.productId);

            return (
              <div key={a.id} className={`op-row${isExpanded ? " expanded" : ""}`}>
                {/* ROW HEADER */}
                <div className="op-row-head" onClick={() => setExpandedIds((p) => ({ ...p, [a.id]: !isExpanded }))}>
                  <ScoreRing score={score} />
                  <div className="op-row-info">
                    <div className="op-row-title" title={a.productTitle}>{a.productTitle.length > 65 ? a.productTitle.slice(0, 65) + "…" : a.productTitle}</div>
                    <div className="op-row-url">/{a.productHandle || "—"}</div>
                    <div className="op-row-tags">
                      {errCount > 0 && <span className="op-tag op-tag-err">{errCount} error{errCount > 1 ? "s" : ""}</span>}
                      {warnCount2 > 0 && <span className="op-tag op-tag-warn">{warnCount2} warning{warnCount2 > 1 ? "s" : ""}</span>}
                      {issues.length === 0 && !isApplied && <span className="op-tag op-tag-ok">No issues</span>}
                      {isApplied && applyResults[a.productId] && <span className="op-tag op-tag-ok">✓ Applied {applyResults[a.productId].appliedAt}</span>}
                      {isApplied && !applyResults[a.productId] && <span className="op-tag op-tag-ok">✓ Optimized</span>}
                      {hasPreview && !isApplied && <span className="op-tag op-tag-info">Preview ready</span>}
                    </div>
                  </div>
                  <div className="op-subscores">
                    {[{ label: "Title", val: a.metaTitleScore }, { label: "Desc", val: a.metaDescScore }, { label: "URL", val: a.handleScore }, { label: "Img", val: a.imageScore }].map((s) => (
                      <div key={s.label} className="op-subscore">
                        <div className="op-subscore-val" style={{ color: scoreColor(s.val || 0) }}>{s.val || 0}</div>
                        <div className="op-subscore-lbl">{s.label}</div>
                      </div>
                    ))}
                  </div>
                  <span className={`op-chev${isExpanded ? " open" : ""}`}>▼</span>
                </div>

                {/* EXPANDED BODY */}
                {isExpanded && (
                  <div className="op-body">
                    {/* Applied confirmation */}
                    {isApplied && applyResults[a.productId] && (
                      <div className="op-apply-confirm">
                        <div className="op-apply-confirm-head">
                          <div className="op-check-circle"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg></div>
                          <span style={{ fontSize: "13px", fontWeight: "600", color: "#166534" }}>Changes applied at {applyResults[a.productId].appliedAt}</span>
                        </div>
                        {[{ key: "productTitle", name: "Product Title" }, { key: "metaTitle", name: "SEO Title" }, { key: "metaDesc", name: "SEO Description" }].filter((f) => applyResults[a.productId][f.key]).map((f) => (
                          <div key={f.key} className="op-applied-field">
                            <div className="op-applied-field-name">{f.name}</div>
                            <div className="op-applied-field-val">{applyResults[a.productId][f.key]}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Issues */}
                    {issues.length > 0 && (
                      <div className="op-issues-section">
                        <div className="op-issues-title">Issues found</div>
                        {issues.map((f, i) => (
                          <div key={i} className={`op-issue${f.severity === "error" ? " op-issue-err" : f.severity === "warning" ? " op-issue-warn" : " op-issue-ok"}`}>
                            {f.severity === "error" ? (
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                            ) : (
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/></svg>
                            )}
                            <span style={{ fontWeight: "600" }}>{FIELD_LABELS[f.field] || f.field}</span>
                            <span style={{ color: "#737373", marginLeft: "4px" }}>{f.title}</span>
                            {f.can_automate && <span className={`op-tag ${f.needs_approval ? "op-tag-warn" : "op-tag-info"}`} style={{ marginLeft: "auto" }}>{f.needs_approval ? "approval" : "auto-fix"}</span>}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Preview */}
                    {hasPreview && preview && (
                      <div className="op-preview-section">
                        <div className="op-preview-header">
                          <span className="op-preview-label">Preview — changes to apply</span>
                          <button className="op-close" onClick={() => { setPreviews((p) => { const n = { ...p }; delete n[a.productId]; return n; }); }}>×</button>
                        </div>

                        {fields.product_title && preview.productTitle && (
                          <div className="op-field-block">
                            <div className="op-field-head">
                              <span className="op-field-name">Product Title (H1)</span>
                              <span className="op-field-count" style={{ color: (ep.productTitle || preview.productTitle || "").length > 70 ? "#dc2626" : "#16a34a" }}>
                                {(ep.productTitle || preview.productTitle || "").length} / 70
                              </span>
                            </div>
                            <textarea className="op-textarea" defaultValue={preview.productTitle} rows={2}
                              onChange={(e) => setEditedPreviews((p) => ({ ...p, [a.productId]: { ...(p[a.productId] || preview), productTitle: e.target.value } }))} />
                            <div className="op-bar"><div className="op-bar-fill" style={{ width: `${Math.min(100, ((ep.productTitle || preview.productTitle || "").length / 70) * 100)}%`, background: (ep.productTitle || preview.productTitle || "").length > 70 ? "#dc2626" : "#16a34a" }} /></div>
                          </div>
                        )}

                        {fields.meta_title && preview.metaTitle && (
                          <div className="op-field-block">
                            <div className="op-field-head">
                              <span className="op-field-name">SEO Title</span>
                              <span className="op-field-count" style={{ color: (ep.metaTitle || preview.metaTitle || "").length > 65 ? "#dc2626" : "#16a34a" }}>
                                {(ep.metaTitle || preview.metaTitle || "").length} / 65
                              </span>
                            </div>
                            <textarea className="op-textarea teal" defaultValue={preview.metaTitle} rows={2}
                              onChange={(e) => setEditedPreviews((p) => ({ ...p, [a.productId]: { ...(p[a.productId] || preview), metaTitle: e.target.value } }))} />
                            <div className="op-bar"><div className="op-bar-fill" style={{ width: `${Math.min(100, ((ep.metaTitle || preview.metaTitle || "").length / 65) * 100)}%`, background: (ep.metaTitle || preview.metaTitle || "").length > 65 ? "#dc2626" : (ep.metaTitle || preview.metaTitle || "").length < 55 ? "#d97706" : "#16a34a" }} /></div>
                            {brandSuffixStr && <div className="op-hint">+ "{brandSuffixStr}" will be appended · total max 65 chars</div>}
                          </div>
                        )}

                        {fields.meta_desc && preview.metaDesc && (
                          <div className="op-field-block">
                            <div className="op-field-head">
                              <span className="op-field-name">SEO Description</span>
                              <span className="op-field-count" style={{ color: (ep.metaDesc || preview.metaDesc || "").length > 165 ? "#dc2626" : (ep.metaDesc || preview.metaDesc || "").length < 150 ? "#d97706" : "#16a34a" }}>
                                {(ep.metaDesc || preview.metaDesc || "").length} / 165
                              </span>
                            </div>
                            <textarea className="op-textarea teal" defaultValue={preview.metaDesc} rows={3}
                              onChange={(e) => setEditedPreviews((p) => ({ ...p, [a.productId]: { ...(p[a.productId] || preview), metaDesc: e.target.value } }))} />
                            <div className="op-bar"><div className="op-bar-fill" style={{ width: `${Math.min(100, ((ep.metaDesc || preview.metaDesc || "").length / 165) * 100)}%`, background: (ep.metaDesc || preview.metaDesc || "").length > 165 ? "#dc2626" : (ep.metaDesc || preview.metaDesc || "").length < 150 ? "#d97706" : "#16a34a" }} /></div>
                          </div>
                        )}

                        {fields.alt_text && preview.altTexts?.length > 0 && (
                          <div className="op-field-block">
                            <div className="op-field-name" style={{ marginBottom: "8px" }}>Image Alt Texts <span style={{ fontWeight: "400", color: "#a3a3a3", textTransform: "none", letterSpacing: 0 }}>{preview.altTexts.length} images</span></div>
                            {preview.altTexts.map((alt, i) => (
                              <div key={i} className="op-alt-item">
                                <div className="op-alt-num">{i + 1}</div>
                                <span>{alt}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {preview.suggestedHandle && preview.suggestedHandle !== a.productHandle && (
                          <div className="op-slug-box">
                            <div className="op-slug-label">URL Slug — requires approval</div>
                            <div className="op-slug-codes">
                              <code className="op-slug-old">/{a.productHandle}</code>
                              <span style={{ color: "#a3a3a3" }}>→</span>
                              <code className="op-slug-new">/{preview.suggestedHandle}</code>
                            </div>
                            <div style={{ fontSize: "11px", color: "#a3a3a3", marginTop: "6px" }}>Shopify auto-creates a redirect from the old URL.</div>
                          </div>
                        )}

                        <div className="op-apply-row">
                          <button className="op-btn op-btn-primary" disabled={isLoading} onClick={() => applyProduct(a.productId)}
                            style={{ background: isLoading ? "#525252" : "#16a34a" }}>
                            {isLoading ? <><div style={{ width: "12px", height: "12px", border: "2px solid rgba(255,255,255,.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "kspin .8s linear infinite" }} />{" "}Applying...</> : "✓ Apply to Shopify"}
                          </button>
                          <button className="op-btn op-btn-ghost" onClick={() => { setPreviews((p) => { const n = { ...p }; delete n[a.productId]; return n; }); }}>Discard</button>
                        </div>
                      </div>
                    )}

                    {/* OPTIMIZE BAR */}
                    <div className="op-optimize-bar">
                      <span className="op-optimize-label">Optimize:</span>
                      <div style={{ display: "flex", gap: "5px", flex: 1, flexWrap: "wrap" }}>
                        {[
                          { key: "product_title", label: "Product Title" },
                          { key: "meta_title", label: "SEO Title" },
                          { key: "meta_desc", label: "Description" },
                          { key: "alt_text", label: "Image alt" },
                          { key: "handle", label: "URL slug" },
                        ].map((f) => (
                          <span key={f.key} className={`op-field-chip${fields[f.key] ? " on" : ""}`} onClick={() => toggleField(a.productId, f.key)}>{f.label}</span>
                        ))}
                      </div>
                      <button className="op-btn op-btn-primary" disabled={isLoading || !hasAI} onClick={() => { setPreviewError(""); generatePreview(a.productId); }}>
                        {isLoading && !hasPreview ? "⏳ Optimizing..." : "✦ Optimize with AI"}
                      </button>
                      {previewError && !isLoading && <span style={{ fontSize: "12px", color: "#dc2626", fontWeight: "500" }}>⚠ {previewError}</span>}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* PAGINATION */}
          {filteredAudits.length > auditPerPage && (
            <div className="op-pager">
              <span>{(auditPage - 1) * auditPerPage + 1}–{Math.min(auditPage * auditPerPage, filteredAudits.length)} din {filteredAudits.length}</span>
              <div style={{ display: "flex", gap: "5px" }}>
                <button className="op-btn op-btn-ghost" style={{ padding: "5px 10px" }} disabled={auditPage <= 1} onClick={() => setAuditPage((p) => p - 1)}>←</button>
                <button className="op-btn op-btn-ghost" style={{ padding: "5px 10px" }} disabled={auditPage >= Math.ceil(filteredAudits.length / auditPerPage)} onClick={() => setAuditPage((p) => p + 1)}>→</button>
              </div>
            </div>
          )}
          {filteredAudits.length === 0 && audits.length > 0 && (
            <div style={{ textAlign: "center", padding: "40px", color: "#a3a3a3", fontSize: "13.5px" }}>No products in this category.</div>
          )}
        </>
      )}
    </div>
  );
}

function SchemaTab({ audits, schemaStatus, setSchemaStatus, schemaLoading, setSchemaLoading, schemaApplying, setSchemaApplying, schemaMsg, setSchemaMsg }) {
  const [schPage, setSchPage] = useState(1);
  const [schPerPage] = useState(25);
  const scoreColor2 = (s) => s >= 80 ? "#16a34a" : s >= 60 ? "#d97706" : "#dc2626";

  const loadStatus = async () => {
    setSchemaLoading(true);
    try { const r = await fetch("/api/schema/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ intent: "status" }) }); const d = await r.json(); if (d.success) setSchemaStatus(d); } catch (e) {}
    setSchemaLoading(false);
  };
  const applyAll = async () => {
    if (!confirm(`Apply schema markup to all ${audits.length} products?`)) return;
    setSchemaApplying(true); setSchemaMsg("");
    try { const r = await fetch("/api/schema/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ intent: "apply_batch", productIds: audits.map((a) => a.productId) }) }); const d = await r.json(); if (d.success) { setSchemaMsg(`Applied to ${d.applied} products.${d.errors > 0 ? ` ${d.errors} errors.` : ""}`); loadStatus(); } else setSchemaMsg(`Error: ${d.error}`); } catch (e) { setSchemaMsg(`Error: ${e.message}`); }
    setSchemaApplying(false);
  };
  const applyOne = async (productId, title) => {
    try { const r = await fetch("/api/schema/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ intent: "apply_one", productId }) }); const d = await r.json(); if (d.success) { setSchemaMsg(`Schema applied to "${title}"`); loadStatus(); } else setSchemaMsg(`Error: ${d.error}`); } catch (e) { setSchemaMsg(`Error: ${e.message}`); }
  };

  const appliedIds = new Set((schemaStatus?.schemas || []).filter((s) => s.status === "applied").map((s) => s.productId));
  const pct = schemaStatus ? Math.round((schemaStatus.applied / Math.max(schemaStatus.total, 1)) * 100) : 0;

  return (
    <div>
      <div className="op-info-box">
        <strong>Schema Markup</strong> — Generează JSON-LD (Product + Offer + BreadcrumbList) salvat ca metafield Shopify <code className="op-code">kimono</code>. Tema ta trebuie să-l redea în <code className="op-code">&lt;head&gt;</code>. <strong>Impact:</strong> rich results (stele, preț, stoc) în Google.
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px", flexWrap: "wrap", gap: "12px" }}>
        <div style={{ display: "flex", gap: "20px", alignItems: "center" }}>
          <div style={{ fontSize: "13px", color: "#525252" }}>
            <strong style={{ fontSize: "26px", fontWeight: "500", color: "#0a0a0a", letterSpacing: "-.025em" }}>{schemaStatus?.applied || 0}</strong>
            <span style={{ marginLeft: "6px" }}>/ {schemaStatus?.total || audits.length} products</span>
          </div>
          {schemaStatus && pct > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{ width: "100px", height: "4px", background: "#f0efee", borderRadius: "2px", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pct}%`, background: pct === 100 ? "#16a34a" : "#16a34a", borderRadius: "2px" }} />
              </div>
              <span style={{ fontSize: "12px", color: "#737373", fontFamily: "'Geist Mono',monospace" }}>{pct}%</span>
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button className="op-btn op-btn-ghost" onClick={loadStatus} disabled={schemaLoading}>{schemaLoading ? "Loading..." : "Check status"}</button>
          {audits.length > 0 && <button className="op-btn op-btn-primary" onClick={applyAll} disabled={schemaApplying}>{schemaApplying ? "Applying..." : `Apply all (${audits.length})`}</button>}
        </div>
      </div>

      {schemaMsg && (
        <div className={`op-warn-bar ${schemaMsg.startsWith("Error") ? "op-warn-red" : "op-warn-green"}`} style={{ marginBottom: "14px" }}>{schemaMsg}</div>
      )}

      <div className="op-schema-card" style={{ marginBottom: "14px" }}>
        <div className="op-schema-head"><span className="op-schema-title">Theme Installation</span></div>
        <div style={{ padding: "14px 16px" }}>
          <p style={{ fontSize: "13px", color: "#737373", lineHeight: "1.6", marginBottom: "8px" }}>
            Add to <code className="op-code">theme.liquid</code> before <code className="op-code">&lt;/head&gt;</code>:
          </p>
          <pre className="op-pre">{`{% if product.metafields.kimono.schema_json != blank %}
  <script type="application/ld+json">
    {{ product.metafields.kimono.schema_json.value | json }}
  </script>
{% endif %}`}</pre>
        </div>
      </div>

      {audits.length > 0 && (
        <div className="op-schema-card">
          <div className="op-schema-thead">
            <div>Produs</div><div>Score</div><div>Schema</div><div>Acțiune</div>
          </div>
          <div style={{ maxHeight: "480px", overflowY: "auto" }}>
            {audits.slice((schPage - 1) * schPerPage, schPage * schPerPage).map((a) => {
              const hasSchema = appliedIds.has(a.productId);
              return (
                <div key={a.productId} className="op-schema-row">
                  <div>
                    <div style={{ fontWeight: "600", fontSize: "13px", color: "#0a0a0a", letterSpacing: "-.01em" }}>{a.productTitle}</div>
                    <div style={{ fontSize: "11px", color: "#a3a3a3", fontFamily: "'Geist Mono',monospace", marginTop: "1px" }}>{a.productHandle}</div>
                  </div>
                  <div style={{ fontSize: "14px", fontWeight: "600", color: scoreColor2(a.score || 0), fontVariantNumeric: "tabular-nums" }}>{a.score || 0}</div>
                  <div><span className={`op-pill ${hasSchema ? "op-pill-ok" : "op-pill-warn"}`}>{hasSchema ? "Applied" : "Pending"}</span></div>
                  <div><button className="op-row-action" onClick={() => applyOne(a.productId, a.productTitle)}>{hasSchema ? "Re-apply" : "Apply"}</button></div>
                </div>
              );
            })}
          </div>
          {audits.length > schPerPage && (
            <div style={{ padding: "10px 16px", borderTop: "1px solid #f0efee", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12.5px", color: "#737373" }}>
              <span>{(schPage - 1) * schPerPage + 1}–{Math.min(schPage * schPerPage, audits.length)} din {audits.length}</span>
              <div style={{ display: "flex", gap: "4px" }}>
                <button className="op-btn op-btn-ghost" style={{ padding: "4px 10px" }} disabled={schPage <= 1} onClick={() => setSchPage((p) => p - 1)}>←</button>
                <button className="op-btn op-btn-ghost" style={{ padding: "4px 10px" }} disabled={schPage >= Math.ceil(audits.length / schPerPage)} onClick={() => setSchPage((p) => p + 1)}>→</button>
              </div>
            </div>
          )}
        </div>
      )}

      {audits.length === 0 && (
        <div style={{ textAlign: "center", padding: "48px", color: "#a3a3a3", fontSize: "13.5px" }}>Run On-Page Audit first to see products here.</div>
      )}
    </div>
  );
}
