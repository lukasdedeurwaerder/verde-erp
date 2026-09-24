"use client";

import { useTransition } from "react";
import type { Bedrijf } from "@/lib/types";
import { kiesBedrijf } from "./acties";

// De bovenbalk-chip. Voor een student is het een vast label; de docent
// krijgt een keuzelijst met beide dochters en "Verde (alles)".
export function BedrijfKeuze({
  bedrijven,
  actief,
  isDocent,
  moederNaam,
}: {
  bedrijven: Bedrijf[];
  actief: Bedrijf | null;
  isDocent: boolean;
  moederNaam: string;
}) {
  const [bezig, start] = useTransition();

  if (!isDocent) {
    return (
      <span className="bedrijfchip" title="Je werkt in dit bedrijf">
        <i aria-hidden />
        {actief?.naam ?? "Geen bedrijf"}
      </span>
    );
  }

  return (
    <label className="bedrijfchip" style={{ opacity: bezig ? 0.6 : 1 }}>
      <i aria-hidden />
      <span className="label" style={{ fontWeight: 500 }}>Werken in</span>
      <select
        value={actief?.id ?? "alles"}
        onChange={(e) => start(() => kiesBedrijf(e.target.value))}
        disabled={bezig}
      >
        {bedrijven.map((b) => (
          <option key={b.id} value={b.id}>
            {b.naam}
          </option>
        ))}
        <option value="alles">{moederNaam} (alles)</option>
      </select>
    </label>
  );
}
