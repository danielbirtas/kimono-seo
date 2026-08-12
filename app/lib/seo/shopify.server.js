// app/lib/seo/shopify.server.js
// Kimono SEO — Shopify API Helpers for SEO Module

export async function fetchAllProducts(admin, cursor = null, limit = 100) {
  const query = `#graphql
    query fetchProducts($first: Int!, $after: String) {
      products(first: $first, after: $after, query: "status:active") {
        edges { node { id title } cursor }
        pageInfo { hasNextPage }
      }
    }
  `;
  const resp = await admin.graphql(query, { variables: { first: limit, after: cursor } });
  const data = await resp.json();
  const edges = data.data?.products?.edges || [];
  const hasNext = data.data?.products?.pageInfo?.hasNextPage || false;
  const lastCursor = edges.length > 0 ? edges[edges.length - 1].cursor : null;
  return {
    products: edges.map((e) => ({ id: e.node.id, title: e.node.title })),
    hasNextPage: hasNext,
    cursor: lastCursor,
  };
}

export async function addProductTags(admin, productId, tags) {
  if (!tags.length) return;
  const mutation = `#graphql
    mutation addTags($id: ID!, $tags: [String!]!) {
      tagsAdd(id: $id, tags: $tags) { userErrors { field message } }
    }
  `;
  const resp = await admin.graphql(mutation, { variables: { id: productId, tags } });
  const data = await resp.json();
  const errors = data.data?.tagsAdd?.userErrors || [];
  if (errors.length) console.error(`[SEO] tagsAdd error for ${productId}:`, errors);
}

export async function createAutomatedCollection(admin, { title, tag, descriptionHtml, seoTitle, seoDescription }) {
  const existing = await findCollectionByTag(admin, tag);
  if (existing) return existing;

  const mutation = `#graphql
    mutation createSmartCollection($input: CollectionInput!) {
      collectionCreate(input: $input) {
        collection { id handle }
        userErrors { field message }
      }
    }
  `;
  const input = {
    title, descriptionHtml: descriptionHtml || "",
    ruleSet: { appliedDisjunctively: false, rules: [{ column: "TAG", relation: "EQUALS", condition: tag }] },
    seo: { title: seoTitle || title, description: seoDescription || `Descopera produse ${title.toLowerCase()}. Livrare rapida.` },
  };
  const resp = await admin.graphql(mutation, { variables: { input } });
  const data = await resp.json();
  const errors = data.data?.collectionCreate?.userErrors || [];
  if (errors.length) {
    const isDuplicate = errors.some((e) => e.message?.includes("already") || e.message?.includes("taken"));
    if (isDuplicate) { const found = await findCollectionByTag(admin, tag); if (found) return found; }
    throw new Error(`Collection create error: ${errors.map((e) => e.message).join(", ")}`);
  }
  return data.data?.collectionCreate?.collection?.id || null;
}

async function findCollectionByTag(admin, tag) {
  const titleSearch = tag.replace(/-/g, " ").split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  const resp = await admin.graphql(`#graphql
    query findCollection($queryStr: String!) {
      collections(first: 1, query: $queryStr) { edges { node { id title } } }
    }
  `, { variables: { queryStr: `title:${titleSearch}` } });
  const data = await resp.json();
  const edges = data.data?.collections?.edges || [];
  return edges.length > 0 ? edges[0].node.id : null;
}

export async function getProductCount(admin) {
  const resp = await admin.graphql(`#graphql
    query { productsCount(query: "status:active") { count } }
  `);
  const data = await resp.json();
  return data.data?.productsCount?.count || 0;
}
