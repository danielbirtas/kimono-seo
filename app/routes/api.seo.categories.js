// app/routes/api.seo.categories.js
// Kimono SEO — SEO Categories (Automated Collections) API

import { createAdminClient } from "../lib/integrations/shopify/client.server.js";
import { getAllSeoSettings } from "../lib/seo/settings.server.js";
import { generateCollectionDescription } from "../lib/seo/taxonomy.server.js";
import { createAutomatedCollection } from "../lib/seo/shopify.server.js";

export const action = async({ request }) => {
  const { default: prisma } = await import("../db.server.js");
  const { requireAuth } = await import("../lib/auth/index.server.js");
  const { connection, storeId } = await requireAuth(request);
  if (!storeId) return Response.json({ success: false, error: "No active store." }, { status: 400 });

  const admin = createAdminClient(connection.shopDomain, connection.accessToken);

  try {
    const settings  = await getAllSeoSettings(storeId);
    const apiKey    = process.env.ANTHROPIC_API_KEY;
    const minVolume = settings.minVolume || 50;

    const keywords = await prisma.seoKeyword.findMany({
      where:   { storeId, collectionCreated: false, volume: { gte: minVolume }, kwType: { in: ["transactional", "comparative"] } },
      orderBy: { volume: "desc" },
      take:    5,
    });

    if (keywords.length === 0) {
      const createdTotal = await prisma.seoKeyword.count({ where: { storeId, collectionCreated: true } });
      return Response.json({ success: true, data: { done: true, createdBatch: 0, createdTotal, remaining: 0, errors: [], createdNames: [] } });
    }

    let created = 0;
    const errors = [], createdNames = [];

    for (const kw of keywords) {
      try {
        const tagForRule = kw.parentTag.replace(/-/g, " ");
        const descHtml = apiKey ? await generateCollectionDescription(apiKey, kw.keyword, tagForRule, "ro") : "";
        const title = kw.keyword.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
        const collectionId = await createAutomatedCollection(admin, {
          title, tag: tagForRule, descriptionHtml: descHtml,
          seoTitle: `${title} | Cumpara Online`, seoDescription: `Descopera produse ${kw.keyword}. Livrare rapida.`,
        });
        await prisma.seoKeyword.update({ where: { id: kw.id }, data: { collectionCreated: true, collectionId: collectionId || null } });
        created++;
        createdNames.push(kw.keyword);
      } catch (err) {
        errors.push(`${kw.keyword}: ${err.message}`);
        await prisma.seoKeyword.update({ where: { id: kw.id }, data: { collectionCreated: true } });
      }
    }

    const remaining    = await prisma.seoKeyword.count({ where: { storeId, collectionCreated: false, volume: { gte: minVolume }, kwType: { in: ["transactional", "comparative"] } } });
    const createdTotal = await prisma.seoKeyword.count({ where: { storeId, collectionCreated: true } });
    return Response.json({ success: true, data: { createdBatch: created, createdTotal, remaining, done: remaining === 0, errors, createdNames } });
  } catch (error) {
    console.error("[SEO Categories]", error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
};
