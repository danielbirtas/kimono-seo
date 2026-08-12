// app/routes/api.blog.generate.js
// Kimono SEO — Blog Generator API (#07)

import { generateArticle, publishToShopify } from "../lib/seo/article-generator.server.js";
import { getAllSeoSettings } from "../lib/seo/settings.server.js";

export const action = async({ request }) => {
  const { default: prisma } = await import("../db.server.js");
  const { requireAuth } = await import("../lib/auth/index.server.js");
  const { connection, store, storeId } = await requireAuth(request);
  if (!storeId) return Response.json({ success: false, error: "No active store." }, { status: 400 });

  const shopDomain = connection.shopDomain;
  const token      = connection.accessToken;
  const body       = await request.json().catch(() => ({}));
  const { intent } = body;

  // ── List articles ──
  if (intent === "list") {
    const articles = await prisma.blogArticle.findMany({
      where:   { storeId },
      orderBy: { createdAt: "desc" },
      take:    50,
      select:  { id: true, primaryKeyword: true, articleType: true, titleTag: true, urlSlug: true, wordCount: true, status: true, generatedAt: true, publishedAt: true, clusterId: true },
    });
    const clusters = await prisma.blogCluster.findMany({ where: { storeId }, orderBy: { priorityScore: "desc" }, take: 20 });
    return Response.json({ success: true, articles, clusters });
  }

  // ── Generate article ──
  if (intent === "generate") {
    const {
      primaryKeyword, supportingKeywords = [], articleType = "pillar",
      targetWordCount = 2200, brandVoice = "conversational_expert",
      clusterId = null, language = "en",
      paaQuestions: paaFromUI = [],  // PAA questions approved by user in UI
    } = body;
    if (!primaryKeyword) return Response.json({ success: false, error: "Missing primaryKeyword" });

    const settings  = await getAllSeoSettings(storeId);
    const storeUrl  = settings.gscSiteUrl || `https://${shopDomain}`;
    const storeName = store?.shopName || shopDomain;

    const articleRecord = await prisma.blogArticle.create({
      data: {
        storeId,
        clusterId:      clusterId || null,
        primaryKeyword,
        articleType,
        targetWordCount,
        brandVoice,
        language:       language || "ro",
        status: "draft",
      },
    });

    try {
      // Use PAA questions from UI if provided (user already reviewed them)
      // Otherwise fetch from DataForSEO as before
      let paaQuestions = paaFromUI.filter(q => q?.trim());
      if (paaQuestions.length === 0) {
        try {
          const { fetchPaaQuestions, hasDfsConfig } = await import("../lib/seo/faq-paa.server.js");
          if (hasDfsConfig()) {
            const locationCode = language === "ro" ? 2040 : 2840;
            paaQuestions = await fetchPaaQuestions(primaryKeyword, locationCode, language === "ro" ? "ro" : "en");
            console.log(`[Blog] Auto-fetched ${paaQuestions.length} PAA questions for "${primaryKeyword}"`);
          }
        } catch (e) {
          console.warn("[Blog] PAA fetch failed (non-blocking):", e.message);
        }
      } else {
        console.log(`[Blog] Using ${paaQuestions.length} PAA questions approved by user`);
      }

      const result = await generateArticle({
        primaryKeyword,
        supportingKeywords,
        articleType,
        targetWordCount,
        brandVoice,
        storeUrl,
        storeName,
        language,
        paaQuestions,
      });

      // Reconnect to DB after long Claude generation (Neon may have suspended)
      await prisma.$connect().catch(() => {});
      await prisma.blogArticle.update({
        where: { id: articleRecord.id },
        data:  { titleTag: result.titleTag, metaDescription: result.metaDescription, urlSlug: result.urlSlug, h1: result.h1, content: result.content, faqSchema: result.faqSchema, blogPostingSchema: result.blogPostingSchema, internalLinks: result.internalLinks, imageBrief: result.imageBrief, wordCount: result.wordCount, status: "review", generatedAt: new Date() },
      }).catch(async () => {
        await prisma.blogArticle.upsert({
          where:  { id: articleRecord.id },
          create: { id: articleRecord.id, storeId, primaryKeyword, articleType, targetWordCount, brandVoice, titleTag: result.titleTag, metaDescription: result.metaDescription, urlSlug: result.urlSlug, h1: result.h1, content: result.content, faqSchema: result.faqSchema, blogPostingSchema: result.blogPostingSchema, wordCount: result.wordCount, status: "review", generatedAt: new Date() },
          update: { titleTag: result.titleTag, metaDescription: result.metaDescription, urlSlug: result.urlSlug, h1: result.h1, content: result.content, faqSchema: result.faqSchema, blogPostingSchema: result.blogPostingSchema, wordCount: result.wordCount, status: "review", generatedAt: new Date() },
        });
      });
      if (clusterId) await prisma.blogCluster.update({ where: { id: clusterId }, data: { status: "in_progress" } }).catch(() => {});
      return Response.json({ success: true, articleId: articleRecord.id, ...result });
    } catch (err) {
      await prisma.blogArticle.update({ where: { id: articleRecord.id }, data: { status: "failed", errorMessage: err.message } });
      return Response.json({ success: false, error: err.message });
    }
  }

  // ── Get single article ──
  if (intent === "get") {
    const article = await prisma.blogArticle.findUnique({ where: { id: body.articleId } });
    if (!article || article.storeId !== storeId) return Response.json({ success: false, error: "Not found" }, { status: 404 });
    return Response.json({ success: true, article });
  }

  // ── Publish to Shopify ──
  if (intent === "publish") {
    const article = await prisma.blogArticle.findUnique({ where: { id: body.articleId } });
    if (!article || article.storeId !== storeId) return Response.json({ success: false, error: "Not found" }, { status: 404 });

    try {
      const blogsResp = await fetch(`https://${shopDomain}/admin/api/2025-01/blogs.json?limit=10`, { headers: { "X-Shopify-Access-Token": token } });
      const blogsData = await blogsResp.json();
      const firstBlog = blogsData.blogs?.[0];
      if (!firstBlog?.id) {
        // Try GraphQL as fallback
        const gqlResp = await fetch(`https://${shopDomain}/admin/api/2025-04/graphql.json`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
          body: JSON.stringify({ query: `{ blogs(first: 5) { edges { node { id title } } } }` }),
        });
        const gqlData = await gqlResp.json();
        const gqlBlog = gqlData.data?.blogs?.edges?.[0]?.node;
        if (!gqlBlog?.id) {
          throw new Error("No blog found. Create a blog first in Shopify Admin → Online Store → Blog Posts.");
        }
        const blogId = gqlBlog.id;
        const settings = await getAllSeoSettings(storeId);
        const storeUrl = settings.gscSiteUrl || `https://${shopDomain}`;
        const published = await publishToShopify(token, shopDomain, article, blogId, storeUrl);
        if (!published?.id) throw new Error("Shopify returned no article data. Check userErrors in logs.");
        await prisma.blogArticle.update({
          where: { id: article.id },
          data:  { status: "published", shopifyArticleId: published.id, publishedAt: new Date() },
        });
        return Response.json({ success: true, shopifyArticle: published });
      }

      const blogId = `gid://shopify/Blog/${firstBlog.id}`;
      let storeUrl = `https://${shopDomain}`;
      try {
        const shopResp = await fetch(`https://${shopDomain}/admin/api/2025-01/shop.json?fields=domain`, { headers: { "X-Shopify-Access-Token": token } });
        const shopData = await shopResp.json();
        if (shopData.shop?.domain) storeUrl = `https://${shopData.shop.domain}`;
      } catch {}

      const published = await publishToShopify(token, shopDomain, article, blogId, storeUrl);
      if (!published?.id) throw new Error("Shopify returned no article data.");
      await prisma.blogArticle.update({ where: { id: article.id }, data: { status: "published", shopifyArticleId: published.id, publishedAt: new Date() } });
      return Response.json({ success: true, shopifyArticle: published });
    } catch (err) {
      return Response.json({ success: false, error: err.message });
    }
  }

  // ── Relink ──
  if (intent === "relink") {
    const article = await prisma.blogArticle.findUnique({ where: { id: body.articleId } });
    if (!article || article.storeId !== storeId) return Response.json({ success: false, error: "Article not found" });
    if (!article.content) return Response.json({ success: false, error: "Article has no content" });
    try {
      const { resolveInternalLinks, insertContextualLinks } = await import("../lib/seo/internal-linking.server.js");
      const placeholdersBefore = (article.content.match(/\[INTERNAL LINK:/g) || []).length;
      let resolvedContent = article.content, linksAdded = 0, placeholdersAfter = 0;
      if (placeholdersBefore > 0) {
        resolvedContent  = await resolveInternalLinks(article.content, storeId, shopDomain);
        placeholdersAfter = (resolvedContent.match(/\[INTERNAL LINK:/g) || []).length;
        linksAdded        = placeholdersBefore - placeholdersAfter;
      } else {
        const result = await insertContextualLinks(article.content, storeId, shopDomain);
        resolvedContent = result.content; linksAdded = result.linksAdded;
      }
      await prisma.blogArticle.update({ where: { id: body.articleId }, data: { content: resolvedContent } });

      if (article.shopifyArticleId && token) {
        const { markdownToHtml } = await import("../lib/seo/article-generator.server.js");
        const mutation = `mutation articleUpdate($id: ID!, $article: ArticleUpdateInput!) { articleUpdate(id: $id, article: $article) { article { id } userErrors { field message } } }`;
        await fetch(`https://${shopDomain}/admin/api/2025-01/graphql.json`, {
          method: "POST", headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
          body: JSON.stringify({ query: mutation, variables: { id: article.shopifyArticleId, article: { body: markdownToHtml(resolvedContent) } } }),
        }).catch(() => {});
      }
      return Response.json({ success: true, linksAdded, placeholdersBefore, placeholdersAfter });
    } catch (err) { return Response.json({ success: false, error: err.message }); }
  }

  // ── Schedule ──
  if (intent === "schedule") {
    const { articleId, scheduledDate } = body;
    const article = await prisma.blogArticle.findUnique({ where: { id: articleId } });
    if (!article || article.storeId !== storeId) return Response.json({ success: false, error: "Article not found" });
    await prisma.blogArticle.update({ where: { id: articleId }, data: { scheduledDate: scheduledDate ? new Date(scheduledDate) : null } });
    return Response.json({ success: true });
  }

  // ── Update SEO fields ──
  if (intent === "update_seo") {
    const { articleId, titleTag, metaDescription, urlSlug, h1 } = body;
    const article = await prisma.blogArticle.findUnique({ where: { id: articleId } });
    if (!article || article.storeId !== storeId) return Response.json({ success: false, error: "Article not found" });
    await prisma.blogArticle.update({
      where: { id: articleId },
      data: { ...(titleTag !== undefined && { titleTag }), ...(metaDescription !== undefined && { metaDescription }), ...(urlSlug !== undefined && { urlSlug }), ...(h1 !== undefined && { h1 }) },
    });
    return Response.json({ success: true });
  }

  // ── Delete ──
  if (intent === "delete") {
    await prisma.blogArticle.deleteMany({ where: { id: body.articleId, storeId } });
    return Response.json({ success: true });
  }

  // ── Sync clusters from GSC Triage ──
  if (intent === "sync_clusters") {
    const triageResults = await prisma.gscTriageResult.findMany({ where: { storeId, action: "BLOG" }, orderBy: { priority: "desc" }, take: 50 });
    let created = 0;
    for (const r of triageResults) {
      await prisma.blogCluster.upsert({
        where:  { storeId_primaryKeyword: { storeId, primaryKeyword: r.keyword } },
        update: { estimatedVolume: r.impressions, priorityScore: r.priority / 100 },
        create: { storeId, primaryKeyword: r.keyword, supportingKeywords: "[]", articleType: "pillar", intent: "informational", estimatedVolume: r.impressions, priorityScore: r.priority / 100, status: "pending" },
      });
      created++;
    }
    return Response.json({ success: true, synced: created });
  }

  // ── Apply featured image ──
  if (intent === "apply_image") {
    const { articleId, imageUrl, altText } = body;
    const article = await prisma.blogArticle.findUnique({ where: { id: articleId } });
    if (!article || article.storeId !== storeId) return Response.json({ success: false, error: "Article not found" });
    if (!article.shopifyArticleId) return Response.json({ success: false, error: "Article not published to Shopify yet." });
    try {
      const { setArticleFeaturedImage } = await import("../lib/seo/article-generator.server.js");
      const result = await setArticleFeaturedImage(token, shopDomain, article.shopifyArticleId, imageUrl, altText);
      await prisma.blogArticle.update({ where: { id: body.articleId }, data: { featuredImageUrl: imageUrl } }).catch(() => {});
      return Response.json({ success: true, image: result?.image });
    } catch (err) { return Response.json({ success: false, error: err.message }); }
  }

  return Response.json({ success: false, error: "Unknown intent" });
};
