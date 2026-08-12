import { useLoaderData } from "react-router";
import { useState } from "react";
import { requireAuth } from "../lib/auth/index.server.js";
import prisma from "../db.server.js";

const fmt = (n) => n == null ? "\u2014" : Number(n).toLocaleString("ro-RO");

const JOB_TYPE_LABELS = {
  SYNC: "Sync produse Shopify",
  EXTRACT: "Extractie candidati keywords",
  ENRICH: "Imbogatire DataForSEO",
  TAXONOMY: "Analiza taxonomie AI",
  AUDIT: "On-page audit SEO",
  TAG: "Tagging produse AI",
  PAA_BATCH: "PAA batch enrichment",
};

const JOB_TYPE_COLORS = {
  SYNC: "info",
  EXTRACT: "neutral",
  ENRICH: "ai",
  TAXONOMY: "ai",
  AUDIT: "warn",
  TAG: "ok",
  PAA_BATCH: "info",
};

const STATUS_MAP = {
  DONE: "ok",
  FAILED: "danger",
  RUNNING: "info",
  QUEUED: "neutral",
  CANCELLED: "warn",
};

const JOB_TYPE_ICONS = {
  SYNC: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 12a9 9 0 1 1-6.2-8.6"/><path d="M21 3v5h-5"/></svg>
  ),
  EXTRACT: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
  ),
  ENRICH: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4"/></svg>
  ),
  TAXONOMY: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/></svg>
  ),
  AUDIT: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
  ),
  TAG: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg>
  ),
  PAA_BATCH: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 3v18h18"/><path d="m7 14 4-4 4 4 5-5"/></svg>
  ),
};

export const loader = async ({ request }) => {
  const { user, connection, storeId } = await requireAuth(request);
  if (!storeId) return { stats: null, jobsByDate: [], typeStats: [] };

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const [
    totalToday, completedToday, failedToday,
    totalAll, completedAll, failedAll,
    recentJobs,
    typeStats,
  ] = await Promise.all([
    prisma.seoJob.count({ where: { storeId, queuedAt: { gte: todayStart } } }),
    prisma.seoJob.count({ where: { storeId, status: "DONE", queuedAt: { gte: todayStart } } }),
    prisma.seoJob.count({ where: { storeId, status: "FAILED", queuedAt: { gte: todayStart } } }),
    prisma.seoJob.count({ where: { storeId } }),
    prisma.seoJob.count({ where: { storeId, status: "DONE" } }),
    prisma.seoJob.count({ where: { storeId, status: "FAILED" } }),
    prisma.seoJob.findMany({
      where: { storeId },
      orderBy: { queuedAt: "desc" },
      take: 50,
      select: {
        id: true, type: true, status: true,
        totalItems: true, processedItems: true, progressPct: true,
        statusMessage: true, errorMessage: true,
        queuedAt: true, startedAt: true, finishedAt: true,
      },
    }),
    prisma.seoJob.groupBy({
      by: ["type"],
      where: { storeId },
      _count: { id: true },
    }),
  ]);

  // Group jobs by date
  const grouped = {};
  for (const job of recentJobs) {
    const d = new Date(job.queuedAt);
    const dateKey = d.toISOString().slice(0, 10);
    if (!grouped[dateKey]) grouped[dateKey] = { date: dateKey, label: "", jobs: [] };
    grouped[dateKey].jobs.push(job);
  }

  // Format date labels
  const todayStr = todayStart.toISOString().slice(0, 10);
  const yesterday = new Date(todayStart);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  for (const key of Object.keys(grouped)) {
    if (key === todayStr) {
      grouped[key].label = `Azi \u00b7 ${new Date(key).toLocaleDateString("ro-RO", { day: "numeric", month: "long", year: "numeric" })}`;
    } else if (key === yesterdayStr) {
      grouped[key].label = `Ieri \u00b7 ${new Date(key).toLocaleDateString("ro-RO", { day: "numeric", month: "long", year: "numeric" })}`;
    } else {
      grouped[key].label = new Date(key).toLocaleDateString("ro-RO", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    }
  }

  const jobsByDate = Object.values(grouped).sort((a, b) => b.date.localeCompare(a.date));

  // Format type stats as { type, count }
  const formattedTypeStats = typeStats.map(t => ({ type: t.type, count: t._count.id })).sort((a, b) => b.count - a.count);

  const successRate = totalAll > 0 ? Math.round((completedAll / totalAll) * 100) : 0;

  return {
    stats: {
      totalToday, completedToday, failedToday,
      totalAll, completedAll, failedAll, successRate,
    },
    jobsByDate,
    typeStats: formattedTypeStats,
  };
};

export default function Activity() {
  const data = useLoaderData();
  const s = data?.stats;
  const jobsByDate = data?.jobsByDate || [];
  const typeStats = data?.typeStats || [];

  const totalEvents = jobsByDate.reduce((sum, d) => sum + d.jobs.length, 0);

  return (
    <div className="page active" id="page-activity">

      <div className="page-head">
        <div>
          <div className="greet-kicker">
            <span className="live-dot"></span>
            <span>{s ? `${fmt(s.totalToday)} joburi azi \u00b7 ${fmt(s.completedToday)} complete \u00b7 ${fmt(s.failedToday)} failed` : "Se incarca..."}</span>
          </div>
          <h1 className="page-title">Activity <em>stream</em></h1>
          <p className="page-sub">Tot ce s-a intamplat in sistem \u2014 sync-uri, audituri, tagging, enrichment si mai mult.</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
            Export
          </button>
          <button className="btn btn-primary">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            Subscribe
          </button>
        </div>
      </div>

      {/* Stats strip */}
      <div className="act-stats">
        <div className="act-stat">
          <div className="act-stat-label">Joburi azi</div>
          <div className="act-stat-value">{s ? fmt(s.totalToday) : "\u2014"}</div>
          <div className="act-stat-meta">din total {s ? fmt(s.totalAll) : "\u2014"}</div>
        </div>
        <div className="act-stat">
          <div className="act-stat-label">Completate azi</div>
          <div className="act-stat-value">{s ? fmt(s.completedToday) : "\u2014"}</div>
          <div className="act-stat-meta">din {s ? fmt(s.totalToday) : "\u2014"} joburi</div>
        </div>
        <div className="act-stat">
          <div className="act-stat-label">Failed azi</div>
          <div className="act-stat-value">{s ? fmt(s.failedToday) : "\u2014"}</div>
          <div className="act-stat-meta">din {s ? fmt(s.totalToday) : "\u2014"} joburi</div>
        </div>
        <div className="act-stat">
          <div className="act-stat-label">Completate total</div>
          <div className="act-stat-value">{s ? fmt(s.completedAll) : "\u2014"}</div>
          <div className="act-stat-meta">din {s ? fmt(s.totalAll) : "\u2014"} all-time</div>
        </div>
        <div className="act-stat">
          <div className="act-stat-label">Success rate</div>
          <div className="act-stat-value">{s ? `${s.successRate}%` : "\u2014"}</div>
          <div className="act-stat-meta">all-time</div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="toolbar">
        <div className="toolbar-left">
          <div className="search-input">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
            <input type="text" placeholder="Cauta in activitate..." />
          </div>
          <div className="chip-group">
            <span className="chip active">Toate <span className="ct">{fmt(totalEvents)}</span></span>
            <span className="chip">DONE <span className="ct">{s ? fmt(s.completedAll) : "\u2014"}</span></span>
            <span className="chip">FAILED <span className="ct">{s ? fmt(s.failedAll) : "\u2014"}</span></span>
          </div>
        </div>
        <div className="toolbar-right">
          <div className="seg">
            <button className="active">Azi</button>
            <button>7d</button>
            <button>30d</button>
          </div>
        </div>
      </div>

      <div className="act-layout">
        <div className="act-main">

          <div className="timeline">
            {jobsByDate.length > 0 ? jobsByDate.map((dayGroup) => (
              <div key={dayGroup.date}>
                <div className="tl-day">
                  <span>{dayGroup.label}</span>
                  <span className="tl-day-count">{dayGroup.jobs.length} {dayGroup.jobs.length === 1 ? "job" : "joburi"}</span>
                </div>

                {dayGroup.jobs.map((job) => {
                  const dotClass = STATUS_MAP[job.status] || "neutral";
                  const icon = job.status === "FAILED"
                    ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    : (JOB_TYPE_ICONS[job.type] || JOB_TYPE_ICONS.SYNC);
                  const label = JOB_TYPE_LABELS[job.type] || job.type;
                  const time = new Date(job.queuedAt).toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" });

                  // Duration calc
                  let duration = "\u2014";
                  if (job.startedAt && job.finishedAt) {
                    const ms = new Date(job.finishedAt) - new Date(job.startedAt);
                    duration = ms < 60000 ? `${Math.round(ms/1000)}s` : `${Math.round(ms/60000)}m`;
                  } else if (job.startedAt && !job.finishedAt) {
                    duration = "running...";
                  }

                  // Short status message (trim long ones)
                  const msg = job.statusMessage
                    ? (job.statusMessage.length > 80 ? job.statusMessage.slice(0, 77) + "..." : job.statusMessage)
                    : "";

                  return (
                    <div className="tl-item" key={job.id}>
                      <div className="tl-time">{time}</div>
                      <div className="tl-dot-wrap">
                        <div className={`tl-dot ${dotClass}`}>
                          {icon}
                        </div>
                      </div>
                      <div className="tl-body">
                        <div className="tl-title">
                          {label}
                          {job.status === "FAILED" && <span style={{color:"#dc2626",marginLeft:"8px",fontSize:"12px"}}>[FAILED]</span>}
                          {job.status === "RUNNING" && <span style={{color:"#2563eb",marginLeft:"8px",fontSize:"12px"}}>[RUNNING]</span>}
                          {job.status === "QUEUED" && <span style={{color:"#6b7280",marginLeft:"8px",fontSize:"12px"}}>[QUEUED]</span>}
                          {job.status === "CANCELLED" && <span style={{color:"#d97706",marginLeft:"8px",fontSize:"12px"}}>[CANCELLED]</span>}
                        </div>
                        <div className="tl-meta">
                          <div className="tl-meta-item">Progres: <span>{job.processedItems}/{job.totalItems} ({job.progressPct}%)</span></div>
                          <div className="tl-meta-item">Durata: <span>{duration}</span></div>
                          {msg && <div className="tl-meta-item">Status: <span>{msg}</span></div>}
                          {job.errorMessage && <div className="tl-meta-item" style={{color:"#dc2626"}}>Eroare: <span>{job.errorMessage.length > 80 ? job.errorMessage.slice(0, 77) + "..." : job.errorMessage}</span></div>}
                        </div>
                      </div>
                      <div className="tl-right">
                        <span className="tl-module">{job.type}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )) : (
              <div style={{textAlign:"center",padding:"48px 24px",color:"#9ca3af"}}>Niciun job inregistrat inca. Ruleaza un sync sau audit pentru a vedea activitate.</div>
            )}
          </div>
        </div>

        <aside className="act-side">

          <div className="side-card">
            <div className="side-card-title">Joburi dupa tip</div>
            {typeStats.length > 0 ? typeStats.map((ts, i) => (
              <div className="filter-row on" key={ts.type}>
                <div className="filter-row-label">
                  <span style={{fontFamily:"var(--mono)",fontSize:"10px",color:"var(--ink-4)",width:"18px"}}>{String(i+1).padStart(2, "0")}</span>
                  {JOB_TYPE_LABELS[ts.type] || ts.type}
                </div>
                <span className="filter-row-count">{fmt(ts.count)}</span>
              </div>
            )) : (
              <div style={{textAlign:"center",padding:"16px",color:"#9ca3af",fontSize:"13px"}}>Nicio statistica</div>
            )}
          </div>

          <div className="side-card">
            <div className="side-card-title">Sumar all-time</div>
            <div className="filter-row on">
              <div className="filter-row-label">
                <div className="fico" style={{background:"var(--accent-soft, #dcfce7)",color:"var(--accent-ink, #15803d)"}}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg></div>
                Completate
              </div>
              <span className="filter-row-count">{s ? fmt(s.completedAll) : "\u2014"}</span>
            </div>
            <div className="filter-row on">
              <div className="filter-row-label">
                <div className="fico" style={{background:"var(--danger-soft, #fee2e2)",color:"var(--danger, #dc2626)"}}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg></div>
                Failed
              </div>
              <span className="filter-row-count">{s ? fmt(s.failedAll) : "\u2014"}</span>
            </div>
            <div className="filter-row on">
              <div className="filter-row-label">
                <div className="fico" style={{background:"var(--info-soft, #eff6ff)",color:"var(--info, #2563eb)"}}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 3v18h18"/><path d="m7 14 4-4 4 4 5-5"/></svg></div>
                Total all-time
              </div>
              <span className="filter-row-count">{s ? fmt(s.totalAll) : "\u2014"}</span>
            </div>
            <div className="filter-row">
              <div className="filter-row-label">
                <div className="fico" style={{background:"var(--surface-2, #f3f4f6)",color:"var(--ink-2, #374151)"}}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg></div>
                Success rate
              </div>
              <span className="filter-row-count">{s ? `${s.successRate}%` : "\u2014"}</span>
            </div>
          </div>

        </aside>
      </div>

    </div>



  );
}
