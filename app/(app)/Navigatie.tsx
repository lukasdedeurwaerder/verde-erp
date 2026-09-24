"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// De onderdelen in de zijbalk. Elke fase voegt hier zijn schermen toe.
const ONDERDELEN: { pad: string; naam: string; kop?: string }[] = [
  { pad: "/", naam: "Overzicht" },
  { pad: "/klanten", naam: "Klanten", kop: "Fiches" },
  { pad: "/leveranciers", naam: "Leveranciers" },
  { pad: "/producten", naam: "Producten" },
  { pad: "/voorraad", naam: "Voorraad" },
  { pad: "/bestellingen", naam: "Bestellingen", kop: "Verkoop en aankoop" },
  { pad: "/documenten", naam: "Documenten" },
  { pad: "/aankopen", naam: "Aankoopfacturen", kop: "Boekhouding" },
  { pad: "/bank", naam: "Bank" },
  { pad: "/dagboeken", naam: "Dagboeken" },
  { pad: "/rapporten", naam: "Balans en resultaat" },
];

const HULP = [{ pad: "/hulp", naam: "Hoe werkt het?", kop: "Hulp" }];

const DOCENT: { pad: string; naam: string; kop?: string }[] = [
  { pad: "/docent", naam: "Docentenpaneel", kop: "Docent" },
  { pad: "/logboek", naam: "Logboek" },
  { pad: "/rekeningen", naam: "Rekeningenstelsel" },
  { pad: "/instellingen", naam: "Instellingen" },
];

export function Navigatie({ isDocent }: { isDocent: boolean }) {
  const pad = usePathname();
  const items = isDocent ? [...ONDERDELEN, ...DOCENT, ...HULP] : [...ONDERDELEN, ...HULP];

  return (
    <>
      {items.map((item) => {
        const actief = item.pad === "/" ? pad === "/" : pad.startsWith(item.pad);
        return (
          <span key={item.pad} style={{ display: "contents" }}>
            {item.kop && <div className="zijbalk__kop">{item.kop}</div>}
            <Link href={item.pad} className="nav" aria-current={actief ? "page" : undefined}>
              {item.naam}
            </Link>
          </span>
        );
      })}
    </>
  );
}
