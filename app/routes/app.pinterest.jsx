// app/routes/app.pinterest.jsx
// Kimono SEO — Pinterest SEO Module UI

import { useLoaderData, useNavigate } from "react-router";
import { requireAuth } from "../lib/auth/index.server.js";
import { useState } from "react";

export const loader = async ({ request }) => {
  const { storeId, connection } = await requireAuth(request);
  if (!storeId) return { data: null, connected: false };
  const { getPinterestAuditResults } = await import("../lib/seo/pinterest-seo.server.js");
  return getPinterestAuditResults(storeId);
};

const SCORE_COLOR = (score, max) => {
  const pct = score / max;
  return pct >= 0.8 ? "var(--accent)" : pct >= 0.5 ? "var(--warn)" : "var(--danger)";
};

function ScoreRing({ score, max, size = 48 }) {
  const pct   = score / max;
  const color = SCORE_COLOR(score, max);
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: `conic-gradient(${color} ${pct * 360}deg, var(--surface-3) ${pct * 360}deg)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: size - 10, height: size - 10, borderRadius: "50%", background: "var(--surface)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.28, fontWeight: 800, color }}>
        {score}
      </div>
    </div>
  );
}

function StatusDot({ ok }) {
  return <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: ok ? "var(--accent)" : "var(--danger)", marginRight: 6 }} />;
}

export default function PinterestPage() {
  const { data: init, connected: initConnected } = useLoaderData();
  const navigate  = useNavigate();
  const [data,    setData]    = useState(init);
  const [token,   setToken]   = useState("");
  const [auditing, setAuditing] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState(null);
  const [success, setSuccess] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [posting,  setPosting]  = useState(false);
  const [postResult, setPostResult] = useState(null);
  const [pinHistory, setPinHistory] = useState([]);
  const [boardName, setBoardName] = useState("");
  const [keyword,   setKeyword]   = useState("");
  const [maxPins,   setMaxPins]   = useState(5);
  const [language,  setLanguage]  = useState("ro");
  const [siteUrl,   setSiteUrl]   = useState("");

  async function saveToken() {
    setSaving(true);
    try {
      await fetch("/api/pinterest", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ intent: "save_token", token }),
      });
      setSuccess("Token saved — click Run Audit");
      setTimeout(() => setSuccess(null), 3000);
    } catch (e) { setError(e.message); }
    setSaving(false);
  }

  async function loadHistory() {
    try {
      const r = await fetch("/api/pinterest", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "get_history" }),
      });
      const d = await r.json();
      if (d.history) setPinHistory(d.history);
    } catch {}
  }

  async function postPins() {
    setPosting(true);
    setPostResult(null);
    setError(null);
    try {
      const r = await fetch("/api/pinterest", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "post_pins", boardName, keyword, maxPins, language, siteUrl }),
      });
      const d = await r.json();
      if (d.success) { setPostResult(d); loadHistory(); }
      else setError(d.error);
    } catch (e) { setError(e.message); }
    setPosting(false);
  }

  async function runAudit() {
    setAuditing(true);
    setError(null);
    try {
      const r = await fetch("/api/pinterest", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ intent: "audit" }),
      });
      const d = await r.json();
      if (d.success) setData(d);
      else setError(d.error);
    } catch (e) { setError(e.message); }
    setAuditing(false);
  }

  const summary = data?.summary || {};
  const richPin = data?.richPinCheck || {};
  const profile = data?.profileAudit;
  const boards  = data?.boardAudit || [];
  const pins    = data?.pinAudit   || [];
  const keywords = data?.aiKeywords || [];

  const boardIssueCount = boards.filter(b => b.issues?.length > 0).length;
  const pinIssueCount   = pins.filter(p => p.issues?.length > 0).length;

  return (
    <div className="page active">
      <div className="page-head">
        <div>
          <h1 className="page-title">Pinterest SEO</h1>
          <p className="page-sub">Profile audit, keyword research, Rich Pins verification and optimization for the Pinterest algorithm.</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={runAudit} disabled={auditing}>
            {auditing ? "Auditing..." : "Run Audit"}
          </button>
        </div>
      </div>

      {/* Connect Pinterest */}
      <div className="card" style={{marginBottom:20}}>
        <div className="card-head">
          <div className="card-title">
            Pinterest Business Account Connection
            {data?.connected && <span className="delta up" style={{marginLeft:10}}>Connected</span>}
          </div>
        </div>
        <div style={{padding:"14px 16px"}}>
          <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
            <div style={{flex:1}}>
              <input type="password" className="editor-input" value={token} onChange={e => setToken(e.target.value)} placeholder="Pinterest API access token" style={{border:"1px solid var(--line)",borderRadius:"var(--r-sm)",padding:"7px 11px"}} />
              <div className="editor-hint">
                Get token: <a href="https://developers.pinterest.com/apps/" target="_blank" rel="noopener noreferrer" style={{color:"var(--accent)"}}>developers.pinterest.com</a> &rarr; App &rarr; Generate token &rarr; check: <strong>boards:read + boards:write + pins:read + pins:write + user_accounts:read</strong>
              </div>
            </div>
            <button className="btn btn-ghost" onClick={saveToken} disabled={saving || !token.trim()}>
              {saving ? "Saving..." : success || "Save Token"}
            </button>
          </div>
          <div className="alert-banner info" style={{marginTop:10}}>
            Audit works without a Pinterest token — checks Rich Pin markup and generates keywords from Shopify products. With a token you also get profile, boards and pins audit.
          </div>
        </div>
      </div>

      {error && <div className="alert-banner warn">{error}</div>}

      {/* Always-visible tabs for Auto-Post and History */}
      <div className="subnav" style={{marginBottom:4}}>
        {[["autopost", "Auto-Post"], ["history", "History"]].map(([k, l]) => (
          <button key={k} onClick={() => setActiveTab(k)} className={`subnav-tab ${activeTab === k ? "active" : ""}`}>{l}</button>
        ))}
      </div>

      {data && (
        <>
          {/* Summary stats */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(5, 1fr)",gap:10,marginBottom:20}}>
            {[
              { label: "Rich Pin Score", value: `${richPin.score || 0}/5` },
              { label: "Boards Audited", value: summary.boardsAudited || 0 },
              { label: "Board Issues",   value: boardIssueCount },
              { label: "Pins Audited",   value: summary.pinsAudited  || 0 },
              { label: "Keywords Found", value: keywords.length },
            ].map(s => (
              <div key={s.label} className="metric">
                <div className="metric-label">{s.label}</div>
                <div className="metric-value">{s.value}</div>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div className="subnav">
            {[
              ["overview",  "Overview"],
              ["richpin",   `Rich Pins (${richPin.score || 0}/5)`],
              ["keywords",  `Keywords (${keywords.length})`],
              ["boards",    `Boards (${boards.length})`],
              ["pins",      `Pins (${pins.length})`],
              ...(profile ? [["profile", "Profile"]] : []),
              ["autopost", "Auto-Post"],
              ["history",  "History"],
            ].map(([k, l]) => (
              <button key={k} onClick={() => setActiveTab(k)} className={`subnav-tab ${activeTab === k ? "active" : ""}`}>{l}</button>
            ))}
          </div>

          {/* OVERVIEW */}
          {activeTab === "overview" && (
            <div className="two-col-lg">
              <div className="card">
                <div className="card-head"><div className="card-title">Rich Pin Markup</div></div>
                <div style={{padding:"14px 16px"}}>
                  {[
                    { label: "og:title",       ok: richPin.hasOgTitle },
                    { label: "og:description", ok: richPin.hasOgDescription },
                    { label: "og:image",       ok: richPin.hasOgImage },
                    { label: "og:type",        ok: richPin.hasOgType },
                    { label: "Product Schema", ok: richPin.hasProductSchema },
                  ].map(item => (
                    <div key={item.label} className="data-row" style={{gridTemplateColumns:"auto 1fr auto",padding:"5px 0"}}>
                      <StatusDot ok={item.ok} />
                      <span style={{fontSize:13,color:"var(--ink-1)"}}>{item.label}</span>
                      <span className={item.ok ? "delta up" : "delta down"}>{item.ok ? "Present" : "Missing"}</span>
                    </div>
                  ))}
                  {richPin.score === 5
                    ? <div className="alert-banner ok" style={{marginTop:10}}>Ready for Product Rich Pins activation</div>
                    : <div className="alert-banner warn" style={{marginTop:10}}>Fix missing tags before activating Rich Pins</div>
                  }
                </div>
              </div>

              <div className="card">
                <div className="card-head"><div className="card-title">Board Health</div></div>
                <div style={{padding:"14px 16px"}}>
                  {boards.length === 0
                    ? <div style={{fontSize:13,color:"var(--ink-4)"}}>Connect Pinterest account to audit boards</div>
                    : <>
                      <div style={{display:"flex",gap:10,marginBottom:14}}>
                        <ScoreRing score={summary.avgBoardScore || 0} max={100} size={56} />
                        <div style={{fontSize:12,color:"var(--ink-3)"}}>
                          <div style={{fontWeight:700,color:"var(--ink-0)",marginBottom:2}}>{summary.avgBoardScore || 0}% avg board score</div>
                          <div>{boardIssueCount} of {boards.length} boards have issues</div>
                        </div>
                      </div>
                      {boards.filter(b => b.issues?.length > 0).slice(0, 3).map(b => (
                        <div key={b.id} className="data-row-meta" style={{padding:"3px 0"}}><strong style={{color:"var(--ink-1)"}}>{b.name}</strong> — {b.issues[0]}</div>
                      ))}
                    </>
                  }
                </div>
              </div>

              <div className="alert-banner info" style={{gridColumn:"span 2"}}>
                <div style={{fontWeight:700,marginBottom:8}}>Product Rich Pins — Setup Guide</div>
                <ol style={{paddingLeft:18,margin:0}}>
                  {[
                    "Go to pinterest.com/business/create and create a Business account",
                    "Settings > Claimed Accounts > Add website and verify your domain",
                    "Verify markup: pinterest.com/inspect/?url=https://yourstore.ro/products/test",
                    "If validation passes, Pinterest activates Rich Pins for your entire domain (may take 24h)",
                    `Current markup status: ${richPin.score}/5 tags present ${richPin.score === 5 ? "- Ready" : "- Needs attention"}`,
                  ].map((step, i) => (
                    <li key={i} style={{fontSize:13,padding:"4px 0",lineHeight:1.5}}>{step}</li>
                  ))}
                </ol>
              </div>
            </div>
          )}

          {/* RICH PINS TAB */}
          {activeTab === "richpin" && (
            <div className="card">
              <div className="card-head"><div className="card-title">Open Graph &amp; Schema Markup Check</div></div>
              <div style={{padding:"14px 16px"}}>
                <div className="three-col" style={{marginBottom:20}}>
                  {[
                    { label: "og:title",       ok: richPin.hasOgTitle,       desc: "Pin title" },
                    { label: "og:description", ok: richPin.hasOgDescription, desc: "Pin description" },
                    { label: "og:image",       ok: richPin.hasOgImage,       desc: "Pin image" },
                    { label: "og:type",        ok: richPin.hasOgType,        desc: "Content type" },
                    { label: "Product Schema", ok: richPin.hasProductSchema, desc: "JSON-LD structured data" },
                  ].map(item => (
                    <div key={item.label} className={`alert-banner ${item.ok ? "ok" : "warn"}`}>
                      <span>{item.ok ? "✅" : "❌"}</span>
                      <div>
                        <div style={{fontWeight:700,fontFamily:"var(--mono)",fontSize:13}}>{item.label}</div>
                        <div style={{fontSize:11,opacity:.8}}>{item.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="alert-banner info">
                  <strong>Validator:</strong>{" "}
                  <a href="https://developers.pinterest.com/tools/url-debugger/" target="_blank" rel="noopener noreferrer" style={{color:"var(--accent)"}}>pinterest.com/inspect/ &rarr;</a>
                  <div style={{marginTop:6,fontSize:12,opacity:.8}}>Enter a product URL to preview the Rich Pin.</div>
                </div>
              </div>
            </div>
          )}

          {/* KEYWORDS TAB */}
          {activeTab === "keywords" && (
            <div className="card">
              <div className="card-head"><div className="card-title">AI-Generated Pinterest Keywords</div></div>
              {keywords.length === 0
                ? <div style={{padding:40,textAlign:"center",color:"var(--ink-4)",fontSize:13}}>Run Audit to generate keywords</div>
                : <div style={{padding:"14px 16px"}}>
                    <div className="three-col">
                      {["shopping", "inspiration", "tutorial"].map(intent => {
                        const kws = keywords.filter(k => k.intent === intent);
                        if (!kws.length) return null;
                        return (
                          <div key={intent}>
                            <div className="editor-label">{intent === "shopping" ? "Shopping" : intent === "inspiration" ? "Inspiration" : "Tutorial"}</div>
                            {kws.map((kw, i) => (
                              <div key={i} className="data-row" style={{gridTemplateColumns:"1fr auto",padding:"5px 0"}}>
                                <span style={{fontSize:12,color:"var(--ink-1)"}}>{kw.phrase}</span>
                                <span className="q-tag info">{kw.language}</span>
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                    <div className="alert-banner info" style={{marginTop:14}}>
                      <strong>Usage:</strong> Use these keywords in: profile name, bio, board names, pin titles and descriptions, and image alt text.
                    </div>
                  </div>
              }
            </div>
          )}

          {/* BOARDS TAB */}
          {activeTab === "boards" && (
            <div className="card">
              {boards.length === 0
                ? <div style={{padding:40,textAlign:"center",color:"var(--ink-4)",fontSize:13}}>Connect Pinterest account to audit boards</div>
                : boards.map((board, i) => (
                  <div key={board.id} className="data-row" style={{gridTemplateColumns:"auto 1fr auto"}}>
                    <ScoreRing score={board.score} max={3} size={36} />
                    <div className="data-row-main">
                      <div className="data-row-title">{board.name}</div>
                      <div className="data-row-meta">{board.pinCount} pins</div>
                      {board.issues?.length > 0 && (
                        <div style={{marginTop:4}}>
                          {board.issues.map((issue, ii) => (
                            <div key={ii} style={{fontSize:12,color:"var(--warn)"}}>→ {issue}</div>
                          ))}
                        </div>
                      )}
                    </div>
                    {board.issues?.length === 0
                      ? <span className="delta up">Good</span>
                      : <span className="delta down">{board.issues.length} issue{board.issues.length > 1 ? "s" : ""}</span>
                    }
                  </div>
                ))
              }
            </div>
          )}

          {/* PINS TAB */}
          {activeTab === "pins" && (
            <div className="card">
              {pins.length === 0
                ? <div style={{padding:40,textAlign:"center",color:"var(--ink-4)",fontSize:13}}>Connect Pinterest account to audit pins</div>
                : pins.map((pin, i) => (
                  <div key={pin.id} className="data-row" style={{gridTemplateColumns:"auto 1fr"}}>
                    <ScoreRing score={pin.score} max={5} size={36} />
                    <div className="data-row-main">
                      <div className="data-row-title">{pin.title || "(no title)"}</div>
                      <div className="data-row-meta">Board: {pin.boardName}</div>
                      {pin.issues?.length > 0 && (
                        <div style={{marginTop:4}}>
                          {pin.issues.map((issue, ii) => (
                            <div key={ii} style={{fontSize:11,color:"var(--danger)"}}>→ {issue}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              }
            </div>
          )}

          {/* PROFILE TAB */}
          {activeTab === "profile" && profile && (
            <div className="card">
              <div className="card-head"><div className="card-title">Profile Audit</div></div>
              <div style={{padding:"14px 16px"}}>
                <div style={{display:"flex",gap:16,alignItems:"center",marginBottom:16}}>
                  <ScoreRing score={profile.score} max={profile.maxScore} size={64} />
                  <div>
                    <div style={{fontSize:16,fontWeight:700,color:"var(--ink-0)"}}>@{profile.username}</div>
                    {profile.displayName && <div style={{fontSize:13,color:"var(--ink-3)"}}>{profile.displayName}</div>}
                    <div style={{fontSize:13,color:"var(--ink-4)"}}>{profile.followers?.toLocaleString()} followers</div>
                  </div>
                </div>
                {Object.entries(profile.checks || {}).map(([key, ok]) => (
                  <div key={key} className="data-row" style={{gridTemplateColumns:"auto 1fr auto",padding:"5px 0"}}>
                    <StatusDot ok={ok} />
                    <span style={{fontSize:13,color:"var(--ink-1)"}}>{key.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase())}</span>
                    <span className={ok ? "delta up" : "delta down"}>{ok ? "Pass" : "Fail"}</span>
                  </div>
                ))}
                {profile.recommendations?.length > 0 && (
                  <div className="alert-banner warn" style={{marginTop:14}}>
                    <div style={{fontWeight:700,marginBottom:8}}>Recommendations:</div>
                    {profile.recommendations.map((rec, i) => (
                      <div key={i} style={{fontSize:12,padding:"3px 0"}}>→ {rec}</div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <div style={{marginTop:10,fontSize:11,color:"var(--ink-4)"}}>
            Audited: {new Date(data.auditedAt).toLocaleString("ro-RO")} · {data.productCount} products analyzed
          </div>
        </>
      )}

      {/* AUTO-POST TAB */}
      {activeTab === "autopost" && (
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          <div className="alert-banner warn">
            <div style={{fontWeight:700,marginBottom:8}}>Requirements for Auto-Post</div>
            <ul style={{paddingLeft:18,margin:0,fontSize:13}}>
              <li>Pinterest token with scopes: <code>pins:write</code>, <code>boards:write</code> — requires <strong>Production access</strong></li>
              <li>Shopify products must have images (2:3 ratio, min 1000x1500px recommended)</li>
              <li>Pinterest recommends max 5-15 pins/day</li>
            </ul>
          </div>

          <div className="card">
            <div className="card-head"><div className="card-title">Create Pins from Products</div></div>
            <div style={{padding:"14px 16px"}}>
              <div className="two-col-lg" style={{marginBottom:12}}>
                <div>
                  <label className="editor-label">Board Name</label>
                  <input className="editor-input" value={boardName} onChange={e => setBoardName(e.target.value)} placeholder="ex: Produse Recomandate" style={{border:"1px solid var(--line)",borderRadius:"var(--r-sm)",padding:"7px 11px"}} />
                  <div className="editor-hint">If board doesn't exist, it will be created</div>
                </div>
                <div>
                  <label className="editor-label">Target Keyword</label>
                  <input className="editor-input" value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="ex: tigai fonta" style={{border:"1px solid var(--line)",borderRadius:"var(--r-sm)",padding:"7px 11px"}} />
                  <div className="editor-hint">Claude will include this keyword in title and description</div>
                </div>
                <div>
                  <label className="editor-label">Site URL</label>
                  <input className="editor-input" value={siteUrl} onChange={e => setSiteUrl(e.target.value)} placeholder="https://vivimall.ro" style={{border:"1px solid var(--line)",borderRadius:"var(--r-sm)",padding:"7px 11px"}} />
                </div>
                <div>
                  <label className="editor-label">Language</label>
                  <div className="chip-group">
                    {[["ro", "Romanian"], ["en", "English"]].map(([k, l]) => (
                      <button key={k} onClick={() => setLanguage(k)} className={`chip ${language === k ? "active" : ""}`}>{l}</button>
                    ))}
                  </div>
                </div>
              </div>

              <label className="editor-label">Number of Pins</label>
              <div className="chip-group" style={{marginBottom:16}}>
                {[1, 3, 5, 10].map(n => (
                  <button key={n} onClick={() => setMaxPins(n)} className={`chip ${maxPins === n ? "active" : ""}`}>{n}</button>
                ))}
              </div>
              <div className="editor-hint" style={{marginBottom:16}}>Will use the last {maxPins} products added in Shopify</div>

              <button className="btn btn-primary" onClick={postPins} disabled={posting}>
                {posting ? "Posting..." : "Post Pins Now"}
              </button>
            </div>
          </div>

          {postResult && (
            <div className={`alert-banner ${postResult.failed > 0 ? "warn" : "ok"}`}>
              <div style={{fontWeight:700,marginBottom:10}}>
                {postResult.posted} pins posted · {postResult.failed} failed · Board: {postResult.boardName}
              </div>
              {postResult.results?.map((r, i) => (
                <div key={i} style={{fontSize:12,color: r.status === "posted" ? "var(--accent)" : "var(--danger)",padding:"3px 0"}}>
                  {r.status === "posted" ? "✓" : "✗"} {r.productTitle}
                  {r.pinId && <span style={{color:"var(--ink-4)",marginLeft:8}}>pin:{r.pinId}</span>}
                  {r.error && <span style={{marginLeft:8}}>{r.error}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* HISTORY TAB */}
      {activeTab === "history" && (
        <div>
          <div className="toolbar" style={{marginBottom:12}}>
            <div style={{fontSize:13,fontWeight:700,color:"var(--ink-0)"}}>Pin Posting History</div>
            <button className="btn btn-ghost" onClick={loadHistory}>Refresh</button>
          </div>
          <div className="card">
            {pinHistory.length === 0
              ? <div style={{padding:40,textAlign:"center",color:"var(--ink-4)",fontSize:13}}>No pins posted yet. Use the Auto-Post tab.</div>
              : pinHistory.map((p, i) => (
                <div key={i} className="data-row" style={{gridTemplateColumns:"auto 1fr auto"}}>
                  <span>{p.status === "posted" ? "✅" : "❌"}</span>
                  <div className="data-row-main">
                    <div className="data-row-title">{p.productTitle}</div>
                    <div className="data-row-meta">{p.boardName}{p.pinId ? ` · pin:${p.pinId}` : ""}{p.error ? ` · ${p.error}` : ""}</div>
                  </div>
                  {p.productUrl && <a href={p.productUrl} target="_blank" rel="noopener noreferrer" className="card-action">View &rarr;</a>}
                </div>
              ))
            }
          </div>
        </div>
      )}

      {!data && !auditing && (
        <div className="card" style={{padding:48,textAlign:"center"}}>
          <div style={{fontSize:48,marginBottom:12}}>📌</div>
          <div style={{fontSize:16,fontWeight:700,color:"var(--ink-0)",marginBottom:8}}>Pinterest SEO Audit</div>
          <div style={{fontSize:13,color:"var(--ink-3)",maxWidth:400,margin:"0 auto 20px"}}>
            Check Rich Pin markup, generate keywords from your Shopify products and audit your Pinterest profile. Token is optional.
          </div>
          <button className="btn btn-primary" onClick={runAudit}>Start Audit</button>
        </div>
      )}
    </div>
  );
}
