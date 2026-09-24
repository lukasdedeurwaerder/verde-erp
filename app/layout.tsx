import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Verde-ERP", template: "%s · Verde-ERP" },
  description: "ERP en boekhouding voor de studentenbedrijven van Verde",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <body>{children}</body>
    </html>
  );
}
