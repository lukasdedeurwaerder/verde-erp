import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // De pdf-bibliotheek draait op de server en mag niet door de bundelaar
  // van Next herschreven worden; anders ontbreken er lettertypes.
  serverExternalPackages: ["@react-pdf/renderer"],
  experimental: {
    serverActions: {
      // Productfoto's komen via een formulier binnen. Ze worden in de
      // browser al verkleind tot zo'n 150 kB, maar we laten wat marge.
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
