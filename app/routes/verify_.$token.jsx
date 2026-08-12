// app/routes/verify.$token.jsx — Activare email Kimono SEO
import { Link, useLoaderData } from "react-router";
import prisma from "../db.server.js";

export const meta = () => [{ title: "Confirmare cont — Kimono SEO" }];

export const loader = async ({ params }) => {
  const { token } = params;
  if (!token) return { error: "Token lipsă.", success: false };

  const user = await prisma.user.findFirst({ where: { verifyToken: token } });
  if (!user) return { error: "Token invalid sau expirat.", success: false };

  if (user.emailVerified) {
    return { error: null, success: true, alreadyVerified: true };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerified: true, verifyToken: null },
  });

  return { error: null, success: true, alreadyVerified: false };
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

export default function VerifyPage() {
  const data = useLoaderData();
  const isError = !!data.error;

  return (
    <div style={{ minHeight: "100vh", background: TOK.off, fontFamily: FONT, display: "flex", flexDirection: "column", color: TOK.black }}>
      <nav style={{ padding: "20px 32px", borderBottom: `1px solid ${TOK.border}`, background: TOK.white }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Link to="/" style={{ fontSize: 22, fontWeight: 800, color: TOK.black, letterSpacing: "-0.02em", textDecoration: "none" }}>
            Kimono <span style={{ color: TOK.accent }}>SEO</span>
          </Link>
        </div>
      </nav>

      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 20px" }}>
        <div style={{ width: "100%", maxWidth: 440 }}>
          <div style={{ background: TOK.white, border: `1px solid ${TOK.border}`, borderRadius: 12, padding: 36, boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)", textAlign: "center" }}>
            {isError ? (
              <>
                <div style={{ width: 64, height: 64, background: "#FEF2F2", borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={TOK.danger} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>
                  </svg>
                </div>
                <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 10, letterSpacing: "-0.01em", margin: "0 0 10px" }}>
                  Link invalid
                </h2>
                <p style={{ fontSize: 14, color: TOK.muted, lineHeight: 1.6, marginBottom: 24 }}>
                  {data.error} Poate fi un link vechi (deja folosit) sau expirat.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <Link to="/resend" style={{
                    display: "block", padding: "12px 20px", background: TOK.accent, color: TOK.white,
                    border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700,
                    textDecoration: "none", textAlign: "center",
                  }}>
                    Retrimite link de verificare
                  </Link>
                  <Link to="/login" style={{
                    display: "block", padding: "12px 20px", background: TOK.white, color: TOK.black,
                    border: `1px solid ${TOK.border}`, borderRadius: 8, fontSize: 14, fontWeight: 600,
                    textDecoration: "none", textAlign: "center",
                  }}>
                    Înapoi la login
                  </Link>
                </div>
              </>
            ) : (
              <>
                <div style={{ width: 64, height: 64, background: TOK.accentLight, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={TOK.accent} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6 9 17l-5-5"/>
                  </svg>
                </div>
                <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 10, letterSpacing: "-0.01em", margin: "0 0 10px" }}>
                  {data.alreadyVerified ? "Cont deja verificat" : "Cont activat"}
                </h2>
                <p style={{ fontSize: 14, color: TOK.muted, lineHeight: 1.6, marginBottom: 24 }}>
                  {data.alreadyVerified
                    ? "Contul tău este deja activ. Poți intra în cont direct."
                    : "Contul a fost confirmat cu succes. Poți intra acum în platformă."}
                </p>
                <Link to="/login" style={{
                  display: "block", width: "100%", padding: "13px 20px",
                  background: TOK.accent, color: TOK.white,
                  border: "none", borderRadius: 8, fontSize: 15, fontWeight: 700,
                  textDecoration: "none", textAlign: "center", boxSizing: "border-box",
                  transition: "all 150ms ease",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = TOK.accentHover; e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 6px 16px rgba(13, 148, 136, 0.25)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = TOK.accent; e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "none"; }}
                >
                  Intră în cont
                </Link>
              </>
            )}
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
