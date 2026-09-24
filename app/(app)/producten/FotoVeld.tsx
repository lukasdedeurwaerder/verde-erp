"use client";

import { useRef, useState } from "react";
import { verkleinAfbeelding } from "@/lib/afbeelding";

// Het fotovak in het productformulier.
//
// De gekozen foto wordt meteen in de browser verkleind en teruggezet in
// het bestandsveld, zodat het gewone formulier ze meestuurt. De server
// hoeft dus niets te weten van verkleinen.
export function FotoVeld({ huidigeUrl }: { huidigeUrl: string | null }) {
  const invoer = useRef<HTMLInputElement>(null);
  const [voorbeeld, setVoorbeeld] = useState<string | null>(huidigeUrl);
  const [wissen, setWissen] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  async function gekozen(e: React.ChangeEvent<HTMLInputElement>) {
    const bestand = e.target.files?.[0];
    if (!bestand) return;
    setFout(null);
    setBezig(true);
    try {
      const klein = await verkleinAfbeelding(bestand);
      const nieuw = new File([klein], "foto.jpg", { type: "image/jpeg" });
      const dt = new DataTransfer();
      dt.items.add(nieuw);
      e.target.files = dt.files;
      setVoorbeeld(URL.createObjectURL(klein));
      setWissen(false);
    } catch (f) {
      setFout(f instanceof Error ? f.message : "Kan deze foto niet verwerken.");
      e.target.value = "";
    } finally {
      setBezig(false);
    }
  }

  function verwijder() {
    if (invoer.current) invoer.current.value = "";
    setVoorbeeld(null);
    setWissen(true);
  }

  return (
    <div className="fotoveld">
      {voorbeeld ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={voorbeeld} alt="" className="fotoveld__beeld" />
      ) : (
        <div className="fotoveld__beeld">Geen foto</div>
      )}
      <div className="fotoveld__knoppen">
        <label className="label">Productfoto</label>
        <input
          ref={invoer}
          type="file"
          name="foto"
          accept="image/*"
          onChange={gekozen}
          disabled={bezig}
        />
        <input type="hidden" name="foto_wissen" value={wissen ? "on" : ""} />
        {voorbeeld && (
          <button type="button" className="knop knop--klein knop--gevaar" onClick={verwijder}>
            Foto verwijderen
          </button>
        )}
        <span className="hulptekst">
          {bezig ? "Foto verkleinen…" : "Wordt automatisch verkleind tot 1024 pixels."}
        </span>
        {fout && <span className="foutmelding">{fout}</span>}
      </div>
    </div>
  );
}
