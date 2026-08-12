// app/components/FeatureGate.jsx
const FEATURE_INFO = {
  seo: { name: "SEO Engine", description: "Automated product tagging, Google Keyword Planner integration, and Smart Collection creation.", requiredPlan: "Growth" },
  audit: { name: "SEO Audit Report", description: "Full SEO audit with AI recommendations, health scoring, and downloadable reports.", requiredPlan: "Growth" },
  smartAlerts: { name: "Smart Alerts", description: "Velocity-based stock alerts with email notifications and days-of-stock predictions.", requiredPlan: "Starter" },
};

export default function FeatureGate({ feature, plan, features, children }) {
  if (features?.[feature]) return children;

  const info = FEATURE_INFO[feature] || { name: feature, description: "This feature requires an upgrade.", requiredPlan: "Starter" };

  return (
    <div style={{
      background: "#fffbeb", border: "1px solid #f59e0b", borderRadius: "10px",
      padding: "24px", margin: "16px 0",
    }}>
      <div style={{ fontWeight: "700", fontSize: "16px", color: "#92400e", marginBottom: "8px" }}>
        {info.name} — Upgrade Required
      </div>
      <p style={{ color: "#78350f", fontSize: "14px", marginBottom: "12px" }}>{info.description}</p>
      <p style={{ color: "#a16207", fontSize: "13px", marginBottom: "16px" }}>
        Current plan: <strong>{plan || "FREE"}</strong>. Available on <strong>{info.requiredPlan}</strong> and above.
      </p>
      <a href="/app/pricing" style={{
        display: "inline-block", background: "#f59e0b", color: "#fff", padding: "8px 20px",
        borderRadius: "8px", textDecoration: "none", fontWeight: "600", fontSize: "14px",
      }}>Upgrade to {info.requiredPlan}</a>
    </div>
  );
}
