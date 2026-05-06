#!/usr/bin/env node
import fs from "fs";
import path from "path";

const root = process.cwd();
const cssFile = path.join(root, "src", "app", "ux-polish.css");

if (!fs.existsSync(cssFile)) {
  console.error("Arquivo não encontrado:", path.relative(root, cssFile));
  process.exit(1);
}

const backup = `${cssFile}.backup-before-user-dropdown-actions-style`;
if (!fs.existsSync(backup)) {
  fs.writeFileSync(backup, fs.readFileSync(cssFile, "utf8"), "utf8");
  console.log("Backup criado:", path.relative(root, backup));
}

let css = fs.readFileSync(cssFile, "utf8");
const marker = "/* user-dropdown-actions-style */";

if (css.includes(marker)) {
  console.log("Patch dos botões do dropdown já estava aplicado.");
  process.exit(0);
}

css += `

${marker}
/* Só a parte interna do dropdown do usuário */
.user-menu .user-dropdown {
  padding: 14px !important;
}

.user-menu .user-dropdown > :first-child {
  padding-bottom: 14px !important;
  margin-bottom: 10px !important;
  border-bottom: 1px solid rgba(15, 23, 42, 0.08);
}

.user-menu .user-dropdown .user-dropdown-info strong {
  font-size: 15px;
  font-weight: 800;
  color: #0f172a;
}

.user-menu .user-dropdown .user-dropdown-info small {
  font-size: 12px;
  color: #64748b;
}

.user-menu .user-dropdown a,
.user-menu .user-dropdown button {
  display: flex !important;
  align-items: center !important;
  justify-content: flex-start !important;
  gap: 10px !important;
  min-height: 42px;
  width: 100%;
  padding: 0 14px !important;
  border-radius: 14px !important;
  border: 1px solid transparent !important;
  background: rgba(248, 250, 252, 0.88) !important;
  color: #0f172a !important;
  font-size: 14px !important;
  font-weight: 700 !important;
  text-decoration: none !important;
  box-shadow: none !important;
  transition:
    background 160ms ease,
    border-color 160ms ease,
    transform 160ms ease,
    color 160ms ease;
}

.user-menu .user-dropdown a:hover,
.user-menu .user-dropdown button:hover {
  background: rgba(241, 245, 249, 0.98) !important;
  border-color: rgba(15, 23, 42, 0.08) !important;
  transform: translateY(-1px);
}

.user-menu .user-dropdown a::before {
  content: "⚙";
  font-size: 13px;
  opacity: 0.8;
}

.user-menu .user-dropdown button::before {
  content: "↪";
  font-size: 13px;
  opacity: 0.8;
}

.user-menu .user-dropdown button {
  background: rgba(254, 242, 242, 0.92) !important;
  color: #b91c1c !important;
  border-color: rgba(239, 68, 68, 0.12) !important;
}

.user-menu .user-dropdown button:hover {
  background: rgba(254, 226, 226, 0.98) !important;
  border-color: rgba(239, 68, 68, 0.22) !important;
  color: #991b1b !important;
}

.user-menu .user-dropdown a + button,
.user-menu .user-dropdown button + a,
.user-menu .user-dropdown a + a,
.user-menu .user-dropdown button + button {
  margin-top: 8px !important;
}
`;

fs.writeFileSync(cssFile, css, "utf8");
console.log("Ajustado:", path.relative(root, cssFile));
