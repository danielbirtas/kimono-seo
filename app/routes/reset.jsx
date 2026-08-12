// app/routes/reset.jsx — Cere link de resetare parolă
import { Form, useActionData, useNavigation, Link } from "react-router";
import crypto from "crypto";
import { sendResetEmail } from "../lib/auth/email.server.js";
import prisma from "../db.server.js";

export const meta = () => [{ title: "Resetare parolă — Kimono SEO" }];

export const action = async ({ request }) => {
  const { rateLimit } = await import("../lib/rate-limit.server.js");
  rateLimit(request, { key: "reset", windowMs: 60_000, max: 3 });

  const formData = await request.formData();
  const email = formData.get("email")?.toString().toLowerCase().trim();

  if (!email) return { error: "Emailul este obligatoriu." };

  const user = await prisma.user.findUnique({ where: { email } });
  const okMessage = "Dacă există un cont cu acest email, vei primi un link de resetare în 1-2 minute.";

  if (!user) return { success: okMessage };

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1h

  await prisma.user.update({
    where: { id: user.id },
    data: { resetToken: token, resetTokenExpiresAt: expiresAt },
  });

  try {
    await sendResetEmail(email, token);
  } catch (e) {
    console.error("Reset email failed:", e);
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
};
const FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif";

export default function Reset() {
  const data = useActionData();
  const navigation = useNavigation();
  const loading = navigation.state !== "idle";

  return (
    <div style={{ minHeight: "100vh", background: TOK.off, fontFamily: FONT, display: "flex", flexDirection: "column", color: TOK.black }}>
      <Header />

      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 20px" }}>
        <div style={{ width: "100%", maxWidth: 420 }}>
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2.5, textTransform: "uppercase", color: TOK.accent, marginBottom: 10 }}>
              Resetare parolă
            </div>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: TOK.black, letterSpacing: "-0.02em", margin: "0 0 8px" }}>
              Ai uitat parola?
            </h1>
            <p style={{ fontSize: 14, color: TOK.muted, margin: 0 }}>
              Introdu emailul contului și îți trimitem un link de resetare.
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

            <Form method="post">
              <div style={{ marginBottom: 18 }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: TOK.black, marginBottom: 8 }}>Email</label>
                <Input name="email" type="email" required autoFocus placeholder="tu@exemplu.com" />
              </div>

              <button
                type="submit"
                disabled={loading}
                onMouseEnter={(e) => { if (!loading) { e.currentTarget.style.background = TOK.accentHover; e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 6px 16px rgba(13, 148, 136, 0.25)"; } }}
                onMouseLeave={(e) => { if (!loading) { e.currentTarget.style.background = TOK.accent; e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "0 1px 2px rgba(15, 23, 42, 0.05)"; } }}
                style={{
                  width: "100%", padding: "13px 20px",
                  background: loading ? TOK.muted : TOK.accent,
                  color: TOK.white, border: "none", borderRadius: 8,
                  fontSize: 15, fontWeight: 700, fontFamily: FONT, letterSpacing: 0.3,
                  cursor: loading ? "not-allowed" : "pointer",
                  transition: "all 160ms ease",
                  boxShadow: "0 1px 2px rgba(15, 23, 42, 0.05)",
                }}
              >
                {loading ? "Se trimite..." : "Trimite link de resetare"}
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
        <Link to="/login" style={{ color: TOK.muted, fontSize: 14, fontWeight: 500, textDecoration: "none" }}>Login</Link>
      </div>
    </nav>
  );
}

function Footer() {
  return (
    <footer style={{ padding: "16px 32px", borderTop: `1px solid ${TOK.border}`, background: TOK.white, textAlign: "center", fontSize: 12, color: TOK.muted }}>
      Kimono Group · Baia Mare & București · <a href="mailto:office@kimonogroup.ro" style={{ color: TOK.muted, textDecoration: "none" }}>office@kimonogroup.ro</a>
    </footer>
  );
}

function Input(props) {
  return (
    <input
      {...props}
      style={{
        width: "100%", padding: "11px 14px",
        background: TOK.white, border: `1px solid ${TOK.border}`, borderRadius: 8,
        fontSize: 14, fontFamily: FONT, fontWeight: 500, color: TOK.black,
        outline: "none", boxSizing: "border-box",
        transition: "all 120ms ease",
      }}
      onFocus={(e) => { e.currentTarget.style.borderColor = TOK.accent; e.currentTarget.style.boxShadow = `0 0 0 3px ${TOK.accentLight}`; }}
      onBlur={(e) => { e.currentTarget.style.borderColor = TOK.border; e.currentTarget.style.boxShadow = "none"; }}
    />
  );
}
