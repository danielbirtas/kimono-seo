---
name: schema-markup-openclaw
description: >
  Openclaw schema markup specialist for Shopify stores. Generates, validates, and injects
  schema.org JSON-LD for all Shopify page types: Product, Collection, BlogPosting, FAQPage,
  HowTo, Organization, WebSite, BreadcrumbList, and more. Based exclusively on Google Search
  Central documentation. Outputs copy-paste JSON-LD blocks and Shopify Admin API injection
  payloads. Use whenever the user asks about schema markup, JSON-LD, structured data,
  rich results, product schema, FAQ schema, article schema, Organization markup, BreadcrumbList,
  "what schema should I add", "generate schema for", "why isn't my schema working", "schema
  validation errors", or any structured data topic for a Shopify store or product. Also
  trigger whenever an SEO audit reveals missing schema, when generating blog posts that
  need FAQPage schema, or when setting up a new Shopify store integration in Openclaw.
---

# Schema Markup — Openclaw

Schema.org JSON-LD generation and injection for Shopify stores.
Based exclusively on Google Search Central documentation.

---

## Decision tree: what schema to generate

```
Page type?
├── Homepage → Organization + WebSite (with SearchAction)
├── Product page → Product + Offer (+ AggregateRating if reviews exist)
│   └── Merchant listing? → Add MerchantReturnPolicy + OfferShippingDetails
├── Collection page → CollectionPage + ItemList
├── Blog post → BlogPosting (+ FAQPage if FAQ section exists)
│   └── How-to content? → HowTo schema
├── FAQ page → FAQPage
├── About page → Organization (extended)
└── All pages → BreadcrumbList
```

For the full schema reference per page type, see [references/schema-reference.md](references/schema-reference.md).

---

## Product schema — generation workflow

**Input needed:**
- Product title
- Product description
- Product image URL(s)
- SKU
- Price + currency
- Availability (in stock / out of stock)
- Brand name
- Product URL
- Reviews: average rating + review count (if available)
- Return policy details (if available)

**Output: complete JSON-LD block**

Deliver as:
1. Copy-paste JSON-LD block (for manual theme injection)
2. Shopify metafield payload (for Admin API injection — see [references/shopify-injection.md](references/shopify-injection.md))

**Critical validation rules:**
- `priceValidUntil` is required for Merchant listing eligibility — set to 12 months from today if not specified, warn user to update
- `availability` must use full URL: `"https://schema.org/InStock"` not `"InStock"`
- `image` should be array even for single image
- `aggregateRating` requires both `ratingValue` and `reviewCount` (not `ratingCount`)
- `offers.url` must exactly match the canonical product URL

---

## BlogPosting schema — generation workflow

**Input needed:**
- Article headline (H1)
- Article URL
- Featured image URL + dimensions
- Publication date
- Author name + author page URL
- Brand/publisher name + logo URL + logo dimensions
- Meta description (used as schema `description`)

**Key fields often missing in Shopify:**
- `mainEntityOfPage` — add always
- `publisher.logo` with width/height — required for Google News
- `author.url` — links to author page, strengthens E-E-A-T
- `dateModified` — add even if same as datePublished

---

## FAQPage schema — generation workflow

**Input needed:** List of question-answer pairs from the article.

**Rules:**
- Each Q&A must be visible on the page (not in tabs or accordions)
- `text` in Answer: plain text only, strip all HTML tags
- Minimum 3 pairs for eligibility
- Maximum ~50 pairs (practical limit)
- Questions should match what users actually search

**Combine with BlogPosting using @graph:**
```json
{
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "BlogPosting", ... },
    { "@type": "FAQPage", ... }
  ]
}
```

---

## HowTo schema — generation workflow

**Use when:** Article or page has numbered step-by-step instructions. Common for: cleaning guides, installation tutorials, setup processes, cooking instructions.

**Input needed:**
- Article/page title
- Total time estimate (ISO 8601 duration: `PT30M` = 30 minutes, `PT1H` = 1 hour)
- List of required tools/supplies (optional but improves eligibility)
- Numbered steps — each with: title, description, optional image URL, optional anchor link

**Critical rules:**
- Each `step.name` must be a short action title (5-10 words), not a paragraph
- Each `step.text` must be the full instruction — plain text, no HTML
- `totalTime` in ISO 8601 format — Google displays it as "30 min" in rich results
- Steps must match the visible numbered content on the page exactly
- Do NOT use HowTo for comparison or opinion content — only actual procedures

**Output template:**
```json
{
  "@context": "https://schema.org",
  "@type": "HowTo",
  "name": "How to Clean White Running Shoes",
  "description": "Step-by-step guide to cleaning white running shoes at home without damaging them.",
  "totalTime": "PT30M",
  "supply": [
    { "@type": "HowToSupply", "name": "Soft-bristle brush" },
    { "@type": "HowToSupply", "name": "Mild dish soap" },
    { "@type": "HowToSupply", "name": "Warm water" },
    { "@type": "HowToSupply", "name": "Magic eraser" }
  ],
  "step": [
    {
      "@type": "HowToStep",
      "position": 1,
      "name": "Remove laces and insoles",
      "text": "Pull out the laces and insoles and set aside. These will be cleaned separately. Removing them gives you full access to the shoe interior and tongue.",
      "url": "https://store.com/blogs/tips/clean-white-shoes#step-1"
    },
    {
      "@type": "HowToStep",
      "position": 2,
      "name": "Dry brush loose dirt",
      "text": "Use a soft-bristle brush to remove loose dirt and debris from the upper, midsole, and outsole. Always brush in one direction to avoid pushing dirt deeper into the fabric.",
      "url": "https://store.com/blogs/tips/clean-white-shoes#step-2",
      "image": "https://cdn.shopify.com/s/files/step-2-brush.jpg"
    }
  ]
}
```

**Combine HowTo + BlogPosting + FAQPage with @graph** for instructional blog posts:
```json
{
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "BlogPosting", ... },
    { "@type": "HowTo", ... },
    { "@type": "FAQPage", ... }
  ]
}
```

---

## Organization schema — generation workflow

Generate once for the homepage. Update when brand info changes.

**Required fields:**
- `name` — official brand name
- `url` — store homepage URL
- `logo` — URL to logo image

**Strongly recommended:**
- `description` — 1-2 sentence brand description
- `sameAs` — array of social profile URLs (Instagram, Facebook, LinkedIn, YouTube, Twitter/X, Pinterest)
  - More sameAs = stronger entity graph for GEO
  - Minimum 3 profiles recommended
- `contactPoint` — support email or phone
- `address` — if physical location (LocalBusiness situations)

---

## BreadcrumbList — for all pages

Add as standalone or inside @graph with other types. Always include `@context` when standalone:

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "name": "Home",
      "item": "https://store.com"
    },
    {
      "@type": "ListItem",
      "position": 2,
      "name": "Collections",
      "item": "https://store.com/collections"
    },
    {
      "@type": "ListItem",
      "position": 3,
      "name": "Running Shoes",
      "item": "https://store.com/collections/running-shoes"
    }
  ]
}
```

When combining with other types, add BreadcrumbList to the `@graph` array — no separate `@context` needed inside the graph.

---

## Validation workflow

After generating any schema:

1. Paste into Google Rich Results Test: https://search.google.com/test/rich-results
2. Check for "Eligible for rich results" status
3. Flag any "Warnings" — these reduce eligibility without being errors
4. Common fixable warnings:
   - Missing `priceValidUntil` → add with future date
   - Missing `image` dimensions on ImageObject → add width/height
   - `reviewCount` too low (< 3) → note this to client, not a code error

**Shopify-specific validation issues:**
- Shopify auto-generates some schema — check for duplicate `@type: "Product"` blocks
- App-generated schema (review apps, SEO apps) may conflict with custom schema
- Use `JSON.parse()` test before injecting: malformed JSON crashes rich results silently

---

## Shopify injection methods

See [references/shopify-injection.md](references/shopify-injection.md) for:
- Theme file injection (product.liquid, article.liquid, etc.)
- Metafield injection via Admin API (preferred for Openclaw automation)
- App Block injection via Online Store 2.0

---

## Reference files

- [references/schema-reference.md](references/schema-reference.md) — Complete JSON-LD templates for all page types
- [references/shopify-injection.md](references/shopify-injection.md) — Shopify-specific injection methods and code
