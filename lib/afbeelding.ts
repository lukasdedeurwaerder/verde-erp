// Een gekozen productfoto verkleinen vóór ze verstuurd wordt.
//
// Dit gebeurt in de BROWSER. Een foto van een telefoon is al gauw vier
// megabyte; voor een productfiche volstaat 1024 pixels op de langste
// zijde, zo'n 100 tot 200 kB. Dat scheelt opslag én laadtijd.

export const FOTO_MAX_ZIJDE = 1024;

/**
 * Laden via een <img>, niet via createImageBitmap: een <img> past de
 * draairichting uit de EXIF-gegevens vanzelf toe. Anders staat elke
 * staand genomen foto op zijn kant.
 */
async function laadAfbeelding(bron: string): Promise<HTMLImageElement> {
  const afbeelding = new Image();

  const geladen = new Promise<void>((klaar, mislukt) => {
    afbeelding.onload = () => klaar();
    afbeelding.onerror = () => mislukt(new Error("Onleesbare afbeelding."));
  });

  afbeelding.src = bron;
  await geladen;

  if (!afbeelding.naturalWidth || !afbeelding.naturalHeight) {
    throw new Error("Onleesbare afbeelding.");
  }

  // decode() zorgt dat de pixels er echt zijn voor we tekenen; op iOS
  // krijg je anders soms een leeg doek. Met een klok ernaast, want in
  // een onzichtbaar venster kan decode() blijven hangen.
  await Promise.race([
    afbeelding.decode().catch(() => undefined),
    new Promise((klaar) => setTimeout(klaar, 5000)),
  ]);

  return afbeelding;
}

/** De foto schalen naar hoogstens `maxZijde` en er een JPEG van maken. */
export async function verkleinAfbeelding(
  bestand: File,
  maxZijde = FOTO_MAX_ZIJDE,
  kwaliteit = 0.82,
): Promise<Blob> {
  const bron = URL.createObjectURL(bestand);

  try {
    const afbeelding = await laadAfbeelding(bron);

    const breedte = afbeelding.naturalWidth;
    const hoogte = afbeelding.naturalHeight;

    const schaal = Math.min(1, maxZijde / Math.max(breedte, hoogte));
    const doel = document.createElement("canvas");
    doel.width = Math.max(1, Math.round(breedte * schaal));
    doel.height = Math.max(1, Math.round(hoogte * schaal));

    const penseel = doel.getContext("2d");
    if (!penseel) throw new Error("Kan de afbeelding niet verwerken.");
    penseel.drawImage(afbeelding, 0, 0, doel.width, doel.height);

    const blob = await new Promise<Blob | null>((klaar) =>
      doel.toBlob(klaar, "image/jpeg", kwaliteit),
    );
    if (!blob) throw new Error("Kan de afbeelding niet opslaan.");

    return blob;
  } finally {
    URL.revokeObjectURL(bron);
  }
}
