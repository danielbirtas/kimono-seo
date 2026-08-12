// app/routes/api.faq.js
// Kimono SEO #20 — FAQ + PAA Extraction API

import prisma from "../db.server.js";

export async function loader({ request }) {
  const { requireAuth } = await import("../lib/auth/index.server.js");
  const { storeId, connection } = await requireAuth(request);
  if (!storeId) return Response.json({ error: "No active store" }, { status: 401 });
  const store = await prisma.store.findUnique({ where: { id: storeId } });

  const { hasDfsConfig } = await import("../lib/seo/faq-paa.server.js");
  const url = new URL(request.url);
  const articleId = url.searchParams.get("articleId");

  // Get articles that need FAQ
  const articles = await prisma.blogArticle.findMany({
    where: { storeId: store.id, status: "published" },
    orderBy: { publishedAt: "desc" },
    select: {
      id: true, primaryKeyword: true, h1: true, titleTag: true,
      urlSlug: true, faqSchema: true, publishedAt: true,
    },
  });

  const articlesWithStatus = articles.map(a => ({
    ...a,
    hasFaq: !!(a.faqSchema && a.faqSchema !== "{}" && a.faqSchema !== ""),
    faqCount: (() => {
      try {
        const s = JSON.parse(a.faqSchema || "{}");
        return s.mainEntity?.length || 0;
      } catch { return 0; }
    })(),
  }));

  return Response.json({
    articles: articlesWithStatus,
    hasDfs: hasDfsConfig(),
  });
}

export async function action({ request }) {
  const { requireAuth } = await import("../lib/auth/index.server.js");
  const { storeId, connection } = await requireAuth(request);
  if (!storeId) return Response.json({ error: "No active store" }, { status: 401 });
  const store = await prisma.store.findUnique({ where: { id: storeId } });

  const { extractAndGenerateFaq, applyFaqToArticle, batchGenerateFaq } = await import("../lib/seo/faq-paa.server.js");

  const body = await request.json();
  const { intent } = body;

  // Preview PAA questions for a keyword (no save)
  if (intent === "preview") {
    try {
      const { keyword, language = "ro" } = body;
      const result = await extractAndGenerateFaq(keyword, "", language);
      return Response.json({ success: true, ...result });
    } catch (err) {
      return Response.json({ success: false, error: err.message }, { status: 500 });
    }
  }

  // Apply FAQ to a specific article
  if (intent === "apply_article") {
    try {
      const { articleId } = body;
      const result = await applyFaqToArticle(articleId, store.id, connection.accessToken, connection.shopDomain);
      return Response.json({ success: true, ...result });
    } catch (err) {
      return Response.json({ success: false, error: err.message }, { status: 500 });
    }
  }

  // Batch generate for all articles without FAQ
  if (intent === "batch_generate") {
    try {
      const { limit = 5 } = body;
      const result = await batchGenerateFaq(store.id, connection.accessToken, connection.shopDomain, limit);
      return Response.json({ success: true, ...result });
    } catch (err) {
      return Response.json({ success: false, error: err.message }, { status: 500 });
    }
  }

  // Save edited FAQ pairs
  if (intent === "save_faq") {
    try {
      const { articleId, faqPairs } = body;
      // Build FAQPage schema inline (avoids dynamic server import)
      const schema = {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": faqPairs.filter(p => p.question && p.answer).map(p => ({
          "@type": "Question",
          "name": p.question,
          "acceptedAnswer": { "@type": "Answer", "text": p.answer },
        })),
      };
      const schemaJson = JSON.stringify(schema);

      await prisma.blogArticle.update({
        where: { id: articleId },
        data: { faqSchema: schemaJson },
      });

      // Update Shopify metafield if published
      const article = await prisma.blogArticle.findUnique({ where: { id: articleId }, select: { shopifyArticleId: true } });
      if (article?.shopifyArticleId) {
        await fetch(`https://${connection.shopDomain}/admin/api/2025-04/graphql.json`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": connection.accessToken },
          body: JSON.stringify({
            query: `mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $metafields) { userErrors { field message } } }`,
            variables: { metafields: [{ ownerId: article.shopifyArticleId, namespace: "kimono", key: "faq_schema", value: schemaJson, type: "json" }] },
          }),
        });
      }

      return Response.json({ success: true, schema });
    } catch (err) {
      return Response.json({ success: false, error: err.message }, { status: 500 });
    }
  }

  // Debug: test DataForSEO PAA fetch directly
  if (intent === "debug_paa") {
    try {
      const { keyword, language = "ro" } = body;
      const { fetchPaaQuestions, hasDfsConfig } = await import("../lib/seo/faq-paa.server.js");

      const configured = hasDfsConfig();
      if (!configured) {
        return Response.json({ success: false, error: "DataForSEO not configured", configured: false });
      }

      const locationCode = language === "ro" ? 2040 : 2840;
      const langCode     = language === "ro" ? "ro" : "en";

      // Direct DataForSEO call without cache
      const auth = Buffer.from(`${process.env.DATAFORSEO_LOGIN}:${process.env.DATAFORSEO_PASSWORD}`).toString("base64");
      const resp = await fetch("https://api.dataforseo.com/v3/serp/google/organic/live/advanced", {
        method: "POST",
        headers: { "Authorization": `Basic ${auth}`, "Content-Type": "application/json" },
        body: JSON.stringify([{ keyword, location_code: locationCode, language_code: langCode, device: "desktop", depth: 10 }]),
      });
      const data = await resp.json();

      const items = data.tasks?.[0]?.result?.[0]?.items || [];
      const paaItems = items.filter(i => i.type === "people_also_ask");
      const paaQuestions = paaItems.flatMap(i => i.items?.map(q => q.title).filter(Boolean) || []);
      const serpTypes = [...new Set(items.map(i => i.type))];

      return Response.json({
        success: true,
        configured: true,
        keyword,
        locationCode,
        langCode,
        totalItems: items.length,
        serpTypes,
        paaBlocksFound: paaItems.length,
        paaQuestions,
        taskStatus: data.tasks?.[0]?.status_message,
        rawCost: data.tasks?.[0]?.cost,
      });
    } catch (err) {
      return Response.json({ success: false, error: err.message }, { status: 500 });
    }
  }

  return Response.json({ error: "Unknown intent" }, { status: 400 });
}
