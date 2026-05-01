import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "UltimatePlanner",
  description: "Finanças pessoais com backend Supabase e visual preservado."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
