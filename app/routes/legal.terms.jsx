// app/routes/legal.terms.jsx
import { legalStyles, H1, H2, H3, P, UL, LI, Section, Note } from "../lib/legal-styles.jsx";

export const meta = () => [
  { title: "Termeni și condiții — Kimono SEO" },
  { name: "description", content: "Termenii și condițiile de utilizare a platformei Kimono SEO operate de SC INSTAGROW SERVICES SRL." },
];

const LAST_UPDATED = "7 mai 2026";
const EFFECTIVE    = "7 mai 2026";

export default function TermsAndConditions() {
  return (
    <article style={legalStyles.article}>
      <H1>Termeni și condiții</H1>
      <P style={{ color: "#6B7280", fontSize: 13 }}>
        Ultima actualizare: <strong>{LAST_UPDATED}</strong> · În vigoare de la: <strong>{EFFECTIVE}</strong>
      </P>

      <Note>
        Prin accesarea și utilizarea platformei <strong>Kimono SEO</strong> (<code>seo.kimonogroup.ro</code>),
        sunteți de acord cu acești termeni. Dacă nu sunteți de acord, vă rugăm să nu folosiți platforma.
      </Note>

      <Section id="parti">
        <H2>1. Părțile</H2>
        <UL>
          <LI><strong>Furnizorul</strong>: SC INSTAGROW SERVICES SRL, cu sediul în Str. Motorului nr. 5A, Ap. 32, Baia Mare, jud. Maramureș, cod poștal 430013, CUI 39929314, Reg. Com. J2018001472245.</LI>
          <LI><strong>Utilizatorul</strong>: persoana fizică sau juridică ce creează un cont și / sau folosește serviciul.</LI>
        </UL>
      </Section>

      <Section id="serviciu">
        <H2>2. Descrierea serviciului</H2>
        <P>Kimono SEO este o platformă SaaS de optimizare SEO, AEO (Answer Engine Optimization) și GEO (Generative Engine Optimization) pentru magazine Shopify. Funcționalitățile principale includ:</P>
        <UL>
          <LI>Audit SEO automat și recomandări de optimizare;</LI>
          <LI>Generare de conținut cu inteligență artificială (titluri, descrieri, articole de blog, FAQ);</LI>
          <LI>Sincronizare cu Shopify pentru aplicarea automată a recomandărilor;</LI>
          <LI>Integrare cu Google Search Console, Google Analytics 4, Pinterest, Microsoft Bing Webmaster Tools;</LI>
          <LI>Programarea și publicarea de pin-uri pe Pinterest;</LI>
          <LI>Monitorizare poziționare, keyword research, analiză concurență.</LI>
        </UL>
        <P>Funcționalitățile concrete depind de planul abonat. Lista actualizată este disponibilă la <a href="/#pricing">/#pricing</a>.</P>
      </Section>

      <Section id="cont">
        <H2>3. Conturi de utilizator</H2>
        <UL>
          <LI>Pentru a folosi serviciul trebuie să creați un cont cu o adresă de email validă.</LI>
          <LI>Sunteți responsabil pentru confidențialitatea parolei și pentru toate activitățile efectuate prin contul dumneavoastră.</LI>
          <LI>Trebuie să aveți cel puțin 18 ani sau să fiți reprezentantul legal al unei persoane juridice.</LI>
          <LI>Un singur magazin Shopify per cont (cu excepția planurilor multi-store, dacă sunt disponibile).</LI>
          <LI>Ne rezervăm dreptul de a suspenda sau șterge conturi care încalcă acești termeni.</LI>
        </UL>
      </Section>

      <Section id="abonament">
        <H2>4. Abonament și plată</H2>
        <UL>
          <LI>Serviciul este oferit pe bază de abonament lunar sau anual.</LI>
          <LI>Plata se face cu card bancar prin procesatorul Stripe. Nu stocăm datele cardului.</LI>
          <LI>Abonamentul se reînnoiește automat la sfârșitul perioadei. Puteți anula reînnoirea oricând din panoul de cont.</LI>
          <LI>Anularea încetează abonamentul la sfârșitul perioadei plătite. Nu rambursăm sume pro-rata pentru perioada deja plătită, cu excepția cazurilor prevăzute de lege.</LI>
          <LI>În cazul magazinelor din afara României, prețurile sunt afișate fără TVA. TVA-ul se aplică conform legislației aplicabile (B2C în UE: TVA-ul țării utilizatorului; B2B cu cod valid de TVA: reverse charge).</LI>
          <LI>Modificările de preț vor fi comunicate cu cel puțin 30 de zile înainte. Dacă nu sunteți de acord, puteți anula abonamentul fără penalități.</LI>
        </UL>
      </Section>

      <Section id="trial">
        <H2>5. Perioada de test (trial)</H2>
        <P>Pentru noii utilizatori oferim o perioadă gratuită de testare. Detalii (durată, limite) sunt afișate la momentul înregistrării. La sfârșitul perioadei de test:</P>
        <UL>
          <LI>Dacă ați adăugat o metodă de plată, abonamentul se activează automat la planul ales.</LI>
          <LI>Dacă nu ați adăugat o metodă de plată, contul rămâne pe planul Free (cu funcționalități limitate) sau este suspendat.</LI>
        </UL>
      </Section>

      <Section id="utilizare-acceptabila">
        <H2>6. Utilizare acceptabilă</H2>
        <P>Utilizatorul se obligă să nu:</P>
        <UL>
          <LI>folosească serviciul pentru activități ilegale sau care încalcă drepturile terților;</LI>
          <LI>publice prin Kimono SEO conținut defăimător, obscen, discriminator sau care incită la violență;</LI>
          <LI>folosească API-ul Kimono SEO sau conținutul generat în moduri care încalcă termenii Shopify, Pinterest, Google sau Microsoft;</LI>
          <LI>încerce să acceseze fără autorizare conturi ale altor utilizatori sau să compromită securitatea platformei;</LI>
          <LI>revândă, sublicențieze sau ofere serviciul ca atare unei terțe părți fără acord scris;</LI>
          <LI>genereze și publice spam, conținut auto-generat fără supraveghere umană, sau conținut care manipulează rezultatele motoarelor de căutare în mod abuziv (black-hat SEO).</LI>
        </UL>
        <P>Încălcarea acestor reguli poate duce la suspendarea imediată a contului fără rambursare.</P>
      </Section>

      <Section id="ip">
        <H2>7. Drepturi de proprietate intelectuală</H2>
        <UL>
          <LI><strong>Platforma și codul</strong>: aparțin SC INSTAGROW SERVICES SRL. Vă acordăm o licență neexclusivă, netransferabilă, revocabilă, pentru a utiliza platforma conform planului abonat.</LI>
          <LI><strong>Conținutul dumneavoastră</strong>: rămâne al dumneavoastră (produse, descrieri originale, articole de blog scrise de dumneavoastră etc.). Ne acordați o licență strict tehnică, necesară pentru a opera serviciul (ex: a procesa, a indexa, a transmite date la sub-procesatori conform politicii de confidențialitate).</LI>
          <LI><strong>Conținutul generat de AI prin Kimono SEO</strong>: dumneavoastră dețineți drepturile de utilizare comercială. Atenție: textul generat de AI poate fi similar cu cel produs pentru alți utilizatori; recomandăm o revizuire umană înainte de publicare. Nu garantăm originalitatea absolută.</LI>
        </UL>
      </Section>

      <Section id="oauth">
        <H2>8. Integrări OAuth (Google, Pinterest, Microsoft, Shopify)</H2>
        <P>Conectarea unei integrări OAuth presupune că ne acordați permisiuni limitate pentru a accesa, în numele dumneavoastră, datele relevante din contul respectiv (de exemplu: rapoarte Google Search Console, board-uri Pinterest, date Bing Webmaster). Detaliile sunt în <a href="/legal/privacy">Politica de confidențialitate</a>.</P>
        <P>Aveți dreptul să revocați aceste permisiuni oricând, fie din panoul Kimono SEO (Settings → Integrations), fie direct din contul furnizorului (Google account permissions, Pinterest authorized apps etc.). După revocare, datele pe care le-am extras până la acel moment rămân în contul Kimono SEO până la solicitarea ștergerii.</P>
      </Section>

      <Section id="garantii">
        <H2>9. Garanții și limitări</H2>
        <P>Furnizăm serviciul „așa cum este" și „așa cum este disponibil". Depunem eforturi rezonabile pentru a asigura disponibilitate ridicată (țintă 99,5% lunar) și acuratețea recomandărilor SEO, dar:</P>
        <UL>
          <LI>nu garantăm rezultate specifice de poziționare în Google, Bing sau alte motoare de căutare;</LI>
          <LI>nu garantăm acuratețea absolută a datelor primite de la API-urile terțe (Pinterest, Google, Microsoft, DataForSEO);</LI>
          <LI>nu garantăm că serviciul va fi disponibil fără întreruperi sau erori;</LI>
          <LI>nu suntem responsabili pentru deciziile luate de Pinterest, Google, Microsoft sau Shopify privind conturile dumneavoastră (suspendare, ban, modificări de algoritm).</LI>
        </UL>
      </Section>

      <Section id="raspundere">
        <H2>10. Limitarea răspunderii</H2>
        <P>În măsura maximă permisă de lege, răspunderea totală a Furnizorului pentru orice prejudiciu rezultat din utilizarea serviciului este limitată la <strong>suma plătită de utilizator în ultimele 12 luni</strong> înainte de evenimentul care a generat prejudiciul.</P>
        <P>Furnizorul nu răspunde pentru pierderi indirecte, consecutive, pierderi de profit, pierderi de date care ar fi putut fi prevenite prin backup-uri proprii ale utilizatorului, sau prejudicii rezultate din utilizarea greșită a recomandărilor SEO sau a conținutului generat de AI.</P>
        <P>Aceste limitări nu se aplică în cazurile prevăzute de lege ca neexcluzibile (ex: deces, vătămare corporală cauzate prin neglijență gravă; daune produse intenționat).</P>
      </Section>

      <Section id="terminare">
        <H2>11. Suspendarea și terminarea contului</H2>
        <UL>
          <LI>Putem suspenda sau termina contul dacă încălcați acești termeni, dacă nu plătiți la timp, sau dacă activitatea contului prezintă risc pentru platformă sau alți utilizatori.</LI>
          <LI>Puteți închide contul oricând din panoul de cont sau prin email la <a href="mailto:office@kimonogroup.ro">office@kimonogroup.ro</a>.</LI>
          <LI>După închidere, datele sunt șterse conform termenelor din <a href="/legal/privacy">Politica de confidențialitate</a> (în general 30 de zile, cu excepția datelor cu obligație legală de păstrare).</LI>
        </UL>
      </Section>

      <Section id="modificari">
        <H2>12. Modificări la termeni</H2>
        <P>Putem modifica acești termeni pentru a reflecta schimbări legale, tehnice sau de business. Modificările materiale vă vor fi comunicate cu cel puțin 30 de zile înainte. Continuarea utilizării serviciului după intrarea în vigoare a modificărilor constituie acceptare. Dacă nu sunteți de acord, puteți închide contul fără penalități.</P>
      </Section>

      <Section id="lege">
        <H2>13. Legea aplicabilă și jurisdicția</H2>
        <UL>
          <LI>Acești termeni sunt guvernați de <strong>legea română</strong>.</LI>
          <LI>Pentru utilizatorii consumatori (B2C) cu reședință în UE, se aplică legislația de protecție a consumatorului din țara de reședință, dacă este mai favorabilă.</LI>
          <LI>Litigiile vor fi soluționate amiabil, sau, în caz contrar, de instanțele judecătorești competente teritorial conform sediului Furnizorului (Sector 4, București), cu excepția cazurilor în care legea prevede altfel pentru consumatori.</LI>
          <LI>Consumatorii din UE pot accesa platforma online de soluționare a litigiilor a Comisiei Europene la <a href="https://ec.europa.eu/consumers/odr/" target="_blank" rel="noopener noreferrer">ec.europa.eu/consumers/odr</a>.</LI>
        </UL>
      </Section>

      <Section id="contact">
        <H2>14. Contact</H2>
        <P>Pentru întrebări legate de acești termeni:</P>
        <UL>
          <LI>Email: <a href="mailto:office@kimonogroup.ro">office@kimonogroup.ro</a></LI>
          <LI>Adresă: SC INSTAGROW SERVICES SRL, Str. Motorului nr. 5A, Ap. 32, Baia Mare, jud. Maramureș, cod poștal 430013</LI>
        </UL>
      </Section>
    </article>
  );
}
