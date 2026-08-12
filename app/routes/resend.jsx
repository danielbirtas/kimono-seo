// app/routes/resend.jsx — Retrimite link de verificare
import { Form, useActionData, useNavigation, Link } from "react-router";
import crypto from "crypto";
import { sendVerifyEmail } from "../lib/auth/email.server.js";
import prisma from "../db.server.js";

export const meta = () => [{ title: "Retrimite link verificare — Kimono SEO" }];

export const action = async ({ request }) => {
  const { rateLimit } = await import("../lib/rate-limit.server.js");
  rateLimit(request, { key: "resend", windowMs: 60_000, max: 3 });

  const formData = await request.formData();
  const email = formData.get("email")?.toString().toLowerCase().trim();

  if (!email) return { error: "Emailul este obligatoriu." };

  const user = await prisma.user.findUnique({ where: { email } });
  // Nu divulga dacă user-ul există — mesaj neutru
  const okMessage = "Dacă există un cont cu acest email și nu e verificat, vei primi un link nou în 1-2 minute.";

  if (!user || user.emailVerified) {
    return { success: okMessage };
  }

  const token = crypto.randomBytes(32).toString("hex");
  await prisma.user.update({ where: { id: user.id }, data: { verifyToken: token } });

  try {
    await sendVerifyEmail(email, token);
  } catch (e) {
    console.error("Resend verify email failed:", e);
  }

  return { success: okMessage };
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

export default function Resend() {
  const data = useActionData();
  const navigation = useNavigation();
  const loading = navigation.state !== "idle";

  return (
    <div style={{ minHeight: "100vh", background: TOK.off, fontFamily: FONT, display: "flex", flexDirection: "column", color: TOK.black }}>
      <nav style={{ padding: "20px 32px", borderBottom: `1px solid ${TOK.border}`, background: TOK.white }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Link to="/" style={{ fontSize: 22, fontWeight: 800, color: TOK.black, letterSpacing: "-0.02em", textDecoration: "none" }}>
            Kimono <span style={{ color: TOK.accent }}>SEO</span>
          </Link>
          <Link to="/login" style={{ color: TOK.muted, fontSize: 14, fontWeight: 500, textDecoration: "none" }}>Login</Link>
        </div>
      </nav>

      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 20px" }}>
        <div style={{ width: "100%", maxWidth: 420 }}>
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2.5, textTransform: "uppercase", color: TOK.accent, marginBottom: 10 }}>
              Verificare email
            </div>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: TOK.black, letterSpacing: "-0.02em", margin: "0 0 8px" }}>
              Retrimite link de verificare
            </h1>
            <p style={{ fontSize: 14, color: TOK.muted, margin: 0 }}>
              Introdu emailul folosit la înregistrare.
            </p>
          </div>

          <div style={{ background: TOK.white, border: `1px solid ${TOK.border}`, borderRadius: 12, padding: 32, boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}>
            {data?.success && (
              <div style={{
                background: TOK.accentLight,
                border: `1px solid ${TOK.accent}`,
                color: "#134E4A",
                padding: "12px 14px",
                fontSize: 13,
                fontWeight: 500,
                marginBottom: 20,
                borderRadius: 8,
                lineHeight: 1.5,
              }}>
                {data.success}
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

            <p style={{ fontSize: 13, color: TOK.muted, marginBottom: 20, lineHeight: 1.5 }}>
              Dacă contul există și nu e verificat, îți trimitem un link nou. Check inbox + folder Spam.
            </p>

            <Form method="post">
              <div style={{ marginBottom: 18 }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: TOK.black, marginBottom: 8 }}>Email</label>
                <input
                  name="email"
                  type="email"
                  required
                  autoFocus
                  placeholder="tu@exemplu.com"
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
                  onFocus={(e) => { e.currentTarget.style.borderColor = TOK.accent; e.currentTarget.style.boxShadow = `0 0 0 3px ${TOK.accentLight}`; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = TOK.border; e.currentTarget.style.boxShadow = "none"; }}
                />
              </div>

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
                  boxShadow: "0 1px 2px rgba(15, 23, 42, 0.05)",
                }}
              >
                {loading ? "Se trimite..." : "Trimite link de verificare"}
              </button>
            </Form>
          </div>

          <div style={{ textAlign: "center", marginTop: 20, fontSize: 13, color: TOK.muted }}>
            <Link to="/login" style={{ color: TOK.accent, fontWeight: 600, textDecoration: "none" }}>
              ← Înapoi la login
            </Link>
          </div>
        </div>
      </div>

      <footer style={{ padding: "16px 32px", borderTop: `1px solid ${TOK.border}`, background: TOK.white, textAlign: "center", fontSize: 12, color: TOK.muted }}>
        Kimono Group · Baia Mare & București ·{" "}
        <a href="mailto:office@kimonogroup.ro" style={{ color: TOK.muted, textDecoration: "none" }}>office@kimonogroup.ro</a>
      </footer>
    </div>
  );
}
