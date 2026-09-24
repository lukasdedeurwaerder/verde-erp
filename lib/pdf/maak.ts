import "server-only";

import { createElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import type { SupabaseClient } from "@supabase/supabase-js";
import { bestellingNummer, DOCUMENT_LABEL } from "@/lib/bestelling";
import type { Bedrijf, Document, Instellingen, Lijn, Relatie } from "@/lib/types";
import { DocumentPdf, type PdfGegevens } from "./DocumentPdf";

/**
 * Alles ophalen wat een pdf nodig heeft. Gaat door de gewone
 * Supabase-verbinding van de gebruiker, dus RLS geldt: wie het document
 * niet mag zien, krijgt null.
 */
export async function haalPdfGegevens(supabase: SupabaseClient, documentId: string): Promise<PdfGegevens | null> {
  const { data: d } = await supabase
    .from("documenten")
    .select("*, documentlijnen(*), relaties(*), bedrijven(*), bestellingen(jaar, nummer, verantwoordelijke:profielen!bestellingen_verantwoordelijke_id_fkey(naam))")
    .eq("id", documentId)
    .maybeSingle();
  if (!d) return null;

  const { data: instellingen } = await supabase.from("instellingen").select("*").eq("id", 1).single();
  if (!instellingen) return null;

  type Rij = Document & {
    documentlijnen: Lijn[];
    relaties: Relatie;
    bedrijven: Bedrijf;
    bestellingen: { jaar: number; nummer: number; verantwoordelijke: { naam: string } | null } | null;
  };
  const { documentlijnen, relaties, bedrijven, bestellingen, ...document } = d as unknown as Rij;

  return {
    document,
    lijnen: [...(documentlijnen ?? [])].sort((a, b) => a.volgorde - b.volgorde),
    relatie: relaties,
    bedrijf: bedrijven,
    instellingen: instellingen as Instellingen,
    bestellingNummer: bestellingen ? bestellingNummer(bestellingen) : null,
    verantwoordelijke: bestellingen?.verantwoordelijke?.naam ?? null,
  };
}

/** De pdf zelf, als bytes. */
export async function maakPdf(gegevens: PdfGegevens): Promise<Buffer> {
  // De typen van react-pdf verwachten letterlijk een <Document>; ons
  // component geeft er een terug, maar dat ziet TypeScript niet.
  return renderToBuffer(createElement(DocumentPdf, gegevens) as unknown as Parameters<typeof renderToBuffer>[0]);
}

/** Bestandsnaam voor de download: Offerte-OF-2026-0001.pdf */
export function pdfBestandsnaam(d: Pick<Document, "soort" | "nummer">): string {
  const nummer = (d.nummer ?? "concept").replace(/[^A-Za-z0-9-]/g, "_");
  return `${DOCUMENT_LABEL[d.soort]}-${nummer}.pdf`;
}
