// app/routes/api.seo.tag.js
// Kimono SEO — SEO AI Tagging API

import { createAdminClient } from "../lib/integrations/shopify/client.server.js";
import { addProductTags } from "../lib/seo/shopify.server.js";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

async function tagProductsWithAnthropic(apiKey, model, products) {
  const productList = products
    .map((p, i) => `${i + 1}. ID: ${p.id} | Titlu: "${p.title}"`)
    .join("\n");

  const resp = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "x-api-key":         apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "Content-Type":      "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1500,
      system: "Expert categorizare produse e-commerce Romania. Raspunzi DOAR cu JSON valid, fara markdown.",
      messages: [{
        role: "user",
        content: `Categorizeaza aceste produse Shopify pentru SEO. Atribuie un tag principal (categoria) si un subtag (subcategoria).

PRODUSE:
${productList}

REGULI tag:
- lowercase, fara diacritice, cu cratime (ex: "tigai-fonta")
- 1-3 cuvinte, categoria produsului
- NU include brand, marime, culoare

Returneaza STRICT JSON array:
[{"id":1,"tag":"tigai-fonta","sub":"inductie"}]

DOAR JSON valid.`,
      }],
    }),
  });

  if (!resp.ok) {
    const err = await resp.text().catch(() => "");
    throw new Error(`Anthropic ${resp.status}: ${err}`);
  }

  const data    = await resp.json();
  const content = data.content?.[0]?.text?.trim() || "[]";
  const cleaned = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  const match   = cleaned.match(/\[[\s\S]*\]/);
  if (!match) throw new Error("Invalid JSON from tagging");
  return JSON.parse(match[0]);
}

export const action = async({ request }) => {
  const { default: prisma } = await import("../db.server.js");
  const { requireAuth } = await import("../lib/auth/index.server.js");
  const { connection, storeId } = await requireAuth(request);
  if (!storeId) return Response.json({ success: false, error: "No active store." }, { status: 400 });

  const admin = createAdminClient(connection.shopDomain, connection.accessToken);

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return Response.json({ success: false, error: "Anthropic API key lipseste." }, { status: 400 });

    const storeSettings = await prisma.storeSettings.findUnique({ where: { storeId } });
    const model         = storeSettings?.aiModel || process.env.AI_MODEL_FAST || "claude-haiku-4-5-20251001";

    const rows = await prisma.seoProduct.findMany({
      where:   { storeId, status: "pending" },
      orderBy: { createdAt: "asc" },
      take:    20,
    });

    if (rows.length === 0) {
      const total  = await prisma.seoProduct.count({ where: { storeId } });
      const tagged = await prisma.seoProduct.count({ where: { storeId, aiTag: { not: null }, NOT: { aiTag: "" } } });
      return Response.json({ success: true, data: { done: true, taggedBatch: 0, taggedTotal: tagged, remaining: 0, total } });
    }

    const products = rows.map((r, i) => ({ id: i + 1, title: r.productTitle }));
    let tags;
    try {
      tags = await tagProductsWithAnthropic(apiKey, model, products);
    } catch (aiError) {
      return Response.json({ success: false, error: aiError.message }, { status: 500 });
    }

    let taggedCount = 0;
    const applied   = [];
    const matched   = new Set();

    for (const td of tags) {
      const idx = (parseInt(td.id, 10) || 1) - 1;
      if (idx < 0 || idx >= rows.length) continue;

      const row = rows[idx];
      const tag = (td.tag || "").toLowerCase().replace(/[^a-z0-9-]/g, "").substring(0, 255);
      const sub = (td.sub || "").substring(0, 255);

      if (!tag) continue;

      await prisma.seoProduct.update({
        where: { id: row.id },
        data:  { aiTag: tag, aiSub: sub, status: "done", shopifyTagApplied: true },
      });

      const shopifyTags = [tag.replace(/-/g, " ")];
      if (sub && sub.toLowerCase().replace(/\s+/g, "-") !== tag) shopifyTags.push(sub);
      await addProductTags(admin, row.productId, shopifyTags);

      taggedCount++;
      matched.add(row.id);
      applied.push(`${row.productTitle.substring(0, 45)} => ${tag}`);
    }

    const unmatched = rows.filter((r) => !matched.has(r.id));
    if (unmatched.length > 0) {
      await prisma.seoProduct.updateMany({ where: { id: { in: unmatched.map((r) => r.id) } }, data: { status: "done" } });
    }

    const remaining   = await prisma.seoProduct.count({ where: { storeId, status: "pending" } });
    const taggedTotal = await prisma.seoProduct.count({ where: { storeId, aiTag: { not: null }, NOT: { aiTag: "" } } });
    const total       = await prisma.seoProduct.count({ where: { storeId } });

    return Response.json({
      success: true,
      data: { taggedBatch: taggedCount, taggedTotal, remaining, total, done: remaining === 0, applied: applied.slice(0, 10) },
    });
  } catch (error) {
    console.error("[SEO Tag]", error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
};
