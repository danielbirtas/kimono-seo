// app/routes/legal.cookies.jsx
import { legalStyles, H1, H2, H3, P, UL, LI, Section, Note } from "../lib/legal-styles.jsx";

export const meta = () => [
  { title: "Politica privind cookie-urile — Kimono SEO" },
  { name: "description", content: "Ce cookie-uri folosim pe Kimono SEO, în ce scop și cum le puteți gestiona." },
];

const LAST_UPDATED = "7 mai 2026";

export default function CookiesPolicy() {
  return (
    <article style={legalStyles.article}>
      <H1>Politica privind cookie-urile</H1>
      <P style={{ color: "#6B7280", fontSize: 13 }}>Ultima actualizare: <strong>{LAST_UPDATED}</strong></P>

      <Note>
        Această politică explică ce sunt cookie-urile, cum le folosim pe <strong>seo.kimonogroup.ro</strong> și
        cum le puteți accepta, refuza sau șterge. Politica respectă <strong>Directiva ePrivacy</strong>
        (transpusă în Legea nr. 506/2004) și <strong>GDPR</strong>.
      </Note>

      <Section id="ce-sunt">
        <H2>1. Ce sunt cookie-urile?</H2>
        <P>Cookie-urile sunt fișiere mici de text plasate pe dispozitivul dumneavoastră (computer, telefon, tabletă) când vizitați un site web. Permit site-ului să vă „rețină" preferințele și să funcționeze corect între pagini sau între sesiuni.</P>
        <P>Folosim atât cookie-uri <strong>de sesiune</strong> (șterse când închideți browser-ul) cât și cookie-uri <strong>persistente</strong> (rămân până la expirare sau ștergere manuală). De asemenea, folosim tehnologii similare cum ar fi <code>localStorage</code> și <code>sessionStorage</code>.</P>
      </Section>

      <Section id="ce-folosim">
        <H2>2. Ce cookie-uri folosim</H2>

        <H3>2.1 Strict necesare (nu pot fi dezactivate)</H3>
        <P>Aceste cookie-uri sunt esențiale pentru funcționarea platformei. Fără ele, autentificarea, securitatea și operațiunile de bază nu sunt posibile. Conform <strong>Art. 5(3) ePrivacy</strong>, nu necesită consimțământ.</P>
        <table style={legalStyles.table}>
          <thead><tr><th>Nume</th><th>Furnizor</th><th>Scop</th><th>Durată</th></tr></thead>
          <tbody>
            <tr><td><code>__session</code></td><td>seo.kimonogroup.ro</td><td>Sesiunea de autentificare</td><td>30 zile</td></tr>
            <tr><td><code>csrf_token</code></td><td>seo.kimonogroup.ro</td><td>Protecție Cross-Site Request Forgery</td><td>Sesiune</td></tr>
            <tr><td><code>oauth_state</code></td><td>seo.kimonogroup.ro</td><td>Stare OAuth temporară (la conectare Google / Pinterest / Microsoft)</td><td>10 minute</td></tr>
            <tr><td><code>theme</code></td><td>seo.kimonogroup.ro</td><td>Preferință temă (dark / light)</td><td>1 an</td></tr>
            <tr><td><code>locale</code></td><td>seo.kimonogroup.ro</td><td>Limba interfeței (ro / en)</td><td>1 an</td></tr>
          </tbody>
        </table>

        <H3>2.2 Funcționale (opționale)</H3>
        <P>Memorează preferințele dumneavoastră pentru a vă oferi o experiență personalizată. Le puteți accepta sau refuza prin bannerul de cookie-uri.</P>
        <table style={legalStyles.table}>
          <thead><tr><th>Nume</th><th>Furnizor</th><th>Scop</th><th>Durată</th></tr></thead>
          <tbody>
            <tr><td><code>last_store</code></td><td>seo.kimonogroup.ro</td><td>Ultimul magazin Shopify selectat</td><td>30 zile</td></tr>
            <tr><td><code>onboarding_dismissed</code></td><td>seo.kimonogroup.ro</td><td>Ascunde tutorialul de onboarding după ce l-ați parcurs</td><td>1 an</td></tr>
          </tbody>
        </table>

        <H3>2.3 Analitice (opționale)</H3>
        <P>În prezent <strong>nu folosim</strong> Google Analytics, Facebook Pixel sau alte instrumente de tracking analitic terț. Folosim doar agregare internă a logurilor pentru identificarea problemelor tehnice. Dacă vom adăuga instrumente analitice în viitor, vă vom solicita consimțământul explicit.</P>

        <H3>2.4 Publicitate / Marketing</H3>
        <P><strong>Nu folosim</strong> cookie-uri de publicitate. Nu plasăm pixeli de remarketing și nu partajăm date cu rețele advertising.</P>
      </Section>

      <Section id="cum-gestionati">
        <H2>3. Cum puteți gestiona cookie-urile</H2>

        <H3>3.1 Din platforma noastră</H3>
        <P>La prima vizită, primiți un banner unde puteți accepta sau refuza cookie-urile opționale. Vă puteți schimba preferințele oricând din <strong>Setări → Confidențialitate → Cookie-uri</strong>.</P>

        <H3>3.2 Din browser</H3>
        <P>Toate browserele moderne vă permit să vedeți, să blocați sau să ștergeți cookie-urile. Atenție: blocarea cookie-urilor strict necesare poate face platforma să nu mai funcționeze corect.</P>
        <UL>
          <LI><a href="https://support.google.com/chrome/answer/95647" target="_blank" rel="noopener noreferrer">Google Chrome</a></LI>
          <LI><a href="https://support.mozilla.org/ro/kb/Cookies-uri-Informatii-stocate-de-website-uri" target="_blank" rel="noopener noreferrer">Mozilla Firefox</a></LI>
          <LI><a href="https://support.apple.com/ro-ro/guide/safari/sfri11471/mac" target="_blank" rel="noopener noreferrer">Apple Safari</a></LI>
          <LI><a href="https://support.microsoft.com/ro-ro/microsoft-edge" target="_blank" rel="noopener noreferrer">Microsoft Edge</a></LI>
        </UL>

        <H3>3.3 Do Not Track</H3>
        <P>Respectăm semnalul <strong>DNT</strong> al browser-ului. Dacă browser-ul dumneavoastră trimite <code>DNT: 1</code>, nu activăm cookie-uri analitice opționale chiar dacă bannerul a fost acceptat.</P>
      </Section>

      <Section id="modificari">
        <H2>4. Modificări la această politică</H2>
        <P>Putem actualiza această politică ori de câte ori adăugăm sau eliminăm cookie-uri. Versiunea curentă este întotdeauna disponibilă la <a href="/legal/cookies">/legal/cookies</a>. Modificările materiale vă vor fi notificate prin email și prin bannerul de cookie-uri.</P>
      </Section>

      <Section id="contact">
        <H2>5. Contact</H2>
        <P>Pentru întrebări despre cookie-uri sau prelucrarea datelor, scrieți la <a href="mailto:office@kimonogroup.ro">office@kimonogroup.ro</a>.</P>
      </Section>
    </article>
  );
}
