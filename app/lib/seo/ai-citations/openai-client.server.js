// app/lib/seo/ai-citations/openai-client.server.js
// Queries OpenAI ChatGPT via the Responses API with web_search tool.
// This is the only way to measure ChatGPT citations honestly — the model
// without search differs significantly from the consumer ChatGPT product.

const OPENAI_API = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = process.env.AI_MODEL_OPENAI || "gpt-4o";
// Per OpenAI pricing as of mid-2026: $10/1000 web_search tool calls + token costs.
// We bill in cents per run.
const COST_PER_SEARCH_CENTS = 1; // 1 cent / search

export async function queryChatGPT({ prompt, model = DEFAULT_MODEL, timeoutMs = 45_000 }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured — add in Railway env to enable ChatGPT measurement");

  const startedAt = Date.now();
  const ac = new AbortController();
  const t  = setTimeout(() => ac.abort(), timeoutMs);

  try {
    const resp = await fetch(OPENAI_API, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type":  "application/json",
      },
      signal: ac.signal,
      body: JSON.stringify({
        model,
        // Force the search tool — without this, gpt-4o would answer from training
        // data alone for ~65% of queries (Semrush data) and we wouldn't measure
        // the consumer ChatGPT experience that actually surfaces brand citations.
        tools: [{ type: "web_search" }],
        tool_choice: { type: "web_search" },
        // Including sources so we can capture the full consulted-URL set, not
        // just the inline-cited subset.
        include: ["web_search_call.action.sources"],
        input: [{
          role: "user",
          content: prompt,
        }],
        instructions: "Answer concisely. When recommending products or brands, cite sources and list specific brand names you found.",
      }),
    });
    clearTimeout(t);

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`OpenAI ${resp.status}: ${text.slice(0, 200)}`);
    }
    const response = await resp.json();

    // Count actual web_search tool calls for cost.
    let searchesUsed = 0;
    for (const item of response.output || []) {
      if (item.type === "web_search_call") searchesUsed++;
    }

    const usage = response.usage || {};
    return {
      platform:    "chatgpt",
      model:       response.model || model,
      rawResponse: response,
      durationMs:  Date.now() - startedAt,
      // ~$2.50/1M input + $10/1M output for gpt-4o → average ~0.0006¢/token roughly.
      costCents:   (searchesUsed * COST_PER_SEARCH_CENTS) +
                   Math.ceil(((usage.input_tokens || 0) + (usage.output_tokens || 0)) * 0.0006 * 100),
    };
  } catch (err) {
    clearTimeout(t);
    if (err.name === "AbortError") throw new Error(`OpenAI timeout after ${timeoutMs}ms`);
    throw err;
  }
}
