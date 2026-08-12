// app/lib/seo/faq-paa.server.js
// Kimono SEO #20 — PAA Extraction via DataForSEO only (no Claude)

import prisma from "../../db.server.js";

function getDfsAuth() {
  const login    = process.env.DATAFORSEO_LOGIN    || "";
  const password = process.env.DATAFORSEO_PASSWORD || "";
  if (!login || !password) return null;
  return Buffer.from(`${login}:${password}`).toString("base64");
}

export function hasDfsConfig() {
  return !!(process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD);
}

async function dfsFetch(endpoint, body) {
  const auth = getDfsAuth();
  if (!auth) throw new Error("DataForSEO not configured");
  const resp = await fetch(`https://api.dataforseo.com${endpoint}`, {
    method: "POST",
    headers: { "Authorization": `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await resp.json();
  if (data.status_code !== 20000) throw new Error(`DataForSEO error: ${data.status_message}`);
  return data;
}

export async function fetchPaaQuestions(keyword, locationCode = 2040, languageCode = "ro") {
  const cacheKey = `paa_${keyword}_${locationCode}_${languageCode}`;
  const cached = await prisma.seoSetting.findFirst({
    where: { storeId: "global_paa_cache", key: cacheKey },
  });
  if (cached?.value) {
    try { return JSON.parse(cached.value); } catch {}
  }

  const data = await dfsFetch("/v3/serp/google/organic/live/advanced", [{
    keyword, location_code: locationCode, language_code: languageCode,
    device: "desktop", depth: 10,
  }]);

  const taskStatus = data.tasks?.[0]?.status_message || "unknown";
  const items      = data.tasks?.[0]?.result?.[0]?.items || [];
  const serpTypes  = [...new Set(items.map(i => i.type))];
  console.log(`[PAA] "${keyword}" status="${taskStatus}" types=[${serpTypes.join(",")}]`);

  let paaQuestions = [];

  for (const item of items) {
    if (item.type === "people_also_ask" && item.items) {
      for (const paa of item.items) {
        if (paa.title) paaQuestions.push(paa.title);
      }
    }
  }

  // Fallback: related_searches
  if (paaQuestions.length === 0) {
    for (const item of items) {
      if (item.type === "related_searches" && item.items) {
        for (const rs of item.items) {
          if (rs.title) paaQuestions.push(rs.title);
        }
      }
    }
  }

  // Retry with shorter variant
  if (paaQuestions.length === 0) {
    const words = keyword.trim().split(/\s+/);
    if (words.length >= 3) {
      const variant = words.slice(0, 2).join(" ");
      console.log(`[PAA] Retrying with: "${variant}"`);
      try {
        const data2 = await dfsFetch("/v3/serp/google/organic/live/advanced", [{
          keyword: variant, location_code: locationCode, language_code: languageCode,
          device: "desktop", depth: 10,
        }]);
        const items2 = data2.tasks?.[0]?.result?.[0]?.items || [];
        for (const item of items2) {
          if (item.type === "people_also_ask" && item.items) {
            for (const paa of item.items) {
              if (paa.title) paaQuestions.push(paa.title);
            }
          }
        }
      } catch {}
    }
  }

  if (paaQuestions.length > 0) {
    await prisma.seoSetting.upsert({
      where: { storeId_key: { storeId: "global_paa_cache", key: cacheKey } },
      create: { storeId: "global_paa_cache", key: cacheKey, value: JSON.stringify(paaQuestions) },
      update: { value: JSON.stringify(paaQuestions) },
    }).catch(() => {});
  }

  console.log(`[PAA] Found ${paaQuestions.length} questions for "${keyword}"`);
  return paaQuestions;
}

export function buildFaqSchema(questions) {
  return {
    "@context": "https://schema.org",
    "@type":    "FAQPage",
    "mainEntity": questions.map(q => ({
      "@type": "Question",
      "name":  typeof q === "string" ? q : q.question,
      "acceptedAnswer": { "@type": "Answer", "text": typeof q === "string" ? "" : (q.answer || "") },
    })).filter(e => e.name),
  };
}

export async function extractAndGenerateFaq(keyword, context = "", language = "ro", locationCode = 2040) {
  console.log(`[PAA] Fetching for "${keyword}" (DataForSEO only)`);
  if (!hasDfsConfig()) throw new Error("DataForSEO not configured");

  const questions = await fetchPaaQuestions(keyword, locationCode, language === "ro" ? "ro" : "en");
  const faqPairs  = questions.slice(0, 8).map(q => ({ question: q, answer: "" }));

  return { questions, faqPairs, schema: buildFaqSchema(questions) };
}

export async function batchGenerateFaq(storeId, accessToken, shopDomain, limit = 5) {
  const articles = await prisma.blogArticle.findMany({
    where: { storeId, status: "published", OR: [{ faqSchema: "" }, { faqSchema: null }, { faqSchema: "{}" }] },
    orderBy: { publishedAt: "desc" },
    take: limit,
    select: { id: true, primaryKeyword: true },
  });

  let success = 0, failed = 0;
  for (const article of articles) {
    try {
      const result = await extractAndGenerateFaq(article.primaryKeyword, "", "ro");
      if (result.questions.length > 0) {
        await prisma.blogArticle.update({ where: { id: article.id }, data: { faqSchema: JSON.stringify(result.schema) } });
        success++;
      }
      await new Promise(r => setTimeout(r, 300));
    } catch (e) {
      console.warn(`[PAA] Batch failed for "${article.primaryKeyword}":`, e.message);
      failed++;
    }
  }
  return { success, failed, total: articles.length };
}

export async function getArticleFaq(articleId, storeId) {
  const article = await prisma.blogArticle.findUnique({
    where: { id: articleId }, select: { faqSchema: true, primaryKeyword: true },
  });
  if (!article || article.storeId !== storeId) return null;
  try { return article.faqSchema ? JSON.parse(article.faqSchema) : null; } catch { return null; }
}
