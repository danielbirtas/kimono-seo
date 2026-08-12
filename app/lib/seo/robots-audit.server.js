// app/lib/seo/robots-audit.server.js
// Kimono SEO #33 — Robots.txt AI Crawlers Audit

import prisma from "../../db.server.js";

// All AI crawlers that should be allowed for GEO
const AI_BOTS = [
  { name: "GPTBot",           company: "OpenAI",      impact: "critical", description: "ChatGPT web browsing and training" },
  { name: "ClaudeBot",        company: "Anthropic",   impact: "critical", description: "Claude AI assistant browsing" },
  { name: "PerplexityBot",    company: "Perplexity",  impact: "critical", description: "Perplexity AI search engine" },
  { name: "Googlebot-Extended", company: "Google",    impact: "critical", description: "Google AI Overviews and Bard" },
  { name: "Bingbot",          company: "Microsoft",   impact: "high",     description: "Bing search and Copilot AI" },
  { name: "anthropic-ai",     company: "Anthropic",   impact: "high",     description: "Anthropic AI training crawler" },
  { name: "cohere-ai",        company: "Cohere",      impact: "medium",   description: "Cohere AI training" },
  { name: "Meta-ExternalAgent", company: "Meta",      impact: "medium",   description: "Meta AI assistant" },
  { name: "FacebookBot",      company: "Meta",        impact: "medium",   description: "Meta AI and Facebook" },
  { name: "Applebot-Extended", company: "Apple",      impact: "medium",   description: "Apple Intelligence and Siri" },
  { name: "Bytespider",       company: "ByteDance",   impact: "low",      description: "TikTok AI crawler" },
  { name: "CCBot",            company: "Common Crawl", impact: "low",     description: "AI training dataset (Common Crawl)" },
];

// Parse robots.txt content
function parseRobotsTxt(content) {
  const rules = {};
  let currentAgent = null;

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;

    const field = line.slice(0, colonIdx).trim().toLowerCase();
    const value = line.slice(colonIdx + 1).trim();

    if (field === "user-agent") {
      currentAgent = value.toLowerCase();
      if (!rules[currentAgent]) rules[currentAgent] = { disallow: [], allow: [] };
    } else if (field === "disallow" && currentAgent) {
      if (value) rules[currentAgent].disallow.push(value);
    } else if (field === "allow" && currentAgent) {
      if (value) rules[currentAgent].allow.push(value);
    }
  }

  return rules;
}

// Check if a bot is blocked
function isBotBlocked(botName, rules) {
  const botLower = botName.toLowerCase();

  // Check specific rule for this bot
  const specificRule = rules[botLower];
  if (specificRule) {
    if (specificRule.disallow.includes("/")) return { blocked: true, source: "specific" };
    if (specificRule.disallow.length > 0 && specificRule.allow.length === 0) return { blocked: true, source: "specific" };
    return { blocked: false, source: "specific" };
  }

  // Check wildcard rule
  const wildcardRule = rules["*"];
  if (wildcardRule) {
    if (wildcardRule.disallow.includes("/")) return { blocked: true, source: "wildcard" };
  }

  return { blocked: false, source: "default_allow" };
}

// Resolve the best domain to audit (primary custom domain > shopDomain)
async function resolvePrimaryDomain(shopDomain) {
  try {
    const conn = await prisma.storeConnection.findFirst({
      where:   { shopDomain, isActive: true, platform: "SHOPIFY" },
      orderBy: { connectedAt: "desc" },
    });
    if (conn?.accessToken) {
      const r = await fetch(`https://${shopDomain}/admin/api/2025-04/graphql.json`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": conn.accessToken },
        body: JSON.stringify({ query: `{ shop { primaryDomain { host url } } }` }),
        signal: AbortSignal.timeout(8000),
      });
      const d = await r.json();
      const host = d?.data?.shop?.primaryDomain?.host;
      if (host && !host.endsWith(".myshopify.com")) return host;
    }
  } catch {}
  return shopDomain;
}

// Fetch robots.txt with realistic User-Agent (some hosts 429 crawlers without one)
async function fetchRobots(domain) {
  const resp = await fetch(`https://${domain}/robots.txt`, {
    headers: {
      "User-Agent": `Mozilla/5.0 (compatible; Kimono-SEO-Audit/1.0; +${process.env.APP_URL || "http://localhost:3000"})`,
      "Accept": "text/plain, */*",
      "Accept-Language": "en-US,en;q=0.9,ro;q=0.8",
    },
    signal: AbortSignal.timeout(10000),
  });
  return resp;
}

// Fetch and audit robots.txt
export async function auditRobotsTxt(shopDomain) {
  // Prefer primary domain (vivimall.ro) over .myshopify.com — Shopify rate-limits myshopify
  const primary = await resolvePrimaryDomain(shopDomain);

  const results = {
    url: `https://${primary}/robots.txt`,
    fetchedAt: new Date().toISOString(),
    status: "ok",
    blockedCount: 0,
    warningCount: 0,
    bots: [],
    rawContent: "",
    recommendations: [],
  };

  // Try primary, fallback to shopDomain if primary fails
  let resp = null;
  let tried = [primary];
  try {
    resp = await fetchRobots(primary);
  } catch (e) {
    results.error = `fetch error on ${primary}: ${e.message}`;
  }

  // Retry on shopDomain if primary returned non-2xx or failed
  if ((!resp || !resp.ok) && primary !== shopDomain) {
    tried.push(shopDomain);
    try {
      const resp2 = await fetchRobots(shopDomain);
      if (resp2.ok) { resp = resp2; results.url = `https://${shopDomain}/robots.txt`; }
    } catch {}
  }

  if (!resp || !resp.ok) {
    results.status = "fetch_error";
    results.error = `HTTP ${resp?.status ?? "n/a"} (tried: ${tried.join(", ")}). Dacă e 429, magazinul rate-limituiește crawlerele anonime — configurează domeniul primary (Cloudflare Allow List) sau dezactivează Bot Fight Mode pentru robots.txt.`;
    return results;
  }

  try {
    results.rawContent = await resp.text();
  } catch (e) {
    results.status = "fetch_error";
    results.error = e.message;
    return results;
  }

  // Parse
  const rules = parseRobotsTxt(results.rawContent);

  // Check each AI bot
  for (const bot of AI_BOTS) {
    const { blocked, source } = isBotBlocked(bot.name, rules);
    const botResult = { ...bot, blocked, blockedBy: source };
    results.bots.push(botResult);
    if (blocked && bot.impact === "critical") results.blockedCount++;
    if (blocked && bot.impact === "high") results.warningCount++;
  }

  // Overall status
  if (results.blockedCount > 0) results.status = "critical";
  else if (results.warningCount > 0) results.status = "warning";
  else results.status = "ok";

  // Generate recommendations
  const blocked = results.bots.filter(b => b.blocked);
  if (blocked.length > 0) {
    const names = blocked.map(b => b.name).join(", ");
    results.recommendations.push({
      priority: results.blockedCount > 0 ? "critical" : "high",
      text: `${blocked.length} AI crawlers are blocked: ${names}. Add explicit Allow rules or remove Disallow / for these bots.`,
      fix: blocked.map(b => `User-agent: ${b.name}\nAllow: /`).join("\n\n"),
    });
  }

  // Check Cloudflare (heuristic — can't detect server-side but mention it)
  if (results.rawContent.toLowerCase().includes("cloudflare") || results.rawContent === "") {
    results.recommendations.push({
      priority: "medium",
      text: "If you use Cloudflare, check Bot Fight Mode — it may block AI crawlers at the network level even if robots.txt allows them.",
      fix: "In Cloudflare dashboard → Security → Bots → disable Bot Fight Mode or add AI bot IPs to allowlist.",
    });
  }

  return results;
}

// Save audit result to DB
export async function saveAuditResult(storeId, result) {
  await prisma.seoSetting.upsert({
    where: { storeId_key: { storeId, key: "robots_audit_result" } },
    create: { storeId, key: "robots_audit_result", value: JSON.stringify(result) },
    update: { value: JSON.stringify(result) },
  });
}

// Get saved audit result
export async function getAuditResult(storeId) {
  const setting = await prisma.seoSetting.findUnique({
    where: { storeId_key: { storeId, key: "robots_audit_result" } },
  });
  if (!setting?.value) return null;
  try { return JSON.parse(setting.value); } catch { return null; }
}

// Generate the fix snippet for robots.txt
export function generateFixSnippet(blockedBots) {
  if (!blockedBots || blockedBots.length === 0) return "";
  return blockedBots.map(b => `User-agent: ${b.name}\nAllow: /`).join("\n\n");
}
