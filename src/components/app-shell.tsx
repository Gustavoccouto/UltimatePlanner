"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: "⌂", caption: "Visão geral" },
  { label: "Contas", href: "/accounts", icon: "◷", caption: "Saldos" },
  { label: "Categorias", href: "/categories", icon: "◇", caption: "Organização" },
  { label: "Transações", href: "/transactions", icon: "↕", caption: "Entradas e saídas" },
  { label: "Cartões", href: "/cards", icon: "▣", caption: "Faturas" },
  { label: "Projetos", href: "/projects", icon: "▤", caption: "Planejamento" },
  { label: "Metas", href: "/goals", icon: "◎", caption: "Objetivos" },
  { label: "Investimentos", href: "/investments", icon: "△", caption: "Carteira" },
  { label: "Consultor IA", href: "/ai", icon: "✦", caption: "Análise" }
] as const;

function useCurrentSection(pathname: string) {
  return useMemo(() => {
    return navItems.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`)) || navItems[0];
  }, [pathname]);
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const currentSection = useCurrentSection(pathname);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.classList.toggle("drawer-open", drawerOpen);
    return () => document.body.classList.remove("drawer-open");
  }, [drawerOpen]);

  async function handleSignOut() {
    setSigningOut(true);
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  const nav = (
    <nav className="nav" aria-label="Navegação principal">
      {navItems.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link key={item.href} href={item.href} className={active ? "nav-link nav-link-active" : "nav-link"}>
            <span className="nav-icon" aria-hidden="true">{item.icon}</span>
            <span className="nav-text">
              <strong>{item.label}</strong>
              <small>{item.caption}</small>
            </span>
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="app-shell" id="app-shell">
      <aside className="sidebar" aria-label="Menu lateral">
        <div className="sidebar-inner">
          <div className="brand">
            <div className="brand-mark" aria-hidden="true" />
            <div>
              <p className="brand-title">UltimatePlanner</p>
              <p className="brand-caption">Finanças & Planejamento</p>
            </div>
          </div>
          {nav}
          <div className="sidebar-footer">
            <span>Base online</span>
            <strong>Supabase + Next.js</strong>
          </div>
        </div>
      </aside>

      <div className="app-content-shell">
        <header className="topbar" id="topbar">
          <div className="topbar-main">
            <button
              id="mobile-menu-btn"
              className="mobile-menu-button"
              type="button"
              aria-label="Abrir menu"
              aria-expanded={drawerOpen}
              onClick={() => setDrawerOpen(true)}
            >
              ☰
            </button>
            <div className="search-shell" aria-label="Seção atual">
              <span className="search-icon" aria-hidden="true">{currentSection.icon}</span>
              <div>
                <strong>{currentSection.label}</strong>
                <small>{currentSection.caption}</small>
              </div>
            </div>
            <div className="topbar-sync-pill" title="Migração incremental em Supabase">
              <span className="sync-dot" />
              Online
            </div>
            <button className="topbar-logout" type="button" disabled={signingOut} onClick={handleSignOut}>
              {signingOut ? "Saindo..." : "Sair"}
            </button>
          </div>
        </header>

        <main className="main app-main">{children}</main>
      </div>

      <div id="mobile-drawer" className={drawerOpen ? "mobile-drawer is-open" : "mobile-drawer"} aria-hidden={!drawerOpen}>
        <button className="mobile-drawer-backdrop" type="button" aria-label="Fechar menu" onClick={() => setDrawerOpen(false)} />
        <aside className="mobile-drawer-panel" aria-label="Menu mobile">
          <div className="mobile-drawer-head">
            <div className="brand compact-brand">
              <div className="brand-mark" aria-hidden="true" />
              <div>
                <p className="brand-title">UltimatePlanner</p>
                <p className="brand-caption">Menu</p>
              </div>
            </div>
            <button className="icon-button" type="button" onClick={() => setDrawerOpen(false)} aria-label="Fechar menu">×</button>
          </div>
          {nav}
          <button className="btn btn-muted mobile-signout" type="button" disabled={signingOut} onClick={handleSignOut}>
            {signingOut ? "Saindo..." : "Sair da conta"}
          </button>
        </aside>
      </div>
    </div>
  );
}
