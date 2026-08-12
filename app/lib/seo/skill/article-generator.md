---
name: article-generator-openclaw
description: >
  Openclaw blog article generator for Shopify stores. Produces SEO, GEO, and AEO optimized
  long-form content following the Openclaw article template: BLUF structure, E-E-A-T signals,
  expert quote boxes, FAQ sections with schema, internal linking specs, image guidelines, and
  word count targets per heading level. Accepts a keyword cluster from the keyword research
  pipeline or a direct brief. Outputs the article body, SEO meta fields, FAQPage schema JSON-LD,
  and an image brief. Use whenever the user asks to write a blog post, create content, generate
  an article, write about a topic, draft a guide, produce a how-to, or create any long-form
  content for a Shopify store blog. Also trigger for "write this up", "turn this keyword into
  an article", "content for this topic", or any content creation request.
---

# Article Generator — Openclaw

Long-form blog content for Shopify stores, optimized for SEO ranking, GEO citation,
and AEO featured snippet capture.

---

## Step 1: Accept brief

**If receiving a cluster from the keyword-research pipeline**, extract fields directly:

```typescript
// Mapping keyword-research cluster → article brief
const cluster = {
  primary_keyword: cluster.primary_keyword,
  supporting_keywords: cluster.supporting_keywords,
  article_type: cluster.serp_format === 'listicle' ? 'listicle'
    : cluster.intent === 'informational' ? 'pillar'
    : 'comparison',
  target_word_count: cluster.estimated_word_count,
  schema_types: cluster.schema_types,  // pre-determined by keyword research
};
```

**If receiving a direct brief**, extract from context or ask for:
- **Primary keyword** (from keyword research pipeline or direct input)
- **Supporting keywords** (from cluster or user-provided)
- **Store URL** (for internal linking)
- **Target word count** (default: 2200 for pillar, 1200 for satellite)
- **Article type**: pillar | satellite | product-focused | how-to | listicle | comparison
- **Brand voice**: professional | conversational | expert | friendly (default: conversational expert)
- **Existing content map** (optional — prevents duplicate internal links)

---

## Step 2: Article structure selection

Choose structure based on intent:

| Intent | Structure | Target Length |
|--------|-----------|---------------|
| Commercial investigation (best X, reviews) | Listicle with comparison table | 2000-2500 |
| Informational how-to | Step-by-step with HowTo schema | 1800-2500 |
| Informational educational | Pillar with FAQs | 2000-3000 |
| Transactional + informational | Product-focused guide | 1500-2000 |
| Comparison | Versus article with table | 1800-2200 |

**Product-focused guide structure:** Problem framing H2 → What to look for H2 (3 H3 criteria) → Our [collection] H2 (3-4 featured products) → FAQ H2 → Conclusion with collection CTA. See [references/article-types.md](references/article-types.md) for full template.

---

## Step 3: Generate article following Openclaw template

### Mandatory structure (in order)

**1. SEO title tag** (separate from H1)
- 50-60 characters
- Primary keyword in first 30 chars
- CTA or qualifier (Best, Guide, How to, X Things)
- No clickbait, no all-caps

**2. Meta description**
- 150-160 characters
- Primary keyword present
- Contains CTA ("Learn how", "Discover", "See why")
- Unique, not duplicated from H1

**3. H1 (article title)**
- Different from title tag (can be longer, more engaging)
- Contains primary keyword
- 60-80 characters optimal
- Question format acceptable for how-to content

**4. BLUF paragraph (Bottom Line Up Front)**
- First 100-120 words of the article body
- Answers the primary question directly and completely
- Contains primary keyword in first sentence
- No preamble, no "In this article we will..."
- Format: direct answer → why it matters → what the article covers

Example BLUF (bad):
> "Are you wondering what the best running shoes for flat feet are? In this article, we'll cover everything you need to know about finding the perfect shoe..."

Example BLUF (good):
> "The best running shoes for flat feet offer motion control or stability features that correct overpronation. Top picks include [Brand A] for neutral arch support and [Brand B] for severe overpronation. Flat feet cause your arch to collapse during impact, which strains ankles, knees, and hips without proper support. This guide ranks 8 shoes by arch support quality, cushioning, and long-term durability based on podiatrist input and 200+ customer reviews."

**5. Expert quote box** (first H2 section or standalone callout)
- Format: attributed quote from named expert, doctor, specialist, or customer
- Attribution: full name, title, company/credential
- 1-2 sentences max
- Must be real or clearly hypothetical with [placeholder] tags

**6. Article body**
- H2 sections: 800-1200 words each (pillar), 400-600 words (satellite)
- H3 sections: 150-300 words each
- Every H2 must answer a complete sub-question of the main topic
- Maximum 3 H3s per H2 (don't over-nest)
- Expert citations every 800 words (named person or publication)
- At least 1 external authoritative link per 1000 words
- At least 1 internal link per 800 words (use [INTERNAL LINK: description] placeholders)
- Images: [IMAGE: description, alt text suggestion] placeholders throughout

**7. Comparison table** (required for: best-of, vs, review articles)
- Minimum 4 columns, minimum 4 rows
- Columns: Product/Option | Key Feature | Price | Best For
- No empty cells

**8. FAQ section** (required for all articles)
- Minimum 4 Q&A pairs
- Maximum 8 Q&A pairs
- Each question: natural conversational phrasing, 5-15 words
- Each answer: 40-80 words, direct and complete, no "It depends"
- First Q&A: the most common "featured snippet" question for the topic
- Include 1 "long-tail" question (very specific, lower competition)

**9. Conclusion**
- 100-150 words
- Restates the BLUF answer briefly
- CTA: link to relevant collection/product [INTERNAL LINK: collection name]
- No "in conclusion" opener

---

## Step 4: Internal linking spec

For each [INTERNAL LINK: description] placeholder, specify:
```json
{
  "anchor_text": "suggested anchor text",
  "destination_type": "product|collection|blog_post|page",
  "destination_description": "what page this should link to",
  "resolved_url": null  // to be filled by Openclaw pipeline
}
```

Rules:
- Max 1 internal link per 300 words
- Anchor text must be descriptive (not "click here", not naked URL)
- 2-4 links to collections/products (commercial)
- 1-2 links to other blog posts (topical authority)
- 1 link to About/brand page (trust signal)

---

## Step 5: Generate schema JSON-LD

### BlogPosting schema (always)
```json
{
  "@context": "https://schema.org",
  "@type": "BlogPosting",
  "headline": "[H1 text]",
  "description": "[meta description]",
  "url": "[store_url]/blogs/news/[suggested-slug]",
  "datePublished": "[today's date ISO]",
  "dateModified": "[today's date ISO]",
  "image": {
    "@type": "ImageObject",
    "url": "[store_url]/featured-image-placeholder.jpg",
    "width": 1200,
    "height": 630
  },
  "author": {
    "@type": "Person",
    "name": "[AUTHOR_NAME_PLACEHOLDER]",
    "url": "[store_url]/pages/about"
  },
  "publisher": {
    "@type": "Organization",
    "name": "[BRAND_NAME_PLACEHOLDER]",
    "logo": {
      "@type": "ImageObject",
      "url": "[store_url]/logo.png"
    }
  },
  "mainEntityOfPage": {
    "@type": "WebPage",
    "@id": "[store_url]/blogs/news/[suggested-slug]"
  }
}
```

### FAQPage schema (always — from FAQ section)
```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "[question text]",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "[answer text — plain text, no HTML]"
      }
    }
  ]
}
```

### HowTo schema (for how-to articles only)

When article type is `how-to` and contains numbered steps, generate HowTo schema alongside BlogPosting.
Use the `schema-markup-openclaw` skill for the full HowTo generation workflow and template.
Quick reference structure:

```json
{
  "@type": "HowTo",
  "name": "[article H1]",
  "totalTime": "PT[N]M",
  "step": [
    { "@type": "HowToStep", "position": 1, "name": "[step title]", "text": "[step instruction — plain text]" }
  ]
}
```

Combine with BlogPosting and FAQPage in a single `@graph` block.

---

## Step 6: Image brief

For each [IMAGE: ...] placeholder, output:
```json
{
  "position": "after intro|after H2 title|within section",
  "content_description": "what the image should show",
  "alt_text": "keyword-rich, descriptive alt text (max 125 chars)",
  "recommended_dimensions": "1200x630 (featured) | 800x500 (inline)",
  "image_type": "product_photo|infographic|comparison_chart|how_to_step|lifestyle"
}
```

---

## Step 7: Output format

Deliver the complete article package:

```
## ARTICLE PACKAGE

### SEO Fields
**Title tag:** [50-60 chars]
**Meta description:** [150-160 chars]
**Suggested URL slug:** [kebab-case-slug]

### Article Content
[Full article in markdown]

### Internal Linking Map
[JSON array]

### Schema JSON-LD
[BlogPosting JSON]
[FAQPage JSON]

### Image Brief
[JSON array]
```

### URL slug rules

Generate a slug from the primary keyword following these rules:
- Lowercase, hyphens only — no underscores, no special characters
- Remove stop words from the middle (a, an, the, for, in, on, at, to, of) — but keep if they affect meaning
- Primary keyword first, qualifier second: `best-running-shoes-flat-feet` not `flat-feet-best-running-shoes`
- Max 60 characters total
- No keyword stuffing — slug should be readable as a title fragment
- Year in slug only if content is explicitly annual: `best-running-shoes-2026` only if article is "2026 edition"

Examples:
- "Best Running Shoes for Flat Feet" → `best-running-shoes-flat-feet`
- "How to Clean White Sneakers at Home" → `how-to-clean-white-sneakers`
- "Nike Air Zoom vs ASICS Gel-Nimbus: Which Is Better?" → `nike-air-zoom-vs-asics-gel-nimbus`

---

## Quality checklist (run before delivering)

- [ ] BLUF answers the primary question in first 100 words
- [ ] Primary keyword in H1, first sentence, and 3+ H2s
- [ ] Expert attribution present (named person or publication)
- [ ] FAQ section has 4-8 Q&As, each answer 40-80 words
- [ ] Word count targets met per article type:
  - Pillar: H2 sections 800-1200 words each
  - Satellite: H2 sections 400-600 words each
  - How-to: each numbered step 150-250 words (not 800+)
  - Listicle: each product/pick H2 300-400 words
  - Comparison: each product H2 300-400 words + "Which should you choose" H2 200-300 words
- [ ] No H2 is just a keyword dump
- [ ] Comparison table present for commercial intent articles (best-of, vs, review)
- [ ] Internal link placeholders placed every 800 words
- [ ] FAQPage schema generated and matches FAQ section content exactly
- [ ] No "In this article" / "In conclusion" openers anywhere
- [ ] Conclusion ends with internal link CTA to collection or product
- [ ] URL slug follows slug rules (lowercase, hyphens, primary keyword first, max 60 chars)

---

## Reference files

- [references/voice-guidelines.md](references/voice-guidelines.md) — Brand voice patterns and tone examples
- [references/article-types.md](references/article-types.md) — Full template per article type (pillar, satellite, how-to, comparison, listicle)
