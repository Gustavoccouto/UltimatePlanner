#!/usr/bin/env node
import fs from "fs";
import path from "path";

const root = process.cwd();
const clientFile = path.join(root, "src", "components", "projects", "projects-client.tsx");

if (!fs.existsSync(clientFile)) {
  console.error("Arquivo não encontrado:", path.relative(root, clientFile));
  process.exit(1);
}

const backup = `${clientFile}.backup-before-project-item-completion-finance`;
if (!fs.existsSync(backup)) {
  fs.writeFileSync(backup, fs.readFileSync(clientFile, "utf8"), "utf8");
  console.log("Backup criado:", path.relative(root, backup));
}

let text = fs.readFileSync(clientFile, "utf8");
const original = text;

const newToggle = `async function toggleItem(item: ProjectItem) {
    const nextStatus = item.status === "completed" ? "pending" : "completed";
    const amount = Number(item.amount || 0);
    const projectedProjectCash = Number(summary.cashBalance || 0) - amount;
    let allowNegative = false;

    if (nextStatus === "completed" && projectedProjectCash < 0) {
      allowNegative = window.confirm(
        [
          "Concluir item com caixa negativo?",
          "",
          \`Este item custa \${currencyBRL(amount)}.\`,
          \`Caixa atual do projeto: \${currencyBRL(summary.cashBalance)}.\`,
          \`Depois de concluir, o projeto ficará em \${currencyBRL(projectedProjectCash)}.\`,
          "",
          "Deseja continuar mesmo assim?"
        ].join("\\n")
      );

      if (!allowNegative) return;
    }

    setLoading(true);
    setError("");
    setMessage("");

    try {
      await requestJson("/api/projects/items", {
        method: "PATCH",
        body: JSON.stringify({
          id: item.id,
          project_id: item.project_id,
          name: item.name,
          amount,
          category: metadataValue(item, "category"),
          notes: metadataValue(item, "notes"),
          status: nextStatus,
          allow_negative: allowNegative
        })
      });

      await reload();
      setMessage(nextStatus === "completed" ? "Item concluído e valor baixado do caixa do projeto." : "Item reaberto e valor devolvido ao caixa do projeto.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível alterar o item.");
    } finally {
      setLoading(false);
    }
  }

  async function deleteMovement`;

text = text.replace(
  /async function toggleItem\(item: ProjectItem\) \{[\s\S]*?\}\s*async function deleteMovement/g,
  newToggle
);

if (text !== original) {
  fs.writeFileSync(clientFile, text, "utf8");
  console.log("Ajustado:", path.relative(root, clientFile));
} else {
  console.log("Nenhuma alteração automática no toggleItem. Talvez o arquivo esteja diferente.");
}

console.log("Concluído. Rode: npm run build");
