import { vereistDocent } from "@/lib/sessie";
import { supabaseServer } from "@/lib/supabase/server";
import type { Rekening } from "@/lib/types";
import { RekeningNieuw, RekeningRij, Standaardrekeningen } from "./Formulieren";

export const metadata = { title: "Rekeningenstelsel" };

const KLASSEN: Record<string, string> = {
  "1": "Klasse 1 · Eigen vermogen en schulden op lange termijn",
  "2": "Klasse 2 · Vaste activa",
  "3": "Klasse 3 · Voorraden",
  "4": "Klasse 4 · Vorderingen en schulden op korte termijn",
  "5": "Klasse 5 · Liquide middelen",
  "6": "Klasse 6 · Kosten",
  "7": "Klasse 7 · Opbrengsten",
};

// Het rekeningenstelsel beheren. Enkel voor de docent; de databank
// weigert wijzigingen van studenten sowieso.
export default async function RekeningenPagina() {
  const ctx = await vereistDocent();
  const supabase = await supabaseServer();

  const [{ data: reks }, { data: gebruik }, { data: inst }] = await Promise.all([
    supabase.from("rekeningen").select("*").order("nummer"),
    supabase.rpc("rekening_gebruik"),
    supabase.from("instellingen").select("rek_klanten, rek_leveranciers, rek_btw_te_betalen, rek_btw_terug, rek_bank, rek_omzet, rek_aankopen").eq("id", 1).single(),
  ]);
  const rekeningen = (reks ?? []) as Rekening[];
  const teller = new Map<string, number>();
  for (const g of (gebruik ?? []) as { rekening_id: string; aantal: number }[]) {
    teller.set(g.rekening_id, (teller.get(g.rekening_id) ?? 0) + Number(g.aantal));
  }

  return (
    <>
      <div className="schermkop">
        <div>
          <h1>Rekeningenstelsel</h1>
          <p>
            Vereenvoudigd Belgisch rekeningenstelsel voor {ctx.instellingen.moeder_naam}. Een rekening waarop al geboekt is,
            kun je hernoemen of uitschakelen, maar niet verwijderen. Uitgeschakelde rekeningen verdwijnen uit de keuzelijsten.
          </p>
        </div>
      </div>

      <div className="kaart">
        <div className="kaart__kop">
          <h2>Rekening toevoegen</h2>
        </div>
        <RekeningNieuw />
      </div>

      <div className="kaart">
        <div className="kaart__kop">
          <h2>Standaardrekeningen</h2>
          <span className="hulptekst">Gebruikt door de automatische boekingen van facturen en de bank.</span>
        </div>
        <Standaardrekeningen huidig={(inst ?? {}) as Record<string, string>} rekeningen={rekeningen.filter((r) => r.actief)} />
      </div>

      <div className="tabelkader" style={{ marginTop: 16 }}>
        <table className="tabel">
          <thead>
            <tr>
              <th style={{ width: 70 }}>Nr.</th>
              <th>Naam</th>
              <th style={{ width: 200 }}>Soort</th>
              <th style={{ width: 90 }}></th>
              <th className="getal" style={{ width: 90 }}>Gebruikt</th>
              <th style={{ width: 280 }}></th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(KLASSEN).map(([k, titel]) => {
              const inKlasse = rekeningen.filter((r) => r.nummer.startsWith(k));
              if (inKlasse.length === 0) return null;
              return [
                <tr key={`k${k}`} className="rapport__rubriek">
                  <td colSpan={6}>{titel}</td>
                </tr>,
                ...inKlasse.map((r) => <RekeningRij key={r.id} rekening={r} gebruik={teller.get(r.id) ?? 0} />),
              ];
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
