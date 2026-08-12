// app/lib/seo/audit-processor.server.js
// ═══ Kimono SEO — On-Page Audit + Auto-Optimize Processor ═══
// Uses SKILL.md as AI system prompt for consistent, expert-level analysis.
// Audits: meta title, meta description, H1, URL handle, images alt text, Open Graph.
// Auto-optimize: applies approved changes directly to Shopify via Admin API.

import prisma from "../../db.server.js";
import { readFileSync } from "fs";
import { join } from "path";

const BATCH_SIZE     = 50; // products per audit batch (rule-based, no AI per product)
const RATE_LIMIT_MS  = 500; // ms between Shopify API calls

// ── Load skill system prompt once at module level ──
let SKILL_PROMPT = "";
try {
  // Load onpage-meta skill (primary) — falls back to general SEO skill
  const skillCandidates = [
    join(process.cwd(), "app/lib/seo/skill/onpage-meta.md"),
    "/app/app/lib/seo/skill/onpage-meta.md",
    join(process.cwd(), "app/lib/seo/skill/SKILL.md"),
    "/app/app/lib/seo/skill/SKILL.md",
  ];
  for (const p of skillCandidates) {
    try {
      SKILL_PROMPT = readFileSync(p, "utf8").slice(0, 6000);
      console.log("[Audit] Skill loaded from:", p);
      break;
    } catch { /* try next */ }
  }
  if (!SKILL_PROMPT) throw new Error("No skill file found");
} catch {
  console.warn("[Audit] Skill not found, using fallback.");
  SKILL_PROMPT = `You are an expert SEO copywriter for Romanian Shopify stores.
Generate optimized meta titles (55-65 chars with brand), meta descriptions (150-165 chars with CTA),
product titles (max 70 chars), URL slugs (lowercase, no diacritics), and image alt texts.
Always write in Romanian. Follow Google SEO best practices.`;
}

// ── BRAND SETTINGS ──
export async function getBrandSettings(storeId) {
  const settings = await prisma.seoSetting.findMany({
    where: { storeId, key: { in: ["brand_name", "brand_separator", "brand_in_meta", "vision_enabled"] } },
  });
  const map = Object.fromEntries(settings.map((s) => [s.key, s.value]));
  return {
    brandName:      map.brand_name      || "",
    separator:      map.brand_separator || "|",
    brandInMeta:    map.brand_in_meta   !== "false",
    visionEnabled:  map.vision_enabled  === "true",
  };
}

// ════════════════════════════════════════
// AUDIT PIPELINE
// ════════════════════════════════════════
export async function processAuditInBackground(jobId, storeId) {
  await prisma.seoJob.update({
    where: { id: jobId },
    data:  { status: "RUNNING", startedAt: new Date() },
  });

  const { getValidOfflineSession } = await import("./session-helper.server.js");
  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { shopDomain: true } });
  if (!store) throw new Error("Store not found");

  let session = await getValidOfflineSession(store.shopDomain);

  const apiKey   = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Anthropic API key not configured.");

  const brand = await getBrandSettings(storeId);
  const total = await prisma.seoProduct.count({ where: { storeId } });

  if (total === 0) {
    await prisma.seoJob.update({ where: { id: jobId }, data: { status: "DONE", progressPct: 100, statusMessage: "No products.", finishedAt: new Date() } });
    return;
  }

  // Resume-friendly: only audit products that don't have an SeoAudit row yet.
  // Anti-join via raw SQL avoids loading 31k+ IDs into memory.
  const alreadyAudited = await prisma.seoAudit.count({ where: { storeId } });
  let processed = alreadyAudited;
  let retries   = 0;
  let done      = false;

  while (!done) {
    // Honor Cancel/Pause between batches
    const live = await prisma.seoJob.findUnique({ where: { id: jobId }, select: { status: true } });
    if (live?.status === "CANCELLED") {
      await prisma.seoJob.update({
        where: { id: jobId },
        data:  { finishedAt: new Date(), statusMessage: `Paused — ${processed}/${total} audited. Resume anytime.` },
      });
      return;
    }

    // Only pick products NOT yet audited
    const batch = await prisma.$queryRaw`
      SELECT p."id", p."productId", p."productTitle"
      FROM "SeoProduct" p
      LEFT JOIN "SeoAudit" a ON a."storeId" = p."storeId" AND a."productId" = p."productId"
      WHERE p."storeId" = ${storeId} AND a."productId" IS NULL
      ORDER BY p."id" ASC
      LIMIT ${BATCH_SIZE}
    `;
    if (batch.length === 0) { done = true; break; }

    try {
      // 1. Fetch full product data from Shopify
      let details = await fetchProductDetails(session.accessToken, store.shopDomain, batch.map((p) => p.productId));

      // If Shopify returned nothing for a non-empty batch, token is likely expired — retry refresh
      if (details.length === 0 && batch.length > 0) {
        console.warn(`[Audit] Shopify returned 0 details for ${batch.length} products — refreshing token`);
        try { session = await getValidOfflineSession(store.shopDomain); } catch {}
        details = await fetchProductDetails(session.accessToken, store.shopDomain, batch.map((p) => p.productId));
        if (details.length === 0) throw new Error(`Shopify API returned no data — token may be expired. Re-open the app from Shopify Admin.`);
      }

      // 2. Batch entity score — 1 AI call for entire batch instead of N calls
      let entityMap = new Map();
      try {
        const { scoreProductEntitiesBatch } = await import("./entity-score.server.js");
        const lang = brand.language || "ro";
        entityMap = await scoreProductEntitiesBatch(
          details.map((p) => ({ id: p.id, title: p.title, description: p.bodyHtml || p.description || "" })),
          lang
        );
      } catch (e) { console.warn("[Audit] batch entity score:", e.message); }

      // 3. Run rule-based audit per product (no AI call here — entity already batched)
      for (const product of details) {
        try {
          const result = await auditProduct(apiKey, product, brand, entityMap.get(product.id));
          const auditData = {
            productTitle:    product.title,
            productHandle:   product.handle,
            score:           result.score,
            metaTitleScore:  result.metaTitleScore,
            metaDescScore:   result.metaDescScore,
            h1Score:         result.h1Score,
            handleScore:     result.handleScore,
            imageScore:      result.imageScore,
            ogScore:         result.ogScore,
            entityScore:     result.entityScore || 0,
            entityCount:     result.entityCount || 0,
            entityDensity:   result.entityDensity || 0,
            entityList:      JSON.stringify(result.entityList || []),
            findings:        JSON.stringify(result.findings),
            suggestions:     JSON.stringify(result.suggestions),
            auditedAt:       new Date(),
          };
          await prisma.seoAudit.upsert({
            where:  { storeId_productId: { storeId, productId: product.id } },
            update: auditData,
            create: { storeId, productId: product.id, ...auditData },
          });
          processed++;
        } catch (pErr) {
          console.warn(`[Audit] Product ${product.id}:`, pErr.message);
          processed++;
        }
      }

      await prisma.seoJob.update({
        where: { id: jobId },
        data:  { processedItems: processed, totalItems: total, progressPct: Math.round((processed / total) * 100), statusMessage: `Audited ${processed}/${total} products...` },
      });

      retries = 0;
      await sleep(RATE_LIMIT_MS);
    } catch (err) {
      console.error("[Audit] Batch:", err.message);
      // Refresh token on auth errors (token expires mid-run after ~60 min)
      if (err.message?.includes("401") || err.message?.includes("Unauthorized") || err.message?.includes("Invalid API key")) {
        try { session = await getValidOfflineSession(store.shopDomain); console.log("[Audit] Token refreshed after 401"); } catch {}
      }
      retries++;
      if (retries >= 3) {
        await prisma.seoJob.update({ where: { id: jobId }, data: { status: "FAILED", errorMessage: err.message, finishedAt: new Date() } });
        return;
      }
      await sleep(2000);
    }
  }

  await prisma.seoJob.update({
    where: { id: jobId },
    data:  { status: "DONE", progressPct: 100, statusMessage: `Audited ${processed} products.`, finishedAt: new Date() },
  });
}

// ════════════════════════════════════════
// AUTO-OPTIMIZE PIPELINE
// ════════════════════════════════════════
export async function processOptimizeInBackground(jobId, storeId, productIds, applyTypes) {
  // applyTypes = array of: "meta_title" | "meta_desc" | "alt_text" | "handle"
  // handle requires explicit user approval per product (returned as pending, not auto-applied)

  await prisma.seoJob.update({ where: { id: jobId }, data: { status: "RUNNING", startedAt: new Date() } });

  const { getValidOfflineSession } = await import("./session-helper.server.js");
  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { shopDomain: true } });
  if (!store) throw new Error("Store not found");

  const session = await getValidOfflineSession(store.shopDomain);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Anthropic API key not configured.");

  const brand = await getBrandSettings(storeId);

  // Two modes: caller passed productIds (work on subset, bounded by caller) OR
  // process every product (paginate to avoid OOM). For mode 2 we use cursor
  // pagination — same reasoning as processAuditInBackground above.
  const where = productIds?.length ? { storeId, productId: { in: productIds } } : { storeId };
  const total = await prisma.seoProduct.count({ where });

  let processed = 0;
  let cursor    = null;
  let done      = false;

  while (!done) {
    // Honor Cancel between batches — saves AI spend on the remaining products.
    const live = await prisma.seoJob.findUnique({ where: { id: jobId }, select: { status: true } });
    if (live?.status === "CANCELLED") {
      await prisma.seoJob.update({
        where: { id: jobId },
        data:  { finishedAt: new Date(), statusMessage: `Cancelled by user (optimized ${processed}/${total}).` },
      });
      return;
    }

    const batch = await prisma.seoProduct.findMany({
      where,
      select:  { id: true, productId: true, productTitle: true },
      orderBy: { id: "asc" },
      take:    BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (batch.length === 0) { done = true; break; }
    cursor = batch[batch.length - 1].id;

    try {
      const details = await fetchProductDetails(session.accessToken, store.shopDomain, batch.map((p) => p.productId));

      for (const product of details) {
        try {
          // Skip products already optimized or with good scores (save AI cost)
          const existingAudit = await prisma.seoAudit.findFirst({
            where:  { storeId, productId: product.id },
            select: { score: true, lastOptimizedAt: true },
          });
          if (existingAudit?.score >= 85 && existingAudit?.lastOptimizedAt) {
            processed++;
            continue; // Already optimized and scoring well — skip
          }

          // Generate optimized content using Claude + skill
          const optimized = await generateOptimizedContent(apiKey, product, brand);

          // Apply auto fields immediately
          const mutations = [];

          if (applyTypes.includes("meta_title") && optimized.metaTitle) {
            mutations.push({ field: "meta_title", value: optimized.metaTitle });
          }
          if (applyTypes.includes("meta_desc") && optimized.metaDesc) {
            mutations.push({ field: "meta_desc", value: optimized.metaDesc });
          }
          if (applyTypes.includes("alt_text") && optimized.altTexts?.length) {
            mutations.push({ field: "alt_text", value: optimized.altTexts });
          }

          // Apply to Shopify
          if (mutations.length > 0) {
            await applyToShopify(session.accessToken, store.shopDomain, product, mutations);
          }

          // Handle slug — always needs approval, save as pending suggestion
          if (applyTypes.includes("handle") && optimized.suggestedHandle && optimized.suggestedHandle !== product.handle) {
            await prisma.seoOptimizeSuggestion.create({
              data: {
                storeId,
                productId:    product.id,
                productTitle: product.title,
                field:        "handle",
                currentValue: product.handle,
                suggestedValue: optimized.suggestedHandle,
                reason:       optimized.handleReason || "",
                status:       "PENDING",
              },
            }).catch(() => {});
          }

          // Update audit record with applied values
          await prisma.seoAudit.updateMany({
            where: { storeId, productId: product.id },
            data:  { lastOptimizedAt: new Date(), optimizedFields: JSON.stringify(mutations.map((m) => m.field)) },
          });

          processed++;
        } catch (pErr) {
          console.warn(`[Optimize] ${product.id}:`, pErr.message);
          processed++;
        }
      }

      await prisma.seoJob.update({
        where: { id: jobId },
        data:  { processedItems: processed, totalItems: total, progressPct: Math.round((processed / total) * 100), statusMessage: `Optimized ${processed}/${total} products...` },
      });

      await sleep(RATE_LIMIT_MS);
    } catch (err) {
      console.error("[Optimize] Batch:", err.message);
      await sleep(2000);
    }
  }

  await prisma.seoJob.update({
    where: { id: jobId },
    data:  { status: "DONE", progressPct: 100, statusMessage: `Optimized ${processed} products.`, finishedAt: new Date() },
  });
}

// ════════════════════════════════════════
// SHOPIFY DATA FETCHER
// ════════════════════════════════════════
async function fetchProductDetails(accessToken, shopDomain, productIds) {
  const results = [];
  const query   = `{
    nodes(ids: ${JSON.stringify(productIds)}) {
      ... on Product {
        id title handle descriptionHtml
        seo { title description }
        images(first: 10) { edges { node { id url altText } } }
        metafields(first: 10, namespace: "seo") { edges { node { key value } } }
      }
    }
  }`;

  try {
    const { shopifyGraphQL } = await import("./shopify-graphql.server.js");
    const data  = await shopifyGraphQL({ accessToken, shopDomain, query });
    const nodes = data.data?.nodes || [];

    for (const node of nodes) {
      if (!node?.id) continue;
      results.push({
        id:          node.id,
        title:       node.title || "",
        handle:      node.handle || "",
        description: node.descriptionHtml?.replace(/<[^>]+>/g, "").trim().slice(0, 500) || "",
        seoTitle:    node.seo?.title || "",
        seoDesc:     node.seo?.description || "",
        images:      (node.images?.edges || []).map((e) => ({ id: e.node.id, url: e.node.url, altText: e.node.altText || "" })),
      });
    }
  } catch (err) {
    console.error("[Audit] fetchProductDetails:", err.message);
  }
  return results;
}

// ════════════════════════════════════════
// AUDIT LOGIC
// ════════════════════════════════════════
async function auditProduct(apiKey, product, brand) {
  const findings    = [];
  const suggestions = {};

  // ── META TITLE ──
  const metaTitle    = product.seoTitle || product.title;
  const titleLen     = metaTitle.length;
  const brandSuffix  = brand.brandName && brand.brandInMeta ? ` ${brand.separator} ${brand.brandName}` : "";
  const targetMax    = 65;
  const targetMin    = 55;
  let metaTitleScore = 100;

  if (titleLen === 0) {
    findings.push({ field: "Meta Title", severity: "error", title: "Missing", message: "No meta title set.", suggestion: `Set a ${targetMin}-${targetMax} char title with primary keyword${brandSuffix}.`, can_automate: true });
    metaTitleScore = 0;
  } else if (titleLen < targetMin) {
    findings.push({ field: "Meta Title", severity: "warning", title: "Too short", message: `${titleLen} chars — aim for ${targetMin}-${targetMax}.`, suggestion: "Add keyword + benefit + brand.", can_automate: true });
    metaTitleScore = 50;
  } else if (titleLen > targetMax) {
    findings.push({ field: "Meta Title", severity: "error", title: "Too long", message: `${titleLen} chars — Google truncates at 65.`, suggestion: `Keep under ${targetMax} chars.`, can_automate: true });
    metaTitleScore = 40;
  } else {
    findings.push({ field: "Meta Title", severity: "ok", title: "Good length", message: `${titleLen} chars.`, can_automate: false });
  }

  if (brand.brandName && !metaTitle.includes(brand.brandName)) {
    findings.push({ field: "Meta Title", severity: "warning", title: "Brand missing", message: `"${brand.brandName}" not in meta title.`, suggestion: `Append " ${brand.separator} ${brand.brandName}" at end.`, can_automate: true });
    metaTitleScore = Math.min(metaTitleScore, 75);
  }

  // ── META DESCRIPTION ──
  const metaDesc    = product.seoDesc || "";
  const descLen     = metaDesc.length;
  const descMin     = 150;
  const descMax     = 165;
  let metaDescScore = 100;

  if (descLen === 0) {
    findings.push({ field: "Meta Description", severity: "error", title: "Missing", message: "Google will auto-generate — often not ideal.", suggestion: `Write ${descMin}-${descMax} chars with benefit + CTA.`, can_automate: true });
    metaDescScore = 0;
  } else if (descLen < descMin) {
    findings.push({ field: "Meta Description", severity: "warning", title: "Too short", message: `${descLen} chars — aim for ${descMin}-${descMax}.`, suggestion: "Add more product details, benefits, specs and CTA.", can_automate: true });
    metaDescScore = 50;
  } else if (descLen > descMax) {
    findings.push({ field: "Meta Description", severity: "warning", title: "Too long", message: `${descLen} chars — truncated in SERP.`, suggestion: `Trim to ${descMax} chars.`, can_automate: true });
    metaDescScore = 72;
  } else {
    findings.push({ field: "Meta Description", severity: "ok", title: "Good length", message: `${descLen} chars.`, can_automate: false });
  }

  // ── H1 / PRODUCT TITLE ──
  let h1Score = 100;
  if (!product.title || product.title.length === 0) {
    findings.push({ field: "H1 / Title", severity: "error", title: "Missing", message: "No product title.", suggestion: "Add descriptive title.", can_automate: false });
    h1Score = 0;
  } else if (product.title.length > 80) {
    findings.push({ field: "H1 / Title", severity: "warning", title: "Long H1", message: `${product.title.length} chars.`, suggestion: "Keep under 70 chars.", can_automate: false });
    h1Score = 70;
  } else {
    findings.push({ field: "H1 / Title", severity: "ok", title: "Good title", message: `${product.title.length} chars.`, can_automate: false });
  }

  // ── URL HANDLE ──
  const handle    = product.handle || "";
  let handleScore = 100;
  const hasLongNum = /\d{6,}/.test(handle);
  const hasSpecial = /[^a-z0-9-]/.test(handle);
  const isTooLong  = handle.length > 60;

  if (hasSpecial) {
    findings.push({ field: "URL Handle", severity: "error", title: "Special chars", message: `"${handle}" has special characters.`, suggestion: "Use only lowercase, numbers, hyphens.", can_automate: true, needs_approval: true });
    handleScore = 30;
  } else if (hasLongNum) {
    findings.push({ field: "URL Handle", severity: "warning", title: "Auto-generated slug", message: `"${handle}" looks auto-generated.`, suggestion: "Rename to keyword-rich slug.", can_automate: true, needs_approval: true });
    handleScore = 50;
  } else if (isTooLong) {
    findings.push({ field: "URL Handle", severity: "warning", title: "Too long", message: `${handle.length} chars.`, suggestion: "Shorten to primary keyword.", can_automate: true, needs_approval: true });
    handleScore = 72;
  } else {
    findings.push({ field: "URL Handle", severity: "ok", title: "Clean URL", message: `/${handle}`, can_automate: false });
  }

  // ── IMAGES / ALT TEXT ──
  let imageScore = 100;
  const missingAlt = product.images.filter((img) => !img.altText || img.altText.trim() === "");
  if (product.images.length === 0) {
    findings.push({ field: "Images", severity: "warning", title: "No images", message: "Product has no images.", suggestion: "Add product images.", can_automate: false });
    imageScore = 40;
  } else if (missingAlt.length > 0) {
    findings.push({ field: "Alt Text", severity: "warning", title: `${missingAlt.length}/${product.images.length} images missing alt`, message: "Empty alt text hurts image SEO and accessibility.", suggestion: "Add descriptive alt text with keyword.", can_automate: true });
    imageScore = Math.round(100 - (missingAlt.length / product.images.length) * 60);
    // Generate alt text suggestions for missing images
    suggestions.altTexts = product.images.map((img) => ({
      imageId: img.id,
      current: img.altText,
      suggested: img.altText || `${product.title} — ${missingAlt.indexOf(img) >= 0 ? "product image" : img.altText}`,
    }));
  } else {
    findings.push({ field: "Alt Text", severity: "ok", title: "All images have alt text", message: `${product.images.length} images.`, can_automate: false });
  }

  // ── OPEN GRAPH ──
  // Shopify auto-populates OG from SEO fields — no need to show as separate issue
  // OG score follows meta title/desc scores
  let ogScore = 100;
  if (!product.seoTitle && !product.seoDesc) {
    ogScore = 40;
  } else if (!product.seoTitle || !product.seoDesc) {
    ogScore = 70;
  }
  // OG finding is intentionally omitted — fixing meta title/desc auto-fixes OG

  // ── AI CONTENT CHECK disabled ──
  // Rule-based checks above are sufficient and consistent.
  // AI check produced duplicate/conflicting findings (meta_title, H1/product_title).
  // Re-enable here if needed for keyword alignment checks in future.

  // ── ENTITY SCORE (Wave 1 — entity-density signal for AI grounding) ──
  // Pre-calculated in batch by caller (processAuditInBackground) — passed as 4th arg.
  // Falls back to single call only for inline/manual audits.
  let entityScore = 0, entityCount = 0, entityDensity = 0, entityList = [];
  const precomputedEntity = arguments[3]; // 4th arg from batch caller
  if (precomputedEntity) {
    entityScore   = precomputedEntity.score;
    entityCount   = precomputedEntity.count;
    entityDensity = precomputedEntity.density;
    entityList    = precomputedEntity.entities;
    for (const f of precomputedEntity.findings) findings.push(f);
  } else {
    try {
      const { scoreProductEntities } = await import("./entity-score.server.js");
      const lang = brand.language || "ro";
      const ent  = await scoreProductEntities({ title: product.title, description: product.bodyHtml || product.description || "", language: lang });
      if (ent) {
        entityScore   = ent.score;
        entityCount   = ent.count;
        entityDensity = ent.density;
        entityList    = ent.entities;
        for (const f of ent.findings) findings.push(f);
      }
    } catch (e) {
      console.warn("[Audit] entity score failed:", e.message);
    }
  }

  // ── ANSWER BLOCK (Wave 2 — AEO / featured-snippet readiness) ──
  // Scans product description HTML for question-style H2/H3 + 40-60 word
  // answer blocks underneath. Pure regex parsing, no API call.
  try {
    const { scoreAnswerBlocks } = await import("./answer-block.server.js");
    const ab = scoreAnswerBlocks(product.bodyHtml || product.description || "");
    if (ab.questionCount > 0) {
      for (const f of ab.findings) findings.push(f);
    }
  } catch (e) {
    console.warn("[Audit] answer block failed:", e.message);
  }

  // ── WEIGHTED SCORE ──
  // entityScore is folded in at 10% (carved from H1/handle/image/og), so the
  // legacy meta-title + meta-desc emphasis stays dominant while AI grounding
  // signal still moves the composite.
  const score = Math.round(
    metaTitleScore * 0.28 +
    metaDescScore  * 0.22 +
    h1Score        * 0.13 +
    handleScore    * 0.13 +
    imageScore     * 0.09 +
    ogScore        * 0.05 +
    entityScore    * 0.10
  );

  return {
    score, metaTitleScore, metaDescScore, h1Score, handleScore, imageScore, ogScore,
    entityScore, entityCount, entityDensity, entityList,
    findings, suggestions,
  };
}

// ── AI CHECK using skill prompt ──
async function runAICheck(apiKey, product, brand) {
  const systemPrompt = `${SKILL_PROMPT.slice(0, 2000)}

You are analyzing ONE Shopify product for SEO issues.
Brand: "${brand.brandName || "unknown"}"
Separator: "${brand.separator}"
Max meta title: 65 chars. Max meta description: 160 chars.
Respond ONLY with a JSON array of findings. Each finding:
{"field": string, "severity": "error|warning|ok", "title": string, "message": string, "can_automate": boolean}
Max 3 findings. Focus on keyword alignment and content quality.`;

  const userPrompt = `Current product title (H1): "${product.title}"
Meta title: "${product.seoTitle || "(not set)"}"
Meta description: "${product.seoDesc || "(not set)"}"
Description excerpt: "${product.description?.slice(0, 200) || "(empty)"}"`;

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method:  "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.AI_MODEL_FAST || "claude-haiku-4-5-20251001",
      max_tokens: 300,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!resp.ok) return [];
  const data = await resp.json();
  const rawText1 = (data.content?.[0]?.text || "[]").trim();
  let cleanText1 = rawText1.replace(/```json\s*/g, "").replace(/```/g, "").trim();
  const arrMatch = cleanText1.match(/\[[\s\S]*\]/);
  if (arrMatch) cleanText1 = arrMatch[0];
  try {
    return JSON.parse(cleanText1);
  } catch { return []; }
}

// ════════════════════════════════════════
// CONTENT GENERATOR (for optimize)
// ════════════════════════════════════════
async function generateOptimizedContent(apiKey, product, brand) {
  const brandSuffix    = brand.brandName && brand.brandInMeta
    ? ` ${brand.separator} ${brand.brandName}` : "";
  // Meta title total: 55-65 chars INCLUDING | Brand suffix
  // Keyword part = 55-65 minus brand suffix length
  const TITLE_TOTAL_MIN = 55;
  const TITLE_TOTAL_MAX = 65;
  const kwPartMax       = brandSuffix.length > 0
    ? TITLE_TOTAL_MAX - brandSuffix.length
    : TITLE_TOTAL_MAX;

  const systemPrompt = `You are an expert Shopify SEO copywriter for Romanian e-commerce stores.
Brand: "${brand.brandName || "Brand"}" · Separator: "${brand.separator || "|"}"

═══ STRICT RULES ═══

PRODUCT TITLE (H1 — shown on product page):
- 40-70 characters
- Descriptive: key attributes (material, size, color, model, use case)
- NO brand name — brand goes only in meta title
- Romanian WITH diacritics (ă â î ș ț)
- Should differ from meta title — more descriptive, less SERP-optimized
- Never cut a word mid-way — always end at complete word + unit

META TITLE (SERP — ce vede utilizatorul in Google):
- TOTAL including brand suffix: ${TITLE_TOTAL_MIN}-${TITLE_TOTAL_MAX} chars
- Keyword part: MAX ${kwPartMax} chars (before "${brandSuffix}")
- Brand suffix appended at end: "${brandSuffix}"
- FARA diacritice in meta title — >90% din cautari RO sunt fara diacritice
- Cuvantul-cheie principal in PRIMELE 30 caractere
- Separator in keyword part: cratima (-) — NU pipe, NU em dash
- Pattern: [Keyword principal] - [Atribut 1], [Atribut 2]${brandSuffix ? ` ${brand.separator} ${brand.brandName}` : ""}
- Include: tip produs, brand producator, model, atribut diferentiator
- NU include: brand magazin in keyword part, ALL CAPS, exclamari
- Modificatori care convertesc (alege MAX 1): "pret redus", "original", "livrare rapida", "2026"
- Daca keyword part < 55 chars, ADAUGA mai multe atribute descriptive

META DESCRIPTION:
- MINIMUM 155 chars, MAXIMUM 160 chars — numara fiecare caracter
- CU diacritice corecte (ă â î ș ț) — creste profesionalismul perceput
- Formula: [Produs + keyword] + [Specificatii concrete 2-3] + [Trust signal] + [CTA]
- Trust signals (alege 1-2): "livrare gratuita", "garantie 24 luni", "retur 30 zile", "produs original", "stoc disponibil", "plata in rate"
- CTA la final (alege 1): "Comandă acum!", "Cumpără online!", "Vezi oferta!", "Adaugă în coș!"
- MAX 1-2 simboluri relevante (✓ sau bifare) — optional, doar daca se potriveste
- 100% limba romana — NICIODATA cuvinte in engleza
- Extrage specificatii CONCRETE din descrierea produsului: dimensiuni, materiale, culori, greutate
- ENTITY SEO: include minim 3-4 entitati concrete (brand, model, material, dimensiuni, certificari) — LLM-urile prefera pagini cu densitate mare de entitati citabile
- INTERZIS: fraze vagi ("produs de calitate", "cel mai bun"), superlative goale, ghilimele duble

EXEMPLE BUNE meta description:
- "Laptop Lenovo IdeaPad 5, Intel Core i7, 16GB RAM, SSD 512GB. Stoc disponibil, factură fiscală, garanție 24 luni. Plată și în rate fără dobândă." (149 car.)
- "Pieptene profesional cu două fețe din oțel inoxidabil pentru câini și pisici. Elimină eficient puful și părul mort, mâner ergonomic. Comandă acum!" (157 car.)

URL SLUG:
- Lowercase, cratimi (-), fara diacritice, fara underscore
- Max 50 chars, keyword first
- Remove stop words: de, din, pentru, si, cu, a, al, la, in, pe, cel, cei
- No brand name in slug

ALT TEXT (90-125 caractere per imagine):
- Cu diacritice, descriptiv, keyword integrat natural
- Fiecare imagine: alt text UNIC (frontal vs detaliu vs lifestyle)
- Niciodata "Imagine cu..." — screen reader-ul anunta deja
- Include: produs + atribut cheie + perspectiva/unghi
- Exemplu bun: "Rochie roșie elegantă din satin pentru cocktail, vedere frontală, model Larisa"

Respond ONLY with valid JSON, no markdown fences:
{
  "productTitle": "...",
  "metaTitle": "...",
  "metaDesc": "...",
  "altTexts": ["one per image in order"],
  "suggestedHandle": "slug-here",
  "handleReason": "one sentence why this slug is better"
}`;

  // Extract key specs from description
  const descText = product.description?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || "";

  // Pull top keywords from SEO Engine (SeoCandidate enriched) for this product
  let topKeywords = "";
  try {
    const candidates = await prisma.seoCandidate.findMany({
      where:   { productId: product.id, enrichedAt: { not: null } },
      orderBy: { score: "desc" },
      take:    5,
      select:  { keyword: true, volume: true, score: true },
    });
    if (candidates.length > 0) {
      topKeywords = candidates.map((c) => `"${c.keyword}" (vol: ${c.volume || 0})`).join(", ");
    }
  } catch { /* SEO Engine data optional */ }

  // Pull aiTag if available
  let aiTag = "";
  try {
    const seoProduct = await prisma.seoProduct.findFirst({
      where:  { productId: product.id },
      select: { aiTag: true, aiSub: true },
    });
    if (seoProduct?.aiTag) aiTag = seoProduct.aiTag + (seoProduct.aiSub ? ` / ${seoProduct.aiSub}` : "");
  } catch { /* optional */ }

  // Pull entity list from existing audit (no extra AI call)
  let entityHint = "";
  try {
    const audit = await prisma.seoAudit.findFirst({
      where:  { productId: product.id },
      select: { entityList: true },
    });
    if (audit?.entityList) {
      const entities = JSON.parse(audit.entityList);
      if (entities.length > 0) {
        entityHint = entities
          .filter((e) => e.salience >= 0.3)
          .slice(0, 8)
          .map((e) => `${e.name} (${e.type})`)
          .join(", ");
      }
    }
  } catch { /* optional */ }

  const userPrompt = `Current product title (H1): "${product.title}"
Current meta title: "${product.seoTitle || "(not set)"}"
Current meta description: "${product.seoDesc || "(not set)"}"
Current URL handle: "${product.handle}"
Brand suffix to append: "${brandSuffix}"
${topKeywords ? `\nTop keywords from SEO research (USE the highest-volume one as primary keyword):\n${topKeywords}` : ""}
${aiTag ? `Product category (aiTag): ${aiTag}` : ""}
${entityHint ? `\nKey entities from audit (MUST include at least 3-4 of these in meta description for entity SEO):\n${entityHint}` : ""}

Product description (use this to extract specs and benefits):
"""
${descText.slice(0, 800)}
"""

Images: ${product.images.length} total
Current alt texts: ${product.images.map((img, i) => `[${i+1}]: "${img.altText || "empty"}"`).join(" | ")}

CRITICAL REQUIREMENTS:
- metaTitle keyword part (FARA diacritice): keyword part 55-65 chars
- After appending "${brandSuffix}" total must be 55-65 chars
- metaDesc (CU diacritice): EXACTLY 155-165 chars — count every character
- USE the top keyword from SEO research as PRIMARY keyword in metaTitle (first 30 chars)
- ALL text must be 100% in Romanian — no English words
- Extract concrete specs from product description above
- Alt text: 90-125 chars per image, cu diacritice, UNIC per imagine`;

  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), 60000); // 60s — covers retries

  let resp;
  let lastError;

  // Retry up to 3 times with exponential backoff for rate limits
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      const waitMs = attempt === 1 ? 10000 : 20000;
      console.log(`[AI] Rate limited, retrying in ${waitMs}ms (attempt ${attempt + 1})`);
      await sleep(waitMs);
    }
    try {
      resp = await fetch("https://api.anthropic.com/v1/messages", {
        method:  "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        signal:  controller.signal,
        body: JSON.stringify({
          model: process.env.AI_MODEL_FAST || "claude-haiku-4-5-20251001",
          max_tokens: 1024,
          system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
          messages: [{ role: "user", content: userPrompt }],
        }),
      });
      if (resp.ok) break;
      if (resp.status === 429) { lastError = `AI 429`; continue; }
      lastError = `AI ${resp.status}`;
      break;
    } catch (e) {
      lastError = e.message;
      if (e.name === "AbortError") break;
    }
  }

  clearTimeout(timeout);

  if (!resp?.ok) throw new Error(lastError || "AI request failed");
  const data = await resp.json();
  if (data.error) {
    console.error("[Anthropic] API error:", JSON.stringify(data.error));
    throw new Error(`Anthropic: ${data.error.message}`);
  }
  const rawText2  = (data.content?.[0]?.text || "{}").trim();
  console.log("[Anthropic] Raw response:", rawText2.slice(0, 200));

  // Strip markdown fences robustly
  let cleanText2  = rawText2.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
  // Extract JSON object if surrounded by other text
  const objMatch2 = cleanText2.match(/\{[\s\S]*\}/);
  if (objMatch2) cleanText2 = objMatch2[0];

  try {
    const json = JSON.parse(cleanText2);

    // ── Hard enforce meta title: total 55-65 chars including | Brand ──
    if (json.metaTitle) {
      // Strip diacritics from meta title (>90% RO searches are without)
      json.metaTitle = json.metaTitle
        .replace(/[ăâ]/g, "a").replace(/[ÂĂ]/g, "A")
        .replace(/[îÎ]/g, "i")
        .replace(/[șȘ]/g, "s")
        .replace(/[țȚ]/g, "t");

      // Remove brand suffix if AI already added it
      if (brand.brandName && json.metaTitle.includes(brand.brandName)) {
        const separators = [" | ", " ~ ", " - ", " · ", " — ", " • "];
        for (const sep of separators) {
          const idx = json.metaTitle.lastIndexOf(sep + brand.brandName);
          if (idx > 0) { json.metaTitle = json.metaTitle.slice(0, idx).trim(); break; }
        }
      }
      // Trim keyword part to kwPartMax, cut at word boundary
      if (json.metaTitle.length > kwPartMax) {
        const trimmed = json.metaTitle.slice(0, kwPartMax);
        const lastSpace = trimmed.lastIndexOf(" ");
        json.metaTitle = lastSpace > 30 ? trimmed.slice(0, lastSpace).trim() : trimmed.trim();
        json.metaTitle = json.metaTitle.replace(/[,\-|]+$/, "").trim();
      }
      // Append brand suffix
      if (brandSuffix && brand.brandInMeta) {
        json.metaTitle = json.metaTitle + brandSuffix;
      }
      // Final hard cap at 65
      if (json.metaTitle.length > TITLE_TOTAL_MAX) {
        const trimmed = json.metaTitle.slice(0, TITLE_TOTAL_MAX);
        const lastSpace = trimmed.lastIndexOf(" ");
        json.metaTitle = lastSpace > 30 ? trimmed.slice(0, lastSpace).trim() : trimmed.trim();
      }
    }

    // ── Hard enforce product title max 70 — cut at word boundary ──
    if (json.productTitle && json.productTitle.length > 70) {
      const trimmed = json.productTitle.slice(0, 70);
      const lastSpace = trimmed.lastIndexOf(" ");
      json.productTitle = lastSpace > 40 ? trimmed.slice(0, lastSpace).trim() : trimmed.trim();
    }

    // ── Hard enforce description 155-165 chars ──
    if (json.metaDesc) {
      if (json.metaDesc.length > 165) {
        const trimmed    = json.metaDesc.slice(0, 165);
        const lastPeriod = Math.max(trimmed.lastIndexOf(". "), trimmed.lastIndexOf("! "), trimmed.lastIndexOf("? "));
        json.metaDesc    = lastPeriod > 130 ? trimmed.slice(0, lastPeriod + 1) : trimmed.trimEnd() + ".";
      }
    }

    return json;
  } catch (e) {
    console.error("[generateOptimizedContent] parse error:", e.message, "clean was:", cleanText2?.slice(0, 300));
    return {};
  }
}

// ════════════════════════════════════════
// SHOPIFY APPLY
// ════════════════════════════════════════
async function applyToShopify(accessToken, shopDomain, product, mutations) {
  const numericId = product.id.replace("gid://shopify/Product/", "");

  // Use GraphQL productUpdate — handles both create and update in one call
  const metaMutations = mutations.filter((m) => m.field === "meta_title" || m.field === "meta_desc");

  const productTitleMutation = mutations.find((m) => m.field === "product_title");
  if (productTitleMutation) {
    const query = `
      mutation productUpdate($input: ProductInput!) {
        productUpdate(input: $input) {
          product { id title }
          userErrors { field message }
        }
      }
    `;
    const { shopifyGraphQL } = await import("./shopify-graphql.server.js");
    const data = await shopifyGraphQL({
      accessToken, shopDomain, query,
      variables: { input: { id: product.id.startsWith("gid://") ? product.id : `gid://shopify/Product/${numericId}`, title: productTitleMutation.value } },
    });
    const errors = data.data?.productUpdate?.userErrors || [];
    if (errors.length > 0) console.warn("[Apply] Product title errors:", JSON.stringify(errors));
    else console.log(`[Apply] Product title updated: "${productTitleMutation.value}"`);
  }

  if (metaMutations.length > 0) {
    const titleMutation = metaMutations.find((m) => m.field === "meta_title");
    const descMutation  = metaMutations.find((m) => m.field === "meta_desc");

    const seoInput = {};
    if (titleMutation) seoInput.title       = titleMutation.value;
    if (descMutation)  seoInput.description = descMutation.value;

    // Use seo field directly in productUpdate — this is what updates
    // the "Search engine listing" section in Shopify Admin
    const query = `
      mutation productUpdate($input: ProductInput!) {
        productUpdate(input: $input) {
          product { id seo { title description } }
          userErrors { field message }
        }
      }
    `;

    const variables = {
      input: {
        id:  product.id.startsWith("gid://") ? product.id : `gid://shopify/Product/${numericId}`,
        seo: seoInput,
      },
    };

    const { shopifyGraphQL } = await import("./shopify-graphql.server.js");
    const data = await shopifyGraphQL({ accessToken, shopDomain, query, variables });
    const errors = data.data?.productUpdate?.userErrors || [];
    const seoResult = data.data?.productUpdate?.product?.seo;

    if (errors.length > 0) {
      console.warn("[Apply] GraphQL userErrors:", JSON.stringify(errors));
    } else {
      console.log(`[Apply] SEO updated for product ${numericId}:`, JSON.stringify(seoResult));
    }

    if (data.errors) {
      console.error("[Apply] GraphQL top-level errors:", JSON.stringify(data.errors));
    }
  }

  // Alt text — REST per image
  const altMutation = mutations.find((m) => m.field === "alt_text");
  if (altMutation && Array.isArray(altMutation.value)) {
    for (let i = 0; i < product.images.length && i < altMutation.value.length; i++) {
      try {
        const imgNumId = product.images[i].id.replace("gid://shopify/ProductImage/", "");
        await shopifyRest(accessToken, shopDomain, "PUT", `products/${numericId}/images/${imgNumId}.json`, {
          image: { id: parseInt(imgNumId, 10), alt: altMutation.value[i] },
        });
        await sleep(300);
      } catch (err) {
        console.warn(`[Apply] alt_text image ${i}:`, err.message);
      }
    }
  }
}

async function applyHandleToShopify(accessToken, shopDomain, product, newHandle) {
  const numericId = product.id.replace("gid://shopify/Product/", "");
  // Shopify auto-creates redirect when handle changes
  await shopifyRest(accessToken, shopDomain, "PUT", `products/${numericId}.json`, {
    product: { id: parseInt(numericId, 10), handle: newHandle },
  });
}

async function shopifyRest(accessToken, shopDomain, method, endpoint, body) {
  const resp = await fetch(`https://${shopDomain}/admin/api/2025-04/${endpoint}`, {
    method,
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": accessToken },
    body:    JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Shopify ${method} ${endpoint}: ${resp.status} ${text.slice(0, 100)}`);
  }
  return resp.json();
}

// Export audit function for single-product inline re-audit
export async function auditProductInline(apiKey, product, brand) {
  return auditProduct(apiKey, product, brand);
}

// ════════════════════════════════════════
// DESCRIPTION OPTIMIZER
// ════════════════════════════════════════
// Tiered: Sonnet for products with no/tiny description, Haiku for existing but weak.
// Batch 5 products per call + prompt caching.

const DESC_BATCH = 5;

export async function processDescriptionOptimizeInBackground(jobId, storeId) {
  await prisma.seoJob.update({ where: { id: jobId }, data: { status: "RUNNING", startedAt: new Date() } });

  const { getValidOfflineSession } = await import("./session-helper.server.js");
  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { shopDomain: true } });
  if (!store) throw new Error("Store not found");

  const session = await getValidOfflineSession(store.shopDomain);
  const apiKey  = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Anthropic API key not configured.");

  const brand   = await getBrandSettings(storeId);
  const lang    = brand.language || "ro";

  // Find products needing description: no body, short body, or low entity score
  const candidates = await prisma.$queryRaw`
    SELECT p."productId", p."productTitle", p."aiTag", p."aiSub",
           a."entityScore", a."entityCount"
    FROM "SeoProduct" p
    LEFT JOIN "SeoAudit" a ON a."storeId" = p."storeId" AND a."productId" = p."productId"
    WHERE p."storeId" = ${storeId}
      AND (a."entityScore" IS NULL OR a."entityScore" < 70)
    ORDER BY COALESCE(a."entityScore", 0) ASC
  `;

  const total = candidates.length;
  if (total === 0) {
    await prisma.seoJob.update({ where: { id: jobId }, data: { status: "DONE", progressPct: 100, statusMessage: "All descriptions OK.", finishedAt: new Date() } });
    return;
  }

  let processed = 0;

  // Process in chunks of DESC_BATCH
  for (let i = 0; i < candidates.length; i += DESC_BATCH) {
    // Honor cancel
    const live = await prisma.seoJob.findUnique({ where: { id: jobId }, select: { status: true } });
    if (live?.status === "CANCELLED") {
      await prisma.seoJob.update({ where: { id: jobId }, data: { finishedAt: new Date(), statusMessage: `Paused — ${processed}/${total} descriptions.` } });
      return;
    }

    const chunk    = candidates.slice(i, i + DESC_BATCH);
    const pids     = chunk.map((c) => c.productId);
    const details  = await fetchProductDetails(session.accessToken, store.shopDomain, pids);

    if (details.length === 0) { processed += chunk.length; continue; }

    // Decide model: Sonnet for empty/tiny descriptions, Haiku for existing but weak
    const hasNoDesc  = details.some((d) => wordCount(stripHtmlSimple(d.description || "")) < 20);
    const model      = hasNoDesc
      ? (process.env.AI_MODEL_QUALITY || "claude-sonnet-4-6")
      : (process.env.AI_MODEL_FAST    || "claude-haiku-4-5-20251001");

    // Pull keywords + entities for each product
    const productContexts = [];
    for (const d of details) {
      const meta = chunk.find((c) => c.productId === d.id);
      let keywords = "";
      try {
        const kws = await prisma.seoCandidate.findMany({
          where: { productId: d.id, enrichedAt: { not: null } }, orderBy: { score: "desc" }, take: 5,
          select: { keyword: true, volume: true },
        });
        if (kws.length) keywords = kws.map((k) => `"${k.keyword}" (vol:${k.volume || 0})`).join(", ");
      } catch {}

      let entities = "";
      try {
        const audit = await prisma.seoAudit.findFirst({ where: { productId: d.id }, select: { entityList: true } });
        if (audit?.entityList) {
          const ents = JSON.parse(audit.entityList).filter((e) => e.salience >= 0.3).slice(0, 6);
          if (ents.length) entities = ents.map((e) => e.name).join(", ");
        }
      } catch {}

      productContexts.push({
        id: d.id, title: d.title, handle: d.handle,
        currentDesc: stripHtmlSimple(d.description || "").slice(0, 300),
        aiTag: meta?.aiTag || "", aiSub: meta?.aiSub || "",
        keywords, entities,
        imageCount: d.images?.length || 0,
      });
    }

    try {
      const descriptions = await generateDescriptionBatch(apiKey, model, productContexts, brand, lang);

      // Apply to Shopify
      for (const [pid, descHtml] of Object.entries(descriptions)) {
        if (!descHtml) continue;
        try {
          const numericId = pid.replace("gid://shopify/Product/", "");
          const { shopifyGraphQL } = await import("./shopify-graphql.server.js");
          await shopifyGraphQL({
            accessToken: session.accessToken, shopDomain: store.shopDomain,
            query: `mutation { productUpdate(input: { id: "${pid}", bodyHtml: ${JSON.stringify(descHtml)} }) { product { id } userErrors { field message } } }`,
          });
        } catch (e) { console.warn(`[DescOpt] apply ${pid}:`, e.message); }
        processed++;
      }
      // Count skipped products in this chunk
      const applied = Object.keys(descriptions).length;
      processed += (chunk.length - applied);
    } catch (e) {
      console.warn("[DescOpt] batch:", e.message);
      processed += chunk.length;
    }

    await prisma.seoJob.update({
      where: { id: jobId },
      data: { processedItems: processed, totalItems: total, progressPct: Math.round((processed / total) * 100), statusMessage: `${processed}/${total} descriptions (${model.includes("sonnet") ? "Sonnet" : "Haiku"})...` },
    });
    await sleep(RATE_LIMIT_MS);
  }

  await prisma.seoJob.update({
    where: { id: jobId },
    data: { status: "DONE", progressPct: 100, statusMessage: `Optimized ${processed} descriptions.`, finishedAt: new Date() },
  });
}

async function generateDescriptionBatch(apiKey, model, products, brand, lang) {
  const isRo = lang === "ro";

  const systemPrompt = isRo
    ? `Expert SEO copywriter pentru e-commerce România. Generezi descrieri de produs optimizate pentru:
1. ENTITY SEO — densitate mare de entități citabile (brand, model, material, dimensiuni, certificări, standarde)
2. CONVERSII — beneficii concrete, specificații tehnice, CTA
3. AI GROUNDING — structurat ca LLM-urile să poată extrage și cita informația

REGULI STRICTE:
- 150-300 cuvinte per produs (nu mai mult, nu mai puțin)
- Limba română CU diacritice corecte (ă â î ș ț)
- Structură: paragraf intro (beneficiu principal) + lista specificații (bullet points HTML <ul><li>) + paragraf final CTA
- Include MINIM 6-8 entități concrete: brand, model, material, dimensiuni, greutate, certificări, compatibilitate
- Fiecare entitate trebuie să fie FACTUALĂ — extrasă din titlu/context, nu inventată
- NU inventa specificații (nu pune dimensiuni/greutăți dacă nu le ai)
- NU folosi superlative goale ("cel mai bun", "excepțional")
- Tonul: profesional, direct, informativ
- Format HTML: <p>, <ul>, <li>, <strong> — fără headings (H1-H6), fără <br>
- NICIODATĂ cuvinte în engleză mixate cu română`
    : `Expert SEO copywriter for e-commerce. Generate product descriptions optimized for entity SEO density, conversions, and AI grounding. 150-300 words, HTML format (<p>, <ul>, <li>, <strong>), 6-8+ concrete entities, factual specs only.`;

  const productList = products.map((p, i) => {
    let ctx = `[Product ${i + 1} id="${p.id}"]\nTitle: ${p.title}\nHandle: ${p.handle}`;
    if (p.currentDesc) ctx += `\nCurrent description (first 300 chars): ${p.currentDesc}`;
    if (p.aiTag)       ctx += `\nCategory: ${p.aiTag}${p.aiSub ? ` / ${p.aiSub}` : ""}`;
    if (p.keywords)    ctx += `\nSEO Keywords: ${p.keywords}`;
    if (p.entities)    ctx += `\nKnown entities (MUST include): ${p.entities}`;
    return ctx;
  }).join("\n\n---\n\n");

  const userPrompt = isRo
    ? `Generează descrieri HTML optimizate pentru fiecare produs. Returnează DOAR JSON valid:\n{"product_id": "<p>...</p><ul><li>...</li></ul><p>...</p>"}\n\n${productList}`
    : `Generate optimized HTML descriptions for each product. Return ONLY valid JSON:\n{"product_id": "<p>...</p><ul><li>...</li></ul><p>...</p>"}\n\n${productList}`;

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    signal: AbortSignal.timeout(90000),
    body: JSON.stringify({
      model,
      max_tokens: products.length * 800,
      system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!resp.ok) throw new Error(`AI ${resp.status}: ${(await resp.text().catch(() => "")).slice(0, 200)}`);
  const data = await resp.json();
  const raw  = (data.content?.[0]?.text || "{}").trim();
  const clean = raw.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
  const match = clean.match(/\{[\s\S]*\}/);
  if (!match) return {};
  try { return JSON.parse(match[0]); } catch { return {}; }
}

function stripHtmlSimple(s) {
  return String(s || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function wordCount(s) {
  return s ? s.split(/\s+/).filter(Boolean).length : 0;
}

export { applyHandleToShopify, applyToShopify, generateOptimizedContent, fetchProductDetails };

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
