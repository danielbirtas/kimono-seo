// app/routes/legal.jsx — shared layout for /legal/* pages
import { Outlet, NavLink, useNavigate } from "react-router";

export default function LegalLayout() {
  const navigate = useNavigate();
  return (
    <div style={{ minHeight: "100vh", background: "#FAFAFA", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif", color: "#111827" }}>
      <header style={{ background: "#fff", borderBottom: "1px solid #E5E7EB", padding: "14px 24px" }}>
        <div style={{ maxWidth: 980, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <a href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "#111827", fontWeight: 800, fontSize: 17 }}>
            <span style={{ background: "linear-gradient(135deg, #6366F1, #EC4899)", color: "#fff", width: 30, height: 30, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 7, fontSize: 16 }}>U</span>
            Ultimate<em style={{ fontStyle: "normal", color: "#6366F1" }}>SEO</em>
          </a>
          <nav style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {[
              ["/legal/privacy",       "Confidențialitate"],
              ["/legal/cookies",       "Cookie-uri"],
              ["/legal/terms",         "Termeni"],
              ["/legal/data-deletion", "Ștergere date"],
            ].map(([to, label]) => (
              <NavLink key={to} to={to} style={({ isActive }) => ({
                padding: "6px 12px",
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                textDecoration: "none",
                color: isActive ? "#fff" : "#374151",
                background: isActive ? "#6366F1" : "transparent",
              })}>{label}</NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main style={{ maxWidth: 820, margin: "0 auto", padding: "32px 24px 64px" }}>
        <Outlet />
      </main>

      <footer style={{ borderTop: "1px solid #E5E7EB", background: "#fff", padding: "24px", marginTop: 48 }}>
        <div style={{ maxWidth: 980, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, fontSize: 12, color: "#6B7280" }}>
          <div>© {new Date().getFullYear()} Kimono SEO · SC INSTAGROW SERVICES SRL</div>
          <div style={{ display: "flex", gap: 16 }}>
            <a href="/" style={{ color: "#6B7280" }}>Acasă</a>
            <a href="mailto:office@kimonogroup.ro" style={{ color: "#6B7280" }}>office@kimonogroup.ro</a>
            <a href="mailto:office@kimonogroup.ro" style={{ color: "#6B7280" }}>office@kimonogroup.ro</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

export const meta = () => [
  { title: "Documente legale — Kimono SEO" },
  { name: "robots", content: "index, follow" },
];
