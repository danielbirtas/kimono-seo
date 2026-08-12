// app/lib/seo/ai-citations/aio-client.server.js
// Queries Google AI Overviews via DataForSEO's SERP API. Unlike ChatGPT/Claude
// which we hit directly, AIO has no public API — we scrape the SERP and parse
// the ai_overview block out of the items[] array.
//
// DataForSEO endpoint: /v3/serp/google/organic/live/advanced
// Returns SERP items including ai_overview type when Google decides to surface
// one. Roughly 15-25% of SERPs trigger an AIO (Semrush 10M-keyword study).
// AIO citations come back as references with url + title + source.

const DFS_API = "https://api.dataforseo.com";

function getDfsAuth() {
  const l = process.env.DATAFORSEO_LOGIN    || "";
  const p = process.env.DATAFORSEO_PASSWORD || "";
  if (!l || !p) return null;
  return Buffer.from(`${l}:${p}`).toString("base64");
}

export async function queryGoogleAIO({ prompt, locationCode = 2840, languageCode = "en", timeoutMs = 30_000 }) {
  // Default location: 2840 = US English. For RO merchants pass 2642 (Romania) + "ro".
  const auth = getDfsAuth();
  if (!auth) throw new Error("DATAFORSEO_LOGIN/PASSWORD not configured");

  const startedAt = Date.now();
  const ac = new AbortController();
  const t  = setTimeout(() => ac.abort(), timeoutMs);

  try {
    const resp = await fetch(`${DFS_API}/v3/serp/google/organic/live/advanced`, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
      signal:  ac.signal,
      body: JSON.stringify([{
        keyword:        prompt,
        location_code:  locationCode,
        language_code:  languageCode,
        device:         "desktop",
        // Force the AI Overview synchronous fetch instead of the cheaper
        // page_token async pattern — saves us a follow-up request and the
        // bookkeeping of pending tasks.
        load_async_ai_overview: true,
        // Include AI Overview references (the cited URLs inside the overview).
        people_also_ask_click_depth: 0,
      }]),
    });
    clearTimeout(t);

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`DataForSEO ${resp.status}: ${text.slice(0, 200)}`);
    }
    const data = await resp.json();
    if (data.status_code !== 20000) throw new Error(`DFS ${data.status_code}: ${data.status_message}`);

    const task   = data.tasks?.[0];
    const result = task?.result?.[0];
    // ~$0.0012 per scrape with AI Overview enabled. Round up to 1 cent.
    const costCents = 1;
    return {
      platform:    "aio",
      model:       "google-aio",
      rawResponse: { result, task_id: task?.id },
      durationMs:  Date.now() - startedAt,
      costCents,
    };
  } catch (err) {
    clearTimeout(t);
    if (err.name === "AbortError") throw new Error(`DataForSEO timeout after ${timeoutMs}ms`);
    throw err;
  }
}
