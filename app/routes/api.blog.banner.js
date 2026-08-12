// app/routes/api.blog.banner.js
// Kimono SEO — Blog Banner Image Prompt Generator


export const action = async({ request }) => {
  const { default: prisma } = await import("../db.server.js");
  const { requireAuth } = await import("../lib/auth/index.server.js");
  const { storeId } = await requireAuth(request);
  if (!storeId) return Response.json({ success: false, error: "No active store." }, { status: 400 });
  const body   = await request.json().catch(() => ({}));
  const { intent, articleId } = body;

  // ── Find matching product image from store ──
  if (intent === "find_product_image") {
    const article = await prisma.blogArticle.findUnique({ where: { id: articleId } });
    if (!article || article.storeId !== store.id) {
      return Response.json({ success: false, error: "Article not found" });
    }

    const keyword    = article.primaryKeyword || "";
    const supporting = JSON.parse(article.supportingKeywords || "[]");
    const allTerms   = [keyword, ...supporting]
      .join(" ")
      .toLowerCase()
      .split(/[\s,]+/)
      .filter((t) => t.length >= 3)
      .slice(0, 8);

    const products = await prisma.seoProduct.findMany({
      where: {
        storeId: store.id,
        status: { not: "deleted" },
        OR: allTerms.map((term) => ({
          productTitle: { contains: term, mode: "insensitive" },
        })),
      },
      take: 5,
      select: { productId: true, productTitle: true },
    });

    if (products.length === 0) {
      return Response.json({ success: true, found: false, products: [] });
    }

    const sess = await prisma.storeConnection.findFirst({
      where: { shopDomain, isActive: true }, orderBy: { connectedAt: "desc" },
    });
    if (!sess?.accessToken) {
      return Response.json({ success: true, found: false, products: [] });
    }

    const productIds = products.map((p) => p.productId);
    const query = `{
      nodes(ids: ${JSON.stringify(productIds)}) {
        ... on Product {
          id title
          images(first: 1) { edges { node { url altText } } }
        }
      }
    }`;

    const resp = await fetch(`https://${shopDomain}/admin/api/2025-04/graphql.json`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": sess.accessToken },
      body:    JSON.stringify({ query }),
    });
    const data  = await resp.json();
    const nodes = (data.data?.nodes || []).filter(Boolean);

    const results = nodes.map((n) => ({
      id:       n.id,
      title:    n.title,
      imageUrl: n.images?.edges?.[0]?.node?.url || null,
      altText:  n.images?.edges?.[0]?.node?.altText || n.title,
    })).filter((n) => n.imageUrl);

    return Response.json({
      success:   true,
      found:     results.length > 0,
      products:  results,
      bestMatch: results[0] || null,
    });
  }

  // ── Generate banner image prompt ──
  if (intent === "generate_banner_prompt") {
    const article = await prisma.blogArticle.findUnique({ where: { id: articleId } });
    if (!article || article.storeId !== store.id) {
      return Response.json({ success: false, error: "Article not found" });
    }

    try {
      const { generateBannerPrompt } = await import("../lib/seo/article-generator.server.js");
      const result = await generateBannerPrompt({
        productImageUrl:    body.productImageUrl || "",
        articleTitle:       article.h1 || article.titleTag || article.primaryKeyword,
        primaryKeyword:     article.primaryKeyword,
        productDescription: body.productDescription || "",
        articleType:        article.articleType,
        productCategory:    body.productCategory || "general",
        width:              body.width  || 1200,
        height:             body.height || 630,
      });
      return Response.json({ success: true, banner: result });
    } catch (err) {
      return Response.json({ success: false, error: err.message });
    }
  }

  return Response.json({ success: false, error: "Unknown intent" });
};