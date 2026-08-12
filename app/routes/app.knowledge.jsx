import { requireAuth } from "../lib/auth/index.server.js";
import { useState } from "react";

export const loader = async ({ request }) => {
  await requireAuth(request);
  return null;
};

export default function KnowledgeBase() {
  const [activeChip, setActiveChip] = useState("all");

  const scrollToSection = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <>

      <div className="page-head" style={{"marginBottom":"8px"}}>
        <div>
          <div className="greet-kicker">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{"color":"var(--ink-4)"}}><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>
            <span>Documentatie completa a sistemului</span>
          </div>
          <h1 className="page-title">Knowledge <em>Base</em></h1>
          <p className="page-sub">Ce face fiecare modul, cum sunt construite fazele, arhitectura, planurile si comparatia cu competitorii.</p>
        </div>
      </div>

      {/* Hero stats full-width */}
      <div className="hero-stats">
        <div className="hs-cell">
          <div className="hs-label">Module</div>
          <div className="hs-value">36</div>
          <div className="hs-sub">28 live · 4 dev · 2 queue</div>
        </div>
        <div className="hs-cell">
          <div className="hs-label">Build Phases</div>
          <div className="hs-value">6</div>
          <div className="hs-sub">4 complete · 1 activa</div>
        </div>
        <div className="hs-cell">
          <div className="hs-label">API Integrations</div>
          <div className="hs-value">7</div>
          <div className="hs-sub">GSC · DataForSEO · GA4 · Bing</div>
        </div>
        <div className="hs-cell">
          <div className="hs-label">Priority P0</div>
          <div className="hs-value">6</div>
          <div className="hs-sub">fundatie critica</div>
        </div>
      </div>

      <div className="kb-layout">
        <div className="kb-main">

          {/* MODULES */}
          <section className="section" id="kb-modules">
            <div className="section-head">
              <h2 className="section-title">Cele 36 <em>module</em></h2>
              <p className="section-desc">Toate modulele sunt autonome, configurabile si observabile.</p>
            </div>

            <div className="toolbar" style={{"marginBottom":"12px"}}>
              <div className="toolbar-left">
                <div className="chip-group">
                  <span className="chip active">Toate <span className="ct">36</span></span>
                  <span className="chip">Live <span className="ct">28</span></span>
                  <span className="chip">Dev <span className="ct">4</span></span>
                  <span className="chip">Queue <span className="ct">2</span></span>
                  <span className="chip">SEO</span>
                  <span className="chip">AEO</span>
                  <span className="chip">GEO</span>
                </div>
              </div>
            </div>

            <div className="modules-list">

              <div className="mod"><div className="mod-num">01</div><div className="mod-body"><div className="mod-name">Keyword Triage (GSC)</div><div className="mod-desc">Citeste zilnic GSC, calculeaza delta si roteaza decizii.</div></div><div className="mod-tags"><span className="mod-tag seo">SEO</span><span className="mod-tag aeo">AEO</span><span className="mod-tag geo">GEO</span></div><span className="mod-status live"><span className="dot"></span>Live</span></div>
              <div className="mod"><div className="mod-num">02</div><div className="mod-body"><div className="mod-name">On-page Audit</div><div className="mod-desc">Auditeaza meta title, description, H1, URL handle.</div></div><div className="mod-tags"><span className="mod-tag seo">SEO</span></div><span className="mod-status live"><span className="dot"></span>Live</span></div>
              <div className="mod"><div className="mod-num">03</div><div className="mod-body"><div className="mod-name">Image Optimizer</div><div className="mod-desc">Alt text automat, filename SEO, semnalare imagini irelevante.</div></div><div className="mod-tags"><span className="mod-tag seo">SEO</span></div><span className="mod-status live"><span className="dot"></span>Live</span></div>
              <div className="mod"><div className="mod-num">04</div><div className="mod-body"><div className="mod-name">Internal Linking Engine</div><div className="mod-desc">Linking bidirectional cu anchor text natural.</div></div><div className="mod-tags"><span className="mod-tag seo">SEO</span><span className="mod-tag aeo">AEO</span></div><span className="mod-status live"><span className="dot"></span>Live</span></div>
              <div className="mod"><div className="mod-num">05</div><div className="mod-body"><div className="mod-name">Redirect Manager + 404</div><div className="mod-desc">Crawleaza, detecteaza 404, sugereaza destinatii.</div></div><div className="mod-tags"><span className="mod-tag seo">SEO</span></div><span className="mod-status live"><span className="dot"></span>Live</span></div>
              <div className="mod"><div className="mod-num">06</div><div className="mod-body"><div className="mod-name">Tag &amp; Collection Architect</div><div className="mod-desc">Taxonomie coerenta bazata pe volume DataForSEO.</div></div><div className="mod-tags"><span className="mod-tag seo">SEO</span></div><span className="mod-status live"><span className="dot"></span>Live</span></div>
              <div className="mod"><div className="mod-num">07</div><div className="mod-body"><div className="mod-name">Blog Cluster Generator</div><div className="mod-desc">1 pillar + 3-6 satellites, articole AEO+GEO.</div></div><div className="mod-tags"><span className="mod-tag seo">SEO</span><span className="mod-tag aeo">AEO</span><span className="mod-tag geo">GEO</span></div><span className="mod-status live"><span className="dot"></span>Live</span></div>
              <div className="mod"><div className="mod-num">08</div><div className="mod-body"><div className="mod-name">Schema Markup + Validator</div><div className="mod-desc">Product, Article, FAQPage, BreadcrumbList, Organization.</div></div><div className="mod-tags"><span className="mod-tag aeo">AEO</span></div><span className="mod-status live"><span className="dot"></span>Live</span></div>
              <div className="mod"><div className="mod-num">09</div><div className="mod-body"><div className="mod-name">Review Mining</div><div className="mod-desc">Extrage recenzii Judge.me/Loox: keywords, use cases.</div></div><div className="mod-tags"><span className="mod-tag seo">SEO</span><span className="mod-tag aeo">AEO</span></div><span className="mod-status live"><span className="dot"></span>Live</span></div>
              <div className="mod"><div className="mod-num">10</div><div className="mod-body"><div className="mod-name">DataForSEO Integration</div><div className="mod-desc">Volume, difficulty, CPC, SERP, PAA. Cache 30 zile.</div></div><div className="mod-tags"><span className="mod-tag seo">SEO</span></div><span className="mod-status live"><span className="dot"></span>Live</span></div>
              <div className="mod"><div className="mod-num">11</div><div className="mod-body"><div className="mod-name">Keyword Intent Classifier</div><div className="mod-desc">Informational, commercial, transactional, navigational.</div></div><div className="mod-tags"><span className="mod-tag seo">SEO</span><span className="mod-tag aeo">AEO</span></div><span className="mod-status live"><span className="dot"></span>Live</span></div>
              <div className="mod"><div className="mod-num">12</div><div className="mod-body"><div className="mod-name">Passage Ranking Optimization</div><div className="mod-desc">Fiecare H2/H3 auto-continut, 150-300 cuvinte.</div></div><div className="mod-tags"><span className="mod-tag seo">SEO</span><span className="mod-tag aeo">AEO</span></div><span className="mod-status live"><span className="dot"></span>Live</span></div>
              <div className="mod"><div className="mod-num">13</div><div className="mod-body"><div className="mod-name">Zero-Click Optimization</div><div className="mod-desc">Featured snippet, PAA box, definition box.</div></div><div className="mod-tags"><span className="mod-tag aeo">AEO</span><span className="mod-tag geo">GEO</span></div><span className="mod-status live"><span className="dot"></span>Live</span></div>
              <div className="mod"><div className="mod-num">14</div><div className="mod-body"><div className="mod-name">Entity SEO Engine</div><div className="mod-desc">sameAs Knowledge Graph linking.</div></div><div className="mod-tags"><span className="mod-tag geo">GEO</span></div><span className="mod-status live"><span className="dot"></span>Live</span></div>
              <div className="mod"><div className="mod-num">15</div><div className="mod-body"><div className="mod-name">E-E-A-T Signals Analyzer</div><div className="mod-desc">Experience, Expertise, Authoritativeness, Trust.</div></div><div className="mod-tags"><span className="mod-tag seo">SEO</span></div><span className="mod-status live"><span className="dot"></span>Live</span></div>
              <div className="mod"><div className="mod-num">16</div><div className="mod-body"><div className="mod-name">LLMs.txt Generator</div><div className="mod-desc">Standard llmstxt.org: brand H1, blockquote, sectiuni.</div></div><div className="mod-tags"><span className="mod-tag geo">GEO</span></div><span className="mod-status live"><span className="dot"></span>Live</span></div>
              <div className="mod"><div className="mod-num">17</div><div className="mod-body"><div className="mod-name">Topical Authority Map</div><div className="mod-desc">Harta vizuala autoritate topica vs competitori.</div></div><div className="mod-tags"><span className="mod-tag seo">SEO</span><span className="mod-tag geo">GEO</span></div><span className="mod-status dev"><span className="dot"></span>Dev</span></div>
              <div className="mod"><div className="mod-num">18</div><div className="mod-body"><div className="mod-name">Competitor Gap Analysis</div><div className="mod-desc">Keywords pe care competitorii rankeza si tu nu.</div></div><div className="mod-tags"><span className="mod-tag seo">SEO</span></div><span className="mod-status live"><span className="dot"></span>Live</span></div>
              <div className="mod"><div className="mod-num">19</div><div className="mod-body"><div className="mod-name">Content Decay Detection</div><div className="mod-desc">Articole care pierd pozitii GSC, refresh eficient.</div></div><div className="mod-tags"><span className="mod-tag seo">SEO</span></div><span className="mod-status live"><span className="dot"></span>Live</span></div>
              <div className="mod"><div className="mod-num">20</div><div className="mod-body"><div className="mod-name">FAQ + PAA Extraction</div><div className="mod-desc">Raspunsuri &lt;60 cuvinte + schema FAQPage.</div></div><div className="mod-tags"><span className="mod-tag aeo">AEO</span></div><span className="mod-status live"><span className="dot"></span>Live</span></div>
              <div className="mod"><div className="mod-num">21</div><div className="mod-body"><div className="mod-name">Cannibalization Detector</div><div className="mod-desc">Pagini concurente: canonical, redirect sau diferentiere.</div></div><div className="mod-tags"><span className="mod-tag seo">SEO</span></div><span className="mod-status live"><span className="dot"></span>Live</span></div>
              <div className="mod"><div className="mod-num">22</div><div className="mod-body"><div className="mod-name">Crawl Budget Optimizer</div><div className="mod-desc">robots.txt + noindex pentru valoare mica.</div></div><div className="mod-tags"><span className="mod-tag seo">SEO</span></div><span className="mod-status live"><span className="dot"></span>Live</span></div>
              <div className="mod"><div className="mod-num">23</div><div className="mod-body"><div className="mod-name">Structured Data Validator</div><div className="mod-desc">Post-inserare valideaza via Rich Results Test.</div></div><div className="mod-tags"><span className="mod-tag aeo">AEO</span></div><span className="mod-status live"><span className="dot"></span>Live</span></div>
              <div className="mod"><div className="mod-num">24</div><div className="mod-body"><div className="mod-name">Brand SERP Monitor</div><div className="mod-desc">Knowledge Panel, sitelinks, review stars.</div></div><div className="mod-tags"><span className="mod-tag seo">SEO</span><span className="mod-tag geo">GEO</span></div><span className="mod-status live"><span className="dot"></span>Live</span></div>
              <div className="mod"><div className="mod-num">25</div><div className="mod-body"><div className="mod-name">Core Web Vitals Monitor</div><div className="mod-desc">Audit CWV via PageSpeed Insights.</div></div><div className="mod-tags"><span className="mod-tag seo">SEO</span></div><span className="mod-status live"><span className="dot"></span>Live</span></div>
              <div className="mod"><div className="mod-num">26</div><div className="mod-body"><div className="mod-name">Search Intent Shift Detection</div><div className="mod-desc">Monitorizeaza tipuri pagini top 10 SERP.</div></div><div className="mod-tags"><span className="mod-tag seo">SEO</span></div><span className="mod-status live"><span className="dot"></span>Live</span></div>
              <div className="mod"><div className="mod-num">27</div><div className="mod-body"><div className="mod-name">Answer Confidence Score</div><div className="mod-desc">Citabilitate AI 0-100: BLUF, date, autor, surse.</div></div><div className="mod-tags"><span className="mod-tag geo">GEO</span></div><span className="mod-status live"><span className="dot"></span>Live</span></div>
              <div className="mod"><div className="mod-num">28</div><div className="mod-body"><div className="mod-name">Citation &amp; Mention Monitor</div><div className="mod-desc">Unde apare brandul online, gaps vs competitori.</div></div><div className="mod-tags"><span className="mod-tag geo">GEO</span></div><span className="mod-status live"><span className="dot"></span>Live</span></div>
              <div className="mod"><div className="mod-num">29</div><div className="mod-body"><div className="mod-name">IndexNow Notifier</div><div className="mod-desc">Notifica instant Bing, Copilot, Yandex.</div></div><div className="mod-tags"><span className="mod-tag seo">SEO</span><span className="mod-tag geo">GEO</span></div><span className="mod-status live"><span className="dot"></span>Live</span></div>
              <div className="mod"><div className="mod-num">30</div><div className="mod-body"><div className="mod-name">AI Traffic Monitor (GA4)</div><div className="mod-desc">Trafic ChatGPT, Gemini, Perplexity, Claude, Copilot.</div></div><div className="mod-tags"><span className="mod-tag seo">SEO</span><span className="mod-tag geo">GEO</span></div><span className="mod-status live"><span className="dot"></span>Live</span></div>
              <div className="mod"><div className="mod-num">31</div><div className="mod-body"><div className="mod-name">Bing AI Performance</div><div className="mod-desc">Citations Copilot/Bing AI, Grounding Queries.</div></div><div className="mod-tags"><span className="mod-tag geo">GEO</span></div><span className="mod-status live"><span className="dot"></span>Live</span></div>
              <div className="mod"><div className="mod-num">32</div><div className="mod-body"><div className="mod-name">LLM Sentiment Analysis</div><div className="mod-desc">Interogheaza AI despre brand, raport sentiment.</div></div><div className="mod-tags"><span className="mod-tag geo">GEO</span></div><span className="mod-status dev"><span className="dot"></span>Dev</span></div>
              <div className="mod"><div className="mod-num">33</div><div className="mod-body"><div className="mod-name">Robots.txt AI Crawlers Audit</div><div className="mod-desc">Verifica GPTBot, ClaudeBot, PerplexityBot.</div></div><div className="mod-tags"><span className="mod-tag seo">SEO</span><span className="mod-tag geo">GEO</span></div><span className="mod-status live"><span className="dot"></span>Live</span></div>
              <div className="mod"><div className="mod-num">34</div><div className="mod-body"><div className="mod-name">Agentic Storefront</div><div className="mod-desc">Actiuni automate: publicare, apply meta, schema batch.</div></div><div className="mod-tags"><span className="mod-tag seo">SEO</span><span className="mod-tag aeo">AEO</span><span className="mod-tag geo">GEO</span></div><span className="mod-status dev"><span className="dot"></span>Dev</span></div>
              <div className="mod"><div className="mod-num">35</div><div className="mod-body"><div className="mod-name">Multilingual SEO Engine</div><div className="mod-desc">Audit hreflang, traducere per Shopify Markets.</div></div><div className="mod-tags"><span className="mod-tag seo">SEO</span></div><span className="mod-status queue"><span className="dot"></span>Queue</span></div>
              <div className="mod"><div className="mod-num">36</div><div className="mod-body"><div className="mod-name">Seasonal Content Calendar</div><div className="mod-desc">Peak-uri sezonale, articole 6-8 saptamani in avans.</div></div><div className="mod-tags"><span className="mod-tag seo">SEO</span></div><span className="mod-status queue"><span className="dot"></span>Queue</span></div>

            </div>
          </section>

          {/* PHASES */}
          <section className="section" id="kb-phases">
            <div className="section-head">
              <h2 className="section-title">Build <em>phases</em></h2>
              <p className="section-desc">Roadmap de implementare in 6 faze, 20 saptamani total. Faza 5 este in curs.</p>
            </div>

            <div className="phases">
              <div className="phase">
                <div className="phase-head"><span className="phase-num">Phase 1</span><span className="phase-badge done">Done</span></div>
                <div className="phase-name">Fundatie &amp; Conectare</div>
                <div className="phase-weeks">Weeks 1-3 · 100%</div>
                <div className="phase-bar"><div className="phase-bar-fill" style={{"width":"100%"}}></div></div>
                <div className="phase-tasks">
                  <div className="task done"><span className="task-mark"></span><span>Shopify OAuth</span></div>
                  <div className="task done"><span className="task-mark"></span><span>Sync produse &amp; imagini</span></div>
                  <div className="task done"><span className="task-mark"></span><span>GSC OAuth2</span></div>
                  <div className="task done"><span className="task-mark"></span><span>DB Prisma + Neon</span></div>
                </div>
              </div>

              <div className="phase">
                <div className="phase-head"><span className="phase-num">Phase 2</span><span className="phase-badge done">Done</span></div>
                <div className="phase-name">Core SEO Engine</div>
                <div className="phase-weeks">Weeks 4-7 · 100%</div>
                <div className="phase-bar"><div className="phase-bar-fill" style={{"width":"100%"}}></div></div>
                <div className="phase-tasks">
                  <div className="task done"><span className="task-mark"></span><span>Keyword Triage</span></div>
                  <div className="task done"><span className="task-mark"></span><span>On-page Audit</span></div>
                  <div className="task done"><span className="task-mark"></span><span>Image Optimizer</span></div>
                  <div className="task done"><span className="task-mark"></span><span>IndexNow</span></div>
                </div>
              </div>

              <div className="phase">
                <div className="phase-head"><span className="phase-num">Phase 3</span><span className="phase-badge done">Done</span></div>
                <div className="phase-name">Content Engine</div>
                <div className="phase-weeks">Weeks 8-11 · 100%</div>
                <div className="phase-bar"><div className="phase-bar-fill" style={{"width":"100%"}}></div></div>
                <div className="phase-tasks">
                  <div className="task done"><span className="task-mark"></span><span>Blog Cluster</span></div>
                  <div className="task done"><span className="task-mark"></span><span>Article Generator</span></div>
                  <div className="task done"><span className="task-mark"></span><span>Internal Linking</span></div>
                  <div className="task done"><span className="task-mark"></span><span>LLMs.txt</span></div>
                </div>
              </div>

              <div className="phase">
                <div className="phase-head"><span className="phase-num">Phase 4</span><span className="phase-badge done">Done</span></div>
                <div className="phase-name">Automatizari Avansate</div>
                <div className="phase-weeks">Weeks 12-15 · 100%</div>
                <div className="phase-bar"><div className="phase-bar-fill" style={{"width":"100%"}}></div></div>
                <div className="phase-tasks">
                  <div className="task done"><span className="task-mark"></span><span>Redirect Manager</span></div>
                  <div className="task done"><span className="task-mark"></span><span>Review Mining</span></div>
                  <div className="task done"><span className="task-mark"></span><span>E-E-A-T Analyzer</span></div>
                  <div className="task done"><span className="task-mark"></span><span>Zero-Click</span></div>
                </div>
              </div>

              <div className="phase current">
                <div className="phase-head"><span className="phase-num">Phase 5</span><span className="phase-badge current">In progress</span></div>
                <div className="phase-name">Intelligence Layer AI</div>
                <div className="phase-weeks">Weeks 16-18 · 64%</div>
                <div className="phase-bar"><div className="phase-bar-fill" style={{"width":"64%"}}></div></div>
                <div className="phase-tasks">
                  <div className="task done"><span className="task-mark"></span><span>Bing AI Performance</span></div>
                  <div className="task done"><span className="task-mark"></span><span>AI Traffic GA4</span></div>
                  <div className="task done"><span className="task-mark"></span><span>Brand SERP Monitor</span></div>
                  <div className="task todo"><span className="task-mark"></span><span>LLM Sentiment</span></div>
                  <div className="task todo"><span className="task-mark"></span><span>Topical Authority</span></div>
                </div>
              </div>

              <div className="phase">
                <div className="phase-head"><span className="phase-num">Phase 6</span><span className="phase-badge queue">Queue</span></div>
                <div className="phase-name">SaaS + Multi-tenant</div>
                <div className="phase-weeks">Weeks 19-20 · 0%</div>
                <div className="phase-bar"><div className="phase-bar-fill" style={{"width":"0%"}}></div></div>
                <div className="phase-tasks">
                  <div className="task todo"><span className="task-mark"></span><span>Shopify Billing API</span></div>
                  <div className="task todo"><span className="task-mark"></span><span>Plan gating</span></div>
                  <div className="task todo"><span className="task-mark"></span><span>Usage tracking</span></div>
                  <div className="task todo"><span className="task-mark"></span><span>Onboarding</span></div>
                </div>
              </div>
            </div>
          </section>


          {/* CAPACITY */}
          <section className="section" id="kb-capacity">
            <div className="section-head">
              <h2 className="section-title">Capacity per <em>shop size</em></h2>
              <p className="section-desc">Cate produse, audituri si articole proceseaza sistemul.</p>
            </div>

            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Catalog</th>
                    <th className="right">Produse</th>
                    <th className="right">Audits/zi</th>
                    <th className="right">Articole/luna</th>
                    <th className="right">IndexNow pings</th>
                    <th className="right">Plan</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td className="kw">Boutique</td><td className="right mono">1,000</td><td className="right mono">~80</td><td className="right mono">8</td><td className="right mono">~600</td><td className="right y">Starter</td></tr>
                  <tr><td className="kw">Growth</td><td className="right mono">5,000</td><td className="right mono">~400</td><td className="right mono">15</td><td className="right mono">~2,500</td><td className="right y">Growth</td></tr>
                  <tr><td className="kw">Mid-market</td><td className="right mono">10,000</td><td className="right mono">~800</td><td className="right mono">15</td><td className="right mono">~5,000</td><td className="right y">Scale</td></tr>
                  <tr><td className="kw">Mid-market+</td><td className="right mono">15,000</td><td className="right mono">~1,200</td><td className="right mono">15</td><td className="right mono">~7,500</td><td className="right y">Scale</td></tr>
                  <tr><td className="kw">Enterprise</td><td className="right mono">20,000</td><td className="right mono">~1,600</td><td className="right mono">15</td><td className="right mono">~10,000</td><td className="right y">Enterprise</td></tr>
                  <tr><td className="kw">Marketplace</td><td className="right mono">50,000</td><td className="right mono">~4,000</td><td className="right mono">15</td><td className="right mono">~25,000</td><td className="right y">Enterprise</td></tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* COMPETITORS */}
          <section className="section" id="kb-competitors">
            <div className="section-head">
              <h2 className="section-title">Competitive <em>matrix</em></h2>
              <p className="section-desc">Kimono SEO vs. Vizby, ShopRankAI, Mento, IndexGPT.</p>
            </div>

            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Feature</th>
                    <th className="center">Vizby</th>
                    <th className="center">ShopRankAI</th>
                    <th className="center">Mento</th>
                    <th className="center">IndexGPT</th>
                    <th className="center us hdr">Kimono SEO</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td className="kw">On-page Audit</td><td className="center y">✓</td><td className="center y">✓</td><td className="center n">—</td><td className="center n">—</td><td className="center us">Complet</td></tr>
                  <tr><td className="kw">Schema auto-insert</td><td className="center n">—</td><td className="center n">—</td><td className="center y">✓</td><td className="center p">basic</td><td className="center us">5 tipuri</td></tr>
                  <tr><td className="kw">Blog AEO+GEO</td><td className="center y">✓</td><td className="center p">basic</td><td className="center n">—</td><td className="center n">—</td><td className="center us">Complet</td></tr>
                  <tr><td className="kw">LLM Sentiment</td><td className="center n">—</td><td className="center n">—</td><td className="center y">✓</td><td className="center y">✓</td><td className="center us">Dedicat</td></tr>
                  <tr><td className="kw">LLMs.txt Generator</td><td className="center n">—</td><td className="center n">—</td><td className="center n">—</td><td className="center y">✓</td><td className="center us">Standard</td></tr>
                  <tr><td className="kw">IndexNow protocol</td><td className="center n">—</td><td className="center n">—</td><td className="center n">—</td><td className="center y">✓</td><td className="center us">Automat</td></tr>
                  <tr><td className="kw">Bing AI Performance</td><td className="center n">—</td><td className="center n">—</td><td className="center n">—</td><td className="center n">—</td><td className="center us">Integrat</td></tr>
                  <tr><td className="kw">AI Traffic GA4</td><td className="center n">—</td><td className="center n">—</td><td className="center n">—</td><td className="center y">✓</td><td className="center us">✓</td></tr>
                  <tr><td className="kw">GSC OAuth</td><td className="center n">—</td><td className="center n">—</td><td className="center n">—</td><td className="center n">—</td><td className="center us">P0</td></tr>
                  <tr><td className="kw">DataForSEO</td><td className="center n">—</td><td className="center n">—</td><td className="center n">—</td><td className="center n">—</td><td className="center us">Complet</td></tr>
                  <tr><td className="kw">Image Optimizer</td><td className="center p">audit</td><td className="center p">audit</td><td className="center n">—</td><td className="center n">—</td><td className="center us">Complet</td></tr>
                  <tr><td className="kw">Robots.txt AI Audit</td><td className="center n">—</td><td className="center n">—</td><td className="center n">—</td><td className="center n">—</td><td className="center us">Onboarding</td></tr>
                  <tr><td className="kw">Multi-shop SaaS</td><td className="center n">—</td><td className="center n">—</td><td className="center n">—</td><td className="center n">—</td><td className="center us">✓</td></tr>
                </tbody>
              </table>
            </div>
          </section>

        </div>

        {/* TOC sticky */}
        <aside className="kb-toc">
          <div className="toc-head">Pe aceasta pagina</div>
          <div className="toc-list">
            <a className="toc-link active" data-toc="kb-modules" onClick={() => scrollToSection("kb-modules")} style={{cursor:"pointer"}}><span>Module</span><span className="toc-num">36</span></a>
            <a className="toc-link" data-toc="kb-phases" onClick={() => scrollToSection("kb-phases")} style={{cursor:"pointer"}}><span>Build Phases</span><span className="toc-num">6</span></a>
            <a className="toc-link" data-toc="kb-capacity" onClick={() => scrollToSection("kb-capacity")} style={{cursor:"pointer"}}><span>Capacity</span><span className="toc-num">7</span></a>
            <a className="toc-link" data-toc="kb-competitors" onClick={() => scrollToSection("kb-competitors")} style={{cursor:"pointer"}}><span>Competitors</span><span className="toc-num">5</span></a>
          </div>
        </aside>
      </div>
    </>
  );
}
