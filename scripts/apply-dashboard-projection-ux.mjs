#!/usr/bin/env node
import fs from "fs";
import path from "path";

const root = process.cwd();
const cssFile = path.join(root, "src", "app", "ux-polish.css");
const marker = "/* dashboard-month-projection-ux */";

if (!fs.existsSync(cssFile)) {
  console.error("Arquivo não encontrado:", path.relative(root, cssFile));
  process.exit(1);
}

const backup = `${cssFile}.backup-before-dashboard-projection-ux`;
if (!fs.existsSync(backup)) {
  fs.writeFileSync(backup, fs.readFileSync(cssFile, "utf8"), "utf8");
  console.log("Backup criado:", path.relative(root, backup));
}

let css = fs.readFileSync(cssFile, "utf8");

if (css.includes(marker)) {
  console.log("Patch de CSS do dashboard já estava aplicado.");
  process.exit(0);
}

css += `

${marker}
.dashboard-projection-panel {
  display: grid;
  gap: 18px;
}

.dashboard-projection-bars {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(34px, 1fr));
  gap: 12px;
  align-items: end;
  min-height: 148px;
}

.projection-bar-item {
  display: grid;
  gap: 8px;
  align-items: end;
  justify-items: center;
}

.projection-bar-track {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  width: 100%;
  min-height: 116px;
  padding: 8px 0;
  border-radius: 16px;
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.02), rgba(15, 23, 42, 0.05));
}

.projection-bar-fill {
  display: block;
  width: min(22px, 100%);
  min-height: 16px;
  border-radius: 999px;
  transition: transform 160ms ease, opacity 160ms ease;
}

.projection-bar-fill.is-positive {
  background: linear-gradient(180deg, rgba(16, 185, 129, 0.9), rgba(16, 185, 129, 0.45));
}

.projection-bar-fill.is-negative {
  background: linear-gradient(180deg, rgba(220, 38, 38, 0.9), rgba(220, 38, 38, 0.38));
}

.projection-bar-fill.is-selected {
  box-shadow: 0 0 0 3px rgba(15, 23, 42, 0.08);
}

.projection-bar-item:hover .projection-bar-fill {
  transform: translateY(-2px);
}

.projection-bar-item small {
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  color: #64748b;
}

.dashboard-month-calendar {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(148px, 1fr));
  gap: 12px;
}

.dashboard-month-tile {
  position: relative;
  display: grid;
  gap: 8px;
  min-height: 126px;
  padding: 14px;
  border-radius: 18px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  background: rgba(255, 255, 255, 0.74);
  transition: transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease, background 160ms ease;
}

.dashboard-month-tile:hover {
  transform: translateY(-2px);
  box-shadow: 0 16px 30px rgba(15, 23, 42, 0.08);
}

.dashboard-month-tile.is-selected {
  border-color: rgba(16, 185, 129, 0.24);
  box-shadow: 0 14px 28px rgba(16, 185, 129, 0.08);
}

.dashboard-month-tile.is-positive {
  background: linear-gradient(180deg, rgba(16, 185, 129, 0.06), rgba(255, 255, 255, 0.9));
}

.dashboard-month-tile.is-negative {
  background: linear-gradient(180deg, rgba(220, 38, 38, 0.08), rgba(255, 255, 255, 0.94));
  border-color: rgba(220, 38, 38, 0.16);
}

.dashboard-month-tile-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.dashboard-month-tile-head strong {
  font-size: 15px;
  font-weight: 900;
  text-transform: capitalize;
  color: #0f172a;
}

.dashboard-month-tile-head span {
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #64748b;
}

.dashboard-month-tile > b {
  font-size: 18px;
  font-weight: 900;
  color: #0f172a;
}

.dashboard-month-tile.is-negative > b {
  color: #b91c1c;
}

.dashboard-month-tile > small {
  color: #64748b;
  font-size: 12px;
  line-height: 1.35;
}

.dashboard-month-tooltip {
  position: absolute;
  inset: auto auto calc(100% + 10px) 0;
  z-index: 25;
  display: grid;
  gap: 8px;
  width: 230px;
  padding: 12px;
  border-radius: 16px;
  border: 1px solid rgba(15, 23, 42, 0.09);
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 18px 36px rgba(15, 23, 42, 0.14);
  opacity: 0;
  pointer-events: none;
  transform: translateY(8px);
  transition: opacity 160ms ease, transform 160ms ease;
}

.dashboard-month-tooltip::after {
  content: "";
  position: absolute;
  top: 100%;
  left: 18px;
  width: 12px;
  height: 12px;
  border-right: 1px solid rgba(15, 23, 42, 0.09);
  border-bottom: 1px solid rgba(15, 23, 42, 0.09);
  background: rgba(255, 255, 255, 0.98);
  transform: translateY(-6px) rotate(45deg);
}

.dashboard-month-tile:hover .dashboard-month-tooltip,
.dashboard-month-tile:focus-within .dashboard-month-tooltip {
  opacity: 1;
  transform: translateY(0);
}

.dashboard-month-tooltip strong {
  font-size: 13px;
  font-weight: 900;
  color: #0f172a;
}

.dashboard-month-tooltip div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 12px;
  color: #64748b;
}

.dashboard-month-tooltip b {
  color: #0f172a;
  font-size: 12px;
}

.badge-alert {
  background: rgba(220, 38, 38, 0.1) !important;
  color: #b91c1c !important;
  border: 1px solid rgba(220, 38, 38, 0.16);
}

@media (max-width: 980px) {
  .dashboard-projection-bars {
    grid-template-columns: repeat(4, minmax(34px, 1fr));
  }
}

@media (max-width: 760px) {
  .dashboard-month-calendar {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .dashboard-month-tooltip {
    left: auto;
    right: 0;
  }

  .dashboard-month-tooltip::after {
    left: auto;
    right: 20px;
  }
}
`;

fs.writeFileSync(cssFile, css, "utf8");
console.log("Ajustado:", path.relative(root, cssFile));
