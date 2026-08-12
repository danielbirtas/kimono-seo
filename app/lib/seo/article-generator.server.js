// app/lib/seo/article-generator.server.js
// Kimono SEO — Blog Article Generator (#07)
// Generates SEO+AEO+GEO optimized articles using Claude + article-generator skill
// Template: BLUF structure, E-E-A-T signals, FAQPage schema, internal linking specs

import { readFileSync } from "fs";
import prisma from "../../db.server.js";
import { join } from "path";

const MODEL = process.env.AI_MODEL_QUALITY || "claude-sonnet-4-6";
const MAX_TOKENS = 8192;

// Load skill files once at module level
function loadSkill(filename) {
  const candidates = [
    join(process.cwd(), `app/lib/seo/skill/${filename}`),
    `/app/app/lib/seo/skill/${filename}`,
  ];
  for (const p of candidates) {
    try { return readFileSync(p, "utf8"); } catch {}
  }
  return "";
}

const SKILL_ARTICLE    = loadSkill("article-generator.md");
const SKILL_TYPES      = loadSkill("article-types.md");
const SKILL_VOICE      = loadSkill("voice-guidelines.md");
const SKILL_SCHEMA     = loadSkill("schema-markup.md");

/**
 * Generate a complete blog article package
 */
export async function generateArticle(brief) {
  const {
    primaryKeyword,
    supportingKeywords = [],
    articleType = "pillar",
    targetWordCount = 2200,
    brandVoice = "conversational_expert",
    storeUrl = "",
    storeName = "",
    language = "en",
  } = brief;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const systemPrompt = buildSystemPrompt();
  const userPrompt   = buildUserPrompt(brief);

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type":         "application/json",
      "x-api-key":            apiKey,
      "anthropic-version":    "2023-06-01",
    },
    body: JSON.stringify({
      model:      MODEL,
      max_tokens: MAX_TOKENS,
      // System prompt has ~7KB of skill-reference text that's identical
      // across articles — cache it so the second+ article in a batch
      // pays only ~10% input cost on that prefix.
      system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
      messages:   [{ role: "user", content: userPrompt }],
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Claude API ${resp.status}: ${err}`);
  }

  const data    = await resp.json();
  const rawText = data.content?.[0]?.text || "";

  return parseArticleOutput(rawText, brief);
}

function buildSystemPrompt() {
  return `You are the Kimono SEO article generator for Shopify stores.
You produce long-form blog content optimized for SEO ranking, GEO citation (AI search engines), and AEO featured snippet capture.

SKILL REFERENCE — Article Generator:
${SKILL_ARTICLE.slice(0, 3000)}

ARTICLE TYPES REFERENCE:
${SKILL_TYPES.slice(0, 2000)}

VOICE GUIDELINES:
${SKILL_VOICE.slice(0, 1500)}

SCHEMA REFERENCE:
${SKILL_SCHEMA.slice(0, 1000)}

OUTPUT FORMAT: Always output the complete article package in this EXACT structure with these EXACT section markers:
===SEO_FIELDS===
TITLE_TAG: [50-60 chars]
META_DESC: [150-160 chars]
URL_SLUG: [kebab-case]
H1: [article title]
===ARTICLE===
[Full article content in markdown]
===FAQ_SCHEMA===
[FAQPage JSON-LD only — valid JSON]
===BLOGPOSTING_SCHEMA===
[BlogPosting JSON-LD only — valid JSON]
===INTERNAL_LINKS===
[JSON array of internal link objects]
===IMAGE_BRIEF===
[JSON array of image brief objects]
===END===`;
}

function buildUserPrompt(brief) {
  const {
    primaryKeyword,
    supportingKeywords,
    articleType,
    targetWordCount,
    brandVoice,
    storeUrl,
    storeName,
    language,
    paaQuestions = [],
  } = brief;

  const voiceLabel = {
    conversational_expert: "Conversational Expert",
    professional:          "Professional",
    friendly:              "Friendly",
    expert:                "Expert",
  }[brandVoice] || "Conversational Expert";

  const typeLabel = {
    pillar:      "Pillar article (informational, comprehensive, 2500-3500 words)",
    satellite:   "Satellite article (specific sub-topic, 1000-1500 words)",
    listicle:    "Listicle / Best-of (commercial investigation, 2000-2500 words)",
    howto:       "How-to / Tutorial (step-by-step, 1800-2500 words)",
    comparison:  "Comparison / Versus (2 or more options, 1800-2200 words)",
  }[articleType] || "Pillar article";

  return `Generate a complete article package for the following brief:

PRIMARY KEYWORD: "${primaryKeyword}"
SUPPORTING KEYWORDS: ${JSON.stringify(supportingKeywords)}
ARTICLE TYPE: ${typeLabel}
TARGET WORD COUNT: ${targetWordCount} words MINIMUM — this is a hard requirement, do not write less
BRAND VOICE: ${voiceLabel}
STORE URL: ${storeUrl || "https://store.example.com"}
STORE NAME: ${storeName || "The Store"}
LANGUAGE: ${language === "ro" ? "Romanian — write the ENTIRE article body in Romanian language" : "English"}

BRAND & LEGAL RULES (CRITICAL):
- NEVER mention competitor brand names (e.g. Decathlon, Kaufland, Emag, Amazon, Ikea, or any retailer/brand not from this store)
- NEVER use named external experts linked to competitor brands
- Expert attributions: use generic titles only (e.g. "specialist echipament outdoor" NOT "specialist Decathlon")
- All price references must be general ranges, not linked to specific competitor stores

WORD COUNT ENFORCEMENT:
- The article body (between H1 and Conclusion) MUST be at least ${targetWordCount} words
- Each H2 section: minimum ${Math.round(targetWordCount / 4)} words
- Each H3 subsection: minimum 150 words
- FAQ section: minimum 4 Q&As with 60-80 word answers each
- Do NOT stop early — write complete, detailed content for every section

REQUIREMENTS:
1. ANSWER-FIRST BLUF (CRITICAL for AEO/GEO): the first 40-60 words after H1 MUST contain a direct, standalone answer to "${primaryKeyword}". A reader (or an AI Overview parser) should be able to copy ONLY those 40-60 words and have a complete answer. The primary keyword MUST appear in the very first sentence (not just somewhere in BLUF). No "In this article", no "Atunci când vrei", no preamble — start with the definition or factual answer.
2. Primary keyword in H1, FIRST SENTENCE of BLUF (40-60w block), and 3+ H2 headings
3. STATISTICS / QUOTATIONS — include at least 1 verifiable statistic (with parenthetical source like "(sursa: ANCEX 2024)" or "(estimat din date publice)") AND 1 expert blockquote. Princeton GEO research shows +41% / +40% citation rate in AI engines for content with these features.
4. Expert attribution: write as a blockquote directly, no placeholders. Format: > "Quote text" — Generic Title (e.g. "specialist outdoor", NOT brand names like Decathlon). NEVER use [EXPERT: ...] format.
5. FAQ section with 4-6 Q&As, each answer 60-80 words
6. Internal link placeholders: [INTERNAL LINK: description] every 800 words
7. Image placeholders: [IMAGE: description, alt text] throughout
8. FAQPage schema must match FAQ section content exactly
9. URL slug: lowercase, hyphens, primary keyword first, max 60 chars
10. No "In this article" or "In conclusion" openers
11. Conclusion ends with internal link CTA to relevant collection
${paaQuestions.length > 0 ? `
REAL PAA QUESTIONS FROM GOOGLE (use these EXACTLY as your FAQ questions — do not invent others):
${paaQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")}
These are real questions people search for. Your FAQ section MUST answer ALL of them.` : ""}

Generate the complete article package now following the exact output format specified.`;
}

function parseArticleOutput(raw, brief) {
  const extract = (marker, endMarker) => {
    const start = raw.indexOf(`===${marker}===`);
    const end   = raw.indexOf(`===${endMarker}===`);
    if (start === -1) return "";
    return raw.slice(start + marker.length + 6, end === -1 ? undefined : end).trim();
  };

  const seoFields       = extract("SEO_FIELDS", "ARTICLE");
  const article         = extract("ARTICLE", "FAQ_SCHEMA");
  const faqSchemaRaw    = extract("FAQ_SCHEMA", "BLOGPOSTING_SCHEMA");
  const bpSchemaRaw     = extract("BLOGPOSTING_SCHEMA", "INTERNAL_LINKS");
  const internalRaw     = extract("INTERNAL_LINKS", "IMAGE_BRIEF");
  const imageBriefRaw   = extract("IMAGE_BRIEF", "END");

  // Parse SEO fields
  const titleTag      = extractField(seoFields, "TITLE_TAG");
  const metaDesc      = extractField(seoFields, "META_DESC");
  const urlSlug       = extractField(seoFields, "URL_SLUG");
  const h1            = extractField(seoFields, "H1");

  // Parse JSON fields safely
  let faqSchema     = safeJson(faqSchemaRaw, null);
  let bpSchema      = safeJson(bpSchemaRaw, {});
  let internalLinks = safeJson(internalRaw, []);
  let imageBrief    = safeJson(imageBriefRaw, []);

  // Fallback: build FAQPage from article content if schema section failed
  if (!faqSchema || !faqSchema["@type"]) {
    console.log("[Generate] FAQ_SCHEMA missing/invalid — parsing from content");
    faqSchema = parseFaqFromContent(article) || {};
  }
  if (faqSchema?.["@type"] === "FAQPage") {
    console.log(`[Generate] FAQPage OK — ${faqSchema.mainEntity?.length || 0} questions`);
  }

  // BlogPosting schema is built server-side at publish time via buildCombinedSchema
  // bpSchema from Claude is optional — we don't rely on it
  if (!bpSchema || !bpSchema["@type"]) {
    bpSchema = {}; // Will be built correctly at publish time
  }

  const wordCount = article.split(/\s+/).filter(Boolean).length;

  return {
    titleTag,
    metaDescription: metaDesc,
    urlSlug:         slugify(urlSlug || brief.primaryKeyword),
    h1,
    content:         article,
    faqSchema:       JSON.stringify(faqSchema),
    blogPostingSchema: JSON.stringify(bpSchema),
    internalLinks:   JSON.stringify(internalLinks),
    imageBrief:      JSON.stringify(imageBrief),
    wordCount,
    rawOutput:       raw,
  };
}

function extractField(text, field) {
  const match = text.match(new RegExp(`${field}:\\s*(.+)`));
  return match ? match[1].trim() : "";
}

function safeJson(raw, fallback) {
  try {
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return fallback;
  }
}

/**
 * Parse FAQ questions and answers directly from article markdown content
 * Fallback when FAQ_SCHEMA section is missing or invalid JSON
 */
function parseFaqFromContent(content) {
  if (!content) return null;

  const questions = [];

  // Pattern 1: **Question?** followed by answer paragraph
  const boldQPattern = /\*\*([^*?]+\?)\*\*\s*\n+([^\n*#]+(?:\n[^\n*#]+)*)/g;
  let match;
  while ((match = boldQPattern.exec(content)) !== null && questions.length < 8) {
    const q = match[1].trim();
    const a = match[2].trim().replace(/\s+/g, " ").slice(0, 500);
    if (q.length > 10 && a.length > 20) {
      questions.push({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } });
    }
  }

  // Pattern 2: ### or ## heading ending in ?
  if (questions.length < 2) {
    const headingQPattern = /^#{2,3}\s+(.+\?)\s*\n+([\s\S]+?)(?=\n#{2,3}|\n===|$)/gm;
    while ((match = headingQPattern.exec(content)) !== null && questions.length < 8) {
      const q = match[1].trim();
      const a = match[2].trim().replace(/\s+/g, " ").slice(0, 500);
      if (q.length > 10 && a.length > 20 && !questions.some(x => x.name === q)) {
        questions.push({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } });
      }
    }
  }

  if (questions.length === 0) return null;

  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: questions.slice(0, 6),
  };
}

function slugify(str) {
  return str
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

/**
 * Publish article to Shopify Blog
 */
export async function publishToShopify(accessToken, shopDomain, article, blogId, storeUrl) {
  // Get canonical domain from Shopify
  let resolvedStoreUrl = storeUrl || `https://${shopDomain}`;

  // Resolve internal links before converting to HTML
  let content = article.content || "";
  try {
    const { resolveInternalLinks, insertContextualLinks } = await import("./internal-linking.server.js");
    if (article.storeId) {
      const placeholderCount = (content.match(/\[INTERNAL LINK:/g) || []).length;
      console.log(`[Internal Linking] Starting — placeholders: ${placeholderCount}, shopDomain: ${shopDomain}`);
      if (placeholderCount > 0) {
        content = await resolveInternalLinks(content, article.storeId, shopDomain);
        const resolved = (content.match(/<a href=/g) || []).length;
        console.log(`[Internal Linking] Placeholders resolved: ${resolved} links`);
      }
      // Contextual linking always runs — adds up to 5 keyword-based links
      const { content: linkedContent, linksAdded } = await insertContextualLinks(content, article.storeId, shopDomain);
      content = linkedContent;
      console.log(`[Internal Linking] Contextual links added: ${linksAdded}`);
    } else {
      console.warn("[Internal Linking] No storeId — skipping");
    }
  } catch (linkErr) {
    console.error("[Internal Linking] Failed:", linkErr.message, linkErr.stack?.slice(0, 300));
  }

  // Get shop owner email for author field
  let authorEmail = "store@example.com";
  try {
    const shopResp = await fetch(`https://${shopDomain}/admin/api/2025-04/shop.json?fields=email`, {
      headers: { "X-Shopify-Access-Token": accessToken },
    });
    const shopData = await shopResp.json();
    if (shopData.shop?.email) authorEmail = shopData.shop.email;
  } catch {}

  // Step 1: Create article without metafields
  const mutation = `
    mutation articleCreate($article: ArticleCreateInput!) {
      articleCreate(article: $article) {
        article {
          id
          handle
          title
        }
        userErrors { field message }
      }
    }
  `;

  const variables = {
    article: {
      blogId:  blogId,
      title:   article.h1 || article.titleTag || article.primaryKeyword,
      handle:  article.urlSlug,
      body:    markdownToHtml(content),
      author:  { name: "Admin" },
    },
  };

  const { shopifyGraphQL } = await import("./shopify-graphql.server.js");
  const data = await shopifyGraphQL({ accessToken, shopDomain, query: mutation, variables });
  const errors = data.data?.articleCreate?.userErrors || [];
  if (errors.length > 0) {
    console.error("[Blog Publish] userErrors:", JSON.stringify(errors));
    throw new Error(errors.map((e) => `${e.field}: ${e.message}`).join(", "));
  }

  const createdArticle = data.data?.articleCreate?.article;
  if (!createdArticle?.id) {
    console.error("[Blog Publish] Full response:", JSON.stringify(data).slice(0, 500));
    throw new Error("Shopify returned no article — check Railway logs for details");
  }

  // Step 1b: Set SEO title + description via articleUpdate
  try {
    const seoMutation = `
      mutation articleUpdate($id: ID!, $article: ArticleUpdateInput!) {
        articleUpdate(id: $id, article: $article) {
          article { id seo { title description } }
          userErrors { field message }
        }
      }
    `;
    const { shopifyGraphQL } = await import("./shopify-graphql.server.js");
    const seoData = await shopifyGraphQL({
      accessToken, shopDomain,
      query: seoMutation,
      variables: {
        id: createdArticle.id,
        article: {
          seo: {
            title:       article.titleTag || article.h1 || article.primaryKeyword,
            description: article.metaDescription || "",
          },
        },
      },
    });
    const seoErrors = seoData.data?.articleUpdate?.userErrors || [];
    if (seoErrors.length > 0) {
      console.error("[Blog SEO] userErrors:", JSON.stringify(seoErrors));
    } else {
      console.log("[Blog SEO] SEO fields set OK");
    }
  } catch (seoErr) {
    console.warn("[Blog SEO] SEO update failed (non-fatal):", seoErr.message);
  }


  try {
    // Pull brand settings so the @graph has a real Organization node for BlogPosting.publisher to reference.
    // Without this, the publisher @id pointed at #organization but no Organization node existed in @graph,
    // breaking AI parsers and tanking AEO citation rate.
    if (article.storeId) {
      try {
        const [brandName, brandLogo, socialUrls, storeRow, defaultAuthor] = await Promise.all([
          prisma.seoSetting.findUnique({ where: { storeId_key: { storeId: article.storeId, key: "brand_name" } } }),
          prisma.seoSetting.findUnique({ where: { storeId_key: { storeId: article.storeId, key: "brand_logo_url" } } }),
          prisma.seoSetting.findUnique({ where: { storeId_key: { storeId: article.storeId, key: "brand_social_urls" } } }),
          // Wave 1: knowledge-graph anchors (Wikidata/Wikipedia/GBP) for sameAs
          prisma.store.findUnique({ where: { id: article.storeId }, select: { wikidataQid: true, wikipediaUrl: true, gbpUrl: true } }),
          // Wave 1: default author profile for Person schema with credentials
          prisma.seoAuthor.findFirst({ where: { storeId: article.storeId, isDefault: true } }),
        ]);
        article.brandName    = brandName?.value || shopDomain.replace(".myshopify.com", "").replace(/-/g, " ");
        article.brandLogoUrl = brandLogo?.value || null;
        try { article.socialUrls = socialUrls?.value ? JSON.parse(socialUrls.value) : []; } catch { article.socialUrls = []; }
        article.kgAnchors    = storeRow || null;
        article.defaultAuthor = defaultAuthor || null;
      } catch (brandErr) {
        console.warn("[Blog Schema] Brand settings load failed:", brandErr.message);
      }
    }

    const schemaJson = buildCombinedSchema(article, storeUrl || `https://${shopDomain}`);
    console.log("[Blog Schema] Setting metafield for article:", createdArticle.id, "json length:", schemaJson.length);

    const metaMutation = `
      mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields { key namespace value }
          userErrors { field message }
        }
      }
    `;
    const { shopifyGraphQL } = await import("./shopify-graphql.server.js");
    const metaData = await shopifyGraphQL({
      accessToken, shopDomain,
      query: metaMutation,
      variables: {
        metafields: [{
          ownerId:   createdArticle.id,
          namespace: "kimono",
          key:       "schema_json",
          value:     schemaJson,
          type:      "json",
        }],
      },
    });
    const metaErrors = metaData.data?.metafieldsSet?.userErrors || [];
    if (metaErrors.length > 0) {
      console.error("[Blog Schema] Metafield userErrors:", JSON.stringify(metaErrors));
    } else {
      console.log("[Blog Schema] Metafield set OK:", metaData.data?.metafieldsSet?.metafields?.map(m => m.key));
    }
  } catch (metaErr) {
    console.warn("[Blog Schema] Metafield set failed (non-fatal):", metaErr.message);
  }

  // Get authorName from settings if not on article
  if (!article.authorName || article.authorName === "Editor") {
    try {
      const authorSetting = await prisma.seoSetting.findUnique({
        where: { storeId_key: { storeId: article.storeId, key: "seo_author_name" } },
      });
      if (authorSetting?.value) article = { ...article, authorName: authorSetting.value };
    } catch {}
  }

  // Auto-refresh LLMs.txt after article publish (non-fatal)
  try {
    const { generateAndPublishLlmsTxt } = await import("./llmstxt-generator.server.js");
    generateAndPublishLlmsTxt(article.storeId, accessToken, shopDomain)
      .then(() => console.log("[LLMs.txt] Auto-refreshed after article publish"))
      .catch(e => console.warn("[LLMs.txt] Auto-refresh failed:", e.message));
  } catch (e) {
    console.warn("[LLMs.txt] Import failed:", e.message);
  }

  // IndexNow: notify Bing/Copilot/Yandex of new article (non-fatal)
  try {
    const articlePublicUrl = `${storeUrl || `https://${shopDomain}`}/blogs/news/${article.urlSlug}`;
    const indexNowKey = await getIndexNowKey(article.storeId);
    if (indexNowKey) {
      fetch(`https://api.indexnow.org/indexnow?url=${encodeURIComponent(articlePublicUrl)}&key=${indexNowKey}`, { method: "GET" })
        .then(r => console.log(`[IndexNow] Submitted article: ${r.status}`))
        .catch(e => console.warn("[IndexNow] Submit failed:", e.message));
    }
  } catch (e) {
    console.warn("[IndexNow] Failed:", e.message);
  }

  return createdArticle;
}

function buildCombinedSchema(article, storeUrl) {
  const graph = [];
  const baseUrl    = (storeUrl || "").replace(/\/+$/, "");
  const articleUrl = `${baseUrl}/blogs/news/${article.urlSlug}`;
  const today      = new Date().toISOString().split("T")[0];
  const lang       = article.language || "ro";
  const authorName = article.authorName || "Editor";
  const publishedAt = article.publishedAt
    ? new Date(article.publishedAt).toISOString().split("T")[0]
    : today;
  // Prefer contentUpdatedAt (set only when actual content fields change). Falling
  // back to updatedAt would bump dateModified on every metafield write (e.g. when
  // we set shopifyArticleId post-publish), which Google's fake-freshness filter
  // (Mueller, Nov 2024) demotes as stable-content abuse. Fall back to
  // publishedAt > today only if contentUpdatedAt isn't tracked yet (legacy rows).
  const modifiedSource = article.contentUpdatedAt || article.publishedAt || article.updatedAt;
  const modifiedAt = modifiedSource
    ? new Date(modifiedSource).toISOString().split("T")[0]
    : today;

  // 1. Organization — anchors the brand entity that BlogPosting.publisher and
  // WebPage.isPartOf reference by @id. Without this node, the publisher @id
  // pointed at #organization but nothing in @graph defined it — AI parsers
  // see a broken reference and citation rate drops.
  const orgNode = {
    "@type": "Organization",
    "@id":   `${baseUrl}#organization`,
    "name":  article.brandName || (baseUrl ? new URL(baseUrl).hostname : ""),
    "url":   baseUrl,
  };
  if (article.brandLogoUrl) {
    orgNode.logo = { "@type": "ImageObject", "url": article.brandLogoUrl };
  }
  // Knowledge-graph anchors: merging social URLs with Wikipedia/Wikidata/GBP
  // gives LLMs and Search a verifiable mapping from this brand to its entity
  // in the public knowledge graph. This is the strongest single E-E-A-T
  // signal AI parsers can read off a page.
  const sameAs = [...(Array.isArray(article.socialUrls) ? article.socialUrls : [])];
  const kg = article.kgAnchors;
  if (kg?.wikipediaUrl) sameAs.push(kg.wikipediaUrl);
  if (kg?.wikidataQid)  sameAs.push(`https://www.wikidata.org/wiki/${kg.wikidataQid}`);
  if (kg?.gbpUrl)       sameAs.push(kg.gbpUrl);
  if (sameAs.length > 0) orgNode.sameAs = [...new Set(sameAs)];
  graph.push(orgNode);

  // 2. WebSite — enables Google sitelinks-searchbox eligibility plus gives
  // WebPage a parent node to point to.
  graph.push({
    "@type": "WebSite",
    "@id":   `${baseUrl}#website`,
    "url":   baseUrl,
    "name":  orgNode.name,
    "publisher": { "@id": `${baseUrl}#organization` },
  });

  // 3. BlogPosting — always
  const blogPosting = {
    "@type": "BlogPosting",
    "@id":   `${articleUrl}#article`,
    "mainEntityOfPage": { "@type": "WebPage", "@id": articleUrl, "isPartOf": { "@id": `${baseUrl}#website` } },
    "url":           articleUrl,
    "headline":      article.h1 || article.titleTag || article.primaryKeyword,
    "description":   article.metaDescription || "",
    "datePublished": publishedAt,
    "dateModified":  modifiedAt,
    "inLanguage":    lang,
    "wordCount":     article.wordCount || 0,
    "author": (() => {
      // Wave 1: rich Person schema with credentials + sameAs to Wikipedia/
      // Wikidata/LinkedIn. The 2026 GEO research identified expert byline
      // attribution as the single biggest E-E-A-T lever for AIO citation
      // (+400% visibility with SME quotes per published case studies).
      const a = article.defaultAuthor;
      if (!a) {
        return { "@type": "Person", "name": authorName, "url": `${baseUrl}/pages/about` };
      }
      const node = {
        "@type": "Person",
        "@id":   `${baseUrl}#author-${a.id}`,
        "name":  a.name,
        "url":   a.websiteUrl || `${baseUrl}/pages/about`,
      };
      if (a.role)      node.jobTitle    = a.role;
      if (a.bio)       node.description = a.bio.slice(0, 500);
      if (a.avatarUrl) node.image       = a.avatarUrl;
      const personSameAs = [];
      if (a.wikipediaUrl) personSameAs.push(a.wikipediaUrl);
      if (a.wikidataQid)  personSameAs.push(`https://www.wikidata.org/wiki/${a.wikidataQid}`);
      if (a.linkedinUrl)  personSameAs.push(a.linkedinUrl);
      if (a.twitterUrl)   personSameAs.push(a.twitterUrl);
      if (personSameAs.length > 0) node.sameAs = personSameAs;
      try {
        const creds = JSON.parse(a.credentials || "[]");
        if (Array.isArray(creds) && creds.length > 0) {
          node.knowsAbout = creds.slice(0, 10);
        }
      } catch {}
      return node;
    })(),
    "publisher": { "@id": `${baseUrl}#organization` },
  };

  // Image: use real featured image URL if available, else build from slug
  if (article.featuredImageUrl) {
    blogPosting.image = [
      { "@type": "ImageObject", "url": article.featuredImageUrl, "width": 1200, "height": 630 },
    ];
  } else {
    // Placeholder — at least gives Google a crawlable URL
    const imgBase = `${baseUrl}/cdn/shop/articles/${article.urlSlug}`;
    blogPosting.image = [
      { "@type": "ImageObject", "url": `${imgBase}-1200x630.jpg`, "width": 1200, "height": 630 },
      { "@type": "ImageObject", "url": `${imgBase}-800x600.jpg`,  "width": 800,  "height": 600 },
      { "@type": "ImageObject", "url": `${imgBase}-1x1.jpg`,      "width": 800,  "height": 800 },
    ];
  }

  // Speakable — Google Assistant voice surface. Points to the H1 + the first
  // paragraph of the lead so smart-speaker readouts get a 20–30s answer. The
  // 2026 AEO research shows Speakable is one of the few schema types that
  // genuinely changes voice-search citation rate, especially for news/blog.
  blogPosting.speakable = {
    "@type":        "SpeakableSpecification",
    "cssSelector":  ["h1", "article p:first-of-type", ".article-lead", ".rte > p:first-of-type"],
  };

  graph.push(blogPosting);

  // 2. FAQPage — from stored faqSchema or parse from content
  try {
    const faq = article.faqSchema ? JSON.parse(article.faqSchema) : null;
    if (faq && faq["@type"] === "FAQPage" && faq.mainEntity?.length > 0) {
      graph.push({ ...faq, "@id": `${articleUrl}#faq` });
    }
  } catch {}

  // 3. HowTo — only for how-to articles
  if (article.articleType === "howto") {
    try {
      const bpSchema = article.blogPostingSchema ? JSON.parse(article.blogPostingSchema) : null;
      if (bpSchema?.["@type"] === "HowTo") {
        graph.push({ ...bpSchema, "@id": `${articleUrl}#howto` });
      }
    } catch {}
  }

  // 4. ItemList — for comparison and listicle articles
  if (["comparison", "listicle"].includes(article.articleType)) {
    try {
      // Extract product mentions from content using H3 headings (each product = one H3)
      const content = article.content || "";
      const h3Matches = [...content.matchAll(/^### (.+)$/gm)];

      if (h3Matches.length > 0) {
        const items = h3Matches.slice(0, 10).map((m, i) => ({
          "@type":    "ListItem",
          "position": i + 1,
          "name":     m[1].replace(/^\d+[\.\)]\s*/, "").trim(),
          "url":      articleUrl,
        }));

        graph.push({
          "@type":           "ItemList",
          "@id":             `${articleUrl}#list`,
          "name":            article.h1 || article.titleTag || article.primaryKeyword,
          "description":     article.metaDescription || "",
          "numberOfItems":   items.length,
          "itemListElement": items,
        });
      }
    } catch {}
  }

  return JSON.stringify({
    "@context": "https://schema.org",
    "@graph":   graph,
  });
}

function parseMarkdownTable(md) {
  const lines = md.split("\n");
  const result = [];
  let inTable = false;
  let tableLines = [];
  let pendingEmpty = 0; // count of empty lines while inTable

  const flushTable = () => {
    if (tableLines.length < 1) {
      tableLines = [];
      inTable = false;
      pendingEmpty = 0;
      return;
    }
    const rows = tableLines.map((r, i) => {
      const cells = r.split("|").filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
      const tag = i === 0 ? "th" : "td";
      return `<tr>${cells.map(c => `<${tag} style="border:1px solid #e5e7eb;padding:8px 12px;text-align:left;background:${i===0?"#f9fafb":"#fff"}">${c.trim()}</${tag}>`).join("")}</tr>`;
    });
    const thead = `<thead>${rows[0]}</thead>`;
    const tbody = rows.length > 1 ? `<tbody>${rows.slice(1).join("")}</tbody>` : "<tbody></tbody>";
    result.push(`<table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:14px">${thead}${tbody}</table>`);
    tableLines = [];
    inTable = false;
    pendingEmpty = 0;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isTableRow = /^\s*\|.+\|\s*$/.test(line);
    const isSeparator = /^\s*\|[-|:\s]+\|\s*$/.test(line);
    const isEmpty = line.trim() === "";

    if (isSeparator) continue; // skip --- separator rows

    if (isTableRow) {
      inTable = true;
      pendingEmpty = 0;
      tableLines.push(line);
    } else if (isEmpty && inTable) {
      // Look ahead — if next non-empty line is a table row, stay in table
      let nextNonEmpty = i + 1;
      while (nextNonEmpty < lines.length && lines[nextNonEmpty].trim() === "") nextNonEmpty++;
      const nextIsTable = nextNonEmpty < lines.length && /^\s*\|.+\|\s*$/.test(lines[nextNonEmpty]);
      if (nextIsTable) {
        pendingEmpty++; // skip this empty line, continue table
      } else {
        flushTable();
        result.push(line);
      }
    } else {
      if (inTable) flushTable();
      result.push(line);
    }
  }

  if (inTable) flushTable();
  return result.join("\n");
}

async function getIndexNowKey(storeId) {
  if (!storeId) return null;
  try {
    const setting = await prisma.seoSetting.findUnique({
      where: { storeId_key: { storeId, key: "indexnow_api_key" } },
    });
    return setting?.value || null;
  } catch { return null; }
}

export function markdownToHtml(md) {
  if (!md) return "";
  // Parse tables first (before line-by-line processing)
  md = parseMarkdownTable(md);
  return md
    .replace(/^---+$/gm, "")
    .replace(/\[INTERNAL LINK:[^\]]*\]/g, "")
    .replace(/\[IMAGE:[^\]]*\]/g, "")
    .replace(/\[EXPERT:[^\]]*\]\s*/g, "")  // Remove [EXPERT: ...] placeholder
    .replace(/^>\s*$/gm, "")                   // Remove empty blockquotes left after EXPERT removal
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# .+$/gm, "")  // Remove H1 - Shopify displays article title automatically
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "<a href=\"$2\">$1</a>")
    .replace(/^> (.+)$/gm, "<blockquote>$1</blockquote>")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\n\n/g, "</p><p>")
    .replace(/^([^<].+)$/gm, "<p>$1</p>")
    .replace(/<p><\/p>/g, "")
    .replace(/<p>\s*<\/p>/g, "")
    .replace(/<p>\u00a0<\/p>/g, "")
    .replace(/(<p>\s*<\/p>\s*)+/g, "");
}

/**
 * Generate banner image prompt from product image + article context
 * Based on banner-image.md skill
 */
export async function generateBannerPrompt(brief) {
  const {
    productImageUrl,
    articleTitle,
    primaryKeyword,
    productDescription = "",
    articleType = "pillar",
    productCategory = "general",
    width = 1200,
    height = 630,
  } = brief;

  const ratio = `${width}x${height}px (${(width/height).toFixed(2)}:1 ratio)`;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const skillContent = loadSkill("banner-image.md");

  const BACKGROUND_STYLES = {
    apparel:     "soft gradient neutral",
    electronics: "dark gradient tech",
    home:        "warm wood surface",
    beauty:      "pastel gradient clean",
    outdoor:     "nature texture gradient",
    pets:        "warm neutral friendly",
    food:        "rustic wood surface overhead",
    general:     "light neutral gradient",
  };

  const STYLE_MODIFIERS = {
    pillar:     "editorial magazine style, aspirational",
    listicle:   "collection showcase, organized display",
    howto:      "instructional, process-oriented",
    comparison: "evaluation feel, clean composition",
    satellite:  "detail shot, focused, informative",
  };

  const bg    = BACKGROUND_STYLES[productCategory] || BACKGROUND_STYLES.general;
  const style = STYLE_MODIFIERS[articleType] || STYLE_MODIFIERS.pillar;

  const prompt = `You are a professional product photography art director for e-commerce.
Generate a banner image prompt for a blog article.

SKILL REFERENCE:
${skillContent.slice(0, 2000)}

ARTICLE CONTEXT:
- Title: "${articleTitle}"
- Primary keyword: "${primaryKeyword}"
- Article type: ${articleType}
- Product description: ${productDescription.slice(0, 200)}
- Product image URL: ${productImageUrl || "not provided"}
- Required dimensions: ${ratio}

Generate a JSON object with:
- imagePrompt: detailed generation prompt (English, 100-150 words, photorealistic, no text in image, no faces, specify ${ratio} dimensions)
- altText: SEO alt text max 125 chars mentioning primary keyword
- suggestedFilename: kebab-case filename with keyword
- style: one of editorial|lifestyle|minimal|bold
- colorPalette: array of 3 hex colors matching product/brand

Background style to use: ${bg}
Article style modifier: ${style}

Return ONLY valid JSON, no markdown.`;

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model:      process.env.AI_MODEL_FAST || "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages:   [{ role: "user", content: prompt }],
    }),
  });

  if (!resp.ok) throw new Error(`Claude API ${resp.status}`);
  const data = await resp.json();
  const raw  = data.content?.[0]?.text || "{}";

  try {
    return JSON.parse(raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
  } catch {
    return {
      imagePrompt: `Professional product photography blog banner. ${primaryKeyword} product centered, clean ${bg} background, commercial photography quality, 1200x630px, no text, no watermarks.`,
      altText: `${primaryKeyword} - featured image`,
      suggestedFilename: `${primaryKeyword.replace(/\s+/g, "-")}-banner.jpg`,
      style: "editorial",
      colorPalette: ["#F3F4F6", "#E5E7EB", "#D1D5DB"],
    };
  }
}

/**
 * Set featured image on a published Shopify article
 * Downloads image from URL and uploads to Shopify Files, then sets on article
 */
export async function setArticleFeaturedImage(accessToken, shopDomain, articleGid, imageUrl, altText) {
  // Use articleUpdate to set image via URL directly
  const mutation = `
    mutation articleUpdate($id: ID!, $article: ArticleUpdateInput!) {
      articleUpdate(id: $id, article: $article) {
        article { id image { url altText } }
        userErrors { field message }
      }
    }
  `;

  const { shopifyGraphQL } = await import("./shopify-graphql.server.js");
  const data = await shopifyGraphQL({
    accessToken, shopDomain,
    query: mutation,
    variables: {
      id: articleGid,
      article: { image: { url: imageUrl, altText: altText || "" } },
    },
  });
  const errors = data.data?.articleUpdate?.userErrors || [];
  if (errors.length > 0) throw new Error(errors.map((e) => e.message).join(", "));
  return data.data?.articleUpdate?.article;
}
