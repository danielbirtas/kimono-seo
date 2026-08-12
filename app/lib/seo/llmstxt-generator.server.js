// app/lib/seo/llmstxt-generator.server.js
// Kimono SEO #16 — LLMs.txt Generator v2

import prisma from "../../db.server.js";

const MODEL_QUALITY = process.env.AI_MODEL_QUALITY || "claude-sonnet-4-6";
const MODEL_FAST    = process.env.AI_MODEL_FAST    || "claude-haiku-4-5-20251001";

async function claudeFetch(prompt, model = MODEL_FAST, maxTokens = 500) {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY || "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] }),
  });
  const data = await resp.json();
  return data.content?.[0]?.text || "";
}

const stripHtml = s => (s || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

export function computeScore(sections) {
  let score = 0;
  const breakdown = {};
  const header = sections.find(s => s.type === "header");
  breakdown.brandName   = header?.brandName?.length > 2 ? 10 : 0;
  breakdown.tagline     = header?.tagline?.length > 10  ? 10 : 0;
  breakdown.description = header?.description?.length > 30 ? 10 : 0;
  const totalProducts = sections.filter(s => s.type === "category" || s.type === "products").reduce((n, s) => n + (s.links?.length || 0), 0);
  breakdown.products    = totalProducts >= 50 ? 25 : totalProducts >= 20 ? 18 : totalProducts >= 5 ? 10 : totalProducts > 0 ? 5 : 0;
  const colCount = sections.find(s => s.type === "collections")?.links?.length || 0;
  breakdown.collections = colCount >= 10 ? 15 : colCount >= 5 ? 10 : colCount > 0 ? 5 : 0;
  const artCount = sections.find(s => s.type === "blog")?.links?.length || 0;
  breakdown.articles    = artCount >= 10 ? 15 : artCount >= 3 ? 10 : artCount > 0 ? 5 : 0;
  const pageCount = sections.find(s => s.type === "info")?.links?.length || 0;
  breakdown.pages       = pageCount >= 3 ? 10 : pageCount > 0 ? 5 : 0;
  breakdown.sale        = sections.some(s => s.type === "sale" && s.links?.length > 0) ? 5 : 0;
  for (const v of Object.values(breakdown)) score += v;
  return { score: Math.min(score, 100), breakdown };
}

export function sectionsToMarkdown(sections, domain) {
  const lines = [];
  for (const sec of sections) {
    if (sec.type === "header") {
      lines.push(`# ${sec.brandName}`); lines.push("");
      if (sec.tagline)     { lines.push(`> ${sec.tagline}`); lines.push(""); }
      if (sec.description) { lines.push(sec.description); lines.push(""); }
      if (sec.llmNote)     { lines.push(sec.llmNote); lines.push(""); }
      continue;
    }
    lines.push(`## ${sec.title}`); lines.push("");
    for (const link of (sec.links || [])) {
      lines.push(`- [${link.title}](${link.url})${link.desc ? `: ${link.desc}` : ""}`);
    }
    lines.push("");
  }
  lines.push("---"); lines.push("");
  lines.push(`This file was automatically generated for ${domain} using [Kimono SEO](${process.env.APP_URL || "http://localhost:3000"})`);
  return lines.join("\n");
}

async function fetchStoreData(storeId, accessToken, shopDomain) {
  const store = await prisma.store.findUnique({ where: { id: storeId }, include: { settings: true } });

  // All products from DB
  const products = await prisma.seoProduct.findMany({
    where: { storeId, status: { not: "deleted" } },
    orderBy: { updatedAt: "desc" },
    select: { productTitle: true, productId: true, aiTag: true, aiSub: true },
  });

  // Handles + meta from SeoAudit
  const productIds = products.map(p => p.productId);
  const audits = productIds.length > 0 ? await prisma.seoAudit.findMany({
    where: { storeId, productId: { in: productIds } },
    select: { productId: true, productHandle: true, productTitle: true },
  }) : [];
  const auditMap = Object.fromEntries(audits.map(a => [a.productId, a]));

  // For products missing handle in SeoAudit, fetch from Shopify directly (paginated)
  const missingHandles = products.filter(p => {
    const a = auditMap[p.productId];
    return !a?.productHandle || /^\d+$/.test(a.productHandle);
  });
  if (missingHandles.length > 0) {
    console.log(`[LLMs.txt] ${missingHandles.length} products missing handle — fetching from Shopify`);
    try {
      // Fetch in batches of 50 IDs
      const shopifyIds = missingHandles.map(p => p.productId.replace("gid://shopify/Product/", ""));
      for (let i = 0; i < shopifyIds.length; i += 50) {
        const batch = shopifyIds.slice(i, i + 50);
        const r = await fetch(`https://${shopDomain}/admin/api/2025-04/products.json?ids=${batch.join(",")}&fields=id,handle,title&limit=50`, {
          headers: { "X-Shopify-Access-Token": accessToken },
        });
        const d = await r.json();
        for (const p of (d.products || [])) {
          const gid = `gid://shopify/Product/${p.id}`;
          if (!auditMap[gid]) auditMap[gid] = {};
          auditMap[gid].productHandle = p.handle;
          if (!auditMap[gid].productTitle) auditMap[gid].productTitle = p.title;
        }
      }
    } catch (e) {
      console.warn("[LLMs.txt] Handle fetch failed:", e.message);
    }
  }

  // All published articles
  const articles = await prisma.blogArticle.findMany({
    where: { storeId, status: "published" },
    orderBy: { publishedAt: "desc" },
    select: { titleTag: true, h1: true, primaryKeyword: true, urlSlug: true, metaDescription: true },
  });

  // Shop info from Shopify
  let shopData = { name: store?.shopName || shopDomain, description: "", domain: shopDomain };
  try {
    const r = await fetch(`https://${shopDomain}/admin/api/2025-04/shop.json`, {
      headers: { "X-Shopify-Access-Token": accessToken },
    });
    const d = await r.json();
    if (d.shop) {
      shopData.name        = d.shop.name || shopData.name;
      shopData.description = d.shop.meta_description || d.shop.description || "";
      shopData.domain      = d.shop.domain || shopDomain;
      shopData.email       = d.shop.email || "";
      shopData.currency    = d.shop.currency || "RON";
      shopData.country     = d.shop.country_name || "Romania";
    }
  } catch {}

  // Data quality log
  const withHandle = products.filter(p => auditMap[p.productId]?.productHandle && !/^\d+$/.test(auditMap[p.productId]?.productHandle)).length;
  console.log(`[LLMs.txt] Data: ${products.length} products (${withHandle} with handles), ${articles.length} articles, shop: ${shopData.name}`);

  let pages = [];
  try {
    const r = await fetch(`https://${shopDomain}/admin/api/2025-04/pages.json?fields=title,handle&limit=250`, { headers: { "X-Shopify-Access-Token": accessToken } });
    const d = await r.json();
    pages = (d.pages || []).filter(p => /about|contact|politica|return|shipping|livrare|retur|despre|faq|termeni|privacy|gdpr/i.test(p.title + p.handle));
  } catch {}

  let collections = [];
  try {
    const [r1, r2] = await Promise.all([
      fetch(`https://${shopDomain}/admin/api/2025-04/custom_collections.json?fields=id,title,handle,body_html&limit=250`, { headers: { "X-Shopify-Access-Token": accessToken } }),
      fetch(`https://${shopDomain}/admin/api/2025-04/smart_collections.json?fields=id,title,handle,body_html&limit=250`, { headers: { "X-Shopify-Access-Token": accessToken } }),
    ]);
    const d1 = await r1.json(); const d2 = await r2.json();
    collections = [...(d1.custom_collections || []), ...(d2.smart_collections || [])];
  } catch {}

  const saleCol = collections.find(c => /reduc|sale|discount|ofert/i.test(c.handle + c.title));
  const newCol  = collections.find(c => /nout|new.arriv|nou/i.test(c.handle + c.title));
  let saleProducts = [], newProducts = [];
  for (const [col, setter] of [[saleCol, v => { saleProducts = v; }], [newCol, v => { newProducts = v; }]]) {
    if (!col) continue;
    try {
      const r = await fetch(`https://${shopDomain}/admin/api/2025-04/collections/${col.id}/products.json?fields=title,handle&limit=30`, { headers: { "X-Shopify-Access-Token": accessToken } });
      const d = await r.json(); setter(d.products || []);
    } catch {}
  }

  return { store, shopData, products, auditMap, articles, pages, collections, saleCol, newCol, saleProducts, newProducts };
}

function buildSections(data, isRo, baseUrl, storeBlockquote, storeSummary) {
  const { products, auditMap, articles, pages, collections, saleCol, newCol, saleProducts, newProducts } = data;
  const shopData = data.shopData;

  const validProducts = products.map(p => {
    const audit = auditMap[p.productId];
    const handle = audit?.productHandle;
    if (!handle || /^\d+$/.test(handle)) return null;
    return { url: `${baseUrl}/products/${handle}`, title: audit?.productTitle || p.productTitle, desc: (p.aiSub || p.aiTag || "").slice(0, 130), tag: p.aiTag || "" };
  }).filter(Boolean);

  const byCategory = {}; const uncategorized = [];
  for (const p of validProducts) {
    if (p.tag?.length > 2) { if (!byCategory[p.tag]) byCategory[p.tag] = []; byCategory[p.tag].push(p); }
    else uncategorized.push(p);
  }

  const sections = [];

  sections.push({ id: "header", type: "header", brandName: shopData.name, domain: shopData.domain, tagline: storeBlockquote, description: storeSummary, llmNote: isRo ? "LLMs care interacționează cu acest site ar trebui să înțeleagă că este un magazin online din România cu livrare rapidă și retur gratuit." : "LLMs interacting with this site should understand it is an online store with fast delivery and free returns." });

  sections.push({ id: "nav", type: "nav", title: isRo ? "Navigare Principală" : "Core Navigation", links: [
    { url: `${baseUrl}/`, title: shopData.name + " Homepage", desc: isRo ? "Punct principal de intrare — toate categoriile și ofertele curente." : "Main entry point — all categories and current offers." },
    { url: `${baseUrl}/collections/all`, title: isRo ? "Toate Produsele" : "All Products", desc: isRo ? "Catalogul complet de produse disponibile." : "Complete product catalog." },
    { url: `${baseUrl}/cart`, title: isRo ? "Coș de Cumpărături" : "Shopping Cart", desc: isRo ? "Gestionează articolele pentru cumpărare." : "Manage items for purchase." },
  ]});

  if (collections.length > 0) {
    sections.push({ id: "collections", type: "collections", title: isRo ? "Categorii de Produse" : "Product Categories", links: collections.filter(c => c.handle !== saleCol?.handle && c.handle !== newCol?.handle).map(c => ({ url: `${baseUrl}/collections/${c.handle}`, title: c.title, desc: stripHtml(c.body_html).slice(0, 120) || (isRo ? `Produse din categoria ${c.title}.` : `Browse ${c.title} products.`) })) });
  }

  for (const [cat, prods] of Object.entries(byCategory)) {
    sections.push({ id: `cat_${cat.toLowerCase().replace(/\s+/g, "_").slice(0, 30)}`, type: "category", title: `${isRo ? "Produse" : "Products"}: ${cat}`, categoryName: cat, links: prods.map(p => ({ url: p.url, title: p.title, desc: p.desc })), previewLimit: 10 });
  }

  if (uncategorized.length > 0) {
    sections.push({ id: "products_other", type: "products", title: isRo ? "Produse Disponibile" : "Available Products", links: uncategorized.map(p => ({ url: p.url, title: p.title, desc: p.desc })), previewLimit: 10 });
  }

  if (saleCol && saleProducts.length > 0) {
    sections.push({ id: "sale", type: "sale", title: isRo ? "Reduceri și Oferte" : "Sale & Offers", links: [{ url: `${baseUrl}/collections/${saleCol.handle}`, title: saleCol.title, desc: isRo ? "Toate produsele cu reducere." : "All discounted products." }, ...saleProducts.map(p => ({ url: `${baseUrl}/collections/${saleCol.handle}/products/${p.handle}`, title: p.title, desc: isRo ? "Verifică prețul redus." : "Check the discounted price." }))] });
  }

  if (newCol && newProducts.length > 0) {
    sections.push({ id: "new", type: "new", title: isRo ? "Noutăți" : "New Arrivals", links: [{ url: `${baseUrl}/collections/${newCol.handle}`, title: newCol.title, desc: isRo ? "Cele mai recent adăugate produse." : "Most recently added products." }, ...newProducts.map(p => ({ url: `${baseUrl}/collections/${newCol.handle}/products/${p.handle}`, title: p.title, desc: isRo ? "Produs nou." : "Newly listed." }))] });
  }

  if (articles.length > 0) {
    sections.push({ id: "blog", type: "blog", title: isRo ? "Articole și Ghiduri" : "Blog Articles & Guides", links: [{ url: `${baseUrl}/blogs/news`, title: isRo ? "Blog" : "News Blog", desc: isRo ? "Ghiduri, recenzii și sfaturi practice." : "Guides, reviews and practical tips." }, ...articles.map(a => ({ url: `${baseUrl}/blogs/news/${a.urlSlug}`, title: a.h1 || a.titleTag || a.primaryKeyword, desc: (a.metaDescription || a.primaryKeyword || "").slice(0, 130) }))] });
  }

  if (pages.length > 0) {
    sections.push({ id: "info", type: "info", title: isRo ? "Informații și Suport" : "Information & Support", links: pages.map(p => ({ url: `${baseUrl}/pages/${p.handle}`, title: p.title, desc: "" })) });
  }

  return sections;
}

export async function regenerateSection(sectionId, storeId, shopDomain) {
  const existing = await prisma.llmsTxt.findUnique({ where: { storeId } });
  if (!existing) throw new Error("No LLMs.txt found — generate first");
  const sections = JSON.parse(existing.sections || "[]");
  const idx = sections.findIndex(s => s.id === sectionId);
  if (idx === -1) throw new Error(`Section ${sectionId} not found`);
  const sec = sections[idx];

  const text = await claudeFetch(
    `Improve this LLMs.txt section. Make descriptions more specific for AI crawlers.\nSection: ${sec.title}\nLinks:\n${(sec.links || []).slice(0, 20).map(l => `- [${l.title}](${l.url}): ${l.desc}`).join("\n")}\n\nRules: Keep ALL URLs exactly. Improve descriptions. Output ONLY JSON array: [{"url":"...","title":"...","desc":"..."}]`,
    MODEL_FAST, 1500
  );
  try {
    const newLinks = JSON.parse(text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
    sections[idx] = { ...sec, links: newLinks };
    const content = sectionsToMarkdown(sections, shopDomain);
    const { score } = computeScore(sections);
    await prisma.llmsTxt.update({ where: { storeId }, data: { sections: JSON.stringify(sections), content, score } });
    return { sections, score };
  } catch (e) {
    throw new Error("AI returned invalid JSON: " + e.message);
  }
}

export async function saveSections(storeId, sections, shopDomain) {
  const content = sectionsToMarkdown(sections, shopDomain);
  const { score } = computeScore(sections);
  await prisma.llmsTxt.update({ where: { storeId }, data: { sections: JSON.stringify(sections), content, score } });
  return { content, score };
}

export async function generateAndPublishLlmsTxt(storeId, accessToken, shopDomain) {
  console.log(`[LLMs.txt] Generating for ${shopDomain}`);
  const data = await fetchStoreData(storeId, accessToken, shopDomain);
  const isRo = data.store?.settings?.aiLanguage !== "en";
  const baseUrl = `https://${data.shopData.domain}`;

  let storeBlockquote = "", storeSummary = "";
  try {
    const text = await claudeFetch(`Write 2 sections for LLMs.txt:\nStore: ${data.shopData.name} (${data.shopData.domain})\nDescription: ${data.shopData.description || "online store"}\nLanguage: ${isRo ? "Romanian" : "English"}\n\nOutput exactly:\nBLOCKQUOTE: [one sentence what store sells]\nDESCRIPTION: [2-3 sentences: audience, categories, market, shipping/returns]`, MODEL_QUALITY, 400);
    storeBlockquote = text.match(/BLOCKQUOTE:\s*(.+)/)?.[1]?.trim() || "";
    storeSummary    = text.match(/DESCRIPTION:\s*([\s\S]+)/)?.[1]?.trim() || "";
  } catch {}
  if (!storeBlockquote) storeBlockquote = isRo ? "Magazin online cu produse pentru casă, grădină și uz personal." : "Online store for home and garden products.";
  if (!storeSummary)    storeSummary    = isRo ? `${data.shopData.name} este un magazin online pentru consumatorii din România.` : `${data.shopData.name} is an online store.`;

  const sections = buildSections(data, isRo, baseUrl, storeBlockquote, storeSummary);
  const content  = sectionsToMarkdown(sections, data.shopData.domain);
  const { score, breakdown } = computeScore(sections);

  const existingRecord = await prisma.llmsTxt.findUnique({ where: { storeId } });

  let shopifyFileUrl = null;
  try {
    const base64 = Buffer.from(content, "utf-8").toString("base64");
    const resp = await fetch(`https://${shopDomain}/admin/api/2025-04/graphql.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": accessToken },
      body: JSON.stringify({ query: `mutation fileCreate($files: [FileCreateInput!]!) { fileCreate(files: $files) { files { ... on GenericFile { id url } } userErrors { field message } } }`, variables: { files: [{ filename: "llms.txt", mimeType: "text/plain", resource: "FILE", contentType: "FILE", originalSource: `data:text/plain;base64,${base64}` }] } }),
    });
    const d = await resp.json();
    shopifyFileUrl = d.data?.fileCreate?.files?.[0]?.url || null;
  } catch (e) { console.warn("[LLMs.txt] Publish failed:", e.message); }

  const record = await prisma.llmsTxt.upsert({
    where: { storeId },
    create: { storeId, content, sections: JSON.stringify(sections), score, publishedAt: new Date(), shopifyFileUrl },
    update: { content, sections: JSON.stringify(sections), score, publishedAt: new Date(), shopifyFileUrl },
  });

  if (existingRecord?.content) {
    await prisma.llmsTxtHistory.create({ data: { llmsTxtId: record.id, content: existingRecord.content, score: existingRecord.score || 0 } });
    const history = await prisma.llmsTxtHistory.findMany({ where: { llmsTxtId: record.id }, orderBy: { createdAt: "desc" } });
    if (history.length > 5) await prisma.llmsTxtHistory.deleteMany({ where: { id: { in: history.slice(5).map(h => h.id) } } });
  }

  console.log(`[LLMs.txt] Done — score: ${score}, ${content.length} chars, ${sections.length} sections`);
  return { content, sections, score, breakdown, shopifyFileUrl, charCount: content.length };
}

export async function getLlmsTxt(storeId) {
  return prisma.llmsTxt.findUnique({ where: { storeId }, include: { history: { orderBy: { createdAt: "desc" }, take: 5 } } });
}
