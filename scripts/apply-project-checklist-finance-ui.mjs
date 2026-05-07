#!/usr/bin/env node
import fs from "fs";
import path from "path";

const root = process.cwd();
const clientFile = path.join(root, "src", "components", "projects", "projects-client.tsx");
const cssFile = path.join(root, "src", "app", "ux-polish.css");

function backup(file, suffix) {
  if (!fs.existsSync(file)) return;

  const backupFile = `${file}.${suffix}`;

  if (!fs.existsSync(backupFile)) {
    fs.writeFileSync(backupFile, fs.readFileSync(file, "utf8"), "utf8");
    console.log("Backup criado:", path.relative(root, backupFile));
  }
}

if (!fs.existsSync(clientFile)) {
  console.error("Arquivo não encontrado:", path.relative(root, clientFile));
  process.exit(1);
}

backup(clientFile, "backup-before-project-checklist-finance");

let text = fs.readFileSync(clientFile, "utf8");
const original = text;

text = text.replace(
  /import type \{ ActivityLog, Profile, Project, ProjectItem, ProjectMovement, SharedItem \}/,
  "import type { Account, ActivityLog, Profile, Project, ProjectItem, ProjectMovement, SharedItem }"
);

text = text.replace(
  /profiles: Profile\[\]; currentUserId: string;/,
  "profiles: Profile[]; accounts: Account[]; currentUserId: string;"
);

text = text.replace(
  /type MovementForm = \{ project_id: string; type: "add" \| "remove"; amount: string; description: string; \};/,
  'type MovementForm = { project_id: string; account_id: string; type: "add" | "remove"; amount: string; description: string; };'
);

text = text.replace(
  /const emptyMovementForm: MovementForm = \{ project_id: "", type: "add", amount: "0", description: "" \};/,
  'const emptyMovementForm: MovementForm = { project_id: "", account_id: "", type: "add", amount: "0", description: "" };'
);

text = text.replace(
  /Aportes e retiradas separados das contas principais por enquanto\./g,
  "Aportes e retiradas funcionam como caixa do projeto. Vincule uma conta para também gerar transação nas finanças."
);

text = text.replace(
  /<tr key=\{item\.id\}>/g,
  '<tr className={`project-checklist-row ${item.status === "completed" ? "is-completed" : ""}`} key={item.id}>'
);

text = text.replace(
  /<label className="field full-span"><span>Descrição<\/span><input value=\{movementForm\.description\} onChange=\{\(e\) => setMovementForm\(\{ \.\.\.movementForm, description: e\.target\.value \}\)\} placeholder="Ex\.: aporte do mês" \/><\/label>/,
  `<label className="field"><span>Conta vinculada (opcional)</span><select value={movementForm.account_id} onChange={(e) => setMovementForm({ ...movementForm, account_id: e.target.value })}><option value="">Não mexer em conta</option>{bundle.accounts.map((account) => <option value={account.id} key={account.id}>{account.name}</option>)}</select></label> <label className="field full-span"><span>Descrição</span><input value={movementForm.description} onChange={(e) => setMovementForm({ ...movementForm, description: e.target.value })} placeholder="Ex.: aporte do mês" /></label>`
);

/*
  Se o arquivo estiver formatado de forma diferente, faz um fallback por ponto de inserção mais simples.
*/
if (!text.includes("Conta vinculada (opcional)")) {
  text = text.replace(
    /(<label className="field"><span>Valor<\/span><input type="number" step="0\.01" min="0\.01" value=\{movementForm\.amount\}[\s\S]*?required \/><\/label>)/,
    `$1 <label className="field"><span>Conta vinculada (opcional)</span><select value={movementForm.account_id} onChange={(e) => setMovementForm({ ...movementForm, account_id: e.target.value })}><option value="">Não mexer em conta</option>{bundle.accounts.map((account) => <option value={account.id} key={account.id}>{account.name}</option>)}</select></label>`
  );
}

if (text !== original) {
  fs.writeFileSync(clientFile, text, "utf8");
  console.log("Ajustado:", path.relative(root, clientFile));
} else {
  console.log("Nenhuma alteração automática feita no client.");
}

if (fs.existsSync(cssFile)) {
  backup(cssFile, "backup-before-project-checklist-finance");

  let css = fs.readFileSync(cssFile, "utf8");
  const marker = "/* project-checklist-finance-mobile-polish */";

  if (!css.includes(marker)) {
    css += `

${marker}
/* Checklist de projetos como cards, sem alterar a identidade visual */
table:has(.project-checklist-row) {
  display: block;
  width: 100%;
  border-collapse: separate;
  border-spacing: 0 10px;
}

table:has(.project-checklist-row) thead {
  display: none;
}

table:has(.project-checklist-row) tbody {
  display: grid;
  gap: 10px;
}

.project-checklist-row {
  display: grid !important;
  grid-template-columns: minmax(96px, 0.7fr) minmax(180px, 1.4fr) minmax(140px, 1fr) minmax(120px, 0.7fr) minmax(220px, auto);
  align-items: center;
  gap: 12px;
  padding: 16px;
  border: 1px solid rgba(15, 23, 42, 0.07);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.82);
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.045);
}

.project-checklist-row td {
  display: block;
  border: 0 !important;
  padding: 0 !important;
}

.project-checklist-row.is-completed {
  opacity: 0.72;
  background: rgba(248, 250, 252, 0.92);
}

.project-checklist-row.is-completed td:nth-child(2),
.project-checklist-row.is-completed td:nth-child(3),
.project-checklist-row.is-completed td:nth-child(4) {
  text-decoration: line-through;
  color: #64748b !important;
}

.project-checklist-row .table-actions {
  justify-content: flex-end;
  flex-wrap: wrap;
}

/* Mobile/modal somente no media query, para evitar scroll lateral */
@media (max-width: 760px) {
  .modal-backdrop {
    align-items: flex-start !important;
    overflow-x: hidden !important;
    overflow-y: auto !important;
    padding: 12px !important;
  }

  .modal-card {
    width: calc(100vw - 24px) !important;
    max-width: calc(100vw - 24px) !important;
    max-height: none !important;
    overflow-x: hidden !important;
    border-radius: 22px !important;
  }

  .modal-card .form-grid,
  .modal-card .form-grid.two-columns {
    grid-template-columns: 1fr !important;
  }

  .modal-card .field,
  .modal-card .full-span {
    min-width: 0 !important;
    grid-column: 1 / -1 !important;
  }

  table:has(.project-checklist-row) {
    overflow: visible !important;
  }

  .project-checklist-row {
    grid-template-columns: 1fr !important;
    gap: 10px;
  }

  .project-checklist-row td::before {
    display: block;
    margin-bottom: 3px;
    color: #64748b;
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .project-checklist-row td:nth-child(1)::before { content: "Status"; }
  .project-checklist-row td:nth-child(2)::before { content: "Item"; }
  .project-checklist-row td:nth-child(3)::before { content: "Categoria"; }
  .project-checklist-row td:nth-child(4)::before { content: "Valor"; }
  .project-checklist-row td:nth-child(5)::before { content: "Ações"; }

  .project-checklist-row .table-actions {
    justify-content: flex-start;
  }
}
`;
    fs.writeFileSync(cssFile, css, "utf8");
    console.log("Ajustado:", path.relative(root, cssFile));
  } else {
    console.log("CSS já estava aplicado.");
  }
} else {
  console.log("CSS não encontrado:", path.relative(root, cssFile));
}

console.log("Concluído. Rode: npm run build");
