#!/usr/bin/env node
import fs from "fs";
import path from "path";

const root = process.cwd();
const file = path.join(root, "src", "components", "cards", "cards-client.tsx");

if (!fs.existsSync(file)) {
  console.error("Arquivo não encontrado:", path.relative(root, file));
  process.exit(1);
}

const backup = `${file}.backup-before-no-rpc-installment-delete`;
let text = fs.readFileSync(file, "utf8");
const original = text;

if (!fs.existsSync(backup)) {
  fs.writeFileSync(backup, text, "utf8");
  console.log("Backup criado:", path.relative(root, backup));
}

const functionRegex =
  /async function deleteInstallmentPlan\s*\([^)]*\)\s*\{[\s\S]*?\n\s*\}\s*(?=(?:function|async function|const|return)\s+)/;

const replacement = `async function deleteInstallmentPlan(planId: string) {
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

  `;

if (functionRegex.test(text)) {
  text = text.replace(functionRegex, replacement);
} else if (!/async function deleteInstallmentPlan\(planId: string\)/.test(text)) {
  console.warn("Não encontrei a função deleteInstallmentPlan para substituir automaticamente.");
}

text = text.replace(/handleDeleteInstallmentPlan\?\.\(plan\.id\)/g, "deleteInstallmentPlan(plan.id)");
text = text.replace(/handleDeleteInstallmentPlan\(plan\.id\)/g, "deleteInstallmentPlan(plan.id)");
text = text.replace(/deleteInstallmentPlan\(plan\)/g, "deleteInstallmentPlan(plan.id)");
text = text.replace(/deleteInstallmentPlan\(transaction\)/g, "deleteInstallmentPlan(transaction.installment_plan_id || transaction.id)");

text = text.replace(
  /monthKey\(installment\.billing_month\s*\|\|\s*""\)/g,
  'monthKey(String(installment.billing_month ?? ""))'
);

if (text === original) {
  console.log("Nenhuma alteração feita. O arquivo talvez já esteja corrigido.");
} else {
  fs.writeFileSync(file, text, "utf8");
  console.log("Corrigido:", path.relative(root, file));
}
