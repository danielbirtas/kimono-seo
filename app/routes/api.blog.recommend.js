// app/routes/api.blog.recommend.js
// Kimono SEO — AI Blog Recommendations + Calendar API


const MODEL = process.env.AI_MODEL_FAST || "claude-haiku-4-5-20251001";

export const action = async({ request }) => {
  const { default: prisma } = await import("../db.server.js");
  const { requireAuth } = await import("../lib/auth/index.server.js");
  const { storeId } = await requireAuth(request);
  if (!storeId) return Response.json({ success: false, error: "No active store." }, { status: 400 });
  const body = await request.json().catch(() => ({}));
  const { intent } = body;

  // ── Generate AI recommendations ──
  if (intent === "generate_recommendations") {
    try {
      const [triageResults, topProducts, existingArticles, existingRecs] = await Promise.all([
        prisma.gscTriageResult.findMany({
          where: { storeId, action: "BLOG" },
          orderBy: { priority: "desc" },
          take: 20,
        }),
        prisma.seoProduct.findMany({
          where: { storeId, status: { not: "deleted" } },
          orderBy: { productTitle: "asc" },
          take: 30,
          select: { productTitle: true, productId: true },
        }),
        prisma.blogArticle.findMany({
          where: { storeId },
          select: { primaryKeyword: true },
        }),
        prisma.blogRecommendation.findMany({
          where: { storeId, status: "pending" },
          select: { primaryKeyword: true },
        }),
      ]);

      const existingKeywords = new Set([
        ...existingArticles.map((a) => a.primaryKeyword.toLowerCase()),
        ...existingRecs.map((r) => r.primaryKeyword.toLowerCase()),
      ]);

      const newTriageResults = triageResults.filter(
        (r) => !existingKeywords.has(r.keyword.toLowerCase())
      );

      if (newTriageResults.length === 0 && topProducts.length === 0) {
        return Response.json({ success: false, error: "No GSC Triage data yet. Run GSC Triage first in the Keywords page." });
      }

      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) return Response.json({ success: false, error: "ANTHROPIC_API_KEY not configured" });

      const prompt = buildRecommendationPrompt(newTriageResults, topProducts, existingKeywords, store.shopLanguage || "Romanian");

      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 4096,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!resp.ok) throw new Error(`Claude API ${resp.status}`);
      const data = await resp.json();
      const raw  = data.content?.[0]?.text || "[]";

      // Parse recommendations
      const cleanJson = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      let recs = [];
      try { recs = JSON.parse(cleanJson); } catch { recs = []; }

      // Save to DB
      let saved = 0;
      const today = new Date();
      for (let i = 0; i < recs.length; i++) {
        const r = recs[i];
        if (!r.primaryKeyword) continue;

        // Suggest dates: max 1 article per 2 days
        const suggestedDate = new Date(today);
        suggestedDate.setDate(today.getDate() + (i + 1) * 2);

        await prisma.blogRecommendation.upsert({
          where: { id: r.id || "new_" + i },
          update: {},
          create: {
            storeId,
            primaryKeyword:     r.primaryKeyword,
            supportingKeywords: JSON.stringify(r.supportingKeywords || []),
            articleType:        r.articleType || "pillar",
            targetWordCount:    r.targetWordCount || 2200,
            brandVoice:         r.brandVoice || "conversational_expert",
            rationale:          r.rationale || "",
            priorityScore:      r.priorityScore || 0,
            estimatedImpact:    r.estimatedImpact || "medium",
            suggestedDate,
            status:             "pending",
          },
        }).catch(() => {});
        saved++;
      }

      return Response.json({ success: true, generated: recs.length, saved });
    } catch (err) {
      return Response.json({ success: false, error: err.message });
    }
  }

  // ── List recommendations ──
  if (intent === "list_recommendations") {
    const recs = await prisma.blogRecommendation.findMany({
      where:   { storeId, status: body.status || "pending" },
      orderBy: { priorityScore: "desc" },
      take:    50,
    });
    return Response.json({ success: true, recommendations: recs });
  }

  // ── Accept recommendation → create article brief ──
  if (intent === "accept") {
    const rec = await prisma.blogRecommendation.findUnique({ where: { id: body.recId } });
    if (!rec || rec.storeId !== storeId) return Response.json({ success: false, error: "Not found" });

    await prisma.blogRecommendation.update({
      where: { id: body.recId },
      data:  { status: "accepted" },
    });

    // Return the pre-filled brief for the generate tab
    return Response.json({
      success: true,
      brief: {
        primaryKeyword:    rec.primaryKeyword,
        supportingKeywords: JSON.parse(rec.supportingKeywords || "[]"),
        articleType:       rec.articleType,
        targetWordCount:   rec.targetWordCount,
        brandVoice:        rec.brandVoice,
        scheduledDate:     rec.suggestedDate,
      },
    });
  }

  // ── Dismiss recommendation ──
  if (intent === "dismiss") {
    await prisma.blogRecommendation.updateMany({
      where: { id: body.recId, storeId },
      data:  { status: "dismissed" },
    });
    return Response.json({ success: true });
  }

  // ── Calendar data ──
  if (intent === "calendar") {
    const { year, month } = body; // 0-indexed month
    const startDate = new Date(year, month, 1);
    const endDate   = new Date(year, month + 1, 0);

    const [articles, recommendations] = await Promise.all([
      prisma.blogArticle.findMany({
        where: {
          storeId,
          OR: [
            { scheduledDate: { gte: startDate, lte: endDate } },
            { publishedAt:   { gte: startDate, lte: endDate } },
          ],
        },
        select: {
          id: true, primaryKeyword: true, titleTag: true, articleType: true,
          status: true, scheduledDate: true, publishedAt: true, wordCount: true,
        },
      }),
      prisma.blogRecommendation.findMany({
        where: {
          storeId,
          status: "pending",
          suggestedDate: { gte: startDate, lte: endDate },
        },
        select: {
          id: true, primaryKeyword: true, articleType: true, estimatedImpact: true,
          suggestedDate: true, priorityScore: true,
        },
      }),
    ]);

    // Map to calendar days
    const calendarMap = {};
    for (const a of articles) {
      const date = (a.scheduledDate || a.publishedAt)?.toISOString().split("T")[0];
      if (!date) continue;
      if (!calendarMap[date]) calendarMap[date] = { articles: [], recommendations: [] };
      calendarMap[date].articles.push(a);
    }
    for (const r of recommendations) {
      const date = r.suggestedDate?.toISOString().split("T")[0];
      if (!date) continue;
      if (!calendarMap[date]) calendarMap[date] = { articles: [], recommendations: [] };
      calendarMap[date].recommendations.push(r);
    }

    return Response.json({ success: true, calendarMap });
  }

  // ── Schedule article (set scheduledDate) ──
  if (intent === "schedule") {
    await prisma.blogArticle.updateMany({
      where: { id: body.articleId, storeId },
      data:  { scheduledDate: body.date ? new Date(body.date) : null },
    });
    return Response.json({ success: true });
  }

  return Response.json({ success: false, error: "Unknown intent" });
};

function buildRecommendationPrompt(triageResults, products, existingKeywords, shopLanguage) {
  // Sort by opportunity: high impressions + low clicks = untapped potential
  const sorted = [...triageResults].sort((a, b) => {
    const scoreA = (a.impressions || 0) - (a.clicks || 0) * 3;
    const scoreB = (b.impressions || 0) - (b.clicks || 0) * 3;
    return scoreB - scoreA;
  });

  const triageText = sorted.slice(0, 20).map((r) =>
    `- "${r.keyword}" (impressions: ${r.impressions}, clicks: ${r.clicks || 0}, position: ${r.position?.toFixed ? r.position.toFixed(1) : r.position}, opportunity: ${Math.round((r.impressions || 0) - (r.clicks || 0) * 3)})`
  ).join("\n");

  const productsText = products.slice(0, 20).map((p) => `- ${p.productTitle}`).join("\n");

  const langNote = shopLanguage
    ? `The store language is ${shopLanguage}. ALL keywords must be in ${shopLanguage} — do NOT translate.`
    : "Keep ALL keywords exactly as they appear in GSC — do NOT translate them.";

  return `You are an SEO content strategist. Based on real GSC keyword data, generate 8-10 blog article recommendations.

LANGUAGE RULE (CRITICAL): ${langNote}
- primaryKeyword: copy EXACTLY from GSC data — same characters, same language, same spelling
- supportingKeywords: same language as primaryKeyword — do NOT translate
- rationale: English only
- Do NOT invent keywords not in the GSC list

PRIORITY RULE: Keywords are sorted by opportunity score (impressions minus clicks×3).
High score = many impressions but few clicks = content gap = quick win.
Focus recommendations on the TOP keywords.

GSC KEYWORDS sorted by opportunity (highest first):
${triageText || "No triage data yet"}

STORE PRODUCTS:
${productsText || "No products synced"}

ALREADY COVERED — skip these:
${[...existingKeywords].slice(0, 20).join(", ") || "none"}

JSON array — each item must have:
- primaryKeyword: EXACT from GSC list
- supportingKeywords: array of 3-5 (same language)
- articleType: "pillar"|"satellite"|"listicle"|"howto"|"comparison"
- targetWordCount: 1500-3500
- brandVoice: "conversational_expert"|"professional"|"friendly"
- rationale: 1-2 sentences English
- priorityScore: 0-10
- estimatedImpact: "low"|"medium"|"high"

Return ONLY the JSON array, no markdown, no explanation.

JSON array:`;
}