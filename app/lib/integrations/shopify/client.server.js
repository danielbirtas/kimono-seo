// app/lib/integrations/shopify/client.server.js
// Shopify GraphQL client — token-based (no OAuth app)

/**
 * Execute a Shopify Admin GraphQL query/mutation.
 * 
 * @param {string} domain   - e.g. "my-store.myshopify.com"
 * @param {string} token    - Shopify Admin API access token
 * @param {string} query    - GraphQL query or mutation string
 * @param {object} variables - GraphQL variables
 * @returns {Promise<{data: any, errors?: any[]}>}
 */
export async function shopifyGraphQL(domain, token, query, variables = {}) {
  const url = `https://${domain}/admin/api/2025-01/graphql.json`;

  const res = await fetch(url, {
    method:  "POST",
    headers: {
      "Content-Type":              "application/json",
      "X-Shopify-Access-Token":    token,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shopify API error ${res.status}: ${text}`);
  }

  return res.json();
}

/**
 * Create a fake "admin" object compatible with existing code that calls admin.graphql()
 * Existing routes use: const resp = await admin.graphql(query, { variables })
 *                      const data = await resp.json()
 */
export function createAdminClient(domain, token) {
  return {
    graphql: async (query, opts = {}) => {
      const variables = opts.variables || {};
      const data = await shopifyGraphQL(domain, token, query, variables);
      // Return an object with .json() method to mimic fetch Response
      return {
        json: async () => data,
      };
    },
  };
}

/**
 * Test that a token+domain pair is valid.
 */
export async function testShopifyConnection(domain, token) {
  try {
    const data = await shopifyGraphQL(domain, token, `{ shop { name } }`);
    if (data.data?.shop?.name) return { ok: true, shopName: data.data.shop.name };
    return { ok: false, error: "Invalid response from Shopify" };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
