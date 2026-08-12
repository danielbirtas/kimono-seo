// app/lib/seo/info-gain.server.js
// Information Gain scorer — quantifies the "5-to-7 rule" from the 2026 GEO
// research: an article needs 5-7 distinct, citable inserts (statistics, SME
// quotes, external authoritative citations, original data) to clear the bar
// for AI Overviews / ChatGPT / Perplexity grounding. Without that density,
// the article is treated as redundant relative to the existing corpus on the
// topic and dropped from RAG selection.
//
// We score regex-detectable signals — no AI call here, so this runs free and
// instantly during a blog audit. Results: { stats, quotes, citations,
// freshDates, lists, totalSignals, score, findings }.

const TARGET_SIGNALS = 7;   // ≥7 hits the "max impact" band per research
const FLOOR_SIGNALS  = 2;   // <2 = thin/redundant content

// --- Statistics ----------------------------------------------------------
// Numbers with % or x or units (cm/mm/kg/€/$/lei/MB/GB/MHz/dB) — these are
// the kind of factual anchors LLMs prefer to extract because they're cheap
// to verify.
const STAT_RX = /\b(?:\d{1,4}(?:[.,]\d+)?)\s*(?:%|x|×|cm|mm|m|km|kg|g|ml|l|°C|°F|lei|RON|€|\$|USD|EUR|GBP|MB|GB|TB|MHz|GHz|kHz|Hz|dB|W|V|A|h|min|sec)\b/gi;

// --- Quote markers --------------------------------------------------------
// HTML blockquote OR markdown "> " blockquote, plus attribution patterns
// "X spune", "according to", "Y zice"
const QUOTE_HTML_RX = /<blockquote\b/gi;
const QUOTE_MD_RX   = /^>\s+\S/gm;
const QUOTE_TEXT_RX = /\b(spune|spuse|afirma|afirmă|explica|explică|declară|declara|conform[u]?[lui]*?|potrivit|according to|explained|noted|stated|said|emphasized)\b[^\.,;]{3,}["“„][^"”„]{8,}["”„]/gi;

// --- External citation — links to authoritative external domains ----------
// Matches both <a href="…"> and markdown [text](url). Whitelisting .gov/.edu
// can come later — initial signal is "linked externally at all."
const HREF_RX = /<a\s+[^>]*href="([^"]+)"/gi;
const MD_LINK_RX = /\[[^\]]+\]\((https?:\/\/[^\s)]+)\)/g;

// --- Date / freshness markers --------------------------------------------
// Concrete years referenced inline ("în 2025", "studiu 2024") signal data
// recency vs. evergreen rewrites that may have stagnated.
const YEAR_RX = /\b(20[12]\d)\b/g;

// --- List markers ---------------------------------------------------------
// <ul>/<ol> usually carry comparison/recommendation density that AI extracts.
// Also markdown lines starting with "- " or "1." count as list items; we
// detect contiguous blocks of ≥3 such lines as a single list.
const LIST_RX     = /<(ul|ol)[^>]*>/gi;
const MD_LIST_RX  = /(?:^|\n)(?:[-*+]\s|\d+\.\s)\S.*(?:\n(?:[-*+]\s|\d+\.\s)\S.*){2,}/g;

function countMatches(text, rx) {
  if (!text) return 0;
  const m = text.match(rx);
  return m ? m.length : 0;
}

function uniqueHttpLinks(html, ownHost) {
  if (!html) return [];
  const out = new Set();
  const collect = (rx) => {
    let m;
    while ((m = rx.exec(html)) !== null) {
      const href = m[1];
      if (!/^https?:\/\//i.test(href)) continue;
      try {
        const u = new URL(href);
        if (ownHost && u.hostname.toLowerCase().endsWith(ownHost.toLowerCase())) continue;
        out.add(u.hostname.toLowerCase());
      } catch { /* malformed href, skip */ }
    }
  };
  collect(HREF_RX);
  collect(MD_LINK_RX);
  return [...out];
}

function stripTags(s) {
  return (s || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

export function scoreInformationGain(html, { ownHost = "" } = {}) {
  const plain      = stripTags(html);
  const words      = plain ? plain.split(/\s+/).filter(Boolean).length : 0;

  const stats      = countMatches(plain, STAT_RX);
  const quotes     = countMatches(html, QUOTE_HTML_RX) + countMatches(html, QUOTE_MD_RX) + countMatches(plain, QUOTE_TEXT_RX);
  const externals  = uniqueHttpLinks(html, ownHost);
  const citations  = externals.length;
  const years      = countMatches(plain, YEAR_RX);
  const lists      = countMatches(html, LIST_RX) + countMatches(html, MD_LIST_RX);

  // Density signal: stats per 1000 words. Below ~3/1000 the article reads as
  // generic; above ~8/1000 it reads as a research note. Sweet spot is 5-8.
  const statsPerKw = words ? (stats / words) * 1000 : 0;

  // Composite "Information Gain index" — weighted blend that mirrors the
  // research's emphasis on SME quotes (+400% AI Overview lift) and concrete
  // statistics (+22% selection rate per Princeton GEO).
  const totalSignals = stats + (quotes * 2) + citations + Math.min(years, 5) + Math.min(lists, 3);
  const score        = Math.min(100, Math.round((totalSignals / TARGET_SIGNALS) * 100));

  const findings = [];

  // Top-line verdict
  if (totalSignals >= TARGET_SIGNALS) {
    findings.push({
      field: "Information Gain", severity: "ok",
      title: `${totalSignals} semnale unice — regula 5-7 atinsă`,
      message: `${stats} stats · ${quotes} citate · ${citations} surse externe · ${years} ani referențiați · ${lists} liste.`,
      can_automate: false,
    });
  } else if (totalSignals >= FLOOR_SIGNALS) {
    const needed = TARGET_SIGNALS - totalSignals;
    findings.push({
      field: "Information Gain", severity: "warning",
      title: `${totalSignals} semnale — mai e nevoie de ${needed}`,
      message: `${stats} stats · ${quotes} citate · ${citations} surse · ${years} ani · ${lists} liste. Regula 5-7 GEO cere mai multe inserții unice.`,
      suggestion: "Adaugă 2-3 statistici concrete cu sursă, 1 citat SME cu credențiale, sau o sursă autoritată terță.",
      can_automate: false,
    });
  } else {
    findings.push({
      field: "Information Gain", severity: "error",
      title: "Conținut redundant — risc de a fi sărit de RAG",
      message: `Doar ${totalSignals} semnale unice detectate. LLM-urile sancționează articolele fără date, citate sau surse.`,
      suggestion: "Cercetarea Princeton GEO: +400% vizibilitate AI Overview cu citate experți + statistici concrete. Adaugă 3-5 inserții unice.",
      can_automate: false,
    });
  }

  // Per-axis recommendations only when actionable
  if (stats === 0) {
    findings.push({ field: "Information Gain", severity: "warning", title: "Fără statistici", message: "Niciun număr cu unitate (% / cm / lei / x).", suggestion: "Adaugă 2-3 cifre concrete: rate, dimensiuni, prețuri, comparații.", can_automate: false });
  } else if (statsPerKw < 3 && words > 600) {
    findings.push({ field: "Information Gain", severity: "info", title: "Densitate statistici scăzută", message: `${stats} stats / ${words} cuvinte (${statsPerKw.toFixed(1)}/1000).`, suggestion: "Țintă: 5-8 statistici / 1000 cuvinte pentru extracție AI optimă.", can_automate: false });
  }
  if (quotes === 0 && words > 400) {
    findings.push({
      field: "Information Gain", severity: "warning",
      title: "Niciun citat de expert",
      message: "Cercetarea raportează +400% vizibilitate AI Overview pentru articole cu citate SME.",
      suggestion: "Adaugă un citat direct atribut unui specialist (cu nume + credențiale) într-un <blockquote>.",
      can_automate: false,
    });
  }
  if (citations === 0 && words > 400) {
    findings.push({
      field: "Information Gain", severity: "warning",
      title: "Fără surse externe",
      message: "Pagini fără citation către terți sunt evaluate ca opinii izolate. Articolele citate de AI au în medie 3+ surse externe (Princeton GEO).",
      suggestion: "Linkează la 1-2 studii, instituții, sau publicații autoritate (gov/edu/jurnale).",
      can_automate: false,
    });
  }

  return {
    words,
    stats,
    quotes,
    citations,
    externalDomains: externals,
    years,
    lists,
    statsPerKw,
    totalSignals,
    score,
    findings,
  };
}
