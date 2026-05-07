#!/usr/bin/env node
import fs from "fs";
import path from "path";

const root = process.cwd();

const clientFile = path.join(root, "src", "components", "projects", "projects-client.tsx");
const cssFile = path.join(root, "src", "app", "ux-polish.css");
const transactionsRouteFile = path.join(root, "src", "app", "api", "transactions", "route.ts");

function backup(file, suffix) {
  if (!fs.existsSync(file)) return;
  const backupFile = `${file}.${suffix}`;
  if (!fs.existsSync(backupFile)) {
    fs.writeFileSync(backupFile, fs.readFileSync(file, "utf8"), "utf8");
    console.log("Backup criado:", path.relative(root, backupFile));
  }
}

function patchProjectsClient() {
  if (!fs.existsSync(clientFile)) {
    console.log("Ignorado, não encontrado:", path.relative(root, clientFile));
    return;
  }

  backup(clientFile, "backup-before-projects-ui-finance-sync-v2");

  let text = fs.readFileSync(clientFile, "utf8");
  const original = text;

  if (!text.includes("function formatProjectAccountOption")) {
    text = text.replace(
      /function currencyBRL\(value: number\) \{[\s\S]*?\}\n/,
      (match) =>
        `${match}
function formatProjectAccountOption(account: { name?: string | null; balance?: number | null; current_balance?: number | null }) {
  const balance = Number(account.current_balance ?? account.balance ?? 0);
  return \`\${account.name || "Conta"} - \${currencyBRL(balance)} (saldo em conta)\`;
}

`
    );
  }

  text = text.replace(
    /\{bundle\.accounts\.map\(\(account\) => <option value=\{account\.id\} key=\{account\.id\}>\{account\.name\}<\/option>\)\}/g,
    '{bundle.accounts.map((account) => <option value={account.id} key={account.id}>{formatProjectAccountOption(account)}</option>)}'
  );

  text = text.replace(
    /\{accounts\.map\(\(account\) => <option value=\{account\.id\} key=\{account\.id\}>\{account\.name\}<\/option>\)\}/g,
    '{accounts.map((account) => <option value={account.id} key={account.id}>{formatProjectAccountOption(account)}</option>)}'
  );

  text = text.replace(
    /<label className="field"><span>Conta vinculada \(opcional\)<\/span><select/g,
    '<label className="field full-span movement-account-field"><span>Conta vinculada (opcional)</span><select'
  );

  text = text.replace(
    /<div className="header-actions">/g,
    '<div className="header-actions project-finance-actions">'
  );

  text = text.replace(
    /<tr className=\{`project-checklist-row \$\{item\.status === "completed" \? "is-completed" : ""\}`\} key=\{item\.id\}>/g,
    '<tr className={`project-checklist-row ${item.status === "completed" ? "is-completed" : ""}`} key={item.id}>'
  );

  if (text !== original) {
    fs.writeFileSync(clientFile, text, "utf8");
    console.log("Ajustado:", path.relative(root, clientFile));
  } else {
    console.log("Nenhuma alteração automática feita em:", path.relative(root, clientFile));
  }
}

function patchCss() {
  if (!fs.existsSync(cssFile)) {
    console.log("Ignorado, CSS não encontrado:", path.relative(root, cssFile));
    return;
  }

  backup(cssFile, "backup-before-projects-ui-finance-sync-v2");

  let css = fs.readFileSync(cssFile, "utf8");
  const marker = "/* projects-ui-finance-sync-v2 */";

  if (!css.includes(marker)) {
    css += `

${marker}
.project-finance-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 12px;
  width: 100%;
  margin-left: auto;
}

.project-finance-actions .btn,
.project-finance-actions button {
  margin-left: 0;
}

.movement-account-field,
.movement-account-field select {
  width: 100%;
}

.modal-backdrop {
  overflow-x: hidden !important;
}

.modal-card {
  width: min(940px, 94vw) !important;
  max-width: 94vw !important;
  margin-inline: auto !important;
  overflow-x: hidden !important;
}

@media (max-width: 760px) {
  .modal-backdrop {
    padding: 12px !important;
    align-items: center !important;
    justify-content: center !important;
    overflow-x: hidden !important;
  }

  .modal-card {
    width: 94vw !important;
    max-width: 94vw !important;
    margin-inline: auto !important;
    overflow-x: hidden !important;
  }
}

/* Checklist em cards, visual mais próximo da referência */
table:has(.project-checklist-row) {
  display: block;
  width: 100%;
  border-collapse: separate;
  border-spacing: 0 14px;
}

table:has(.project-checklist-row) thead {
  display: none !important;
}

table:has(.project-checklist-row) tbody {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 16px;
}

.project-checklist-row {
  position: relative;
  display: grid !important;
  grid-template-columns: 1fr;
  gap: 10px;
  min-height: 184px;
  padding: 18px 18px 16px 18px;
  border: 1px solid rgba(15, 23, 42, 0.06);
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.045);
  transition: transform 0.18s ease, box-shadow 0.18s ease, opacity 0.18s ease;
}

.project-checklist-row:hover {
  transform: translateY(-2px);
  box-shadow: 0 14px 34px rgba(15, 23, 42, 0.07);
}

.project-checklist-row td {
  display: block;
  border: 0 !important;
  padding: 0 !important;
}

.project-checklist-row td:first-child {
  order: 1;
}

.project-checklist-row td:nth-child(2) {
  order: 2;
  font-size: 1rem;
  font-weight: 800;
  color: #0f172a;
  line-height: 1.35;
}

.project-checklist-row td:nth-child(3),
.project-checklist-row td:nth-child(4) {
  order: 3;
  color: #64748b;
  font-size: 0.93rem;
}

.project-checklist-row td:nth-child(5),
.project-checklist-row .table-actions {
  order: 4;
  display: flex !important;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: auto;
}

.project-checklist-row td:first-child .badge,
.project-checklist-row td:first-child [class*="badge"] {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px;
  border-radius: 999px;
}

.project-checklist-row td:first-child .badge::before,
.project-checklist-row td:first-child [class*="badge"]::before {
  content: "";
  width: 10px;
  height: 10px;
  border-radius: 999px;
  border: 2px solid currentColor;
  background: transparent;
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

.project-checklist-row.is-completed td:first-child .badge::before,
.project-checklist-row.is-completed td:first-child [class*="badge"]::before {
  background: currentColor;
}

@media (max-width: 760px) {
  table:has(.project-checklist-row) tbody {
    grid-template-columns: 1fr;
  }

  .project-finance-actions {
    justify-content: flex-end;
    width: 100%;
  }
}
`;
    fs.writeFileSync(cssFile, css, "utf8");
    console.log("Ajustado:", path.relative(root, cssFile));
  } else {
    console.log("CSS já estava aplicado.");
  }
}

function patchTransactionsRoute() {
  if (!fs.existsSync(transactionsRouteFile)) {
    console.log("Ignorado, não encontrado:", path.relative(root, transactionsRouteFile));
    return;
  }

  backup(transactionsRouteFile, "backup-before-projects-ui-finance-sync-v2");

  let text = fs.readFileSync(transactionsRouteFile, "utf8");
  const original = text;

  if (!text.includes("type LinkedProjectMovementRef")) {
    text = text.replace(
      /type TransactionRow = \{[\s\S]*?\n\};/,
      (match) =>
        `${match}

type LinkedProjectMovementRef = {
  projectMovementId: string | null;
  projectId: string | null;
};

function extractLinkedProjectMovement(metadata: unknown): LinkedProjectMovementRef {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return { projectMovementId: null, projectId: null };
  }

  const value = metadata as Record<string, unknown>;
  const projectMovementId =
    typeof value.project_movement_id === "string" ? value.project_movement_id : null;
  const projectId = typeof value.project_id === "string" ? value.project_id : null;
  const source = typeof value.source === "string" ? value.source : null;

  if (source !== "project_movement" && !projectMovementId) {
    return { projectMovementId: null, projectId: null };
  }

  return { projectMovementId, projectId };
}

async function recalculateProjectCash(supabase: any, projectId: string) {
  const { data, error } = await supabase
    .from("project_movements")
    .select("type, amount")
    .eq("project_id", projectId)
    .eq("is_deleted", false);

  if (error) throw new Error(error.message);

  const balance = (data || []).reduce((sum: number, item: { type?: string | null; amount?: number | string | null }) => {
    const amount = Number(item.amount || 0);
    if (item.type === "remove") return sum - amount;
    return sum + amount;
  }, 0);

  const { error: updateError } = await supabase
    .from("projects")
    .update({ current_amount: balance })
    .eq("id", projectId);

  if (updateError) throw new Error(updateError.message);
}

async function syncDeleteLinkedProjectMovement(
  supabase: any,
  ownerId: string,
  metadata: unknown
) {
  const linked = extractLinkedProjectMovement(metadata);

  if (!linked.projectMovementId || !linked.projectId) return;

  const { error } = await supabase
    .from("project_movements")
    .update({ is_deleted: true })
    .eq("owner_id", ownerId)
    .eq("id", linked.projectMovementId)
    .eq("is_deleted", false);

  if (error) throw new Error(error.message);

  await recalculateProjectCash(supabase, linked.projectId);
}
`
    );
  }

  const deleteMarker = 'const transaction = existing as TransactionRow;';
  if (text.includes(deleteMarker) && !text.includes('await syncDeleteLinkedProjectMovement(context.supabase, context.user.id, transaction.metadata);')) {
    text = text.replace(
      deleteMarker,
      `${deleteMarker}

    await syncDeleteLinkedProjectMovement(context.supabase, context.user.id, transaction.metadata);`
    );
  }

  if (text !== original) {
    fs.writeFileSync(transactionsRouteFile, text, "utf8");
    console.log("Ajustado:", path.relative(root, transactionsRouteFile));
  } else {
    console.log("Nenhuma alteração automática feita em:", path.relative(root, transactionsRouteFile));
  }
}

patchProjectsClient();
patchCss();
patchTransactionsRoute();

console.log("");
console.log("Concluído. Rode:");
console.log("npm run build");
console.log("npm run dev");
