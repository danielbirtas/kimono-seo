# Shopify Schema Injection — Methods Reference

## Contents
- Method comparison
- Theme file injection (Online Store 2.0)
- Metafield injection via Admin API
- App Block injection
- Avoiding schema conflicts
- Validation after injection

---

## Method comparison

| Method | Best for | Pros | Cons |
|--------|---------|------|------|
| Theme file injection | Global/template schema | Reliable, no API cost | Requires theme edit, dev work |
| Metafield via Admin API | Per-product/per-page schema | Openclaw can automate | Must reference metafield in theme |
| App Block (OS 2.0) | Dynamic blocks | No code editing | Depends on theme support |

**Openclaw default:** Metafield via Admin API for per-resource schema, theme file for global (Organization, WebSite).

---

## Theme file injection

### Where to add schema in Shopify theme files

| Page type | Theme file | Liquid block |
|-----------|-----------|--------------|
| Product | `sections/main-product.liquid` or `templates/product.json` | Before `</article>` or in `{% schema %}` |
| Collection | `sections/main-collection-product-grid.liquid` | Before `</section>` |
| Blog post | `sections/main-article.liquid` | Before `</article>` |
| Homepage | `sections/featured-collection.liquid` or `layout/theme.liquid` | In `<head>` or before `</body>` |
| All pages | `layout/theme.liquid` | In `<head>` |

### Product schema via Liquid
```liquid
{% comment %} In sections/main-product.liquid {% endcomment %}
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": {{ product.title | json }},
  "description": {{ product.description | strip_html | strip_newlines | json }},
  "url": {{ shop.url | append: product.url | json }},
  "image": [
    {% for image in product.images %}
      {{ image.src | json }}{% unless forloop.last %},{% endunless %}
    {% endfor %}
  ],
  "sku": {{ product.selected_or_first_available_variant.sku | json }},
  "brand": {
    "@type": "Brand",
    "name": {{ product.vendor | json }}
  },
  "offers": {
    "@type": "Offer",
    "url": {{ shop.url | append: product.url | json }},
    "priceCurrency": {{ cart.currency.iso_code | json }},
    "price": {{ product.price | money_without_currency | json }},
    "priceValidUntil": "{{ 'now' | date: '%s' | plus: 31536000 | date: '%Y-%m-%d' }}",
    "availability": {% if product.available %}"https://schema.org/InStock"{% else %}"https://schema.org/OutOfStock"{% endif %},
    "itemCondition": "https://schema.org/NewCondition"
  }
  {% if product.metafields.reviews.rating %}
  ,"aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": {{ product.metafields.reviews.rating.value | json }},
    "reviewCount": {{ product.metafields.reviews.rating_count.value | json }}
  }
  {% endif %}
}
</script>
```

---

## Metafield injection via Admin API

This is the Openclaw automation path. Claude Code generates the schema JSON, Openclaw injects it via Admin API, and the theme renders it.

### Step 1: Store schema in metafield

```typescript
// Store JSON-LD in a metafield
async function injectProductSchema(shopDomain: string, accessToken: string, productId: number, schemaJson: object) {
  const response = await fetch(
    `https://${shopDomain}/admin/api/${process.env.SHOPIFY_API_VERSION}/metafields.json`,
    {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        metafield: {
          namespace: 'openclaw',
          key: 'schema_json',
          value: JSON.stringify(schemaJson),
          type: 'json',
          owner_resource: 'product',
          owner_id: productId,
        },
      }),
    }
  );
  return response.json();
}
```

### Step 2: Render metafield in theme

Add to `sections/main-product.liquid`:
```liquid
{% if product.metafields.openclaw.schema_json %}
<script type="application/ld+json">
  {{ product.metafields.openclaw.schema_json.value }}
</script>
{% endif %}
```

Add to `sections/main-article.liquid` for blog posts:
```liquid
{% if article.metafields.openclaw.schema_json %}
<script type="application/ld+json">
  {{ article.metafields.openclaw.schema_json.value }}
</script>
{% endif %}
```

**One-time theme edit required.** After this snippet is in the theme, all future schema updates
happen purely via Admin API — no more theme edits.

### Bulk schema injection (for batching)

Use GraphQL for bulk operations:
```typescript
const BULK_METAFIELD_SET = `
  mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { key namespace value ownerType }
      userErrors { field message }
    }
  }
`;

// Max 25 metafields per mutation call
async function bulkSetSchemas(
  shopDomain: string,
  accessToken: string,
  items: Array<{ type: 'products' | 'articles'; id: string; schema: object }>
) {
  const metafields = items.map(item => ({
    ownerId: `gid://shopify/${item.type === 'products' ? 'Product' : 'Article'}/${item.id}`,
    namespace: 'openclaw',
    key: 'schema_json',
    value: JSON.stringify(item.schema),
    type: 'json',
  }));

  // Chunk into batches of 25
  for (let i = 0; i < metafields.length; i += 25) {
    const batch = metafields.slice(i, i + 25);
    await fetch(`https://${shopDomain}/admin/api/${process.env.SHOPIFY_API_VERSION}/graphql.json`, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: BULK_METAFIELD_SET, variables: { metafields: batch } }),
    });
    // Rate limit: wait 500ms between batches
    await new Promise(r => setTimeout(r, 500));
  }
}
```

---

## Avoiding schema conflicts

Common conflict: third-party Shopify SEO apps (SEO Manager, Smart SEO, JSON-LD for SEO)
already inject Product schema. Openclaw schema would create duplicate `@type: "Product"` blocks.

**Detection:**
```javascript
// During audit, check for existing schema blocks
const existingSchema = pageHtml.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi);
const schemaTypes = existingSchema?.map(block => {
  try { return JSON.parse(block.replace(/<[^>]+>/g, '')).['@type']; }
  catch { return null; }
}).filter(Boolean);

const hasProductSchema = schemaTypes?.includes('Product');
```

**Resolution strategy:**
1. If SEO app is present: disable app's schema for products, inject via Openclaw metafields
2. If theme generates schema: comment out theme schema block, replace with metafield render
3. If both are present: cannot have both — choose one source of truth

Flag in audit: "Schema conflict detected — [app name] and theme both inject Product schema. Deduplication required before Openclaw injection."

---

## Validation after injection

After injecting schema via API, validate:

1. Fetch the live page HTML: `curl https://store.com/products/slug | grep -A 5 'application/ld+json'`
2. Confirm only one `@type: "Product"` block
3. Confirm `priceValidUntil` is in the future
4. Test in Google Rich Results Test: https://search.google.com/test/rich-results
5. Check Google Search Console → Enhancements after 24-48 hours for indexed status

Log injection results in Neon:
```sql
INSERT INTO schema_injections (shop_id, resource_type, resource_id, schema_types, injected_at, validation_status)
VALUES ($1, $2, $3, $4, NOW(), 'pending');
```
