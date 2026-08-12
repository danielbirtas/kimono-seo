// app/routes/api.brand-serp.js
import prisma from "../db.server.js";

export async function loader({ request }) {
  const { requireAuth } = await import("../lib/auth/index.server.js");
  const { storeId, connection } = await requireAuth(request);
  if (!storeId) return Response.json({ error: "No active store" }, { status: 401 });
  const store = await prisma.store.findUnique({ where: { id: storeId } });
  const { getBrandSerpResults } = await import("../lib/seo/brand-serp.server.js");
  return Response.json({ data: await getBrandSerpResults(store.id) });
}

export async function action({ request }) {
  const { requireAuth } = await import("../lib/auth/index.server.js");
  const { storeId, connection } = await requireAuth(request);
  if (!storeId) return Response.json({ error: "No active store" }, { status: 401 });
  const store = await prisma.store.findUnique({ where: { id: storeId } });
  const body = await request.json().catch(() => ({}));
  if (body.intent === "save_brand") {
    const { brandName, domain } = body;
    if (brandName) await prisma.seoSetting.upsert({
      where:  { storeId_key: { storeId: store.id, key: "brand_name" } },
      create: { storeId: store.id, key: "brand_name", value: brandName },
      update: { value: brandName },
    });
    if (domain) await prisma.seoSetting.upsert({
      where:  { storeId_key: { storeId: store.id, key: "brand_domain" } },
      create: { storeId: store.id, key: "brand_domain", value: domain.startsWith("http") ? domain : `https://${domain}` },
      update: { value: domain.startsWith("http") ? domain : `https://${domain}` },
    });
    if (body.socialUrls !== undefined) await prisma.seoSetting.upsert({
      where:  { storeId_key: { storeId: store.id, key: "brand_social_urls" } },
      create: { storeId: store.id, key: "brand_social_urls", value: body.socialUrls },
      update: { value: body.socialUrls },
    });
    return Response.json({ success: true });
  }

  if (body.intent === "scan") {
    try {
      const { scanBrandSerp } = await import("../lib/seo/brand-serp.server.js");
      const result = await scanBrandSerp(store.id, connection.shopDomain);
      return Response.json({ success: true, ...result });
    } catch (e) {
      return Response.json({ success: false, error: e.message }, { status: 500 });
    }
  }

  if (body.intent === "cleanup_script_tags") {
    try {
      const tagsResp = await fetch(
        `https://${connection.shopDomain}/admin/api/2025-04/script_tags.json`,
        { headers: { "X-Shopify-Access-Token": connection.accessToken } }
      );
      const tagsData = await tagsResp.json();
      const orgTags = (tagsData.script_tags || []).filter(t => t.src?.includes("org-schema"));
      for (const tag of orgTags) {
        await fetch(`https://${connection.shopDomain}/admin/api/2025-04/script_tags/${tag.id}.json`,
          { method: "DELETE", headers: { "X-Shopify-Access-Token": connection.accessToken } });
        console.log(`[Brand SERP] Deleted old script tag ${tag.id}`);
      }
      return Response.json({ success: true, deleted: orgTags.length });
    } catch (e) {
      return Response.json({ success: false, error: e.message });
    }
  }

  if (body.intent === "add_org_schema") {
    try {
      const { brandName, domain, email, phone } = body;

      // Build Organization JSON-LD
      const orgSchema = {
        "@context": "https://schema.org",
        "@type": "Organization",
        "@id": `https://${domain}#organization`,
        "name": brandName,
        "url": `https://${domain}`,
        "logo": {
          "@type": "ImageObject",
          "url": `https://${domain}/cdn/shop/files/logo.png`
        },
        "sameAs": [],
      };
      if (email) orgSchema.email = email;
      if (phone) orgSchema.telephone = phone;

      const schemaTag = `<script type="application/ld+json" id="openclaw-org-schema">
${JSON.stringify(orgSchema, null, 2)}
</script>`;

      // Inject directly into theme.liquid (requires write_themes scope)
      const themeResp = await fetch(
        `https://${connection.shopDomain}/admin/api/2025-04/themes.json`,
        { headers: { "X-Shopify-Access-Token": connection.accessToken } }
      );
      const themeData = await themeResp.json();
      const mainTheme = themeData.themes?.find(t => t.role === "main");
      if (!mainTheme) throw new Error("Main theme not found");

      const assetResp = await fetch(
        `https://${connection.shopDomain}/admin/api/2025-04/themes/${mainTheme.id}/assets.json?asset[key]=layout/theme.liquid`,
        { headers: { "X-Shopify-Access-Token": connection.accessToken } }
      );
      if (!assetResp.ok) throw new Error(`Theme asset fetch failed: ${assetResp.status}`);
      const assetData = await assetResp.json();
      let themeContent = assetData.asset?.value || "";

      // Remove existing openclaw org schema if present
      const startMarker = "<!-- openclaw-org-schema -->";
      const endMarker = "<!-- /openclaw-org-schema -->";
      const start = themeContent.indexOf(startMarker);
      const end = themeContent.indexOf(endMarker);
      if (start !== -1 && end !== -1) {
        themeContent = themeContent.slice(0, start) + themeContent.slice(end + endMarker.length);
      }

      // Insert before </head>
      const schemaBlock = `
<!-- openclaw-org-schema -->
${schemaTag}
<!-- /openclaw-org-schema -->`;
      themeContent = themeContent.replace("</head>", `${schemaBlock}
</head>`);

      // Save back to theme
      const saveResp = await fetch(
        `https://${connection.shopDomain}/admin/api/2025-04/themes/${mainTheme.id}/assets.json`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": connection.accessToken },
          body: JSON.stringify({ asset: { key: "layout/theme.liquid", value: themeContent } }),
        }
      );
      if (!saveResp.ok) {
        const errData = await saveResp.json().catch(() => ({}));
        throw new Error(`Theme save failed: ${saveResp.status} — ${JSON.stringify(errData.errors || {})}`);
      }

      // Save to DB
      await prisma.seoSetting.upsert({
        where:  { storeId_key: { storeId: store.id, key: "org_schema_added" } },
        create: { storeId: store.id, key: "org_schema_added", value: "1" },
        update: { value: "1" },
      });

      // Also inject article schema snippet if not present
      try {
        // Create snippet for article schema
        const snippetContent = `{%- if article and article.metafields.kimono.schema_json != blank -%}
<script type="application/ld+json">
  {{ article.metafields.kimono.schema_json.value }}
</script>
{%- endif -%}`;

        await fetch(
          `https://${connection.shopDomain}/admin/api/2025-04/themes/${mainTheme.id}/assets.json`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": connection.accessToken },
            body: JSON.stringify({ asset: { key: "snippets/openclaw-article-schema.liquid", value: snippetContent } }),
          }
        );

        // Check if article.liquid includes it already
        const artResp = await fetch(
          `https://${connection.shopDomain}/admin/api/2025-04/themes/${mainTheme.id}/assets.json?asset[key]=sections/main-article.liquid`,
          { headers: { "X-Shopify-Access-Token": connection.accessToken } }
        );
        if (artResp.ok) {
          const artData = await artResp.json();
          let artContent = artData.asset?.value || "";
          if (!artContent.includes("openclaw-article-schema")) {
            const renderTag = "{%" + " render 'openclaw-article-schema' " + "%}";
            artContent = renderTag + "\n" + artContent;
            await fetch(
              `https://${connection.shopDomain}/admin/api/2025-04/themes/${mainTheme.id}/assets.json`,
              {
                method: "PUT",
                headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": connection.accessToken },
                body: JSON.stringify({ asset: { key: "sections/main-article.liquid", value: artContent } }),
              }
            );
            console.log("[Brand SERP] Article schema snippet injected into main-article.liquid");
          }
        }
      } catch (snippetErr) {
        console.warn("[Brand SERP] Article snippet injection failed (non-fatal):", snippetErr.message);
      }

      console.log(`[Brand SERP] Organization schema added to theme for ${connection.shopDomain}`);
      return Response.json({ success: true });
    } catch (e) {
      console.error("[Brand SERP] add_org_schema error:", e.message);
      return Response.json({ success: false, error: e.message }, { status: 500 });
    }
  }
  if (body.intent === "cleanup_script_tags") {
    try {
      // Delete any script tags pointing to /api/org-schema.js
      const stResp = await fetch(
        `https://${connection.shopDomain}/admin/api/2025-04/script_tags.json`,
        { headers: { "X-Shopify-Access-Token": connection.accessToken } }
      );
      const stData = await stResp.json();
      const toDelete = (stData.script_tags || []).filter(t => t.src?.includes("org-schema"));
      for (const tag of toDelete) {
        await fetch(
          `https://${connection.shopDomain}/admin/api/2025-04/script_tags/${tag.id}.json`,
          { method: "DELETE", headers: { "X-Shopify-Access-Token": connection.accessToken } }
        );
        console.log(`[Brand SERP] Deleted old script tag ${tag.id}: ${tag.src}`);
      }
      return Response.json({ success: true, deleted: toDelete.length });
    } catch (e) {
      return Response.json({ success: false, error: e.message }, { status: 500 });
    }
  }

  return Response.json({ error: "Unknown intent" }, { status: 400 });
}
