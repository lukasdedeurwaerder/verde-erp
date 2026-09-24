// Rekenwerk op lijnen: bedragen per lijn en totalen per btw-tarief.
//
// Dezelfde formule als de trigger in de databank
// (document_totalen_bijwerken): per lijn afronden op de cent, daarna
// optellen. Zo tonen scherm en pdf exact wat de databank bewaart.

import type { Lijn } from "@/lib/types";

/** Afronden op de cent, zonder verrassingen bij 1,005. */
export function cent(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Bedrag van één lijn, exclusief btw, na korting. */
export function lijnExcl(l: Pick<Lijn, "aantal" | "eenheidsprijs" | "korting_pct">): number {
  return cent(l.aantal * l.eenheidsprijs * (1 - l.korting_pct / 100));
}

/** Btw op één lijn. */
export function lijnBtw(l: Pick<Lijn, "aantal" | "eenheidsprijs" | "korting_pct" | "btw_tarief">): number {
  return cent(lijnExcl(l) * (l.btw_tarief / 100));
}

export type Totalen = {
  excl: number;
  btw: number;
  incl: number;
  /** Per tarief: { 21: { grondslag, btw }, 6: ... } — alleen tarieven die voorkomen. */
  perTarief: { tarief: number; grondslag: number; btw: number }[];
};

export function totalen(lijnen: Lijn[]): Totalen {
  const per = new Map<number, { grondslag: number; btw: number }>();
  let excl = 0;
  let btw = 0;

  for (const l of lijnen) {
    const e = lijnExcl(l);
    const b = lijnBtw(l);
    excl = cent(excl + e);
    btw = cent(btw + b);
    const t = per.get(l.btw_tarief) ?? { grondslag: 0, btw: 0 };
    t.grondslag = cent(t.grondslag + e);
    t.btw = cent(t.btw + b);
    per.set(l.btw_tarief, t);
  }

  return {
    excl,
    btw,
    incl: cent(excl + btw),
    perTarief: [...per.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([tarief, t]) => ({ tarief, ...t })),
  };
}

/**
 * Lijnen uit een formulier lezen. Ze komen als JSON in één verborgen
 * veld; hier worden ze gecontroleerd en opgeschoond, want aan
 * browsergegevens vertrouwen we niets.
 */
export function leesLijnen(json: FormDataEntryValue | null): { lijnen: Lijn[] } | { fout: string } {
  if (typeof json !== "string" || json.trim() === "") return { lijnen: [] };

  let ruw: unknown;
  try {
    ruw = JSON.parse(json);
  } catch {
    return { fout: "De lijnen konden niet gelezen worden." };
  }
  if (!Array.isArray(ruw)) return { fout: "De lijnen konden niet gelezen worden." };

  const lijnen: Lijn[] = [];
  for (const [i, r] of ruw.entries()) {
    if (typeof r !== "object" || r === null) continue;
    const o = r as Record<string, unknown>;
    const omschrijving = String(o.omschrijving ?? "").trim();
    const aantal = Number(o.aantal);
    const eenheidsprijs = Number(o.eenheidsprijs);
    const btw = Number(o.btw_tarief);
    const korting = Number(o.korting_pct ?? 0);

    if (!omschrijving && !(aantal > 0)) continue; // lege rij overslaan
    if (!omschrijving) return { fout: `Lijn ${i + 1}: vul een omschrijving in.` };
    if (!(aantal > 0)) return { fout: `Lijn ${i + 1} (${omschrijving}): het aantal moet groter zijn dan 0.` };
    if (!Number.isFinite(eenheidsprijs) || eenheidsprijs < 0) return { fout: `Lijn ${i + 1} (${omschrijving}): ongeldige prijs.` };
    if (![0, 6, 12, 21].includes(btw)) return { fout: `Lijn ${i + 1} (${omschrijving}): ongeldig btw-tarief.` };
    if (!Number.isFinite(korting) || korting < 0 || korting > 100) return { fout: `Lijn ${i + 1} (${omschrijving}): de korting moet tussen 0 en 100 liggen.` };

    lijnen.push({
      product_id: typeof o.product_id === "string" && o.product_id ? o.product_id : null,
      omschrijving,
      aantal: cent(aantal),
      eenheidsprijs: cent(eenheidsprijs),
      btw_tarief: btw,
      korting_pct: cent(korting),
      volgorde: lijnen.length,
    });
  }

  return { lijnen };
}
