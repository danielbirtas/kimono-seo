# Article Types — Openclaw Templates

## Contents
- Pillar article
- Satellite article
- How-to / Tutorial
- Comparison / Versus
- Listicle / Best-of
- Product-focused guide

---

## Pillar article

**When to use:** Informational, high-volume, broad topic. Cornerstone content for topic clusters.
**Target length:** 2500-3500 words
**Intent:** Informational → Commercial

### Structure
```
[Title tag — 50-60 chars, primary keyword first]
[Meta description — 150-160 chars]

H1: [Engaging title, different from title tag, contains primary keyword]

[BLUF paragraph — 100-120 words, direct answer]

H2: What is [topic]? (Definition — 200-300 words)
  — Definition sentence ("X is...")
  — Why it matters
  — 1 expert quote

H2: [Main benefit / key aspect 1] (800-1200 words)
  H3: [Sub-aspect A] (150-250 words)
  H3: [Sub-aspect B] (150-250 words)
  H3: [Sub-aspect C] (150-250 words)
  — Data/statistics
  — [INTERNAL LINK: relevant collection]

H2: [Main benefit / key aspect 2] (800-1200 words)
  H3: [Sub-aspect A]
  H3: [Sub-aspect B]
  — Expert citation
  — [IMAGE: descriptive]

H2: [Common mistakes / what to avoid] (400-600 words)
  — Short list of 3-5 mistakes
  — Each with brief explanation

H2: Frequently asked questions
  Q: [Most searched question]?
  A: [40-80 word direct answer]
  (4-6 more Q&As)

[Conclusion — 100-150 words + CTA with internal link]
```

---

## Satellite article

**When to use:** More specific sub-topic within a pillar cluster. Links back to pillar.
**Target length:** 1000-1500 words
**Intent:** Informational or Commercial Investigation

### Structure
```
H1: [Specific topic title]

[BLUF — 80-100 words]

H2: [Core answer / main section] (400-600 words)
  H3: [Key detail A]
  H3: [Key detail B]

H2: [Secondary angle] (300-400 words)
  — 1 data point or expert cite
  — [INTERNAL LINK: pillar article]

H2: Frequently asked questions
  (3-4 Q&As, more specific than pillar)

[Conclusion — 80-100 words + CTA]
```

---

## How-to / Tutorial

**When to use:** Process content, step-by-step instructions. Targets "how to" keywords.
**Target length:** 1200-2000 words
**Intent:** Informational
**Schema:** HowTo + optional FAQPage

### Structure
```
H1: How to [Task] — [Qualifier]

[BLUF — answer in 1-2 sentences: "You can [task] in [X steps / X minutes] using [method]."]

Prerequisites box:
- What you'll need: [list]
- Time required: [estimate]
- Difficulty: Easy / Intermediate / Advanced

H2: Step 1 — [Action verb + object] (150-250 words per step)
  — What to do
  — What you should see after doing it
  — Common mistake to avoid
  — [IMAGE: showing this step]

H2: Step 2 — [Action verb + object]
  ...

H2: Step [N] — [Final step]

H2: Troubleshooting (optional, 200-300 words)
  — 3 common problems + solutions

H2: Frequently asked questions
  (3-5 Q&As about the process)

[Conclusion + CTA to relevant product]
```

HowTo schema maps each H2 step to a `HowToStep` object.

---

## Comparison / Versus

**When to use:** "[Product A] vs [Product B]", "[Option A] or [Option B]" keywords.
**Target length:** 1500-2200 words
**Intent:** Commercial Investigation

### Structure
```
H1: [Product A] vs [Product B]: Which Is Right for You?

[BLUF — give the bottom line immediately:
"[Product A] is better for [use case A]. [Product B] is better for [use case B]. If [most common situation], choose [recommendation]."]

Comparison table (place HIGH on page — within first 400 words):
| | [Product A] | [Product B] |
|---|---|---|
| Price | | |
| Key feature 1 | | |
| Key feature 2 | | |
| Best for | | |
| Rating | | |

H2: [Product A] — Overview (300-400 words)
  H3: Pros (bulleted)
  H3: Cons (bulleted)
  H3: Best for: [specific user profile]

H2: [Product B] — Overview (300-400 words)
  Same structure

H2: Head-to-head: [Most important comparison dimension] (300-400 words)
  — Specific comparison with data

H2: Which should you choose? (200-300 words)
  — Decision framework
  — "If X → choose A. If Y → choose B."
  — Clear winner for the majority use case

H2: Frequently asked questions
  (4-5 Q&As about the comparison)

[Conclusion + CTAs to both products or collections]
```

---

## Listicle / Best-of

**When to use:** "Best [products]", "Top [N] [items]", "[Year] [product] rankings"
**Target length:** 2000-3000 words
**Intent:** Commercial Investigation
**Schema:** BlogPosting + FAQPage + optionally ItemList

### Structure
```
H1: The [N] Best [Products] for [Use Case] in [Year]

[BLUF — top pick immediately:
"After [research method], [Product X] is the best [product] for most [use case] because [reason]. Below, we cover the top [N] picks across different [criteria]."]

Quick-pick table (within first 300 words):
| Rank | Product | Best for | Price |
|------|---------|---------|-------|
| 1 | [Name] | [Use case] | [Price] |
...

H2: Best overall — [Product Name] (300-400 words per pick)
  — What it is (1 sentence)
  — Why it won (specific reasons, data)
  — Who it's for
  — Pros / Cons (bulleted, 3-4 each)
  — [INTERNAL LINK: product page]

H2: Best budget — [Product Name]
  (same structure)

[Repeat for each pick — 5-10 picks max]

H2: How we chose (200-300 words)
  — Criteria used
  — Research method
  — Testing process (if any)

H2: What to look for when buying [product] (300-400 words)
  — 4-5 buying criteria with brief explanation each

H2: Frequently asked questions
  (4-6 Q&As)

[Conclusion — declare overall winner again + CTA]
```

---

## Product-focused guide

**When to use:** Article that drives traffic and converts to a specific product or collection.
**Target length:** 1200-1800 words
**Intent:** Commercial Investigation → Transactional

### Structure
```
H1: [Product Category] — [Benefit] Guide

[BLUF — frame the problem the product solves]

H2: Why [problem] matters (200-300 words)
  — Pain point validation
  — Consequence of not solving it
  — Transition: "That's where [product category] comes in."

H2: What to look for in [product category] (300-400 words)
  H3: [Criterion 1]
  H3: [Criterion 2]
  H3: [Criterion 3]

H2: Our [collection name] (200-300 words)
  — 3-4 featured products with 1-sentence descriptions
  — [INTERNAL LINK: collection page] prominently
  — Social proof (reviews, star ratings if available)

H2: Frequently asked questions
  (3-5 Q&As)

[Conclusion — strong CTA to collection or specific product]
```

**Note on commercial bias:** Product-focused guides mention the store's products but
must remain genuinely useful. Don't turn the article into a product listing with text.
The article must answer the reader's real question — the product recommendation is the
natural conclusion, not the premise.
