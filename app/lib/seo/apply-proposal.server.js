// app/lib/seo/apply-proposal.server.js
// Centralized taxonomy proposal apply logic. Called from:
//  - api.seo.proposals.js (manual user approval flow)
//  - api.seo.job-runner.js processTaxonomyBatch (auto-apply in AUTO_PILOT mode)

import prisma from "../../db.server.js";
import { anthropicMessage } from "../anthropic.server.js";

export async function applyProposal(admin, proposal, storeId, lang, minVolume) {
  const baseProductIds = JSON.parse(proposal.affectedProductIds || "[]");
  const createdCollectionIds = [];
  const levels = [];

  if (proposal.categoryL1) levels.push({ level: "L1", name: proposal.categoryL1, handle: slugify(proposal.categoryL1), tag: slugify(proposal.categoryL1) });
  if (proposal.categoryL2 && proposal.proposedVolume >= minVolume) levels.push({ level: "L2", name: proposal.proposedTag, handle: proposal.proposedHandle, tag: slugify(proposal.proposedTag) });
  if (proposal.categoryL3 && proposal.proposedVolume >= minVolume * 2) {
    // Skip L3 if it's semantically redundant with proposedTag (shared stem: "tricicleta"/"triciclete")
    if (!namesShareStem(proposal.proposedTag, proposal.categoryL3)) {
      levels.push({ level: "L3", name: `${proposal.proposedTag} ${proposal.categoryL3}`, handle: slugify(`${proposal.proposedTag} ${proposal.categoryL3}`), tag: slugify(`${proposal.proposedTag} ${proposal.categoryL3}`) });
    }
  }

  const levelUrlMap = {};
  for (const lv of levels) levelUrlMap[lv.level] = `/collections/${lv.handle}`;

  const existingCollections = await prisma.seoKeyword.findMany({
    where: { storeId, collectionCreated: true, parentTag: proposal.categoryL1 || "" },
    take: 5, select: { keyword: true },
  }).catch(() => []);

  // Per-level product scope: broaden via aiTag stem match + include base affectedProductIds
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
      console.log(`[Apply] level ${level.level} "${level.name}" stem="${stem}" → ${ids.length} products (was ${baseProductIds.length})`);
    }
    levelProductIds.set(level.level, ids);
    // Apply ONLY this level's tag to these products
    for (const pid of ids) await addTagsToProduct(admin, pid, [level.tag]);
  }

  const { generateCollectionDescription } = await import("./taxonomy.server.js");
  const apiKey = process.env.ANTHROPIC_API_KEY || "";

  const brandRows = await prisma.seoSetting.findMany({ where: { storeId, key: { in: ["brand_name", "brand_separator", "brand_in_meta"] } } }).catch(() => []);
  const bmap = Object.fromEntries(brandRows.map(s => [s.key, s.value]));
  // Fallback brand from store shopName if not explicitly set
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
    let aiDesc = `<p>Descoperă colecția noastră de ${level.name}. Produse de calitate, cu livrare rapidă în toată România.</p>`;
    try {
      aiDesc = await generateCollectionDescription(apiKey, level.name, proposal.categoryL1 || level.name, lang);
    } catch (e) {
      console.warn(`[Apply] AI desc failed for ${level.name}:`, e.message);
    }

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

    let bodyHtml = `<p>${aiDesc}</p>`;
    if (links.length > 0) {
      const linkHtml = links.slice(0, 5).map(l => `<a href="${l.url}">${l.text}</a>`).join(" &bull; ");
      bodyHtml += `\n<p><strong>Vezi si:</strong> ${linkHtml}</p>`;
    }

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

async function generateCollectionMeta(apiKey, keyword, categoryL1, lang, brand) {
  const GOOGLE_LIMIT = 65;
  const brandSuffix  = brand.brandName && brand.brandInMeta ? ` ${brand.separator} ${brand.brandName}` : "";
  const maxTitle = brandSuffix.length > 0 ? Math.max(20, GOOGLE_LIMIT - brandSuffix.length) : GOOGLE_LIMIT;

  let skill = "";
  try {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    skill = readFileSync(join(process.cwd(), "app/lib/seo/skill/onpage-meta.md"), "utf8").slice(0, 2500);
  } catch {}

  const systemPrompt = [
    `Ești copywriter SEO nativ român cu 10+ ani experiență eCommerce. Scrii EXCLUSIV în română curată, gramatical impecabilă.`,
    ``,
    `⚠️ REGULI CRITICE (NENEGOCIABILE):`,
    `1. VOCABULAR: folosește DOAR cuvinte care EXISTĂ în DEX. NU inventa (ex: "crafitate" nu există — scrie "lucrate cu atenție"). NU calcuri din engleză.`,
    `2. ORDINEA CUVINTELOR: adjectivul posesiv (noastră, sa) vine IMEDIAT după substantivul articulat. CORECT: "inelele noastre de logodnă". GREȘIT: "inelele de logodnă noastre".`,
    `3. ACORD: verb-subiect, adjectiv-substantiv, articol-substantiv — toate corecte.`,
    `4. DIACRITICE: ă, â, î, ș, ț unde e cazul.`,
    `5. NATURALE: cum scrie un copywriter român educat, nu o traducere automată.`,
    ``,
    `META TITLE: maxim ${maxTitle} caractere. NU include brand-ul — codul îl adaugă automat la sfârșit.`,
    `Cuvinte descriptive concrete (ex: "Eleganți și Rafinați", "Pentru Momentul Perfect").`,
    ``,
    `META DESCRIPTION: 150-165 caractere. Formula: beneficiu + ofertă + diferențiator + CTA.`,
    `CTA: "Comandă acum.", "Descoperă colecția.", "Explorează oferta."`,
    `Gramatical impecabil, natural.`,
    ``,
    `Răspunde DOAR JSON: {"metaTitle":"...","metaDesc":"..."}`,
  ].join("\n");
  const userPrompt = `Keyword colecție: "${keyword}"\nCategorie: "${categoryL1}"\nLimba: ${lang}\nMax caractere metaTitle: ${maxTitle} (fără brand — se adaugă automat)`;

  const { content } = await anthropicMessage(
    { model: process.env.AI_MODEL_QUALITY || "claude-sonnet-4-6", max_tokens: 400, system: systemPrompt, messages: [{ role: "user", content: userPrompt }] },
    { apiKey }
  );
  const match = content.match(/\{[\s\S]*\}/);
  const json = match ? JSON.parse(match[0]) : {};

  // Strip brand from AI-generated title if it sneaked in (we append manually for consistency)
  let title = (json.metaTitle || "").trim();
  if (brand.brandName && title.toLowerCase().includes(brand.brandName.toLowerCase())) {
    for (const sep of [" | ", " ~ ", " - ", " · ", " — "]) {
      const idx = title.toLowerCase().lastIndexOf(sep + brand.brandName.toLowerCase());
      if (idx > 0) { title = title.slice(0, idx).trim(); break; }
    }
  }
  if (title.length > maxTitle) title = title.slice(0, maxTitle).trimEnd().replace(/[,-]+$/, "").trim();
  if (brandSuffix && brand.brandInMeta) title = title + brandSuffix;

  let desc = (json.metaDesc || "").trim();
  if (desc.length > 165) {
    const tr = desc.slice(0, 165);
    const ld = Math.max(tr.lastIndexOf(". "), tr.lastIndexOf("! "), tr.lastIndexOf("? "));
    desc = ld > 120 ? tr.slice(0, ld + 1).trim() : tr.trimEnd().replace(/[,;]+$/, "") + ".";
  }
  if (desc && desc.length < 150) {
    desc = desc.trimEnd().replace(/\.$/, "") + ". Livrare rapidă în România. Comandă acum.";
    if (desc.length > 165) desc = desc.slice(0, 162) + "...";
  }

  const fallbackTitle = `${capitalize(keyword)}${brandSuffix || " | Colecție"}`;
  return {
    seoTitle:       title || fallbackTitle,
    seoDescription: desc  || `Descoperă colecția ${keyword}. Livrare rapidă în România. Comandă acum.`,
  };
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
  const checkResp = await admin.graphql(`query findCollection($q: String!) { collections(first: 1, query: $q) { edges { node { id handle } } } }`, { variables: { q: `handle:${handle}` } });
  const checkData = await checkResp.json();
  const existing = checkData.data?.collections?.edges?.[0]?.node;
  if (existing) {
    await publishToAllChannels(admin, existing.id).catch((e) => console.warn("[createSmartCollection] publish existing failed:", e.message));
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

  if (data.errors?.length) throw new Error("Shopify GraphQL error: " + data.errors.map(e => e.message).join(", "));
  const userErrors = data.data?.collectionCreate?.userErrors || [];
  if (userErrors.length) throw new Error("Shopify userErrors: " + userErrors.map(e => e.message).join(", "));

  const id = data.data?.collectionCreate?.collection?.id;
  if (!id) throw new Error("Collection created but no ID returned for: " + handle);

  // Publish to Online Store + Shop (default retail channels). Without this, collection is draft.
  await publishToAllChannels(admin, id).catch((e) => console.warn("[createSmartCollection] publish new failed:", e.message));
  return id;
}

// Cache publication IDs per admin session
let _publicationCache = null;
async function getPublicationIds(admin) {
  if (_publicationCache) return _publicationCache;
  const resp = await admin.graphql(`{ publications(first: 20) { edges { node { id name } } } }`);
  const data = await resp.json();
  const edges = data?.data?.publications?.edges || [];
  const ids = edges
    .filter((e) => ["Online Store", "Shop"].includes(e.node.name))
    .map((e) => e.node.id);
  _publicationCache = ids;
  return ids;
}

async function publishToAllChannels(admin, collectionId) {
  const publicationIds = await getPublicationIds(admin);
  if (publicationIds.length === 0) return;
  const input = publicationIds.map((pid) => ({ publicationId: pid }));
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
  if (errs.length) console.warn("[publishToAllChannels] errors:", errs);
}

function slugify(str) {
  return (str || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").slice(0, 50);
}

// Generic connector words — ignored when extracting stem
const STOPWORDS = new Set(["pentru","copii","de","cu","si","la","in","din","pe","fara","sau","a","al","un","o"]);

// Extract a searchable stem: take longest meaningful word, strip Romanian plural/singular inflections.
// "Tricicleta Copii" → "tricicleta" → strip "a" → "triciclet" (matches both sg "tricicleta" and pl "triciclete")
// "Jucarii" → "jucarii" → strip "ii" → "jucari"
function extractStem(name) {
  if (!name) return null;
  const normalized = String(name).toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, " ");
  const words = normalized.split(/[\s-]+/).filter(w => w.length >= 4 && !STOPWORDS.has(w));
  if (words.length === 0) return null;
  const longest = words.sort((a, b) => b.length - a.length)[0];
  // Strip common Romanian inflectional endings
  const base = longest
    .replace(/(urile|elor|ilor|uri|ile|ele|ei|ii|ul|le|ea|ri)$/, "")
    .replace(/(a|e|i)$/, "");
  // Final stem: minimum 4 chars, maximum original length - 1
  const minLen = 4;
  const maxLen = Math.max(minLen, longest.length - 1);
  return base.slice(0, maxLen).slice(0, base.length >= minLen ? base.length : longest.length);
}

// Check if two names share a core stem (for L3 redundancy detection)
function namesShareStem(a, b) {
  const sA = extractStem(a);
  const sB = extractStem(b);
  if (!sA || !sB || sA.length < 4 || sB.length < 4) return false;
  return sA === sB || sA.startsWith(sB) || sB.startsWith(sA);
}

function capitalize(str) {
  return (str || "").split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

// Auto-apply eligible proposals for a store (used by TAXONOMY job + kicker).
// Returns { applied, skipped, errors } summary.
export async function autoApplyProposalsForStore(storeId) {
  const settings = await prisma.storeSettings.findUnique({ where: { storeId } });
  if (!settings?.taxonomyAutoApply) return { applied: 0, skipped: 0, errors: [], reason: "disabled" };

  const minVol = settings.taxonomyAutoMinVolume || 100;
  const lang   = settings.aiLanguage || "ro";

  const eligible = await prisma.seoTaxonomyProposal.findMany({
    where:   { storeId, status: "PENDING", proposedVolume: { gte: minVol } },
    orderBy: { proposedVolume: "desc" },
    take:    10,
  });
  if (eligible.length === 0) return { applied: 0, skipped: 0, errors: [] };

  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { shopDomain: true } });
  if (!store) return { applied: 0, skipped: 0, errors: ["store not found"] };

  const conn = await prisma.storeConnection.findFirst({
    where: { shopDomain: store.shopDomain, isActive: true },
    orderBy: { connectedAt: "desc" },
  });
  if (!conn?.accessToken) return { applied: 0, skipped: 0, errors: ["no active connection"] };

  const { createAdminClient } = await import("../integrations/shopify/client.server.js");
  const admin = createAdminClient(store.shopDomain, conn.accessToken);

  let applied = 0;
  const errors = [];
  for (const proposal of eligible) {
    try {
      await applyProposal(admin, proposal, storeId, lang, minVol);
      await prisma.seoTaxonomyProposal.update({
        where: { id: proposal.id },
        data:  { status: "APPLIED", appliedAt: new Date(), appliedBy: "auto" },
      });
      applied++;
      console.log(`[auto-apply] ${storeId} applied ${proposal.proposedTag} (vol=${proposal.proposedVolume})`);
    } catch (err) {
      errors.push({ tag: proposal.proposedTag, error: err.message });
      await prisma.seoTaxonomyProposal.update({
        where: { id: proposal.id },
        data:  { status: "FAILED" },
      }).catch(() => {});
    }
  }
  return { applied, skipped: 0, errors };
}
