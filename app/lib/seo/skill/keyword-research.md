---
name: keyword-research-openclaw
description: >
  Openclaw keyword research, triage, and content opportunity engine for Shopify stores.
  Performs keyword discovery, commercial intent classification, keyword clustering, and
  content gap analysis using DataForSEO data. Produces prioritized keyword lists, topic
  cluster maps, and pipeline-ready JSON for the Openclaw content engine. Use whenever
  the user asks about keywords, keyword research, what to write about, keyword gaps,
  search volume, keyword difficulty, topic clusters, pillar pages, keyword strategy,
  commercial intent, or content opportunities for a Shopify store or product category.
  Also trigger for "find keywords for", "what keywords should I target", "keyword gap
  analysis", "topic cluster for", "content calendar ideas", or any request about
  search demand and content strategy.
---

# Keyword Research — Openclaw Engine

Keyword discovery, triage, and clustering for Shopify eCommerce content strategy.
Produces actionable, pipeline-ready output for the Openclaw article generator.

---

## Workflow overview

1. Understand scope (product/niche/competitor)
2. Expand seed keywords via DataForSEO
3. Triage by commercial intent using regex classification
4. Cluster into topic groups
5. Score and prioritize
6. Output pipeline JSON

---

## Step 1: Scope definition

Ask the user (or extract from context):
- Seed keyword(s) or product category
- Target market / geography (default: US)
- Shopify store URL (for content gap analysis against existing pages)
- Competitor URLs (optional, for gap analysis)
- Content goals: transactional (product/collection pages), informational (blog), or both

---

## Step 2: DataForSEO keyword expansion

See [references/dataforseo-endpoints.md](references/dataforseo-endpoints.md) for full API reference.

**Primary expansion calls:**
```
POST /v3/keywords_data/google_ads/search_volume/live
POST /v3/dataforseo_labs/google/related_keywords/live
POST /v3/dataforseo_labs/google/keyword_suggestions/live
POST /v3/dataforseo_labs/google/bulk_keyword_difficulty/live
```

**Expansion strategy:**
1. Start with seed keywords → get volume + difficulty
2. Pull related keywords (up to 200 per seed)
3. Pull "People Also Ask" style suggestions
4. For competitor analysis: use `/v3/dataforseo_labs/google/competitors_domain/live` then
   `/v3/dataforseo_labs/google/domain_keywords_for_categories/live`

**Data points to collect per keyword:**
- `keyword` (string)
- `search_volume` (monthly avg)
- `competition` (0-1 float, Google Ads)
- `keyword_difficulty` (0-100)
- `cpc` (avg cost per click — commercial intent proxy)
- `trend` (12-month array — seasonal patterns)
- `serp_info` (top results — what's ranking, content type)

---

## Step 3: Commercial intent triage

Classify every keyword into one of four intent buckets using this regex classification:

```javascript
// TRANSACTIONAL — buy intent (highest commercial value)
const transactional = /\b(buy|order|purchase|shop|price|cheap|discount|deal|coupon|
  promo|sale|shipping|delivery|free\s+shipping|in\s+stock|where\s+to\s+buy|
  best\s+price|lowest\s+price)\b/i;

// COMMERCIAL INVESTIGATION — research before buy (high value)
const commercial = /\b(best|top|review|vs|versus|compare|comparison|alternative|
  alternatives|worth\s+it|honest\s+review|unboxing|pros\s+and\s+cons|
  is\s+\w+\s+good|should\s+i\s+buy|recommendation)\b/i;

// INFORMATIONAL — educational (medium value, good for blog/GEO)
const informational = /\b(how\s+to|what\s+is|why|when|guide|tutorial|tips|
  ideas|examples|explained|definition|meaning|learn|understand|diy)\b/i;

// NAVIGATIONAL — brand/site lookup (low value for content creation)
const navigational = /\b(login|sign\s+in|account|website|official|app)\b/i;
```

**Exclusion filters (remove from pipeline):**
```javascript
// Exclude competitor brand names (add to list from context)
const competitorBrands = ['competitor1', 'competitor2'];

// Exclude clearly irrelevant results
const excluded = /\b(jobs|careers|salary|reddit|wikipedia|youtube)\b/i;

// Exclude extremely low volume
const minVolume = 100; // monthly searches
```

**Intent scoring for prioritization:**
- Transactional: weight 1.0
- Commercial investigation: weight 0.85
- Informational (high volume): weight 0.7
- Informational (low volume, high specificity): weight 0.6

---

## Step 4: Keyword clustering

Group keywords into topic clusters. Each cluster = one piece of content (product page,
collection page, or blog post).

**Clustering algorithm:**
1. Group by semantic root (strip modifiers: best, top, buy, how to)
2. Group by SERP overlap: if two keywords share 3+ of the same top-10 URLs, they belong to the same cluster. Fetch SERP data for top 20 keywords using DataForSEO `/v3/serp/google/organic/live/advanced` — compare `url` fields across results. This step is optional for small sets (<50 keywords); skip and use semantic grouping only if budget is a concern.
3. Assign a cluster topic name (the highest-volume keyword in the group)
4. Tag each cluster with: `page_type` (product|collection|blog_post), `intent`, `priority`

**Cluster priority scoring formula:**
```
priority_score = (log10(search_volume + 1) * intent_weight) / (keyword_difficulty / 50)
```

Higher score = higher priority. Cap at 10.

---

## Step 5: Content gap analysis

If store URL provided, fetch sitemap and extract existing slugs/handles.
Map existing content to clusters:
- If a cluster has an existing page with a ranking URL: flag as `existing_content`, suggest optimization
- If a cluster has no existing page: flag as `content_gap`, suggest creation

**Gap types:**
- `collection_gap`: high transactional intent, no collection page
- `product_gap`: specific product searches with no matching product page
- `blog_gap`: informational queries with no blog post
- `optimize_existing`: page exists but isn't ranking in top 10

---

## Step 6: Pipeline output

Output structured JSON for the Openclaw article generator:

```json
{
  "research_meta": {
    "store_url": "https://...",
    "seed_keywords": ["..."],
    "geography": "US",
    "data_date": "[TODAY ISO DATE — e.g. 2026-03-28]",
    "total_keywords_analyzed": 847,
    "clusters_identified": 34
  },
  "priority_clusters": [
    {
      "cluster_id": "cl_001",
      "cluster_topic": "best running shoes for flat feet",
      "primary_keyword": "best running shoes for flat feet",
      "supporting_keywords": [
        "running shoes flat feet women",
        "flat feet running shoe recommendations",
        "overpronation running shoes"
      ],
      "total_search_volume": 22400,
      "avg_keyword_difficulty": 42,
      "intent": "commercial_investigation",
      "priority_score": 7.8,
      "recommended_page_type": "blog_post",
      "content_gap_type": "blog_gap",
      "existing_page_url": null,
      "serp_format": "listicle",
      "estimated_word_count": 2200,
      "schema_types": ["BlogPosting", "FAQPage", "ItemList"]
    }
  ],
  "quick_wins": [
    {
      "cluster_id": "cl_012",
      "cluster_topic": "waterproof trail running shoes",
      "existing_page_url": "https://store.com/collections/trail-shoes",
      "current_avg_position": 14,
      "monthly_impressions": 3400,
      "recommended_action": "optimize_existing",
      "specific_fix": "Add primary keyword to H1 and meta title, expand collection description to 400+ words"
    }
  ],
  "content_calendar": [
    {
      "week": 1,
      "cluster_id": "cl_001",
      "cluster_topic": "best running shoes for flat feet",
      "article_type": "listicle",
      "priority": "high",
      "rationale": "Highest priority_score, commercial intent, clear blog gap"
    },
    {
      "week": 2,
      "cluster_id": "cl_005",
      "cluster_topic": "how to choose running shoes",
      "article_type": "how-to",
      "priority": "high",
      "rationale": "Informational anchor for topic cluster, links to product pages"
    }
  ]
}
```

---

## Formatting the in-chat summary

After analysis, present a concise summary:

---
### Keyword Research — [Store/Niche]

**Keywords analyzed:** [count] | **Clusters identified:** [count] | **Geography:** [market]

**Intent distribution:**
- Transactional: X% ([count] keywords)
- Commercial investigation: X%
- Informational: X%
- Excluded: X%

**Top 5 opportunities:**
| Priority | Cluster | Volume | Difficulty | Type | Gap |
|---------|---------|--------|------------|------|-----|
| ... | ... | ... | ... | ... | ... |

**Quick wins (existing pages to optimize):** [count]
**Content to create:** [count] new pieces

*Full cluster map and pipeline JSON ready for article generator.*

---

## Reference files

- [references/dataforseo-endpoints.md](references/dataforseo-endpoints.md) — Full DataForSEO API reference for Openclaw
- [references/intent-patterns.md](references/intent-patterns.md) — Extended regex patterns and edge cases
