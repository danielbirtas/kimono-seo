// app/lib/seo/pinterest-seo.server.js
// Kimono SEO — Pinterest SEO Module
// Audit, Keyword Research, Rich Pin Setup pentru magazine Shopify

import prisma from "../../db.server.js";

const PINTEREST_API = "https://api.pinterest.com/v5";

// ─── Pinterest OAuth token (auto-refreshes via pinterest-oauth helper) ───────
async function getPinterestToken(storeId) {
  try {
    const { getValidPinterestToken } = await import("./pinterest-oauth.server.js");
    return await getValidPinterestToken(storeId);
  } catch {
    return null;
  }
}

// ─── Create a Pin via POST /v5/pins ──────────────────────────────────────────
export async function createPinterestPin(storeId, { boardId, title, description, link, altText, imageUrl }) {
  const token = await getPinterestToken(storeId);
  if (!token) throw new Error("Pinterest not connected — connect from the Pinterest page first");
  if (!boardId)  throw new Error("Board ID is required");
  if (!imageUrl) throw new Error("Image URL is required");

  const { enforceTrialLimit } = await import("../trial-limits.server.js");
  await enforceTrialLimit(storeId, "pinterest_pins", 1);

  const body = {
    board_id: boardId,
    media_source: { source_type: "image_url", url: imageUrl, is_standard: true },
  };
  if (title)       body.title       = title.slice(0, 100);
  if (description) body.description = description.slice(0, 500);
  if (link)        body.link        = link;
  if (altText)     body.alt_text    = altText.slice(0, 500);

  const resp = await fetch(`${PINTEREST_API}/pins`, {
    method:  "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Pinterest create pin ${resp.status}: ${txt}`);
  }
  return resp.json();
}

// ─── List boards owned by the connected user ─────────────────────────────────
export async function listPinterestBoards(storeId) {
  const token = await getPinterestToken(storeId);
  if (!token) return [];
  const resp = await fetch(`${PINTEREST_API}/boards?page_size=100&privacy=ALL`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) return [];
  const data = await resp.json();
  return (data.items || []).map(b => ({
    id: b.id, name: b.name, privacy: b.privacy, pinCount: b.pin_count,
  }));
}

// ─── Disconnect ──────────────────────────────────────────────────────────────
export async function disconnectPinterest(storeId) {
  const { clearPinterestTokens } = await import("./pinterest-oauth.server.js");
  await clearPinterestTokens(storeId);
}

// ─── Fetch Pinterest profile ──────────────────────────────────────────────────
async function fetchProfile(token) {
  const resp = await fetch(`${PINTEREST_API}/user_account`, {
    headers: { "Authorization": `Bearer ${token}` },
  });
  if (!resp.ok) throw new Error(`Pinterest API ${resp.status}`);
  return resp.json();
}

// ─── Fetch boards ─────────────────────────────────────────────────────────────
async function fetchBoards(token) {
  const resp = await fetch(`${PINTEREST_API}/boards?page_size=100`, {
    headers: { "Authorization": `Bearer ${token}` },
  });
  if (!resp.ok) return [];
  const data = await resp.json();
  return data.items || [];
}

// ─── Fetch pins for a board ───────────────────────────────────────────────────
async function fetchBoardPins(token, boardId, limit = 25) {
  const resp = await fetch(`${PINTEREST_API}/boards/${boardId}/pins?page_size=${limit}`, {
    headers: { "Authorization": `Bearer ${token}` },
  });
  if (!resp.ok) return [];
  const data = await resp.json();
  return data.items || [];
}

// ─── Pinterest Autocomplete (public, no auth needed) ─────────────────────────
async function fetchPinterestAutocomplete(query) {
  // Pinterest search suggestions via public endpoint
  try {
    const resp = await fetch(
      `https://www.pinterest.com/resource/SearchResource/get/?source_url=/search/pins/?q=${encodeURIComponent(query)}&data=%7B%22options%22%3A%7B%22query%22%3A%22${encodeURIComponent(query)}%22%2C%22scope%22%3A%22pins%22%7D%7D`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Accept": "application/json",
        },
      }
    );
    if (!resp.ok) return [];
    const data = await resp.json();
    // Extract guided terms / suggestions
    const guided = data?.resource_response?.data?.guided_search_terms || [];
    return guided.slice(0, 10);
  } catch { return []; }
}

// ─── Check Rich Pin / OG markup ──────────────────────────────────────────────
async function checkRichPinMarkup(shopDomain, accessToken) {
  try {
    const resp = await fetch(
      `https://${shopDomain}/admin/api/2025-04/themes.json`,
      { headers: { "X-Shopify-Access-Token": accessToken } }
    );
    const themeData = await resp.json();
    const mainTheme = themeData.themes?.find(t => t.role === "main");
    if (!mainTheme) return { hasOg: false, hasMeta: false };

    // Fetch theme.liquid to check OG tags
    const assetResp = await fetch(
      `https://${shopDomain}/admin/api/2025-04/themes/${mainTheme.id}/assets.json?asset[key]=layout/theme.liquid`,
      { headers: { "X-Shopify-Access-Token": accessToken } }
    );
    if (!assetResp.ok) return { hasOg: false, hasMeta: false };
    const assetData = await assetResp.json();
    const content = assetData.asset?.value || "";

    const hasOgTitle       = content.includes("og:title");
    const hasOgDescription = content.includes("og:description");
    const hasOgImage       = content.includes("og:image");
    const hasOgType        = content.includes("og:type");
    const hasProductSchema = content.includes("Product") || content.includes("schema.org");

    return {
      hasOg:           hasOgTitle && hasOgDescription && hasOgImage,
      hasOgTitle,
      hasOgDescription,
      hasOgImage,
      hasOgType,
      hasProductSchema,
      score: [hasOgTitle, hasOgDescription, hasOgImage, hasOgType, hasProductSchema].filter(Boolean).length,
    };
  } catch { return { hasOg: false, hasMeta: false, score: 0 }; }
}

// ─── AI Generate Pinterest keywords from product titles ───────────────────────
async function generatePinterestKeywords(products, brandName) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || products.length === 0) return [];

  const model = process.env.AI_MODEL_FAST || "claude-haiku-4-5-20251001";
  const productList = products.slice(0, 20).map(p => p.title).join(", ");

  const prompt = `You are a Pinterest SEO expert for Romanian e-commerce. Generate Pinterest search keywords for these Shopify products.

Products: ${productList}
Brand: ${brandName || "Romanian e-commerce store"}

Pinterest users search differently than Google - they use aspirational, visual, action-oriented phrases.
Examples: "home office setup ideas" not "home office", "wedding decor inspo" not "wedding decorations"

Generate 20 Pinterest keyword phrases. Focus on:
- Long-tail phrases (3-5 words)
- Aspirational/inspirational angles
- Romanian AND English versions (Pinterest RO has both)
- Shopping intent phrases

Respond ONLY with valid JSON, plain ASCII:
{"keywords":[{"phrase":"keyword phrase here","intent":"shopping|inspiration|tutorial","language":"ro|en"},{"phrase":"...","intent":"...","language":"..."}]}`;

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method:  "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body:    JSON.stringify({ model, max_tokens: 800, messages: [{ role: "user", content: prompt }] }),
    });
    const data = await resp.json();
    const text = (data.content?.[0]?.text || "").replace(/[^\x20-\x7E]/g, " ");
    const start = text.indexOf("{");
    const end   = text.lastIndexOf("}");
    if (start === -1) return [];
    const parsed = JSON.parse(text.slice(start, end + 1));
    return parsed.keywords || [];
  } catch { return []; }
}

// ─── Main Pinterest SEO Audit ─────────────────────────────────────────────────
export async function runPinterestAudit(storeId, shopDomain, accessToken) {
  console.log(`[Pinterest] Starting audit for ${shopDomain}`);

  const token = await getPinterestToken(storeId);

  // Check Rich Pin markup (always available)
  const richPinCheck = await checkRichPinMarkup(shopDomain, accessToken);
  console.log(`[Pinterest] Rich Pin markup score: ${richPinCheck.score}/5`);

  // Get products for keyword research — try DB first, fallback to Shopify API
  let productList = [];
  try {
    const products = await prisma.product.findMany({
      where:   { storeId },
      select:  { title: true, tags: true, productType: true },
      take:    50,
      orderBy: { updatedAt: "desc" },
    });
    productList = products;
  } catch (e) {
    console.warn("[Pinterest] DB product fetch failed:", e.message);
  }

  if (productList.length === 0 && accessToken) {
    try {
      const shopResp = await fetch(
        `https://${shopDomain}/admin/api/2025-04/products.json?limit=50&fields=title,tags,product_type`,
        { headers: { "X-Shopify-Access-Token": accessToken } }
      );
      if (shopResp.ok) {
        const shopData = await shopResp.json();
        productList = shopData.products || [];
        console.log(`[Pinterest] Fetched ${productList.length} products from Shopify API`);
      }
    } catch (e) {
      console.warn("[Pinterest] Shopify product fetch failed:", e.message);
    }
  }

  const brandSetting = await prisma.seoSetting.findUnique({
    where: { storeId_key: { storeId, key: "brand_name" } },
  });
  const brandName = brandSetting?.value || "";

  // Generate AI keywords
  const aiKeywords = await generatePinterestKeywords(productList, brandName);
  console.log(`[Pinterest] AI keywords generated: ${aiKeywords.length}`);

  // Pinterest profile audit (if connected)
  let profileAudit = null;
  let boardAudit   = [];
  let pinAudit     = [];

  if (token) {
    try {
      const profile = await fetchProfile(token);
      const boards  = await fetchBoards(token);

      // Audit profile
      const profileScore = {
        hasKeywordInName:    /[\|]/.test(profile.username || "") || profile.business_name?.includes(" | "),
        hasBio:              !!(profile.about?.trim()),
        hasWebsite:          !!(profile.website_url),
        hasProfilePic:       !!(profile.profile_image),
        isBusinessAccount:   profile.account_type === "BUSINESS",
      };

      profileAudit = {
        username:     profile.username,
        displayName:  profile.business_name || profile.username,
        bio:          profile.about || "",
        website:      profile.website_url || "",
        followers:    profile.follower_count || 0,
        score:        Object.values(profileScore).filter(Boolean).length,
        maxScore:     Object.keys(profileScore).length,
        checks:       profileScore,
        recommendations: generateProfileRecommendations(profileScore, profile),
      };

      // Audit boards
      boardAudit = boards.map(board => {
        const titleWords    = board.name?.split(" ").length || 0;
        const hasDescription = !!(board.description?.trim());
        const isVague       = /^(inspiration|ideas|my board|favorites|misc|other|stuff)/i.test(board.name || "");
        const hasKeyword    = titleWords >= 3;

        return {
          id:           board.id,
          name:         board.name,
          description:  board.description || "",
          pinCount:     board.pin_count || 0,
          hasDescription,
          isVague,
          hasKeyword,
          score: [hasDescription, hasKeyword, !isVague].filter(Boolean).length,
          issues: [
            !hasDescription && "Missing board description (missed SEO opportunity)",
            isVague         && "Board name too vague — use specific keyword phrases",
            !hasKeyword     && "Board name too short — aim for 3+ words with keywords",
          ].filter(Boolean),
        };
      });

      // Audit sample pins from first 3 boards
      for (const board of boards.slice(0, 3)) {
        const pins = await fetchBoardPins(token, board.id, 10);
        for (const pin of pins) {
          const hasTitle       = !!(pin.title?.trim());
          const hasDescription = !!(pin.description?.trim());
          const hasLink        = !!(pin.link);
          const titleLength    = pin.title?.length || 0;
          const descLength     = pin.description?.length || 0;

          pinAudit.push({
            id:           pin.id,
            boardName:    board.name,
            title:        pin.title || "",
            description:  pin.description || "",
            link:         pin.link || "",
            hasTitle,
            hasDescription,
            hasLink,
            titleScore:   titleLength >= 20 && titleLength <= 100 ? "good" : titleLength > 0 ? "short" : "missing",
            descScore:    descLength >= 100 && descLength <= 500 ? "good" : descLength > 0 ? "short" : "missing",
            score:        [hasTitle, hasDescription, hasLink, titleLength >= 20, descLength >= 100].filter(Boolean).length,
            issues: [
              !hasTitle       && "Missing pin title",
              !hasDescription && "Missing pin description",
              !hasLink        && "Missing destination URL",
              titleLength > 0 && titleLength < 20 && "Title too short (aim for 20-100 chars)",
              descLength > 0  && descLength < 100  && "Description too short (aim for 100-500 chars)",
            ].filter(Boolean),
          });
        }
      }
    } catch (e) {
      console.warn(`[Pinterest] API fetch failed: ${e.message}`);
    }
  }

  // Calculate overall scores
  const avgBoardScore = boardAudit.length
    ? Math.round(boardAudit.reduce((s, b) => s + b.score, 0) / boardAudit.length * 100 / 3)
    : 0;
  const avgPinScore = pinAudit.length
    ? Math.round(pinAudit.reduce((s, p) => s + p.score, 0) / pinAudit.length * 100 / 5)
    : 0;
  const boardsWithIssues  = boardAudit.filter(b => b.issues.length > 0).length;
  const pinsWithIssues    = pinAudit.filter(p => p.issues.length > 0).length;

  const result = {
    connected:       !!token,
    shopDomain,
    brandName,
    productCount:    productList.length,
    richPinCheck,
    profileAudit,
    boardAudit:      boardAudit.slice(0, 50),
    pinAudit:        pinAudit.slice(0, 30),
    aiKeywords,
    summary: {
      richPinScore:      richPinCheck.score,
      profileScore:      profileAudit ? `${profileAudit.score}/${profileAudit.maxScore}` : "N/A",
      boardsAudited:     boardAudit.length,
      boardsWithIssues,
      avgBoardScore,
      pinsAudited:       pinAudit.length,
      pinsWithIssues,
      avgPinScore,
      keywordsGenerated: aiKeywords.length,
    },
    auditedAt: new Date().toISOString(),
  };

  await prisma.seoSetting.upsert({
    where:  { storeId_key: { storeId, key: "pinterest_audit_results" } },
    create: { storeId, key: "pinterest_audit_results", value: JSON.stringify(result) },
    update: { value: JSON.stringify(result) },
  });

  console.log(`[Pinterest] Done — richPin:${richPinCheck.score}/5 boards:${boardAudit.length} pins:${pinAudit.length} keywords:${aiKeywords.length}`);
  return result;
}

function generateProfileRecommendations(checks, profile) {
  const recs = [];
  if (!checks.hasKeywordInName)    recs.push("Add a keyword to your display name: '[Brand] | [Main Keyword]'");
  if (!checks.hasBio)              recs.push("Add a bio with 2-3 sentences containing your main keywords");
  if (!checks.hasWebsite)          recs.push("Add and verify your website URL to unlock Rich Pins and analytics");
  if (!checks.isBusinessAccount)   recs.push("Switch to a Business account to access Analytics, Rich Pins, and Ads");
  return recs;
}

export async function savePinterestToken(storeId, token) {
  await prisma.seoSetting.upsert({
    where:  { storeId_key: { storeId, key: "pinterest_access_token" } },
    create: { storeId, key: "pinterest_access_token", value: token },
    update: { value: token },
  });
}

export async function getPinterestAuditResults(storeId) {
  const [saved, tokenSetting] = await Promise.all([
    prisma.seoSetting.findUnique({ where: { storeId_key: { storeId, key: "pinterest_audit_results" } } }),
    prisma.seoSetting.findUnique({ where: { storeId_key: { storeId, key: "pinterest_access_token" } } }),
  ]);
  return {
    data:      saved?.value ? JSON.parse(saved.value) : null,
    connected: !!tokenSetting?.value,
  };
}

// ─── AUTO PIN CREATOR ─────────────────────────────────────────────────────────

// Generate SEO-optimized Pin title + description with Claude
async function generatePinContent(product, keyword, language = "ro") {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const model = process.env.AI_MODEL_FAST || "claude-haiku-4-5-20251001";

  const prompt = `You are a Pinterest SEO expert. Create an optimized Pin for this Shopify product.

Product: ${product.title}
Description: ${(product.body_html || product.description || "").replace(/<[^>]*>/g, "").slice(0, 300)}
Price: ${product.price ? `${product.price} RON` : ""}
Language: ${language === "ro" ? "Romanian" : "English"}
Target keyword: ${keyword || ""}

Pinterest SEO rules:
- Title: max 100 chars, keyword first, clear and descriptive (not clickbait)
- Description: 150-300 chars, keyword-rich, natural language, ends with CTA
- Include 1-2 relevant hashtags at end of description
- Aspirational/inspirational tone for Pinterest audience
- Romanian e-commerce context

Respond ONLY with valid JSON, plain ASCII:
{"title":"Pin title here max 100 chars","description":"Description 150-300 chars with CTA and hashtags","alt_text":"Image alt text for accessibility 50-100 chars","board_suggestion":"Suggested board name for this pin"}`;

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method:  "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body:    JSON.stringify({ model, max_tokens: 400, messages: [{ role: "user", content: prompt }] }),
    });
    const data = await resp.json();
    const text = (data.content?.[0]?.text || "").replace(/[^\x20-\x7E]/g, " ");
    const start = text.indexOf("{");
    const end   = text.lastIndexOf("}");
    if (start === -1) return null;
    return JSON.parse(text.slice(start, end + 1));
  } catch (e) {
    console.warn("[Pinterest] generatePinContent failed:", e.message);
    return null;
  }
}

// Get or create board by name
async function getOrCreateBoard(token, boardName) {
  // Try to find existing board
  const resp = await fetch(`${PINTEREST_API}/boards?page_size=100`, {
    headers: { "Authorization": `Bearer ${token}` },
  });
  if (resp.ok) {
    const data = await resp.json();
    const existing = (data.items || []).find(b =>
      b.name?.toLowerCase() === boardName.toLowerCase()
    );
    if (existing) return existing.id;
  }

  // Create new board
  const createResp = await fetch(`${PINTEREST_API}/boards`, {
    method:  "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body:    JSON.stringify({
      name:        boardName,
      description: `${boardName} - Produse selectate from our store`,
      privacy:     "PUBLIC",
    }),
  });
  if (!createResp.ok) {
    if (createResp.status === 401) throw new Error("Pinterest token missing boards:write scope. Regenerate token at developers.pinterest.com with boards:read + boards:write + pins:read + pins:write scopes.");
    if (createResp.status === 403) throw new Error("Pinterest access denied. Check token scopes: boards:write required.");
    throw new Error(`Board create failed: ${createResp.status}`);
  }
  const board = await createResp.json();
  return board.id;
}

// Post a single Pin to Pinterest
async function postPin(token, { boardId, imageUrl, title, description, altText, link }) {
  const resp = await fetch(`${PINTEREST_API}/pins`, {
    method:  "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body:    JSON.stringify({
      board_id: boardId,
      title:    title.slice(0, 100),
      description: description.slice(0, 500),
      alt_text: (altText || title).slice(0, 500),
      link,
      media_source: {
        source_type: "image_url",
        url:         imageUrl,
      },
    }),
  });

  const data = await resp.json();
  if (!resp.ok) throw new Error(`Pin create failed: ${resp.status} — ${JSON.stringify(data)}`);
  return data;
}

// Main: auto-post pins for products
export async function autoPostPins(storeId, shopDomain, accessToken, options = {}) {
  const {
    productIds   = [],   // specific product IDs, or empty = use recent products
    keyword      = "",
    boardName    = "",
    language     = "ro",
    maxPins      = 5,
    siteUrl      = "",
  } = options;

  const token = await getPinterestToken(storeId);
  if (!token) throw new Error("Pinterest not connected — add access token first");

  // Get products from Shopify API
  let products = [];
  const idsParam = productIds.length > 0 ? `&ids=${productIds.join(",")}` : "";
  const shopResp = await fetch(
    `https://${shopDomain}/admin/api/2025-04/products.json?limit=${maxPins}&fields=id,title,body_html,images,variants,handle${idsParam}`,
    { headers: { "X-Shopify-Access-Token": accessToken } }
  );
  if (!shopResp.ok) throw new Error("Could not fetch products from Shopify");
  const shopData = await shopResp.json();
  products = shopData.products || [];

  if (products.length === 0) throw new Error("No products found");

  console.log(`[Pinterest] Auto-posting ${products.length} pins`);

  // Determine board
  const finalBoardName = boardName || "Recommended Products";
  const boardId = await getOrCreateBoard(token, finalBoardName);
  console.log(`[Pinterest] Using board: ${finalBoardName} (${boardId})`);

  const baseDomain = siteUrl || `https://${shopDomain.replace(".myshopify.com", ".ro")}`;
  const results = [];

  for (const product of products.slice(0, maxPins)) {
    try {
      // Get best image
      const imageUrl = product.images?.[0]?.src;
      if (!imageUrl) {
        console.warn(`[Pinterest] No image for product: ${product.title}`);
        continue;
      }

      // Get product price
      const price = product.variants?.[0]?.price;

      // Generate AI content
      const content = await generatePinContent(
        { ...product, price },
        keyword,
        language
      );

      if (!content) {
        console.warn(`[Pinterest] No content generated for: ${product.title}`);
        continue;
      }

      // Product URL
      const productUrl = `${baseDomain}/products/${product.handle}`;

      // Post pin
      const pin = await postPin(token, {
        boardId,
        imageUrl,
        title:       content.title       || product.title,
        description: content.description || product.title,
        altText:     content.alt_text    || product.title,
        link:        productUrl,
      });

      results.push({
        productId:   product.id,
        productTitle: product.title,
        pinId:       pin.id,
        title:       content.title,
        description: content.description,
        imageUrl,
        productUrl,
        boardName:   finalBoardName,
        status:      "posted",
      });

      console.log(`[Pinterest] Posted pin for: ${product.title} → pin ${pin.id}`);

      // Rate limit — 1 pin/sec
      if (products.indexOf(product) < products.length - 1) {
        await new Promise(r => setTimeout(r, 1200));
      }
    } catch (e) {
      console.error(`[Pinterest] Failed to post pin for ${product.title}:`, e.message);
      results.push({
        productTitle: product.title,
        status:       "failed",
        error:        e.message,
      });
    }
  }

  // Save posting history
  const history = await prisma.seoSetting.findUnique({
    where: { storeId_key: { storeId, key: "pinterest_pin_history" } },
  });
  const prevHistory = history?.value ? JSON.parse(history.value) : [];
  const newHistory = [...results, ...prevHistory].slice(0, 100);

  await prisma.seoSetting.upsert({
    where:  { storeId_key: { storeId, key: "pinterest_pin_history" } },
    create: { storeId, key: "pinterest_pin_history", value: JSON.stringify(newHistory) },
    update: { value: JSON.stringify(newHistory) },
  });

  return {
    posted:  results.filter(r => r.status === "posted").length,
    failed:  results.filter(r => r.status === "failed").length,
    results,
    boardName: finalBoardName,
    boardId,
  };
}

export async function getPinHistory(storeId) {
  const s = await prisma.seoSetting.findUnique({
    where: { storeId_key: { storeId, key: "pinterest_pin_history" } },
  });
  return s?.value ? JSON.parse(s.value) : [];
}

// ─── PRIMARY DOMAIN (for product URLs) ──────────────────────────────────────

async function fetchPrimaryDomain(shopDomain, accessToken) {
  try {
    const r = await fetch(`https://${shopDomain}/admin/api/2025-04/shop.json`, {
      headers: { "X-Shopify-Access-Token": accessToken },
    });
    if (r.ok) {
      const data = await r.json();
      const d = data.shop?.domain;
      if (d) return `https://${d}`;
    }
  } catch {}
  return `https://${shopDomain}`;
}

// ─── CREATE BOARD ────────────────────────────────────────────────────────────

export async function createPinterestBoard(storeId, { name, description = "", privacy = "PUBLIC" }) {
  const token = await getPinterestToken(storeId);
  if (!token) throw new Error("Pinterest not connected");
  if (!name?.trim()) throw new Error("Board name is required");

  const resp = await fetch(`${PINTEREST_API}/boards`, {
    method:  "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body:    JSON.stringify({ name: name.trim(), description, privacy }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    if (resp.status === 401) throw new Error("Pinterest token missing boards:write scope. Reconnect with the right scopes.");
    if (resp.status === 403) throw new Error("Pinterest needs Production access for boards:write. Apply at developers.pinterest.com.");
    if (resp.status === 409) throw new Error(`Board "${name}" already exists in your account.`);
    throw new Error(`Could not create board (${resp.status})${body ? `: ${body.slice(0, 200)}` : ""}`);
  }

  const board = await resp.json();
  return { id: board.id, name: board.name, privacy: board.privacy, pinCount: 0 };
}

// ─── COLLECTIONS ─────────────────────────────────────────────────────────────

export async function listShopifyCollections(shopDomain, accessToken) {
  const headers = { "X-Shopify-Access-Token": accessToken };
  const [smartResp, customResp] = await Promise.all([
    fetch(`https://${shopDomain}/admin/api/2025-04/smart_collections.json?limit=250&fields=id,title,handle,products_count`,  { headers }).catch(() => null),
    fetch(`https://${shopDomain}/admin/api/2025-04/custom_collections.json?limit=250&fields=id,title,handle,products_count`, { headers }).catch(() => null),
  ]);
  const smart  = smartResp?.ok  ? (await smartResp.json()).smart_collections  || [] : [];
  const custom = customResp?.ok ? (await customResp.json()).custom_collections || [] : [];
  return [...smart, ...custom]
    .map(c => ({
      id:            String(c.id),
      title:         c.title,
      handle:        c.handle,
      productsCount: c.products_count || 0,
    }))
    .filter(c => c.productsCount > 0)
    .sort((a, b) => a.title.localeCompare(b.title));
}

// ─── FRESH/RECENT FILTERING ─────────────────────────────────────────────────

export async function getRecentlyPostedProductIds(storeId, days = 60) {
  const since = new Date(Date.now() - days * 86_400_000);
  const rows = await prisma.scheduledPin.findMany({
    where:  { storeId, productId: { not: null }, createdAt: { gte: since } },
    select: { productId: true },
    distinct: ["productId"],
  });
  return new Set(rows.map(r => r.productId).filter(Boolean));
}

// ─── PRODUCT PICKER ──────────────────────────────────────────────────────────

export async function listShopifyProductsForPicker(shopDomain, accessToken, query = "") {
  const search = query ? `&title=${encodeURIComponent(query)}` : "";
  const resp = await fetch(
    `https://${shopDomain}/admin/api/2025-04/products.json?limit=50&fields=id,title,handle,body_html,images,variants,status,product_type${search}`,
    { headers: { "X-Shopify-Access-Token": accessToken } }
  );
  if (!resp.ok) throw new Error(`Could not fetch products: ${resp.status}`);
  const data = await resp.json();
  return (data.products || [])
    .filter(p => p.status === "active" && p.images?.length > 0)
    .map(p => ({
      id:           p.id,
      title:        p.title,
      handle:       p.handle,
      description:  (p.body_html || "").replace(/<[^>]*>/g, "").trim().slice(0, 500),
      images:       (p.images || []).map(img => ({ id: img.id, src: img.src, alt: img.alt || "" })),
      price:        p.variants?.[0]?.price || null,
      productType:  p.product_type || null,
    }));
}

// ─── AI ASSIST (per-field, single-shot) ──────────────────────────────────────

async function callClaudeText(prompt, maxTokens = 200) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("AI assist not configured (ANTHROPIC_API_KEY missing in Railway env vars)");
  const model = process.env.AI_MODEL_FAST || "claude-haiku-4-5-20251001";
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method:  "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body:    JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] }),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    let detail = "";
    try {
      const parsed = JSON.parse(body);
      detail = parsed.error?.message || parsed.error?.type || "";
    } catch {}
    console.error("[Pinterest AI] Anthropic", resp.status, body.slice(0, 400));
    if (resp.status === 401) throw new Error("AI: invalid Anthropic API key (check ANTHROPIC_API_KEY in Railway)");
    if (resp.status === 429) throw new Error("AI: rate limit hit, try again in a few seconds");
    if (resp.status === 400 && /credit/i.test(detail)) throw new Error("AI: Anthropic account has no credits — top up at console.anthropic.com/settings/billing");
    throw new Error(detail ? `AI: ${detail}` : `AI request failed (${resp.status})`);
  }
  const data = await resp.json();
  return (data.content?.[0]?.text || "").trim();
}

function langLabel(language) { return language === "ro" ? "Romanian" : "English"; }

function stripWrap(s) { return s.replace(/^["'`]+|["'`]+$/g, "").trim(); }

export async function aiPolishTitle({ product = {}, currentTitle = "", keyword = "", language = "ro" }) {
  const prompt = `Optimize this title for Pinterest SEO. Rules: max 100 chars, keyword first, clear and descriptive (not clickbait), aspirational tone for Pinterest audience.

Product: ${product.title || "(unknown)"}
Current draft: ${currentTitle || "(none)"}
Target keyword: ${keyword || "(none)"}
Language: ${langLabel(language)}

Respond with JUST the optimized title text, no quotes, no explanation, max 100 chars.`;
  const text = await callClaudeText(prompt, 100);
  return stripWrap(text).slice(0, 100);
}

export async function aiGenerateDescription({ product = {}, keyword = "", language = "ro" }) {
  const desc = (product.body_html || product.description || "").replace(/<[^>]*>/g, "").slice(0, 500);
  const prompt = `Write a Pinterest pin description optimized for SEO. Rules: 150-300 chars, keyword-rich natural language (no hashtag stuffing — Pinterest deprecated hashtag boost in 2024), ends with a clear CTA. Aspirational tone.

Product: ${product.title || "(unknown)"}
Description: ${desc || "(none)"}
${product.price ? `Price: ${product.price} RON` : ""}
Target keyword: ${keyword || "(none)"}
Language: ${langLabel(language)}

Respond with JUST the description text, no quotes, no explanation, 150-300 chars.`;
  const text = await callClaudeText(prompt, 250);
  return stripWrap(text).slice(0, 500);
}

export async function aiGenerateAltText({ product = {}, language = "ro" }) {
  const prompt = `Write accessibility alt text for a Pinterest pin image showing this product. 50-100 chars, describe what would be visually in the image.

Product: ${product.title || "(unknown)"}
${product.productType ? `Category: ${product.productType}` : ""}
Language: ${langLabel(language)}

Respond with JUST the alt text, no quotes, no explanation.`;
  const text = await callClaudeText(prompt, 80);
  return stripWrap(text).slice(0, 500);
}

export async function aiSuggestKeywords({ product = {}, language = "ro" }) {
  const prompt = `Suggest 8-12 Pinterest search keywords/topics relevant to this product. Mix broad terms with long-tail intent phrases. Pinterest users search for ideas, inspiration, and solutions. Return ONLY a JSON array of strings, no explanation.

Product: ${product.title || "(unknown)"}
Description: ${(product.body_html || product.description || "").replace(/<[^>]*>/g, "").slice(0, 300)}
${product.productType ? `Category: ${product.productType}` : ""}
Language: ${langLabel(language)}

Example output: ["keyword 1", "long tail keyword 2", "keyword 3"]`;
  const text = await callClaudeText(prompt, 300);
  const start = text.indexOf("[");
  const end   = text.lastIndexOf("]");
  if (start === -1 || end === -1) return [];
  try {
    const arr = JSON.parse(text.slice(start, end + 1));
    if (!Array.isArray(arr)) return [];
    return arr.filter(s => typeof s === "string" && s.length > 0).slice(0, 12);
  } catch { return []; }
}

// ─── SCHEDULING ─────────────────────────────────────────────────────────────

export async function schedulePin(storeId, pinData) {
  const {
    scheduledFor, boardId, boardName, imageUrl, title, description, altText, link,
    source = "manual", productId, productTitle,
  } = pinData;
  if (!scheduledFor) throw new Error("scheduledFor is required");
  const when = new Date(scheduledFor);
  if (isNaN(when.getTime())) throw new Error("Invalid scheduledFor date");
  if (when.getTime() < Date.now() - 60_000) throw new Error("scheduledFor must be in the future");
  if (!boardId)  throw new Error("boardId is required");
  if (!imageUrl) throw new Error("imageUrl is required");
  if (!title)    throw new Error("title is required");

  const created = await prisma.scheduledPin.create({
    data: {
      storeId,
      scheduledFor: when,
      boardId,
      boardName:    boardName || null,
      imageUrl,
      title:        title.slice(0, 100),
      description:  (description || "").slice(0, 500),
      altText:      altText ? altText.slice(0, 500) : null,
      link:         link || "",
      source,
      productId:    productId ? String(productId) : null,
      productTitle: productTitle || null,
    },
  });

  const { armPinTimer } = await import("./pinterest-scheduler.server.js");
  armPinTimer(created);
  return created;
}

export async function listScheduledPins(storeId, { status = null, limit = 100 } = {}) {
  return prisma.scheduledPin.findMany({
    where:   { storeId, ...(status ? { status } : {}) },
    orderBy: { scheduledFor: "asc" },
    take:    limit,
  });
}

export async function cancelScheduledPin(storeId, pinId) {
  const pin = await prisma.scheduledPin.findFirst({ where: { id: pinId, storeId } });
  if (!pin) throw new Error("Scheduled pin not found");
  if (pin.status !== "pending") throw new Error(`Cannot cancel a ${pin.status} pin`);
  const updated = await prisma.scheduledPin.update({
    where: { id: pinId },
    data:  { status: "cancelled" },
  });
  const { disarmPinTimer } = await import("./pinterest-scheduler.server.js");
  disarmPinTimer(pinId);
  return updated;
}

export async function editScheduledPin(storeId, pinId, updates) {
  const pin = await prisma.scheduledPin.findFirst({ where: { id: pinId, storeId } });
  if (!pin) throw new Error("Scheduled pin not found");
  if (pin.status !== "pending") throw new Error(`Cannot edit a ${pin.status} pin`);

  const allowed = ["scheduledFor", "boardId", "boardName", "imageUrl", "title", "description", "altText", "link"];
  const data = {};
  for (const k of allowed) if (updates[k] !== undefined) data[k] = updates[k];

  if (data.scheduledFor) {
    data.scheduledFor = new Date(data.scheduledFor);
    if (isNaN(data.scheduledFor.getTime())) throw new Error("Invalid scheduledFor date");
    if (data.scheduledFor.getTime() < Date.now() - 60_000) throw new Error("scheduledFor must be in the future");
  }
  if (data.title)       data.title       = data.title.slice(0, 100);
  if (data.description) data.description = data.description.slice(0, 500);
  if (data.altText)     data.altText     = data.altText.slice(0, 500);

  const updated = await prisma.scheduledPin.update({ where: { id: pinId }, data });
  const { rearmPinTimer } = await import("./pinterest-scheduler.server.js");
  rearmPinTimer(updated);
  return updated;
}

export async function publishScheduledPinNow(storeId, pinId) {
  const pin = await prisma.scheduledPin.findFirst({ where: { id: pinId, storeId } });
  if (!pin) throw new Error("Scheduled pin not found");
  if (pin.status !== "pending") throw new Error(`Cannot publish a ${pin.status} pin`);
  const updated = await prisma.scheduledPin.update({
    where: { id: pinId },
    data:  { scheduledFor: new Date() },
  });
  const { rearmPinTimer } = await import("./pinterest-scheduler.server.js");
  rearmPinTimer(updated);
  return updated;
}

// ─── SCHEDULED PIN PROCESSOR (cron worker) ──────────────────────────────────

export async function processDueScheduledPins({ batchSize = 20, maxAttempts = 3 } = {}) {
  const due = await prisma.scheduledPin.findMany({
    where: {
      status:       "pending",
      scheduledFor: { lte: new Date() },
      attempts:     { lt: maxAttempts },
    },
    orderBy: { scheduledFor: "asc" },
    take:    batchSize,
  });

  const results = { processed: 0, posted: 0, failed: 0, retried: 0 };

  for (const pin of due) {
    results.processed++;
    try {
      const token = await getPinterestToken(pin.storeId);
      if (!token) throw new Error("Pinterest not connected");
      const posted = await postPin(token, {
        boardId:     pin.boardId,
        imageUrl:    pin.imageUrl,
        title:       pin.title,
        description: pin.description,
        altText:     pin.altText,
        link:        pin.link,
      });
      await prisma.scheduledPin.update({
        where: { id: pin.id },
        data:  {
          status:         "posted",
          pinterestPinId: posted.id,
          postedAt:       new Date(),
          attempts:       pin.attempts + 1,
          errorMessage:   null,
        },
      });
      results.posted++;
    } catch (e) {
      const willRetry = pin.attempts + 1 < maxAttempts;
      await prisma.scheduledPin.update({
        where: { id: pin.id },
        data:  {
          status:       willRetry ? "pending" : "failed",
          errorMessage: (e.message || String(e)).slice(0, 1000),
          attempts:     pin.attempts + 1,
        },
      });
      if (willRetry) results.retried++; else results.failed++;
    }
  }
  return results;
}

// ─── AUTO-POST STAGGER (schedule mode) ──────────────────────────────────────

const STAGGER_HOURS = [14, 18, 21]; // RO engagement-optimal afternoon/evening

function computeStaggerSlots({ count, postsPerDay, startDate }) {
  const slots = [];
  const start = new Date(startDate);
  const hours = STAGGER_HOURS.slice(0, Math.max(1, Math.min(STAGGER_HOURS.length, postsPerDay)));
  let day = 0, hourIdx = 0;
  while (slots.length < count && day < 60) {
    const slot = new Date(start);
    slot.setDate(slot.getDate() + day);
    slot.setHours(hours[hourIdx], 0, 0, 0);
    if (slot.getTime() > Date.now()) slots.push(slot);
    hourIdx++;
    if (hourIdx >= hours.length) { hourIdx = 0; day++; }
  }
  return slots;
}

export async function scheduleAutoPostStaggered(storeId, shopDomain, accessToken, options = {}) {
  const {
    source       = "fresh",    // "fresh" | "recent" | "collection"
    collectionId = null,
    productIds   = [],
    excludeRecentlyPosted = true,
    freshDays    = 60,
    keyword      = "",
    boardName    = "",
    language     = "ro",
    maxPins      = 5,
    postsPerDay  = 3,
    startDate    = null,
  } = options;

  const token = await getPinterestToken(storeId);
  if (!token) throw new Error("Pinterest not connected");

  // 1. Fetch candidate product pool based on source
  const headers = { "X-Shopify-Access-Token": accessToken };
  let candidates = [];

  if (source === "collection" && collectionId) {
    const r = await fetch(
      `https://${shopDomain}/admin/api/2025-04/collections/${collectionId}/products.json?limit=250&fields=id,title,body_html,images,variants,handle,status`,
      { headers }
    );
    if (!r.ok) throw new Error(`Could not fetch collection products (${r.status})`);
    candidates = (await r.json()).products || [];
  } else if (productIds.length > 0) {
    const r = await fetch(
      `https://${shopDomain}/admin/api/2025-04/products.json?limit=250&ids=${productIds.join(",")}&fields=id,title,body_html,images,variants,handle,status`,
      { headers }
    );
    if (!r.ok) throw new Error("Could not fetch products");
    candidates = (await r.json()).products || [];
  } else {
    // "fresh" or "recent" — pull a wide pool to allow exclusion
    const limit = source === "recent" ? maxPins : 250;
    const r = await fetch(
      `https://${shopDomain}/admin/api/2025-04/products.json?limit=${limit}&fields=id,title,body_html,images,variants,handle,status`,
      { headers }
    );
    if (!r.ok) throw new Error("Could not fetch products from Shopify");
    candidates = (await r.json()).products || [];
  }

  // Active + has images
  candidates = candidates.filter(p => p.status === "active" && p.images?.length > 0);
  if (!candidates.length) throw new Error("No products with images found in selected source");

  // 2. Exclude recently-posted (anti-duplicate)
  if (excludeRecentlyPosted && source !== "recent") {
    const recent = await getRecentlyPostedProductIds(storeId, freshDays);
    const fresh = candidates.filter(p => !recent.has(String(p.id)));
    if (fresh.length === 0) {
      throw new Error(`All products in this source were already pinned in the last ${freshDays} days. Pick a different collection or wait for the cooldown.`);
    }
    candidates = fresh;
  }

  // 3. Pick maxPins (random for "fresh", first N for "recent"/"collection")
  let products;
  if (source === "fresh") {
    products = candidates.sort(() => Math.random() - 0.5).slice(0, maxPins);
  } else {
    products = candidates.slice(0, maxPins);
  }

  if (!products.length) throw new Error("No products available for the plan after filtering");

  // 4. Board + canonical primary domain (always from shop.json — never trust client)
  const finalBoardName = boardName || "Recommended Products";
  const boardId    = await getOrCreateBoard(token, finalBoardName);
  const baseDomain = await fetchPrimaryDomain(shopDomain, accessToken);

  const slots = computeStaggerSlots({
    count:       products.length,
    postsPerDay,
    startDate:   startDate ? new Date(startDate) : new Date(Date.now() + 60 * 60 * 1000),
  });

  const created = [];
  for (let i = 0; i < products.length && i < slots.length; i++) {
    const product = products[i];
    const imageUrl = product.images?.[0]?.src;
    if (!imageUrl) continue;
    const price = product.variants?.[0]?.price;
    const content = await generatePinContent({ ...product, price }, keyword, language);
    if (!content) continue;
    const productUrl = `${baseDomain}/products/${product.handle}`;
    const pin = await prisma.scheduledPin.create({
      data: {
        storeId,
        scheduledFor: slots[i],
        boardId,
        boardName:    finalBoardName,
        imageUrl,
        title:        (content.title       || product.title).slice(0, 100),
        description:  (content.description || product.title).slice(0, 500),
        altText:      (content.alt_text    || product.title).slice(0, 500),
        link:         productUrl,
        source:       "auto-post",
        productId:    String(product.id),
        productTitle: product.title,
      },
    });
    created.push(pin);
  }

  // Arm timers for all newly-created scheduled pins
  if (created.length > 0) {
    const { armPinTimer } = await import("./pinterest-scheduler.server.js");
    for (const pin of created) armPinTimer(pin);
  }

  return {
    scheduled: created.length,
    boardName: finalBoardName,
    boardId,
    pins:      created.map(p => ({ id: p.id, scheduledFor: p.scheduledFor, productTitle: p.productTitle })),
  };
}
