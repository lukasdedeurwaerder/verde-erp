import Link from "next/link";
import { huidigeContext } from "@/lib/sessie";

export const metadata = { title: "Hoe werkt het?" };

function Keten({ stappen }: { stappen: string[] }) {
  return (
    <div className="keten">
      {stappen.map((s, i) => (
        <span key={s} style={{ display: "contents" }}>
          {i > 0 && <span className="keten__pijl">→</span>}
          <span className="keten__stap">{s}</span>
        </span>
      ))}
    </div>
  );
}

// Korte handleiding voor studenten: de keten van bestelling tot betaling,
// en waar elk stuk in het programma zit.
export default async function HulpPagina() {
  const ctx = await huidigeContext();

  return (
    <div className="hulp">
      <div className="schermkop">
        <div>
          <h1>Hoe werkt het?</h1>
          <p>
            Alles hangt aan elkaar, zoals in een echt bedrijf. Wat je in één scherm doet, zie je meteen in de andere terug,
            tot in de balans.
          </p>
        </div>
      </div>

      <div className="kaart">
        <h2>1. Eerst de fiches</h2>
        <ul>
          <li>
            <Link href="/klanten">Klanten</Link> en <Link href="/leveranciers">leveranciers</Link>: zonder fiche kun je
            niets aan hen verkopen of bij hen kopen.
          </li>
          <li>
            <Link href="/producten">Producten</Link> met hun aankoop- en verkoopprijs en btw-tarief. Een dienst, zoals een
            workshop, heeft geen voorraad: zet dan het vinkje uit.
          </li>
          <li>
            Startvoorraad? Open het product bij <Link href="/voorraad">Voorraad</Link> en registreer een beginvoorraad.
          </li>
          <li>
            Startkapitaal? Boek de inbreng bij <Link href="/bank">Bank</Link>: iets anders, rekening 100 Kapitaal, ontvangst.
          </li>
        </ul>
      </div>

      <div className="kaart">
        <h2>2. Verkopen</h2>
        <Keten stappen={["Verkooporder", "Offerte", "Leverbon", "Factuur", "Betaling"]} />
        <ol>
          <li>
            Maak bij <Link href="/bestellingen">Bestellingen</Link> een verkooporder: kies de klant, een verantwoordelijke en
            de producten. Volg ze op het kanban-bord.
          </li>
          <li>Wil de klant eerst een prijs? Maak vanuit de bestelling een offerte.</li>
          <li>
            Lever je? Maak een leverbon en maak hem definitief: de goederen gaan uit voorraad. Te weinig voorraad? Dan
            weigert het programma.
          </li>
          <li>
            Maak de factuur en maak ze definitief. Ze staat meteen in het dagboek verkopen, met de btw. Op de factuur staat
            een gestructureerde mededeling voor de betaling.
          </li>
          <li>
            Staat de betaling op het rekeninguittreksel? Boek ze bij <Link href="/bank">Bank</Link> en kies de factuur.
          </li>
          <li>Een fout op een definitieve factuur? Die verwijder je niet: je maakt een creditnota vanuit de factuur.</li>
        </ol>
      </div>

      <div className="kaart">
        <h2>3. Aankopen</h2>
        <Keten stappen={["Aankooporder", "Bestelbon", "Ontvangstbon", "Aankoopfactuur", "Betaling"]} />
        <ol>
          <li>Maak een aankooporder bij de leverancier en stuur de bestelbon.</li>
          <li>Komen de goederen binnen? Maak de ontvangstbon definitief: ze komen in voorraad.</li>
          <li>
            Registreer de factuur van de leverancier bij <Link href="/aankopen">Aankoopfacturen</Link>, met hun
            factuurnummer. Kies per lijn de rekening: goederen op 604, huur op 610, flyers op 614, ...
          </li>
          <li>Betaal ze via Bank. Stuurt de leverancier een creditnota, registreer die vanuit de aankoopfactuur.</li>
        </ol>
      </div>

      <div className="kaart">
        <h2>4. De bankrekening delen</h2>
        <p>
          Beide dochters gebruiken één bankrekening. Bij <Link href="/bank">Bank</Link> zie je het hele uittreksel, ook de
          regels van de andere dochter. Elke regel boek je voor het bedrijf waar ze bij hoort: jullie eigen betalingen
          boeken jullie zelf. Het saldo onderaan moet overeenkomen met het echte uittreksel.
        </p>
      </div>

      <div className="kaart">
        <h2>5. De boekhouding volgt vanzelf</h2>
        <ul>
          <li>
            <Link href="/dagboeken">Dagboeken</Link>: verkopen en aankopen vullen zich met de facturen, het financieel dagboek
            met de bank. Afschrijvingen of correcties boek je als diverse boeking.
          </li>
          <li>
            <Link href="/rapporten">Balans en resultaat</Link>: altijd actueel. Klik op een rekening om te zien waar een bedrag
            vandaan komt. Afdrukken of als pdf bewaren kan met Ctrl+P.
          </li>
          <li>
            Klopt de voorraad op de balans niet met wat je nog hebt? Gebruik de knop “Voorraad op de balans bijwerken”.
          </li>
        </ul>
      </div>

      <div className="kaart">
        <h2>Goed om te weten</h2>
        <ul>
          <li>
            Zolang een document een concept is, kun je het aanpassen of verwijderen. Definitief is definitief: dan is het
            verstuurd of geboekt.
          </li>
          <li>Een nummer (factuur, leverbon, ...) blijft altijd bestaan, ook als het document geannuleerd wordt.</li>
          <li>
            Je werkt in <strong>{ctx.bedrijf?.naam ?? "het bedrijf dat je bovenaan kiest"}</strong>. Wat je doet, komt in
            het logboek.
          </li>
          <li>
            Je wachtwoord wijzigen kan via <Link href="/wachtwoord">Mijn wachtwoord</Link>.
          </li>
        </ul>
      </div>
    </div>
  );
}
