import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      // Productfoto's komen via een formulier binnen. Ze worden in de
      // browser al verkleind tot zo'n 150 kB, maar we laten wat marge.
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
