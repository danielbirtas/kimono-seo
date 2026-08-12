// app/lib/seo/ai-citations/claude-client.server.js
// Queries Anthropic Claude with the web_search tool. Returns a normalized
// envelope that the orchestrator persists as one AiCitationRun.

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = process.env.AI_MODEL_QUALITY || "claude-sonnet-4-6";
// Per Anthropic pricing as of mid-2026: $0.010/search + token costs at model rates.
// We charge merchants in cents so we track cost per run with simple math.
const COST_PER_SEARCH_CENTS = 1; // 1 cent / search

async function fetchClaudeOnce({ apiKey, body, timeoutMs }) {
  const ac = new AbortController();
  const t  = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const resp = await fetch(ANTHROPIC_API, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      signal: ac.signal,
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      const err  = new Error(`Anthropic ${resp.status}: ${text.slice(0, 200)}`);
      err.status    = resp.status;
      err.transient = resp.status === 429 || resp.status >= 500;
      throw err;
    }
    return await resp.json();
  } finally {
    clearTimeout(t);
  }
}

export async function queryClaude({ prompt, model = DEFAULT_MODEL, maxSearches = 3, timeoutMs = 45_000 }) {
  // Strip every non-printable ASCII char — Railway env vars sometimes pick up newlines /
  // smart quotes / zero-width spaces from clipboard, which makes undici reject the header
  // with UND_ERR_INVALID_ARG. Anthropic keys are sk-ant-api03-… i.e. pure printable ASCII.
  const apiKey = (process.env.ANTHROPIC_API_KEY || "").replace(/[^\x21-\x7E]/g, "");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const startedAt = Date.now();
  const body = {
    model,
    max_tokens: 1024,
    // Instructional prompt — push the model toward an answer-first list response
    // since that's how merchants experience LLM brand discovery.
    system: "You are a helpful research assistant. When asked to recommend products or brands, answer concisely, cite sources, and list specific brand names.",
    messages: [{ role: "user", content: prompt }],
    tools: [{
      // Latest tool ID per Anthropic docs (Dec 2026 GA).
      type: "web_search_20250305",
      name: "web_search",
      max_uses: maxSearches,
    }],
  };

  let message;
  try {
    message = await fetchClaudeOnce({ apiKey, body, timeoutMs });
  } catch (err) {
    const isNetwork = err.name === "AbortError" || err.message === "fetch failed";
    if (!isNetwork && !err.transient) {
      throw err;
    }
    await new Promise(r => setTimeout(r, 1500));
    try {
      message = await fetchClaudeOnce({ apiKey, body, timeoutMs });
    } catch (err2) {
      if (err2.name === "AbortError") throw new Error(`Claude timeout after ${timeoutMs}ms`);
      if (err2.message === "fetch failed") {
        // undici TypeError("fetch failed") hides the real socket error in err.cause.
        const cause = err2.cause;
        const code  = cause?.code || cause?.errno || cause?.name;
        const msg   = cause?.message || "no cause";
        throw new Error(`Network error reaching Anthropic: ${code || "unknown"} — ${msg}`);
      }
      throw err2;
    }
  }

  const searchesUsed = (message.content || []).filter(b => b.type === "server_tool_use" && b.name === "web_search").length;

  return {
    platform:     "claude",
    model:        message.model || model,
    rawResponse:  message,
    durationMs:   Date.now() - startedAt,
    // Cost estimate: searches × per-search rate. Token billing surfaces in
    // usage.input_tokens / output_tokens — we approximate at 0.3¢/1k tokens
    // for Sonnet 4.6 (input avg) to keep things simple.
    costCents:    (searchesUsed * COST_PER_SEARCH_CENTS) +
                  Math.ceil(((message.usage?.input_tokens || 0) + (message.usage?.output_tokens || 0)) * 0.0003 * 100),
  };
}
