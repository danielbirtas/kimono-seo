# Intent Classification Patterns — Openclaw Keyword Research

## Contents
- Extended regex patterns per intent
- Edge cases and overrides
- eCommerce-specific modifiers
- Exclusion patterns
- Classification decision tree
- Examples with correct classification

---

## Extended regex patterns

### TRANSACTIONAL (buy intent)
```javascript
const TRANSACTIONAL = /\b(
  buy|order|purchase|shop|shopping|
  price|prices|cost|costs|how\s+much|
  cheap|cheapest|affordable|budget|
  discount|discounts|deal|deals|offer|offers|
  coupon|coupons|promo|promo\s+code|voucher|
  sale|on\s+sale|clearance|
  free\s+shipping|fast\s+shipping|same\s+day\s+delivery|next\s+day|
  in\s+stock|available|where\s+to\s+buy|where\s+can\s+i\s+buy|
  best\s+price|lowest\s+price|cheapest\s+price|
  near\s+me|local|store|stores|retailer|retailers|
  online|order\s+online|
  \$|usd|eur|gbp|ron
)\b/ix;
```

### COMMERCIAL INVESTIGATION (research before purchase)
```javascript
const COMMERCIAL = /\b(
  best|top|top\s+\d+|best\s+\d+|
  review|reviews|reviewed|
  vs|versus|compared\s+to|comparison|compare|
  alternative|alternatives|instead\s+of|
  worth\s+it|worth\s+buying|is\s+it\s+good|should\s+i\s+buy|
  honest\s+review|unbiased\s+review|
  unboxing|first\s+impressions|
  pros\s+and\s+cons|advantages|disadvantages|
  recommendation|recommendations|recommend|
  ranking|ranked|rated|rating|
  \d+\s+best|\d+\s+top
)\b/ix;
```

### INFORMATIONAL (educational, research)
```javascript
const INFORMATIONAL = /\b(
  how\s+to|how\s+do|how\s+does|how\s+can|
  what\s+is|what\s+are|what\s+does|what\s+do|
  why\s+is|why\s+are|why\s+does|
  when\s+to|when\s+should|
  where\s+does|where\s+do|
  who\s+is|who\s+are|
  guide|guides|tutorial|tutorials|
  tips|tip|advice|
  ideas|inspiration|
  explained|explanation|meaning|definition|
  learn|learning|understand|understanding|
  diy|do\s+it\s+yourself|
  step\s+by\s+step|steps\s+to|
  benefits|advantages|uses|uses\s+of|
  history|origin|
  difference\s+between|difference\s+in|
  types\s+of|kinds\s+of|examples\s+of
)\b/ix;
```

### NAVIGATIONAL (brand/site lookup — low value for content)
```javascript
const NAVIGATIONAL = /\b(
  login|sign\s+in|log\s+in|account|my\s+account|
  website|official\s+website|official\s+site|
  app|download|
  contact|customer\s+service|support|help\s+center|
  return\s+policy|refund|track\s+order|order\s+status|
  careers|jobs|about\s+us
)\b/ix;
```

---

## Edge cases and overrides

### "Best" + product = Commercial Investigation, NOT Informational
- "best running shoes" → COMMERCIAL (shopping intent)
- "best way to tie shoes" → INFORMATIONAL (process intent)
- Rule: if "best" + product noun → COMMERCIAL; if "best" + verb phrase → INFORMATIONAL

### "How to" + buy/get = TRANSACTIONAL
- "how to buy bitcoin" → TRANSACTIONAL
- "how to get free shipping" → TRANSACTIONAL
- Rule: "how to" + transactional verb → TRANSACTIONAL override

### Price modifier = TRANSACTIONAL override
Any keyword containing a price reference ($49, "under $100", "cheap", "affordable") is
TRANSACTIONAL regardless of other signals.

### Location modifier = mixed TRANSACTIONAL + LOCAL
"running shoes near me", "shoe store London" → TRANSACTIONAL with local modifier.
Flag as `intent: "transactional_local"` — these require local SEO treatment, not just content.

### Brand name + generic = COMMERCIAL
"Nike running shoes" → COMMERCIAL (comparison shopping)
"Nike" alone → NAVIGATIONAL
Rule: brand name + category = COMMERCIAL; brand name alone = NAVIGATIONAL

---

## eCommerce-specific modifiers

These modifiers shift intent upward toward TRANSACTIONAL or COMMERCIAL:

```javascript
const ECOMMERCE_MODIFIERS = /\b(
  for\s+women|for\s+men|for\s+kids|for\s+babies|
  size|sizes|small|medium|large|xl|xxl|
  color|colors|black|white|red|blue|navy|
  set|kit|bundle|pack|pair|
  new|brand\s+new|refurbished|used|
  handmade|organic|natural|vegan|cruelty\s+free|
  waterproof|lightweight|durable|breathable|
  under\s+\$\d+|over\s+\$\d+|\$\d+\s*-\s*\$\d+
)\b/ix;
```

If a keyword matches INFORMATIONAL but also has eCommerce modifiers, reclassify as COMMERCIAL.
Example: "lightweight running shoes" — informational adjective + product = COMMERCIAL.

---

## Exclusion patterns

### Always exclude from pipeline
```javascript
const ALWAYS_EXCLUDE = /\b(
  jobs|careers|hiring|salary|wages|
  wikipedia|wiki|reddit|quora|youtube|
  free\s+download|pdf|ebook\s+free|
  crack|keygen|torrent|
  lawsuit|recall|scam|fraud|
  how\s+to\s+make\s+at\s+home  // if product is regulated
)\b/ix;

// Minimum thresholds
const MIN_VOLUME = 100;   // monthly searches
const MAX_DIFFICULTY_FOR_NEW_SITE = 65; // KD — adjust based on store's domain authority
```

### Competitor brand exclusion
Add competitor brand names dynamically from context:
```javascript
function buildCompetitorExclusion(competitorBrands) {
  const escaped = competitorBrands.map(b => b.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'));
  return new RegExp(`\\b(${escaped.join('|')})\\b`, 'i');
}
```

---

## Classification decision tree

```
1. Does keyword match ALWAYS_EXCLUDE? → Remove from pipeline
2. Does keyword have a price signal ($, "cheap", "discount")? → TRANSACTIONAL
3. Does keyword match NAVIGATIONAL patterns? → Remove (low value)
4. Is keyword a competitor brand name? → Remove
5. Does keyword match TRANSACTIONAL? → TRANSACTIONAL
6. Does keyword match COMMERCIAL + is product-adjacent? → COMMERCIAL
7. Does keyword match INFORMATIONAL? → INFORMATIONAL
   7a. Does it also have eCommerce modifiers? → Upgrade to COMMERCIAL
8. Fallback: search volume > 1000 + KD < 40 → INFORMATIONAL
9. Fallback: low volume + high specificity → INFORMATIONAL (long-tail opportunity)
```

---

## Classification examples

| Keyword | Classification | Reason |
|---------|---------------|--------|
| buy running shoes online | TRANSACTIONAL | "buy" + "online" |
| best running shoes for flat feet | COMMERCIAL | "best" + product |
| how to choose running shoes | INFORMATIONAL | "how to" + no buy signal |
| Nike shoes | NAVIGATIONAL/COMMERCIAL | Brand alone = navigational; with category = commercial |
| running shoes under $100 | TRANSACTIONAL | Price signal overrides |
| running shoes size chart | INFORMATIONAL | Reference content |
| overpronation shoes women | COMMERCIAL | Medical modifier + product + demographic |
| best running shoes 2026 | COMMERCIAL | "best" + year modifier |
| running shoe store near me | TRANSACTIONAL LOCAL | Local modifier |
| are Brooks shoes worth it | COMMERCIAL | "worth it" signal |
| how to clean running shoes | INFORMATIONAL | Care/maintenance content |
| minimalist running shoes benefits | INFORMATIONAL | "benefits" + no buy signal |
| free shipping running shoes | TRANSACTIONAL | "free shipping" signal |
