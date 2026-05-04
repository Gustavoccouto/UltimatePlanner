"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

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

  if (!clean) return "U";

  const nameParts = clean
    .replace(/@.*/, "")
    .split(/[.\s_-]+/)
    .filter(Boolean);

  if (nameParts.length === 1) {
    return nameParts[0].slice(0, 2).toUpperCase();
  }

  return `${nameParts[0][0]}${nameParts[1][0]}`.toUpperCase();
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
      if (!userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setUserMenuOpen(false);
      }
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

  const displayName = currentUser ? getShortName(currentUser.name, currentUser.email) : "Usuário";

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

            <div className="user-menu" ref={userMenuRef}>
              <button
                type="button"
                className="user-chip"
                onClick={() => setUserMenuOpen((prev) => !prev)}
                aria-haspopup="menu"
                aria-expanded={userMenuOpen}
                aria-label={
                  currentUser
                    ? `Abrir menu do usuário ${displayName}`
                    : "Abrir menu do usuário"
                }
              >
                <span className="user-chip-avatar" aria-hidden="true">
                  {currentUser?.initials || "U"}
                </span>

                <span className="user-chip-copy">
                  <strong>{displayName}</strong>
                </span>

                <span className={userMenuOpen ? "user-chip-chevron open" : "user-chip-chevron"} aria-hidden="true">
                  ▾
                </span>
              </button>

              {userMenuOpen ? (
                <div className="user-dropdown" role="menu" aria-label="Menu do usuário">
                  <div className="user-dropdown-header">
                    <span className="user-dropdown-avatar" aria-hidden="true">
                      {currentUser?.initials || "U"}
                    </span>

                    <div className="user-dropdown-info">
                      <strong>{displayName}</strong>
                      <small>{currentUser?.email || "Conta logada"}</small>
                    </div>
                  </div>

                  <div className="user-dropdown-actions">
                    <Link
                      href="/settings"
                      className="user-dropdown-link"
                      role="menuitem"
                      onClick={() => setUserMenuOpen(false)}
                    >
                      Minha conta
                    </Link>

                    <button
                      type="button"
                      className="user-dropdown-danger"
                      role="menuitem"
                      onClick={handleSignOut}
                      disabled={signingOut}
                    >
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
              ×
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
            {signingOut ? "Saindo..." : "Sair da conta"}
          </button>
        </aside>
      </div>

      <style jsx>{`
        .topbar-main {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .user-menu {
          position: relative;
          margin-left: auto;
          flex-shrink: 0;
        }

        .user-chip {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          height: 44px;
          padding: 0 12px 0 8px;
          border: 1px solid rgba(15, 23, 42, 0.08);
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.88);
          color: #0f172a;
          cursor: pointer;
          transition:
            transform 160ms ease,
            box-shadow 160ms ease,
            border-color 160ms ease,
            background 160ms ease;
          box-shadow: 0 6px 18px rgba(15, 23, 42, 0.06);
        }

        .user-chip:hover {
          transform: translateY(-1px);
          box-shadow: 0 10px 24px rgba(15, 23, 42, 0.09);
          border-color: rgba(15, 23, 42, 0.14);
          background: rgba(255, 255, 255, 0.96);
        }

        .user-chip:focus-visible {
          outline: 3px solid rgba(16, 185, 129, 0.22);
          outline-offset: 3px;
        }

        .user-chip-avatar,
        .user-dropdown-avatar,
        .mobile-user-avatar {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          font-weight: 800;
          color: white;
          background: linear-gradient(135deg, #10b981, #34d399);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.28);
        }

        .user-chip-avatar {
          width: 30px;
          height: 30px;
          font-size: 12px;
        }

        .user-chip-copy {
          display: inline-flex;
          align-items: center;
          min-width: 0;
        }

        .user-chip-copy strong {
          max-width: 140px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 14px;
          line-height: 1;
        }

        .user-chip-chevron {
          font-size: 12px;
          color: #64748b;
          transition: transform 160ms ease;
        }

        .user-chip-chevron.open {
          transform: rotate(180deg);
        }

        .user-dropdown {
          position: absolute;
          top: calc(100% + 10px);
          right: 0;
          width: 260px;
          border-radius: 18px;
          border: 1px solid rgba(15, 23, 42, 0.08);
          background: rgba(255, 255, 255, 0.98);
          box-shadow: 0 20px 40px rgba(15, 23, 42, 0.14);
          padding: 10px;
          z-index: 30;
          backdrop-filter: blur(14px);
        }

        .user-dropdown-header {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px;
          border-radius: 14px;
          background: rgba(15, 23, 42, 0.03);
        }

        .user-dropdown-avatar {
          width: 40px;
          height: 40px;
          font-size: 14px;
          flex-shrink: 0;
        }

        .user-dropdown-info {
          min-width: 0;
          display: flex;
          flex-direction: column;
        }

        .user-dropdown-info strong,
        .user-dropdown-info small {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .user-dropdown-info strong {
          font-size: 14px;
          color: #0f172a;
        }

        .user-dropdown-info small {
          font-size: 12px;
          color: #64748b;
        }

        .user-dropdown-actions {
          display: grid;
          gap: 8px;
          padding-top: 10px;
        }

        .user-dropdown-link,
        .user-dropdown-danger {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          min-height: 40px;
          border-radius: 12px;
          font-size: 14px;
          font-weight: 700;
          text-decoration: none;
          transition:
            background 160ms ease,
            border-color 160ms ease,
            transform 160ms ease,
            filter 160ms ease;
        }

        .user-dropdown-link {
          border: 1px solid rgba(15, 23, 42, 0.08);
          background: rgba(15, 23, 42, 0.04);
          color: #0f172a;
        }

        .user-dropdown-link:hover {
          background: rgba(15, 23, 42, 0.07);
          transform: translateY(-1px);
        }

        .user-dropdown-danger {
          border: 1px solid rgba(220, 38, 38, 0.18);
          background: rgba(220, 38, 38, 0.08);
          color: #b91c1c;
          cursor: pointer;
        }

        .user-dropdown-danger:hover:not(:disabled) {
          background: rgba(220, 38, 38, 0.12);
          transform: translateY(-1px);
        }

        .user-dropdown-danger:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .mobile-user-card {
          display: flex;
          align-items: center;
          gap: 12px;
          text-decoration: none;
          margin-bottom: 14px;
          padding: 12px 14px;
          border-radius: 16px;
          background: rgba(15, 23, 42, 0.04);
          border: 1px solid rgba(15, 23, 42, 0.06);
        }

        .mobile-user-avatar {
          width: 38px;
          height: 38px;
          font-size: 14px;
          flex-shrink: 0;
        }

        .mobile-user-text {
          min-width: 0;
          display: flex;
          flex-direction: column;
        }

        .mobile-user-text strong,
        .mobile-user-text small {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .mobile-user-text strong {
          color: #0f172a;
          font-size: 14px;
        }

        .mobile-user-text small {
          color: #64748b;
          font-size: 12px;
        }

        @media (max-width: 840px) {
          .user-chip-copy {
            display: none;
          }

          .user-chip {
            padding-right: 10px;
          }

          .user-dropdown {
            right: 0;
            width: min(260px, calc(100vw - 24px));
          }
        }

        @media (max-width: 640px) {
          .user-menu {
            margin-left: 0;
          }

          .topbar-sync-pill {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}