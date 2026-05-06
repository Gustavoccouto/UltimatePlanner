#!/usr/bin/env node
import fs from "fs";
import path from "path";

const root = process.cwd();
const cssFile = path.join(root, "src", "app", "ux-polish.css");
const marker = "/* dashboard-financial-calendar-v2 */";

if (!fs.existsSync(cssFile)) {
  console.error("Arquivo não encontrado:", path.relative(root, cssFile));
  process.exit(1);
}

const backup = `${cssFile}.backup-before-dashboard-financial-calendar-v2`;
if (!fs.existsSync(backup)) {
  fs.writeFileSync(backup, fs.readFileSync(cssFile, "utf8"), "utf8");
  console.log("Backup criado:", path.relative(root, backup));
}

let css = fs.readFileSync(cssFile, "utf8");

if (css.includes(marker)) {
  console.log("Patch de CSS do dashboard v2 já estava aplicado.");
  process.exit(0);
}

css += `

${marker}
.dashboard-flow-grid-compact { align-items: start !important; }
.dashboard-flow-grid-compact .panel { align-self: start; }
.compact-heading { margin-bottom: 14px !important; }
.compact-heading h2 { margin-bottom: 4px; }
.compact-split-grid { gap: 12px !important; }
.dashboard-projection-panel { display: grid; gap: 16px; }
.dashboard-projection-bars { display: grid; grid-template-columns: repeat(auto-fit, minmax(34px, 1fr)); gap: 10px; align-items: end; min-height: 112px; }
.projection-bar-item { display: grid; gap: 8px; align-items: end; justify-items: center; }
.projection-bar-track { display: flex; align-items: flex-end; justify-content: center; width: 100%; min-height: 86px; padding: 7px 0; border-radius: 16px; background: linear-gradient(180deg, rgba(15, 23, 42, 0.02), rgba(15, 23, 42, 0.05)); }
.projection-bar-fill { display: block; width: min(20px, 100%); min-height: 14px; border-radius: 999px; transition: transform 160ms ease, opacity 160ms ease; }
.projection-bar-fill.is-positive { background: linear-gradient(180deg, rgba(16, 185, 129, 0.9), rgba(16, 185, 129, 0.45)); }
.projection-bar-fill.is-negative { background: linear-gradient(180deg, rgba(220, 38, 38, 0.9), rgba(220, 38, 38, 0.38)); }
.projection-bar-fill.is-selected { box-shadow: 0 0 0 3px rgba(15, 23, 42, 0.08); }
.projection-bar-item:hover .projection-bar-fill { transform: translateY(-2px); }
.projection-bar-item small { font-size: 11px; font-weight: 900; text-transform: uppercase; color: #64748b; }
.dashboard-month-calendar { display: grid; grid-template-columns: repeat(auto-fit, minmax(128px, 1fr)); gap: 10px; }
.dashboard-month-calendar.compact-calendar { grid-template-columns: repeat(auto-fit, minmax(112px, 1fr)); }
.dashboard-month-tile { position: relative; display: grid; gap: 6px; min-height: 94px; padding: 12px; border-radius: 18px; border: 1px solid rgba(15, 23, 42, 0.08); background: rgba(255, 255, 255, 0.74); transition: transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease, background 160ms ease; }
.dashboard-month-tile:hover { transform: translateY(-2px); box-shadow: 0 16px 30px rgba(15, 23, 42, 0.08); }
.dashboard-month-tile.is-selected { border-color: rgba(16, 185, 129, 0.24); box-shadow: 0 14px 28px rgba(16, 185, 129, 0.08); }
.dashboard-month-tile.is-positive { background: linear-gradient(180deg, rgba(16, 185, 129, 0.06), rgba(255, 255, 255, 0.9)); }
.dashboard-month-tile.is-negative { background: linear-gradient(180deg, rgba(220, 38, 38, 0.08), rgba(255, 255, 255, 0.94)); border-color: rgba(220, 38, 38, 0.16); }
.dashboard-month-tile-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
.dashboard-month-tile-head strong { font-size: 14px; font-weight: 900; text-transform: capitalize; color: #0f172a; }
.dashboard-month-tile-head span { font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.04em; color: #64748b; }
.dashboard-month-tile > b { font-size: 16px; font-weight: 900; color: #0f172a; }
.dashboard-month-tile.is-negative > b { color: #b91c1c; }
.dashboard-month-tooltip { position: absolute; inset: auto auto calc(100% + 10px) 0; z-index: 25; display: grid; gap: 8px; width: 230px; padding: 12px; border-radius: 16px; border: 1px solid rgba(15, 23, 42, 0.09); background: rgba(255, 255, 255, 0.98); box-shadow: 0 18px 36px rgba(15, 23, 42, 0.14); opacity: 0; pointer-events: none; transform: translateY(8px); transition: opacity 160ms ease, transform 160ms ease; }
.dashboard-month-tooltip::after { content: ""; position: absolute; top: 100%; left: 18px; width: 12px; height: 12px; border-right: 1px solid rgba(15, 23, 42, 0.09); border-bottom: 1px solid rgba(15, 23, 42, 0.09); background: rgba(255, 255, 255, 0.98); transform: translateY(-6px) rotate(45deg); }
.dashboard-month-tile:hover .dashboard-month-tooltip, .dashboard-month-tile:focus-within .dashboard-month-tooltip { opacity: 1; transform: translateY(0); }
.dashboard-month-tooltip strong { font-size: 13px; font-weight: 900; color: #0f172a; }
.dashboard-month-tooltip div { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 12px; color: #64748b; }
.dashboard-month-tooltip b { color: #0f172a; font-size: 12px; }
.badge-alert { background: rgba(220, 38, 38, 0.1) !important; color: #b91c1c !important; border: 1px solid rgba(220, 38, 38, 0.16); }
.dashboard-analytics-grid { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(260px, 0.75fr) minmax(300px, 1fr); gap: 16px; align-items: stretch; }
.dashboard-chart-card { min-height: 100%; }
.dashboard-distribution-list, .compact-list { display: grid; gap: 10px; }
.dashboard-distribution-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px 12px; align-items: center; padding: 12px; border-radius: 16px; border: 1px solid rgba(15, 23, 42, 0.07); background: rgba(255, 255, 255, 0.72); }
.dashboard-distribution-row strong, .dashboard-distribution-row small { display: block; }
.dashboard-distribution-row small { margin-top: 2px; color: #64748b; font-size: 12px; }
.dashboard-distribution-row b { font-size: 14px; font-weight: 900; color: #0f172a; }
.dashboard-distribution-track { grid-column: 1 / -1; height: 8px; overflow: hidden; border-radius: 999px; background: rgba(15, 23, 42, 0.06); }
.dashboard-distribution-track i { display: block; height: 100%; border-radius: inherit; }
.dashboard-distribution-row.tone-income .dashboard-distribution-track i { background: linear-gradient(90deg, rgba(16, 185, 129, 0.85), rgba(52, 211, 153, 0.45)); }
.dashboard-distribution-row.tone-expense .dashboard-distribution-track i { background: linear-gradient(90deg, rgba(220, 38, 38, 0.75), rgba(248, 113, 113, 0.35)); }
.dashboard-distribution-row.tone-card .dashboard-distribution-track i { background: linear-gradient(90deg, rgba(59, 130, 246, 0.75), rgba(96, 165, 250, 0.35)); }
.dashboard-distribution-row.tone-neutral .dashboard-distribution-track i { background: linear-gradient(90deg, rgba(100, 116, 139, 0.75), rgba(148, 163, 184, 0.35)); }
.dashboard-health-body { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 16px; align-items: center; }
.dashboard-health-ring { --score: 50%; display: grid; place-items: center; width: 106px; height: 106px; border-radius: 999px; background: radial-gradient(circle at center, #fff 0 58%, transparent 59%), conic-gradient(#10b981 var(--score), rgba(15, 23, 42, 0.08) 0); box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.04); }
.dashboard-health-ring span { font-size: 20px; font-weight: 900; color: #0f172a; }
.dashboard-health-copy { display: grid; gap: 6px; }
.dashboard-health-copy strong { font-size: 18px; font-weight: 900; color: #0f172a; }
.dashboard-health-copy p, .dashboard-health-copy small { color: #64748b; line-height: 1.45; }
.dashboard-next-panel .dashboard-mini-row { min-height: 58px; }
@media (max-width: 1180px) { .dashboard-analytics-grid { grid-template-columns: 1fr 1fr; } .dashboard-next-panel { grid-column: 1 / -1; } }
@media (max-width: 980px) { .dashboard-projection-bars { grid-template-columns: repeat(4, minmax(34px, 1fr)); } .dashboard-analytics-grid { grid-template-columns: 1fr; } }
@media (max-width: 760px) { .dashboard-month-calendar, .dashboard-month-calendar.compact-calendar { grid-template-columns: repeat(2, minmax(0, 1fr)); } .dashboard-health-body { grid-template-columns: 1fr; } .dashboard-month-tooltip { left: auto; right: 0; } .dashboard-month-tooltip::after { left: auto; right: 20px; } }
`;

fs.writeFileSync(cssFile, css, "utf8");
console.log("Ajustado:", path.relative(root, cssFile));
