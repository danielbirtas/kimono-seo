// app/routes/privacy.jsx
// Public Privacy Policy page — no authentication required

export default function PrivacyPolicy() {
  return (
    <div style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", maxWidth: "800px", margin: "0 auto", padding: "40px 24px 80px", color: "#1F2937", lineHeight: "1.7" }}>
      <h1 style={{ fontSize: "28px", fontWeight: "800", color: "#111827", marginBottom: "6px" }}>Privacy Policy</h1>
      <div style={{ fontSize: "13px", color: "#6B7280", marginBottom: "32px" }}>
        Kimono SEO — SEO, AEO &amp; GEO Operating System for Shopify<br />
        Operated by <strong>SC INSTAGROW SERVICES SRL / Kimono Group</strong><br />
        Last updated: <strong>April 2026</strong>
      </div>

      {[
        {
          title: "1. Who We Are",
          content: (
            <>
              <p>Kimono SEO is a Shopify application developed and operated by <strong>SC INSTAGROW SERVICES SRL</strong> (trading as Kimono Group), a company registered in Romania. Kimono SEO provides SEO, AEO, and GEO optimization tools for Shopify merchants.</p>
              <div style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: "10px", padding: "14px 18px", margin: "12px 0" }}>
                <strong>Contact:</strong><br />
                SC INSTAGROW SERVICES SRL / Kimono Group<br />
                Email: <a href="mailto:privacy@kimono.ro" style={{ color: "#6366F1" }}>privacy@kimono.ro</a><br />
                Website: <a href="https://kimono.ro" target="_blank" rel="noopener noreferrer" style={{ color: "#6366F1" }}>kimono.ro</a>
              </div>
            </>
          ),
        },
        {
          title: "2. What Data We Collect",
          content: (
            <ul style={{ paddingLeft: "20px" }}>
              {[
                ["Shopify store data", "Product titles, descriptions, tags, collections, images, blog articles, and theme files — used to generate SEO recommendations and content."],
                ["Google Search Console data", "Search performance metrics (keywords, impressions, clicks, positions) — used for keyword analysis and content optimization."],
                ["Google Analytics 4 data", "Traffic sources including AI-referral sessions — used to monitor AI-driven traffic."],
                ["Pinterest data", "Profile information, board names/descriptions, pin titles/descriptions — used for Pinterest SEO audit and keyword research. Accessed via Pinterest API with explicit user authorization."],
                ["Bing Webmaster Tools data", "Site performance, crawl stats, and AI citation data — used for GEO monitoring."],
                ["Store owner contact information", "Email address and name associated with the Shopify account — used for authentication and notifications."],
              ].map(([label, desc]) => (
                <li key={label} style={{ marginBottom: "8px" }}><strong>{label}:</strong> {desc}</li>
              ))}
            </ul>
          ),
        },
        {
          title: "3. How We Use Your Data",
          content: (
            <>
              <ul style={{ paddingLeft: "20px" }}>
                {[
                  "Generate SEO audit reports, keyword recommendations, and content suggestions",
                  "Monitor search performance and AI citation activity",
                  "Provide automated optimization workflows (on-page SEO, schema markup, internal linking)",
                  "Display analytics dashboards within the Kimono SEO application",
                  "Send alerts and notifications about performance changes",
                ].map((item, i) => <li key={i} style={{ marginBottom: "6px" }}>{item}</li>)}
              </ul>
              <p style={{ fontWeight: "700", color: "#111827" }}>We do not sell, rent, or share your data with third parties for marketing purposes.</p>
            </>
          ),
        },
        {
          title: "5. Pinterest API Usage",
          content: (
            <>
              <p>When you connect your Pinterest Business account to Kimono SEO, we request access to:</p>
              <ul style={{ paddingLeft: "20px" }}>
                <li style={{ marginBottom: "6px" }}><strong>boards:read</strong> — to read your board names, descriptions, and pin counts for SEO audit</li>
                <li style={{ marginBottom: "6px" }}><strong>pins:read</strong> — to analyze pin titles and descriptions for optimization recommendations</li>
                <li style={{ marginBottom: "6px" }}><strong>user_accounts:read</strong> — to read your profile information for account audit</li>
              </ul>
              <p>We <strong>do not</strong> create, modify, or delete any Pinterest content on your behalf. We <strong>do not</strong> store your Pinterest access token in plain text — it is encrypted in our database. You can revoke Kimono SEO's access at any time from your <a href="https://www.pinterest.com/settings/security/" target="_blank" rel="noopener noreferrer" style={{ color: "#6366F1" }}>Pinterest Security Settings</a>.</p>
            </>
          ),
        },
        {
          title: "6. Data Storage and Security",
          content: (
            <ul style={{ paddingLeft: "20px" }}>
              {[
                "All data is stored in a PostgreSQL database hosted on Neon (US East region), encrypted at rest",
                "API tokens (Google, Pinterest, Bing) are stored encrypted",
                "Application is hosted on Railway with HTTPS enforced on all endpoints",
                "Data is associated with individual Shopify stores and is not shared between merchants",
              ].map((item, i) => <li key={i} style={{ marginBottom: "6px" }}>{item}</li>)}
            </ul>
          ),
        },
        {
          title: "7. Data Retention",
          content: (
            <ul style={{ paddingLeft: "20px" }}>
              <li style={{ marginBottom: "6px" }}>Audit results and settings are retained as long as the Kimono SEO app is installed</li>
              <li style={{ marginBottom: "6px" }}>When you uninstall Kimono SEO, your store data is deleted within 30 days (Shopify GDPR)</li>
              <li style={{ marginBottom: "6px" }}>Request immediate deletion: <a href="mailto:privacy@kimono.ro" style={{ color: "#6366F1" }}>privacy@kimono.ro</a></li>
            </ul>
          ),
        },
        {
          title: "8. Your Rights (GDPR)",
          content: (
            <ul style={{ paddingLeft: "20px" }}>
              {[
                ["Right of access", "Request a copy of all data we hold about your store"],
                ["Right to rectification", "Request correction of inaccurate data"],
                ["Right to erasure", "Request deletion of your data (right to be forgotten)"],
                ["Right to data portability", "Request your data in a machine-readable format"],
                ["Right to object", "Object to processing of your personal data"],
              ].map(([right, desc]) => (
                <li key={right} style={{ marginBottom: "6px" }}><strong>{right}:</strong> {desc}</li>
              ))}
            </ul>
          ),
        },
        {
          title: "9. Contact",
          content: (
            <div style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: "10px", padding: "14px 18px" }}>
              <strong>SC INSTAGROW SERVICES SRL / Kimono Group</strong><br />
              Email: <a href="mailto:privacy@kimono.ro" style={{ color: "#6366F1" }}>privacy@kimono.ro</a><br />
              Website: <a href="https://kimono.ro" target="_blank" rel="noopener noreferrer" style={{ color: "#6366F1" }}>kimono.ro</a>
            </div>
          ),
        },
      ].map(section => (
        <div key={section.title}>
          <h2 style={{ fontSize: "18px", fontWeight: "700", color: "#111827", marginTop: "36px", marginBottom: "10px", borderBottom: "1px solid #E5E7EB", paddingBottom: "6px" }}>
            {section.title}
          </h2>
          {section.content}
        </div>
      ))}
    </div>
  );
}
