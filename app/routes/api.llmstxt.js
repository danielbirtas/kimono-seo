// app/routes/api.llmstxt.js
// Kimono SEO #16 — LLMs.txt API v2

import { generateAndPublishLlmsTxt, getLlmsTxt, regenerateSection, saveSections } from "../lib/seo/llmstxt-generator.server.js";

export async function loader({ request }) {
  const { requireAuth } = await import("../lib/auth/index.server.js");
  const { store } = await requireAuth(request);
  if (!store) return Response.json({ error: "Store not found" }, { status: 404 });
  const llmsTxt = await getLlmsTxt(store.id);
  return Response.json({ llmsTxt });
}

export async function action({ request }) {
  const { requireAuth } = await import("../lib/auth/index.server.js");
  const { store, connection } = await requireAuth(request);
  if (!store) return Response.json({ error: "Store not found" }, { status: 404 });

  const body   = await request.json();
  const { intent } = body;

  if (intent === "generate") {
    try {
      const result = await generateAndPublishLlmsTxt(store.id, connection.accessToken, connection.shopDomain);
      return Response.json({ success: true, ...result });
    } catch (err) {
      console.error("[LLMs.txt API] generate error:", err);
      return Response.json({ success: false, error: err.message }, { status: 500 });
    }
  }

  if (intent === "regenerate_section") {
    try {
      const result = await regenerateSection(body.sectionId, store.id, connection.shopDomain);
      return Response.json({ success: true, ...result });
    } catch (err) { return Response.json({ success: false, error: err.message }, { status: 500 }); }
  }

  if (intent === "save_sections") {
    try {
      const result = await saveSections(store.id, body.sections, connection.shopDomain);
      return Response.json({ success: true, ...result });
    } catch (err) { return Response.json({ success: false, error: err.message }, { status: 500 }); }
  }

  if (intent === "restore_history") {
    const { default: prisma } = await import("../db.server.js");
    try {
      const historyItem = await prisma.llmsTxtHistory.findUnique({ where: { id: body.historyId } });
      if (!historyItem) return Response.json({ error: "History item not found" }, { status: 404 });
      const llmsTxt = await prisma.llmsTxt.findUnique({ where: { storeId: store.id } });
      if (!llmsTxt) return Response.json({ error: "No LLMs.txt found" }, { status: 404 });
      await prisma.llmsTxtHistory.create({ data: { llmsTxtId: llmsTxt.id, content: llmsTxt.content, score: llmsTxt.score } });
      await prisma.llmsTxt.update({ where: { storeId: store.id }, data: { content: historyItem.content, score: historyItem.score } });
      return Response.json({ success: true, content: historyItem.content });
    } catch (err) { return Response.json({ success: false, error: err.message }, { status: 500 }); }
  }

  // Fix section titles to English (one-time migration)
  if (intent === "fix_titles") {
    try {
      const existing = await prisma.llmsTxt.findUnique({ where: { storeId: store.id } });
      if (!existing) return Response.json({ error: "No LLMs.txt found" }, { status: 404 });

      const titleMap = {
        "Navigare Principală": "Core Navigation",
        "Categorii de Produse": "Product Categories",
        "Produse Disponibile": "Available Products",
        "Articole și Ghiduri": "Blog Articles & Guides",
        "Informații și Suport": "Information & Support",
        "Reduceri și Oferte": "Sale & Offers",
        "Noutăți": "New Arrivals",
      };

      const sections = JSON.parse(existing.sections || "[]");
      let changed = 0;
      for (const sec of sections) {
        if (titleMap[sec.title]) { sec.title = titleMap[sec.title]; changed++; }
        // Fix prefix "Produse: " → "Products: "
        if (sec.title?.startsWith("Produse: ")) { sec.title = "Products: " + sec.title.slice(9); changed++; }
      }

      const { saveSections } = await import("../lib/seo/llmstxt-generator.server.js");
      const result = await saveSections(store.id, sections, connection.shopDomain);
      return Response.json({ success: true, changed, sections, content: result.content });
    } catch (err) {
      return Response.json({ success: false, error: err.message }, { status: 500 });
    }
  }

  // AI-powered personalized recommendations
  if (intent === "ai_recommendations") {
    try {
      const existing = await prisma.llmsTxt.findUnique({ where: { storeId: store.id } });
      if (!existing) return Response.json({ success: false, error: "Generate LLMs.txt first" });

      const sections = JSON.parse(existing.sections || "[]");

      // Build context for Claude
      const header = sections.find(s => s.type === "header") || {};
      const productSections = sections.filter(s => s.type === "category" || s.type === "products");
      const totalProducts = productSections.reduce((n, s) => n + (s.links?.length || 0), 0);
      const categories = productSections.map(s => s.categoryName || s.title).filter(Boolean);
      const colCount = sections.find(s => s.type === "collections")?.links?.length || 0;
      const articleLinks = sections.find(s => s.type === "blog")?.links?.slice(1) || []; // skip blog homepage
      const articleTitles = articleLinks.map(l => l.title).slice(0, 15);
      const pageCount = sections.find(s => s.type === "info")?.links?.length || 0;
      const hasSale = sections.some(s => s.type === "sale");

      const prompt = `You are an SEO and GEO (Generative Engine Optimization) expert analyzing an LLMs.txt file for a Shopify store. IMPORTANT: Always respond in English, regardless of the store language.

STORE DATA:
- Brand: ${header.brandName || "Unknown"}
- Tagline: ${header.tagline || "Missing"}
- Description length: ${header.description?.length || 0} chars
- Products indexed: ${totalProducts}
- Product categories: ${categories.join(", ") || "none"}
- Collections: ${colCount}
- Blog articles: ${articleTitles.length} — titles: ${articleTitles.slice(0, 8).join(" | ")}
- Info pages: ${pageCount}
- Has sale section: ${hasSale}
- Current completeness score: ${existing.score}/100

Based on this data, generate 3-5 specific, actionable recommendations to improve LLMs.txt quality and AI crawler visibility. Focus on:
1. Content gaps (what topics/products are missing from the file)
2. Description quality (is the store well-described for AI engines?)
3. Category coverage (are all important product categories represented?)
4. Blog content alignment (do articles match product categories?)
5. GEO opportunities (what would help AI engines recommend this store more)

IMPORTANT: Be specific — mention actual categories, article topics, product types. Not generic advice.

Output ONLY a JSON array (no markdown, no preamble):
[
  {
    "icon": "emoji",
    "priority": "high|medium|low",
    "text": "Specific actionable recommendation",
    "action": "go_blog|go_onpage|go_header|go_shopify_collections|go_shopify_pages|null",
    "actionLabel": "Short English button label (e.g. Blog Generator, Run Audit, Open Shopify) or null"
  }
]`;

      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY || "", "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: process.env.AI_MODEL_QUALITY || "claude-sonnet-4-6", max_tokens: 1000, messages: [{ role: "user", content: prompt }] }),
      });
      const aiData = await resp.json();
      const text = (aiData.content?.[0]?.text || "[]").trim();
      const cleaned = text.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
      const recommendations = JSON.parse(cleaned);

      return Response.json({ success: true, recommendations });
    } catch (err) {
      console.error("[LLMs.txt AI Recs] Error:", err);
      return Response.json({ success: false, error: err.message }, { status: 500 });
    }
  }

  return Response.json({ error: "Unknown intent" }, { status: 400 });
}
