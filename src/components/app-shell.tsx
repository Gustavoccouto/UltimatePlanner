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
  { label: "Consultor IA", href: "/ai", icon: "✦", caption: "Análise" },
  { label: "Conta", href: "/settings", icon: "◉", caption: "Usuário e segurança" }
] as const;

type CurrentUser = {
  name: string;
  email: string;
  initials: string;
};

function useCurrentSection(pathname: string) {
  return useMemo(() => {
    return navItems.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`)) || navItems[0];
  }, [pathname]);
}

function getInitials(nameOrEmail: string) {
  const clean = nameOrEmail.trim();

  if (!clean) {
    return "U";
  }

  const nameParts = clean
    .replace(/@.*/, "")
    .split(/[.\s_-]+/)
    .filter(Boolean);

  if (nameParts.length === 1) {
    return nameParts[0].slice(0, 2).toUpperCase();
  }

  return `${nameParts[0][0]}${nameParts[1][0]}`.toUpperCase();
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const currentSection = useCurrentSection(pathname);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.classList.toggle("drawer-open", drawerOpen);

    return () => document.body.classList.remove("drawer-open");
  }, [drawerOpen]);

  useEffect(() => {
    let mounted = true;

    async function loadUser() {
      const supabase = createSupabaseBrowserClient();
      const { data } = await supabase.auth.getUser();

      if (!mounted || !data.user) {
        return;
      }

      const email = data.user.email || "";
      const metadataName =
        typeof data.user.user_metadata?.name === "string"
          ? data.user.user_metadata.name
          : typeof data.user.user_metadata?.full_name === "string"
            ? data.user.user_metadata.full_name
            : "";

      const displayName = metadataName || email || "Usuário";

      setCurrentUser({
        name: displayName,
        email,
        initials: getInitials(displayName || email)
      });
    }

    loadUser();

    return () => {
      mounted = false;
    };
  }, []);

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
            <span className="nav-icon" aria-hidden="true">
              {item.icon}
            </span>

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
              <span className="search-icon" aria-hidden="true">
                {currentSection.icon}
              </span>

              <div>
                <strong>{currentSection.label}</strong>
                <small>{currentSection.caption}</small>
              </div>
            </div>

            <div className="topbar-sync-pill" title="Migração incremental em Supabase">
              <span className="sync-dot" />
              Online
            </div>

            <Link
              href="/settings"
              className="topbar-user-pill"
              aria-label={
                currentUser
                  ? `Usuário logado: ${currentUser.name}. Abrir configurações da conta.`
                  : "Abrir configurações da conta"
              }
              title={currentUser?.email || "Configurações da conta"}
            >
              <span className="topbar-user-avatar" aria-hidden="true">
                {currentUser?.initials || "U"}
              </span>

              <span className="topbar-user-copy">
                <strong>{currentUser?.name || "Usuário"}</strong>
                <small>{currentUser?.email || "Conta logada"}</small>
              </span>
            </Link>

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

            <button className="icon-button" type="button" onClick={() => setDrawerOpen(false)} aria-label="Fechar menu">
              ×
            </button>
          </div>

          {currentUser ? (
            <Link href="/settings" className="mobile-user-card" onClick={() => setDrawerOpen(false)}>
              <span className="topbar-user-avatar" aria-hidden="true">
                {currentUser.initials}
              </span>

              <span>
                <strong>{currentUser.name}</strong>
                <small>{currentUser.email || "Conta logada"}</small>
              </span>
            </Link>
          ) : null}

          {nav}

          <button className="btn btn-muted mobile-signout" type="button" disabled={signingOut} onClick={handleSignOut}>
            {signingOut ? "Saindo..." : "Sair da conta"}
          </button>
        </aside>
      </div>
    </div>
  );
}
