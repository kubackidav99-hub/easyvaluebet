import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EasyBet · Value Radar",
  description: "Kursy Betclic PL i szacowane valuebety względem Pinnacle. Wszystkie sporty w jednym panelu.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pl">
      <body className="antialiased">{children}</body>
    </html>
  );
}
