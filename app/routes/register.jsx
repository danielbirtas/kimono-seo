// app/routes/register.jsx — Kimono SEO register
import { Form, useActionData, useNavigation, Link, useLoaderData, useSearchParams } from "react-router";
import { useState, useEffect } from "react";
import { redirect } from "react-router";
import crypto from "crypto";
import { hashPassword } from "../lib/auth/password.server.js";
import { sendVerifyEmail } from "../lib/auth/email.server.js";
import prisma from "../db.server.js";

export const meta = () => [{ title: "Creează cont — Kimono SEO" }];

const VALID_PLANS = ["TRIAL", "STARTER", "GROWTH", "AGENCY"];

export const loader = async ({ request }) => {
  const { requireGuest } = await import("../lib/auth/middleware.server.js");
  await requireGuest(request);
  const url = new URL(request.url);
  const plan = url.searchParams.get("plan") || "TRIAL";
  return { plan: VALID_PLANS.includes(plan) ? plan : "TRIAL" };
};

export const action = async ({ request }) => {
  const { rateLimit } = await import("../lib/rate-limit.server.js");
  rateLimit(request, { key: "register", windowMs: 60_000, max: 5 });

  const formData = await request.formData();
  const name = formData.get("name")?.toString().trim();
  const email = formData.get("email")?.toString().toLowerCase().trim();
  const password = formData.get("password")?.toString();
  const confirm = formData.get("confirm")?.toString();
  const planRaw = formData.get("plan")?.toString() || "TRIAL";
  const plan = VALID_PLANS.includes(planRaw) ? planRaw : "TRIAL";

  if (!name || !email || !password) return { error: "Toate câmpurile obligatorii trebuie completate." };
  if (password.length < 8) return { error: "Parola trebuie să aibă minim 8 caractere." };
  if (password !== confirm) return { error: "Parolele nu coincid." };

  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) return { error: "Există deja un cont cu acest email." };

  const passwordHash = await hashPassword(password);
  const verifyToken = crypto.randomBytes(32).toString("hex");
  const trialEndsAt = plan === "TRIAL" ? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) : null;

  await prisma.user.create({
    data: {
      email,
      passwordHash,
      name,
      plan,
      trialEndsAt,
      planStartedAt: new Date(),
      verifyToken,
      emailVerified: false,
    },
  });

  try {
    await sendVerifyEmail(email, verifyToken);
  } catch (e) {
    console.error("Failed to send verify email:", e);
  }

  return { success: true, registeredEmail: email };
};

const TOK = {
  black: "#0F172A",
  white: "#FFFFFF",
  off: "#F8FAFC",
  accent: "#0D9488",
  accentHover: "#0F766E",
  accentLight: "#CCFBF1",
  muted: "#475569",
  border: "#E2E8F0",
  danger: "#DC2626",
  success: "#10B981",
};
const FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif";

const PLAN_LABELS = {
  TRIAL: "Trial — 14 zile gratuit",
  STARTER: "Starter — 99 RON/lună",
  GROWTH: "Growth — 199 RON/lună",
  AGENCY: "Agency — 499 RON/lună",
};

export default function Register() {
  const { plan: initialPlan } = useLoaderData();
  const data = useActionData();
  const navigation = useNavigation();
  const loading = navigation.state !== "idle";
  const [params] = useSearchParams();
  const plan = params.get("plan") && VALID_PLANS.includes(params.get("plan")) ? params.get("plan") : initialPlan;

  // Success state
  if (data?.success) {
    return (
      <div style={{ minHeight: "100vh", background: TOK.off, fontFamily: FONT, display: "flex", flexDirection: "column", color: TOK.black }}>
        <Header />
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 20px" }}>
          <div style={{ width: "100%", maxWidth: 440 }}>
            <div style={{ background: TOK.white, border: `1px solid ${TOK.border}`, borderRadius: 12, padding: 36, boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)", textAlign: "center" }}>
              <div style={{ width: 64, height: 64, background: TOK.accentLight, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={TOK.accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                </svg>
              </div>
              <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 10, letterSpacing: "-0.01em", margin: "0 0 10px" }}>
                Verifică inbox-ul
              </h2>
              <p style={{ fontSize: 14, color: TOK.muted, lineHeight: 1.6, marginBottom: 20 }}>
                Am trimis un email de confirmare la <strong style={{ color: TOK.black }}>{data.registeredEmail}</strong>.
                Apasă butonul din email pentru a-ți activa contul.
              </p>
              <p style={{ fontSize: 12, color: TOK.muted, marginBottom: 20 }}>
                Nu ai primit emailul? Verifică folderul Spam sau{" "}
                <Link to="/resend" style={{ color: TOK.accent, fontWeight: 600 }}>retrimite link-ul</Link>.
              </p>
              <Link to="/login" style={{
                display: "block",
                width: "100%",
                padding: "11px 20px",
                background: TOK.white,
                color: TOK.black,
                border: `1px solid ${TOK.border}`,
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                textAlign: "center",
                textDecoration: "none",
                boxSizing: "border-box",
              }}>
                Înapoi la login
              </Link>
            </div>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: TOK.off, fontFamily: FONT, display: "flex", flexDirection: "column", color: TOK.black }}>
      <Header />

      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 20px" }}>
        <div style={{ width: "100%", maxWidth: 440 }}>
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2.5, textTransform: "uppercase", color: TOK.accent, marginBottom: 10 }}>
              Cont nou
            </div>
            <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.02em", margin: "0 0 8px" }}>
              Creează cont Kimono SEO
            </h1>
            <p style={{ fontSize: 14, color: TOK.muted, margin: 0 }}>
              {PLAN_LABELS[plan]}. Fără card necesar.
            </p>
          </div>

          <div style={{ background: TOK.white, border: `1px solid ${TOK.border}`, borderRadius: 12, padding: 32, boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}>
            {plan === "TRIAL" && (
              <div style={{
                background: TOK.accentLight,
                border: `1px solid ${TOK.accent}`,
                color: "#134E4A",
                padding: "10px 14px",
                fontSize: 13,
                fontWeight: 500,
                marginBottom: 20,
                borderRadius: 8,
              }}>
                ✓ 14 zile trial gratuit · 50 analize AI · Fără card de credit
              </div>
            )}

            {data?.error && (
              <div style={{
                background: "#FEF2F2",
                border: `1px solid #FECACA`,
                color: TOK.danger,
                padding: "10px 14px",
                fontSize: 13,
                fontWeight: 500,
                marginBottom: 20,
                borderRadius: 8,
              }}>
                {data.error}
              </div>
            )}

            <Form method="post">
              <input type="hidden" name="plan" value={plan} />

              <Field label="Nume complet">
                <Input name="name" type="text" required autoFocus placeholder="Ion Popescu" />
              </Field>

              <Field label="Email">
                <Input name="email" type="email" autoComplete="email" required placeholder="tu@exemplu.com" />
              </Field>

              <Field label="Parolă">
                <Input name="password" type="password" autoComplete="new-password" required minLength={8} placeholder="Minim 8 caractere" />
              </Field>

              <Field label="Confirmă parola">
                <Input name="confirm" type="password" autoComplete="new-password" required placeholder="Repetă parola" />
              </Field>

              <button
                type="submit"
                disabled={loading}
                onMouseEnter={(e) => { if (!loading) { e.currentTarget.style.background = TOK.accentHover; e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 6px 16px rgba(13, 148, 136, 0.25)"; } }}
                onMouseLeave={(e) => { if (!loading) { e.currentTarget.style.background = TOK.accent; e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "0 1px 2px rgba(15, 23, 42, 0.05)"; } }}
                style={{
                  width: "100%",
                  padding: "13px 20px",
                  background: loading ? TOK.muted : TOK.accent,
                  color: TOK.white,
                  border: "none",
                  borderRadius: 8,
                  fontSize: 15,
                  fontWeight: 700,
                  fontFamily: FONT,
                  letterSpacing: 0.3,
                  cursor: loading ? "not-allowed" : "pointer",
                  transition: "all 160ms ease",
                  marginTop: 4,
                  boxShadow: "0 1px 2px rgba(15, 23, 42, 0.05)",
                }}
              >
                {loading ? "Se creează contul..." : "Creează cont"}
              </button>
            </Form>
          </div>

          <div style={{ textAlign: "center", marginTop: 20, fontSize: 13, color: TOK.muted }}>
            Ai deja cont?{" "}
            <Link to="/login" style={{ color: TOK.accent, fontWeight: 600, textDecoration: "none" }}>
              Conectează-te
            </Link>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}

function Header() {
  return (
    <nav style={{ padding: "20px 32px", borderBottom: `1px solid ${TOK.border}`, background: TOK.white }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Link to="/" style={{ fontSize: 22, fontWeight: 800, color: TOK.black, letterSpacing: "-0.02em", textDecoration: "none" }}>
          Kimono <span style={{ color: TOK.accent }}>SEO</span>
        </Link>
        <div style={{ fontSize: 14, color: TOK.muted, fontWeight: 500 }}>
          Ai cont?{" "}
          <Link to="/login" style={{ color: TOK.accent, fontWeight: 600, textDecoration: "none" }}>
            Intră
          </Link>
        </div>
      </div>
    </nav>
  );
}

function Footer() {
  return (
    <footer style={{ padding: "16px 32px", borderTop: `1px solid ${TOK.border}`, background: TOK.white, textAlign: "center", fontSize: 12, color: TOK.muted }}>
      Kimono Group · Baia Mare & București ·{" "}
      <a href="mailto:office@kimonogroup.ro" style={{ color: TOK.muted, textDecoration: "none" }}>
        office@kimonogroup.ro
      </a>
    </footer>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: TOK.black, marginBottom: 8 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function Input(props) {
  return (
    <input
      {...props}
      style={{
        width: "100%",
        padding: "11px 14px",
        background: TOK.white,
        border: `1px solid ${TOK.border}`,
        borderRadius: 8,
        fontSize: 14,
        fontFamily: FONT,
        fontWeight: 500,
        color: TOK.black,
        outline: "none",
        boxSizing: "border-box",
        transition: "all 120ms ease",
      }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = TOK.accent;
        e.currentTarget.style.boxShadow = `0 0 0 3px ${TOK.accentLight}`;
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = TOK.border;
        e.currentTarget.style.boxShadow = "none";
      }}
    />
  );
}
