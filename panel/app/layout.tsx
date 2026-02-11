import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Enova Panel",
  description: "Painel administrativo Enova",
  icons: {
    icon: "/favicon.png",
    apple: "/apple-touch-icon.png"
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
