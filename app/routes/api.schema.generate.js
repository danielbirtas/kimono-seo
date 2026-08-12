// app/routes/api.schema.generate.js
// Kimono SEO — Schema Markup API (#08)

import { fetchProductForSchema, generateProductSchema, applySchemaToShopify } from "../lib/seo/schema-generator.server.js";

const BULK_MUTATION = `
  mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { key namespace ownerType }
      userErrors { field message }
    }
  }
`;

export const action = async({ request }) => {
  const { default: prisma } = await import("../db.server.js");
  const { requireAuth } = await import("../lib/auth/index.server.js");
  const { connection, storeId } = await requireAuth(request);
  if (!storeId) return Response.json({ success: false, error: "No active store." }, { status: 400 });

  const { accessToken: token, shopDomain } = connection;
  const body = await request.json().catch(() => ({}));
  const { intent, productId, productIds } = body;

  if (intent === "preview") {
    if (!productId) return Response.json({ success: false, error: "Missing productId" });
    try {
      const product = await fetchProductForSchema(token, shopDomain, productId);
      const schema  = generateProductSchema(product, shopDomain);
      return Response.json({ success: true, schema, product: { title: product.title, handle: product.handle } });
    } catch (err) { return Response.json({ success: false, error: err.message }); }
  }

  if (intent === "apply_one") {
    if (!productId) return Response.json({ success: false, error: "Missing productId" });
    try {
      const product = await fetchProductForSchema(token, shopDomain, productId);
      const schema  = generateProductSchema(product, shopDomain);
      await applySchemaToShopify(token, shopDomain, productId, schema);
      await prisma.seoSchema.upsert({
        where:  { storeId_productId: { storeId, productId } },
        update: { schemaJson: JSON.stringify(schema), status: "applied", appliedAt: new Date(), errorMessage: null, productTitle: product.title, productHandle: product.handle },
        create: { storeId, productId, productTitle: product.title, productHandle: product.handle, schemaJson: JSON.stringify(schema), schemaType: "Product", status: "applied", appliedAt: new Date() },
      });
      return Response.json({ success: true, productId, productTitle: product.title });
    } catch (err) {
      await prisma.seoSchema.upsert({
        where:  { storeId_productId: { storeId, productId } },
        update: { status: "error", errorMessage: err.message },
        create: { storeId, productId, productTitle: "", productHandle: "", schemaJson: "{}", status: "error", errorMessage: err.message },
      }).catch(() => {});
      return Response.json({ success: false, error: err.message });
    }
  }

  if (intent === "apply_batch") {
    const ids = productIds || [];
    if (ids.length === 0) return Response.json({ success: false, error: "No products specified" });

    let applied = 0, errors = 0;
    const results = [], dbUpdates = [], allItems = [];

    for (const pid of ids.slice(0, 200)) {
      try {
        const product = await fetchProductForSchema(token, shopDomain, pid);
        const schema  = generateProductSchema(product, shopDomain);
        allItems.push({ productId: pid, product, schema });
      } catch (err) { errors++; results.push({ productId: pid, status: "error", error: err.message }); }
      await new Promise((r) => setTimeout(r, 200));
    }

    const chunks = [];
    for (let i = 0; i < allItems.length; i += 25) chunks.push(allItems.slice(i, i + 25));

    for (const chunk of chunks) {
      try {
        const metafields = chunk.map(({ productId, schema }) => ({
          ownerId: productId, namespace: "kimono", key: "schema_json", value: JSON.stringify(schema), type: "json",
        }));
        const resp = await fetch(`https://${shopDomain}/admin/api/2025-01/graphql.json`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
          body:   JSON.stringify({ query: BULK_MUTATION, variables: { metafields } }),
        });
        const data  = await resp.json();
        const errs2 = data.data?.metafieldsSet?.userErrors || [];
        if (errs2.length > 0) throw new Error(errs2.map((e) => e.message).join(", "));

        for (const { productId, product, schema } of chunk) {
          applied++;
          results.push({ productId, title: product.title, status: "applied" });
          dbUpdates.push(prisma.seoSchema.upsert({
            where:  { storeId_productId: { storeId, productId } },
            update: { schemaJson: JSON.stringify(schema), status: "applied", appliedAt: new Date(), errorMessage: null, productTitle: product.title, productHandle: product.handle },
            create: { storeId, productId, productTitle: product.title, productHandle: product.handle, schemaJson: JSON.stringify(schema), schemaType: "Product", status: "applied", appliedAt: new Date() },
          }));
        }
      } catch (err) {
        errors += chunk.length;
        for (const { productId } of chunk) results.push({ productId, status: "error", error: err.message });
      }
      await new Promise((r) => setTimeout(r, 500));
    }

    await Promise.all(dbUpdates).catch(console.error);
    return Response.json({ success: true, applied, errors, total: ids.length, results });
  }

  if (intent === "status") {
    const [total, appliedCount, withErrors] = await Promise.all([
      prisma.seoAudit.count({ where: { storeId } }),
      prisma.seoSchema.count({ where: { storeId, status: "applied" } }),
      prisma.seoSchema.count({ where: { storeId, status: "error" } }),
    ]);
    const schemas = await prisma.seoSchema.findMany({
      where: { storeId }, select: { productId: true, productTitle: true, productHandle: true, status: true, appliedAt: true }, orderBy: { appliedAt: "desc" }, take: 200,
    });
    return Response.json({ success: true, total, applied: appliedCount, withErrors, schemas });
  }

  return Response.json({ success: false, error: "Unknown intent" });
};
