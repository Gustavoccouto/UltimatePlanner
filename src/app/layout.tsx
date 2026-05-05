import type { Metadata } from "next";

import "./globals.css";
import "./ux-polish.css";

export const metadata: Metadata = {
  title: "UltimatePlanner",
  description: "Finanças pessoais, metas, projetos, cartões e investimentos em um painel claro."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
