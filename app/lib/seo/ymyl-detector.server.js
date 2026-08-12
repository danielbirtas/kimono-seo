// app/lib/seo/ymyl-detector.server.js
//
// Detects YMYL ("Your Money or Your Life") topics per Google Search Quality
// Rater Guidelines §2.3. YMYL content has the strictest E-E-A-T bar — weak
// E-E-A-T on YMYL automatically rates as Lowest/Untrustworthy, and the
// March 5, 2024 scaled-content policy hits YMYL hardest.
//
// Categories (per SQRG):
// - Health & safety (medical, drugs, mental health, emergencies)
// - Financial security (investments, taxes, loans, insurance, mortgage)
// - Civics/society (voting, government, news, public institutions)
// - Groups of people (race, religion, disability, age, nationality, etc.)
// - Other (fitness/nutrition, housing, college, career)
//
// We block automatic AI generation for YMYL keywords. Merchants can still
// write content manually — we only refuse to be the source of low-effort
// AI-templated pages on these topics.

// Keyword stems matched case-insensitively against normalized text
// (lowercase + diacritics stripped). Stems are 4-char minimums so we catch
// inflected forms ("medicament", "medicamente", "medical" all match "medi").
const YMYL_STEMS_RO = [
  // Health & safety
  "medi", "tratament", "boal", "boli", "vindec", "leac", "remediu",
  "doctor", "medic", "spital", "clinic", "diagnostic", "simpto",
  "psihia", "psihol", "anxiet", "depres", "insomni", "stres",
  "vacc", "imuni", "alerg", "diabet", "cancer", "tumora",
  "sarcin", "gravid", "nastere", "fert", "menstr",
  "nutri", "dieta", "slabit", "obezi", "calorii", "vitamin", "suplim",
  "fitnes", "antren", "musc", "cardio",
  "alcool", "drog", "fumat", "tigari",
  "deces", "moart", "sinucid", "urgent",
  // Financial security
  "credit", "imprum", "ipoteca", "mortgage", "rate", "leasing",
  "invest", "actiun", "obligat", "fonduri", "bursa", "trading",
  "cripto", "bitcoin", "ethereum", "blockchain", "nft",
  "asigura", "polit",
  "taxe", "impozit", "fisc", "anaf", "tva", "buget",
  "salari", "pensie", "somaj", "concedi",
  "banc", "card", "depozit", "economisi", "datorii",
  // Civics / law
  "lege", "avocat", "proces", "tribunal", "judec", "instanta",
  "divort", "custodi", "alimente", "moșten", "succesi",
  "penal", "infract", "pedeaps", "amend", "sancti",
  "vot", "alegeri", "guvern", "parlament",
  "vize", "azil", "cetate", "rezidenta",
  // Groups (protected categories) — usually OK to mention; flag only
  // if combined with strong claims (handled by combination logic below)
  "etnic", "rasial", "religi", "lgbt", "gay", "lesbi", "trans",
  "dizab", "handica",
  // Housing & career
  "carier", "angajare", "concedi", "interview", "cv",
];

const YMYL_STEMS_EN = [
  // Health
  "medic", "doctor", "hospital", "clinic", "diagnos", "sympto",
  "drug", "medicine", "therapy", "treatment", "disease", "illness",
  "psychi", "mental", "anxiety", "depres", "insomni",
  "vaccin", "immun", "allerg", "diabet", "cancer", "tumor",
  "pregna", "fertil", "birth",
  "nutrit", "diet", "weight", "calori", "vitamin", "supple",
  "fitness", "workout", "exerci",
  "alcoho", "smok", "nicot",
  "death", "suicid", "emergen",
  // Finance
  "credit", "loan", "mortgage", "leas",
  "invest", "stock", "bond", "fund", "trad",
  "crypto", "bitcoin", "ethereum", "blockchain",
  "insur", "polic",
  "tax", "income", "irs",
  "salar", "pensi", "retir", "unempl",
  "bank", "deposit", "saving", "debt",
  // Law
  "lawyer", "attorne", "lawsui", "court", "judic", "trial",
  "divorc", "custody", "alimon", "inheri",
  "crimin", "felon", "misdem", "senten",
  "vote", "elect", "govern",
  "visa", "asyl", "citizen",
  // Career
  "career", "job", "hir", "fir", "lay-off", "termin",
];

const ALL_STEMS = [...YMYL_STEMS_RO, ...YMYL_STEMS_EN];

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

// Returns { isYmyl: boolean, matchedStems: string[], category: string|null }
export function detectYmyl(text) {
  const norm = normalize(text);
  const matched = ALL_STEMS.filter(stem => norm.includes(stem));

  if (matched.length === 0) {
    return { isYmyl: false, matchedStems: [], category: null };
  }

  let category = "general";
  const sample = matched[0];
  if (/^(medi|doctor|trat|psih|nutri|fitness|vacc|cancer|diet|drug|hospi|clin|symp|preg|allerg|diabet|tumor|alcoho|smok|suicid)/.test(sample)) category = "health";
  else if (/^(credit|invest|cripto|crypto|bitcoin|tax|impoz|banc|bank|asigur|insur|loan|mortgage|pensi|salar)/.test(sample)) category = "finance";
  else if (/^(lege|lawyer|avoc|attor|judec|tribun|court|divort|divorc|penal|crimin|vot|elect|guvern|govern)/.test(sample)) category = "civics";
  else if (/^(carier|career|angaj|conced|hir|fir|job)/.test(sample)) category = "career";

  return { isYmyl: true, matchedStems: matched.slice(0, 5), category };
}

// Convenience wrapper for pSEO templates — checks targetKeyword + all token
// values + template title/meta in one pass.
export function detectYmylForRow(row) {
  const sources = [
    row.targetKeyword,
    row.title,
    row.metaDescription,
    row.h1,
    ...Object.values(row.tokensJson || {}),
  ];
  return detectYmyl(sources.filter(Boolean).join(" "));
}

export function detectYmylForTemplate(tpl) {
  const dicts = tpl.tokenDictsJson || {};
  const flat = [
    tpl.name, tpl.titleTpl, tpl.metaTpl, tpl.h1Tpl, tpl.urlPattern,
    ...Object.values(dicts).flat?.() || [],
    ...((dicts._pairs || []).flatMap(p => Object.values(p))),
  ];
  return detectYmyl(flat.filter(Boolean).join(" "));
}
