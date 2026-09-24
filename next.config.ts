import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // De pdf-bibliotheek draait op de server en mag niet door de bundelaar
  // van Next herschreven worden; anders ontbreken er lettertypes.
  serverExternalPackages: ["@react-pdf/renderer"],
  // pdfkit laadt de standaardlettertypes (Helvetica, ...) via een
  // dynamische verwijzing die de bundelaar van Vercel niet kan volgen.
  // Zonder deze regel ontbreken die bestanden op de server en geeft elke
  // pdf een serverfout. Lokaal merk je er niets van: daar staat de hele
  // node_modules-map.
  outputFileTracingIncludes: {
    "/**": ["./node_modules/pdfkit/js/**"],
  },
  experimental: {
    serverActions: {
      // Productfoto's komen via een formulier binnen. Ze worden in de
      // browser al verkleind tot zo'n 150 kB, maar we laten wat marge.
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
