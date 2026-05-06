#!/usr/bin/env node
import fs from "fs";
import path from "path";

const root = process.cwd();
const cssFile = path.join(root, "src", "app", "ux-polish.css");

if (!fs.existsSync(cssFile)) {
  console.error("Arquivo não encontrado:", path.relative(root, cssFile));
  process.exit(1);
}

const backup = `${cssFile}.backup-before-user-dropdown-floating`;
if (!fs.existsSync(backup)) {
  fs.writeFileSync(backup, fs.readFileSync(cssFile, "utf8"), "utf8");
  console.log("Backup criado:", path.relative(root, backup));
}

let css = fs.readFileSync(cssFile, "utf8");
const marker = "/* user-dropdown-floating-fix */";

if (css.includes(marker)) {
  console.log("Patch do dropdown já estava aplicado.");
  process.exit(0);
}

css += `

${marker}
/* Faz o menu do usuário abrir como dropdown flutuante real, fora do fluxo normal */
.user-menu {
  position: relative !important;
  overflow: visible !important;
  isolation: isolate;
}

.user-menu > button,
.user-chip {
  position: relative;
  z-index: 3;
}

.user-menu .user-dropdown {
  position: absolute !important;
  top: calc(100% + 12px) !important;
  right: 0 !important;
  left: auto !important;
  z-index: 9999 !important;
  display: block !important;
  width: 300px;
  max-width: min(92vw, 300px);
  margin: 0 !important;
  padding: 14px !important;
  border: 1px solid rgba(15, 23, 42, 0.08) !important;
  border-radius: 20px !important;
  background: rgba(255, 255, 255, 0.98) !important;
  backdrop-filter: blur(12px);
  box-shadow:
    0 18px 40px rgba(15, 23, 42, 0.16),
    0 4px 14px rgba(15, 23, 42, 0.08) !important;
}

.user-menu .user-dropdown::before {
  content: "";
  position: absolute;
  top: -7px;
  right: 24px;
  width: 14px;
  height: 14px;
  transform: rotate(45deg);
  background: rgba(255, 255, 255, 0.98);
  border-left: 1px solid rgba(15, 23, 42, 0.08);
  border-top: 1px solid rgba(15, 23, 42, 0.08);
}

.user-menu .user-dropdown > * {
  position: relative;
  z-index: 1;
}

.user-menu .user-dropdown button,
.user-menu .user-dropdown a {
  width: 100%;
}

.user-menu .user-dropdown button + button,
.user-menu .user-dropdown a + button,
.user-menu .user-dropdown button + a,
.user-menu .user-dropdown a + a {
  margin-top: 8px;
}

.topbar,
.topbar-main,
.app-topbar,
.page-topbar,
.shell-topbar {
  overflow: visible !important;
}

@media (max-width: 720px) {
  .user-menu .user-dropdown {
    right: 0 !important;
    width: min(92vw, 320px);
  }
}
`;

fs.writeFileSync(cssFile, css, "utf8");

const printPath = path.relative(root, cssFile);
console.log("Ajustado:", printPath);
