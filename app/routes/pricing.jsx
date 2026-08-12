// app/routes/pricing.jsx
// Kimono SEO — Public Pricing Page

export const meta = () => [
  { title: "Prețuri — Kimono SEO" },
  { name: "description", content: "Planuri SEO pentru magazine Shopify & WooCommerce. Trial gratuit $10 credit." },
];

const PLANS = [
  {
    id:    "TRIAL",
    label: "Trial",
    price: "Gratuit",
    sub:   "14 zile · $10 credit LLM",
    color: "#6B7280",
    features: [
      "Toate cele 19 funcții SEO disponibile",
      "$10 credit AI pentru testare",
      "1 magazin Shopify sau WooCommerce",
      "100 produse",
      "5 articole blog generate",
      "200 enrichment-uri keyword",
      "Fără card de credit",
    ],
    cta:       "Începe Trial",
    href:      "/register",
    highlight: false,
  },
  {
    id:    "STARTER",
    label: "Starter",
    price: "$29",
    sub:   "/ lună",
    color: "#3B82F6",
    features: [
      "1 magazin Shopify sau WooCommerce",
      "500 produse",
      "On-Page Audit AI",
      "SEO Engine (taxonomie + tag)",
      "Keyword Enrichment (1.000/lună)",
      "Blog Generator (50 articole/lună)",
      "LLMs.txt Generator",
      "Redirect Manager",
      "Robots Audit",
      "FAQ / PAA Generator",
      "GA4 AI Traffic Analysis",
    ],
    cta:       "Alege Starter",
    href:      "/register?plan=STARTER",
    highlight: false,
  },
  {
    id:    "GROWTH",
    label: "Growth",
    price: "$79",
    sub:   "/ lună",
    color: "#10B981",
    badge: "Recomandat",
    features: [
      "3 magazine Shopify / WooCommerce",
      "5.000 produse",
      "Toate funcțiile Starter",
      "Content Decay Monitor",
      "LLM Sentiment Tracker",
      "Brand SERP Manager",
      "Cannibalization Detector",
      "Core Web Vitals Monitor",
      "Crawl Budget Optimizer",
      "Keyword Enrichment (5.000/lună)",
      "Blog Generator (200 articole/lună)",
      "Suport prioritar",
    ],
    cta:       "Alege Growth",
    href:      "/register?plan=GROWTH",
    highlight: true,
  },
  {
    id:    "AGENCY",
    label: "Agency",
    price: "$199",
    sub:   "/ lună",
    color: "#8B5CF6",
    features: [
      "15 magazine Shopify / WooCommerce",
      "Produse nelimitate",
      "Toate funcțiile Growth",
      "Competitor Gap Analysis",
      "Intent Shift Detection",
      "Citation & Mention Monitor",
      "Bing AI Performance",
      "Blog & keywords nelimitat",
      "Acces API",
      "Rapoarte white-label",
      "Account manager dedicat",
    ],
    cta:       "Alege Agency",
    href:      "/register?plan=AGENCY",
    highlight: false,
  },
];

const FEATURES_TABLE = [
  { group: "Core SEO",        items: [
    { label: "On-Page Audit AI",            starter: true,  growth: true,  agency: true  },
    { label: "SEO Engine (taxonomie)",       starter: true,  growth: true,  agency: true  },
    { label: "Keyword Enrichment",           starter: "1K",  growth: "5K",  agency: "∞"   },
    { label: "Blog Generator",               starter: "50",  growth: "200", agency: "∞"   },
    { label: "LLMs.txt Generator",           starter: true,  growth: true,  agency: true  },
    { label: "Redirect Manager",             starter: true,  growth: true,  agency: true  },
    { label: "Robots Audit",                 starter: true,  growth: true,  agency: true  },
    { label: "FAQ / PAA Generator",          starter: true,  growth: true,  agency: true  },
    { label: "GA4 AI Traffic Analysis",      starter: true,  growth: true,  agency: true  },
  ]},
  { group: "Advanced SEO",   items: [
    { label: "Content Decay Monitor",        starter: false, growth: true,  agency: true  },
    { label: "LLM Sentiment Tracker",        starter: false, growth: true,  agency: true  },
    { label: "Brand SERP Manager",           starter: false, growth: true,  agency: true  },
    { label: "Cannibalization Detector",     starter: false, growth: true,  agency: true  },
    { label: "Core Web Vitals Monitor",      starter: false, growth: true,  agency: true  },
    { label: "Crawl Budget Optimizer",       starter: false, growth: true,  agency: true  },
  ]},
  { group: "Agency Features", items: [
    { label: "Competitor Gap Analysis",      starter: false, growth: false, agency: true  },
    { label: "Intent Shift Detection",       starter: false, growth: false, agency: true  },
    { label: "Citation & Mention Monitor",   starter: false, growth: false, agency: true  },
    { label: "Bing AI Performance",          starter: false, growth: false, agency: true  },
    { label: "Rapoarte white-label",         starter: false, growth: false, agency: true  },
    { label: "Acces API",                    starter: false, growth: false, agency: true  },
  ]},
];

const S = {
  page:    { fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", background: "#F9FAFB", minHeight: "100vh" },
  hero:    { textAlign: "center", padding: "72px 24px 40px", maxWidth: "720px", margin: "0 auto" },
  h1:      { fontSize: "42px", fontWeight: "800", color: "#111827", margin: "0 0 16px", letterSpacing: "-0.03em" },
  sub:     { fontSize: "18px", color: "#6B7280", lineHeight: "1.6" },
  badge:   { display: "inline-block", background: "#FEF3C7", color: "#92400E", padding: "4px 12px", borderRadius: "20px", fontSize: "13px", fontWeight: "600", marginBottom: "20px" },
  grid:    { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "24px", maxWidth: "1100px", margin: "0 auto", padding: "0 24px 60px" },
  card:    (highlight) => ({
    background: "#fff", border: `2px solid ${highlight ? "#10B981" : "#E5E7EB"}`, borderRadius: "16px",
    padding: "32px 28px", position: "relative",
    boxShadow: highlight ? "0 8px 32px rgba(16,185,129,0.15)" : "0 1px 4px rgba(0,0,0,0.06)",
  }),
  cardBadge: { position: "absolute", top: "-13px", left: "50%", transform: "translateX(-50%)", background: "#10B981", color: "#fff", padding: "4px 16px", borderRadius: "20px", fontSize: "12px", fontWeight: "700", whiteSpace: "nowrap" },
  planLabel: (color) => ({ fontSize: "13px", fontWeight: "700", color, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "8px" }),
  price:   { fontSize: "42px", fontWeight: "800", color: "#111827", letterSpacing: "-0.03em" },
  priceSub:{ fontSize: "15px", color: "#6B7280", marginLeft: "4px" },
  ul:      { listStyle: "none", padding: 0, margin: "24px 0 28px", display: "flex", flexDirection: "column", gap: "10px" },
  li:      { fontSize: "14px", color: "#374151", display: "flex", alignItems: "flex-start", gap: "8px" },
  check:   (ok) => ({ flexShrink: 0, fontSize: "16px", color: ok ? "#10B981" : "#D1D5DB", marginTop: "1px" }),
  btn:     (highlight, color) => ({
    display: "block", width: "100%", padding: "13px", textAlign: "center",
    background: highlight ? "#10B981" : color,
    color: "#fff", border: "none", borderRadius: "10px",
    fontSize: "15px", fontWeight: "600", cursor: "pointer", textDecoration: "none",
    fontFamily: "inherit",
  }),
  tableWrap: { maxWidth: "900px", margin: "0 auto 80px", padding: "0 24px" },
  tableTitle:{ fontSize: "28px", fontWeight: "700", color: "#111827", textAlign: "center", marginBottom: "32px" },
  table:   { width: "100%", borderCollapse: "collapse", fontSize: "14px" },
  th:      { padding: "12px 16px", background: "#F9FAFB", borderBottom: "2px solid #E5E7EB", fontWeight: "700", color: "#374151", textAlign: "left" },
  thPlan:  (color) => ({ padding: "12px 16px", background: "#F9FAFB", borderBottom: "2px solid #E5E7EB", fontWeight: "700", color, textAlign: "center" }),
  tdGroup: { padding: "12px 16px", fontWeight: "700", color: "#111827", background: "#F3F4F6", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em" },
  td:      { padding: "11px 16px", borderBottom: "1px solid #F3F4F6", color: "#374151" },
  tdPlan:  { padding: "11px 16px", borderBottom: "1px solid #F3F4F6", textAlign: "center", color: "#374151" },
  nav:     { padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #E5E7EB", background: "#fff" },
  navLogo: { fontSize: "18px", fontWeight: "800", color: "#111827", textDecoration: "none" },
  navLogin:{ padding: "8px 18px", background: "#111827", color: "#fff", borderRadius: "8px", fontSize: "13px", fontWeight: "600", textDecoration: "none" },
};

function CheckIcon({ ok }) {
  if (ok === true)  return <span style={S.check(true)}>✓</span>;
  if (ok === false) return <span style={S.check(false)}>–</span>;
  return <span style={{ fontSize: "13px", color: "#10B981", fontWeight: "600" }}>{ok}</span>;
}

export default function Pricing() {
  return (
    <div style={S.page}>
      {/* Navbar */}
      <nav style={S.nav}>
        <a href="/" style={S.navLogo}>Kimono SEO</a>
        <a href="/login" style={S.navLogin}>Login</a>
      </nav>

      {/* Hero */}
      <div style={S.hero}>
        <div style={S.badge}>🚀 Trial gratuit — $10 credit, fără card</div>
        <h1 style={S.h1}>SEO complet pentru magazine Shopify & WooCommerce</h1>
        <p style={S.sub}>
          19 module AI — de la audit on-page la Brand SERP, Cannibalization și LLM Sentiment.
          Testează totul gratuit cu $10 credit, plătești doar dacă ești mulțumit.
        </p>
      </div>

      {/* Plan cards */}
      <div style={S.grid}>
        {PLANS.map((plan) => (
          <div key={plan.id} style={S.card(plan.highlight)}>
            {plan.badge && <div style={S.cardBadge}>{plan.badge}</div>}
            <div style={S.planLabel(plan.color)}>{plan.label}</div>
            <div>
              <span style={S.price}>{plan.price}</span>
              <span style={S.priceSub}>{plan.sub}</span>
            </div>
            <ul style={S.ul}>
              {plan.features.map((f) => (
                <li key={f} style={S.li}>
                  <span style={S.check(true)}>✓</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <a href={plan.href} style={S.btn(plan.highlight, plan.color)}>{plan.cta}</a>
          </div>
        ))}
      </div>

      {/* Comparison table */}
      <div style={S.tableWrap}>
        <div style={S.tableTitle}>Comparație detaliată</div>
        <table style={S.table}>
          <thead>
            <tr>
              <th style={S.th}>Funcție</th>
              <th style={S.thPlan("#3B82F6")}>Starter<br/><span style={{fontSize:"11px",fontWeight:"400"}}>$29/lună</span></th>
              <th style={S.thPlan("#10B981")}>Growth<br/><span style={{fontSize:"11px",fontWeight:"400"}}>$79/lună</span></th>
              <th style={S.thPlan("#8B5CF6")}>Agency<br/><span style={{fontSize:"11px",fontWeight:"400"}}>$199/lună</span></th>
            </tr>
          </thead>
          <tbody>
            {FEATURES_TABLE.map((group) => (
              <>
                <tr key={group.group}>
                  <td colSpan={4} style={S.tdGroup}>{group.group}</td>
                </tr>
                {group.items.map((item) => (
                  <tr key={item.label}>
                    <td style={S.td}>{item.label}</td>
                    <td style={S.tdPlan}><CheckIcon ok={item.starter}/></td>
                    <td style={S.tdPlan}><CheckIcon ok={item.growth}/></td>
                    <td style={S.tdPlan}><CheckIcon ok={item.agency}/></td>
                  </tr>
                ))}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer CTA */}
      <div style={{ textAlign: "center", padding: "0 24px 80px" }}>
        <p style={{ fontSize: "20px", fontWeight: "700", color: "#111827", marginBottom: "8px" }}>
          Gata să crești traficul organic?
        </p>
        <p style={{ color: "#6B7280", marginBottom: "24px" }}>
          Niciun card de credit. $10 credit trial. Anulezi oricând.
        </p>
        <a href="/register" style={{ ...S.btn(true, "#10B981"), display: "inline-block", width: "auto", padding: "14px 40px", fontSize: "16px" }}>
          Începe Trial Gratuit
        </a>
      </div>
    </div>
  );
}
