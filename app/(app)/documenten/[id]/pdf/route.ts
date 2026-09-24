import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { haalPdfGegevens, maakPdf, pdfBestandsnaam } from "@/lib/pdf/maak";

// De pdf van een document.
//
// Definitief: de bewaarde pdf uit de opslag, altijd dezelfde bytes.
// Concept: telkens opnieuw gemaakt, met "CONCEPT" erop.
// Row Level Security geldt via de gewone verbinding: wie het document
// niet mag zien, krijgt 404.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();

  const gegevens = await haalPdfGegevens(supabase, id);
  if (!gegevens) return new NextResponse("Niet gevonden", { status: 404 });

  const d = gegevens.document;
  let bytes: Uint8Array | null = null;

  // Een aankoopfactuur maken we niet zelf: we tonen de pdf van de leverancier.
  if (d.soort === "aankoopfactuur") {
    if (!d.pdf_pad) return new NextResponse("Geen bijlage", { status: 404 });
    const { data } = await supabase.storage.from("documenten").download(d.pdf_pad);
    if (!data) return new NextResponse("Bijlage niet gevonden", { status: 404 });
    return new NextResponse(new Uint8Array(await data.arrayBuffer()) as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="Aankoopfactuur-${(d.extern_nummer ?? d.nummer ?? "").replace(/[^A-Za-z0-9-]/g, "_")}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  if (d.status !== "concept" && d.pdf_pad) {
    const { data } = await supabase.storage.from("documenten").download(d.pdf_pad);
    if (data) bytes = new Uint8Array(await data.arrayBuffer());
  }
  if (!bytes) bytes = new Uint8Array(await maakPdf(gegevens));

  const download = request.nextUrl.searchParams.get("download") === "1";
  const naam = pdfBestandsnaam(d);

  return new NextResponse(bytes as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${naam}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
