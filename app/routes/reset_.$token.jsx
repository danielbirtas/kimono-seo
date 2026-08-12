// app/routes/reset.$token.jsx — Setează parola nouă
import { Form, useActionData, useNavigation, useLoaderData, Link } from "react-router";
import { redirect } from "react-router";
import { hashPassword } from "../lib/auth/password.server.js";
import prisma from "../db.server.js";

export const meta = () => [{ title: "Parolă nouă — Kimono SEO" }];

export const loader = async ({ params }) => {
  const { token } = params;
  if (!token) return { valid: false, error: "Token lipsă." };

  const user = await prisma.user.findFirst({ where: { resetToken: token } });
  if (!user) return { valid: false, error: "Link invalid sau deja folosit." };
  if (!user.resetTokenExpiresAt || user.resetTokenExpiresAt < new Date()) {
    return { valid: false, error: "Link expirat. Solicită unul nou." };
  }
  return { valid: true, email: user.email };
};

export const action = async ({ request, params }) => {
  const { token } = params;
  const formData = await request.formData();
  const password = formData.get("password")?.toString();
  const confirm = formData.get("confirm")?.toString();

  if (!password || !confirm) return { error: "Ambele câmpuri sunt obligatorii." };
  if (password.length < 8) return { error: "Parola trebuie să aibă minim 8 caractere." };
  if (password !== confirm) return { error: "Parolele nu coincid." };

  const user = await prisma.user.findFirst({ where: { resetToken: token } });
  if (!user) return { error: "Link invalid sau deja folosit." };
  if (!user.resetTokenExpiresAt || user.resetTokenExpiresAt < new Date()) {
    return { error: "Link expirat." };
  }

  const passwordHash = await hashPassword(password);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, resetToken: null, resetTokenExpiresAt: null },
  });

  return redirect("/login?reset=1");
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

export default function ResetConfirm() {
  const loaderData = useLoaderData();
  const data = useActionData();
  const navigation = useNavigation();
  const loading = navigation.state !== "idle";

  return (
    <div style={{ minHeight: "100vh", background: TOK.off, fontFamily: FONT, display: "flex", flexDirection: "column", color: TOK.black }}>
      <Header />

      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 20px" }}>
        <div style={{ width: "100%", maxWidth: 420 }}>
          {!loaderData.valid ? (
            <div style={{ background: TOK.white, border: `1px solid ${TOK.border}`, borderRadius: 12, padding: 36, boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)", textAlign: "center" }}>
              <div style={{ width: 64, height: 64, background: "#FEF2F2", borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={TOK.danger} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>
                </svg>
              </div>
              <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 10, letterSpacing: "-0.01em", margin: "0 0 10px" }}>Link invalid</h2>
              <p style={{ fontSize: 14, color: TOK.muted, lineHeight: 1.6, marginBottom: 20 }}>
                {loaderData.error}
              </p>
              <Link to="/reset" style={{
                display: "block", width: "100%", padding: "13px 20px",
                background: TOK.accent, color: TOK.white, border: "none", borderRadius: 8,
                fontSize: 15, fontWeight: 700, textDecoration: "none", textAlign: "center", boxSizing: "border-box",
              }}>
                Solicită link nou
              </Link>
            </div>
          ) : (
            <>
              <div style={{ textAlign: "center", marginBottom: 24 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2.5, textTransform: "uppercase", color: TOK.accent, marginBottom: 10 }}>
                  Parolă nouă
                </div>
                <h1 style={{ fontSize: 28, fontWeight: 800, color: TOK.black, letterSpacing: "-0.02em", margin: "0 0 8px" }}>
                  Setează parola nouă
                </h1>
                <p style={{ fontSize: 14, color: TOK.muted, margin: 0 }}>
                  Pentru <strong style={{ color: TOK.black }}>{loaderData.email}</strong>
                </p>
              </div>

              <div style={{ background: TOK.white, border: `1px solid ${TOK.border}`, borderRadius: 12, padding: 32, boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}>
                {data?.error && (
                  <div style={{
                    background: "#FEF2F2", border: `1px solid #FECACA`, color: TOK.danger,
                    padding: "10px 14px", fontSize: 13, fontWeight: 500, marginBottom: 20, borderRadius: 8,
                  }}>
                    {data.error}
                  </div>
                )}

                <Form method="post">
                  <Field label="Parolă nouă">
                    <Input name="password" type="password" autoComplete="new-password" required autoFocus minLength={8} placeholder="Minim 8 caractere" />
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
                      width: "100%", padding: "13px 20px",
                      background: loading ? TOK.muted : TOK.accent, color: TOK.white,
                      border: "none", borderRadius: 8,
                      fontSize: 15, fontWeight: 700, fontFamily: FONT, letterSpacing: 0.3,
                      cursor: loading ? "not-allowed" : "pointer",
                      transition: "all 160ms ease",
                      boxShadow: "0 1px 2px rgba(15, 23, 42, 0.05)",
                    }}
                  >
                    {loading ? "Se salvează..." : "Salvează parola nouă"}
                  </button>
                </Form>
              </div>
            </>
          )}
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

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: TOK.black, marginBottom: 8 }}>{label}</label>
      {children}
    </div>
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
        outline: "none", boxSizing: "border-box", transition: "all 120ms ease",
      }}
      onFocus={(e) => { e.currentTarget.style.borderColor = TOK.accent; e.currentTarget.style.boxShadow = `0 0 0 3px ${TOK.accentLight}`; }}
      onBlur={(e) => { e.currentTarget.style.borderColor = TOK.border; e.currentTarget.style.boxShadow = "none"; }}
    />
  );
}
