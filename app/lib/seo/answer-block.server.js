// app/lib/seo/answer-block.server.js
// AEO "40-60 word answer block" validator. Scans the body HTML for question-
// style H2/H3 headings and checks whether each is immediately followed by a
// dense, self-contained answer in the 40-80 word window that featured
// snippets and AI Overviews preferentially extract. Pages that bury the
// answer two paragraphs below the heading lose the citation to whichever
// competitor front-loaded the response.
//
// Conservative on detection — we only flag explicit question patterns
// (Romanian + English) so we don't false-positive on every H2.

const RO_QUESTION_PREFIXES = [
  "ce ", "cum ", "de ce ", "când ", "cand ", "cine ", "care ", "unde ", "cât ", "cat ", "ce este ", "cum se ", "cum să ",
];
const EN_QUESTION_PREFIXES = [
  "what ", "how ", "why ", "when ", "who ", "which ", "where ", "is ", "are ", "can ", "do ", "does ",
];

const TARGET_MIN = 40;
const TARGET_MAX = 80;
// Calibration window: ~40-60 is ideal, 40-80 still extractable; outside that
// the block usually needs rewriting before it earns a featured snippet.
const HARD_MIN   = 25;
const HARD_MAX   = 120;

function stripTags(s) {
  return (s || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

function isQuestion(heading) {
  const h = (heading || "").toLowerCase().trim();
  if (!h) return false;
  if (h.endsWith("?")) return true;
  for (const p of [...RO_QUESTION_PREFIXES, ...EN_QUESTION_PREFIXES]) {
    if (h.startsWith(p)) return true;
  }
  return false;
}

function wordCount(s) {
  if (!s) return 0;
  return s.split(/\s+/).filter(Boolean).length;
}

// Walk the body HTML extracting (heading, firstParagraphAfter) pairs. We use
// a forgiving regex-based parser rather than a full DOM library — Shopify
// product descriptions are small enough and the patterns are predictable.
function extractAnswerPairs(bodyHtml) {
  if (!bodyHtml) return [];
  const pairs = [];
  // Match H2 or H3 plus the next <p>...</p>. The non-greedy capture stops at
  // the next heading or paragraph close.
  const rx = /<h([23])[^>]*>([\s\S]*?)<\/h\1>\s*([\s\S]*?)(?=<h[23][^>]*>|$)/gi;
  let m;
  while ((m = rx.exec(bodyHtml)) !== null) {
    const headingText = stripTags(m[2]);
    const after       = m[3] || "";
    // First paragraph after the heading.
    const pMatch = after.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    const answerText = pMatch ? stripTags(pMatch[1]) : "";
    pairs.push({ heading: headingText, answer: answerText, level: m[1] });
  }
  return pairs;
}

export function scoreAnswerBlocks(bodyHtml) {
  const pairs     = extractAnswerPairs(bodyHtml);
  const questions = pairs.filter(p => isQuestion(p.heading));
  if (questions.length === 0) {
    return { questionCount: 0, optimal: 0, ratio: 0, score: 0, findings: [] };
  }

  let optimal = 0;
  const findings = [];
  for (const q of questions) {
    const wc = wordCount(q.answer);
    if (wc >= TARGET_MIN && wc <= TARGET_MAX) {
      optimal++;
      continue;
    }
    if (wc === 0) {
      findings.push({
        field: "Answer Block", severity: "error",
        title: `"${q.heading.slice(0, 60)}" fără răspuns direct`,
        message: "După un H2 întrebare nu urmează niciun paragraf — featured snippet pierde la concurent.",
        suggestion: "Adaugă un paragraf de 40-60 cuvinte chiar sub H2, cu răspuns complet în prima propoziție.",
        can_automate: false,
      });
    } else if (wc < HARD_MIN) {
      findings.push({
        field: "Answer Block", severity: "warning",
        title: `"${q.heading.slice(0, 60)}" — răspuns prea scurt`,
        message: `${wc} cuvinte sub H2. Featured snippet vrea 40-60 pentru extracție clară.`,
        suggestion: "Extinde răspunsul cu context + un exemplu concret până la 40-60 cuvinte.",
        can_automate: false,
      });
    } else if (wc < TARGET_MIN) {
      findings.push({
        field: "Answer Block", severity: "warning",
        title: `"${q.heading.slice(0, 60)}" — sub țintă`,
        message: `${wc} cuvinte sub H2 (țintă 40-60).`,
        suggestion: "Mai adaugă 1-2 propoziții cu beneficiu concret + atribut.",
        can_automate: false,
      });
    } else if (wc > HARD_MAX) {
      findings.push({
        field: "Answer Block", severity: "warning",
        title: `"${q.heading.slice(0, 60)}" — răspuns prea lung`,
        message: `${wc} cuvinte sub H2 — AI extractor preferă blocuri de 40-60 cu răspunsul în prima propoziție.`,
        suggestion: "Mută detaliile în paragraful 2; păstrează primul paragraf la 40-60 cuvinte cu definiția/răspunsul direct.",
        can_automate: false,
      });
    } else { // wc > TARGET_MAX && wc <= HARD_MAX
      findings.push({
        field: "Answer Block", severity: "info",
        title: `"${q.heading.slice(0, 60)}" — peste țintă, încă extractabil`,
        message: `${wc} cuvinte sub H2 (țintă 40-60). Acceptabil dar la limită.`,
        can_automate: false,
      });
    }
  }

  const ratio = optimal / questions.length;
  const score = Math.round(ratio * 100);

  // Summary as a single ok/warning finding so the audit row doesn't get
  // dominated by per-question findings when most are fine.
  findings.unshift({
    field: "Answer Block",
    severity: ratio >= 0.7 ? "ok" : ratio >= 0.3 ? "warning" : "error",
    title:   `${optimal}/${questions.length} răspunsuri în țintă (40-60 cuvinte)`,
    message: ratio >= 0.7
      ? "Structură AEO sănătoasă — majoritatea H2-urilor au răspuns extractabil."
      : "AEO/featured-snippet hit rate scăzut. Reformatează blocurile de sub fiecare H2-întrebare.",
    can_automate: false,
  });

  return { questionCount: questions.length, optimal, ratio, score, findings };
}
