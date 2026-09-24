"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// De onderdelen in de zijbalk. Elke fase voegt hier zijn schermen toe.
const ONDERDELEN: { pad: string; naam: string; kop?: string }[] = [
  { pad: "/", naam: "Overzicht" },
  { pad: "/klanten", naam: "Klanten", kop: "Fiches" },
  { pad: "/leveranciers", naam: "Leveranciers" },
  { pad: "/producten", naam: "Producten" },
  { pad: "/bestellingen", naam: "Bestellingen", kop: "Verkoop en aankoop" },
  { pad: "/documenten", naam: "Documenten" },
];

const DOCENT: { pad: string; naam: string; kop?: string }[] = [
  { pad: "/instellingen", naam: "Instellingen", kop: "Docent" },
];

export function Navigatie({ isDocent }: { isDocent: boolean }) {
  const pad = usePathname();
  const items = isDocent ? [...ONDERDELEN, ...DOCENT] : ONDERDELEN;

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
