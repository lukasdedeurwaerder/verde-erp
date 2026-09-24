import { huidigeContext } from "@/lib/sessie";
import { WachtwoordFormulier } from "./Formulier";

export const metadata = { title: "Mijn wachtwoord" };

export default async function WachtwoordPagina() {
  const ctx = await huidigeContext();

  return (
    <>
      <div className="schermkop">
        <div>
          <h1>Mijn wachtwoord</h1>
          <p>
            Ingelogd als {ctx.profiel.naam} ({ctx.email}). Kreeg je een startwachtwoord van je
            docent? Kies hier een eigen wachtwoord.
          </p>
        </div>
      </div>
      <div className="kaart" style={{ maxWidth: 480 }}>
        <WachtwoordFormulier />
      </div>
    </>
  );
}
