// app/routes/api.seo.enrich.js
// ═══ Kimono SEO — SEO Straturi 2+3: Candidate Extraction + DFS Enrichment ═══
// ALL server module imports are inside action() to satisfy React Router v7 code splitting.

const BATCH_SIZE = 20;

export const action = async({ request }) => {
  const { default: prisma } = await import("../db.server.js");
  const { requireAuth } = await import("../lib/auth/index.server.js");
  // Dynamic imports — required by React Router v7 for .server.js modules
  const { extractCandidates } = await import("../lib/seo/taxonomy.server.js");
  const { enrichKeywords, hasDfsConfig } = await import("../lib/seo/dataforseo.server.js");
  const { normalizeKeyword } = await import("../lib/seo/dfs-cache.server.js");

  const { storeId } = await requireAuth(request);
  if (!storeId) return Response.json({ success: false, error: "No active store." }, { status: 400 });
  const body         = await request.json().catch(() => ({}));
  const { phase }    = body;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey && phase === "extract") {
    return Response.json({ success: false, error: "Anthropic API key not configured." }, { status: 400 });
  }

  const storeSettings = await prisma.storeSettings.findUnique({ where: { storeId } });
  const language      = storeSettings?.aiLanguage || "ro";
  const model         = storeSettings?.aiModel    || "claude-haiku-4-5-20251001";

  // ── PHASE: extract ──
  if (phase === "extract") {
    const alreadyExtracted = await prisma.seoCandidate.findMany({
      where:    { storeId },
      select:   { productId: true },
      distinct: ["productId"],
    });
    const extractedIds = new Set(alreadyExtracted.map((r) => r.productId));

    const pending = await prisma.seoProduct.findMany({
      where:  { storeId },
      select: { productId: true, productTitle: true },
    });

    const batch = pending.filter((p) => !extractedIds.has(p.productId)).slice(0, BATCH_SIZE);

    if (batch.length === 0) {
      return Response.json({ success: true, data: { phase: "extract", done: true, total: pending.length, extracted: extractedIds.size } });
    }

    const results = await extractCandidates(apiKey, batch, model);

    for (const result of results) {
      for (const candidate of result.candidates) {
        const keywordNorm = normalizeKeyword(candidate);
        await prisma.seoCandidate.upsert({
          where:  { storeId_productId_keywordNorm: { storeId, productId: result.productId, keywordNorm } },
          update: {},
          create: { storeId, productId: result.productId, productTitle: result.productTitle, keyword: candidate, keywordNorm },
        }).catch(() => {});
      }
    }

    const extractedTotal = extractedIds.size + batch.length;
    return Response.json({
      success: true,
      data: { phase: "extract", done: extractedTotal >= pending.length, extracted: extractedTotal, total: pending.length, batchSize: batch.length },
    });
  }

  // ── PHASE: enrich ──
  if (phase === "enrich") {
    if (!hasDfsConfig()) {
      await prisma.seoCandidate.updateMany({
        where: { storeId, enrichedAt: null },
        data:  { enrichedAt: new Date(), score: 0, cacheHit: false },
      });
      return Response.json({ success: true, data: { phase: "enrich", done: true, message: "DataForSEO not configured, skipped." } });
    }

    const unenriched = await prisma.seoCandidate.findMany({
      where:  { storeId, enrichedAt: null },
      select: { id: true, keyword: true, keywordNorm: true },
      take:   500,
    });

    if (unenriched.length === 0) {
      const total    = await prisma.seoCandidate.count({ where: { storeId } });
      const enriched = await prisma.seoCandidate.count({ where: { storeId, enrichedAt: { not: null } } });
      return Response.json({ success: true, data: { phase: "enrich", done: true, total, enriched } });
    }

    const keywords = [...new Set(unenriched.map((c) => c.keywordNorm))];
    const enriched = await enrichKeywords(keywords, language);

    for (const candidate of unenriched) {
      const data = enriched.get(candidate.keywordNorm);
      if (!data) continue;
      await prisma.seoCandidate.update({
        where: { id: candidate.id },
        data: {
          volume:       data.volume       ?? 0,
          difficulty:   data.difficulty   ?? 0,
          cpc:          data.cpc          ?? 0,
          competition:  data.competition  ?? "LOW",
          serpFeatures: JSON.stringify(data.serpFeatures ?? []),
          paaCount:     data.paaCount     ?? 0,
          trend:        JSON.stringify(data.trend        ?? []),
          score:        data.score        ?? 0,
          enrichedAt:   new Date(),
          cacheHit:     data.fromCache    ?? false,
        },
      }).catch(() => {});
    }

    const totalCandidates = await prisma.seoCandidate.count({ where: { storeId } });
    const enrichedTotal   = await prisma.seoCandidate.count({ where: { storeId, enrichedAt: { not: null } } });

    return Response.json({
      success: true,
      data: { phase: "enrich", done: totalCandidates - enrichedTotal === 0, enriched: enrichedTotal, total: totalCandidates, remaining: totalCandidates - enrichedTotal },
    });
  }

  return Response.json({ success: false, error: "Unknown phase." }, { status: 400 });
};