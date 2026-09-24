import { huidigeContext } from "@/lib/sessie";
import { BedrijfKeuze } from "./BedrijfKeuze";
import { Navigatie } from "./Navigatie";
import { uitloggen } from "./acties";

// De schil rond elk scherm: zijbalk links, bovenbalk met bedrijfskeuze,
// en de inhoud. De kleur van het actieve bedrijf gaat als CSS-variabele
// mee, zodat de chip meteen laat zien waar je bent.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await huidigeContext();
  const kleur = ctx.bedrijf?.kleur ?? "var(--verde)";

  return (
    <div className="app" style={{ ["--bedrijf" as string]: kleur }}>
      <aside className="zijbalk">
        <div className="zijbalk__merk">
          <i aria-hidden />
          <span>{ctx.instellingen.moeder_naam}</span>
        </div>

        <Navigatie isDocent={ctx.isDocent} />

        <div className="zijbalk__onder">
          <span>
            <strong>{ctx.profiel.naam}</strong>
            <br />
            {ctx.isDocent ? "Docent" : "Student"}
          </span>
          <form action={uitloggen}>
            <button type="submit" className="knop knop--klein">
              Uitloggen
            </button>
          </form>
        </div>
      </aside>

      <main className="inhoud">
        <div className="bovenbalk">
          <BedrijfKeuze
            bedrijven={ctx.bedrijven}
            actief={ctx.bedrijf}
            isDocent={ctx.isDocent}
            moederNaam={ctx.instellingen.moeder_naam}
          />
          <span className="bovenbalk__ruimte" />
        </div>
        {children}
      </main>
    </div>
  );
}
