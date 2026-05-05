import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const cardsClientPath = path.join(root, "src/components/cards/cards-client.tsx");

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function write(filePath, content) {
  fs.writeFileSync(filePath, content);
}

function removePreviousRowPlanDeleteButton(source) {
  return source
    .replace(/\s*\{transaction\s*&&\s*transaction\.installment_plan_id\s*\?\s*\(\s*<button[^>]*deleteInstallmentPlan\(transaction\)[\s\S]*?>\s*Excluir compra inteira\s*<\/button>\s*\)\s*:\s*null\}/g, "")
    .replace(/\s*\{transaction\s*&&\s*transaction\.installment_plan_id\s*\?\s*\(\s*<button[^>]*>\s*Excluir compra inteira\s*<\/button>\s*\)\s*:\s*null\}/g, "");
}

function ensureDeleteInstallmentPlanFunction(source) {
  if (source.includes("function deleteInstallmentPlan(")) return source;

  const insertBefore = "function togglePlan(planId: string)";
  const helper = `
  async function deleteInstallmentPlan(transaction: Transaction) {
    if (!transaction.installment_plan_id) {
      setError("Esta parcela não pertence a uma compra parcelada.");
      return;
    }

    const confirmed = window.confirm(
      "Isso vai excluir a compra parcelada inteira e remover todas as parcelas desta aba. Deseja continuar?"
    );

    if (!confirmed) return;

    setError("");

    try {
      await requestJson<{ ok: boolean }>("/api/cards/installments", {
        method: "PATCH",
        body: JSON.stringify({ action: "delete_plan", id: transaction.id })
      });

      setMessage("Compra parcelada inteira excluída.");
      await refreshCardsData();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Erro ao excluir a compra parcelada inteira.");
    }
  }

  `;

  if (!source.includes(insertBefore)) {
    console.warn("[cards] Não encontrei togglePlan para inserir a função deleteInstallmentPlan.");
    return source;
  }

  return source.replace(insertBefore, `${helper}${insertBefore}`);
}

function insertPlanLevelDeleteButton(source) {
  if (source.includes("installment-plan-delete-button")) return source;

  const button = `<button
                      className="btn btn-danger btn-soft-danger installment-plan-delete-button"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        const transaction = plan.installments.find((item) => item.transaction)?.transaction;

                        if (!transaction) {
                          setError("Não encontrei uma parcela ativa para excluir esta compra inteira.");
                          return;
                        }

                        deleteInstallmentPlan(transaction);
                      }}
                    >
                      Excluir compra inteira
                    </button>`;

  const exactButtonPattern = /(<button[^>]*onClick=\{\(\) => togglePlan\(plan\.id\)\}[^>]*aria-expanded=\{isOpen\}[^>]*>\s*\{isOpen \? "Recolher detalhes" : "Ver parcelas"\}\s*<\/button>)/;
  if (exactButtonPattern.test(source)) {
    return source.replace(exactButtonPattern, `$1${button}`);
  }

  const looseButtonPattern = /(<button[^>]*togglePlan\(plan\.id\)[\s\S]*?>\s*\{isOpen \? "Recolher detalhes" : "Ver parcelas"\}\s*<\/button>)/;
  if (looseButtonPattern.test(source)) {
    return source.replace(looseButtonPattern, `$1${button}`);
  }

  const compactPattern = /(\{isOpen \? "Recolher detalhes" : "Ver parcelas"\}\s*<\/button>)/;
  if (compactPattern.test(source)) {
    return source.replace(compactPattern, `$1${button}`);
  }

  console.warn("[cards] Não encontrei o botão Ver parcelas/Recolher detalhes para inserir Excluir compra inteira.");
  return source;
}

function removeControlTableDeleteButtons(source) {
  const start = source.indexOf("<h2>Controle</h2>");
  const end = source.indexOf("<h2>Parcelamentos</h2>", start);

  if (start === -1 || end === -1 || end <= start) {
    console.warn("[cards] Não encontrei a seção Controle para remover o botão Excluir da tabela.");
    return source;
  }

  const before = source.slice(0, start);
  const section = source.slice(start, end);
  const after = source.slice(end);

  const cleanedSection = section
    .replace(/\s*<button[^>]*onClick=\{\(\) => deleteCard\(card\)\}[^>]*>\s*Excluir\s*<\/button>/g, "")
    .replace(/\s*<a[^>]*onClick=\{\(\) => deleteCard\(card\)\}[^>]*>\s*Excluir\s*<\/a>/g, "");

  return `${before}${cleanedSection}${after}`;
}

function patchCardsClient() {
  if (!fs.existsSync(cardsClientPath)) {
    console.error("[cards] Arquivo não encontrado: src/components/cards/cards-client.tsx");
    process.exitCode = 1;
    return;
  }

  let source = read(cardsClientPath);
  const original = source;

  source = removePreviousRowPlanDeleteButton(source);
  source = ensureDeleteInstallmentPlanFunction(source);
  source = insertPlanLevelDeleteButton(source);
  source = removeControlTableDeleteButtons(source);

  if (source !== original) {
    write(cardsClientPath, source);
    console.log("[cards] Ajustes aplicados: excluir do controle removido e excluir compra inteira movido para o card do parcelamento.");
  } else {
    console.log("[cards] Nenhuma alteração necessária.");
  }
}

patchCardsClient();
