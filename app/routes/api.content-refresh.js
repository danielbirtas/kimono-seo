// app/routes/api.content-refresh.js
// Kimono SEO — Content Refresh flow for decaying articles
// Intents: analyze | generate | publish

import prisma from "../db.server.js";

// ─── Fetch article from Shopify by URL path ───────────────────────────────────
async function fetchArticleFromShopify(accessToken, shopDomain, articleUrl) {
  // Extract handle from URL: /blogs/news/some-article-handle → some-article-handle
  const parts  = articleUrl.replace(/\/$/, "").split("/");
  const handle = parts[parts.length - 1];
  const blog   = parts[parts.length - 2] || "news";

  // Find blog ID first
  const blogsResp = await fetch(
    `https://${shopDomain}/admin/api/2025-04/blogs.json?fields=id,handle`,
    { headers: { "X-Shopify-Access-Token": accessToken } }
  );
  const blogsData = await blogsResp.json();
  const blogObj   = blogsData.blogs?.find(b => b.handle === blog) || blogsData.blogs?.[0];
  if (!blogObj) throw new Error(`Blog not found: ${blog}`);

  // Fetch article by handle
  const artResp = await fetch(
    `https://${shopDomain}/admin/api/2025-04/blogs/${blogObj.id}/articles.json?handle=${handle}&fields=id,title,body_html,summary_html,tags,published_at`,
    { headers: { "X-Shopify-Access-Token": accessToken } }
  );
  const artData = await artResp.json();
  const article = artData.articles?.[0];
  if (!article) throw new Error(`Article not found: ${handle}`);

  return { ...article, blogId: blogObj.id, handle };
}

// ─── Extract text from HTML ───────────────────────────────────────────────────
function htmlToText(html) {
  return (html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

// ─── Claude call ──────────────────────────────────────────────────────────────
async function claudeCall(prompt, maxTokens = 2000) {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY || "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.AI_MODEL_QUALITY || "claude-sonnet-4-6",
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await resp.json();
  return data.content?.[0]?.text || "";
}

// ─── Analyze article for decay causes ────────────────────────────────────────
async function analyzeArticle(article, keyword, decayInfo) {
  const bodyText = htmlToText(article.body_html);
  const wordCount = bodyText.split(/\s+/).length;

  const prompt = `You are an SEO expert analyzing why a blog article lost Google rankings.

Article title: "${article.title}"
Primary keyword: "${keyword}"
Word count: ${wordCount}
Position decline: ${decayInfo.prevPosition} → ${decayInfo.currPosition} (${decayInfo.positionDelta}% decline)
Clicks: ${decayInfo.prevClicks} → ${decayInfo.currClicks}

Article body (first 1500 chars):
${bodyText.slice(0, 1500)}

Analyze what's causing the ranking decline and what should be fixed. Consider:
- Is the keyword well-optimized in title, first paragraph, H2s?
- Is the content too short (under 800 words)?
- Are there missing FAQ/PAA sections?
- Is the meta description optimized?
- Is the content outdated (no recent data/dates)?
- Is the structure weak (no H2s, no lists)?

Return ONLY valid JSON (no markdown):
{
  "keyword": "identified primary keyword",
  "wordCount": ${wordCount},
  "issues": [
    {
      "type": "meta_title" | "meta_description" | "content_body" | "h1" | "faq_section" | "content_length" | "structure",
      "severity": "high" | "medium" | "low",
      "description": "one sentence describing the issue",
      "fix": "one sentence describing what to generate"
    }
  ],
  "summary": "2-3 sentence overall assessment"
}`;

  const text = await claudeCall(prompt, 1000);
  try {
    return JSON.parse(text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
  } catch {
    return { keyword, wordCount, issues: [], summary: "Analysis failed" };
  }
}

// ─── Generate fixes for selected issues ──────────────────────────────────────
async function generateFixes(article, analysis, selectedTypes, paaQuestions) {
  const bodyText = htmlToText(article.body_html);
  const fixes = {};

  for (const type of selectedTypes) {
    const issue = analysis.issues.find(i => i.type === type);
    if (!issue) continue;

    if (type === "meta_title") {
      const prompt = `Write an optimized SEO meta title for this article.
Keyword: "${analysis.keyword}"
Current title: "${article.title}"
Rules: 55-65 chars total, keyword near start, Romanian language if keyword is Romanian.
Return ONLY the title text, nothing else.`;
      fixes.meta_title = await claudeCall(prompt, 100);
    }

    if (type === "meta_description") {
      const prompt = `Write an optimized meta description for this article.
Keyword: "${analysis.keyword}"
Article title: "${article.title}"
Rules: 140-160 chars, keyword in first 50 chars, end with CTA like "Comandă acum." or "Descoperă.", Romanian language.
Return ONLY the description text, nothing else.`;
      fixes.meta_description = await claudeCall(prompt, 200);
    }

    if (type === "h1") {
      const prompt = `Write an optimized H1 title for this article.
Keyword: "${analysis.keyword}"
Current title: "${article.title}"
Rules: max 70 chars, keyword prominent, compelling, Romanian language if keyword is Romanian.
Return ONLY the H1 text, nothing else.`;
      fixes.h1 = await claudeCall(prompt, 100);
    }

    if (type === "faq_section") {
      const questions = paaQuestions?.slice(0, 5) || [];
      if (questions.length > 0) {
        const prompt = `Write FAQ answers for these People Also Ask questions about "${analysis.keyword}".
Questions:
${questions.map((q, i) => `${i + 1}. ${q}`).join("\n")}

Rules:
- Each answer: 40-80 words, direct answer first (BLUF)
- Romanian language
- Specific, factual, helpful

Return ONLY valid JSON:
[{"question": "...", "answer": "..."}]`;
        const text = await claudeCall(prompt, 1500);
        try {
          fixes.faq_section = JSON.parse(text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
        } catch {
          fixes.faq_section = questions.map(q => ({ question: q, answer: "" }));
        }
      }
    }

    if (type === "content_body" || type === "content_length" || type === "structure") {
      const prompt = `Rewrite and expand this blog article to fix its SEO issues.

Keyword: "${analysis.keyword}"
Current title: "${article.title}"
Issues to fix: ${analysis.issues.map(i => i.description).join("; ")}

Current content:
${bodyText.slice(0, 2000)}

Requirements:
- Minimum 900 words
- Start with keyword in first sentence
- Add 3-5 clear H2 sections (use ## Markdown)
- Include specific data, numbers, examples
- Romanian language
- Add a brief intro and conclusion
- Naturally include keyword 4-6 times

Return ONLY the article body in Markdown, no title/H1.`;
      fixes.content_body = await claudeCall(prompt, 4000);
    }
  }

  return fixes;
}

// ─── Update article in Shopify ────────────────────────────────────────────────
async function updateArticleInShopify(accessToken, shopDomain, articleId, blogId, fixes) {
  const updates = {};

  if (fixes.h1 || fixes.meta_title) {
    updates.title = fixes.h1 || fixes.meta_title;
  }

  if (fixes.content_body) {
    // Convert markdown to basic HTML
    let html = fixes.content_body
      .replace(/^## (.+)$/gm, "<h2>$1</h2>")
      .replace(/^### (.+)$/gm, "<h3>$1</h3>")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/^- (.+)$/gm, "<li>$1</li>")
      .split("\n\n")
      .map(p => p.trim())
      .filter(Boolean)
      .map(p => p.startsWith("<h") || p.startsWith("<li") ? p : `<p>${p}</p>`)
      .join("\n");

    // Append FAQ if present
    if (fixes.faq_section?.length > 0) {
      html += "\n<h2>Întrebări frecvente</h2>\n";
      for (const faq of fixes.faq_section) {
        html += `<h3>${faq.question}</h3>\n<p>${faq.answer}</p>\n`;
      }
    }

    updates.body_html = html;
  }

  const resp = await fetch(
    `https://${shopDomain}/admin/api/2025-04/blogs/${blogId}/articles/${articleId}.json`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": accessToken },
      body: JSON.stringify({ article: updates }),
    }
  );

  if (!resp.ok) throw new Error(`Shopify update failed: ${resp.status}`);
  const data = await resp.json();

  // Update meta via metafields
  if (fixes.meta_description) {
    const articleGid = `gid://shopify/Article/${articleId}`;
    await fetch(`https://${shopDomain}/admin/api/2025-04/graphql.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": accessToken },
      body: JSON.stringify({
        query: `mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafields) { userErrors { field message } }
        }`,
        variables: {
          metafields: [{
            ownerId: articleGid,
            namespace: "seo",
            key: "description",
            value: fixes.meta_description,
            type: "single_line_text_field",
          }],
        },
      }),
    }).catch(() => {});
  }

  return data.article;
}

// ─── Route handlers ───────────────────────────────────────────────────────────
export async function action({ request }) {
  const { requireAuth } = await import("../lib/auth/index.server.js");
  const { storeId, connection } = await requireAuth(request);
  if (!storeId) return Response.json({ error: "No active store" }, { status: 401 });
  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) return Response.json({ error: "Store not found" }, { status: 404 });

  const body = await request.json();
  const { intent, articleUrl, decayInfo } = body;

  // ── ANALYZE ──
  if (intent === "analyze") {
    try {
      const article  = await fetchArticleFromShopify(connection.accessToken, connection.shopDomain, articleUrl);
      const keyword  = body.keyword || article.handle.replace(/-/g, " ");
      const analysis = await analyzeArticle(article, keyword, decayInfo || {});

      // Fetch PAA questions for this keyword
      let paaQuestions = [];
      try {
        const { fetchPaaQuestions, hasDfsConfig } = await import("../lib/seo/faq-paa.server.js");
        if (hasDfsConfig()) {
          paaQuestions = await fetchPaaQuestions(keyword, 2040, "ro");
        }
      } catch {}

      return Response.json({
        success: true,
        article: { id: article.id, blogId: article.blogId, title: article.title, handle: article.handle, wordCount: analysis.wordCount },
        analysis,
        paaQuestions,
      });
    } catch (e) {
      return Response.json({ success: false, error: e.message }, { status: 500 });
    }
  }

  // ── GENERATE ──
  if (intent === "generate") {
    try {
      const { articleMeta, analysis, selectedTypes, paaQuestions } = body;
      const article = await fetchArticleFromShopify(connection.accessToken, connection.shopDomain, articleUrl);
      const fixes   = await generateFixes(article, analysis, selectedTypes, paaQuestions);
      return Response.json({ success: true, fixes });
    } catch (e) {
      return Response.json({ success: false, error: e.message }, { status: 500 });
    }
  }

  // ── PUBLISH ──
  if (intent === "publish") {
    try {
      const { articleId, blogId, fixes } = body;
      const updated = await updateArticleInShopify(connection.accessToken, connection.shopDomain, articleId, blogId, fixes);
      return Response.json({ success: true, article: updated });
    } catch (e) {
      return Response.json({ success: false, error: e.message }, { status: 500 });
    }
  }

  return Response.json({ error: "Unknown intent" }, { status: 400 });
}
