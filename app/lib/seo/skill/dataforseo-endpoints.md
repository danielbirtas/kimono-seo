# DataForSEO API Reference — Openclaw

## Contents
- Authentication
- Keyword data endpoints
- SERP endpoints
- Domain analytics endpoints
- Rate limits and pagination
- Error handling

---

## Authentication

```javascript
const auth = Buffer.from(`${process.env.DATAFORSEO_LOGIN}:${process.env.DATAFORSEO_PASSWORD}`).toString('base64');
const headers = {
  'Authorization': `Basic ${auth}`,
  'Content-Type': 'application/json'
};
```

Base URL: `https://api.dataforseo.com`

---

## Keyword Data Endpoints

### Search volume (bulk)
```
POST /v3/keywords_data/google_ads/search_volume/live
```
Body (max 1000 keywords per request):
```json
[{
  "keywords": ["keyword 1", "keyword 2"],
  "location_code": 2840,
  "language_code": "en",
  "date_from": "[12 months ago — YYYY-MM-DD]",
  "date_to": "[yesterday — YYYY-MM-DD]"
}]
```
Returns: `search_volume`, `competition`, `competition_level`, `cpc`, `monthly_searches` (array)

Generate dates dynamically:
```javascript
const today = new Date();
const dateFrom = new Date(today);
dateFrom.setFullYear(today.getFullYear() - 1);
const date_from = dateFrom.toISOString().split('T')[0];
const date_to = new Date(today - 86400000).toISOString().split('T')[0]; // yesterday
```

### Keyword suggestions
```
POST /v3/dataforseo_labs/google/keyword_suggestions/live
```
Body:
```json
[{
  "keyword": "seed keyword",
  "location_code": 2840,
  "language_code": "en",
  "limit": 200,
  "filters": [["keyword_info.search_volume", ">", 100]]
}]
```

### Related keywords
```
POST /v3/dataforseo_labs/google/related_keywords/live
```
Body:
```json
[{
  "keyword": "seed keyword",
  "location_code": 2840,
  "language_code": "en",
  "depth": 2,
  "limit": 300
}]
```

### Keyword difficulty (bulk)
```
POST /v3/dataforseo_labs/google/bulk_keyword_difficulty/live
```
Body (max 1000 keywords):
```json
[{
  "keywords": ["kw1", "kw2"],
  "location_code": 2840,
  "language_code": "en"
}]
```
Returns: `keyword_difficulty` (0-100)

---

## SERP Endpoints

### Organic SERP (live)
```
POST /v3/serp/google/organic/live/advanced
```
Body:
```json
[{
  "keyword": "target keyword",
  "location_code": 2840,
  "language_code": "en",
  "device": "desktop",
  "depth": 10
}]
```
Returns: top 10 results with `url`, `title`, `description`, `rank_absolute`, `type`

### SERP features check
From organic results, check `type` field for:
- `featured_snippet` — AEO opportunity
- `people_also_ask` — AEO/FAQ opportunity
- `local_pack` — local SEO
- `shopping` — product pages
- `ai_overview` — GEO targeting active

---

## Domain Analytics Endpoints

### Domain keywords
```
POST /v3/dataforseo_labs/google/ranked_keywords/live
```
Body:
```json
[{
  "target": "competitor.com",
  "location_code": 2840,
  "language_code": "en",
  "limit": 1000,
  "filters": [["ranked_serp_element.serp_item.rank_absolute", "<=", 10]]
}]
```

### Domain gap (keywords competitor has, you don't)
```
POST /v3/dataforseo_labs/google/domain_intersection/live
```
Body:
```json
[{
  "target1": "mystore.com",
  "target2": "competitor.com",
  "location_code": 2840,
  "language_code": "en",
  "type": "target2_minus_target1",
  "limit": 500
}]
```

### Backlink overview
```
POST /v3/backlinks/summary/live
```
Body:
```json
[{
  "target": "store.com",
  "include_subdomains": true
}]
```
Returns: `referring_domains`, `backlinks`, `referring_ips`, `rank`

---

## Location Codes (common)
- US: 2840
- UK: 2826
- CA: 2124
- AU: 2036
- RO: 2642

---

## Rate Limits

| Plan | Requests/min | Concurrent |
|------|-------------|------------|
| Standard | 2000 | 30 |
| Advanced | 10000 | 60 |

**Cost model:** Credits per request. Budget-aware calls:
- Search volume (1000 keywords): ~0.05 credits
- SERP (1 keyword): ~0.002 credits
- Related keywords (200): ~0.1 credits

Always check credits before bulk operations:
```
GET /v3/appendix/user/credits_balance
```

---

## Pagination

For endpoints returning large datasets:
```json
{
  "offset": 0,
  "limit": 100
}
```
Increment `offset` by `limit` until `total_count <= offset + limit`.

---

## Error handling

| Code | Meaning | Action |
|------|---------|--------|
| 20000 | OK, result ready | Use `data[0].result` |
| 20100 | Task queued | Poll `/v3/tasks/ready` then fetch by task ID |
| 40101 | Auth error | Check credentials |
| 40301 | Insufficient credits | Check balance |
| 50000 | Server error | Retry with backoff |

**20100 polling pattern** (for non-live endpoints that queue tasks):
```javascript
async function fetchQueued(taskId) {
  // Poll until task appears in ready list
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const ready = await fetch('https://api.dataforseo.com/v3/tasks/ready', { headers });
    const readyData = await ready.json();
    const task = readyData[0]?.result?.find(t => t.id === taskId);
    if (task?.endpoint) {
      const result = await fetch(`https://api.dataforseo.com${task.endpoint}`, { headers });
      return (await result.json())[0]?.result;
    }
  }
  throw new Error(`Task ${taskId} not ready after 30s`);
}
```

**Live endpoints** (used by Openclaw — no polling needed):
All endpoints listed in this document use `/live` suffix and return results synchronously.

Retry pattern for live endpoints:
```javascript
async function fetchWithRetry(url, body, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
      const data = await res.json();
      if (data[0]?.status_code === 20000) return data[0].result;
      if (data[0]?.status_code >= 40000) throw new Error(`API error ${data[0].status_code}: ${data[0].status_message}`);
      if (data[0]?.status_code === 50000) throw new Error('Server error');
      return data[0].result;
    } catch (e) {
      if (i === maxRetries - 1) throw e;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
}
```
