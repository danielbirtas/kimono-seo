# Schema Reference — Complete JSON-LD Templates

## Contents
- Product page (full)
- Collection page
- Blog post (full)
- Homepage (Organization + WebSite)
- About page
- FAQ page
- HowTo
- BreadcrumbList
- @graph combining multiple types
- Common errors table

---

## Product page — full template

```json
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "Product Name Here",
  "description": "Product description — min 50 chars, max 5000. Use plain text, no HTML.",
  "url": "https://store.com/products/product-slug",
  "image": [
    "https://cdn.shopify.com/s/files/1/0001/product-main.jpg",
    "https://cdn.shopify.com/s/files/1/0001/product-alt.jpg"
  ],
  "sku": "SKU-001",
  "mpn": "MPN-001",
  "gtin13": "1234567890123",
  "brand": {
    "@type": "Brand",
    "name": "Brand Name"
  },
  "offers": {
    "@type": "Offer",
    "url": "https://store.com/products/product-slug",
    "priceCurrency": "USD",
    "price": "49.99",
    "priceValidUntil": "2027-03-28",
    "availability": "https://schema.org/InStock",
    "itemCondition": "https://schema.org/NewCondition",
    "seller": {
      "@type": "Organization",
      "name": "Store Name"
    },
    "hasMerchantReturnPolicy": {
      "@type": "MerchantReturnPolicy",
      "applicableCountry": "US",
      "returnPolicyCategory": "https://schema.org/MerchantReturnFiniteReturnWindow",
      "merchantReturnDays": 30,
      "returnMethod": "https://schema.org/ReturnByMail",
      "returnFees": "https://schema.org/FreeReturn"
    },
    "shippingDetails": {
      "@type": "OfferShippingDetails",
      "shippingRate": {
        "@type": "MonetaryAmount",
        "value": "0",
        "currency": "USD"
      },
      "shippingDestination": {
        "@type": "DefinedRegion",
        "addressCountry": "US"
      },
      "deliveryTime": {
        "@type": "ShippingDeliveryTime",
        "handlingTime": {
          "@type": "QuantitativeValue",
          "minValue": 1,
          "maxValue": 2,
          "unitCode": "DAY"
        },
        "transitTime": {
          "@type": "QuantitativeValue",
          "minValue": 3,
          "maxValue": 7,
          "unitCode": "DAY"
        }
      }
    }
  },
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "4.7",
    "reviewCount": "128",
    "bestRating": "5",
    "worstRating": "1"
  },
  "review": [
    {
      "@type": "Review",
      "reviewRating": {
        "@type": "Rating",
        "ratingValue": "5"
      },
      "author": {
        "@type": "Person",
        "name": "Reviewer Name"
      },
      "reviewBody": "Review text here."
    }
  ]
}
```

**Field notes:**
- `priceValidUntil`: set 12 months out if unknown. If it expires, Google stops showing price in rich results.
- `gtin13` / `mpn`: include if you have them — improves Merchant listing eligibility.
- `aggregateRating`: include only if you have real reviews. Minimum 1 review. Do NOT fabricate.
- `review`: include 1-3 real reviews if available. Optional but improves rich results.
- Remove `hasMerchantReturnPolicy` and `shippingDetails` if return/shipping policy is complex/varies — incorrect data is worse than missing.

---

## Collection page

```json
{
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  "name": "Running Shoes",
  "description": "Shop our collection of running shoes for all terrain and foot types.",
  "url": "https://store.com/collections/running-shoes",
  "breadcrumb": {
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://store.com" },
      { "@type": "ListItem", "position": 2, "name": "Running Shoes", "item": "https://store.com/collections/running-shoes" }
    ]
  },
  "mainEntity": {
    "@type": "ItemList",
    "name": "Running Shoes",
    "numberOfItems": 24,
    "itemListElement": [
      {
        "@type": "ListItem",
        "position": 1,
        "url": "https://store.com/products/product-1",
        "name": "Product 1 Name"
      },
      {
        "@type": "ListItem",
        "position": 2,
        "url": "https://store.com/products/product-2",
        "name": "Product 2 Name"
      }
    ]
  }
}
```

**Note:** Shopify does NOT auto-generate this. Requires theme code or metafield injection.
Include only the first 10-20 products in `itemListElement` for performance.

---

## Blog post — full template

```json
{
  "@context": "https://schema.org",
  "@type": "BlogPosting",
  "headline": "Article Title — Max 110 Characters for Display",
  "description": "150-160 character meta description used as schema description too.",
  "url": "https://store.com/blogs/news/article-slug",
  "datePublished": "2026-01-15T10:00:00+00:00",
  "dateModified": "2026-03-28T14:00:00+00:00",
  "image": {
    "@type": "ImageObject",
    "url": "https://cdn.shopify.com/s/files/1/featured-image.jpg",
    "width": 1200,
    "height": 630
  },
  "author": {
    "@type": "Person",
    "name": "Author Full Name",
    "url": "https://store.com/pages/about-author-name",
    "sameAs": [
      "https://linkedin.com/in/authorname",
      "https://twitter.com/authorname"
    ]
  },
  "publisher": {
    "@type": "Organization",
    "name": "Store Brand Name",
    "logo": {
      "@type": "ImageObject",
      "url": "https://cdn.shopify.com/s/files/1/logo.png",
      "width": 600,
      "height": 60
    }
  },
  "mainEntityOfPage": {
    "@type": "WebPage",
    "@id": "https://store.com/blogs/news/article-slug"
  },
  "articleSection": "Running",
  "keywords": "running shoes, flat feet, overpronation"
}
```

---

## Homepage — Organization + WebSite

```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://store.com/#organization",
      "name": "Brand Name",
      "url": "https://store.com",
      "logo": {
        "@type": "ImageObject",
        "url": "https://cdn.shopify.com/s/files/1/logo.png",
        "width": 300,
        "height": 60
      },
      "description": "Brand description — 1-2 sentences, plain text.",
      "sameAs": [
        "https://www.instagram.com/brandname",
        "https://www.facebook.com/brandname",
        "https://twitter.com/brandname",
        "https://www.linkedin.com/company/brandname",
        "https://www.youtube.com/@brandname",
        "https://www.pinterest.com/brandname",
        "https://www.tiktok.com/@brandname"
      ],
      "contactPoint": {
        "@type": "ContactPoint",
        "contactType": "customer support",
        "email": "support@store.com",
        "availableLanguage": "English"
      },
      "address": {
        "@type": "PostalAddress",
        "addressCountry": "US"
      }
    },
    {
      "@type": "WebSite",
      "@id": "https://store.com/#website",
      "url": "https://store.com",
      "name": "Brand Name",
      "publisher": { "@id": "https://store.com/#organization" },
      "potentialAction": {
        "@type": "SearchAction",
        "target": {
          "@type": "EntryPoint",
          "urlTemplate": "https://store.com/search?q={search_term_string}"
        },
        "query-input": "required name=search_term_string"
      }
    }
  ]
}
```

---

## FAQPage

```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "What is the return policy?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "We offer free 30-day returns on all orders. Items must be in original condition with tags attached. To start a return, visit our returns portal at store.com/returns."
      }
    },
    {
      "@type": "Question",
      "name": "How long does shipping take?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Standard shipping takes 3-7 business days. Express shipping (1-2 business days) is available at checkout. Free standard shipping on orders over $75."
      }
    }
  ]
}
```

**Rules:**
- `name` (question): plain text, natural question phrasing, ends with "?"
- `text` (answer): plain text ONLY — no HTML, no markdown. Strip all tags.
- Both Q&A must be visible on the rendered page (not hidden in tabs/accordions).
- At least 3 pairs for eligibility. Practical max: 50.

---

## HowTo

```json
{
  "@context": "https://schema.org",
  "@type": "HowTo",
  "name": "How to Clean Running Shoes",
  "description": "Step-by-step guide to cleaning running shoes without damaging them.",
  "totalTime": "PT30M",
  "supply": [
    { "@type": "HowToSupply", "name": "Soft brush" },
    { "@type": "HowToSupply", "name": "Mild detergent" },
    { "@type": "HowToSupply", "name": "Warm water" }
  ],
  "step": [
    {
      "@type": "HowToStep",
      "name": "Remove the laces",
      "text": "Remove laces from the shoes and set aside. Wash laces separately in warm soapy water.",
      "image": "https://cdn.shopify.com/s/files/1/step1.jpg",
      "url": "https://store.com/blogs/news/how-to-clean-running-shoes#step-1"
    },
    {
      "@type": "HowToStep",
      "name": "Brush off loose dirt",
      "text": "Use a soft brush or old toothbrush to remove loose dirt and debris from the upper, midsole, and outsole.",
      "url": "https://store.com/blogs/news/how-to-clean-running-shoes#step-2"
    }
  ]
}
```

---

## BreadcrumbList (standalone, all pages)

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://store.com" },
    { "@type": "ListItem", "position": 2, "name": "Collections", "item": "https://store.com/collections" },
    { "@type": "ListItem", "position": 3, "name": "Running Shoes", "item": "https://store.com/collections/running-shoes" },
    { "@type": "ListItem", "position": 4, "name": "Nike Air Zoom", "item": "https://store.com/products/nike-air-zoom" }
  ]
}
```

---

## @graph for blog post (BlogPosting + FAQPage combined)

```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "BlogPosting",
      "@id": "https://store.com/blogs/news/article-slug#article",
      "headline": "...",
      "url": "https://store.com/blogs/news/article-slug"
    },
    {
      "@type": "FAQPage",
      "@id": "https://store.com/blogs/news/article-slug#faq",
      "mainEntity": [...]
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [...]
    }
  ]
}
```

Using `@graph` is preferred when combining multiple types — avoids duplicate `@context` and helps Google parse entity relationships.

---

## Common errors table

| Error | Symptom | Fix |
|-------|---------|-----|
| `availability: "InStock"` | Warning in Rich Results Test | Use `"https://schema.org/InStock"` |
| `ratingCount` instead of `reviewCount` | Invalid property | Change key to `reviewCount` |
| `priceValidUntil` in past | Price not shown in rich results | Update to future date |
| `author` as plain string | Weaker E-E-A-T | Use Person object with `name` and `url` |
| `publisher.logo` missing dimensions | Warning | Add `width` and `height` to ImageObject |
| `mainEntityOfPage` missing | Weaker entity mapping | Always add on BlogPosting |
| HTML in `text` (Answer) | Invalid FAQ | Strip all HTML tags |
| FAQ Q&A hidden in accordion | Rich results ineligible | Only use visible content |
| Duplicate Product schema blocks | Conflicting data | Remove app-generated schema before adding custom |
| `@type` array `["Product", "Thing"]` | Usually OK | Simplify to `"Product"` unless needed |
