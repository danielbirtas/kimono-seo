// app/routes/legal.data-deletion.jsx — required for Pinterest / Google OAuth verification
import { useState } from "react";
import { legalStyles, H1, H2, H3, P, UL, LI, Section, Note } from "../lib/legal-styles.jsx";

export const meta = () => [
  { title: "Ștergerea datelor — Kimono SEO" },
  { name: "description", content: "Cum să solicitați ștergerea contului și a datelor personale de pe platforma Kimono SEO." },
];

export default function DataDeletion() {
  const [submitted, setSubmitted] = useState(false);
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState(false);

  function handleSubmit(e) {
    e.preventDefault();
    // Open mail client with pre-filled subject + body — works without backend
    const subject = encodeURIComponent("Cerere de ștergere date personale — Kimono SEO");
    const body = encodeURIComponent(
      `Solicit ștergerea contului meu și a datelor personale asociate, conform Art. 17 GDPR.\n\n` +
      `Email cont: ${email}\n` +
      `Motiv (opțional): ${reason}\n\n` +
      `Confirm că sunt titularul contului și că înțeleg că ștergerea este definitivă după 30 de zile.`
    );
    window.location.href = `mailto:office@kimonogroup.ro?subject=${subject}&body=${body}`;
    setSubmitted(true);
  }

  return (
    <article style={legalStyles.article}>
      <H1>Ștergerea contului și a datelor</H1>

      <Note>
        Aveți dreptul să solicitați oricând ștergerea completă a contului și a datelor personale asociate,
        conform <strong>Art. 17 GDPR</strong> (dreptul de a fi uitat). Mai jos sunt explicate atât metodele
        self-service, cât și procedura prin email.
      </Note>

      <Section id="metoda-1">
        <H2>1. Ștergere self-service din panoul de cont</H2>
        <P>Cea mai rapidă metodă:</P>
        <UL>
          <LI>Logați-vă în <a href="/login">contul Kimono SEO</a>;</LI>
          <LI>Accesați <strong>Settings → Account → Delete account</strong>;</LI>
          <LI>Confirmați acțiunea cu parola.</LI>
        </UL>
        <P>După confirmare:</P>
        <UL>
          <LI>Contul intră în starea „pending deletion" timp de <strong>30 de zile</strong>. În această perioadă, vă puteți răzgândi prin login simplu.</LI>
          <LI>După 30 de zile, contul, tokenurile OAuth, conținutul generat, audit-urile și logurile asociate sunt șterse complet din baza de date principală.</LI>
          <LI>Backup-urile criptate care pot conține date despre cont sunt șterse după maxim 35 de zile suplimentare (rotire backup standard).</LI>
        </UL>
      </Section>

      <Section id="metoda-2">
        <H2>2. Cerere prin email (dacă nu mai aveți acces la cont)</H2>
        <P>Dacă ați pierdut accesul la cont sau preferați procedura formală:</P>
        <ol style={{ paddingLeft: 22 }}>
          <li style={{ margin: "4px 0" }}>Trimiteți un email la <a href="mailto:office@kimonogroup.ro">office@kimonogroup.ro</a> cu subiectul „Cerere ștergere date".</li>
          <li style={{ margin: "4px 0" }}>Includeți adresa de email a contului și (opțional) motivul cererii.</li>
          <li style={{ margin: "4px 0" }}>Verificăm identitatea (de obicei prin trimiterea unui cod către emailul contului) — protecție împotriva cererilor frauduloase.</li>
          <li style={{ margin: "4px 0" }}>Procesăm cererea în <strong>maxim 30 de zile calendaristice</strong> (Art. 12.3 GDPR).</li>
          <li style={{ margin: "4px 0" }}>Primiți confirmare prin email când ștergerea s-a finalizat.</li>
        </ol>

        <H3>Formular rapid</H3>
        <P>Click pe butonul de mai jos pentru a deschide un email pre-completat:</P>

        {!submitted ? (
          <form onSubmit={handleSubmit} style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 10, padding: "16px 18px", margin: "12px 0" }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}>Email cont</label>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="ex: contul.tau@exemplu.ro" style={{ width: "100%", boxSizing: "border-box", border: "1px solid #E5E7EB", borderRadius: 6, padding: "8px 12px", fontSize: 14, marginBottom: 10 }} />

            <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}>Motiv (opțional)</label>
            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} placeholder="ex: nu mai folosesc serviciul" style={{ width: "100%", boxSizing: "border-box", border: "1px solid #E5E7EB", borderRadius: 6, padding: "8px 12px", fontSize: 14, marginBottom: 10, fontFamily: "inherit", resize: "vertical" }} />

            <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, color: "#374151", cursor: "pointer", marginBottom: 12 }}>
              <input type="checkbox" required checked={confirm} onChange={e => setConfirm(e.target.checked)} style={{ marginTop: 3 }} />
              <span>Confirm că sunt titularul contului și că înțeleg că ștergerea este definitivă după 30 de zile de păstrare.</span>
            </label>

            <button type="submit" disabled={!email || !confirm} style={{ background: !email || !confirm ? "#E5E7EB" : "#DC2626", color: !email || !confirm ? "#9CA3AF" : "#fff", border: "none", borderRadius: 6, padding: "10px 20px", fontSize: 14, fontWeight: 600, cursor: !email || !confirm ? "default" : "pointer" }}>
              Trimite cerere de ștergere
            </button>
          </form>
        ) : (
          <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 8, padding: "12px 16px", margin: "12px 0", color: "#15803D", fontSize: 14 }}>
            ✓ S-a deschis aplicația dumneavoastră de email. Trimiteți mesajul către <strong>office@kimonogroup.ro</strong>. Vom răspunde în maxim 30 de zile.
          </div>
        )}
      </Section>

      <Section id="ce-se-sterge">
        <H2>3. Ce date se șterg</H2>
        <UL>
          <LI>Datele de cont (email, nume, parolă hash);</LI>
          <LI>Tokenurile OAuth (Google, Pinterest, Microsoft, Shopify);</LI>
          <LI>Conținutul generat (titluri, descrieri, articole, audit-uri);</LI>
          <LI>Setările și preferințele de utilizator;</LI>
          <LI>Cookie-urile asociate sesiunii;</LI>
          <LI>Pin-urile programate (anulate automat fără publicare);</LI>
          <LI>Datele de profil ale magazinelor conectate.</LI>
        </UL>
      </Section>

      <Section id="ce-pastram">
        <H2>4. Ce date păstrăm și de ce</H2>
        <P>Anumite date trebuie păstrate conform legii, chiar și după ștergerea contului:</P>
        <UL>
          <LI><strong>Facturi și înregistrări fiscale</strong>: 10 ani, conform Legii contabilității nr. 82/1991.</LI>
          <LI><strong>Loguri de securitate</strong>: 90 de zile, pentru investigarea eventualelor abuzuri.</LI>
          <LI><strong>Date anonimizate / agregate</strong>: putem păstra metricile agregate (de ex. „X audit-uri rulate în luna Y") care nu permit re-identificarea.</LI>
        </UL>
      </Section>

      <Section id="oauth-revocare">
        <H2>5. Revocarea integrărilor OAuth (independent)</H2>
        <P>Chiar și fără ștergerea contului Kimono SEO, puteți revoca în orice moment accesul nostru la conturile dumneavoastră terțe:</P>
        <UL>
          <LI><strong>Google</strong>: <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">myaccount.google.com/permissions</a> → Kimono SEO → Remove access.</LI>
          <LI><strong>Pinterest</strong>: <a href="https://www.pinterest.com/settings/apps/" target="_blank" rel="noopener noreferrer">pinterest.com/settings/apps</a> → Kimono SEO → Revoke access.</LI>
          <LI><strong>Microsoft</strong>: <a href="https://myaccount.microsoft.com/" target="_blank" rel="noopener noreferrer">myaccount.microsoft.com</a> → Apps & services → Kimono SEO → Revoke.</LI>
          <LI><strong>Shopify</strong>: Shopify Admin → Settings → Apps and sales channels → Kimono SEO → Uninstall.</LI>
        </UL>
        <P>După revocare, tokenurile noastre devin invalide și ștergem datele asociate la următoarea sincronizare (sau imediat la cerere).</P>
      </Section>

      <Section id="contact">
        <H2>6. Contact</H2>
        <P>Pentru orice întrebare legată de ștergerea datelor:</P>
        <UL>
          <LI>Email DPO: <a href="mailto:office@kimonogroup.ro">office@kimonogroup.ro</a></LI>
          <LI>Adresă: SC INSTAGROW SERVICES SRL, Str. Motorului nr. 5A, Ap. 32, Baia Mare, jud. Maramureș, cod poștal 430013, România</LI>
        </UL>
        <P>Răspuns garantat în maxim 30 de zile calendaristice.</P>
      </Section>
    </article>
  );
}
