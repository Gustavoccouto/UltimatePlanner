#!/usr/bin/env node
import fs from "fs";
import path from "path";

const root = process.cwd();
const dashboardFile = path.join(root, "src", "components", "dashboard", "dashboard-client.tsx");
const cssFile = path.join(root, "src", "app", "ux-polish.css");

if (!fs.existsSync(dashboardFile)) {
  console.error("Arquivo não encontrado:", path.relative(root, dashboardFile));
  process.exit(1);
}

if (!fs.existsSync(cssFile)) {
  console.error("Arquivo não encontrado:", path.relative(root, cssFile));
  process.exit(1);
}

const dashboardBackup = `${dashboardFile}.backup-before-flow-fill`;
const cssBackup = `${cssFile}.backup-before-flow-fill`;

if (!fs.existsSync(dashboardBackup)) {
  fs.writeFileSync(dashboardBackup, fs.readFileSync(dashboardFile, "utf8"), "utf8");
  console.log("Backup criado:", path.relative(root, dashboardBackup));
}

if (!fs.existsSync(cssBackup)) {
  fs.writeFileSync(cssBackup, fs.readFileSync(cssFile, "utf8"), "utf8");
  console.log("Backup criado:", path.relative(root, cssBackup));
}

let dashboard = fs.readFileSync(dashboardFile, "utf8");
let css = fs.readFileSync(cssFile, "utf8");

const flowBlockMarker = "dashboard-flow-details-grid";

if (!dashboard.includes(flowBlockMarker)) {
  const target = `<p className="muted-line">As saídas representam {percent(expenseRatio)} das receitas registradas até a referência.</p>`;

  const replacement = `${target}

          <div className="dashboard-flow-details-grid">
            <article className="dashboard-flow-detail-card">
              <span>Resultado do mês</span>
              <strong className={summary.cashNet < 0 ? "danger-text" : "positive-text"}>
                {currencyBRL(summary.cashNet)}
              </strong>
            </article>

            <article className="dashboard-flow-detail-card">
              <span>Entradas previstas</span>
              <strong>{currencyBRL(summary.plannedIncoming)}</strong>
            </article>

            <article className="dashboard-flow-detail-card">
              <span>Saídas previstas</span>
              <strong>{currencyBRL(summary.plannedOutgoing)}</strong>
            </article>

            <article className="dashboard-flow-detail-card">
              <span>Cartão no mês</span>
              <strong>{currencyBRL(summary.cardExpenses)}</strong>
            </article>
          </div>`;

  if (dashboard.includes(target)) {
    dashboard = dashboard.replace(target, replacement);
  } else {
    console.warn("Não encontrei o parágrafo exato do fluxo. Nenhuma alteração automática no TSX.");
  }
} else {
  console.log("Bloco de preenchimento do fluxo já existe no dashboard.");
}

const cssMarker = "/* dashboard-flow-fill-empty-space */";

if (!css.includes(cssMarker)) {
  css += `

${cssMarker}
.dashboard-flow-panel {
  display: flex !important;
  flex-direction: column;
}

.dashboard-flow-panel > .muted-line {
  margin-bottom: 0;
}

.dashboard-flow-details-grid {
  margin-top: auto;
  padding-top: 18px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.dashboard-flow-detail-card {
  min-height: 76px;
  padding: 13px 14px;
  border-radius: 18px;
  border: 1px solid rgba(15, 23, 42, 0.07);
  background: rgba(255, 255, 255, 0.72);
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.035);
}

.dashboard-flow-detail-card span {
  display: block;
  margin-bottom: 8px;
  color: #64748b;
  font-size: 12px;
  font-weight: 800;
}

.dashboard-flow-detail-card strong {
  display: block;
  color: #0f172a;
  font-size: 18px;
  font-weight: 900;
  line-height: 1.15;
}

@media (max-width: 760px) {
  .dashboard-flow-details-grid {
    grid-template-columns: 1fr;
  }
}
`;
}

fs.writeFileSync(dashboardFile, dashboard, "utf8");
fs.writeFileSync(cssFile, css, "utf8");

console.log("Ajustado:", path.relative(root, dashboardFile));
console.log("Ajustado:", path.relative(root, cssFile));
