"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { BootstrapIcon } from "@/components/ui/bootstrap-icon";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: "grid", caption: "Visão geral" },
  { label: "Contas", href: "/accounts", icon: "wallet2", caption: "Saldos" },
  { label: "Categorias", href: "/categories", icon: "tags", caption: "Organização" },
  { label: "Transações", href: "/transactions", icon: "arrow-left-right", caption: "Entradas e saídas" },
  { label: "Cartões", href: "/cards", icon: "credit-card", caption: "Faturas" },
  { label: "Projetos", href: "/projects", icon: "kanban", caption: "Planejamento" },
  { label: "Metas", href: "/goals", icon: "bullseye", caption: "Objetivos" },
  { label: "Investimentos", href: "/investments", icon: "graph-up-arrow", caption: "Carteira" },
  { label: "Consultor IA", href: "/ai", icon: "stars", caption: "Análise" },
  { label: "Conta", href: "/settings", icon: "person-circle", caption: "Usuário e segurança" }
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

function getInitials(value: string) {
  const clean = value.trim();

  if (!clean) return "UP";

  const parts = clean
    .replace(/@.*/, "")
    .split(/[.\s_-]+/)
    .filter(Boolean);

  if (parts.length <= 1) {
    return parts[0]?.slice(0, 2).toUpperCase() || "UP";
  }

  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function getShortName(name: string, email: string) {
  if (name && name !== email) return name;
  return email.split("@")[0] || "Usuário";
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const currentSection = useCurrentSection(pathname);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setDrawerOpen(false);
    setUserMenuOpen(false);
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

      if (!mounted || !data.user) return;

      const email = data.user.email || "";
      const metadataName =
        typeof data.user.user_metadata?.name === "string"
          ? data.user.user_metadata.name
          : typeof data.user.user_metadata?.full_name === "string"
            ? data.user.user_metadata.full_name
            : typeof data.user.user_metadata?.display_name === "string"
              ? data.user.user_metadata.display_name
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

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!userMenuRef.current) return;
      if (!userMenuRef.current.contains(event.target as Node)) setUserMenuOpen(false);
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setUserMenuOpen(false);
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  async function handleSignOut() {
    setSigningOut(true);

    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();

    router.replace("/login");
    router.refresh();
  }

  const displayName = currentUser ? getShortName(currentUser.name, currentUser.email) : "Usuário";

  const nav = (
    <nav className="nav" aria-label="Navegação principal">
      {navItems.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link key={item.href} href={item.href} className={active ? "nav-link nav-link-active" : "nav-link"}>
            <span className="nav-icon" aria-hidden="true">
              <BootstrapIcon name={item.icon} size={16} />
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
              <BootstrapIcon name="list" size={22} />
            </button>

            <div className="search-shell" aria-label="Seção atual">
              <span className="search-icon" aria-hidden="true">
                <BootstrapIcon name={currentSection.icon} size={16} />
              </span>

              <div>
                <strong>{currentSection.label}</strong>
                <small>{currentSection.caption}</small>
              </div>
            </div>

            <div className="topbar-sync-pill" title="Base online em Supabase">
              <span className="sync-dot" />
              Online
            </div>

            <div className="user-menu" ref={userMenuRef}>
              <button
                type="button"
                className="user-chip"
                onClick={() => setUserMenuOpen((open) => !open)}
                aria-haspopup="menu"
                aria-expanded={userMenuOpen}
                aria-label={currentUser ? `Abrir menu do usuário ${displayName}` : "Abrir menu do usuário"}
              >
                <span className="user-chip-avatar" aria-hidden="true">
                  {currentUser?.initials || "UP"}
                </span>

                <span className="user-chip-copy">
                  <strong>{displayName}</strong>
                </span>

                <span className={userMenuOpen ? "user-chip-chevron open" : "user-chip-chevron"} aria-hidden="true">
                  <BootstrapIcon name="chevron-down" size={12} />
                </span>
              </button>

              {userMenuOpen ? (
                <div className="user-dropdown" role="menu" aria-label="Menu do usuário">
                  <div className="user-dropdown-header">
                    <span className="user-dropdown-avatar" aria-hidden="true">
                      {currentUser?.initials || "UP"}
                    </span>

                    <div className="user-dropdown-info">
                      <strong>{displayName}</strong>
                      <small>{currentUser?.email || "Conta logada"}</small>
                    </div>
                  </div>

                  <div className="user-dropdown-actions">
                    <Link href="/settings" className="user-dropdown-link" role="menuitem" onClick={() => setUserMenuOpen(false)}>
                      <BootstrapIcon name="gear" size={15} />
                      Minha conta
                    </Link>

                    <button type="button" className="user-dropdown-danger" role="menuitem" onClick={handleSignOut} disabled={signingOut}>
                      <BootstrapIcon name="box-arrow-right" size={15} />
                      {signingOut ? "Saindo..." : "Sair"}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
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
              <BootstrapIcon name="x-lg" size={16} />
            </button>
          </div>

          {currentUser ? (
            <Link href="/settings" className="mobile-user-card" onClick={() => setDrawerOpen(false)}>
              <span className="mobile-user-avatar" aria-hidden="true">
                {currentUser.initials}
              </span>

              <span className="mobile-user-text">
                <strong>{displayName}</strong>
                <small>{currentUser.email}</small>
              </span>
            </Link>
          ) : null}

          {nav}

          <button className="btn btn-muted mobile-signout" type="button" disabled={signingOut} onClick={handleSignOut}>
            <BootstrapIcon name="box-arrow-right" size={16} />
            {signingOut ? "Saindo..." : "Sair da conta"}
          </button>
        </aside>
      </div>
    </div>
  );
}
