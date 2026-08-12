// app/routes/api.seo.proposals.js
// ═══ Kimono SEO — SEO Proposal Management (manual approval flow) ═══
// NOTE: there is also app/lib/seo/apply-proposal.server.js with a simpler
// applyProposal for AUTO_PILOT mode. Keep both in sync when changing logic.

import { createAdminClient } from "../lib/integrations/shopify/client.server.js";
import prisma from "../db.server.js";

export const action = async({ request }) => {
  const { requireAuth } = await import("../lib/auth/index.server.js");
  const { connection, store, storeId } = await requireAuth(request);
  if (!storeId) return Response.json({ success: false, error: "No active store." }, { status: 400 });

  const admin = createAdminClient(connection.shopDomain, connection.accessToken);
  const body  = await request.json().catch(() => ({}));
  const { intent, proposalId, proposalIds } = body;

  if (intent === "approve" && proposalId) {
    await prisma.seoTaxonomyProposal.update({ where: { id: proposalId }, data: { status: "APPROVED" } });
    return Response.json({ success: true });
  }

  if (intent === "reject" && proposalId) {
    await prisma.seoTaxonomyProposal.update({ where: { id: proposalId }, data: { status: "REJECTED" } });
    return Response.json({ success: true });
  }

  if (intent === "approve_all") {
    await prisma.seoTaxonomyProposal.updateMany({ where: { storeId, status: "PENDING" }, data: { status: "APPROVED" } });
    const count = await prisma.seoTaxonomyProposal.count({ where: { storeId, status: "APPROVED" } });
    return Response.json({ success: true, count });
  }

  if (intent === "apply") {
    const storeSettings = await prisma.storeSettings.findUnique({ where: { storeId } });
    const lang = storeSettings?.aiLanguage || "ro";
    const minVolume = parseInt(
      (await prisma.seoSetting.findUnique({ where: { storeId_key: { storeId, key: "seo_min_volume" } } }))?.value || "50"
    );

    const approved = await prisma.seoTaxonomyProposal.findMany({
      where: { storeId, status: "APPROVED" }, orderBy: { proposedVolume: "desc" }, take: 10,
    });

    if (approved.length === 0) return Response.json({ success: true, message: "No approved proposals to apply.", applied: 0 });

    let applied = 0;
    const results = [];
    for (const proposal of approved) {
      try {
        const collectionIds = await applyProposal(admin, proposal, storeId, lang, minVolume);
        await prisma.seoTaxonomyProposal.update({ where: { id: proposal.id }, data: { status: "APPLIED", appliedAt: new Date(), appliedBy: "user" } });
        applied++;
        results.push({ tag: proposal.proposedTag, collections: collectionIds.length, ok: true });
      } catch (err) {
        console.error(`[Apply] ${proposal.proposedTag}:`, err.message);
        await prisma.seoTaxonomyProposal.update({ where: { id: proposal.id }, data: { status: "FAILED" } });
        results.push({ tag: proposal.proposedTag, ok: false, error: err.message });
      }
    }

    const remaining = await prisma.seoTaxonomyProposal.count({ where: { storeId, status: "APPROVED" } });
    return Response.json({ success: true, applied, remaining, results });
  }

  return Response.json({ success: false, error: "Unknown intent." }, { status: 400 });
};

async function generateCollectionMeta(apiKey, keyword, categoryL1, lang, brand) {
  const GOOGLE_LIMIT = 65;
  const brandSuffix  = brand.brandName && brand.brandInMeta
    ? ` ${brand.separator} ${brand.brandName}` : "";
  const maxTitle = brandSuffix.length > 0
    ? Math.max(20, GOOGLE_LIMIT - brandSuffix.length)
    : GOOGLE_LIMIT;

  let skill = "";
  try {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    skill = readFileSync(join(process.cwd(), "app/lib/seo/skill/onpage-meta.md"), "utf8").slice(0, 2500);
  } catch {}

  const systemPrompt = [
    skill,
    `Ești copywriter SEO nativ român cu 10+ ani experiență eCommerce. Scrii EXCLUSIV în română curată, gramatical impecabilă.`,
    ``,
    `⚠️ REGULI CRITICE (NENEGOCIABILE):`,
    `1. VOCABULAR: folosește DOAR cuvinte care EXISTĂ în DEX. NU inventa (ex: "crafitate" nu există — scrie "lucrate cu atenție"). NU calcuri din engleză.`,
    `2. ORDINEA CUVINTELOR: adjectivul posesiv (noastră, sa) vine IMEDIAT după substantivul articulat. CORECT: "inelele noastre de logodnă". GREȘIT: "inelele de logodnă noastre".`,
    `3. ACORD: verb-subiect, adjectiv-substantiv, articol-substantiv — toate corecte.`,
    `4. DIACRITICE: ă, â, î, ș, ț unde e cazul.`,
    `5. NATURALE: cum scrie un copywriter român educat, nu o traducere automată.`,
    ``,
    `Brand: "${brand.brandName || ""}" Separator: "${brand.separator || "|"}"`,
    ``,
    `META TITLE pentru COLECȚIE:`,
    `- Keyword-ul colecției primul`,
    `- Parte keyword: MIN ${Math.max(50, maxTitle - 5)} și MAX ${maxTitle} caractere`,
    `- NU include brand-ul în metaTitle — codul îl adaugă automat la sfârșit`,
    `- Cuvinte descriptive concrete (ex: "Eleganți și Rafinați", "Pentru Momentul Perfect")`,
    ``,
    `META DESCRIPTION pentru COLECȚIE:`,
    `- 150-165 caractere`,
    `- Formula: beneficiu + ce găsește clientul + diferențiator + CTA`,
    `- CTA: "Comandă acum.", "Descoperă colecția.", "Explorează oferta."`,
    `- Gramatical impecabil, natural`,
    ``,
    `Răspunde DOAR cu JSON: {"metaTitle": "...", "metaDesc": "..."}`,
  ].join("\n");

  const userPrompt = [
    `Colectie: "${keyword}"`,
    `Categorie: "${categoryL1 || keyword}"`,
    `Sufix brand de adaugat: "${brandSuffix}"`,
    `Max caractere titlu inainte de brand: ${maxTitle}`,
  ].join("\n");

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: process.env.AI_MODEL_QUALITY || "claude-sonnet-4-6", max_tokens: 400,
      system: systemPrompt, messages: [{ role: "user", content: userPrompt }] }),
  });
  if (!resp.ok) throw new Error(`Anthropic ${resp.status}`);
  const data = await resp.json();
  let raw = (data.content?.[0]?.text || "{}").trim().replace(/```json\s*/gi, "").replace(/```/g, "").trim();
  const mx = raw.match(/{[\s\S]*}/);
  if (mx) raw = mx[0];
  const json = JSON.parse(raw);

  if (json.metaTitle) {
    if (brand.brandName && json.metaTitle.includes(brand.brandName)) {
      for (const sep of [" | ", " ~ ", " - ", " · ", " — "]) {
        const idx = json.metaTitle.lastIndexOf(sep + brand.brandName);
        if (idx > 0) { json.metaTitle = json.metaTitle.slice(0, idx).trim(); break; }
      }
    }
    if (json.metaTitle.length > maxTitle)
      json.metaTitle = json.metaTitle.slice(0, maxTitle).trimEnd().replace(/[,-]+$/, "").trim();
    if (brandSuffix && brand.brandInMeta)
      json.metaTitle = json.metaTitle + brandSuffix;
    if (json.metaTitle.length > 65)
      json.metaTitle = json.metaTitle.slice(0, 65).trimEnd().replace(/[|]+$/, "").trim();
  }

  if (json.metaDesc) {
    if (json.metaDesc.length > 165) {
      const tr = json.metaDesc.slice(0, 165);
      const ld = Math.max(tr.lastIndexOf(". "), tr.lastIndexOf("! "), tr.lastIndexOf("? "));
      json.metaDesc = ld > 120 ? tr.slice(0, ld + 1).trim() : tr.trimEnd().replace(/[,;]+$/, "") + ".";
    }
    if (json.metaDesc.length < 150) {
      json.metaDesc = json.metaDesc.trimEnd().replace(/\.$/, "") + ". Livrare rapidă în România. Comandă acum.";
      if (json.metaDesc.length > 165) json.metaDesc = json.metaDesc.slice(0, 162) + "...";
    }
  }

  const fallbackTitle = `${capitalize(keyword)}${brandSuffix || " | Colecție"}`;
  return {
    seoTitle:       json.metaTitle || fallbackTitle,
    seoDescription: json.metaDesc  || `Descoperă colecția ${keyword}. Livrare rapidă în România. Comandă acum.`,
  };
}

async function applyProposal(admin, proposal, storeId, lang, minVolume) {
  const baseProductIds = JSON.parse(proposal.affectedProductIds || "[]");
  const createdCollectionIds = [];
  const levels = [];

  if (proposal.categoryL1) levels.push({ level: "L1", name: proposal.categoryL1, handle: slugify(proposal.categoryL1), tag: slugify(proposal.categoryL1) });
  if (proposal.categoryL2 && proposal.proposedVolume >= minVolume) levels.push({ level: "L2", name: proposal.proposedTag, handle: proposal.proposedHandle, tag: slugify(proposal.proposedTag) });
  if (proposal.categoryL3 && proposal.proposedVolume >= minVolume * 2) {
    // Skip L3 if stem overlaps proposedTag (handles sg/plural: "tricicleta"/"triciclete")
    if (!namesShareStem(proposal.proposedTag, proposal.categoryL3)) {
      levels.push({ level: "L3", name: `${proposal.proposedTag} ${proposal.categoryL3}`, handle: slugify(`${proposal.proposedTag} ${proposal.categoryL3}`), tag: slugify(`${proposal.proposedTag} ${proposal.categoryL3}`) });
    }
  }

  // URL map for all levels (handles known before creation)
  const levelUrlMap = {};
  for (const lv of levels) levelUrlMap[lv.level] = `/collections/${lv.handle}`;

  // Existing related collections for internal linking
  const existingCollections = await prisma.seoKeyword.findMany({
    where: { storeId, collectionCreated: true, parentTag: proposal.categoryL1 || "" },
    take: 5, select: { keyword: true },
  }).catch(() => []);

  // Per-level scope: find all products with aiTag containing level stem + base affectedProductIds.
  // Apply ONLY this level's tag to matched products. Smart collection rule EQUALS level.tag catches them.
  const levelProductIds = new Map();
  for (const level of levels) {
    const stem = extractStem(level.name);
    let ids = [...baseProductIds];
    if (stem && stem.length >= 4) {
      const matches = await prisma.seoProduct.findMany({
        where:   { storeId, status: { not: "deleted" }, aiTag: { contains: stem, mode: "insensitive" } },
        select:  { productId: true },
        take:    500,
      });
      ids = [...new Set([...ids, ...matches.map(m => m.productId)])];
      console.log(`[Apply] level ${level.level} "${level.name}" stem="${stem}" → ${ids.length} products`);
    }
    levelProductIds.set(level.level, ids);
    for (const pid of ids) await addTagsToProduct(admin, pid, [level.tag]);
  }

  const { generateCollectionDescription } = await import("../lib/seo/taxonomy.server.js");
  const apiKey = process.env.ANTHROPIC_API_KEY || "";

  const brandRows = await prisma.seoSetting.findMany({ where: { storeId, key: { in: ["brand_name", "brand_separator", "brand_in_meta"] } } }).catch(() => []);
  const bmap = Object.fromEntries(brandRows.map(s => [s.key, s.value]));
  // Fallback: derive brand from Store.shopName if brand_name not set
  let fallbackBrand = "";
  if (!bmap.brand_name) {
    const store = await prisma.store.findUnique({ where: { id: storeId }, select: { shopName: true, shopDomain: true } });
    const raw = (store?.shopName || store?.shopDomain || "").trim();
    fallbackBrand = raw.replace(/\.(ro|com|net|shop|store)$/i, "").split(/[-_.\s]+/).filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join("");
  }
  const brand = {
    brandName:   bmap.brand_name || fallbackBrand,
    separator:   bmap.brand_separator || "|",
    brandInMeta: bmap.brand_in_meta !== "false",
  };

  for (const level of levels) {
    // 1. AI description
    let aiDesc = `Descopera colectia noastra de ${level.name}. Produse de calitate, livrare rapida in toata Romania.`;
    try {
      aiDesc = await generateCollectionDescription(apiKey, level.name, proposal.categoryL1 || level.name, lang);
    } catch (e) {
      console.warn(`[Apply] AI desc failed for ${level.name}:`, e.message);
    }

    // 2. Internal links — sibling levels + existing collections
    const links = [];
    for (const [lvl, url] of Object.entries(levelUrlMap)) {
      if (lvl !== level.level) {
        const sibling = levels.find(l => l.level === lvl);
        if (sibling) links.push({ text: capitalize(sibling.name), url });
      }
    }
    for (const kw of existingCollections) {
      if (kw.keyword && kw.keyword !== level.name)
        links.push({ text: capitalize(kw.keyword), url: `/collections/${slugify(kw.keyword)}` });
    }

    // 3. bodyHtml cu descriere + internal links
    let bodyHtml = `<p>${aiDesc}</p>`;
    if (links.length > 0) {
      const linkHtml = links.slice(0, 5).map(l => `<a href="${l.url}">${l.text}</a>`).join(" &bull; ");
      bodyHtml += `
<p><strong>Vezi si:</strong> ${linkHtml}</p>`;
    }

    // 4+5. Meta title + description — same rules as On-Page Audit
    let seoTitle       = `${capitalize(level.name)} - Cumpara Online`;
    let seoDescription = "Descopera colectia " + level.name + ". Livrare rapida. Comanda acum.";
    try {
      const meta = await generateCollectionMeta(apiKey, level.name, proposal.categoryL1 || level.name, lang, brand);
      seoTitle       = meta.seoTitle;
      seoDescription = meta.seoDescription;
    } catch (e) {
      console.warn("[Apply] Meta generation failed for " + level.name + ":", e.message);
    }

    const collectionId = await createSmartCollection(admin, {
      title: capitalize(level.name), handle: level.handle, tag: level.tag,
      seoTitle, seoDescription, bodyHtml,
    });

    if (collectionId) {
      createdCollectionIds.push(collectionId);
      await prisma.seoKeyword.upsert({
        where:  { id: `${storeId}_${level.handle}` },
        update: { collectionCreated: true, collectionId },
        create: { id: `${storeId}_${level.handle}`, storeId, parentTag: proposal.categoryL1 || "", keyword: level.name, volume: proposal.proposedVolume || 0, competition: "MEDIUM", kwType: "transactional", collectionCreated: true, collectionId },
      }).catch(() => {});
    }
  }
  return createdCollectionIds;
}

async function addTagsToProduct(admin, productId, tags) {
  if (!tags.length) return;
  try {
    const resp = await admin.graphql(`mutation addTags($id: ID!, $tags: [String!]!) { tagsAdd(id: $id, tags: $tags) { userErrors { field message } } }`, { variables: { id: productId, tags } });
    const data = await resp.json();
    const errors = data.data?.tagsAdd?.userErrors || [];
    if (errors.length) console.warn("[Apply] tagsAdd errors:", errors);
  } catch (err) { console.warn("[Apply] tagsAdd failed:", err.message); }
}

async function createSmartCollection(admin, { title, handle, tag, seoTitle, seoDescription, bodyHtml = "" }) {
  // Check if collection already exists by handle
  const checkResp = await admin.graphql(`query findCollection($q: String!) { collections(first: 1, query: $q) { edges { node { id handle } } } }`, { variables: { q: `handle:${handle}` } });
  const checkData = await checkResp.json();
  if (checkData.errors?.length) console.warn("[createSmartCollection] check errors:", JSON.stringify(checkData.errors));
  const existing = checkData.data?.collections?.edges?.[0]?.node;
  if (existing) {
    console.log("[createSmartCollection] already exists:", handle, existing.id);
    await publishCollectionToChannels(admin, existing.id).catch((e) => console.warn("[createSmartCollection] publish existing failed:", e.message));
    return existing.id;
  }

  const mutation = `mutation createCollection($input: CollectionInput!) {
    collectionCreate(input: $input) {
      collection { id handle }
      userErrors { field message }
    }
  }`;
  const input = {
    title,
    descriptionHtml: bodyHtml,
    ruleSet: { appliedDisjunctively: false, rules: [{ column: "TAG", relation: "EQUALS", condition: tag }] },
    seo: { title: seoTitle, description: seoDescription },
  };
  const resp = await admin.graphql(mutation, { variables: { input } });
  const data = await resp.json();

  // Check GraphQL-level errors (auth, syntax, permissions)
  if (data.errors?.length) {
    throw new Error("Shopify GraphQL error: " + data.errors.map(e => e.message).join(", "));
  }

  const userErrors = data.data?.collectionCreate?.userErrors || [];
  if (userErrors.length) {
    throw new Error("Shopify userErrors: " + userErrors.map(e => e.message).join(", "));
  }

  const id = data.data?.collectionCreate?.collection?.id;
  if (!id) {
    console.warn("[createSmartCollection] no ID returned for handle:", handle, "response:", JSON.stringify(data));
    throw new Error("Collection created but no ID returned for: " + handle);
  }

  console.log("[createSmartCollection] created:", handle, id);
  await publishCollectionToChannels(admin, id).catch((e) => console.warn("[createSmartCollection] publish new failed:", e.message));
  return id;
}

// Publish a collection to Online Store + Shop (required in API 2025-04, "published:true" input is deprecated).
let _publicationIdsCache = null;
async function publishCollectionToChannels(admin, collectionId) {
  if (!_publicationIdsCache) {
    const resp = await admin.graphql(`{ publications(first: 20) { edges { node { id name } } } }`);
    const data = await resp.json();
    const edges = data?.data?.publications?.edges || [];
    _publicationIdsCache = edges
      .filter((e) => ["Online Store", "Shop"].includes(e.node.name))
      .map((e) => e.node.id);
  }
  if (_publicationIdsCache.length === 0) return;

  const input = _publicationIdsCache.map((pid) => ({ publicationId: pid }));
  const resp = await admin.graphql(
    `mutation publish($id: ID!, $input: [PublicationInput!]!) {
      publishablePublish(id: $id, input: $input) {
        userErrors { field message }
      }
    }`,
    { variables: { id: collectionId, input } }
  );
  const data = await resp.json();
  const errs = data?.data?.publishablePublish?.userErrors || [];
  if (errs.length) console.warn("[publishCollectionToChannels] errors:", errs);
}

const STOPWORDS_RO = new Set(["pentru","copii","de","cu","si","la","in","din","pe","fara","sau","a","al","un","o"]);

function extractStem(name) {
  if (!name) return null;
  const normalized = String(name).toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, " ");
  const words = normalized.split(/[\s-]+/).filter(w => w.length >= 4 && !STOPWORDS_RO.has(w));
  if (words.length === 0) return null;
  const longest = words.sort((a, b) => b.length - a.length)[0];
  const base = longest
    .replace(/(urile|elor|ilor|uri|ile|ele|ei|ii|ul|le|ea|ri)$/, "")
    .replace(/(a|e|i)$/, "");
  return base.length >= 4 ? base : longest.slice(0, 4);
}

function namesShareStem(a, b) {
  const sA = extractStem(a);
  const sB = extractStem(b);
  if (!sA || !sB || sA.length < 4 || sB.length < 4) return false;
  return sA === sB || sA.startsWith(sB) || sB.startsWith(sA);
}

function slugify(str) {
  return (str || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").slice(0, 50);
}
function capitalize(str) {
  return (str || "").split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}
