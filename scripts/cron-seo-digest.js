#!/usr/bin/env node
// scripts/cron-seo-digest.js
// Weekly digest email for SEO platform users.
// Run every Monday at 9 AM via crontab.

import { PrismaClient } from "@prisma/client";
import nodemailer from "nodemailer";

const prisma = new PrismaClient();
const APP_URL = process.env.APP_URL || "http://localhost:3000";

function getTransporter() {
  const port = Number(process.env.SMTP_PORT) || 25;
  const config = {
    host:   process.env.SMTP_HOST || "127.0.0.1",
    port,
    secure: port === 465,
  };
  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    config.auth = { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS };
  }
  if (port === 25) config.tls = { rejectUnauthorized: false };
  return nodemailer.createTransport(config);
}

async function run() {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const stores = await prisma.store.findMany({
    where: {
      isActive: true,
      settings: { weeklyDigestEnabled: true },
    },
    select: {
      id: true,
      shopDomain: true,
      shopName: true,
      settings: { select: { weeklyDigestEnabled: true, lastDigestSentAt: true } },
    },
  });

  const transporter = getTransporter();
  let sent = 0, skipped = 0, failed = 0;

  for (const store of stores) {
    const conn = await prisma.storeConnection.findFirst({
      where:   { shopDomain: store.shopDomain, isActive: true },
      orderBy: { connectedAt: "desc" },
      select:  { user: { select: { email: true, name: true } } },
    });
    const email = conn?.user?.email;
    if (!email) { skipped++; continue; }

    try {
      const stats = await computeStats(store.id, since);
      if (stats.noActivity) { skipped++; continue; }

      const html = renderDigest(store, stats);
      await transporter.sendMail({
        from:    process.env.SMTP_FROM || "Kimono SEO <noreply@kimonogroup.ro>",
        to:      email,
        subject: `Sumar săptămânal SEO — ${store.shopName || store.shopDomain}`,
        html,
      });

      await prisma.storeSettings.upsert({
        where:  { storeId: store.id },
        update: { lastDigestSentAt: new Date() },
        create: { storeId: store.id, lastDigestSentAt: new Date() },
      });
      sent++;
    } catch (e) {
      console.error(`[digest] failed for ${store.shopDomain}:`, e.message);
      failed++;
    }
  }

  console.log(`[digest] sent=${sent} skipped=${skipped} failed=${failed}`);
  await prisma.$disconnect();
}

async function computeStats(storeId, since) {
  const [newProducts, newCandidates, enrichedThisWeek, newTags, deletedProducts, appliedProposals, programaticPages] = await Promise.all([
    prisma.seoProduct.count({ where: { storeId, createdAt: { gte: since }, status: { not: "deleted" } } }),
    prisma.seoCandidate.count({ where: { storeId, createdAt: { gte: since } } }),
    prisma.seoCandidate.count({ where: { storeId, enrichedAt: { gte: since } } }),
    prisma.seoTaxonomyProposal.count({ where: { storeId, status: "PENDING", createdAt: { gte: since } } }),
    prisma.seoProduct.count({ where: { storeId, status: "deleted", updatedAt: { gte: since } } }),
    prisma.seoTaxonomyProposal.count({ where: { storeId, status: "APPLIED", appliedAt: { gte: since } } }),
    prisma.pSeoContent.count({ where: { template: { storeId }, createdAt: { gte: since } } }).catch(() => 0),
  ]);

  const noActivity = (newProducts + newCandidates + enrichedThisWeek + newTags + deletedProducts + appliedProposals + programaticPages) === 0;
  return { newProducts, newCandidates, enrichedThisWeek, newTags, deletedProducts, appliedProposals, programaticPages, noActivity };
}

function renderDigest(store, s) {
  const row = (label, count, color = "#0D9488") =>
    count > 0 ? `<tr><td style="padding:8px 0;color:#374151;">${label}</td><td style="padding:8px 0;text-align:right;color:${color};font-weight:600;">${count.toLocaleString()}</td></tr>` : "";

  const name = store.shopName || store.shopDomain;
  return `<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,system-ui,sans-serif;background:#F9FAFB;padding:24px;">
<div style="max-width:580px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;">
  <h1 style="color:#0F172A;font-size:22px;margin:0 0 8px;">Sumar săptămânal SEO</h1>
  <p style="color:#6B7280;font-size:14px;margin:0 0 24px;">${name} — ultimele 7 zile</p>
  <table style="width:100%;border-collapse:collapse;font-size:14px;">
    ${row("Produse noi detectate", s.newProducts)}
    ${row("Candidați keyword noi", s.newCandidates)}
    ${row("Keywords îmbogățiți (DFS)", s.enrichedThisWeek)}
    ${row("Categorii (taxonomy) noi", s.newTags, "#7C3AED")}
    ${row("Propuneri taxonomie aplicate", s.appliedProposals, "#059669")}
    ${row("Pagini programatice publicate", s.programaticPages, "#059669")}
    ${row("Produse șterse din Shopify", s.deletedProducts, "#DC2626")}
  </table>
  <div style="margin-top:24px;padding-top:24px;border-top:1px solid #E5E7EB;">
    <a href="${APP_URL}/app/seo" style="display:inline-block;padding:10px 20px;background:#0D9488;color:#fff;text-decoration:none;border-radius:6px;font-size:13px;font-weight:500;">Deschide dashboard</a>
  </div>
  <p style="color:#9CA3AF;font-size:12px;margin-top:24px;">
    Primești acest email fiindcă ai activat Email săptămânal în Settings → Pipeline SEO automat.
    <br><a href="${APP_URL}/app/seo/settings" style="color:#6B7280;">Dezactivează</a>
  </p>
</div>
</body></html>`;
}

run().catch((e) => {
  console.error("[digest] fatal:", e);
  process.exit(1);
});
