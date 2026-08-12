// app/lib/seo/taxonomy.server.js
// Kimono SEO — SEO Taxonomy Engine
// Stratul 2: extragere candidati keyword din titluri produse
// Stratul 4: decizii taxonomie (tag curent → tag propus)

import { anthropicMessage } from "../anthropic.server.js";

async function callAnthropic(apiKey, model, systemPrompt, userPrompt, maxTokens = 2000) {
  const { content } = await anthropicMessage(
    { model, max_tokens: maxTokens, system: systemPrompt, messages: [{ role: "user", content: userPrompt }] },
    { apiKey }
  );
  return (content || "").trim().replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
}

// ─── STRATUL 2: CANDIDATE EXTRACTION ───

export async function extractCandidates(apiKey, products, model) {
  if (!products.length) return [];

  const resolvedModel = model || process.env.AI_MODEL_FAST || "claude-haiku-4-5-20251001";

  const productList = products
    .map((p, i) => {
      const parts = [`${i + 1}. "${p.productTitle}"`];
      if (p.productType)      parts.push(`tip: ${p.productType}`);
      if (p.vendor)           parts.push(`brand: ${p.vendor}`);
      if (p.existingTags?.length) parts.push(`taguri: ${p.existingTags.slice(0, 5).join(", ")}`);
      return parts.join(" | ");
    })
    .join("\n");

  const systemPrompt = "Expert SEO keyword extractor pentru e-commerce Romania. Raspunzi DOAR cu JSON valid, fara markdown, fara explicatii.";

  const userPrompt = `Analizeaza produsele si extrage candidati keyword.

PRODUSE:
${productList}

REGULI:
- Extrage 3-6 candidati keyword per produs
- Candidatii = ce ar cauta un cumparator roman pe Google
- Normalizeaza: "fonta" → "fonta", "inductie" → "inductie" (fara diacritice inconsistente)
- Include variante: singular+plural, cu/fara atribute cheie
- NU include: branduri, marimi, culori, material simplu
- Grupeaza concepte similare: "tigai fonta" si "tigaie din fonta" → pastrati AMBELE ca candidati
- Format: lowercase, fara diacritice, spatii normale

Returneaza STRICT JSON array:
[{"id":1,"candidates":["tigaie fonta","tigai inductie","tigaie 28cm inductie"]}]

DOAR JSON valid.`;

  const content = await callAnthropic(apiKey, resolvedModel, systemPrompt, userPrompt, 4000);
  const match   = content.match(/\[[\s\S]*\]/);
  if (!match) throw new Error("Invalid JSON from candidate extraction");

  // Repair common JSON issues before parsing
  let jsonStr = match[0];
  // Remove trailing commas before ] or }
  jsonStr = jsonStr.replace(/,\s*([\]\}])/g, "$1");
  // Escape unescaped newlines inside strings (basic repair)
  jsonStr = jsonStr.replace(/([^\\])"([^"]*?)\n([^"]*?)"/g, '$1"$2 $3"');
  let results;
  try { results = JSON.parse(jsonStr); }
  catch(e) {
    // Last resort: try to extract valid objects individually
    const items = [];
    const re = /\{[^{}]*"id"[^{}]*"candidates"[^{}]*\}/g;
    let m;
    while ((m = re.exec(jsonStr)) !== null) {
      try { items.push(JSON.parse(m[0])); } catch {}
    }
    if (!items.length) throw new Error("Cannot parse extraction JSON: " + e.message);
    results = items;
  }

  return results.map((r) => {
    const idx = (r.id || 1) - 1;
    if (idx < 0 || idx >= products.length) return null;
    return {
      productId:    products[idx].productId,
      productTitle: products[idx].productTitle,
      candidates:   (r.candidates || []).filter(Boolean).map((c) => c.toLowerCase().trim()),
    };
  }).filter(Boolean);
}

// ─── STRATUL 4: TAXONOMY DECISIONS ───

export async function makeTaxonomyDecisions(apiKey, tagBatches, language = "ro", model) {
  if (!tagBatches.length) return [];

  const resolvedModel = model || process.env.AI_MODEL_QUALITY || "claude-sonnet-4-6";

  const batchText = tagBatches.map((batch, i) => {
    const variantLines = batch.variants
      .slice(0, 10)
      .map((v) => `  - "${v.keyword}" | vol: ${v.volume} | CPC: ${v.cpc?.toFixed(2) || 0} | score: ${v.score?.toFixed(3) || 0} | features: ${(v.serpFeatures || []).join(",")}`)
      .join("\n");
    return `${i + 1}. Tag curent: "${batch.currentTag}"\n   Variante:\n${variantLines}\n   Produse afectate: ${batch.affectedCount}`;
  }).join("\n\n");

  const langInstructions = language === "ro"
    ? "Toate denumirile propuse trebuie sa fie in ROMANA, fara diacritice, lowercase."
    : `All proposed names must be in ${language.toUpperCase()}, lowercase, no special characters.`;

  const systemPrompt = "Expert SEO taxonomy pentru e-commerce. Raspunzi DOAR cu JSON valid, fara markdown, fara explicatii.";

  const userPrompt = `Analizeaza tag-urile curente si propune o taxonomie optimizata.

${langInstructions}

BATCH DE ANALIZAT:
${batchText}

TASK:
Pentru fiecare tag curent, decide:
1. DENUMIREA OPTIMA — alege varianta cu volum maxim + intent comercial
2. TAXONOMIA IERARHICA — L1 (categorie mare) / L2 (tip produs) / L3 (atribut)
3. HANDLE URL — slug SEO-friendly (fara diacritice, cu cratime)
4. JUSTIFICARE — volum actual vs propus + motivatie

REGULI:
- Alege varianta cu cel mai mare "score" daca volumele sunt apropiete
- Daca "shopping" apare in features → semnal comercial puternic → prioritizeaza
- Handle = lowercase, cratime in loc de spatii, max 50 chars
- L1 max 2 cuvinte, L2 max 3 cuvinte, L3 optional

Returneaza STRICT JSON array:
[{
  "id": 1,
  "currentTag": "tigaie-fonta",
  "proposedTag": "tigai fonta",
  "proposedHandle": "tigai-fonta",
  "categoryL1": "bucatarie",
  "categoryL2": "tigai",
  "categoryL3": "fonta",
  "currentVolume": 320,
  "proposedVolume": 880,
  "justification": "Varianta 'tigai fonta' are volum 880/luna vs 320 pentru tag curent."
}]

DOAR JSON valid.`;

  const content = await callAnthropic(apiKey, resolvedModel, systemPrompt, userPrompt, 1200);
  const match   = content.match(/\[[\s\S]*\]/);
  if (!match) { console.error("[TAXONOMY DEBUG] content received:", JSON.stringify(content).slice(0, 500)); throw new Error("Invalid JSON from taxonomy decisions"); }

  const decisions = JSON.parse(match[0]);

  return decisions.map((d) => {
    const idx = (d.id || 1) - 1;
    if (idx < 0 || idx >= tagBatches.length) return null;
    const batch = tagBatches[idx];
    return {
      currentTag:         d.currentTag      || batch.currentTag,
      proposedTag:        d.proposedTag     || batch.currentTag,
      proposedHandle:     d.proposedHandle  || slugify(d.proposedTag || batch.currentTag),
      categoryL1:         d.categoryL1      || "",
      categoryL2:         d.categoryL2      || "",
      categoryL3:         d.categoryL3      || null,
      currentVolume:      parseInt(d.currentVolume)  || 0,
      proposedVolume:     parseInt(d.proposedVolume) || 0,
      justification:      d.justification   || "",
      affectedProductIds: batch.affectedProductIds || [],
      affectedCount:      batch.affectedCount || 0,
    };
  }).filter(Boolean);
}

export async function generateCollectionDescription(apiKey, keyword, category, language = "ro", model) {
  // Use Sonnet for descriptions — Haiku produced calques like "crafitate" and word-order errors.
  const resolvedModel = model || process.env.AI_MODEL_QUALITY || "claude-sonnet-4-6";

  const userPrompt = language === "ro"
    ? `Scrie o descriere HTML pentru colectia "${keyword}" (categoria: "${category}").

STRUCTURA OBLIGATORIE (in exact aceasta ordine):

<h2>Intro</h2>
<p>2-3 propozitii care prezinta colectia: ce gaseste clientul, beneficiul principal, keyword-ul "${keyword}" natural in prima propozitie.</p>

<h2>De ce sa alegi colectia noastra de ${keyword}</h2>
<ul>
  <li><strong>Beneficiu 1</strong> — explicatie scurta (calitate, materiale, design)</li>
  <li><strong>Beneficiu 2</strong> — explicatie scurta (varietate, stiluri, optiuni)</li>
  <li><strong>Beneficiu 3</strong> — explicatie scurta (livrare rapida, retur gratuit, garantie)</li>
  <li><strong>Beneficiu 4</strong> — explicatie scurta (suport, comunitate, expertiza)</li>
</ul>

<h2>Cum alegi ${keyword} potrivit</h2>
<p>2-3 propozitii cu sfaturi practice de alegere (stil, marime, compatibilitate, buget) — adresat la persoana a 2-a ("alege", "considera").</p>

<p>Comanda online cu livrare rapida in toata Romania.</p>

REGULI STRICTE (NU NEGOCIABIL):

1. **VOCABULAR ROMÂNESC AUTENTIC**
   - Folosește DOAR cuvinte care EXISTĂ în DEX (dicționarul limbii române)
   - ❌ INTERZIS: cuvinte inventate, calcuri englezești, neologisme netranslate
   - Exemple de greșeli de evitat: "crafitate" (inexistent — folosește "realizate cu grijă" sau "lucrate manual"), "user-friendly" (folosește "ușor de folosit"), "trend-setter" (folosește "în tendințe")
   - Verifică MENTAL fiecare cuvânt: "există în română?" Dacă ai dubii, reformulează.

2. **ORDINEA CUVINTELOR ÎN ROMÂNĂ**
   - Adjectivul posesiv (noastră, sa, etc.) vine DIRECT DUPĂ substantiv articulat
   - ✅ CORECT: "colecția noastră de inele de logodnă", "inelele noastre de logodnă"
   - ❌ GREȘIT: "colecția de inele de logodnă noastră", "inelele de logodnă noastre"
   - Regulă: [substantiv articulat] + [adjectiv posesiv] + [de/pentru/cu] + [complement]

3. **ACORD GRAMATICAL IMPECABIL**
   - Verb-subiect, adjectiv-substantiv, articol-substantiv
   - La ezitare, reformulează propoziția mai simplu

4. **DIACRITICE CORECTE**: ă, â, î, ș, ț unde e cazul.

5. **STRUCTURA TEHNICĂ**
   - Fara repetitii — niciun cuvant cheie mai mult de 3-4 ori în total
   - NU include <h1>, <html>, <body>, <head>
   - HTML valid (tag-uri închise corect)
   - Folosiri naturale keyword: H2 + primul paragraf + CTA final (3 total)
   - Ton: profesionist, informativ, fără superlative gratuite

RĂSPUNDE DOAR CU HTML-UL, FĂRĂ EXPLICAȚII, FĂRĂ MARKDOWN CODE BLOCKS.`
    : `Write an SEO HTML description for the "${keyword}" collection (category: "${category}"). Use this structure: <h2>Intro</h2><p>2-3 sentences with keyword natural</p><h2>Why choose our ${keyword} collection</h2><ul><li>4 bullets of benefits</li></ul><h2>How to choose the right ${keyword}</h2><p>2-3 sentences of practical advice</p><p>CTA with fast shipping.</p>. Rules: grammatically correct, no repetitions, no H1, valid HTML only.`;

  const content = await callAnthropic(
    apiKey,
    resolvedModel,
    language === "ro"
      ? `Ești copywriter SEO nativ român, cu 10+ ani experiență în eCommerce. Scrii EXCLUSIV în limba română curată, naturală, gramatical perfectă.

⚠️ REGULI CRITICE:
1. NU inventa cuvinte. Dacă nu știi un cuvânt românesc exact, reformulează cu cuvinte simple care EXISTĂ în DEX.
2. NU folosi calcuri din engleză (ex: "crafitate" — nu există în română; folosește "lucrate cu atenție").
3. Ordinea cuvintelor: adjectivul posesiv (noastră, sa) vine imediat după substantivul articulat. CORECT: "colecția noastră de X", "inelele noastre de X". GREȘIT: "colecția de X noastră", "inelele de X noastre".
4. Acordul gramatical: verb-subiect, adjectiv-substantiv, articol-substantiv — totul corect.
5. Diacritice corecte (ă, â, î, ș, ț).
6. Fluență naturală — cum ar scrie un copywriter român educat, nu o traducere.

Răspunzi DOAR cu HTML-ul cerut, fără explicații, fără ghilimele, fără markdown blocks.`
      : "You are an expert SEO copywriter. Write only the requested HTML, no explanations, no markdown code blocks.",
    userPrompt,
    800
  );

  // Strip markdown code blocks if AI added them
  return content.trim().replace(/^```html?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
}

// ─── UTILS ───
function slugify(str) {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 50);
}
