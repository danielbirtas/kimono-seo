import { useLoaderData } from "react-router";
import { useState } from "react";
import { requireAuth } from "../lib/auth/index.server.js";
import prisma from "../db.server.js";

const fmt = (n) => {
  if (n == null) return "\u2014";
  if (typeof n === "number") return n.toLocaleString("ro-RO");
  return String(n);
};

export const loader = async ({ request }) => {
  const { storeId } = await requireAuth(request);
  if (!storeId) return { storeId: null, llmsTxt: null, eeatAudit: null, sentiment: null, zeroClick: [], zeroClickCounts: {}, answerConfidence: [], bingData: null };

  const [
    llmsTxt,
    eeatAudit,
    sentimentSetting,
    zeroClickRows,
    zcPending,
    zcApproved,
    zcApplied,
    answerConfidence,
    bingKeySetting,
  ] = await Promise.all([
    prisma.llmsTxt.findUnique({ where: { storeId } }).catch(() => null),
    prisma.seoEEATAudit.findFirst({ where: { storeId }, orderBy: { createdAt: "desc" } }).catch(() => null),
    prisma.seoSetting.findUnique({ where: { storeId_key: { storeId, key: "llm_sentiment_results" } } }).catch(() => null),
    prisma.seoZeroClickOpt.findMany({
      where: { storeId },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 20,
    }).catch(() => []),
    prisma.seoZeroClickOpt.count({ where: { storeId, status: "pending" } }).catch(() => 0),
    prisma.seoZeroClickOpt.count({ where: { storeId, status: "approved" } }).catch(() => 0),
    prisma.seoZeroClickOpt.count({ where: { storeId, status: "applied" } }).catch(() => 0),
    prisma.seoAnswerConfidence.findMany({
      where: { storeId },
      orderBy: { overallScore: "desc" },
      take: 20,
    }).catch(() => []),
    prisma.seoSetting.findUnique({ where: { storeId_key: { storeId, key: "bing_webmaster_api_key" } } }).catch(() => null),
  ]);

  // Parse sentiment data
  let sentimentData = null;
  try {
    if (sentimentSetting?.value) sentimentData = JSON.parse(sentimentSetting.value);
  } catch {}

  // Parse llms.txt sections
  let llmsSections = [];
  try {
    if (llmsTxt?.sections) llmsSections = typeof llmsTxt.sections === "string" ? JSON.parse(llmsTxt.sections) : llmsTxt.sections;
  } catch {}

  // Parse answer confidence criteria
  const acAvgScore = answerConfidence.length > 0
    ? Math.round(answerConfidence.reduce((s, a) => s + (a.overallScore || 0), 0) / answerConfidence.length)
    : null;

  return {
    storeId,
    llmsTxt: llmsTxt ? {
      score: llmsTxt.score || 0,
      publishedAt: llmsTxt.publishedAt,
      content: (llmsTxt.content || "").slice(0, 2000),
      sectionCount: llmsSections.length,
    } : null,
    eeatAudit: eeatAudit ? {
      experience: eeatAudit.experienceScore,
      expertise: eeatAudit.expertiseScore,
      authoritativeness: eeatAudit.authoritativenessScore,
      trustworthiness: eeatAudit.trustworthinessScore,
      overall: eeatAudit.overallScore,
      createdAt: eeatAudit.createdAt,
    } : null,
    sentiment: sentimentData,
    zeroClick: zeroClickRows,
    zeroClickCounts: { pending: zcPending, approved: zcApproved, applied: zcApplied, total: zcPending + zcApproved + zcApplied },
    answerConfidence,
    acAvgScore,
    hasBingKey: !!bingKeySetting?.value,
  };
};

export default function AiEngines() {
  const data = useLoaderData() || {};
  const {
    llmsTxt = null,
    eeatAudit = null,
    sentiment = null,
    zeroClick = [],
    zeroClickCounts = {},
    answerConfidence = [],
    acAvgScore = null,
    hasBingKey = false,
  } = data;

  const [activeTab, setActiveTab] = useState("ai-traffic");

  // Sentiment helpers
  const sentPlatforms = sentiment?.platforms || sentiment?.results || [];
  const sentOverall = sentiment?.overall || null;

  // Zero-click feature labels
  const featureLabel = (f) => {
    const map = {
      featured_snippet: "FS",
      people_also_ask: "PAA",
      definition: "DEF",
      video_pack: "VID",
      knowledge_panel: "KP",
      list: "LST",
      table: "TBL",
    };
    return map[f] || (f || "?").toUpperCase().slice(0, 3);
  };

  const statusCls = (s) => {
    if (s === "applied") return "live";
    if (s === "approved") return "queue";
    if (s === "pending") return "dev";
    if (s === "dismissed") return "err";
    return "queue";
  };

  return (
    <div className="page active" id="page-ai">

      <div className="page-head">
        <div>
          <div className="greet-kicker">
            <span className="live-dot"></span>
            <span>{zeroClickCounts.total > 0 || llmsTxt || eeatAudit ? `${[llmsTxt && "llms.txt", eeatAudit && "E-E-A-T", zeroClickCounts.total > 0 && "Zero-Click"].filter(Boolean).join(" \u00b7 ")} active` : "AI Engines &mdash; configureaza modulele"}</span>
          </div>
          <h1 className="page-title">AI <em>Engines</em></h1>
          <p className="page-sub">Vizibilitate in motoarele AI, llms.txt, Bing AI Performance, sentiment si optimizare pentru citari.</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost">Refresh</button>
          <button className="btn btn-primary">Regen llms.txt</button>
        </div>
      </div>

      {/* Engine cards overview - show real E-E-A-T scores if available */}
      <div className="three-col" style={{"gridTemplateColumns":"repeat(5,1fr)","marginBottom":"18px"}}>
        <div className="engine-card">
          <div className="engine-card-head">
            <div className="engine-logo-lg" style={{"background":"#0078d4"}}>LT</div>
            <div><div className="engine-card-name">LLMs.txt</div><div className="engine-card-status">{llmsTxt ? "Publicat" : "Neconfigurat"}</div></div>
          </div>
          <div className="engine-stats-row">
            <div className="engine-stat"><div className="engine-stat-lbl">Score</div><div className="engine-stat-val">{llmsTxt ? `${llmsTxt.score}/100` : "\u2014"}</div></div>
            <div className="engine-stat"><div className="engine-stat-lbl">Sectiuni</div><div className="engine-stat-val">{llmsTxt ? fmt(llmsTxt.sectionCount) : "\u2014"}</div></div>
          </div>
          {llmsTxt && (
            <div className="bar-list-item" style={{"border":"none","padding":"0"}}>
              <div><div className="bar-list-name">Completeness</div><div className="bar-list-bar"><div className="bar-list-bar-fill" style={{"width":`${llmsTxt.score}%`,"background":"#0078d4"}}></div></div></div>
              <div className="bar-list-val">{llmsTxt.score}%</div>
            </div>
          )}
        </div>

        <div className="engine-card">
          <div className="engine-card-head">
            <div className="engine-logo-lg" style={{"background":"#16a34a"}}>ET</div>
            <div><div className="engine-card-name">E-E-A-T</div><div className="engine-card-status">{eeatAudit ? "Auditat" : "Neauditat"}</div></div>
          </div>
          <div className="engine-stats-row">
            <div className="engine-stat"><div className="engine-stat-lbl">Overall</div><div className="engine-stat-val">{eeatAudit ? `${eeatAudit.overall}/100` : "\u2014"}</div></div>
            <div className="engine-stat"><div className="engine-stat-lbl">Trust</div><div className="engine-stat-val" style={{"color":"var(--accent-ink)"}}>{eeatAudit ? eeatAudit.trustworthiness : "\u2014"}</div></div>
          </div>
          {eeatAudit && (
            <div className="bar-list-item" style={{"border":"none","padding":"0"}}>
              <div><div className="bar-list-name">Overall score</div><div className="bar-list-bar"><div className="bar-list-bar-fill" style={{"width":`${eeatAudit.overall}%`,"background":"#16a34a"}}></div></div></div>
              <div className="bar-list-val">{eeatAudit.overall}</div>
            </div>
          )}
        </div>

        <div className="engine-card">
          <div className="engine-card-head">
            <div className="engine-logo-lg" style={{"background":"#d97706"}}>ZC</div>
            <div><div className="engine-card-name">Zero-Click</div><div className="engine-card-status">{zeroClickCounts.total > 0 ? `${fmt(zeroClickCounts.total)} oportunitati` : "Niciun scan"}</div></div>
          </div>
          <div className="engine-stats-row">
            <div className="engine-stat"><div className="engine-stat-lbl">Pending</div><div className="engine-stat-val">{fmt(zeroClickCounts.pending)}</div></div>
            <div className="engine-stat"><div className="engine-stat-lbl">Applied</div><div className="engine-stat-val" style={{"color":"var(--accent-ink)"}}>{fmt(zeroClickCounts.applied)}</div></div>
          </div>
        </div>

        <div className="engine-card">
          <div className="engine-card-head">
            <div className="engine-logo-lg" style={{"background":"#cc785c"}}>AC</div>
            <div><div className="engine-card-name">Answer Conf.</div><div className="engine-card-status">{answerConfidence.length > 0 ? `${fmt(answerConfidence.length)} analizate` : "Neauditat"}</div></div>
          </div>
          <div className="engine-stats-row">
            <div className="engine-stat"><div className="engine-stat-lbl">Scor mediu</div><div className="engine-stat-val">{acAvgScore != null ? `${acAvgScore}/100` : "\u2014"}</div></div>
            <div className="engine-stat"><div className="engine-stat-lbl">Total</div><div className="engine-stat-val">{fmt(answerConfidence.length)}</div></div>
          </div>
        </div>

        <div className="engine-card">
          <div className="engine-card-head">
            <div className="engine-logo-lg" style={{"background":"#5c4fff"}}>SN</div>
            <div><div className="engine-card-name">Sentiment</div><div className="engine-card-status">{sentiment ? "Analizat" : "In dev"}</div></div>
          </div>
          <div className="engine-stats-row">
            <div className="engine-stat"><div className="engine-stat-lbl">Positive</div><div className="engine-stat-val" style={{"color":"var(--accent-ink)"}}>{sentOverall?.positive != null ? `${sentOverall.positive}%` : "\u2014"}</div></div>
            <div className="engine-stat"><div className="engine-stat-lbl">Negative</div><div className="engine-stat-val">{sentOverall?.negative != null ? `${sentOverall.negative}%` : "\u2014"}</div></div>
          </div>
        </div>
      </div>

      <div className="subnav">
        <button className={`subnav-tab ${activeTab === "ai-traffic" ? "active" : ""}`} onClick={() => setActiveTab("ai-traffic")} data-subtab="ai-traffic">AI Traffic</button>
        <button className={`subnav-tab ${activeTab === "ai-bing" ? "active" : ""}`} onClick={() => setActiveTab("ai-bing")} data-subtab="ai-bing">Bing AI Performance</button>
        <button className={`subnav-tab ${activeTab === "ai-llmstxt" ? "active" : ""}`} onClick={() => setActiveTab("ai-llmstxt")} data-subtab="ai-llmstxt">LLMs.txt</button>
        <button className={`subnav-tab ${activeTab === "ai-confidence" ? "active" : ""}`} onClick={() => setActiveTab("ai-confidence")} data-subtab="ai-confidence">Answer Confidence</button>
        <button className={`subnav-tab ${activeTab === "ai-eeat" ? "active" : ""}`} onClick={() => setActiveTab("ai-eeat")} data-subtab="ai-eeat">E-E-A-T</button>
        <button className={`subnav-tab ${activeTab === "ai-sentiment" ? "active" : ""}`} onClick={() => setActiveTab("ai-sentiment")} data-subtab="ai-sentiment">LLM Sentiment <span className="sn-pill">Dev</span></button>
        <button className={`subnav-tab ${activeTab === "ai-zeroclick" ? "active" : ""}`} onClick={() => setActiveTab("ai-zeroclick")} data-subtab="ai-zeroclick">Zero-Click</button>
      </div>

      {/* PANEL: TRAFFIC */}
      <div className={`subnav-panel ${activeTab === "ai-traffic" ? "active" : ""}`} id="ai-traffic">
        <div className="two-col-sm">
          <div className="chart-card">
            <div className="chart-head">
              <div>
                <div className="chart-title">Trafic organic din AI &middot; overview</div>
                <div className="chart-meta">Conecteaza GA4 pentru date reale de trafic din motoare AI</div>
              </div>
            </div>
            <svg className="chart-svg" viewBox="0 0 480 160" preserveAspectRatio="none">
              <line className="grid" x1="0" y1="32" x2="480" y2="32"/>
              <line className="grid" x1="0" y1="64" x2="480" y2="64"/>
              <line className="grid" x1="0" y1="96" x2="480" y2="96"/>
              <line className="grid" x1="0" y1="128" x2="480" y2="128"/>
              <text className="label" x="240" y="80" textAnchor="middle">Conecteaza GA4 pentru date</text>
            </svg>
          </div>

          <div className="card">
            <div className="card-head"><div className="card-title">Module AI active</div></div>
            <div style={{"padding":"4px 0"}}>
              <div className="data-row" style={{"gridTemplateColumns":"1fr auto"}}>
                <div className="data-row-main"><div className="data-row-title">LLMs.txt</div><div className="data-row-meta">{llmsTxt ? `Score: ${llmsTxt.score}/100 \u00b7 Publicat` : "Neconfigurat"}</div></div>
                <span className={`mod-status ${llmsTxt ? "live" : "queue"}`}><span className="dot"></span>{llmsTxt ? "OK" : "Off"}</span>
              </div>
              <div className="data-row" style={{"gridTemplateColumns":"1fr auto"}}>
                <div className="data-row-main"><div className="data-row-title">E-E-A-T Audit</div><div className="data-row-meta">{eeatAudit ? `Overall: ${eeatAudit.overall}/100` : "Neauditat"}</div></div>
                <span className={`mod-status ${eeatAudit ? "live" : "queue"}`}><span className="dot"></span>{eeatAudit ? "OK" : "Off"}</span>
              </div>
              <div className="data-row" style={{"gridTemplateColumns":"1fr auto"}}>
                <div className="data-row-main"><div className="data-row-title">Zero-Click Optimization</div><div className="data-row-meta">{zeroClickCounts.total > 0 ? `${fmt(zeroClickCounts.applied)} aplicate din ${fmt(zeroClickCounts.total)}` : "Niciun scan"}</div></div>
                <span className={`mod-status ${zeroClickCounts.total > 0 ? "live" : "queue"}`}><span className="dot"></span>{zeroClickCounts.total > 0 ? "OK" : "Off"}</span>
              </div>
              <div className="data-row" style={{"gridTemplateColumns":"1fr auto"}}>
                <div className="data-row-main"><div className="data-row-title">Answer Confidence</div><div className="data-row-meta">{answerConfidence.length > 0 ? `${fmt(answerConfidence.length)} pagini \u00b7 avg ${acAvgScore || 0}/100` : "Neauditat"}</div></div>
                <span className={`mod-status ${answerConfidence.length > 0 ? "live" : "queue"}`}><span className="dot"></span>{answerConfidence.length > 0 ? "OK" : "Off"}</span>
              </div>
              <div className="data-row" style={{"gridTemplateColumns":"1fr auto"}}>
                <div className="data-row-main"><div className="data-row-title">LLM Sentiment</div><div className="data-row-meta">{sentiment ? "Ultima rulare disponibila" : "Modul in dev"}</div></div>
                <span className={`mod-status ${sentiment ? "live" : "dev"}`}><span className="dot"></span>{sentiment ? "OK" : "Dev"}</span>
              </div>
              <div className="data-row" style={{"gridTemplateColumns":"1fr auto"}}>
                <div className="data-row-main"><div className="data-row-title">Bing AI / Copilot</div><div className="data-row-meta">{hasBingKey ? "API key configurat" : "API key neconfigurat"}</div></div>
                <span className={`mod-status ${hasBingKey ? "live" : "queue"}`}><span className="dot"></span>{hasBingKey ? "OK" : "Off"}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* PANEL: BING */}
      <div className={`subnav-panel ${activeTab === "ai-bing" ? "active" : ""}`} id="ai-bing">
        {hasBingKey ? (
          <div className="card">
            <div className="card-head"><div className="card-title">Bing AI / Copilot Performance</div></div>
            <div style={{"padding":"30px","textAlign":"center","color":"var(--ink-3)","fontSize":"13px"}}>
              API key configurat. Mergi la <b>Bing AI Performance</b> pentru date detaliate.
            </div>
          </div>
        ) : (
          <div className="card" style={{"textAlign":"center","padding":"40px","color":"var(--ink-3)"}}>
            <p>Configureaza Bing Webmaster API key pentru a vedea Copilot citations si grounding queries.</p>
            <p style={{"marginTop":"8px","fontSize":"12px"}}>Mergi la Settings &rarr; Bing Webmaster API Key</p>
          </div>
        )}
      </div>

      {/* PANEL: LLMS.TXT */}
      <div className={`subnav-panel ${activeTab === "ai-llmstxt" ? "active" : ""}`} id="ai-llmstxt">
        <div className="two-col-sm">
          <div className="card">
            <div className="card-head">
              <div className="card-title">/llms.txt {llmsTxt ? "\u00b7 publicat" : "\u00b7 neconfigurat"}</div>
              {llmsTxt && <span className="count" style={{"fontSize":"10.5px","color":"var(--accent-ink)","background":"var(--accent-soft)","padding":"2px 7px","borderRadius":"10px","fontWeight":"600"}}>Score: {llmsTxt.score}/100</span>}
            </div>
            {llmsTxt?.content ? (
              <div className="code-wrap" style={{"borderRadius":"0","border":"none","margin":"0"}}>
                <div className="code-preview-head"><span>llms.txt &middot; text/plain</span><button className="copy">Copy</button></div>
                <pre style={{"maxHeight":"400px","overflow":"auto","whiteSpace":"pre-wrap","fontSize":"11px","lineHeight":"1.6","padding":"14px 16px","color":"var(--ink-1)","fontFamily":"var(--mono)"}}>{llmsTxt.content}</pre>
              </div>
            ) : (
              <div style={{"padding":"30px","textAlign":"center","color":"var(--ink-3)","fontSize":"13px"}}>
                Niciun fisier llms.txt generat inca. Apasa &bdquo;Regen llms.txt&rdquo; pentru a genera.
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-head"><div className="card-title">Configurare &amp; status</div></div>
            <div className="config-list" style={{"border":"none","borderRadius":"0"}}>
              <div className="config-row">
                <div className="config-row-main">
                  <div className="config-row-title">Status publicare</div>
                  <div className="config-row-desc">{llmsTxt?.publishedAt ? `Publicat: ${new Date(llmsTxt.publishedAt).toLocaleDateString("ro-RO")}` : "Nepublicat"}</div>
                </div>
                <span className={`mod-status ${llmsTxt?.publishedAt ? "live" : "queue"}`}><span className="dot"></span>{llmsTxt?.publishedAt ? "Live" : "Draft"}</span>
              </div>
              <div className="config-row">
                <div className="config-row-main">
                  <div className="config-row-title">Completeness score</div>
                  <div className="config-row-desc">{llmsTxt ? `${llmsTxt.score}/100` : "N/A"}</div>
                </div>
                <div style={{"fontFamily":"var(--mono)","fontSize":"12px","color":"var(--ink-1)"}}>{llmsTxt ? `${llmsTxt.sectionCount} sectiuni` : "\u2014"}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* PANEL: CONFIDENCE */}
      <div className={`subnav-panel ${activeTab === "ai-confidence" ? "active" : ""}`} id="ai-confidence">
        <div className="two-col-sm">
          <div className="card">
            <div className="card-head">
              <div className="card-title">Answer Confidence Score &middot; 0-100</div>
              {acAvgScore != null && <span className="count" style={{"fontSize":"10.5px","color":"var(--info)","background":"var(--info-soft)","padding":"2px 7px","borderRadius":"10px","fontWeight":"600"}}>Scor mediu: {acAvgScore}/100</span>}
            </div>
            {answerConfidence.length > 0 ? (
              <div style={{"padding":"14px 16px"}}>
                {answerConfidence.slice(0, 8).map((ac, i) => {
                  let criteria = [];
                  try { criteria = typeof ac.criteria === "string" ? JSON.parse(ac.criteria) : (ac.criteria || []); } catch {}
                  return (
                    <div key={i} style={{"marginBottom":"14px","paddingBottom":"14px","borderBottom":"1px solid var(--line)"}}>
                      <div style={{"display":"flex","justifyContent":"space-between","alignItems":"center","marginBottom":"6px"}}>
                        <div style={{"fontSize":"13px","fontWeight":"500","color":"var(--ink-0)"}}>{ac.sourceTitle || `Page ${i + 1}`}</div>
                        <span style={{"fontFamily":"var(--mono)","fontSize":"13px","fontWeight":"600","color": ac.overallScore >= 70 ? "var(--accent-ink)" : "var(--warn)"}}>{ac.overallScore}/100</span>
                      </div>
                      <div className="prog"><div className={`prog-fill ${ac.overallScore >= 70 ? "ok" : "warn"}`} style={{"width":`${ac.overallScore}%`}}></div></div>
                      {criteria.length > 0 && (
                        <div style={{"marginTop":"6px","display":"flex","flexWrap":"wrap","gap":"4px"}}>
                          {criteria.slice(0, 3).map((c, j) => (
                            <span key={j} className="q-tag info" style={{"fontSize":"10px"}}>{c.name}: {c.score}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{"padding":"30px","textAlign":"center","color":"var(--ink-3)","fontSize":"13px"}}>
                Niciun audit Answer Confidence inca. Ruleaza auditul din modulul dedicat.
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-head"><div className="card-title">Distribuire scoruri</div></div>
            <div style={{"padding":"14px 16px"}}>
              {answerConfidence.length > 0 ? (
                <>
                  <div style={{"display":"grid","gridTemplateColumns":"1fr 1fr 1fr","gap":"10px","marginBottom":"14px"}}>
                    <div style={{"textAlign":"center","padding":"10px","background":"var(--accent-soft)","borderRadius":"6px"}}>
                      <div style={{"fontSize":"20px","fontWeight":"600","color":"var(--accent-ink)","fontVariantNumeric":"tabular-nums"}}>{answerConfidence.filter(a => a.overallScore >= 70).length}</div>
                      <div style={{"fontSize":"11px","color":"var(--accent-ink)","marginTop":"2px"}}>&gt;70 (bun)</div>
                    </div>
                    <div style={{"textAlign":"center","padding":"10px","background":"var(--warn-soft)","borderRadius":"6px"}}>
                      <div style={{"fontSize":"20px","fontWeight":"600","color":"var(--warn)","fontVariantNumeric":"tabular-nums"}}>{answerConfidence.filter(a => a.overallScore >= 40 && a.overallScore < 70).length}</div>
                      <div style={{"fontSize":"11px","color":"var(--warn)","marginTop":"2px"}}>40-70 (mediu)</div>
                    </div>
                    <div style={{"textAlign":"center","padding":"10px","background":"var(--danger-soft)","borderRadius":"6px"}}>
                      <div style={{"fontSize":"20px","fontWeight":"600","color":"var(--danger)","fontVariantNumeric":"tabular-nums"}}>{answerConfidence.filter(a => a.overallScore < 40).length}</div>
                      <div style={{"fontSize":"11px","color":"var(--danger)","marginTop":"2px"}}>&lt;40 (slab)</div>
                    </div>
                  </div>
                  <div style={{"display":"grid","gridTemplateColumns":"1fr 1fr","gap":"10px"}}>
                    <div><div style={{"fontSize":"11px","color":"var(--ink-3)"}}>Total analizate</div><div style={{"fontSize":"18px","fontWeight":"600","color":"var(--ink-0)","fontVariantNumeric":"tabular-nums"}}>{fmt(answerConfidence.length)}</div></div>
                    <div><div style={{"fontSize":"11px","color":"var(--ink-3)"}}>Recomandate refresh</div><div style={{"fontSize":"18px","fontWeight":"600","color":"var(--danger)","fontVariantNumeric":"tabular-nums"}}>{answerConfidence.filter(a => a.overallScore < 60).length}</div></div>
                  </div>
                </>
              ) : (
                <div style={{"textAlign":"center","color":"var(--ink-3)","fontSize":"13px","padding":"20px"}}>No data yet</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* PANEL: E-E-A-T */}
      <div className={`subnav-panel ${activeTab === "ai-eeat" ? "active" : ""}`} id="ai-eeat">
        {eeatAudit ? (
          <>
            <div className="metric-grid">
              <div className="metric"><div className="metric-label">Experience</div><div className="metric-value">{eeatAudit.experience}<span className="unit">/100</span></div><div className="prog"><div className={`prog-fill ${eeatAudit.experience >= 70 ? "ok" : "warn"}`} style={{"width":`${eeatAudit.experience}%`}}></div></div></div>
              <div className="metric"><div className="metric-label">Expertise</div><div className="metric-value">{eeatAudit.expertise}<span className="unit">/100</span></div><div className="prog"><div className={`prog-fill ${eeatAudit.expertise >= 70 ? "ok" : "warn"}`} style={{"width":`${eeatAudit.expertise}%`}}></div></div></div>
              <div className="metric"><div className="metric-label">Authoritativeness</div><div className="metric-value">{eeatAudit.authoritativeness}<span className="unit">/100</span></div><div className="prog"><div className={`prog-fill ${eeatAudit.authoritativeness >= 70 ? "ok" : "warn"}`} style={{"width":`${eeatAudit.authoritativeness}%`}}></div></div></div>
              <div className="metric"><div className="metric-label">Trustworthiness</div><div className="metric-value">{eeatAudit.trustworthiness}<span className="unit">/100</span></div><div className="prog"><div className={`prog-fill ${eeatAudit.trustworthiness >= 70 ? "ok" : "warn"}`} style={{"width":`${eeatAudit.trustworthiness}%`}}></div></div></div>
            </div>
            <div className="card" style={{"marginTop":"14px"}}>
              <div className="card-head"><div className="card-title">Overall E-E-A-T Score</div></div>
              <div style={{"padding":"14px 16px","display":"flex","alignItems":"center","gap":"16px"}}>
                <div style={{"fontSize":"36px","fontWeight":"700","color": eeatAudit.overall >= 70 ? "var(--accent-ink)" : "var(--warn)","fontVariantNumeric":"tabular-nums"}}>{eeatAudit.overall}</div>
                <div style={{"flex":"1"}}>
                  <div className="prog" style={{"height":"12px"}}><div className={`prog-fill ${eeatAudit.overall >= 70 ? "ok" : "warn"}`} style={{"width":`${eeatAudit.overall}%`}}></div></div>
                  <div style={{"fontSize":"11px","color":"var(--ink-3)","marginTop":"6px"}}>Ultima rulare: {eeatAudit.createdAt ? new Date(eeatAudit.createdAt).toLocaleDateString("ro-RO") : "\u2014"}</div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="card" style={{"textAlign":"center","padding":"40px","color":"var(--ink-3)"}}>
            <p>Niciun audit E-E-A-T rulat inca. Ruleaza primul audit din modulul E-E-A-T.</p>
          </div>
        )}
      </div>

      {/* PANEL: SENTIMENT */}
      <div className={`subnav-panel ${activeTab === "ai-sentiment" ? "active" : ""}`} id="ai-sentiment">
        <div className="alert-banner info">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
          <span><b>Modul experimental.</b> Interogheaza AI engines cu intrebari despre brand si analizeaza sentimentul.</span>
        </div>

        <div className="two-col-sm">
          <div className="card">
            <div className="card-head"><div className="card-title">Sentiment general</div></div>
            {sentiment ? (
              <div style={{"padding":"14px 16px"}}>
                {sentOverall && (
                  <div className="sent-bar" style={{"height":"36px","marginBottom":"14px"}}>
                    {sentOverall.positive > 0 && <div className="sent-seg pos" style={{"width":`${sentOverall.positive}%`}}>{sentOverall.positive}% pozitiv</div>}
                    {sentOverall.neutral > 0 && <div className="sent-seg neu" style={{"width":`${sentOverall.neutral}%`}}>{sentOverall.neutral}%</div>}
                    {sentOverall.negative > 0 && <div className="sent-seg neg" style={{"width":`${sentOverall.negative}%`}}>{sentOverall.negative}%</div>}
                  </div>
                )}
                {Array.isArray(sentPlatforms) && sentPlatforms.length > 0 && (
                  <>
                    <div style={{"fontSize":"11px","color":"var(--ink-3)","textTransform":"uppercase","letterSpacing":".08em","fontWeight":"600","marginBottom":"10px"}}>Per engine</div>
                    {sentPlatforms.map((p, i) => (
                      <div className="bar-list-item" style={{"border":"none","padding":"7px 0"}} key={i}>
                        <div><div className="bar-list-name">{p.platform || p.name || `Engine ${i + 1}`}</div><div className="bar-list-bar"><div className="bar-list-bar-fill" style={{"width":`${p.positive || p.score || 0}%`,"background":"var(--accent)"}}></div></div></div>
                        <div className="bar-list-val" style={{"color":"var(--accent-ink)"}}>{p.positive || p.score || 0}%</div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            ) : (
              <div style={{"padding":"30px","textAlign":"center","color":"var(--ink-3)","fontSize":"13px"}}>
                Niciun scan de sentiment inca. Ruleaza din modulul LLM Sentiment.
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-head"><div className="card-title">Asocieri brand</div></div>
            {sentiment?.associations || sentiment?.keywords ? (
              <div style={{"padding":"14px 16px"}}>
                <div style={{"display":"flex","flexWrap":"wrap","gap":"6px"}}>
                  {(sentiment.associations || sentiment.keywords || []).slice(0, 12).map((a, i) => {
                    const label = typeof a === "string" ? a : (a.keyword || a.text || a.label || "");
                    const count = typeof a === "object" ? (a.count || a.frequency || "") : "";
                    return (
                      <span className="chip" style={{"background":"var(--accent-soft)","color":"var(--accent-ink)","borderColor":"transparent"}} key={i}>
                        {label} {count && <span className="ct">{count}&times;</span>}
                      </span>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div style={{"padding":"30px","textAlign":"center","color":"var(--ink-3)","fontSize":"13px"}}>No brand association data yet</div>
            )}
          </div>
        </div>
      </div>

      {/* PANEL: ZERO-CLICK */}
      <div className={`subnav-panel ${activeTab === "ai-zeroclick" ? "active" : ""}`} id="ai-zeroclick">
        <div className="two-col-sm">
          <div className="card">
            <div className="card-head"><div className="card-title">Oportunitati Zero-Click <span className="count">{fmt(zeroClickCounts.total)}</span></div></div>
            {zeroClick.length > 0 ? (
              <div style={{"padding":"4px 0"}}>
                {zeroClick.slice(0, 12).map((z, i) => (
                  <div className="data-row" style={{"gridTemplateColumns":"auto 1fr auto auto"}} key={i}>
                    <span className={`q-card-prio ${z.serpFeature === "featured_snippet" ? "p0" : "p1"}`}>{featureLabel(z.serpFeature)}</span>
                    <div className="data-row-main">
                      <div className="data-row-title">{z.keyword}</div>
                      <div className="data-row-meta mono">{z.recommendedFormat ? `Format: ${z.recommendedFormat}` : ""} {z.competitorUrl ? `\u00b7 competitor: ${z.competitorUrl.slice(0, 40)}...` : ""}</div>
                    </div>
                    <span className={`mod-status ${statusCls(z.status)}`}><span className="dot"></span>{z.status || "\u2014"}</span>
                    <button className="row-action">Go</button>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{"padding":"30px","textAlign":"center","color":"var(--ink-3)","fontSize":"13px"}}>
                Nicio oportunitate Zero-Click gasita inca. Ruleaza un scan din modulul dedicat.
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-head"><div className="card-title">Format targeting</div></div>
            <div style={{"padding":"14px 16px"}}>
              {zeroClick.length > 0 ? (
                <div style={{"display":"flex","flexDirection":"column","gap":"14px"}}>
                  {["featured_snippet", "people_also_ask", "definition", "list", "table"].map((feat) => {
                    const count = zeroClick.filter(z => z.serpFeature === feat).length;
                    const applied = zeroClick.filter(z => z.serpFeature === feat && z.status === "applied").length;
                    if (count === 0) return null;
                    return (
                      <div key={feat}>
                        <div style={{"display":"flex","justifyContent":"space-between","alignItems":"center","marginBottom":"6px"}}>
                          <div style={{"fontSize":"13px","fontWeight":"600","color":"var(--ink-0)"}}>{featureLabel(feat)}</div>
                          <span className={`mod-status ${applied > 0 ? "live" : "dev"}`}><span className="dot"></span>{applied} / {count}</span>
                        </div>
                        <div className="prog"><div className={`prog-fill ${applied > 0 ? "ok" : "warn"}`} style={{"width":`${count > 0 ? (applied / count) * 100 : 0}%`}}></div></div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{"textAlign":"center","color":"var(--ink-3)","fontSize":"13px","padding":"20px"}}>No zero-click data yet</div>
              )}
            </div>
          </div>
        </div>
      </div>

    </div>



  );
}
