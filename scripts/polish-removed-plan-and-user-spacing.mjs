#!/usr/bin/env node
import fs from "fs";
import path from "path";

const root = process.cwd();
const cardsFile = path.join(root, "src", "components", "cards", "cards-client.tsx");
const cssFile = path.join(root, "src", "app", "ux-polish.css");

function backup(file, suffix) {
  if (!fs.existsSync(file)) return;
  const backupFile = `${file}.${suffix}`;
  if (!fs.existsSync(backupFile)) {
    fs.writeFileSync(backupFile, fs.readFileSync(file, "utf8"), "utf8");
    console.log("Backup criado:", path.relative(root, backupFile));
  }
}

if (fs.existsSync(cardsFile)) {
  backup(cardsFile, "backup-before-removed-plan-polish");

  let text = fs.readFileSync(cardsFile, "utf8");
  const original = text;

  // 1) Marca planos removidos no map.
  text = text.replace(
    /const isOpen = expandedPlans\.has\(plan\.id\);\s*return\s*\(/g,
    'const isOpen = expandedPlans.has(plan.id); const isRemoved = plan.status === "canceled" || (plan.remaining_count === 0 && plan.paid_count === 0); return ('
  );

  // 2) Adiciona classe is-removed no article.
  text = text.replace(
    /className=\{`installment-plan-card \$\{isOpen \? "is-open" : ""\}`\}/g,
    'className={`installment-plan-card ${isOpen ? "is-open" : ""}${isRemoved ? " is-removed" : ""}`}'
  );

  // 3) Troca o badge para mostrar "Removido" quando cancelado/zerado.
  text = text.replace(
    /<span className="badge">\{isOpen \? "Recolher detalhes" : "Ver parcelas"\}<\/span>/g,
    '<span className={`badge ${isRemoved ? "badge-muted" : ""}`}>{isRemoved ? "Removido" : isOpen ? "Recolher detalhes" : "Ver parcelas"}</span>'
  );

  // 4) Ajusta a linha de descrição para indicar removido.
  text = text.replace(
    /\{plan\.card\?\.name \|\| "Cartão removido"\} • \{monthKey\(String\(plan\.first_billing_month \|\| ""\)\) \|\| "—"\} até \{monthKey\(String\(plan\.last_billing_month \|\| ""\)\) \|\| "—"\}/g,
    '{plan.card?.name || "Cartão removido"} • {monthKey(String(plan.first_billing_month || "")) || "—"} até {monthKey(String(plan.last_billing_month || "")) || "—"}{isRemoved ? " • removido" : ""}'
  );

  // 5) Dá uma classe própria ao botão de excluir do plano e mantém a função atual.
  text = text.replace(
    /<button([^>]*?)className="(?:badge badge-danger-action|btn btn-danger-soft|btn btn-danger-soft installment-plan-summary btn-danger-summary)"([^>]*?)onClick=\{\(\) => deleteInstallmentPlan\(plan\.id\)\}([^>]*)>/g,
    '<button$1type="button" className="installment-plan-delete-chip"$2onClick={() => deleteInstallmentPlan(plan.id)}$3>'
  );

  // 6) Se o botão ficou com texto antigo, deixa mais curto.
  text = text.replace(/>\s*Excluir compra inteira\s*</g, '>Excluir compra<');

  if (text !== original) {
    fs.writeFileSync(cardsFile, text, "utf8");
    console.log("Ajustado:", path.relative(root, cardsFile));
  } else {
    console.log("Nenhuma alteração automática no cards-client.tsx.");
  }
} else {
  console.log("cards-client.tsx não encontrado.");
}

if (fs.existsSync(cssFile)) {
  backup(cssFile, "backup-before-removed-plan-polish");

  let css = fs.readFileSync(cssFile, "utf8");
  const marker = "/* removed-plan-user-spacing-patch */";

  if (!css.includes(marker)) {
    css += `

${marker}
.installment-plan-card.is-removed {
  opacity: 0.72;
  background: rgba(148, 163, 184, 0.08) !important;
  border-color: rgba(148, 163, 184, 0.20) !important;
  box-shadow: none !important;
}

.installment-plan-card.is-removed .installment-plan-summary strong,
.installment-plan-card.is-removed .installment-plan-summary small,
.installment-plan-card.is-removed .muted-line,
.installment-plan-card.is-removed td,
.installment-plan-card.is-removed .table-actions {
  color: #64748b !important;
  text-decoration: line-through;
}

.installment-plan-card.is-removed .badge-muted {
  background: rgba(148, 163, 184, 0.16) !important;
  color: #64748b !important;
}

.installment-plan-delete-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  align-self: flex-start;
  width: auto;
  min-height: 34px;
  margin: 10px 14px 14px 14px;
  padding: 0 14px;
  border-radius: 999px;
  border: 1px solid rgba(239, 68, 68, 0.18) !important;
  background: rgba(254, 242, 242, 0.88) !important;
  color: #b91c1c !important;
  font-size: 12px;
  font-weight: 800;
  line-height: 1;
  white-space: nowrap;
  box-shadow: 0 2px 8px rgba(220, 38, 38, 0.06);
}

.installment-plan-delete-chip:hover {
  background: rgba(254, 226, 226, 0.96) !important;
  border-color: rgba(220, 38, 38, 0.28) !important;
  color: #991b1b !important;
}

.installment-plan-card.is-removed .installment-plan-delete-chip {
  opacity: 0.55;
}

.topbar-main {
  gap: 14px !important;
}

.user-menu {
  margin-left: auto;
  padding-left: 10px;
  padding-bottom: 2px;
}

.user-chip {
  gap: 12px !important;
  padding: 8px 14px 8px 10px !important;
  margin: 2px 0 !important;
}

.user-chip-avatar,
.mobile-user-avatar {
  flex-shrink: 0;
}

.user-chip-copy,
.mobile-user-text {
  min-width: 0;
  padding-right: 4px;
}

.user-chip-copy strong,
.mobile-user-text strong {
  margin-bottom: 2px;
}

.mobile-user-card {
  gap: 14px !important;
  margin: 24px 8px 28px !important;
  padding: 16px !important;
}

.mobile-user-card + .nav,
.mobile-user-card ~ .nav {
  margin-top: 16px !important;
}

@media (max-width: 720px) {
  .installment-plan-delete-chip {
    margin: 10px 12px 12px 12px;
  }
}
`;
    fs.writeFileSync(cssFile, css, "utf8");
    console.log("Ajustado:", path.relative(root, cssFile));
  } else {
    console.log("Patch de CSS já estava aplicado.");
  }
} else {
  console.log("ux-polish.css não encontrado.");
}
