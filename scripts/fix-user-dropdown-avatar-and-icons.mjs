#!/usr/bin/env node
import fs from "fs";
import path from "path";

const root = process.cwd();
const cssFile = path.join(root, "src", "app", "ux-polish.css");

if (!fs.existsSync(cssFile)) {
  console.error("Arquivo não encontrado:", path.relative(root, cssFile));
  process.exit(1);
}

const backup = `${cssFile}.backup-before-user-dropdown-avatar-and-icons`;
if (!fs.existsSync(backup)) {
  fs.writeFileSync(backup, fs.readFileSync(cssFile, "utf8"), "utf8");
  console.log("Backup criado:", path.relative(root, backup));
}

let css = fs.readFileSync(cssFile, "utf8");
const marker = "/* user-dropdown-avatar-and-icons-final-fix */";

if (css.includes(marker)) {
  console.log("Patch final do avatar e ícones já estava aplicado.");
  process.exit(0);
}

css += `

${marker}
/* Centraliza melhor as letras do avatar/logo do usuário */
.user-chip-avatar,
.mobile-user-avatar,
.user-dropdown-avatar,
.user-menu > button > :first-child,
.user-chip > :first-child,
.drawer-panel a[href="/settings"] > :first-child {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  text-align: center !important;
  line-height: 1 !important;
  padding: 0 !important;
  letter-spacing: -0.02em;
  font-weight: 900 !important;
}

/* Remove os ícones duplicados adicionados por pseudo-elementos */
.user-menu .user-dropdown a::before,
.user-menu .user-dropdown button::before {
  content: none !important;
  display: none !important;
}

/* Mantém só o ícone real do markup, com bom espaçamento */
.user-menu .user-dropdown a,
.user-menu .user-dropdown button {
  gap: 10px !important;
  justify-content: flex-start !important;
}

/* Estilo dos ícones reais da ação */
.user-menu .user-dropdown a svg,
.user-menu .user-dropdown button svg,
.user-menu .user-dropdown a i,
.user-menu .user-dropdown button i,
.user-menu .user-dropdown a .icon,
.user-menu .user-dropdown button .icon {
  flex-shrink: 0;
  width: 16px !important;
  height: 16px !important;
  opacity: 0.85;
}

/* Se houver wrappers internos, alinha tudo bonitinho */
.user-menu .user-dropdown a > span,
.user-menu .user-dropdown button > span {
  display: inline-flex;
  align-items: center;
}

/* Evita que o texto fique desalinhado quando houver ícone */
.user-menu .user-dropdown a,
.user-menu .user-dropdown button {
  min-height: 44px;
  padding-left: 14px !important;
  padding-right: 14px !important;
}
`;

fs.writeFileSync(cssFile, css, "utf8");
console.log("Ajustado:", path.relative(root, cssFile));
