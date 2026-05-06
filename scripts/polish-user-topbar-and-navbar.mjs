#!/usr/bin/env node
import fs from "fs";
import path from "path";

const root = process.cwd();
const cssFile = path.join(root, "src", "app", "ux-polish.css");

if (!fs.existsSync(cssFile)) {
  console.error("Arquivo não encontrado:", path.relative(root, cssFile));
  process.exit(1);
}

const backup = `${cssFile}.backup-before-user-nav-style`;
if (!fs.existsSync(backup)) {
  fs.writeFileSync(backup, fs.readFileSync(cssFile, "utf8"), "utf8");
  console.log("Backup criado:", path.relative(root, backup));
}

let css = fs.readFileSync(cssFile, "utf8");
const marker = "/* user-topbar-navbar-style-fix */";

if (css.includes(marker)) {
  console.log("Patch de estilo do usuário já estava aplicado.");
  process.exit(0);
}

css += `

${marker}
/* Topbar: botão do usuário mais bonito e respirado */
.user-menu {
  position: relative;
  margin-left: auto;
  padding-left: 10px;
}

.user-menu > button,
.user-chip {
  display: inline-flex !important;
  align-items: center !important;
  gap: 12px !important;
  min-height: 46px;
  max-width: 260px;
  padding: 7px 14px 7px 10px !important;
  border: 1px solid rgba(15, 23, 42, 0.10) !important;
  border-radius: 999px !important;
  background: rgba(255, 255, 255, 0.94) !important;
  color: #0f172a !important;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.07);
  cursor: pointer;
}

.user-menu > button:hover,
.user-chip:hover {
  border-color: rgba(16, 185, 129, 0.22) !important;
  box-shadow: 0 16px 34px rgba(15, 23, 42, 0.10);
}

.user-menu > button > :first-child,
.user-chip-avatar {
  display: inline-flex !important;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: 999px;
  background: linear-gradient(135deg, #10b981, #34d399) !important;
  color: #fff !important;
  font-size: 12px;
  font-weight: 900;
  box-shadow: 0 10px 20px rgba(16, 185, 129, 0.18);
}

.user-menu > button > :nth-child(2),
.user-chip-copy {
  display: grid !important;
  gap: 2px;
  min-width: 0;
  text-align: left;
}

.user-menu > button > :nth-child(2) strong,
.user-chip-copy strong {
  display: block;
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  font-weight: 800;
}

.user-menu > button > :nth-child(2) small,
.user-chip-copy small {
  display: block;
  max-width: 170px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #64748b;
  font-size: 12px;
}

.user-menu > button > :last-child {
  margin-left: auto;
  color: #64748b;
  font-size: 12px;
}

.user-dropdown {
  top: calc(100% + 10px) !important;
  right: 0;
  width: 290px;
  padding: 12px !important;
  border-radius: 20px !important;
  border: 1px solid rgba(15, 23, 42, 0.08) !important;
  background: rgba(255, 255, 255, 0.98) !important;
  box-shadow: 0 24px 48px rgba(15, 23, 42, 0.16) !important;
}

.user-dropdown > :first-child {
  display: flex !important;
  align-items: center !important;
  gap: 12px;
  padding: 6px 4px 12px;
}

.user-dropdown-avatar {
  width: 42px !important;
  height: 42px !important;
  border-radius: 999px !important;
  background: linear-gradient(135deg, #10b981, #34d399) !important;
  color: #fff !important;
  font-weight: 900 !important;
}

.user-dropdown-info {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.user-dropdown-info strong,
.user-dropdown-info small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Drawer / navbar lateral */
.mobile-user-card,
.drawer-panel .mobile-user-card,
.drawer-panel a[href="/settings"] {
  display: flex !important;
  align-items: center !important;
  gap: 14px !important;
  min-width: 0;
  margin: 22px 8px 26px !important;
  padding: 16px !important;
  border: 1px solid rgba(15, 23, 42, 0.07) !important;
  border-radius: 18px !important;
  background: rgba(255, 255, 255, 0.78) !important;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.06);
  text-decoration: none !important;
}

.mobile-user-avatar,
.drawer-panel a[href="/settings"] > :first-child {
  display: inline-flex !important;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 42px;
  height: 42px;
  border-radius: 999px;
  background: linear-gradient(135deg, #10b981, #34d399) !important;
  color: #fff !important;
  font-size: 13px;
  font-weight: 900;
  box-shadow: 0 10px 20px rgba(16, 185, 129, 0.18);
}

.mobile-user-text,
.drawer-panel a[href="/settings"] > :nth-child(2) {
  display: grid !important;
  gap: 2px;
  min-width: 0;
  padding-right: 4px;
}

.mobile-user-text strong,
.mobile-user-text small,
.drawer-panel a[href="/settings"] strong,
.drawer-panel a[href="/settings"] small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mobile-user-text strong,
.drawer-panel a[href="/settings"] strong {
  font-size: 14px;
  font-weight: 800;
}

.mobile-user-text small,
.drawer-panel a[href="/settings"] small {
  color: #64748b;
  font-size: 12px;
}

.mobile-user-card + .nav,
.mobile-user-card ~ .nav,
.drawer-panel a[href="/settings"] + .nav,
.drawer-panel a[href="/settings"] ~ .nav {
  margin-top: 16px !important;
}

@media (max-width: 720px) {
  .user-menu {
    padding-left: 6px;
  }

  .user-menu > button,
  .user-chip {
    max-width: min(220px, 100%);
  }
}
`;

fs.writeFileSync(cssFile, css, "utf8");
console.log("Ajustado:", path.relative(root, cssFile));
