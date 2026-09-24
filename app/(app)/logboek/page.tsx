import Link from "next/link";
import { vereistDocent } from "@/lib/sessie";
import { supabaseServer } from "@/lib/supabase/server";
import { euro } from "@/lib/geld";

export const metadata = { title: "Logboek" };

type Regel = {
  id: string;
  bedrijf_id: string | null;
  gebruiker_id: string | null;
  tijdstip: string;
  actie: string;
  onderwerp: string | null;
  onderwerp_id: string | null;
  details: { tabel?: string; van?: string; naar?: string; totaal?: number; aantal?: number } | null;
  profielen: { naam: string } | null;
};

const ACTIE: Record<string, { tekst: string; klasse: string }> = {
  aangemaakt: { tekst: "aangemaakt", klasse: "badge" },
  gewijzigd: { tekst: "gewijzigd", klasse: "badge" },
  verwijderd: { tekst: "verwijderd", klasse: "badge badge--fout" },
  status: { tekst: "status", klasse: "badge badge--waarschuwing" },
  definitief: { tekst: "definitief", klasse: "badge badge--goed" },
  geannuleerd: { tekst: "geannuleerd", klasse: "badge badge--fout" },
  beginvoorraad: { tekst: "beginvoorraad", klasse: "badge" },
  correctie: { tekst: "telling", klasse: "badge badge--waarschuwing" },
};

const STATUS: Record<string, string> = {
  nieuw: "nieuw",
  in_behandeling: "in behandeling",
  klaar: "klaar",
  geleverd: "geleverd",
  gefactureerd: "gefactureerd",
  geannuleerd: "geannuleerd",
};

/** Waar het onderwerp te bekijken is, als het nog bestaat. */
function link(r: Regel): string | null {
  if (!r.onderwerp_id || r.actie === "verwijderd") return null;
  switch (r.details?.tabel) {
    case "relaties":
      return r.onderwerp?.startsWith("Leverancier") ? `/leveranciers/${r.onderwerp_id}` : `/klanten/${r.onderwerp_id}`;
    case "producten":
      return `/producten/${r.onderwerp_id}`;
    case "bestellingen":
      return `/bestellingen/${r.onderwerp_id}`;
    case "documenten":
      return r.onderwerp?.startsWith("Aankoop") ? `/aankopen/${r.onderwerp_id}` : `/documenten/${r.onderwerp_id}`;
    default:
      return null;
  }
}

// Wie deed wat, en wanneer. De databank schrijft dit zelf; niemand kan
// het aanpassen. Filter op student met ?persoon=, op bedrijf via de bovenbalk.
export default async function LogboekPagina({ searchParams }: { searchParams: Promise<{ persoon?: string; periode?: string }> }) {
  const { persoon, periode } = await searchParams;
  const ctx = await vereistDocent();
  const supabase = await supabaseServer();

  let q = supabase
    .from("logboek")
    .select("*, profielen(naam)")
    .order("tijdstip", { ascending: false })
    .limit(400);
  if (ctx.bedrijf) q = q.eq("bedrijf_id", ctx.bedrijf.id);
  if (persoon) q = q.eq("gebruiker_id", persoon);
  if (periode === "vandaag") q = q.gte("tijdstip", new Date(Date.now() - 86400000).toISOString());
  if (periode === "week") q = q.gte("tijdstip", new Date(Date.now() - 7 * 86400000).toISOString());

  const [{ data, error }, { data: personen }] = await Promise.all([
    q,
    supabase.from("profielen").select("id, naam, rol").order("rol").order("naam"),
  ]);
  const regels = (data ?? []) as unknown as Regel[];
  const bedrijfVan = (id: string | null) => ctx.bedrijven.find((b) => b.id === id);

  return (
    <>
      <div className="schermkop">
        <div>
          <h1>Logboek</h1>
          <p>
            Wie deed wat, {ctx.bedrijf ? `in ${ctx.bedrijf.naam}` : "in alle bedrijven"}. De databank noteert dit zelf, en
            niemand kan het wijzigen.
          </p>
        </div>
        <div className="schermkop__acties">
          <Link href="/docent" className="knop">
            ← Docentenpaneel
          </Link>
        </div>
      </div>

      <form className="zoekbalk" method="get">
        <select name="persoon" className="veld" defaultValue={persoon ?? ""} style={{ maxWidth: 260 }}>
          <option value="">Iedereen</option>
          {(personen ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.naam}
              {p.rol === "docent" ? " (docent)" : ""}
            </option>
          ))}
        </select>
        <select name="periode" className="veld" defaultValue={periode ?? ""} style={{ maxWidth: 200 }}>
          <option value="">Altijd</option>
          <option value="vandaag">Laatste 24 uur</option>
          <option value="week">Laatste 7 dagen</option>
        </select>
        <button type="submit" className="knop">
          Tonen
        </button>
        <span className="hulptekst">{regels.length === 400 ? "de laatste 400 regels" : `${regels.length} regels`}</span>
      </form>

      {error && <p className="foutmelding">{error.message}</p>}

      <div className="tabelkader">
        <table className="tabel">
          <thead>
            <tr>
              <th>Wanneer</th>
              <th>Wie</th>
              {!ctx.bedrijf && <th>Bedrijf</th>}
              <th>Wat</th>
              <th>Onderwerp</th>
            </tr>
          </thead>
          <tbody>
            {regels.length === 0 && (
              <tr>
                <td colSpan={5} className="leeg">
                  Nog niets in het logboek.
                </td>
              </tr>
            )}
            {regels.map((r) => {
              const a = ACTIE[r.actie] ?? { tekst: r.actie, klasse: "badge" };
              const b = bedrijfVan(r.bedrijf_id);
              const pad = link(r);
              return (
                <tr key={r.id}>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {new Date(r.tijdstip).toLocaleString("nl-BE", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Brussels" })}
                  </td>
                  <td>{r.profielen?.naam ?? <span className="hulptekst">systeem</span>}</td>
                  {!ctx.bedrijf && (
                    <td>
                      {b && (
                        <span className="badge badge--bedrijf" style={{ background: b.kleur }}>
                          {b.naam}
                        </span>
                      )}
                    </td>
                  )}
                  <td>
                    <span className={a.klasse}>{a.tekst}</span>
                  </td>
                  <td>
                    {pad ? <Link href={pad}>{r.onderwerp}</Link> : r.onderwerp}
                    {r.details?.van && (
                      <span className="hulptekst">
                        {" "}
                        · {STATUS[r.details.van] ?? r.details.van} → {STATUS[r.details.naar ?? ""] ?? r.details.naar}
                      </span>
                    )}
                    {r.details?.totaal !== undefined && r.details.tabel === "documenten" && r.actie !== "aangemaakt" && (
                      <span className="hulptekst"> · {euro(r.details.totaal)}</span>
                    )}
                    {r.details?.aantal !== undefined && (
                      <span className="hulptekst">
                        {" "}
                        · {Number(r.details.aantal) > 0 ? "+" : ""}
                        {String(r.details.aantal).replace(".", ",")}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
