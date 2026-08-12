// app/lib/seo/ai-citations/stats.server.js
// Bootstrap percentile CI for citation/mention rates. Per the GEO methodology
// reference: single-run point estimates are not defensible; we always pair
// rates with 95% bootstrap CIs computed across runs.

// Resample with replacement N times → return [lower, upper] at given confidence.
export function bootstrapCI(samples, { iterations = 2000, confidence = 0.95 } = {}) {
  if (samples.length === 0) return { mean: 0, lower: 0, upper: 0, n: 0 };
  const n     = samples.length;
  const mean  = samples.reduce((a, b) => a + b, 0) / n;
  const draws = new Float32Array(iterations);
  for (let i = 0; i < iterations; i++) {
    let sum = 0;
    for (let j = 0; j < n; j++) sum += samples[Math.floor(Math.random() * n)];
    draws[i] = sum / n;
  }
  // Mutating sort on typed array is in-place and fast.
  draws.sort();
  const alpha = (1 - confidence) / 2;
  const lo    = draws[Math.floor(alpha * iterations)];
  const hi    = draws[Math.floor((1 - alpha) * iterations)];
  return { mean, lower: lo, upper: hi, n };
}

// Open-pool share-of-voice — every brand mentioned across all runs counts in
// the denominator. More defensible than closed-pool (which inflates % by
// excluding strong competitors from the list).
export function shareOfVoice(brandMentionsByBrand) {
  const total = Object.values(brandMentionsByBrand).reduce((a, b) => a + b, 0);
  if (total === 0) return {};
  const out = {};
  for (const [brand, count] of Object.entries(brandMentionsByBrand)) {
    out[brand] = count / total;
  }
  return out;
}

// Aggregate per-run booleans → citation rate + CI.
export function citationRate(runs) {
  if (runs.length === 0) return { rate: 0, lower: 0, upper: 0, n: 0 };
  const samples = runs.map(r => r.brandMentioned ? 1 : 0);
  return { rate: samples.reduce((a, b) => a + b, 0) / samples.length, ...bootstrapCI(samples), n: samples.length };
}

// Aggregate citations by domain → ranked list.
export function topDomains(citations, limit = 20) {
  const counts = new Map();
  for (const c of citations) counts.set(c.domain, (counts.get(c.domain) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([domain, count]) => ({ domain, count }));
}
