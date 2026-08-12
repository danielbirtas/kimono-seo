// app/lib/seo/schema-generator.server.js
// Kimono SEO — Schema Markup Generator (#08)
// Generates JSON-LD for Product pages based on Google Search Central specs
// Reference: schema-final.html (Kimono SEO Schema Reference)

/**
 * Generate complete Product JSON-LD schema for a Shopify product.
 * Includes: Product, AggregateRating (if available), Offer, BreadcrumbList
 */
export function generateProductSchema(product, shopDomain, storeSettings = {}) {
  const {
    id,
    title,
    handle,
    description,
    seoTitle,
    seoDesc,
    images = [],
    variants = [],
    vendor,
    productType,
    tags = [],
    rating,        // { value, count } — from reviews if available
    currency = "RON",
  } = product;

  const productUrl = `https://${shopDomain}/products/${handle}`;
  const canonicalId = `${productUrl}#product`;

  // ── Images ──
  // Google recommends 3 aspect ratios: 16:9, 4:3, 1:1
  // We use the same image with different size params via Shopify CDN
  const imageUrls = images.slice(0, 3).map((img) => img.url);
  if (imageUrls.length === 0) imageUrls.push(`https://${shopDomain}/assets/noimage.png`);

  // ── Price from first available variant ──
  const availableVariant = variants.find((v) => v.available) || variants[0];
  const price = availableVariant?.price || "0";
  const comparePrice = availableVariant?.compareAtPrice || null;
  const available = variants.some((v) => v.available);

  // ── Build schema nodes ──
  const graph = [];

  // 1. Product node
  const productNode = {
    "@type": "Product",
    "@id": canonicalId,
    "name": title,
    "url": productUrl,
    "description": description || seoDesc || "",
    "image": imageUrls.length === 1 ? imageUrls[0] : imageUrls,
    "offers": {
      "@type": "Offer",
      "url": productUrl,
      "priceCurrency": currency,
      "price": parseFloat(price).toFixed(2),
      "availability": available
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      "itemCondition": "https://schema.org/NewCondition",
    },
  };

  // Brand / vendor
  if (vendor) {
    productNode.brand = { "@type": "Brand", "name": vendor };
  }

  // SKU from first variant
  if (availableVariant?.sku) {
    productNode.sku = availableVariant.sku;
  }

  // priceValidUntil — always set, required for Merchant listing eligibility
  productNode.offers.priceValidUntil = getNextYearDate();

  // Seller
  productNode.offers.seller = {
    "@type": "Organization",
    "name": storeSettings.storeName || shopDomain,
  };

  // AggregateRating — only if we have real review data
  if (rating?.count > 0) {
    productNode.aggregateRating = {
      "@type": "AggregateRating",
      "ratingValue": parseFloat(rating.value).toFixed(1),
      "bestRating": "5",
      "worstRating": "1",
      "reviewCount": rating.count,
    };
  }

  graph.push(productNode);

  // 2. BreadcrumbList
  const breadcrumbs = [
    { "@type": "ListItem", "position": 1, "name": "Home", "item": `https://${shopDomain}` },
  ];

  if (productType) {
    breadcrumbs.push({
      "@type": "ListItem",
      "position": 2,
      "name": productType,
      "item": `https://${shopDomain}/collections/${slugify(productType)}`,
    });
    breadcrumbs.push({ "@type": "ListItem", "position": 3, "name": title, "item": productUrl });
  } else {
    breadcrumbs.push({ "@type": "ListItem", "position": 2, "name": title, "item": productUrl });
  }

  graph.push({
    "@type": "BreadcrumbList",
    "@id": `${productUrl}#breadcrumb`,
    "itemListElement": breadcrumbs,
  });

  return {
    "@context": "https://schema.org",
    "@graph": graph,
  };
}

/**
 * Apply schema to Shopify product via metafield (namespace: kimono, key: schema_json)
 * Uses GraphQL productUpdate mutation
 */
export async function applySchemaToShopify(accessToken, shopDomain, productId, schemaJson) {
  const schemaString = JSON.stringify(schemaJson);

  const mutation = `
    mutation productUpdate($input: ProductInput!) {
      productUpdate(input: $input) {
        product {
          id
          metafields(first: 5, namespace: "kimono") {
            edges { node { key value } }
          }
        }
        userErrors { field message }
      }
    }
  `;

  const variables = {
    input: {
      id: productId,
      metafields: [
        {
          namespace: "kimono",
          key: "schema_json",
          value: schemaString,
          type: "json",
        },
      ],
    },
  };

  const resp = await fetch(`https://${shopDomain}/admin/api/2025-04/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({ query: mutation, variables }),
  });

  if (!resp.ok) throw new Error(`Shopify API ${resp.status}`);

  const data = await resp.json();
  const errors = data.data?.productUpdate?.userErrors || [];
  if (errors.length > 0) throw new Error(errors.map((e) => e.message).join(", "));

  return data.data?.productUpdate?.product;
}

/**
 * Fetch full product data needed for schema generation
 * Includes variants with price, availability, SKU
 */
export async function fetchProductForSchema(accessToken, shopDomain, productId) {
  const query = `{
    node(id: "${productId}") {
      ... on Product {
        id title handle descriptionHtml vendor productType tags
        seo { title description }
        images(first: 5) { edges { node { id url altText } } }
        variants(first: 10) {
          edges {
            node {
              id sku price compareAtPrice
              availableForSale
              selectedOptions { name value }
            }
          }
        }
        metafields(first: 5, namespace: "reviews") {
          edges { node { key value } }
        }
      }
    }
  }`;

  const resp = await fetch(`https://${shopDomain}/admin/api/2025-04/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": accessToken },
    body: JSON.stringify({ query }),
  });

  if (!resp.ok) throw new Error(`Shopify ${resp.status}`);
  const data = await resp.json();
  const node = data.data?.node;
  if (!node) throw new Error("Product not found");

  const variants = (node.variants?.edges || []).map((e) => ({
    id:             e.node.id,
    sku:            e.node.sku || "",
    price:          e.node.price,
    compareAtPrice: e.node.compareAtPrice,
    available:      e.node.availableForSale,
    options:        e.node.selectedOptions,
  }));

  // Try to extract rating from metafields (Judge.me, Loox, etc.)
  let rating = null;
  const reviewMeta = (node.metafields?.edges || []);
  const ratingMeta = reviewMeta.find((e) => e.node.key === "rating");
  const countMeta  = reviewMeta.find((e) => e.node.key === "rating_count");
  if (ratingMeta && countMeta) {
    rating = {
      value: parseFloat(ratingMeta.node.value) || 0,
      count: parseInt(countMeta.node.value) || 0,
    };
  }

  return {
    id:          node.id,
    title:       node.title || "",
    handle:      node.handle || "",
    description: (node.descriptionHtml || "").replace(/<[^>]+>/g, "").trim().slice(0, 500),
    seoTitle:    node.seo?.title || "",
    seoDesc:     node.seo?.description || "",
    vendor:      node.vendor || "",
    productType: node.productType || "",
    tags:        node.tags || [],
    images:      (node.images?.edges || []).map((e) => ({ url: e.node.url, altText: e.node.altText })),
    variants,
    rating,
  };
}

// ── Helpers ──
function slugify(str) {
  return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function getNextYearDate() {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().split("T")[0];
}
