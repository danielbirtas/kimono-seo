// app/routes/api.seo.taxonomy.js
// Kimono SEO — SEO Stratul 4: Taxonomy Decisions
// Foloseste Anthropic in loc de OpenAI


const BATCH_SIZE = 8;

export const action = async({ request }) => {
  const { default: prisma } = await import("../db.server.js");
  const { requireAuth } = await import("../lib/auth/index.server.js");
  const { makeTaxonomyDecisions } = await import("../lib/seo/taxonomy.server.js");

  const { storeId } = await requireAuth(request);
  if (!storeId) return Response.json({ success: false, error: "No active store." }, { status: 400 });
  const body      = await request.json().catch(() => ({}));
  const { isFirst } = body;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return Response.json({ success: false, error: "Anthropic API key not configured." }, { status: 400 });

  const storeSettings = await prisma.storeSettings.findUnique({ where: { storeId } });
  const language      = storeSettings?.aiLanguage || "ro";
  const model         = storeSettings?.aiModel    || process.env.AI_MODEL_QUALITY || "claude-sonnet-4-6";

  if (isFirst) {
    await prisma.seoTaxonomyProposal.deleteMany({ where: { storeId } });
  }

  const processedTags = await prisma.seoTaxonomyProposal.findMany({ where: { storeId }, select: { currentTag: true } });
  const processedSet  = new Set(processedTags.map((r) => r.currentTag));

  const tagRows = await prisma.seoProduct.findMany({
    where:    { storeId, aiTag: { not: null }, NOT: { aiTag: "" } },
    distinct: ["aiTag"],
    select:   { aiTag: true },
  });

  const pendingTags = tagRows.map((r) => r.aiTag).filter((t) => t && !processedSet.has(t));

  if (pendingTags.length === 0) {
    const total = await prisma.seoTaxonomyProposal.count({ where: { storeId } });
    return Response.json({ success: true, data: { done: true, total } });
  }

  const batch      = pendingTags.slice(0, BATCH_SIZE);
  const tagBatches = await Promise.all(
    batch.map(async (currentTag) => {
      const products   = await prisma.seoProduct.findMany({ where: { storeId, aiTag: currentTag }, select: { productId: true } });
      const productIds = products.map((p) => p.productId);
      const candidates = await prisma.seoCandidate.findMany({
        where:   { storeId, productId: { in: productIds }, enrichedAt: { not: null } },
        orderBy: { score: "desc" },
        take:    20,
      });
      const kwMap = new Map();
      for (const c of candidates) {
        const existing = kwMap.get(c.keywordNorm);
        if (!existing || (c.score || 0) > (existing.score || 0)) kwMap.set(c.keywordNorm, c);
      }
      const variants = Array.from(kwMap.values()).slice(0, 10).map((c) => ({
        keyword: c.keyword, volume: c.volume || 0, score: c.score || 0,
        cpc: c.cpc || 0, competition: c.competition || "LOW",
        serpFeatures: JSON.parse(c.serpFeatures || "[]"), paaCount: c.paaCount || 0,
      }));
      return { currentTag, variants, affectedProductIds: productIds, affectedCount: productIds.length };
    })
  );

  const validBatches = tagBatches.filter((b) => b.variants.length > 0);

  if (validBatches.length === 0) {
    return Response.json({
      success: true,
      data: { done: pendingTags.length === 0, processed: 0, remaining: pendingTags.length, message: "No enriched candidates yet." },
    });
  }

  const decisions = await makeTaxonomyDecisions(apiKey, validBatches, language, model);

  for (const d of decisions) {
    await prisma.seoTaxonomyProposal.create({
      data: {
        storeId,
        currentTag:         d.currentTag,
        proposedTag:        d.proposedTag,
        proposedHandle:     d.proposedHandle,
        categoryL1:         d.categoryL1        || "",
        categoryL2:         d.categoryL2        || "",
        categoryL3:         d.categoryL3        || null,
        currentVolume:      d.currentVolume     || 0,
        proposedVolume:     d.proposedVolume    || 0,
        justification:      d.justification     || "",
        affectedProductIds: JSON.stringify(d.affectedProductIds || []),
        affectedCount:      d.affectedCount     || 0,
        status:             "PENDING",
      },
    }).catch((e) => console.warn("[Taxonomy] save failed:", e.message));
  }

  const totalProposals = await prisma.seoTaxonomyProposal.count({ where: { storeId } });
  const remaining      = pendingTags.length - batch.length;

  return Response.json({
    success: true,
    data: { done: remaining <= 0, processed: decisions.length, remaining: Math.max(0, remaining), total: totalProposals },
  });
};