// app/routes/api.llm-sentiment.js
// Kimono SEO #32 — LLM Sentiment Analysis API

import prisma from "../db.server.js";

export async function loader({ request }) {
  const { requireAuth } = await import("../lib/auth/index.server.js");
  const { storeId, connection } = await requireAuth(request);
  if (!storeId) return Response.json({ error: "No active store" }, { status: 401 });
  const store = await prisma.store.findUnique({ where: { id: storeId } });

  const { getLlmSentimentResults } = await import("../lib/seo/llm-sentiment.server.js");
  const data = await getLlmSentimentResults(store.id);
  return Response.json({ data });
}

export async function action({ request }) {
  const { requireAuth } = await import("../lib/auth/index.server.js");
  const { storeId, connection } = await requireAuth(request);
  if (!storeId) return Response.json({ error: "No active store" }, { status: 401 });
  const store = await prisma.store.findUnique({ where: { id: storeId } });

  const body = await request.json().catch(() => ({}));

  if (body.intent === "scan") {
    try {
      const { runLlmSentimentAnalysis } = await import("../lib/seo/llm-sentiment.server.js");
      const result = await runLlmSentimentAnalysis(store.id, connection.shopDomain);
      return Response.json({ success: true, ...result });
    } catch (e) {
      console.error("[LLM Sentiment] error:", e.message);
      return Response.json({ success: false, error: e.message }, { status: 500 });
    }
  }

  if (body.intent === "save_brand") {
    const { brandName, domain } = body;
    await Promise.all([
      brandName && prisma.seoSetting.upsert({
        where:  { storeId_key: { storeId: store.id, key: "brand_name" } },
        create: { storeId: store.id, key: "brand_name", value: brandName },
        update: { value: brandName },
      }),
      domain && prisma.seoSetting.upsert({
        where:  { storeId_key: { storeId: store.id, key: "llm_domain" } },
        create: { storeId: store.id, key: "llm_domain", value: domain },
        update: { value: domain },
      }),
    ].filter(Boolean));
    return Response.json({ success: true });
  }

  return Response.json({ error: "Unknown intent" }, { status: 400 });
}
