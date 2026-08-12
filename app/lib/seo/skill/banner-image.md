# Banner Image Generator — Kimono SEO

Generates compelling blog article banner images using product images as the base.
Extracts the main product image, combines with article context, and generates
a professional banner optimized for blog posts (1200x630px, 16:9 ratio).

---

## Input requirements

- **Product image URL** — main product image from Shopify CDN
- **Article title** (H1) — used for text overlay context
- **Primary keyword** — for style/mood direction
- **Product description excerpt** — 1-2 sentences max, for context
- **Article type** — pillar | listicle | howto | comparison | satellite

---

## Generation strategy

### Step 1: Analyze product image
- Identify product category from image (apparel, electronics, home, beauty, food, etc.)
- Extract dominant colors for palette selection
- Determine product orientation (portrait, landscape, flat-lay, lifestyle)

### Step 2: Select banner style per article type

| Article type | Banner style | Background |
|---|---|---|
| pillar | Clean editorial, product centered | Gradient matching product colors |
| listicle | Grid/collage feel, product prominent | Light neutral with accent |
| howto | Product in use context | Warm, instructional feel |
| comparison | Product highlighted, clean | Split or neutral background |
| satellite | Product close-up | Minimal, focused |

### Step 3: Generate prompt for image model

Construct a detailed prompt following this template:

```
Professional product photography blog banner, 1200x630px, 16:9 ratio.
[PRODUCT_DESCRIPTION] product centered in frame, [ORIENTATION] shot.
[BACKGROUND_STYLE] background in [COLOR_PALETTE] tones.
[LIGHTING_STYLE] lighting, commercial photography quality.
[STYLE_MODIFIERS].
Clean, modern, suitable for e-commerce blog.
No text, no watermarks, no logos.
Photorealistic, high resolution.
```

### Background styles by category

| Product category | Background | Lighting |
|---|---|---|
| Apparel / Fashion | Soft gradient, neutral | Soft box, even |
| Electronics / Gadgets | Dark gradient or white | Dramatic, tech feel |
| Home & Kitchen | Warm wood or marble surface | Natural window light |
| Beauty / Health | Pastel gradient, clean | Diffused, beauty |
| Outdoor / Sports | Nature texture or gradient | Dynamic, energetic |
| Pets | Warm neutral, friendly | Soft natural |
| Toys / Kids | Colorful, playful gradient | Bright, cheerful |
| Food / Kitchen | Rustic wood or slate surface | Warm overhead |
| General / Mixed | Light neutral gradient | Soft studio |

### Color palette selection

Extract from product image dominant colors, then:
- **Complementary palette:** Use opposite color wheel position for background
- **Analogous palette:** Use adjacent colors for harmonious feel
- **Neutral palette:** White/cream/light gray — safe for any product

### Style modifiers by article type

- **pillar:** "editorial magazine style, aspirational"
- **listicle:** "collection showcase, organized display"
- **howto:** "instructional, process-oriented, step visualization"
- **comparison:** "side by side composition, evaluation feel"
- **satellite:** "detail shot, focused, informative"

---

## Output format

```json
{
  "imagePrompt": "Full generation prompt for image model",
  "altText": "SEO-optimized alt text max 125 chars",
  "suggestedFilename": "keyword-article-type-banner.jpg",
  "dimensions": { "width": 1200, "height": 630 },
  "style": "editorial|lifestyle|minimal|bold",
  "colorPalette": ["#hex1", "#hex2", "#hex3"]
}
```

---

## Fallback strategy

If no product image is available:
1. Use article topic to determine visual metaphor
2. Generate abstract/conceptual banner based on keyword
3. Style: clean gradient with relevant icon/symbol concept

If product image is low quality (<400px):
1. Note quality issue in output
2. Suggest using a different product image
3. Generate prompt anyway with "enhance quality" instruction

---

## Integration with Kimono pipeline

1. Article is generated with [IMAGE: ...] placeholders
2. For the FIRST placeholder (featured image position), call this skill
3. Pass: product image URL from related Shopify product, article H1, primary keyword
4. Output prompt → send to image generation API
5. Store generated image URL in article metafield `kimono.featured_image`
6. Include in BlogPosting schema as `image.url`

---

## Quality rules

- Never generate images with people's faces (privacy, consent)
- Never generate text in the image (Shopify will overlay its own)  
- Always output 16:9 ratio (1200x630 or 1920x1080)
- Product must be clearly visible and recognizable
- Background must not compete with product
- No busy patterns that reduce product visibility
