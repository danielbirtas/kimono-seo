// app/lib/seo/constants.js
// ═══ Kimono SEO — SEO Engine Constants ═══

export const DEFAULT_TAG_PROMPT = `Esti expert e-commerce SEO Romania.
Analizeaza titlurile si identifica TIPUL DE PRODUS PRINCIPAL.

REGULI TAG:
- Tag = exact ce ar cauta un cumparator pe Google Romania
- Foloseste 2-4 cuvinte cat sa fie SPECIFIC ce e produsul:
  "cutie depozitare" NU "cutie" (prea vag)
  "bara tractiuni" NU "bara" (prea vag)
  "dozator sapun" NU "dozator" (prea vag)
- IMPORTANT: Daca produsul are un CALIFICATOR care schimba complet sensul, include-l:
  "cutie depozitare medicamente" e DIFERIT de "cutie depozitare" (alta categorie)
  "aspirator auto" e DIFERIT de "aspirator" (alt produs)
  "martisor bratara" e un tip specific de martisor
  Dar "cutie depozitare plastic 20L transparent" => "cutie-depozitare" (plastic/20L/transparent sunt atribute, nu schimba tipul)
- UN singur cuvant e OK cand e deja specific: "kendama", "martisor", "aspirator"
- NU include: branduri (Bosch, Dyson, KROM), marimi (XL, 20L), culori, materiale simple
- INCLUDE calificatoare care schimba tipul: medicamente, auto, industrial, copii, gradina
- Accesorii: specifica tipul (husa-kendama, sac-aspirator)
- Tag: romana, lowercase, fara diacritice, cratima intre cuvinte

TESTE MENTALE pt tag corect:
1. Daca caut tag-ul pe Google, gasesc EXACT tipul asta de produs? DA = tag bun
2. Daca adaug un cuvant in plus, se schimba TIPUL de produs? DA = include cuvantul
3. E un atribut (marime/culoare/brand) sau un calificator de tip? Atribut = NU include

PRODUSE:
{PRODUCTS}

Returneaza STRICT JSON array:
[{"id":1,"tag":"cutie-depozitare","sub":"cutie depozitare plastic transparenta"}]

"id" = numarul din lista. "sub" = descriere scurta pt context. DOAR JSON.`;

export const DEFAULT_BATCH_SIZE   = 20;
export const DEFAULT_KW_PER_BUCKET = 10;
export const DEFAULT_MIN_VOLUME   = 50;

// Keyword intent classification patterns
export const KW_TYPE_PATTERNS = {
  informational: /(?:cum |ce este|de ce |ghid|tutorial|invata|trucuri|sfaturi)/i,
  comparative:   /(?:cel mai|top |best |comparatie|review|recenzie|vs )/i,
};

// ─── DATAFORSEO LANGUAGE / LOCATION MAPS ───
export const DFS_LANGUAGE_CODES = {
  ro: { name: "Romanian", code: "ro" },
  en: { name: "English",  code: "en" },
  de: { name: "German",   code: "de" },
  fr: { name: "French",   code: "fr" },
  hu: { name: "Hungarian", code: "hu" },
};

export const DFS_LOCATION_CODES = {
  ro: 2642,
  en: 2840,
  de: 2276,
  fr: 2250,
  hu: 2348,
};

// ─── SEO SETTING KEYS ───
// Note: DataForSEO credentials are in ENV (DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD)
// not stored per-store. Only GSC tokens and AI settings are stored here.
export const SEO_KEYS = {
  AI_PROMPT:        "seo_ai_prompt",
  BATCH_SIZE:       "seo_batch_size",
  KW_PER_BUCKET:    "seo_kw_per_bucket",
  MIN_VOLUME:       "seo_min_volume",
  // Google Search Console OAuth (per-store)
  GSC_ACCESS_TOKEN:  "seo_gsc_access_token",
  GSC_REFRESH_TOKEN: "seo_gsc_refresh_token",
  GSC_TOKEN_EXPIRY:  "seo_gsc_token_expiry",
  GSC_SITE_URL:      "seo_gsc_site_url",
  // IndexNow
  INDEXNOW_ENABLED:  "seo_indexnow_enabled",
  INDEXNOW_KEY:      "seo_indexnow_key",
};

// Plan feature gating
export const SEO_PLAN_ACCESS = {
  free:    [],
  starter: ["scan", "tag"],
  growth:  ["scan", "tag", "keywords", "categories", "gsc"],
  scale:   ["scan", "tag", "keywords", "categories", "gsc", "custom_prompt"],
};

// ─── Google Keyword Planner ─────────────────────────────────────────────────
export const GKP_API_VERSION  = "v18";
export const GKP_MAX_PAGES    = 10;
export const GKP_PAGE_SIZE    = 1000;
export const GKP_LANGUAGE     = "languageConstants/1017"; // Romanian
export const GKP_GEO          = "geoTargetConstants/2642"; // Romania
