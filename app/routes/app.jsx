// app/routes/app.jsx — Kimono SEO App Shell
import { Outlet, Form, useLoaderData, NavLink } from "react-router";
import { requireAuth } from "../lib/auth/index.server.js";
import { gateCurrentRoute } from "../lib/plan-gate.server.js";

/* ── loader (unchanged) ─────────────────────────────────── */
export const loader = async ({ request }) => {
  const { user, connection, store } = await requireAuth(request);
  if (connection?.shopDomain) {
    await gateCurrentRoute(request, connection.shopDomain);
  }
  return {
    user:       { id: user.id, email: user.email, name: user.name, plan: user.plan ?? "TRIAL" },
    shopDomain: connection?.shopDomain || null,
    shopName:   store?.shopName || connection?.shopDomain || null,
  };
};

/* ── links ──────────────────────────────────────────────── */
export const links = () => [
  { rel: "stylesheet", href: "/app.css?v=5" },
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700;800;900&family=Geist+Mono:wght@400;500;600&family=Instrument+Serif:ital@0;1&display=swap",
  },
];

/* ── inline SVG icons ───────────────────────────────────── */
const Icon = {
  dashboard: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <rect x="3" y="3" width="7" height="9" rx="1"/>
      <rect x="14" y="3" width="7" height="5" rx="1"/>
      <rect x="14" y="12" width="7" height="9" rx="1"/>
      <rect x="3" y="16" width="7" height="5" rx="1"/>
    </svg>
  ),
  activity: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
    </svg>
  ),
  queue: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M3 6h18M3 12h18M3 18h18"/>
    </svg>
  ),
  seoEngine: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="m21 21-4.3-4.3"/><circle cx="11" cy="11" r="8"/>
      <path d="M8 11h6M11 8v6"/>
    </svg>
  ),
  blog: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M19 4H5a2 2 0 0 0-2 2v14l4-4h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/>
    </svg>
  ),
  schema: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
    </svg>
  ),
  ai: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M12 3v2m0 14v2m-7-9H3m18 0h-2m-1.5-6.5L16 7m-8-1.5L6.5 7m11 10l-1.5-1.5M8 18.5L6.5 17"/>
      <circle cx="12" cy="12" r="4"/>
    </svg>
  ),
  analytics: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M3 3v18h18"/><path d="M18 17V9M13 17V5M8 17v-3"/>
    </svg>
  ),
  competitors: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
    </svg>
  ),
  brand: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
    </svg>
  ),
  knowledge: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <circle cx="12" cy="12" r="3"/>
      <path d="M12 1v6M12 17v6M4.22 4.22l4.24 4.24M15.54 15.54l4.24 4.24M1 12h6M17 12h6M4.22 19.78l4.24-4.24M15.54 8.46l4.24-4.24"/>
    </svg>
  ),
  logout: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
      <polyline points="16 17 21 12 16 7"/>
      <line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  ),
  hexagon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2 L3 7 L3 17 L12 22 L21 17 L21 7 Z"/>
      <path d="M12 22 L12 12"/><path d="M3 7 L12 12 L21 7"/>
    </svg>
  ),
  shopHex: (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2 L3 7 L3 17 L12 22 L21 17 L21 7 Z"/>
    </svg>
  ),
};

/* ── nav config ─────────────────────────────────────────── */
const NAV = [
  {
    label: "Workspace",
    items: [
      { to: "/app",            name: "Overview",       icon: Icon.dashboard, end: true },
      { to: "/app/activity",   name: "Activity",       icon: Icon.activity,  pill: "14", pillClass: "live" },
      { to: "/app/queue",      name: "Action Queue",   icon: Icon.queue,     pill: "7",  pillClass: "warn" },
    ],
  },
  {
    label: "Scan & Audit",
    items: [
      { to: "/app/seo-engine",      name: "SEO Engine",       icon: Icon.seoEngine },
      { to: "/app/onpage",           name: "On-Page Audit",    icon: Icon.seoEngine, sub: true },
      { to: "/app/seo/keywords",     name: "Keywords",         icon: Icon.seoEngine, sub: true },
      { to: "/app/image-vision",     name: "Image Optimizer",  icon: Icon.seoEngine, sub: true },
      { to: "/app/link-health",      name: "Link Health",      icon: Icon.seoEngine, sub: true },
      { to: "/app/cannibalization",  name: "Cannibalization",  icon: Icon.seoEngine, sub: true },
      { to: "/app/crawl-budget",     name: "Crawl Budget",     icon: Icon.seoEngine, sub: true },
      { to: "/app/redirects",        name: "Redirects",        icon: Icon.seoEngine, sub: true },
      { to: "/app/robots",           name: "Robots Audit",     icon: Icon.seoEngine, sub: true },
      { to: "/app/cwv",              name: "Core Web Vitals",  icon: Icon.seoEngine, sub: true },
      { to: "/app/schema",           name: "Schema",           icon: Icon.schema },
      { to: "/app/schema-validator", name: "Schema Validator",  icon: Icon.schema, sub: true },
      { to: "/app/entity-seo",       name: "Entity SEO",        icon: Icon.schema, sub: true },
    ],
  },
  {
    label: "Content",
    items: [
      { to: "/app/content",            name: "Content & Blog",    icon: Icon.blog },
      { to: "/app/blog",               name: "Article Generator",  icon: Icon.blog, sub: true },
      { to: "/app/programmatic",        name: "Programmatic SEO",   icon: Icon.blog, sub: true },
      { to: "/app/faq",                 name: "FAQ / PAA",          icon: Icon.blog, sub: true },
      { to: "/app/content-decay",       name: "Content Decay",      icon: Icon.blog, sub: true },
      { to: "/app/topical-authority",   name: "Topical Authority",  icon: Icon.blog, sub: true },
    ],
  },
  {
    label: "AI Engines",
    items: [
      { to: "/app/ai-engines",         name: "AI Engines",          icon: Icon.ai, pill: "5" },
      { to: "/app/llmstxt",            name: "LLMs.txt",            icon: Icon.ai, sub: true },
      { to: "/app/eeat",               name: "E-E-A-T",             icon: Icon.ai, sub: true },
      { to: "/app/llm-sentiment",      name: "LLM Sentiment",       icon: Icon.ai, sub: true },
      { to: "/app/bing-ai",            name: "Bing AI",             icon: Icon.ai, sub: true },
      { to: "/app/zero-click",         name: "Zero-Click",          icon: Icon.ai, sub: true },
      { to: "/app/answer-confidence",  name: "Answer Confidence",   icon: Icon.ai, sub: true },
      { to: "/app/ga4",                name: "AI Traffic (GA4)",    icon: Icon.ai, sub: true },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { to: "/app/analytics",       name: "Analytics",         icon: Icon.analytics },
      { to: "/app/competitors",      name: "Competitors",       icon: Icon.competitors },
      { to: "/app/competitor-gap",   name: "Competitor Gap",    icon: Icon.competitors, sub: true },
      { to: "/app/brand",            name: "Brand & Monitor",   icon: Icon.brand },
      { to: "/app/brand-serp",       name: "Brand SERP",        icon: Icon.brand, sub: true },
      { to: "/app/citation-monitor", name: "Citations",         icon: Icon.brand, sub: true },
      { to: "/app/ai-citations",     name: "AI Citations",      icon: Icon.brand, sub: true },
      { to: "/app/intent-shift",     name: "Intent Shift",      icon: Icon.brand, sub: true },
      { to: "/app/pinterest",        name: "Pinterest SEO",     icon: Icon.brand, sub: true },
    ],
  },
  {
    label: "Reference",
    items: [
      { to: "/app/knowledge",    name: "Knowledge",     icon: Icon.knowledge },
      { to: "/app/settings",      name: "Settings",      icon: Icon.settings },
    ],
  },
];

/* ── component ──────────────────────────────────────────── */
export default function AppLayout() {
  const { user, shopDomain, shopName } = useLoaderData();

  const initials = (user.name || user.email || "?")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const orgInitials = (shopName || shopDomain || "?")
    .split(/[\.\s]+/)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <>
      {/* ──── TOPBAR ──── */}
      <header className="topbar">
        <div className="topbar-left">
          <div className="brand">
            <div className="brand-mark">{Icon.hexagon}</div>
            <span className="brand-name">Kimono SEO</span>
          </div>
          <div className="divider-v" />
          <div className="org-switcher">
            <div className="org-avatar">{orgInitials}</div>
            <span>{shopName || shopDomain || "No store"}</span>
            <svg className="chev" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m4 6 4 4 4-4"/>
            </svg>
          </div>
        </div>

        <div className="cmd-search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>
          </svg>
          <span className="cmd-search-text">Search...</span>
          <span className="kbd">⌘K</span>
        </div>

        <div className="topbar-right">
          <button className="icon-btn" title="Docs">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <path d="M14 2v6h6"/>
            </svg>
          </button>
          <button className="icon-btn" title="Notifications">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
              <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
            </svg>
            <span className="dot" />
          </button>
          <div className="avatar">{initials}</div>
        </div>
      </header>

      {/* ──── APP BODY (sidebar + main) ──── */}
      <div className="app">
        <aside className="sidebar">
          <nav>
            {NAV.map((section) => (
              <div className="nav-section" key={section.label}>
                <div className="nav-label">{section.label}</div>
                {section.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) => "nav-item" + (isActive ? " active" : "") + (item.sub ? " nav-sub" : "")}
                  >
                    {!item.sub && item.icon}
                    <span>{item.name}</span>
                    {item.pill && (
                      <span className={"nav-pill" + (item.pillClass ? " " + item.pillClass : "")}>
                        {item.pill}
                      </span>
                    )}
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>

          {/* ── sidebar footer ── */}
          <div className="sidebar-foot">
            <div className="shop-dot">{Icon.shopHex}</div>
            <div className="shop-meta">
              <div className="shop-meta-name">{shopDomain || "no store"}</div>
              <div className="shop-meta-plan">
                <span className="plan-pill">{user.plan}</span>
                <span>Products</span>
              </div>
            </div>

            <Form method="post" action="/logout">
              <button type="submit" className="nav-item" style={{ marginTop: 8, width: "100%" }}>
                {Icon.logout}
                <span>Logout</span>
              </button>
            </Form>
          </div>
        </aside>

        <main className="main">
          <Outlet />
        </main>
      </div>
    </>
  );
}

/* ── error boundary ─────────────────────────────────────── */
export function ErrorBoundary() {
  return (
    <div className="app">
      <main className="main" style={{ display: "grid", placeItems: "center", minHeight: "100vh" }}>
        <div style={{ textAlign: "center" }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 800, marginBottom: 12 }}>Something went wrong</h1>
          <p style={{ color: "var(--ink-3)", marginBottom: 24 }}>
            Try refreshing the page. If the problem persists, contact support.
          </p>
          <a href="/app" className="nav-item" style={{ display: "inline-flex" }}>← Back to Overview</a>
        </div>
      </main>
    </div>
  );
}
