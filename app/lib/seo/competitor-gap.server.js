// app/lib/seo/competitor-gap.server.js
// Kimono SEO #18 — Competitor Gap Analysis
// Strategy: serp_competitors (Labs) → fallback SERP-based

import prisma from "../../db.server.js";

function getDfsAuth() {
  const l = process.env.DATAFORSEO_LOGIN    || "";
  const p = process.env.DATAFORSEO_PASSWORD || "";
  if (!l || !p) return null;
  return Buffer.from(`${l}:${p}`).toString("base64");
}

async function dfsPost(endpoint, body) {
  const auth = getDfsAuth();
  if (!auth) throw new Error("DataForSEO not configured");
  const resp = await fetch(`https://api.dataforseo.com${endpoint}`, {
    method:  "POST",
    headers: { "Authorization": `Basic ${auth}`, "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });
  const data = await resp.json();
  console.log(`[DFS] ${endpoint} | http=${resp.status} status=${data.status_code} task=${data.tasks?.[0]?.status_code} msg=${data.tasks?.[0]?.status_message}`);
  return data;
}

// ─── Approach A: serp_competitors — give keywords, get competing domains ──────
async function trySerpCompetitors(seedKeywords, locationCode = 2040) {
  const data = await dfsPost("/v3/dataforseo_labs/google/serp_competitors/live", [{
    keywords:      seedKeywords,
    location_code: locationCode,
    limit:         50,
  }]);

  const task   = data.tasks?.[0];
  const result = task?.result?.[0];
  console.log(`[Gap] serp_competitors: task_status=${task?.status_code} total=${result?.total_count} items=${result?.items_count}`);

  if (task?.status_code !== 20000 || !result?.items?.length) {
    console.log(`[Gap] serp_competitors not available (status=${task?.status_code}), using SERP fallback`);
    return null;
  }

  // Returns domains ranked for these keywords with metrics
  return result.items.map(i => ({
    domain:           i.domain || "",
    avgPosition:      i.avg_position || 0,
    sumPosition:      i.sum_position || 0,
    intersections:    i.intersections || 0,
    etv:              i.etv || 0,
    relevantSerpItems: i.relevant_serp_items || 0,
  }));
}

// ─── Approach B: SERP-based — check each keyword manually ────────────────────
async function checkSerpForKeyword(keyword, locationCode = 2040) {
  const data = await dfsPost("/v3/serp/google/organic/live/advanced", [{
    keyword,
    location_code: locationCode,
    language_code: "ro",
    device:        "desktop",
    os:            "windows",
    depth:         10,
  }]);

  const items = data.tasks?.[0]?.result?.[0]?.items || [];
  const organic = items
    .filter(i => i.type === "organic")
    .map(i => ({ domain: i.domain || "", url: i.url || "", position: i.rank_absolute || 0 }));
  const related = items
    .filter(i => i.type === "related_searches")
    .flatMap(i => i.items?.map(r => r.query || "") || [])
    .filter(Boolean).slice(0, 6);

  return { organic, related };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export async function runCompetitorGapAnalysis(storeId, shopDomain) {
  const [gscSite, compSetting, seedSetting] = await Promise.all([
    prisma.seoSetting.findUnique({ where: { storeId_key: { storeId, key: "seo_gsc_site_url" } } }),
    prisma.seoSetting.findUnique({ where: { storeId_key: { storeId, key: "gap_competitors" } } }),
    prisma.seoSetting.findUnique({ where: { storeId_key: { storeId, key: "gap_seed_keywords" } } }),
  ]);

  const ownDomain = (gscSite?.value || "")
    .replace(/https?:\/\//, "").replace(/\/$/, "")
    || shopDomain.replace(".myshopify.com", "") + ".ro";

  const competitors = (compSetting?.value || "")
    .split("\n").map(c => c.trim().replace(/https?:\/\//, "").replace(/\/$/, "")).filter(Boolean).slice(0, 5);

  const seedKeywords = (seedSetting?.value || "")
    .split("\n").map(k => k.trim()).filter(Boolean).slice(0, 5);

  if (competitors.length === 0) throw new Error("No competitors configured");
  if (seedKeywords.length === 0) throw new Error("No seed keywords configured");

  console.log(`[Gap] START: ${ownDomain} vs [${competitors.join(", ")}] | seeds: [${seedKeywords.join(", ")}]`);

  const ownSlug  = ownDomain.split(".")[0].toLowerCase();
  const compSlugs = competitors.map(c => c.split(".")[0].toLowerCase());

  // ── Try serp_competitors first ──────────────────────────────────────────────
  const serpCompResult = await trySerpCompetitors(seedKeywords);

  if (serpCompResult) {
    // Filter: competitors present, own domain absent
    const ownPresent = serpCompResult.some(r => r.domain.toLowerCase().includes(ownSlug));
    const compDomains = serpCompResult.filter(r =>
      compSlugs.some(s => r.domain.toLowerCase().includes(s))
    );

    console.log(`[Gap] serp_competitors: ${serpCompResult.length} domains | own present: ${ownPresent} | comp matches: ${compDomains.length}`);
    console.log(`[Gap] Top domains:`, serpCompResult.slice(0, 5).map(r => `${r.domain}(${r.intersections}kw)`).join(", "));

    // Build gaps from competitor-ranked keywords we don't have
    const gaps = compDomains.map(comp => ({
      keyword:      seedKeywords.join(", ") + " (nișă)",
      volume:       Math.round(comp.etv || 0),
      difficulty:   0,
      cpc:          0,
      score:        comp.intersections * 10,
      competitor:   comp.domain,
      compPosition: Math.round(comp.avgPosition),
      compUrl:      `https://${comp.domain}`,
      compCount:    1,
      intersections: comp.intersections,
    }));

    const result = {
      ownDomain, competitors, seedKeywords,
      keywordsChecked: seedKeywords.length,
      gapCount:        gaps.length,
      gaps:            gaps.sort((a, b) => b.score - a.score),
      allCompetitors:  serpCompResult.slice(0, 20),
      method:          "serp_competitors",
      analyzedAt:      new Date().toISOString(),
    };

    await prisma.seoSetting.upsert({
      where:  { storeId_key: { storeId, key: "competitor_gap_results" } },
      create: { storeId, key: "competitor_gap_results", value: JSON.stringify(result) },
      update: { value: JSON.stringify(result) },
    });

    console.log(`[Gap] DONE via serp_competitors — ${gaps.length} competitor matches`);
    return result;
  }

  // ── Fallback: SERP-based keyword expansion ─────────────────────────────────
  console.log(`[Gap] Using SERP fallback`);
  const keywordsToCheck = new Set(seedKeywords);

  for (const seed of seedKeywords) {
    try {
      const { related } = await checkSerpForKeyword(seed);
      related.forEach(k => keywordsToCheck.add(k));
      await new Promise(r => setTimeout(r, 800));
    } catch (e) {
      console.warn(`[Gap] seed SERP failed "${seed}":`, e.message);
    }
  }

  const allKeywords = [...keywordsToCheck];
  const maxChecks   = Math.min(allKeywords.length, 40);
  console.log(`[Gap] SERP fallback: checking ${maxChecks} keywords`);

  const gaps = [];
  for (let i = 0; i < maxChecks; i++) {
    const kw = allKeywords[i];
    try {
      const { organic } = await checkSerpForKeyword(kw);
      const ownRanks    = organic.some(r => r.domain.toLowerCase().includes(ownSlug));
      const compMatches = organic.filter(r => compSlugs.some(s => r.domain.toLowerCase().includes(s)));

      if (!ownRanks && compMatches.length > 0) {
        const best = compMatches[0];
        gaps.push({
          keyword: kw, volume: 0, difficulty: 0, cpc: 0,
          score:        compMatches.length * 10 + (11 - best.position),
          competitor:   best.domain,
          compPosition: best.position,
          compUrl:      best.url,
          compCount:    compMatches.length,
        });
        console.log(`[Gap] GAP: "${kw}" — ${best.domain} #${best.position}`);
      }
      if (i < maxChecks - 1) await new Promise(r => setTimeout(r, 800));
    } catch (e) {
      console.warn(`[Gap] SERP check failed "${kw}":`, e.message);
    }
  }

  const result = {
    ownDomain, competitors, seedKeywords,
    keywordsChecked: maxChecks,
    gapCount:        gaps.length,
    gaps:            gaps.sort((a, b) => b.score - a.score),
    method:          "serp_fallback",
    analyzedAt:      new Date().toISOString(),
  };

  await prisma.seoSetting.upsert({
    where:  { storeId_key: { storeId, key: "competitor_gap_results" } },
    create: { storeId, key: "competitor_gap_results", value: JSON.stringify(result) },
    update: { value: JSON.stringify(result) },
  });

  console.log(`[Gap] DONE via SERP fallback — ${gaps.length} gaps from ${maxChecks} checks`);
  return result;
}

export async function getCompetitorGapResults(storeId) {
  const s = await prisma.seoSetting.findUnique({
    where: { storeId_key: { storeId, key: "competitor_gap_results" } },
  });
  if (!s?.value) return null;
  try { return JSON.parse(s.value); } catch { return null; }
}
