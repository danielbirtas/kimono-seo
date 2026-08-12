# Kimono SEO LLMs.txt Generator — Skill Reference

## Ce face modulul

Generează și publică `/llms.txt` conform standardului [llmstxt.org](https://llmstxt.org) + [llmrefs.com](https://llmrefs.com) pentru magazinele Shopify. Fișierul este citit zilnic de GPTBot, ClaudeBot, PerplexityBot și Bingbot.

---

## Arhitectura datelor

### Surse de date (în ordine de prioritate)

| Sursă | Date extrase | Fallback |
|-------|-------------|----------|
| `SeoProduct` (DB) | Toate produsele, `aiTag`, `aiSub` | Shopify API direct |
| `SeoAudit` (DB) | `productHandle`, `metaTitle`, `metaDescription` | Fetch batch din Shopify API |
| `BlogArticle` (DB) | Articole publicate, `urlSlug`, `metaDescription` | — |
| Shopify `shop.json` | Nume magazin, domeniu, `meta_description`, email, currency | shopDomain |
| Shopify `pages.json` | Pagini informationale (About, Contact, Politici) | — |
| Shopify `custom_collections.json` | Toate colecțiile custom | — |
| Shopify `smart_collections.json` | Toate colecțiile smart (Sale, New Arrivals) | — |
| Shopify `products.json` | Handle-uri pentru produsele fără SeoAudit | — |
| Claude API (Sonnet) | `storeBlockquote`, `storeSummary` | Fallback text hardcodat |

### Gap critic — produse fără SeoAudit

Produsele din `SeoProduct` au handle-uri valide **doar dacă On-Page Audit (#02) a rulat**. Dacă nu:
- Sistemul face un fetch batch din Shopify API (`products.json?ids=...`) pentru a recupera handle-urile
- Produsele cu handle numeric pur (`^\d+$`) sunt **excluse** din fișier
- Railway logs: `[LLMs.txt] X products missing handle — fetching from Shopify`

### Când sunt datele complete

```
✓ On-Page Audit rulat → handles din SeoAudit (optim, descrieri SEO complete)
✓ Blog Generator publicat articole → articole în fișier
✓ Shopify are colecții definite → secțiuni colecții complete
✗ Fără On-Page Audit → handles din Shopify API direct (titluri, fără meta descrieri)
```

---

## Structura fișierului generat

```markdown
# Brand Name                          ← H1, singurul din fișier
> One sentence blockquote             ← Ce vinde magazinul
Description paragraph                 ← Audiență, categorii, piață
LLM note                              ← Context pentru AI crawlers

## Navigare Principală
- [Homepage](url): desc
- [Toate Produsele](url): desc
- [Coș](url): desc

## Categorii de Produse               ← Toate colecțiile (custom + smart)
- [Colecție](url): desc

## Produse: {aiTag}                   ← Per categorie (din aiTag SeoProduct)
- [Titlu produs](url): meta desc

## Produse Disponibile                ← Produse fără categorie aiTag
- [Titlu](url): desc

## Reduceri și Oferte                 ← Dacă există colecție cu handle/reduc|sale
- [Sale collection](url): desc
- [Produs în reducere](url): desc

## Noutăți                            ← Dacă există colecție cu handle/nout|new
- [New arrivals](url): desc

## Articole și Ghiduri                ← Toate articolele BlogArticle published
- [Blog](url): desc
- [Articol](url): meta desc

## Informații și Suport               ← Pagini filtrate după regex
- [About](url)
- [Contact](url)

---
This file was automatically generated for {domain} using Kimono SEO
```

---

## Secțiuni editabile în UI

Fiecare secțiune are `id` unic și poate fi:
- **Editată inline** — titlu, link-uri (title + url + desc)
- **Regenerată cu AI** — Claude rescrie descrierile, păstrând URL-urile
- **Reordonată** (TODO: drag & drop)

### Tipuri de secțiuni

| type | Descriere | Regenerabilă cu AI |
|------|-----------|-------------------|
| `header` | Brand, tagline, description, llmNote | — (edit manual) |
| `nav` | Core navigation (3 linkuri fixe) | ✓ |
| `collections` | Toate colecțiile Shopify | ✓ |
| `category` | Produse per aiTag | ✓ |
| `products` | Produse fără categorie | ✓ |
| `sale` | Colecție reduceri + produse | ✓ |
| `new` | New arrivals | ✓ |
| `blog` | Articole blog | ✓ |
| `info` | Pagini informationale | ✓ |

---

## Score completitudine (0-100)

| Criteriu | Puncte maxime | Condiție full score |
|----------|--------------|---------------------|
| Brand Name | 10 | `brandName.length > 2` |
| Tagline | 10 | `tagline.length > 10` |
| Description | 10 | `description.length > 30` |
| Produse | 25 | ≥ 50 produse cu handle valid |
| Colecții | 15 | ≥ 10 colecții |
| Articole blog | 15 | ≥ 10 articole publicate |
| Pagini info | 10 | ≥ 3 pagini (About + Contact + Politici) |
| Secțiune Sale | 5 | Colecție reduceri detectată |

---

## Fișiere relevante

```
app/lib/seo/llmstxt-generator.server.js  — logica completă
  ├── fetchStoreData()        — toate sursele de date
  ├── buildSections()         — construiește array de secțiuni
  ├── sectionsToMarkdown()    — renderizează markdown final
  ├── computeScore()          — calculează scorul 0-100
  ├── regenerateSection()     — AI per secțiune
  ├── saveSections()          — salvare edits din UI
  └── generateAndPublishLlmsTxt() — funcția principală

app/routes/api.llmstxt.js               — API endpoints
  ├── GET  /api/llmstxt       — fetch curent + history
  ├── POST generate           — generare completă
  ├── POST regenerate_section — AI per secțiune
  ├── POST save_sections      — salvare edits
  └── POST restore_history    — revert la versiune anterioară

app/routes/app.llmstxt.jsx              — UI editor
```

---

## Modele Prisma folosite

```prisma
model LlmsTxt {
  storeId        String   @unique
  content        String   @db.Text     // markdown complet (toate produsele)
  sections       String   @db.Text     // JSON array secțiuni pentru UI
  score          Int                   // 0-100
  publishedAt    DateTime?
  shopifyFileUrl String?               // URL Shopify Files API
  history        LlmsTxtHistory[]
}

model LlmsTxtHistory {
  llmsTxtId String
  content   String @db.Text
  score     Int
  createdAt DateTime
  // Păstrează ultimele 5 versiuni
}
```

---

## Auto-refresh triggers

LLMs.txt se regenerează automat la:
1. **Publish articol blog** — în `publishToShopify()` din `article-generator.server.js`
2. **Product update webhook** — în `webhooks.products.update.jsx`
3. **Manual** — buton "Regenerate" în UI

Toate auto-refresh-urile sunt **fire-and-forget** (non-fatal) — nu blochează operația principală.

---

## Publish Shopify Files API

Fișierul se publică via GraphQL mutation `fileCreate` cu:
- `filename: "llms.txt"`
- `mimeType: "text/plain"`
- `originalSource: "data:text/plain;base64,{base64content}"`

URL-ul rezultat (CDN Shopify) se salvează în `LlmsTxt.shopifyFileUrl`.

**Notă:** Shopify nu suportă `/llms.txt` ca route nativă — URL-ul real e pe CDN (`cdn.shopify.com/shop/files/llms.txt`). Pentru URL canonic `/llms.txt`, e nevoie de App Proxy sau redirect în temă (feature viitor).

---

## Debugging

Railway logs la generare:
```
[LLMs.txt] Generating for vivimall.ro
[LLMs.txt] 3 products missing handle — fetching from Shopify
[LLMs.txt] Data: 245 products (241 with handles), 12 articles, shop: Vivimall.ro
[LLMs.txt] Done — score: 87, 15420 chars, 11 sections
```

Probleme comune:
- **Score mic la produse** → On-Page Audit nu a rulat, produsele nu au metaDescription
- **Colecții lipsă** → Magazinul nu are colecții definite în Shopify
- **Articole lipsă** → Blog Generator nu a publicat articole încă
- **shopifyFileUrl null** → Scop `write_files` lipsă din app scopes (verifică `shopify.app.toml`)
