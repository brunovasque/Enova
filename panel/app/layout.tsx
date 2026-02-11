import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'ENOVA Atendimento',
  description: 'Painel ENOVA estilo WhatsApp Web'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
