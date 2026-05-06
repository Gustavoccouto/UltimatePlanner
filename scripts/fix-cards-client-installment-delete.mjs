#!/usr/bin/env node
import fs from "fs";
import path from "path";

const root = process.cwd();
const file = path.join(root, "src", "components", "cards", "cards-client.tsx");

if (!fs.existsSync(file)) {
  console.error("Arquivo não encontrado:", path.relative(root, file));
  process.exit(1);
}

const backup = `${file}.backup-before-hard-installment-delete`;
let text = fs.readFileSync(file, "utf8");
const original = text;

if (!fs.existsSync(backup)) {
  fs.writeFileSync(backup, text, "utf8");
  console.log("Backup criado:", path.relative(root, backup));
}

/**
 * Substitui a função deleteInstallmentPlan por uma versão que recebe planId: string.
 * Isso elimina o erro de Vercel causado por handler com tipo/assinatura antiga.
 */
const deletePlanRegex =
  /async function deleteInstallmentPlan\s*\([^)]*\)\s*\{[\s\S]*?\n\s*\}\s*function togglePlan/;

const deletePlanReplacement = `async function deleteInstallmentPlan(planId: string) {
    const confirmed = window.confirm(
      "Isso vai excluir a compra parcelada inteira e remover todas as parcelas desta aba. Deseja continuar?"
    );

    if (!confirmed) return;

    setError("");

    try {
      await requestJson<{ ok: boolean }>("/api/cards/installments", {
        method: "PATCH",
        body: JSON.stringify({
          action: "delete_plan_by_id",
          id: planId
        })
      });

      setMessage("Compra parcelada inteira excluída.");
      await refreshCardsData();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Erro ao excluir a compra parcelada inteira.");
    }
  }

  function togglePlan`;

if (deletePlanRegex.test(text)) {
  text = text.replace(deletePlanRegex, deletePlanReplacement);
} else {
  console.warn("Não encontrei a função deleteInstallmentPlan automaticamente.");
}

/**
 * Garante que qualquer chamada do botão do plano use plan.id.
 */
text = text.replace(/deleteInstallmentPlan\(plan\)/g, "deleteInstallmentPlan(plan.id)");
text = text.replace(/deleteInstallmentPlan\(transaction\)/g, "deleteInstallmentPlan(transaction.installment_plan_id || transaction.id)");
text = text.replace(/handleDeleteInstallmentPlan\?\.\(plan\.id\)/g, "deleteInstallmentPlan(plan.id)");
text = text.replace(/handleDeleteInstallmentPlan\(plan\.id\)/g, "deleteInstallmentPlan(plan.id)");

/**
 * Corrige a linha do mês de fatura para evitar erro de tipo com null/undefined.
 */
text = text.replace(
  /monthKey\(installment\.billing_month\s*\|\|\s*""\)/g,
  'monthKey(String(installment.billing_month ?? ""))'
);

/**
 * Remove o botão solto "Excluir compra inteira" caso ele ainda esteja fora do header.
 */
text = text.replace(
  /\n\s*<button\s+type="button"\s+className="badge badge-danger-action"\s+onClick=\{\(\)\s*=>\s*deleteInstallmentPlan\(plan\.id\)\}\s*>\s*\n?\s*Excluir compra inteira\s*\n?\s*<\/button>/g,
  ""
);

/**
 * Se o botão de excluir compra ainda não estiver no header, coloca logo depois do
 * botão installment-plan-summary.
 */
if (!/installment-plan-delete-chip/.test(text)) {
  text = text.replace(
    /(<button className="installment-plan-summary"[\s\S]*?<span className="badge">\{isOpen \? "Recolher detalhes" : "Ver parcelas"\}<\/span>\s*<\/button>)/,
    `<div className="installment-plan-header">
                $1
                <button
                  type="button"
                  className="installment-plan-delete-chip"
                  onClick={() => deleteInstallmentPlan(plan.id)}
                  title="Excluir todas as parcelas desta compra"
                  aria-label={\`Excluir compra parcelada inteira: \${plan.description}\`}
                >
                  Excluir compra
                </button>
              </div>`
  );
}

/**
 * Se o wrapper foi criado, evita wrapper duplicado simples.
 */
text = text.replace(
  /<div className="installment-plan-header">\s*<div className="installment-plan-header">/g,
  '<div className="installment-plan-header">'
);
text = text.replace(
  /<\/button>\s*<\/div>\s*<button\s+type="button"\s+className="installment-plan-delete-chip"/g,
  '</button>\n                <button type="button" className="installment-plan-delete-chip"'
);

if (text === original) {
  console.log("Nenhuma alteração feita. O arquivo talvez já esteja corrigido ou esteja muito diferente.");
} else {
  fs.writeFileSync(file, text, "utf8");
  console.log("Corrigido:", path.relative(root, file));
}
