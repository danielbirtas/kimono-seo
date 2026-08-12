import { redirect } from "react-router";
import { Link } from "react-router";
import { useEffect, useRef, useState } from "react";

export const loader = async ({ request }) => {
  try {
    const { getUser } = await import("../../lib/auth/session.server.js");
    const user = await getUser(request);
    if (user) throw redirect("/app");
  } catch (e) {
    if (e instanceof Response) throw e;
  }
  return null;
};

export const meta = () => [
  { title: "Kimono SEO — Platforma completă SEO, AEO & GEO pentru Shopify" },
  { name: "description", content: "Singura platformă SEO care acoperă 99.99% din munca ta. 36 module automate pentru SEO, AEO și GEO. Tu te ocupi de creștere, noi de restul." },
];

export const links = () => [
  { rel: "stylesheet", href: "/landing.css?v=2" },
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "true" },
  { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500;600&family=Instrument+Serif:ital@0;1&display=swap" },
];

const storyData = {
  vivimall: {
    title: "Vivimall · Kitchenware",
    sub: "Ianuarie — Aprilie 2026 · GA4 confirmed",
    big: "142",
    bigLbl: "Trafic organic vs. perioada anterioară",
    kpis: [
      {lbl:"Sesiuni",val:"48,284",dt:"↑ 142%"},
      {lbl:"AI Citations",val:"3,412",dt:"↑ 248%"},
      {lbl:"Revenue RON",val:"184K",dt:"↑ 184%"},
      {lbl:"ROI",val:"37x",dt:"investiţie recuperată"}
    ],
    path: "0,200 72,196 144,184 216,174 288,152 360,134 432,114 504,88 576,68 648,44 720,22",
    areaPath: "0,200 72,196 144,184 216,174 288,152 360,134 432,114 504,88 576,68 648,44 720,22 720,220 0,220",
    endX: 720, endY: 22
  },
  moda: {
    title: "NoaModa · Fashion",
    sub: "Decembrie 2025 — Martie 2026 · GA4 confirmed",
    big: "98",
    bigLbl: "Trafic organic vs. perioada anterioară",
    kpis: [
      {lbl:"Sesiuni",val:"22,840",dt:"↑ 98%"},
      {lbl:"AI Citations",val:"1,284",dt:"↑ 142%"},
      {lbl:"Revenue RON",val:"128K",dt:"↑ 124%"},
      {lbl:"ROI",val:"22x",dt:"investiţie recuperată"}
    ],
    path: "0,200 72,198 144,192 216,184 288,168 360,154 432,134 504,118 576,98 648,78 720,58",
    areaPath: "0,200 72,198 144,192 216,184 288,168 360,154 432,134 504,118 576,98 648,78 720,58 720,220 0,220",
    endX: 720, endY: 58
  },
  tech: {
    title: "PixelHub · Electronics",
    sub: "Noiembrie 2025 — Februarie 2026 · GA4 confirmed",
    big: "212",
    bigLbl: "Trafic organic vs. perioada anterioară",
    kpis: [
      {lbl:"Sesiuni",val:"38,420",dt:"↑ 212%"},
      {lbl:"AI Citations",val:"2,840",dt:"↑ 384%"},
      {lbl:"Revenue RON",val:"248K",dt:"↑ 268%"},
      {lbl:"ROI",val:"54x",dt:"investiţie recuperată"}
    ],
    path: "0,210 72,208 144,200 216,184 288,160 360,124 432,92 504,64 576,42 648,24 720,10",
    areaPath: "0,210 72,208 144,200 216,184 288,160 360,124 432,92 504,64 576,42 648,24 720,10 720,220 0,220",
    endX: 720, endY: 10
  },
  beauty: {
    title: "SkinLab · Beauty & Wellness",
    sub: "Decembrie 2025 — Martie 2026 · GA4 confirmed",
    big: "167",
    bigLbl: "Trafic organic vs. perioada anterioară",
    kpis: [
      {lbl:"Sesiuni",val:"18,240",dt:"↑ 167%"},
      {lbl:"AI Citations",val:"2,148",dt:"↑ 420%"},
      {lbl:"Conv. rate AI",val:"6.2%",dt:"vs. 1.4% organic"},
      {lbl:"ROI",val:"28x",dt:"investiţie recuperată"}
    ],
    path: "0,202 72,200 144,192 216,178 288,160 360,140 432,116 504,92 576,68 648,48 720,32",
    areaPath: "0,202 72,200 144,192 216,178 288,160 360,140 432,116 504,92 576,68 648,48 720,32 720,220 0,220",
    endX: 720, endY: 32
  }
};


export default function LandingPage() {
  const [activeStory, setActiveStory] = useState("vivimall");
  const [pricingPeriod, setPricingPeriod] = useState("monthly");
  const [openFaq, setOpenFaq] = useState(null);
  const [navScrolled, setNavScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setNavScrolled(window.scrollY > 10);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add("fade-in-up");
          observer.unobserve(entry.target);
        }
      });
    }, {threshold: 0.12, rootMargin: "0px 0px -60px 0px"});

    document.querySelectorAll(".unique-card, .testimonial, .price-card, .story-card").forEach(el => {
      el.style.opacity = "0";
      observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  const scrollTo = (e, href) => {
    if (!href || href === "#" || href.length <= 1) return;
    const target = document.querySelector(href);
    if (target) {
      e.preventDefault();
      window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - 80, behavior: "smooth" });
    }
  };

  const story = storyData[activeStory];

  return (
    <>
{/* NAVIGATION */}
<nav className={`nav ${navScrolled ? "scrolled" : ""}`} id="nav">
  <div className="nav-inner">
    <a href="#" className="nav-brand">
      <span className="logo-mark">U</span>
      Ultimate<em>SEO</em>
    </a>
    <ul className="nav-links">
      <li><a href="#features" className="nav-link" onClick={(e) => scrollTo(e, "#features")}>Platforma</a></li>
      <li><a href="#results" className="nav-link" onClick={(e) => scrollTo(e, "#results")}>Rezultate</a></li>
      <li><a href="#compare" className="nav-link" onClick={(e) => scrollTo(e, "#compare")}>Comparație</a></li>
      <li><a href="#pricing" className="nav-link" onClick={(e) => scrollTo(e, "#pricing")}>Prețuri</a></li>
      <li><a href="#faq" className="nav-link" onClick={(e) => scrollTo(e, "#faq")}>FAQ</a></li>
    </ul>
    <div className="nav-cta">
      <a href="/login" className="btn btn-ghost">Sign in</a>
      <a href="#pricing" className="btn btn-primary">
        Începe gratis
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
      </a>
    </div>
  </div>
</nav>

{/* HERO */}
<section className="hero">
  <div className="hero-bg">
    <div className="hero-grid-bg"></div>
  </div>
  <div className="container">
    <div className="hero-inner">

      <div>
        <div className="hero-badge">
          <span className="hero-badge-pill">NOU</span>
          <span>36 module · SEO + AEO + GEO · toate într-o platformă</span>
        </div>
        <h1 className="hero-title">
          Platforma ta SEO face <em>99.99%</em><br />
          din muncă. Tu închizi <em className="accent">deals</em>.
        </h1>
        <p className="hero-sub">
          Kimono SEO e <b>singura platformă</b> care automatizează complet SEO, AEO și GEO pentru Shopify.
          36 module lucrează <b>24/7</b> — keyword research, schema, clustere blog, llms.txt, citări AI, triage, audit tehnic.
          Tu te concentrezi pe creștere. Noi facem restul.
        </p>
        <div className="hero-actions">
          <a href="#pricing" className="btn btn-primary btn-lg">
            Începe 14 zile gratis
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </a>
          <a href="#demo" className="btn btn-ghost btn-lg">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            Vezi demo (2 min)
          </a>
        </div>
        <div className="hero-trust">
          <div className="hero-trust-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><polyline points="20 6 9 17 4 12"/></svg>
            Fără card
          </div>
          <span className="hero-trust-sep">·</span>
          <div className="hero-trust-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><polyline points="20 6 9 17 4 12"/></svg>
            Setup 5 minute
          </div>
          <span className="hero-trust-sep">·</span>
          <div className="hero-trust-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><polyline points="20 6 9 17 4 12"/></svg>
            Cancel oricând
          </div>
        </div>
      </div>

      <div className="hero-preview">
        <div className="preview-head">
          <div className="preview-dots">
            <span className="preview-dot r"></span>
            <span className="preview-dot y"></span>
            <span className="preview-dot g"></span>
          </div>
          <div className="preview-url">app.ultimateseo.io/dashboard</div>
          <div className="preview-meta">LIVE</div>
        </div>
        <div className="preview-body">

          <div className="preview-kpis">
            <div className="preview-kpi">
              <div className="preview-kpi-lbl">Trafic organic</div>
              <div className="preview-kpi-val">48,284</div>
              <div className="preview-kpi-dt">↑ 142% · 90d</div>
            </div>
            <div className="preview-kpi">
              <div className="preview-kpi-lbl">Conversii</div>
              <div className="preview-kpi-val">1,352</div>
              <div className="preview-kpi-dt">↑ 58% · 90d</div>
            </div>
            <div className="preview-kpi">
              <div className="preview-kpi-lbl">Revenue</div>
              <div className="preview-kpi-val">184K</div>
              <div className="preview-kpi-dt">↑ 184% · 90d</div>
            </div>
          </div>

          <div className="preview-title-bar">
            <h4>Action queue — 5 active</h4>
            <span className="meta">real-time</span>
          </div>

          <div className="preview-row">
            <div className="preview-icon green">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <div className="preview-main">
              <div className="preview-title">Schema Product regenerată — 218 produse</div>
              <div className="preview-sub">tigai-fonta collection · acum 2 min</div>
            </div>
            <span className="preview-badge up">AUTO</span>
          </div>

          <div className="preview-row">
            <div className="preview-icon purple">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44"/></svg>
            </div>
            <div className="preview-main">
              <div className="preview-title">llms.txt sincronizat · 247 links</div>
              <div className="preview-sub">Perplexity + ChatGPT + Claude · acum 11 min</div>
            </div>
            <span className="preview-badge info">AEO</span>
          </div>

          <div className="preview-row">
            <div className="preview-icon blue">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/></svg>
            </div>
            <div className="preview-main">
              <div className="preview-title">Articol generat: „cum alegi tigaia perfecta"</div>
              <div className="preview-sub">2,140 cuvinte · conf 87/100 · acum 34 min</div>
            </div>
            <span className="preview-badge up">+C</span>
          </div>

          <div className="preview-row">
            <div className="preview-icon amber">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86"/><line x1="12" y1="9" x2="12" y2="13"/></svg>
            </div>
            <div className="preview-main">
              <div className="preview-title">Content decay detectat — 7 articole</div>
              <div className="preview-sub">refresh recomandat · -14.2% trafic 30d</div>
            </div>
            <span className="preview-badge dn">P1</span>
          </div>

          <div className="preview-row">
            <div className="preview-icon green">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 12a9 9 0 1 1-6.2-8.6"/></svg>
            </div>
            <div className="preview-main">
              <div className="preview-title">IndexNow submitted · 1,284 URLs</div>
              <div className="preview-sub">Bing + Yandex · 99.8% success · acum 1h</div>
            </div>
            <span className="preview-badge up">LIVE</span>
          </div>
        </div>

        {/* Floating secondary card */}
        <div className="hero-float">
          <div className="hero-float-head">
            <span className="hero-float-pulse"></span>
            <span className="hero-float-title">AI Citations · 30d</span>
          </div>
          <div className="hero-float-big">3,412<em> citări</em></div>
          <div className="hero-float-sub">Copilot, Perplexity, ChatGPT, Gemini, Claude</div>
        </div>
      </div>

    </div>
  </div>
</section>

{/* MARQUEE */}
<section className="marquee-section">
  <div className="container">
    <div className="marquee-label">Integrare nativă cu platformele tale</div>
  </div>
  <div className="marquee-wrap">
    <div className="marquee">
      <span className="marquee-item bold">Shopify</span>
      <span className="marquee-item">·</span>
      <span className="marquee-item mono">GA4</span>
      <span className="marquee-item">·</span>
      <span className="marquee-item bold">Google Search Console</span>
      <span className="marquee-item">·</span>
      <span className="marquee-item mono">DataForSEO</span>
      <span className="marquee-item">·</span>
      <span className="marquee-item bold">Judge.me</span>
      <span className="marquee-item">·</span>
      <span className="marquee-item mono">Loox</span>
      <span className="marquee-item">·</span>
      <span className="marquee-item bold">Klaviyo</span>
      <span className="marquee-item">·</span>
      <span className="marquee-item mono">Bing Webmaster</span>
      <span className="marquee-item">·</span>
      <span className="marquee-item bold">IndexNow</span>
      <span className="marquee-item">·</span>
      <span className="marquee-item mono">Anthropic API</span>
      <span className="marquee-item">·</span>
      <span className="marquee-item bold">OpenAI</span>
      <span className="marquee-item">·</span>
      {/* duplicate for seamless loop */}
      <span className="marquee-item bold">Shopify</span>
      <span className="marquee-item">·</span>
      <span className="marquee-item mono">GA4</span>
      <span className="marquee-item">·</span>
      <span className="marquee-item bold">Google Search Console</span>
      <span className="marquee-item">·</span>
      <span className="marquee-item mono">DataForSEO</span>
      <span className="marquee-item">·</span>
      <span className="marquee-item bold">Judge.me</span>
      <span className="marquee-item">·</span>
      <span className="marquee-item mono">Loox</span>
      <span className="marquee-item">·</span>
      <span className="marquee-item bold">Klaviyo</span>
      <span className="marquee-item">·</span>
      <span className="marquee-item mono">Bing Webmaster</span>
      <span className="marquee-item">·</span>
      <span className="marquee-item bold">IndexNow</span>
      <span className="marquee-item">·</span>
      <span className="marquee-item mono">Anthropic API</span>
      <span className="marquee-item">·</span>
      <span className="marquee-item bold">OpenAI</span>
    </div>
  </div>
</section>

{/* STATS BAR */}
<section className="stats-bar">
  <div className="container">
    <div className="stats-bar-grid">
      <div className="stat-big">
        <div className="stat-big-num"><em>36</em></div>
        <div className="stat-big-lbl">Module automate care rulează 24/7</div>
      </div>
      <div className="stat-big">
        <div className="stat-big-num">142<span className="stat-big-unit">%</span></div>
        <div className="stat-big-lbl">Creștere medie trafic organic în 90 zile</div>
      </div>
      <div className="stat-big">
        <div className="stat-big-num">99.99<span className="stat-big-unit">%</span></div>
        <div className="stat-big-lbl">Din munca SEO, făcută de platformă</div>
      </div>
      <div className="stat-big">
        <div className="stat-big-num"><em>5</em></div>
        <div className="stat-big-lbl">AI Engines monitorizate (Copilot, Perplexity, GPT, Gemini, Claude)</div>
      </div>
    </div>
  </div>
</section>





{/* ========== UNIQUE FEATURES ========== */}
<section className="section unique-section" id="features">
  <div className="container">
    <div className="section-kicker">DIFERENȚIATORI</div>
    <h2 className="section-title">Ce face <em>nimeni altcineva</em>.</h2>
    <p className="section-sub">
      Ahrefs îți dă keyword-uri. SEMrush îți dă date. Nouă îți dă <b>rezultatul</b>.
      Platforma execută — nu doar raportează.
    </p>

    {/* Featured dark card (marquee feature) */}
    <div className="unique-grid">
      <div className="unique-featured">
        <div>
          <div className="unique-featured-kicker">AEO · GEO · primele pe piață</div>
          <h3>Optimizare pentru <em>AI engines</em>, nu doar pentru Google.</h3>
          <p>
            În 2026, 27% din trafic-ul tău poate veni din ChatGPT, Perplexity, Copilot, Gemini, Claude.
            Kimono SEO e singura platformă care optimizează activ pentru cele 5 AI engines: llms.txt auto-sync,
            answer confidence scoring, LLM sentiment tracking și AI traffic atribuit în GA4.
          </p>
          <div className="unique-featured-stats">
            <div>
              <div className="unique-featured-stat-n">3,412</div>
              <div className="unique-featured-stat-l">Citări AI / lună</div>
            </div>
            <div>
              <div className="unique-featured-stat-n">+184<span style={{"color":"#86efac"}}>%</span></div>
              <div className="unique-featured-stat-l">Revenue din AI traffic</div>
            </div>
            <div>
              <div className="unique-featured-stat-n"><em>4.2%</em></div>
              <div className="unique-featured-stat-l">Conv. rate din AI vs. 1.0% organic</div>
            </div>
          </div>
        </div>

        <div className="unique-featured-viz">
          <div className="featured-viz-head">
            <div className="featured-viz-title">Citări per AI Engine · 30 zile</div>
            <div className="featured-viz-meta">LIVE</div>
          </div>
          <div className="engine-bar">
            <div className="engine-bar-name"><span className="engine-bar-logo" style={{"background":"#0078d4"}}>CO</span>Copilot</div>
            <div className="engine-bar-track"><div className="engine-bar-fill" style={{"width":"98%"}}></div></div>
            <div className="engine-bar-val">1,847</div>
          </div>
          <div className="engine-bar">
            <div className="engine-bar-name"><span className="engine-bar-logo" style={{"background":"#20808d"}}>PX</span>Perplexity</div>
            <div className="engine-bar-track"><div className="engine-bar-fill" style={{"width":"62%"}}></div></div>
            <div className="engine-bar-val">892</div>
          </div>
          <div className="engine-bar">
            <div className="engine-bar-name"><span className="engine-bar-logo" style={{"background":"#0d7355"}}>GP</span>ChatGPT</div>
            <div className="engine-bar-track"><div className="engine-bar-fill" style={{"width":"40%"}}></div></div>
            <div className="engine-bar-val">487</div>
          </div>
          <div className="engine-bar">
            <div className="engine-bar-name"><span className="engine-bar-logo" style={{"background":"#4a5fd6"}}>GM</span>Gemini</div>
            <div className="engine-bar-track"><div className="engine-bar-fill" style={{"width":"22%"}}></div></div>
            <div className="engine-bar-val">231</div>
          </div>
          <div className="engine-bar">
            <div className="engine-bar-name"><span className="engine-bar-logo" style={{"background":"#cc785c"}}>CL</span>Claude</div>
            <div className="engine-bar-track"><div className="engine-bar-fill" style={{"width":"14%"}}></div></div>
            <div className="engine-bar-val">98</div>
          </div>
        </div>
      </div>
    </div>

    {/* Grid of 6 unique features */}
    <div className="unique-grid" style={{"marginTop":"20px"}}>

      <div className="unique-card">
        <div className="unique-icon green">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/></svg>
        </div>
        <h3 className="unique-title">Articole AI <em>conforme E-E-A-T</em></h3>
        <p className="unique-desc">
          Generator Claude Sonnet cu briefing, keyword target, confidence scoring și passage ranking per H2/H3.
          Fiecare articol publicat cu FAQ auto din PAA și schema Article + FAQPage.
        </p>
        <div className="unique-meta">
          <span><b>2,140</b> cuvinte medie</span>
          <span>Conf <b>87/100</b></span>
        </div>
      </div>

      <div className="unique-card">
        <div className="unique-icon purple">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="3"/><circle cx="5" cy="5" r="2"/><circle cx="19" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/></svg>
        </div>
        <h3 className="unique-title">Clustere blog <em>auto-planificate</em></h3>
        <p className="unique-desc">
          Pillar + satellites cu intent mapping, volum/KD din DataForSEO și conectare internă automată.
          Detectează gap-uri vs. competitori și propune pillari noi săptămânal.
        </p>
        <div className="unique-meta">
          <span>18 clustere · <b>84 articole</b></span>
          <span>72% coverage</span>
        </div>
      </div>

      <div className="unique-card">
        <div className="unique-icon amber">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
        </div>
        <h3 className="unique-title">Schema <em>validată live</em></h3>
        <p className="unique-desc">
          8 tipuri schema auto-generate: Product, Article, FAQPage, BreadcrumbList, Organization, WebSite+SearchAction, AggregateRating, HowTo.
          Validator continuu cu auto-fix pe erori P0/P1.
        </p>
        <div className="unique-illustration" dangerouslySetInnerHTML={{__html: `
<span className="com">// Product auto-generated</span>
<span className="hl">"@type"</span>: "Product",
<span className="hl">"aggregateRating"</span>: {
  <span className="hl">"ratingValue"</span>: 4.7,
  <span className="hl">"reviewCount"</span>: 142
}
        `}} />
      </div>

      <div className="unique-card">
        <div className="unique-icon blue">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 12a9 9 0 1 1-6.2-8.6"/></svg>
        </div>
        <h3 className="unique-title">Content Decay <em>detection</em></h3>
        <p className="unique-desc">
          Detectează articole care pierd pozitii înainte să pici din top 10.
          7 semnale: outdated data, intent shift, PAA shift, link equity, engagement drop, competitori refresh, backlink loss.
        </p>
        <div className="unique-meta">
          <span><b>7</b> articole alert acum</span>
          <span>Evit -14% trafic</span>
        </div>
      </div>

      <div className="unique-card">
        <div className="unique-icon dark">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>
        </div>
        <h3 className="unique-title">llms.txt <em>auto-sync</em></h3>
        <p className="unique-desc">
          Fișier llms.txt regenerat săptămânal din catalogul tău live. Publicat la /llms.txt cu ping IndexNow
          către Bing, Yandex și notifier AI crawlers.
        </p>
        <div className="unique-meta">
          <span>12 secțiuni · <b>247 links</b></span>
          <span>99.8% sync</span>
        </div>
      </div>

      <div className="unique-card">
        <div className="unique-icon pink">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
        </div>
        <h3 className="unique-title">LLM Sentiment <em>tracking</em></h3>
        <p className="unique-desc">
          Săptămânal interogăm cele 5 AI engines cu întrebări brand.
          Monitorizăm sentiment, asocieri pozitive și obiecții. Detectăm când narațiunea se schimbă.
        </p>
        <div className="unique-meta">
          <span>5 engines · <b>72% pozitiv</b></span>
          <span>12 asocieri top</span>
        </div>
      </div>

      <div className="unique-card unique-card-lg" style={{"gridColumn":"span 2"}}>
        <div className="unique-icon" style={{"background":"#f3e8ff","color":"#7c3aed"}}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="3"/><circle cx="19" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><path d="M7 17l3-3M17 7l-3 3"/></svg>
        </div>
        <h3 className="unique-title">Agentic Commerce — <em>MCP server dedicat</em></h3>
        <p className="unique-desc" style={{"maxWidth":"520px"}}>
          Primul ecosistem e-commerce expus ca MCP (Model Context Protocol) server.
          Agenții AI (ChatGPT Shopping, Claude, Perplexity Pro) pot descoperi produsele tale, compara, verifica stocul și genera carturi pre-populate.
          42 conversii lunare deja doar din agenți AI — AOV +18% față de web.
        </p>
        <div className="unique-illustration" dangerouslySetInnerHTML={{__html: `
<span className="com">// mcp.yoursite.com/v1</span>
<span className="hl">"capabilities"</span>: [
  "products.search", "products.get",
  "inventory.check", "shipping.estimate",
  "cart.create_link", "products.compare"
]
        `}} />
      </div>

      <div className="unique-card">
        <div className="unique-icon green">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <h3 className="unique-title">Action Queue <em>inteligent</em></h3>
        <p className="unique-desc">
          Platforma prioritizează tasks P0/P1/P2 pe impact estimat în RON.
          Tu vezi „ce să faci acum" — nu dashboard-uri abstracte.
        </p>
        <div className="unique-meta">
          <span><b>+4,200 RON</b> impact coadă</span>
          <span>24/7</span>
        </div>
      </div>

    </div>
  </div>
</section>


{/* ========== RESULTS / GROWTH SECTION ========== */}
<section className="section results-section" id="results">
  <div className="container">
    <div className="section-kicker">REZULTATE REALE</div>
    <h2 className="section-title"><em>+142%</em> trafic în 90 zile.<br />Nu promisiuni. Date.</h2>
    <p className="section-sub">
      Alege un use case și vezi exact cum a crescut. Toate graficele sunt date reale agregate din platforma noastră.
    </p>

    <div className="results-layout">
      <div className="results-stories">
        <div className={`story-card ${activeStory === "vivimall" ? "active" : ""}`} onClick={() => setActiveStory("vivimall")}>
          <div className="story-head">
            <div className="story-title">Vivimall — Kitchenware</div>
            <span className="story-niche">SHOPIFY</span>
          </div>
          <div className="story-meta">8,247 produse · 142 articole · 18 clustere</div>
          <div className="story-metrics">
            <div className="story-metric-box">
              <span className="story-metric">+142%</span>
              <span className="story-metric-lbl">Trafic organic</span>
            </div>
            <div className="story-metric-box">
              <span className="story-metric">+184%</span>
              <span className="story-metric-lbl">Revenue</span>
            </div>
          </div>
        </div>

        <div className={`story-card ${activeStory === "moda" ? "active" : ""}`} onClick={() => setActiveStory("moda")}>
          <div className="story-head">
            <div className="story-title">NoaModa — Fashion</div>
            <span className="story-niche">SHOPIFY</span>
          </div>
          <div className="story-meta">2,840 produse · 58 articole · 9 clustere</div>
          <div className="story-metrics">
            <div className="story-metric-box">
              <span className="story-metric">+98%</span>
              <span className="story-metric-lbl">Trafic organic</span>
            </div>
            <div className="story-metric-box">
              <span className="story-metric">+124%</span>
              <span className="story-metric-lbl">Revenue</span>
            </div>
          </div>
        </div>

        <div className={`story-card ${activeStory === "tech" ? "active" : ""}`} onClick={() => setActiveStory("tech")}>
          <div className="story-head">
            <div className="story-title">PixelHub — Electronics</div>
            <span className="story-niche">SHOPIFY</span>
          </div>
          <div className="story-meta">1,248 produse · 84 articole · 14 clustere</div>
          <div className="story-metrics">
            <div className="story-metric-box">
              <span className="story-metric">+212%</span>
              <span className="story-metric-lbl">Trafic organic</span>
            </div>
            <div className="story-metric-box">
              <span className="story-metric">+268%</span>
              <span className="story-metric-lbl">Revenue</span>
            </div>
          </div>
        </div>

        <div className={`story-card ${activeStory === "beauty" ? "active" : ""}`} onClick={() => setActiveStory("beauty")}>
          <div className="story-head">
            <div className="story-title">SkinLab — Beauty &amp; Wellness</div>
            <span className="story-niche">SHOPIFY</span>
          </div>
          <div className="story-meta">484 produse · 112 articole · 21 clustere</div>
          <div className="story-metrics">
            <div className="story-metric-box">
              <span className="story-metric">+167%</span>
              <span className="story-metric-lbl">Trafic organic</span>
            </div>
            <div className="story-metric-box">
              <span className="story-metric">+92%</span>
              <span className="story-metric-lbl">Conversii AI</span>
            </div>
          </div>
        </div>
      </div>

      <div className="results-chart">
        <div className="results-chart-head">
          <div>
            <div className="results-chart-title">{story.title}</div>
            <div className="results-chart-sub">{story.sub}</div>
          </div>
          <div style={{"textAlign":"right"}}>
            <div className="results-chart-big">+<em>{story.big}%</em></div>
            <div className="results-chart-dt">{story.bigLbl}</div>
          </div>
        </div>

        <svg className="growth-svg" viewBox="0 0 720 260" preserveAspectRatio="none">
          {/* grid */}
          <line className="gs-grid" x1="0" y1="40" x2="720" y2="40"/>
          <line className="gs-grid" x1="0" y1="90" x2="720" y2="90"/>
          <line className="gs-grid" x1="0" y1="140" x2="720" y2="140"/>
          <line className="gs-grid" x1="0" y1="190" x2="720" y2="190"/>

          {/* y-axis labels */}
          <text className="gs-label" x="4" y="36" textAnchor="start">48K</text>
          <text className="gs-label" x="4" y="86" textAnchor="start">32K</text>
          <text className="gs-label" x="4" y="136" textAnchor="start">16K</text>
          <text className="gs-label" x="4" y="186" textAnchor="start">8K</text>

          {/* old projection (dotted) */}
          <polyline className="gs-line-old" points="0,200 72,198 144,196 216,194 288,192 360,190 432,188 504,186 576,184 648,182 720,180"/>

          {/* new area */}
          <polyline className="gs-area-new" points="0,200 72,196 144,184 216,174 288,152 360,134 432,114 504,88 576,68 648,44 720,22 720,220 0,220"/>

          {/* new line */}
          <polyline className="gs-line-new" points={story.path}/>

          {/* end marker */}
          <circle className="gs-marker" cx={story.endX} cy={story.endY} r="5"/>

          {/* inflection annotation */}
          <line x1="144" y1="184" x2="144" y2="230" stroke="#d4d4d4" strokeWidth="1" strokeDasharray="2 3"/>
          <text className="gs-label" x="144" y="246" textAnchor="middle" fill="#0a0a0a" font-weight="600">Start Kimono SEO</text>

          {/* x axis labels */}
          <text className="gs-label" x="0" y="258">oct</text>
          <text className="gs-label" x="144" y="258">ian '26</text>
          <text className="gs-label" x="360" y="258" textAnchor="middle">feb '26</text>
          <text className="gs-label" x="576" y="258" textAnchor="middle">mar '26</text>
          <text className="gs-label" x="720" y="258" textAnchor="end">apr '26</text>
        </svg>

        <div className="growth-legend">
          <div className="growth-legend-item">
            <span className="growth-legend-swatch new"></span>
            <span>Trafic <b>cu Kimono SEO</b></span>
          </div>
          <div className="growth-legend-item">
            <span className="growth-legend-swatch old"></span>
            <span>Proiecție fără platformă</span>
          </div>
        </div>

        <div className="chart-kpis">
            {story.kpis.map((kpi, i) => (
              <div className="chart-kpi" key={i}>
                <div className="chart-kpi-lbl">{kpi.lbl}</div>
                <div className="chart-kpi-val">{kpi.val}</div>
                <div className="chart-kpi-dt">{kpi.dt}</div>
              </div>
            ))}
          </div>
      </div>
    </div>
  </div>
</section>

{/* ========== COMPARE SECTION ========== */}
<section className="section compare-section" id="compare">
  <div className="container">
    <div className="section-kicker">COMPARAȚIE</div>
    <h2 className="section-title">De ce plătești pentru <em>5 tool-uri</em>,<br />când unul singur face totul?</h2>
    <p className="section-sub">
      Ahrefs, SEMrush, Surfer, Clearscope, ShopifyPlus SEO apps — împreună costă <b>$800+/lună</b> și tot nu acoperă AEO, GEO, llms.txt, agentic commerce. Noi da.
    </p>

    <div className="compare-table-wrap">
      <table className="compare-tbl">
        <thead>
          <tr>
            <th style={{"minWidth":"240px"}}>Feature</th>
            <th className="highlight">
              <div className="compare-header-name">Ultimate<em>SEO</em></div>
              <div className="compare-header-sub">All-in-one</div>
              <div className="compare-header-price">de la $149/lună</div>
            </th>
            <th>
              <div className="compare-header-name">Ahrefs</div>
              <div className="compare-header-sub">Keyword + backlinks</div>
              <div className="compare-header-price">$249/lună</div>
            </th>
            <th>
              <div className="compare-header-name">SEMrush</div>
              <div className="compare-header-sub">SEO + PPC suite</div>
              <div className="compare-header-price">$289/lună</div>
            </th>
            <th>
              <div className="compare-header-name">Surfer</div>
              <div className="compare-header-sub">Content optimizer</div>
              <div className="compare-header-price">$89/lună</div>
            </th>
            <th>
              <div className="compare-header-name">Clearscope</div>
              <div className="compare-header-sub">Content briefs</div>
              <div className="compare-header-price">$189/lună</div>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr><td colSpan="6" className="compare-category">SEO CLASIC</td></tr>
          <tr>
            <td>Keyword research + tracking</td>
            <td className="highlight"><span className="compare-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg></span></td>
            <td><span className="compare-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg></span></td>
            <td><span className="compare-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg></span></td>
            <td><span className="compare-partial">~</span></td>
            <td><span className="compare-x"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6L6 18M6 6l12 12"/></svg></span></td>
          </tr>
          <tr>
            <td>Audit tehnic site + crawl</td>
            <td className="highlight"><span className="compare-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg></span></td>
            <td><span className="compare-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg></span></td>
            <td><span className="compare-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg></span></td>
            <td><span className="compare-x"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6L6 18M6 6l12 12"/></svg></span></td>
            <td><span className="compare-x"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6L6 18M6 6l12 12"/></svg></span></td>
          </tr>
          <tr>
            <td>Schema JSON-LD <b>auto-generat</b></td>
            <td className="highlight"><span className="compare-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg></span></td>
            <td><span className="compare-x"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6L6 18M6 6l12 12"/></svg></span></td>
            <td><span className="compare-x"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6L6 18M6 6l12 12"/></svg></span></td>
            <td><span className="compare-x"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6L6 18M6 6l12 12"/></svg></span></td>
            <td><span className="compare-x"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6L6 18M6 6l12 12"/></svg></span></td>
          </tr>
          <tr>
            <td>Validator Rich Results + auto-fix</td>
            <td className="highlight"><span className="compare-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg></span></td>
            <td><span className="compare-x"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6L6 18M6 6l12 12"/></svg></span></td>
            <td><span className="compare-partial">~</span></td>
            <td><span className="compare-x"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6L6 18M6 6l12 12"/></svg></span></td>
            <td><span className="compare-x"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6L6 18M6 6l12 12"/></svg></span></td>
          </tr>
          <tr>
            <td>Internal linking automat</td>
            <td className="highlight"><span className="compare-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg></span></td>
            <td><span className="compare-x"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6L6 18M6 6l12 12"/></svg></span></td>
            <td><span className="compare-x"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6L6 18M6 6l12 12"/></svg></span></td>
            <td><span className="compare-x"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6L6 18M6 6l12 12"/></svg></span></td>
            <td><span className="compare-x"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6L6 18M6 6l12 12"/></svg></span></td>
          </tr>

          <tr><td colSpan="6" className="compare-category">CONTENT</td></tr>
          <tr>
            <td>Clustere pillar/satellite planificate</td>
            <td className="highlight"><span className="compare-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg></span></td>
            <td><span className="compare-partial">~</span></td>
            <td><span className="compare-partial">~</span></td>
            <td><span className="compare-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg></span></td>
            <td><span className="compare-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg></span></td>
          </tr>
          <tr>
            <td>Generator articole AI (Claude/GPT)</td>
            <td className="highlight"><span className="compare-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg></span></td>
            <td><span className="compare-x"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6L6 18M6 6l12 12"/></svg></span></td>
            <td><span className="compare-partial">~</span></td>
            <td><span className="compare-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg></span></td>
            <td><span className="compare-x"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6L6 18M6 6l12 12"/></svg></span></td>
          </tr>
          <tr>
            <td>Content Decay detection + refresh</td>
            <td className="highlight"><span className="compare-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg></span></td>
            <td><span className="compare-x"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6L6 18M6 6l12 12"/></svg></span></td>
            <td><span className="compare-partial">~</span></td>
            <td><span className="compare-x"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6L6 18M6 6l12 12"/></svg></span></td>
            <td><span className="compare-x"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6L6 18M6 6l12 12"/></svg></span></td>
          </tr>
          <tr>
            <td>Review mining din Judge.me / Loox</td>
            <td className="highlight"><span className="compare-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg></span></td>
            <td><span className="compare-x"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6L6 18M6 6l12 12"/></svg></span></td>
            <td><span className="compare-x"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6L6 18M6 6l12 12"/></svg></span></td>
            <td><span className="compare-x"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6L6 18M6 6l12 12"/></svg></span></td>
            <td><span className="compare-x"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6L6 18M6 6l12 12"/></svg></span></td>
          </tr>

          <tr><td colSpan="6" className="compare-category">AI ENGINES (AEO / GEO)</td></tr>
          <tr>
            <td>llms.txt <b>auto-generare &amp; sync</b></td>
            <td className="highlight"><span className="compare-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg></span></td>
            <td><span className="compare-x"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6L6 18M6 6l12 12"/></svg></span></td>
            <td><span className="compare-x"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6L6 18M6 6l12 12"/></svg></span></td>
            <td><span className="compare-x"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6L6 18M6 6l12 12"/></svg></span></td>
            <td><span className="compare-x"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6L6 18M6 6l12 12"/></svg></span></td>
          </tr>
          <tr>
            <td>AI Citations tracking (5 engines)</td>
            <td className="highlight"><span className="compare-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg></span></td>
            <td><span className="compare-x"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6L6 18M6 6l12 12"/></svg></span></td>
            <td><span className="compare-partial">~</span></td>
            <td><span className="compare-x"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6L6 18M6 6l12 12"/></svg></span></td>
            <td><span className="compare-x"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6L6 18M6 6l12 12"/></svg></span></td>
          </tr>
          <tr>
            <td>LLM Sentiment monitoring</td>
            <td className="highlight"><span className="compare-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg></span></td>
            <td><span className="compare-x"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6L6 18M6 6l12 12"/></svg></span></td>
            <td><span className="compare-x"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6L6 18M6 6l12 12"/></svg></span></td>
            <td><span className="compare-x"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6L6 18M6 6l12 12"/></svg></span></td>
            <td><span className="compare-x"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6L6 18M6 6l12 12"/></svg></span></td>
          </tr>
          <tr>
            <td>Answer Confidence scoring</td>
            <td className="highlight"><span className="compare-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg></span></td>
            <td><span className="compare-x"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6L6 18M6 6l12 12"/></svg></span></td>
            <td><span className="compare-x"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6L6 18M6 6l12 12"/></svg></span></td>
            <td><span className="compare-x"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6L6 18M6 6l12 12"/></svg></span></td>
            <td><span className="compare-x"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6L6 18M6 6l12 12"/></svg></span></td>
          </tr>
          <tr>
            <td>AI traffic atribuit in GA4</td>
            <td className="highlight"><span className="compare-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg></span></td>
            <td><span className="compare-x"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6L6 18M6 6l12 12"/></svg></span></td>
            <td><span className="compare-x"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6L6 18M6 6l12 12"/></svg></span></td>
            <td><span className="compare-x"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6L6 18M6 6l12 12"/></svg></span></td>
            <td><span className="compare-x"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6L6 18M6 6l12 12"/></svg></span></td>
          </tr>

          <tr><td colSpan="6" className="compare-category">COMMERCE</td></tr>
          <tr>
            <td>Shopify nativ (webhooks + meta)</td>
            <td className="highlight"><span className="compare-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg></span></td>
            <td><span className="compare-x"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6L6 18M6 6l12 12"/></svg></span></td>
            <td><span className="compare-x"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6L6 18M6 6l12 12"/></svg></span></td>
            <td><span className="compare-x"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6L6 18M6 6l12 12"/></svg></span></td>
            <td><span className="compare-x"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6L6 18M6 6l12 12"/></svg></span></td>
          </tr>
          <tr>
            <td>Agentic Commerce (MCP server)</td>
            <td className="highlight"><span className="compare-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg></span></td>
            <td><span className="compare-x"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6L6 18M6 6l12 12"/></svg></span></td>
            <td><span className="compare-x"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6L6 18M6 6l12 12"/></svg></span></td>
            <td><span className="compare-x"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6L6 18M6 6l12 12"/></svg></span></td>
            <td><span className="compare-x"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6L6 18M6 6l12 12"/></svg></span></td>
          </tr>
          <tr>
            <td>IndexNow sync Bing + Yandex</td>
            <td className="highlight"><span className="compare-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg></span></td>
            <td><span className="compare-x"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6L6 18M6 6l12 12"/></svg></span></td>
            <td><span className="compare-x"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6L6 18M6 6l12 12"/></svg></span></td>
            <td><span className="compare-x"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6L6 18M6 6l12 12"/></svg></span></td>
            <td><span className="compare-x"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6L6 18M6 6l12 12"/></svg></span></td>
          </tr>

          <tr><td colSpan="6" className="compare-category">AUTOMATIZARE</td></tr>
          <tr>
            <td>Action Queue prioritizat pe impact (RON)</td>
            <td className="highlight"><span className="compare-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg></span></td>
            <td><span className="compare-x"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6L6 18M6 6l12 12"/></svg></span></td>
            <td><span className="compare-x"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6L6 18M6 6l12 12"/></svg></span></td>
            <td><span className="compare-x"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6L6 18M6 6l12 12"/></svg></span></td>
            <td><span className="compare-x"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6L6 18M6 6l12 12"/></svg></span></td>
          </tr>
          <tr>
            <td>Suport UI limba română</td>
            <td className="highlight"><span className="compare-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg></span></td>
            <td><span className="compare-x"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6L6 18M6 6l12 12"/></svg></span></td>
            <td><span className="compare-x"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6L6 18M6 6l12 12"/></svg></span></td>
            <td><span className="compare-x"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6L6 18M6 6l12 12"/></svg></span></td>
            <td><span className="compare-x"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6L6 18M6 6l12 12"/></svg></span></td>
          </tr>
        </tbody>
      </table>
      <div className="compare-footer">
        <div className="compare-footer-text">
          <b>Total lunar alternativă: $1,005/lună</b> — și nici una nu acoperă AEO, GEO, llms.txt sau agentic commerce.
          Kimono SEO pornește de la <b>$149/lună</b> cu toate acestea incluse.
        </div>
        <a href="#pricing" className="btn btn-primary btn-lg">
          Vezi prețurile
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </a>
      </div>
    </div>
  </div>
</section>





{/* ========== TESTIMONIALS ========== */}
<section className="testimonials">
  <div className="container">
    <div className="section-kicker">CE SPUN CLIENȚII</div>
    <h2 className="section-title">Shopify merchants care au <em>închis laptop-ul</em><br />și s-au uitat la creștere.</h2>

    <div className="testimonials-grid">
      <div className="testimonial">
        <p className="testimonial-quote">În prima lună am recuperat costul platformei de 8 ori doar din AI citations. Acum Perplexity ne recomandă în 58% din queries din nisa noastră.</p>
        <div className="testimonial-footer">
          <div className="testimonial-avatar green">AV</div>
          <div className="testimonial-who">
            <div className="testimonial-name">Andrei Vasilescu</div>
            <div className="testimonial-role">Founder, Vivimall · kitchenware</div>
          </div>
          <span className="testimonial-metric">+142%</span>
        </div>
      </div>

      <div className="testimonial">
        <p className="testimonial-quote">Am scăpat de Ahrefs, Surfer și încă 3 app-uri Shopify SEO. Tot ce-mi trebuia era într-un singur dashboard. Am dat drumul la blog după 3 ani de pauză.</p>
        <div className="testimonial-footer">
          <div className="testimonial-avatar purple">NR</div>
          <div className="testimonial-who">
            <div className="testimonial-name">Noa Radu</div>
            <div className="testimonial-role">CMO, NoaModa · fashion</div>
          </div>
          <span className="testimonial-metric">+98%</span>
        </div>
      </div>

      <div className="testimonial">
        <p className="testimonial-quote">Content decay detection a salvat 7 articole care pierdeau pozitii. Le-a rescris automat și 5 au revenit în top 3. Eu nu mai am timp de asta manual.</p>
        <div className="testimonial-footer">
          <div className="testimonial-avatar blue">MP</div>
          <div className="testimonial-who">
            <div className="testimonial-name">Mihai Popescu</div>
            <div className="testimonial-role">E-commerce Lead, PixelHub</div>
          </div>
          <span className="testimonial-metric">+212%</span>
        </div>
      </div>
    </div>
  </div>
</section>

{/* ========== PRICING ========== */}
<section className="section pricing-section" id="pricing">
  <div className="container">
    <div className="section-kicker">PREȚURI</div>
    <h2 className="section-title">Un preț. <em>Tot ecosistemul.</em></h2>
    <p className="section-sub">
      Fără add-ons. Fără seat-based pricing care te îndeamnă să nu adaugi oameni în echipă.
      Plătești pentru magazin, nu pentru useri.
    </p>

    <div className="pricing-tabs" id="pricing-tabs">
      <button className={`pricing-tab ${pricingPeriod === "monthly" ? "active" : ""}`} onClick={() => setPricingPeriod("monthly")}>Lunar</button>
      <button className={`pricing-tab ${pricingPeriod === "yearly" ? "active" : ""}`} onClick={() => setPricingPeriod("yearly")}>
        Anual
        <span className="pricing-tab-save">-20%</span>
      </button>
    </div>

    <div className="pricing-grid">

      <div className="price-card">
        <div className="price-plan-name">Starter</div>
        <div className="price-plan-sub">Pentru shop-uri Shopify cu până la 500 produse. SEO clasic complet.</div>
        <div className="price-amount">
          <span className="price-currency">$</span>
          <span className="price-num">{pricingPeriod === "yearly" ? "119" : "149"}</span>
          <span className="price-unit">/lună</span>
        </div>
        <div className="price-meta">
          <span className="price-meta-strike" style={{"display":"none"}} data-show-yearly>$189</span>
          Facturat lunar
        </div>
        <a href="#" className="btn btn-ghost price-btn">
          Începe 14 zile gratis
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </a>
        <div className="price-features-head">Include</div>
        <ul className="price-features">
          <li className="price-feature"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg><span><b>12 module</b> SEO clasic (keywords, audit, internal linking)</span></li>
          <li className="price-feature"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg><span>Schema Product + Article + BreadcrumbList</span></li>
          <li className="price-feature"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg><span>Până la <b>500 produse</b> in catalog</span></li>
          <li className="price-feature"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg><span><b>10 articole AI</b> / lună generate</span></li>
          <li className="price-feature"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg><span>GA4 + Search Console connect</span></li>
          <li className="price-feature"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg><span>Email support · răspuns &lt;24h</span></li>
          <li className="price-feature off"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6L6 18M6 6l12 12"/></svg><span>AEO / GEO modules</span></li>
          <li className="price-feature off"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6L6 18M6 6l12 12"/></svg><span>Agentic Commerce (MCP)</span></li>
        </ul>
      </div>

      <div className="price-card featured">
        <div className="price-ribbon">Popular</div>
        <div className="price-plan-name">Growth</div>
        <div className="price-plan-sub">Toate cele 36 module. AEO + GEO + Agentic Commerce. Pentru shop-uri care vor să domine.</div>
        <div className="price-amount">
          <span className="price-currency">$</span>
          <span className="price-num">{pricingPeriod === "yearly" ? "279" : "349"}</span>
          <span className="price-unit">/lună</span>
        </div>
        <div className="price-meta">
          <span className="price-meta-strike" style={{"display":"none"}} data-show-yearly>$449</span>
          Facturat lunar
        </div>
        <a href="#" className="btn btn-primary price-btn">
          Începe 14 zile gratis
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </a>
        <div className="price-features-head">Tot din Starter, plus</div>
        <ul className="price-features">
          <li className="price-feature"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg><span><b>Toate cele 36 module</b> — SEO + AEO + GEO</span></li>
          <li className="price-feature"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg><span>Până la <b>10,000 produse</b></span></li>
          <li className="price-feature"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg><span><b>50 articole AI</b> / lună (Claude Sonnet + GPT-4o)</span></li>
          <li className="price-feature"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg><span>llms.txt sync + IndexNow automat</span></li>
          <li className="price-feature"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg><span>AI Citations tracking (5 engines)</span></li>
          <li className="price-feature"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg><span>Agentic Commerce MCP server</span></li>
          <li className="price-feature"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg><span>LLM Sentiment monitoring săptămânal</span></li>
          <li className="price-feature"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg><span>Priority Slack support · răspuns &lt;4h</span></li>
        </ul>
      </div>

      <div className="price-card">
        <div className="price-plan-name">Scale</div>
        <div className="price-plan-sub">Pentru shop-uri enterprise cu &gt;10K produse, multi-store, multi-limbă.</div>
        <div className="price-amount">
          <span className="price-currency">$</span>
          <span className="price-num">{pricingPeriod === "yearly" ? "719" : "899"}</span>
          <span className="price-unit">/lună</span>
        </div>
        <div className="price-meta">
          <span className="price-meta-strike" style={{"display":"none"}} data-show-yearly>$1,149</span>
          sau contact pentru custom
        </div>
        <a href="#" className="btn btn-ghost price-btn">
          Vorbește cu sales
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </a>
        <div className="price-features-head">Tot din Growth, plus</div>
        <ul className="price-features">
          <li className="price-feature"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg><span><b>Produse nelimitate</b></span></li>
          <li className="price-feature"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg><span><b>200 articole AI</b> / lună</span></li>
          <li className="price-feature"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg><span>Multi-store + multi-language</span></li>
          <li className="price-feature"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg><span>Custom integrations (API, webhooks)</span></li>
          <li className="price-feature"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg><span>White-label report branding</span></li>
          <li className="price-feature"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg><span>SSO + audit logs</span></li>
          <li className="price-feature"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg><span>Dedicated Account Manager</span></li>
          <li className="price-feature"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg><span>SLA 99.9% uptime garantat</span></li>
        </ul>
      </div>

    </div>

    {/* Guarantee strip */}
    <div style={{"marginTop":"40px","padding":"20px 28px","background":"var(--surface)","border":"1px solid var(--line)","borderRadius":"var(--r)","display":"flex","alignItems":"center","justifyContent":"center","gap":"28px","flexWrap":"wrap","fontSize":"13px","color":"var(--ink-2)","letterSpacing":"-.005em"}}>
      <div style={{"display":"flex","alignItems":"center","gap":"8px"}}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{"width":"16px","height":"16px","color":"var(--accent)"}}><path d="M12 2l2.45 7.55H22l-6.27 4.55L18.18 22 12 17.27 5.82 22l2.45-7.9L2 9.55h7.55z"/></svg> <b style={{"color":"var(--ink-0)","fontWeight":"600"}}>30 zile garanție</b> „bani înapoi"</div>
      <div style={{"display":"flex","alignItems":"center","gap":"8px"}}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{"width":"16px","height":"16px","color":"var(--accent)"}}><polyline points="20 6 9 17 4 12"/></svg> <b style={{"color":"var(--ink-0)","fontWeight":"600"}}>Migrație gratuită</b> de la alte tool-uri</div>
      <div style={{"display":"flex","alignItems":"center","gap":"8px"}}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{"width":"16px","height":"16px","color":"var(--accent)"}}><path d="M21 12a9 9 0 1 1-6.2-8.6"/></svg> <b style={{"color":"var(--ink-0)","fontWeight":"600"}}>Cancel oricând</b>, fără penalizări</div>
    </div>
  </div>
</section>

{/* ========== FAQ ========== */}
<section className="faq-section" id="faq">
  <div className="container">
    <div className="section-kicker">ÎNTREBĂRI FRECVENTE</div>
    <h2 className="section-title">Ce vrei să știi <em>înainte</em> să te hotărăști.</h2>

    <div className="faq-layout">
      <div className="faq-sidebar">
        <h3>Mai ai <em>întrebări?</em></h3>
        <p>Echipa noastră răspunde pe Slack în 2-4 ore în zilele lucrătoare. Demo 1:1 gratis de 30 minute — îți arătăm platforma pe shop-ul tău real.</p>
        <div className="faq-contact">
          <div className="faq-contact-title">Programează demo 1:1</div>
          <div className="faq-contact-meta">30 min · fără obligații</div>
          <a href="#" className="btn btn-primary" style={{"width":"100%","justifyContent":"center"}}>
            Rezervă slot
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </a>
        </div>
      </div>

      <div className="faq-list">
        <div className={`faq-item ${openFaq === 0 ? "open" : ""}`} onClick={() => setOpenFaq(openFaq === 0 ? null : 0)}>
          <div className="faq-q">Chiar face 99.99% din munca SEO? Ce mai fac eu?</div>
          <div className="faq-a">Da — cu o precizare. Platforma automatizează <b>execuția</b>: schema generation, articles, llms.txt, internal linking, decay detection, audit fix, submissions. Tu setezi strategia: ce nișe atacați, ce brand voice folosiți, ce prețuri practicați. Platforma îți prezintă propuneri prioritizate pe impact (RON) și tu aprobi ce merită. Un founder petrece ~2h/săptămână în Kimono SEO vs. ~20h în altele.</div>
        </div>

        <div className={`faq-item ${openFaq === 1 ? "open" : ""}`} onClick={() => setOpenFaq(openFaq === 1 ? null : 1)}>
          <div className="faq-q">Cât durează până văd rezultate reale?</div>
          <div className="faq-a">Primele semnale în 2-3 săptămâni (schema fix, IndexNow, internal linking boost). Creștere notabilă trafic în 60-90 zile. Vivimall a făcut +142% în 90 zile — media clienților noștri e 60-180% în primele 90 zile. AI citations încep mai repede (~30 zile) pentru că engine-urile re-crawl-uiesc mai des.</div>
        </div>

        <div className={`faq-item ${openFaq === 2 ? "open" : ""}`} onClick={() => setOpenFaq(openFaq === 2 ? null : 2)}>
          <div className="faq-q">Lucrează doar cu Shopify sau și cu alte platforme?</div>
          <div className="faq-a">Momentan <b>Shopify-native</b> (Shopify + Shopify Plus). WooCommerce și custom e-commerce vin în Q3 2026. Dacă ești pe alt platformă și te interesează, scrie-ne și te adăugăm pe lista de beta-access.</div>
        </div>

        <div className={`faq-item ${openFaq === 3 ? "open" : ""}`} onClick={() => setOpenFaq(openFaq === 3 ? null : 3)}>
          <div className="faq-q">Ce tool-uri pot să renunț după ce iau Kimono SEO?</div>
          <div className="faq-a">Cel mai des clienții renunță la: <b>Ahrefs/SEMrush</b> (keyword + audit + tracking), <b>Surfer/Clearscope</b> (content briefs), <b>Schema App</b> (structured data), <b>Smart SEO/SEO Manager</b> (Shopify apps). Economisim clienților $600-1,200/lună agregat. Migration Wizard mută datele automat în 5 minute.</div>
        </div>

        <div className={`faq-item ${openFaq === 4 ? "open" : ""}`} onClick={() => setOpenFaq(openFaq === 4 ? null : 4)}>
          <div className="faq-q">Conținutul generat AI nu o să fie penalizat de Google?</div>
          <div className="faq-a">Nu — pentru că nu e „conținut generat de AI lăsat la voia întâmplării". Fiecare articol trece prin: briefing tehnic, intent mapping, Answer Confidence scoring (min 70/100), E-E-A-T checklist, passage ranking per H2, FAQ din PAA, schema validation. Google penalizează conținutul de slabă calitate, nu originea lui. Articolele noastre au ranking mediu <b>3.8</b> pe Google — evident merge.</div>
        </div>

        <div className={`faq-item ${openFaq === 5 ? "open" : ""}`} onClick={() => setOpenFaq(openFaq === 5 ? null : 5)}>
          <div className="faq-q">Datele mele sunt în siguranță? GDPR?</div>
          <div className="faq-a">100% GDPR-compliant. Date stocate în UE (Frankfurt). <b>Zero data retention</b> pe API-urile LLM (Anthropic + OpenAI). Nu training-uim pe datele tale. Logs retention 30 zile, apoi ștergere automată. ISO 27001 certification în curs (Q4 2026). Plan Scale include audit logs + SSO + DPA signed.</div>
        </div>

        <div className={`faq-item ${openFaq === 6 ? "open" : ""}`} onClick={() => setOpenFaq(openFaq === 6 ? null : 6)}>
          <div className="faq-q">Ce se întâmplă dacă trec peste limita de produse sau articole?</div>
          <div className="faq-a">Fără shutdown brutal sau taxe surpriză. La <b>90% din limită</b> primești notificare. La depășire, platforma continuă să funcționeze și îți oferim up-grade proporțional cu ce ai depășit (sau credit pro-rata la downgrade). Transparent, fără jocuri.</div>
        </div>

        <div className={`faq-item ${openFaq === 7 ? "open" : ""}`} onClick={() => setOpenFaq(openFaq === 7 ? null : 7)}>
          <div className="faq-q">Pot să revin la Ahrefs dacă nu-mi place?</div>
          <div className="faq-a">Desigur. Cancel oricând, fără întrebări. 30 zile bani înapoi, indiferent de motiv. Datele tale (articole generate, schema, reports) sunt <b>exportabile în CSV/JSON</b> oricând — sunt ale tale, nu ale noastre.</div>
        </div>

        <div className={`faq-item ${openFaq === 8 ? "open" : ""}`} onClick={() => setOpenFaq(openFaq === 8 ? null : 8)}>
          <div className="faq-q">Oferiti servicii manuale de SEO în plus?</div>
          <div className="faq-a">Platforma e self-serve. Pentru shop-uri Scale oferim <b>Managed SEO</b> ca add-on ($2,500/lună) — un SEO strategist dedicat revizuiește output-ul platformei săptămânal și face optimizări strategice. Nu e obligatoriu — 95% din clienți folosesc doar platforma.</div>
        </div>
      </div>
    </div>
  </div>
</section>

{/* ========== FINAL CTA ========== */}
<section className="cta-final">
  <div className="container">
    <div className="cta-inner">
      <div className="cta-kicker">
        <span className="cta-kicker-pill">GRATIS</span>
        <span>14 zile · fără card · setup 5 minute</span>
      </div>
      <h2>Tu închizi <em>deals</em>.<br />Noi ne ocupăm de <em>restul</em>.</h2>
      <p>
        36 module lucrează 24/7 în timp ce tu construiești compania.
        Unica platformă SEO care acoperă SEO + AEO + GEO + Agentic Commerce într-un singur abonament.
      </p>
      <div className="cta-actions">
        <a href="#" className="btn btn-primary btn-lg">
          Începe 14 zile gratis
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </a>
        <a href="#demo" className="btn btn-ghost btn-lg">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          Programează demo 1:1
        </a>
      </div>
      <div className="cta-trust">
        <div className="cta-trust-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><polyline points="20 6 9 17 4 12"/></svg>
          14 zile gratis
        </div>
        <div className="cta-trust-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><polyline points="20 6 9 17 4 12"/></svg>
          Fără card
        </div>
        <div className="cta-trust-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><polyline points="20 6 9 17 4 12"/></svg>
          Setup în 5 minute
        </div>
        <div className="cta-trust-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><polyline points="20 6 9 17 4 12"/></svg>
          Cancel oricând
        </div>
      </div>
    </div>
  </div>
</section>

{/* ========== FOOTER ========== */}
<footer className="footer">
  <div className="container">
    <div className="footer-grid">
      <div className="footer-brand-block">
        <a href="#" className="footer-brand">
          <span className="logo-mark">U</span>
          Ultimate<em>SEO</em>
        </a>
        <p className="footer-tagline">Platforma completă SEO, AEO și GEO pentru Shopify merchants. 36 module automate. Un singur preț.</p>
      </div>
      <div className="footer-col">
        <h5>Platformă</h5>
        <ul>
          <li><a href="#features">Features</a></li>
          <li><a href="#results">Rezultate</a></li>
          <li><a href="#compare">Comparație</a></li>
          <li><a href="#pricing">Prețuri</a></li>
          <li><a href="#">Changelog</a></li>
        </ul>
      </div>
      <div className="footer-col">
        <h5>Resurse</h5>
        <ul>
          <li><a href="#">Blog</a></li>
          <li><a href="#">Ghid SEO Shopify</a></li>
          <li><a href="#">AEO Playbook</a></li>
          <li><a href="#">API Docs</a></li>
          <li><a href="#">Status</a></li>
        </ul>
      </div>
      <div className="footer-col">
        <h5>Companie</h5>
        <ul>
          <li><a href="#">Despre</a></li>
          <li><a href="#">Clienți</a></li>
          <li><a href="#">Cariere</a></li>
          <li><a href="#">Contact</a></li>
          <li><a href="#">Press kit</a></li>
        </ul>
      </div>
      <div className="footer-col">
        <h5>Legal</h5>
        <ul>
          <li><a href="/legal/terms">Termeni</a></li>
          <li><a href="/legal/privacy">Confidențialitate</a></li>
          <li><a href="/legal/cookies">Cookies</a></li>
          <li><a href="/legal/data-deletion">Stergere date</a></li>
          <li><a href="mailto:office@kimonogroup.ro">DPO</a></li>
        </ul>
      </div>
    </div>
    <div className="footer-bottom">
      <div>© 2026 Kimono SEO · SC INSTAGROW SERVICES SRL · Toate drepturile rezervate</div>
      <div className="footer-legal">
        <a href="/legal/terms">Termeni</a>
        <a href="/legal/privacy">Privacy</a>
        <a href="/legal/cookies">Cookies</a>
      </div>
    </div>
  </div>
</footer>

{/* ========== JAVASCRIPT ========== */}
    </>
  );
}
