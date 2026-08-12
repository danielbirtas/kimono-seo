// app/routes/legal.privacy.jsx
import { legalStyles, H1, H2, H3, P, UL, LI, Section, Note } from "../lib/legal-styles.jsx";

export const meta = () => [
  { title: "Politica de confidențialitate — Kimono SEO" },
  { name: "description", content: "Cum colectăm, prelucrăm și protejăm datele utilizatorilor platformei Kimono SEO, în conformitate cu GDPR." },
];

const LAST_UPDATED = "7 mai 2026";
const EFFECTIVE    = "7 mai 2026";

export default function PrivacyPolicy() {
  return (
    <article style={legalStyles.article}>
      <H1>Politica de confidențialitate</H1>
      <P style={{ color: "#6B7280", fontSize: 13 }}>
        Ultima actualizare: <strong>{LAST_UPDATED}</strong> · În vigoare de la: <strong>{EFFECTIVE}</strong>
      </P>

      <Note>
        Această politică explică ce date personale colectăm prin platforma <strong>Kimono SEO</strong>
        (disponibilă la <code>seo.kimonogroup.ro</code>), de ce le colectăm, cum le folosim, cu cine le partajăm,
        cât timp le păstrăm și ce drepturi aveți asupra lor. Politica este conformă cu Regulamentul (UE) 2016/679
        (<strong>GDPR</strong>) și Legea nr. 190/2018.
      </Note>

      <Section id="operator">
        <H2>1. Operatorul de date</H2>
        <P>Operatorul de date personale este:</P>
        <UL>
          <LI><strong>SC INSTAGROW SERVICES SRL</strong></LI>
          <LI>Sediu social: Str. Motorului nr. 5A, Ap. 32, Baia Mare, jud. Maramureș, cod poștal 430013, România</LI>
          <LI>CUI: <strong>39929314</strong></LI>
          <LI>Nr. înregistrare Reg. Comerțului: <strong>J2018001472245</strong></LI>
          <LI>EUID: ROONRC.J2018001472245</LI>
          <LI>Email general: <a href="mailto:office@kimonogroup.ro">office@kimonogroup.ro</a></LI>
          <LI>Email pentru protecția datelor (DPO): <a href="mailto:office@kimonogroup.ro">office@kimonogroup.ro</a></LI>
        </UL>
        <P>În textul de mai jos, ne vom referi la noi ca <strong>„Operator"</strong>, <strong>„noi"</strong> sau <strong>„Kimono SEO"</strong>. Ne vom referi la dumneavoastră ca <strong>„utilizator"</strong> sau <strong>„dumneavoastră"</strong>.</P>
      </Section>

      <Section id="ce-date">
        <H2>2. Ce date personale colectăm</H2>

        <H3>2.1 Date pe care ni le furnizați direct</H3>
        <UL>
          <LI><strong>Date de înregistrare cont</strong>: nume, adresă de email, parolă (stocată sub formă de hash <code>bcrypt</code>, niciodată în clar).</LI>
          <LI><strong>Date de facturare</strong>: dacă achiziționați un abonament, partenerul nostru de plată (Stripe) procesează datele cardului. Noi nu stocăm numere de card. Reținem doar identificatorul tranzacției, suma, planul ales și data.</LI>
          <LI><strong>Date de profil</strong>: domeniul magazinului Shopify, fusul orar, limba preferată, preferințe AI (model, ton, limba conținutului generat).</LI>
        </UL>

        <H3>2.2 Date colectate prin integrări OAuth</H3>
        <P>Când conectați un cont extern la platformă, primim un <strong>token de acces</strong> (eventual și un <em>refresh token</em>) emis de furnizorul respectiv și un set limitat de date legate de scop:</P>
        <UL>
          <LI><strong>Shopify</strong>: domeniul magazinului, lista de produse (titlu, descriere, imagini, prețuri, handle), colecții, comenzi (date agregate), tag-uri, redirect-uri.</LI>
          <LI><strong>Google Search Console</strong> (scope <code>webmasters.readonly</code>): proprietățile verificate, performanța (clicuri, impresii, CTR, poziție medie) la nivel de query / pagină / țară / dispozitiv.</LI>
          <LI><strong>Google Analytics 4</strong> (scope <code>analytics.readonly</code>): id-ul property-ului, datele de trafic (sesiuni, utilizatori, evenimente), surse de trafic. Nu colectăm date personale individuale ale vizitatorilor magazinului.</LI>
          <LI><strong>Pinterest</strong> (scope-uri <code>boards:read</code>, <code>boards:write</code>, <code>pins:read</code>, <code>pins:write</code>, <code>user_accounts:read</code>): profilul Pinterest Business, lista de board-uri, pin-urile create de noi în numele dumneavoastră.</LI>
          <LI><strong>Microsoft Bing Webmaster Tools</strong>: site-urile verificate, datele de search performance, lista de URL-uri trimise la indexare.</LI>
          <LI><strong>Microsoft Identity (Azure AD)</strong>: doar tokenul OAuth pentru a apela API-urile de mai sus; nu colectăm informații despre alți utilizatori din contul Azure.</LI>
        </UL>
        <P>Tokenurile OAuth sunt stocate criptat în baza noastră de date și sunt folosite <strong>exclusiv</strong> pentru a îndeplini funcțiile pe care le-ați solicitat în mod explicit (audit SEO, generare conținut, publicare pin-uri etc.).</P>

        <H3>2.3 Date generate automat de platformă</H3>
        <UL>
          <LI><strong>Rezultate audit SEO</strong>: scoruri, recomandări, sugestii de optimizare derivate din datele dumneavoastră.</LI>
          <LI><strong>Conținut generat de AI</strong>: titluri, descrieri, articole, etichete create de modele AI pe baza produselor/colecțiilor dumneavoastră.</LI>
          <LI><strong>Loguri tehnice</strong>: adresa IP, user-agent, timestamp, URL accesat, statusul răspunsului — utilizate pentru securitate, debugging și prevenirea abuzului.</LI>
        </UL>

        <H3>2.4 Date despre cookie-uri și tehnologii similare</H3>
        <P>Folosim cookie-uri strict necesare pentru funcționarea platformei (sesiune, autentificare, securitate CSRF) și, opțional, cookie-uri analitice. Detalii complete: <a href="/legal/cookies">Politica privind cookie-urile</a>.</P>
      </Section>

      <Section id="cum-folosim">
        <H2>3. Cum folosim datele</H2>
        <UL>
          <LI><strong>Furnizarea serviciului</strong>: rularea audit-urilor SEO, generarea de conținut AI, publicarea de pin-uri, sincronizarea cu Shopify.</LI>
          <LI><strong>Autentificare și securitate</strong>: login, prevenirea acceselor neautorizate, detectarea abuzului (rate limiting).</LI>
          <LI><strong>Comunicare</strong>: emailuri tranzacționale (resetare parolă, facturi, alerte de sistem). Emailurile de marketing se trimit numai cu consimțământul dumneavoastră explicit.</LI>
          <LI><strong>Îmbunătățirea platformei</strong>: analiză agregată și anonimizată a utilizării pentru a identifica probleme și a planifica funcționalități noi.</LI>
          <LI><strong>Conformitate legală</strong>: respectarea obligațiilor fiscale, contabile și de raportare.</LI>
        </UL>
        <P><strong>Nu folosim datele dumneavoastră pentru a antrena modele AI proprii.</strong> Conținutul produselor sau al magazinului dumneavoastră este trimis la furnizorii AI doar pentru a executa cererea curentă (de exemplu, a genera o descriere optimizată) și nu este reținut sau folosit în alte scopuri de către aceștia.</P>
      </Section>

      <Section id="baza-legala">
        <H2>4. Baza legală a prelucrării (Art. 6 GDPR)</H2>
        <UL>
          <LI><strong>Executarea contractului</strong> (Art. 6.1.b) — pentru tot ce ține de furnizarea serviciului pe care l-ați solicitat (cont, audit, generare conținut, publicare).</LI>
          <LI><strong>Interes legitim</strong> (Art. 6.1.f) — pentru loguri de securitate, analiză agregată a utilizării, prevenirea fraudei și abuzului. Interesul nostru legitim este menținerea unui serviciu funcțional și sigur. Aveți dreptul de a vă opune (vezi secțiunea 8).</LI>
          <LI><strong>Consimțământ</strong> (Art. 6.1.a) — pentru cookie-uri analitice opționale și pentru emailuri de marketing. Vă puteți retrage consimțământul oricând.</LI>
          <LI><strong>Obligație legală</strong> (Art. 6.1.c) — pentru date păstrate conform legislației fiscale și contabile (ex: facturi).</LI>
        </UL>
      </Section>

      <Section id="cui-partajam">
        <H2>5. Cu cine partajăm datele (sub-procesatori)</H2>
        <P>Pentru a funcționa, platforma se bazează pe servicii terțe. Toți sub-procesatorii sunt evaluați și au semnate contracte de prelucrare a datelor (DPA) conforme cu Art. 28 GDPR.</P>

        <table style={legalStyles.table}>
          <thead>
            <tr>
              <th>Sub-procesator</th><th>Scop</th><th>Locație</th><th>Garanții transfer</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>Hetzner Online GmbH</td><td>Hosting servere VPS (baza de date, backend)</td><td>Germania (UE)</td><td>UE / SEE — fără transfer</td></tr>
            <tr><td>Anthropic, PBC</td><td>Modele AI (Claude) pentru generarea de titluri / descrieri / sugestii SEO</td><td>SUA</td><td>Standard Contractual Clauses (SCC) + Data Processing Addendum</td></tr>
            <tr><td>DataForSEO LLC</td><td>Date de keyword research (volume, dificultate, SERP features)</td><td>SUA</td><td>SCC + DPA</td></tr>
            <tr><td>Stripe Payments Europe Ltd.</td><td>Procesare plăți</td><td>Irlanda (UE)</td><td>UE / SEE — fără transfer</td></tr>
            <tr><td>Shopify International Ltd.</td><td>Integrare cu magazinul dumneavoastră (datele provin de la Shopify, nu de la noi)</td><td>Irlanda (UE) și Canada</td><td>SCC + Adequacy Decision (Canada)</td></tr>
            <tr><td>Google LLC</td><td>API Search Console și Analytics 4 (când conectați aceste integrări)</td><td>SUA</td><td>SCC + EU-US Data Privacy Framework</td></tr>
            <tr><td>Pinterest, Inc.</td><td>API Pinterest (când conectați integrarea)</td><td>SUA</td><td>SCC + EU-US Data Privacy Framework</td></tr>
            <tr><td>Microsoft Corporation</td><td>API Bing Webmaster + Azure Identity (când conectați)</td><td>SUA</td><td>SCC + EU-US Data Privacy Framework</td></tr>
            <tr><td>Brevo (Sendinblue SAS)</td><td>Trimitere emailuri tranzacționale</td><td>Franța (UE)</td><td>UE / SEE — fără transfer</td></tr>
          </tbody>
        </table>

        <P>Lista poate fi actualizată. Vă vom informa prin email și/sau prin acest document înainte de adăugarea unui sub-procesator nou care prelucrează date personale.</P>
        <P><strong>Nu vindem și nu închiriem datele personale.</strong> Datele nu sunt folosite pentru profilare publicitară, advertising terț sau scoring automat al utilizatorilor.</P>
      </Section>

      <Section id="transferuri">
        <H2>6. Transferuri internaționale</H2>
        <P>Unii dintre sub-procesatorii noștri sunt în afara Spațiului Economic European (în special SUA). În aceste cazuri, transferul are loc pe baza:</P>
        <UL>
          <LI><strong>Clauzelor contractuale standard</strong> (SCC) aprobate de Comisia Europeană (Decizia 2021/914);</LI>
          <LI><strong>EU–US Data Privacy Framework</strong> (acolo unde sub-procesatorul este certificat — verificați la <a href="https://www.dataprivacyframework.gov/" target="_blank" rel="noopener noreferrer">dataprivacyframework.gov</a>);</LI>
          <LI>măsuri tehnice și organizaționale suplimentare: criptare în tranzit (TLS 1.2+) și la rest, pseudonimizare unde este posibil, control strict al accesului.</LI>
        </UL>
      </Section>

      <Section id="retentie">
        <H2>7. Cât timp păstrăm datele</H2>
        <UL>
          <LI><strong>Date de cont</strong>: pe durata contractului + 30 de zile după solicitarea ștergerii (pentru a permite anularea cererii din greșeală).</LI>
          <LI><strong>Tokenuri OAuth</strong>: până la deconectarea integrării sau până la solicitarea ștergerii contului.</LI>
          <LI><strong>Loguri tehnice</strong>: 90 de zile.</LI>
          <LI><strong>Date de facturare</strong>: 10 ani, conform Legii contabilității (nr. 82/1991).</LI>
          <LI><strong>Backup-uri</strong>: maxim 35 de zile, după care sunt șterse complet.</LI>
        </UL>
      </Section>

      <Section id="drepturi">
        <H2>8. Drepturile dumneavoastră</H2>
        <P>Conform GDPR, aveți următoarele drepturi pe care le puteți exercita prin email la <a href="mailto:office@kimonogroup.ro">office@kimonogroup.ro</a>:</P>
        <UL>
          <LI><strong>Dreptul de acces</strong> (Art. 15) — să cereți o copie a datelor pe care le avem despre dumneavoastră.</LI>
          <LI><strong>Dreptul la rectificare</strong> (Art. 16) — să corectați date incorecte sau incomplete.</LI>
          <LI><strong>Dreptul la ștergere</strong> / „dreptul de a fi uitat" (Art. 17) — vezi <a href="/legal/data-deletion">/legal/data-deletion</a> pentru procedura self-service.</LI>
          <LI><strong>Dreptul la restricționarea prelucrării</strong> (Art. 18).</LI>
          <LI><strong>Dreptul la portabilitatea datelor</strong> (Art. 20) — să primiți datele într-un format structurat (JSON sau CSV).</LI>
          <LI><strong>Dreptul de opoziție</strong> (Art. 21) — în special pentru prelucrările bazate pe interes legitim.</LI>
          <LI><strong>Dreptul de a nu fi supus deciziilor automate cu efect juridic</strong> (Art. 22).</LI>
          <LI><strong>Dreptul de a depune plângere</strong> la Autoritatea Națională de Supraveghere a Prelucrării Datelor cu Caracter Personal (<a href="https://www.dataprotection.ro/" target="_blank" rel="noopener noreferrer">ANSPDCP</a>), B-dul G-ral. Gheorghe Magheru 28-30, Sector 1, București, telefon +40 318 059 211, email <a href="mailto:anspdcp@dataprotection.ro">anspdcp@dataprotection.ro</a>.</LI>
        </UL>
        <P>Vom răspunde în termen de <strong>maxim 30 de zile calendaristice</strong> (acest termen poate fi prelungit cu maxim 60 de zile pentru cereri complexe, situație în care vă vom informa).</P>
      </Section>

      <Section id="securitate">
        <H2>9. Securitatea datelor</H2>
        <UL>
          <LI>Toate transferurile de date se fac criptat (HTTPS / TLS 1.2+).</LI>
          <LI>Parolele sunt stocate sub formă de hash <code>bcrypt</code> (cost factor ≥ 12).</LI>
          <LI>Tokenurile OAuth sunt criptate la rest în baza de date.</LI>
          <LI>Accesul la baza de date este restricționat prin firewall, listă de IP-uri, autentificare cu cheie SSH.</LI>
          <LI>Backup-uri zilnice criptate, păstrate maxim 35 de zile.</LI>
          <LI>Logging și monitorizare a accesului.</LI>
        </UL>
        <P>În caz de breach al datelor, vom notifica ANSPDCP în maxim 72 de ore (Art. 33 GDPR) și pe utilizatorii afectați fără întârziere nejustificată (Art. 34 GDPR).</P>
      </Section>

      <Section id="modificari">
        <H2>10. Modificări la această politică</H2>
        <P>Putem modifica această politică pentru a reflecta schimbări legale, tehnice sau de business. Versiunea curentă este întotdeauna disponibilă la <a href="/legal/privacy">/legal/privacy</a>. Modificările materiale vă vor fi comunicate prin email cu cel puțin 14 zile înainte de a intra în vigoare.</P>
      </Section>

      <hr style={legalStyles.divider} />

      {/* ─── SECȚIUNI SPECIFICE PROVIDERI OAUTH ─── */}
      <Section id="google-limited-use">
        <H2>11. Google API Services User Data Policy</H2>
        <P>Utilizarea de către Kimono SEO a informațiilor primite de la Google API-uri (Google Search Console, Google Analytics 4) respectă <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">Google API Services User Data Policy</a>, inclusiv cerințele <strong>Limited Use</strong>.</P>
        <P>În mod concret:</P>
        <UL>
          <LI>Folosim datele primite de la API-urile Google <strong>doar</strong> pentru funcționalitățile vizibile pentru utilizator (afișarea rapoartelor SEO și de trafic).</LI>
          <LI><strong>Nu</strong> transferăm datele Google către terți, cu excepția cazurilor strict necesare pentru a furniza sau îmbunătăți funcționalitățile vizibile, în condiții de conformitate (de exemplu, hosting pe Hetzner).</LI>
          <LI><strong>Nu</strong> folosim datele Google pentru a antrena modele de inteligență artificială generalizate sau personalizate.</LI>
          <LI><strong>Nu</strong> folosim datele Google pentru servicii de publicitate și nu le vindem.</LI>
          <LI><strong>Nu</strong> permitem oamenilor să citească datele Google, cu excepția: (a) consimțământului explicit obținut de la utilizatori specifici, (b) necesității din motive de securitate (investigarea abuzului), (c) necesității conformității cu legea, sau (d) datelor agregate / anonimizate folosite pentru operare internă.</LI>
        </UL>
        <P>Utilizatorii pot revoca accesul oricând din panoul Kimono SEO (Settings → Integrations → Google → Disconnect) sau direct din <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">myaccount.google.com/permissions</a>.</P>
      </Section>

      <Section id="pinterest-policy">
        <H2>12. Conformitate cu Pinterest Developer Policy</H2>
        <P>Conexiunea cu Pinterest Business Account respectă <a href="https://developers.pinterest.com/policy/" target="_blank" rel="noopener noreferrer">Pinterest Developer Guidelines</a> și <a href="https://policy.pinterest.com/en/developer-guidelines" target="_blank" rel="noopener noreferrer">Pinterest API Terms</a>.</P>
        <UL>
          <LI>Folosim API-ul Pinterest exclusiv pentru a vă permite gestionarea propriilor board-uri și pin-uri (creare, editare, programare, ștergere).</LI>
          <LI>Nu citim, nu colectăm și nu stocăm conținut sau date despre alți utilizatori Pinterest decât în măsura strict necesară pentru a afișa rezultate cerute de dumneavoastră (de exemplu, rezultate de keyword research publice).</LI>
          <LI>Tokenurile Pinterest sunt stocate criptat și revocate automat la deconectare.</LI>
          <LI>Conținutul produs prin Kimono SEO este publicat numai cu acțiunea explicită a utilizatorului (sau prin programare configurată de utilizator).</LI>
          <LI>Respectăm rate limits Pinterest și convențiile de utilizare prevăzute în documentație.</LI>
        </UL>
      </Section>

      <Section id="microsoft-policy">
        <H2>13. Conformitate cu Microsoft Identity Platform & Bing Webmaster Tools</H2>
        <P>Conexiunea cu Microsoft Bing Webmaster Tools, prin Microsoft Identity Platform (Azure AD), respectă <a href="https://learn.microsoft.com/en-us/legal/microsoft-identity-platform/terms-of-use" target="_blank" rel="noopener noreferrer">Microsoft Identity Platform Terms</a> și <a href="https://www.microsoft.com/en-us/bing/webmasters/api-overview" target="_blank" rel="noopener noreferrer">Bing Webmaster Tools API Terms</a>.</P>
        <UL>
          <LI>Folosim API-ul Microsoft exclusiv pentru a vă afișa și gestiona datele site-ului dumneavoastră în Bing (ranking, traffic, indexare).</LI>
          <LI>Nu accesăm informații despre utilizatori sau alte resurse din contul Azure dincolo de scope-urile minime cerute.</LI>
          <LI>Tokenurile sunt stocate criptat și pot fi revocate oricând din Settings → Integrations → Microsoft → Disconnect, sau direct din <a href="https://myaccount.microsoft.com/" target="_blank" rel="noopener noreferrer">myaccount.microsoft.com</a>.</LI>
        </UL>
      </Section>

      <Section id="contact">
        <H2>14. Contact</H2>
        <P>Pentru orice întrebare legată de această politică sau de prelucrarea datelor, ne puteți contacta:</P>
        <UL>
          <LI>Email DPO: <a href="mailto:office@kimonogroup.ro">office@kimonogroup.ro</a></LI>
          <LI>Email general: <a href="mailto:office@kimonogroup.ro">office@kimonogroup.ro</a></LI>
          <LI>Adresă poștală: SC INSTAGROW SERVICES SRL, Str. Motorului nr. 5A, Ap. 32, Baia Mare, jud. Maramureș, cod poștal 430013, România</LI>
        </UL>
        <P>De asemenea, puteți depune o plângere la <a href="https://www.dataprotection.ro/" target="_blank" rel="noopener noreferrer">Autoritatea Națională de Supraveghere a Prelucrării Datelor cu Caracter Personal (ANSPDCP)</a>.</P>
      </Section>
    </article>
  );
}
