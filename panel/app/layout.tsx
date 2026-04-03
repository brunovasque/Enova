import type { Metadata } from "next";
import "./globals.css";
import { PanelNav } from "./components/PanelNav";

export const metadata: Metadata = {
  title: "Enova Panel",
  description: "Painel administrativo Enova",
  icons: {
    icon: "/favicon.png"
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>
        <PanelNav />
        {children}
      </body>
    </html>
  );
}
