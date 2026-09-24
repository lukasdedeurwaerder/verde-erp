import Link from "next/link";
import { huidigeContext } from "@/lib/sessie";
import { supabaseServer } from "@/lib/supabase/server";
import { aantal, euro } from "@/lib/geld";
import { cent } from "@/lib/lijnen";

export const metadata = { title: "Voorraad" };

type Rij = {
  id: string;
  bedrijf_id: string;
  code: string | null;
  naam: string;
  eenheid: string;
  voorraad: number;
  min_voorraad: number;
  aankoopprijs: number;
  actief: boolean;
};

// Voorraadoverzicht: hoeveel er van elk product is, en wat dat waard is
// tegen aankoopprijs. De waarde is wat later op de balans komt.
export default async function VoorraadPagina({ searchParams }: { searchParams: Promise<{ laag?: string }> }) {
  const { laag } = await searchParams;
  const alleenLaag = laag === "1";
  const ctx = await huidigeContext();
  const supabase = await supabaseServer();

  let query = supabase
    .from("producten")
    .select("id, bedrijf_id, code, naam, eenheid, voorraad, min_voorraad, aankoopprijs, actief")
    .eq("voorraad_bijhouden", true)
    .eq("actief", true)
    .order("naam");
  if (ctx.bedrijf) query = query.eq("bedrijf_id", ctx.bedrijf.id);
  const { data, error } = await query;

  const alle = (data ?? []) as Rij[];
  const rijen = alleenLaag ? alle.filter((p) => Number(p.voorraad) <= Number(p.min_voorraad)) : alle;
  const waarde = (p: Rij) => cent(Math.max(0, Number(p.voorraad)) * Number(p.aankoopprijs));
  const totaal = cent(alle.reduce((t, p) => t + waarde(p), 0));
  const aantalLaag = alle.filter((p) => Number(p.voorraad) <= Number(p.min_voorraad)).length;
  const bedrijfVan = (id: string) => ctx.bedrijven.find((b) => b.id === id);

  return (
    <>
      <div className="schermkop">
        <div>
          <h1>Voorraad</h1>
          <p>
            Leverbonnen halen goederen uit voorraad, ontvangstbonnen brengen ze binnen. Hier zie je het
            resultaat, en registreer je een beginvoorraad of een telling.
          </p>
        </div>
      </div>

      <div className="tegels">
        <div className="tegel">
          <div className="tegel__label">Producten met voorraad</div>
          <div className="tegel__getal">{alle.length}</div>
        </div>
        <Link href={alleenLaag ? "/voorraad" : "/voorraad?laag=1"} className="tegel">
          <div className="tegel__label">Onder het minimum</div>
          <div className="tegel__getal" style={{ color: aantalLaag ? "var(--waarschuwing)" : undefined }}>{aantalLaag}</div>
          <div className="tegel__sub">{alleenLaag ? "klik om alles te tonen" : "klik om enkel deze te tonen"}</div>
        </Link>
        <div className="tegel">
          <div className="tegel__label">Waarde tegen aankoopprijs</div>
          <div className="tegel__getal">{euro(totaal)}</div>
        </div>
      </div>

      {error && <p className="foutmelding">{error.message}</p>}

      <div className="tabelkader">
        <table className="tabel">
          <thead>
            <tr>
              <th>Product</th>
              {!ctx.bedrijf && <th>Bedrijf</th>}
              <th className="getal">Voorraad</th>
              <th className="getal">Minimum</th>
              <th className="getal">Aankoopprijs</th>
              <th className="getal">Waarde</th>
            </tr>
          </thead>
          <tbody>
            {rijen.length === 0 && (
              <tr>
                <td colSpan={6} className="leeg">
                  {alleenLaag ? "Geen producten onder hun minimum." : "Nog geen producten waarvan de voorraad bijgehouden wordt."}
                </td>
              </tr>
            )}
            {rijen.map((p) => {
              const b = bedrijfVan(p.bedrijf_id);
              const onder = Number(p.voorraad) <= Number(p.min_voorraad);
              return (
                <tr key={p.id} className="klikbaar">
                  <td>
                    <Link href={`/voorraad/${p.id}`} className="rij">
                      {p.naam}
                    </Link>
                    {p.code && <div className="hulptekst">{p.code}</div>}
                  </td>
                  {!ctx.bedrijf && (
                    <td>
                      {b && (
                        <span className="badge badge--bedrijf" style={{ background: b.kleur }}>
                          {b.naam}
                        </span>
                      )}
                    </td>
                  )}
                  <td className="getal">
                    <span className={onder ? "badge badge--waarschuwing" : undefined}>
                      {aantal(p.voorraad)} {p.eenheid}
                    </span>
                  </td>
                  <td className="getal">{aantal(p.min_voorraad)}</td>
                  <td className="getal">{euro(p.aankoopprijs)}</td>
                  <td className="getal">{euro(waarde(p))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
