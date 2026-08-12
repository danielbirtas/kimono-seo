// app/routes/api.org-schema.js
// Serves Organization JSON-LD as a JS snippet for Script Tags injection
// Called by Shopify Script Tag on every storefront page load

import prisma from "../db.server.js";

export async function loader({ request }) {
  const url  = new URL(request.url);
  const shop = url.searchParams.get("shop");

  if (!shop) {
    return new Response("// No shop", { headers: { "Content-Type": "application/javascript" } });
  }

  try {
    const store = await prisma.store.findUnique({ where: { shopDomain: shop } });
    if (!store) return new Response("// Store not found", { headers: { "Content-Type": "application/javascript" } });

    const schemaSetting = await prisma.seoSetting.findUnique({
      where: { storeId_key: { storeId: store.id, key: "org_schema_json" } },
    });

    if (!schemaSetting?.value) {
      return new Response("// No schema configured", { headers: { "Content-Type": "application/javascript" } });
    }

    // Inject as inline JSON-LD
    const js = `(function(){
  if (document.getElementById('openclaw-org-schema')) return;
  var s = document.createElement('script');
  s.type = 'application/ld+json';
  s.id = 'openclaw-org-schema';
  s.textContent = ${JSON.stringify(schemaSetting.value)};
  document.head.appendChild(s);
})();`;

    return new Response(js, {
      headers: {
        "Content-Type": "application/javascript",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (e) {
    return new Response(`// Error: ${e.message}`, { headers: { "Content-Type": "application/javascript" } });
  }
}
