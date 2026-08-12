// Email sending for Kimono SEO — teal palette
import nodemailer from "nodemailer";

function getTransporter() {
  const port = Number(process.env.SMTP_PORT) || 25;
  const user = process.env.SMTP_USER || "";
  const pass = process.env.SMTP_PASS || "";

  const config = {
    host: process.env.SMTP_HOST || "127.0.0.1",
    port,
    secure: port === 465,
  };
  if (user && pass) config.auth = { user, pass };
  if (port === 25) config.tls = { rejectUnauthorized: false };
  return nodemailer.createTransport(config);
}

// Read at call time so env updates take effect without rebuild
function appUrl() {
  return process.env.APP_URL || "http://localhost:3000";
}

function fromAddress() {
  return process.env.SMTP_FROM || "Kimono SEO <noreply@kimonogroup.ro>";
}

// Teal palette (match platform)
const C = {
  black: "#0F172A",
  white: "#FFFFFF",
  off: "#F8FAFC",
  accent: "#0D9488",
  accentDark: "#134E4A",
  accentLight: "#CCFBF1",
  muted: "#475569",
  border: "#E2E8F0",
};

function brandedLayout(title, body) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${C.off};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:${C.black};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.off};padding:40px 20px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:${C.white};border:1px solid ${C.border};border-radius:12px;max-width:560px;overflow:hidden;">
        <tr><td style="background:${C.black};padding:24px 28px;border-bottom:3px solid ${C.accent};">
          <div style="color:${C.white};font-size:22px;font-weight:800;letter-spacing:-0.02em;">
            Kimono <span style="color:${C.accent};">SEO</span>
          </div>
          <div style="color:#94a3b8;font-size:11px;letter-spacing:2px;text-transform:uppercase;margin-top:6px;">
            Platformă SEO pentru magazine online
          </div>
        </td></tr>
        <tr><td style="padding:32px 28px;">
          <h1 style="margin:0 0 16px;font-size:22px;font-weight:800;letter-spacing:-0.01em;color:${C.black};">${title}</h1>
          ${body}
        </td></tr>
        <tr><td style="background:${C.off};padding:16px 28px;border-top:1px solid ${C.border};font-size:11px;color:${C.muted};text-align:center;">
          Kimono Group &middot; Baia Mare &amp; București &middot; <a href="${appUrl()}" style="color:${C.muted};text-decoration:none;">seo.kimonogroup.ro</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function button(url, label) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0;">
    <tr><td style="background:${C.accent};border-radius:8px;">
      <a href="${url}" style="display:inline-block;padding:14px 28px;color:${C.white};text-decoration:none;font-weight:700;font-size:14px;letter-spacing:0.3px;border-radius:8px;">
        ${label}
      </a>
    </td></tr>
  </table>`;
}

export async function sendVerifyEmail(email, token) {
  const url = `${appUrl()}/verify/${token}`;
  const transporter = getTransporter();

  const body = `
    <p style="font-size:15px;line-height:1.6;color:#262626;margin:0 0 8px;">
      Bine ai venit la <strong>Kimono SEO</strong>.
    </p>
    <p style="font-size:15px;line-height:1.6;color:#262626;margin:0 0 8px;">
      Apasă pe butonul de mai jos pentru a-ți confirma adresa de email și a activa contul:
    </p>
    ${button(url, "Confirmă adresa de email")}
    <p style="font-size:13px;line-height:1.6;color:${C.muted};margin:20px 0 0;">
      Dacă butonul nu funcționează, copiază acest link în browser:<br>
      <a href="${url}" style="color:${C.accent};word-break:break-all;">${url}</a>
    </p>
    <p style="font-size:12px;color:#737373;margin:28px 0 0;padding-top:16px;border-top:1px solid ${C.border};">
      Dacă nu tu ai creat acest cont, ignoră acest mesaj.
    </p>
  `;

  await transporter.sendMail({
    from: fromAddress(),
    to: email,
    subject: "Confirmă adresa de email — Kimono SEO",
    html: brandedLayout("Confirmă-ți adresa de email", body),
    text: `Bine ai venit la Kimono SEO!\n\nDeschide acest link pentru a-ți confirma contul:\n${url}\n\nDacă nu tu ai creat contul, ignoră acest mesaj.`,
  });
}

export async function sendResetEmail(email, token) {
  const url = `${appUrl()}/reset/${token}`;
  const transporter = getTransporter();

  const body = `
    <p style="font-size:15px;line-height:1.6;color:#262626;margin:0 0 8px;">
      Ai solicitat resetarea parolei pentru contul tău Kimono SEO.
    </p>
    ${button(url, "Resetează parola")}
    <p style="font-size:13px;line-height:1.6;color:${C.muted};margin:20px 0 0;">
      Sau copiază: <a href="${url}" style="color:${C.accent};word-break:break-all;">${url}</a>
    </p>
    <p style="font-size:12px;color:#737373;margin:28px 0 0;padding-top:16px;border-top:1px solid ${C.border};">
      Link-ul expiră în 1 oră. Dacă nu ai solicitat resetarea, ignoră acest mesaj.
    </p>
  `;

  await transporter.sendMail({
    from: fromAddress(),
    to: email,
    subject: "Resetare parolă — Kimono SEO",
    html: brandedLayout("Resetare parolă", body),
    text: `Resetează parola Kimono SEO (link valid 1 oră):\n${url}`,
  });
}
