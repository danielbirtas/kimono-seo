// app/routes/legal-utils.jsx — shared styles + small helpers for legal pages
// (not a route — naming with hyphen so React Router doesn't treat it as one)

export const legalStyles = {
  article: {
    background: "#fff",
    border: "1px solid #E5E7EB",
    borderRadius: 12,
    padding: "32px 36px",
    fontSize: 15,
    lineHeight: 1.7,
    color: "#1F2937",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 13,
    margin: "12px 0",
  },
  divider: {
    border: "none",
    borderTop: "1px solid #E5E7EB",
    margin: "32px 0",
  },
};

export function H1({ children }) {
  return <h1 style={{ fontSize: 28, fontWeight: 800, color: "#111827", margin: "0 0 8px", lineHeight: 1.25 }}>{children}</h1>;
}
export function H2({ children }) {
  return <h2 style={{ fontSize: 19, fontWeight: 700, color: "#111827", margin: "28px 0 10px" }}>{children}</h2>;
}
export function H3({ children }) {
  return <h3 style={{ fontSize: 15, fontWeight: 700, color: "#111827", margin: "18px 0 6px" }}>{children}</h3>;
}
export function P({ children, style }) {
  return <p style={{ margin: "8px 0", ...(style || {}) }}>{children}</p>;
}
export function UL({ children }) {
  return <ul style={{ margin: "8px 0", paddingLeft: 22 }}>{children}</ul>;
}
export function LI({ children }) {
  return <li style={{ margin: "4px 0" }}>{children}</li>;
}
export function Section({ id, children }) {
  return <section id={id} style={{ scrollMarginTop: 80 }}>{children}</section>;
}
export function Note({ children }) {
  return (
    <div style={{ background: "#F0F9FF", border: "1px solid #BAE6FD", borderRadius: 8, padding: "12px 16px", fontSize: 14, color: "#0C4A6E", margin: "16px 0" }}>
      {children}
    </div>
  );
}
