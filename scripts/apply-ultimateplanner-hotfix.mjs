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

function patchCardsClient() {
  if (!fs.existsSync(cardsClientPath)) {
    console.warn("[cards-client] Arquivo não encontrado. Pulei patch visual da página de cartões.");
    return;
  }

  let source = read(cardsClientPath);
  const original = source;

  if (!source.includes("function deleteInstallmentPlan")) {
    const insertBefore = "function togglePlan(planId: string)";
    const planDeleteFn = `
  async function deleteInstallmentPlan(transaction: Transaction) {
    if (!transaction.installment_plan_id) {
      setError("Esta parcela não pertence a uma compra parcelada.");
      return;
    }

    const confirmed = window.confirm(
      "Isso vai cancelar todas as parcelas desta compra no crédito. Deseja continuar?"
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

    if (source.includes(insertBefore)) {
      source = source.replace(insertBefore, `${planDeleteFn}${insertBefore}`);
      console.log("[cards-client] Função deleteInstallmentPlan adicionada.");
    } else {
      console.warn("[cards-client] Não encontrei togglePlan para inserir deleteInstallmentPlan.");
    }
  }

  if (!source.includes("Excluir compra inteira")) {
    const extraButton = `
                                  {transaction && transaction.installment_plan_id ? (
                                    <button
                                      className="btn btn-danger btn-soft-danger"
                                      type="button"
                                      onClick={() => deleteInstallmentPlan(transaction)}
                                    >
                                      Excluir compra inteira
                                    </button>
                                  ) : null}`;

    const exactPattern = /\{transaction \? <button type="button" onClick=\{\(\) => deleteInstallment\(transaction\)\}>Excluir<\/button> : null\}/;
    const classPattern = /\{transaction \? <button([^>]*)onClick=\{\(\) => deleteInstallment\(transaction\)\}([^>]*)>Excluir<\/button> : null\}/;

    if (exactPattern.test(source)) {
      source = source.replace(exactPattern, (match) => `${match}${extraButton}`);
      console.log("[cards-client] Botão 'Excluir compra inteira' adicionado após Excluir.");
    } else if (classPattern.test(source)) {
      source = source.replace(classPattern, (match) => `${match}${extraButton}`);
      console.log("[cards-client] Botão 'Excluir compra inteira' adicionado após Excluir.");
    } else {
      console.warn(
        "[cards-client] Não encontrei o botão individual 'Excluir' para adicionar o botão de compra inteira automaticamente."
      );
    }
  }

  if (source !== original) {
    write(cardsClientPath, source);
  } else {
    console.log("[cards-client] Nenhuma alteração necessária.");
  }
}

patchCardsClient();
