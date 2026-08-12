// app/routes/login.jsx — Kimono SEO login
import { Form, useActionData, useNavigation, Link } from "react-router";
import { redirect } from "react-router";
import { requireGuest } from "../lib/auth/index.server.js";
import { verifyPassword } from "../lib/auth/password.server.js";
import prisma from "../db.server.js";

export const meta = () => [{ title: "Login — Kimono SEO" }];

export const loader = async ({ request }) => {
  await requireGuest(request);
  return null;
};

export const action = async ({ request }) => {
  const { rateLimit } = await import("../lib/rate-limit.server.js");
  rateLimit(request, { key: "login", windowMs: 60_000, max: 10 });

  const formData = await request.formData();
  const email = formData.get("email")?.toString().toLowerCase().trim();
  const password = formData.get("password")?.toString();

  if (!email || !password) return { error: "Email și parola sunt obligatorii." };

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return { error: "Email sau parolă incorectă." };

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return { error: "Email sau parolă incorectă." };

  if (user.emailVerified === false) {
    return { error: "Contul nu este încă verificat.", notVerified: true };
  }

  const { createSession } = await import("../lib/auth/session.server.js");
  const cookieHeader = await createSession(user.id);
  return redirect("/app", { headers: { "Set-Cookie": cookieHeader } });
};

// Palette — teal (match landing)
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

export default function Login() {
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
          <div style={{ fontSize: 14, color: TOK.muted, fontWeight: 500 }}>
            Nu ai cont?{" "}
            <Link to="/register" style={{ color: TOK.accent, fontWeight: 600, textDecoration: "none" }}>
              Creează cont
            </Link>
          </div>
        </div>
      </nav>

      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 20px" }}>
        <div style={{ width: "100%", maxWidth: 420 }}>
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2.5, textTransform: "uppercase", color: TOK.accent, marginBottom: 10 }}>
              Login
            </div>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: TOK.black, letterSpacing: "-0.02em", margin: "0 0 8px" }}>
              Bine ai revenit
            </h1>
            <p style={{ fontSize: 14, color: TOK.muted, margin: 0 }}>
              Intră în cont și continuă optimizarea magazinului.
            </p>
          </div>

          <div style={{ background: TOK.white, border: `1px solid ${TOK.border}`, borderRadius: 12, padding: 32, boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}>
            {data?.error && (
              <div style={{
                background: "#FEF2F2",
                border: `1px solid #FECACA`,
                color: TOK.danger,
                padding: "12px 14px",
                fontSize: 13,
                fontWeight: 500,
                marginBottom: 20,
                borderRadius: 8,
              }}>
                {data.error}
                {data.notVerified && (
                  <div style={{ fontSize: 12, marginTop: 6 }}>
                    Verifică emailul pentru link de activare sau{" "}
                    <Link to="/resend" style={{ color: TOK.danger, fontWeight: 700 }}>retrimite link-ul</Link>.
                  </div>
                )}
              </div>
            )}

            <Form method="post">
              <Field label="Email">
                <Input name="email" type="email" autoComplete="email" required autoFocus placeholder="tu@exemplu.com" />
              </Field>

              <Field label="Parolă">
                <Input name="password" type="password" autoComplete="current-password" required placeholder="Introdu parola" />
              </Field>

              <div style={{ textAlign: "right", marginBottom: 20 }}>
                <Link to="/reset" style={{ fontSize: 13, color: TOK.muted, textDecoration: "none", fontWeight: 500 }}>
                  Ai uitat parola?
                </Link>
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
                {loading ? "Se conectează..." : "Intră în cont"}
              </button>
            </Form>
          </div>

          <div style={{ textAlign: "center", marginTop: 20, fontSize: 13, color: TOK.muted }}>
            Nu ai cont?{" "}
            <Link to="/register" style={{ color: TOK.accent, fontWeight: 600, textDecoration: "none" }}>
              Creează cont gratuit
            </Link>
          </div>
        </div>
      </div>

      <footer style={{ padding: "16px 32px", borderTop: `1px solid ${TOK.border}`, background: TOK.white, textAlign: "center", fontSize: 12, color: TOK.muted }}>
        Kimono Group · Baia Mare & București ·{" "}
        <a href="mailto:office@kimonogroup.ro" style={{ color: TOK.muted, textDecoration: "none" }}>
          office@kimonogroup.ro
        </a>
      </footer>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label style={{
        display: "block",
        fontSize: 13,
        fontWeight: 600,
        color: TOK.black,
        marginBottom: 8,
      }}>
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
