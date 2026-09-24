import Link from "next/link";
import { boekingNummer, datum, DAGBOEK_LABEL, documentPad } from "@/lib/bestelling";
import { euro } from "@/lib/geld";
import type { Boeking, Boekingslijn, DocumentSoort } from "@/lib/types";

export type BoekingMetLijnen = Boeking & {
  boekingslijnen: Boekingslijn[];
  documenten?: { id: string; soort: string; nummer: string | null } | null;
};

// Eén boeking zoals in een dagboek op papier: datum, nummer en
// omschrijving, met eronder de rekeningen in debet en credit.
export function BoekingWeergave({
  boeking: b,
  bedrijf,
  actie,
}: {
  boeking: BoekingMetLijnen;
  bedrijf?: { naam: string; kleur: string } | null;
  actie?: React.ReactNode;
}) {
  const lijnen = [...b.boekingslijnen].sort((x, y) => x.volgorde - y.volgorde || Number(y.debet) - Number(x.debet));
  const docPad = b.documenten ? documentPad(b.documenten as { id: string; soort: DocumentSoort }) : null;

  return (
    <div className="boeking">
      <div className="boeking__kop">
        <span className="boeking__nummer">{boekingNummer(b)}</span>
        <span>{datum(b.datum)}</span>
        <span className="boeking__oms">
          {b.omschrijving}
          {b.uittreksel_nummer && <span className="hulptekst"> · uittreksel {b.uittreksel_nummer}</span>}
          {docPad && (
            <>
              {" · "}
              <Link href={docPad}>{b.documenten!.nummer}</Link>
            </>
          )}
        </span>
        {bedrijf && (
          <span className="badge badge--bedrijf" style={{ background: bedrijf.kleur }}>
            {bedrijf.naam}
          </span>
        )}
        <span className="badge">{DAGBOEK_LABEL[b.dagboek].naam}</span>
        {actie}
      </div>
      <table className="tabel boeking__lijnen">
        <tbody>
          {lijnen.map((l) => (
            <tr key={l.id}>
              <td style={{ paddingLeft: Number(l.credit) > 0 ? 40 : 14 }}>
                {l.rekeningen && (
                  <Link href={`/grootboek/${l.rekeningen.nummer}`} className="boeking__rek">
                    {l.rekeningen.nummer} {l.rekeningen.naam}
                  </Link>
                )}
                {l.omschrijving && <span className="hulptekst"> · {l.omschrijving}</span>}
              </td>
              <td className="getal" style={{ width: 120 }}>{Number(l.debet) ? euro(l.debet) : ""}</td>
              <td className="getal" style={{ width: 120 }}>{Number(l.credit) ? euro(l.credit) : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** De select voor een boeking met lijnen en rekeningnamen. */
export const BOEKING_SELECT =
  "*, boekingslijnen(id, rekening_id, omschrijving, debet, credit, volgorde, rekeningen(nummer, naam)), documenten(id, soort, nummer)";
