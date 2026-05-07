#!/usr/bin/env node
import fs from "fs";
import path from "path";

const root = process.cwd();

const cardsClientFile = path.join(root, "src", "components", "cards", "cards-client.tsx");
const purchaseRouteFile = path.join(root, "src", "app", "api", "cards", "purchases", "route.ts");

function backup(file, suffix) {
  if (!fs.existsSync(file)) return;

  const backupFile = `${file}.${suffix}`;

  if (!fs.existsSync(backupFile)) {
    fs.writeFileSync(backupFile, fs.readFileSync(file, "utf8"), "utf8");
    console.log("Backup criado:", path.relative(root, backupFile));
  }
}

function patchPurchaseRoute() {
  if (!fs.existsSync(purchaseRouteFile)) {
    console.log("Rota de compras no cartão não encontrada:", path.relative(root, purchaseRouteFile));
    return;
  }

  backup(purchaseRouteFile, "backup-before-hard-block-card-limit");

  let text = fs.readFileSync(purchaseRouteFile, "utf8");
  const original = text;

  /*
    Mesmo que algum frontend malicioso envie allow_over_limit: true,
    o backend deve bloquear. Regra final:
    sem crédito disponível, não salva.
  */
  text = text.replace(
    /if\s*\(\s*limitImpact\.exceeds_limit\s*&&\s*!payload\.allow_over_limit\s*\)\s*\{/g,
    "if (limitImpact.exceeds_limit) {"
  );

  text = text.replace(
    /over_limit_confirmed:\s*Boolean\(\s*payload\.allow_over_limit\s*&&\s*limitImpact\.exceeds_limit\s*\)/g,
    "over_limit_confirmed: false"
  );

  text = text.replace(
    /allow_over_limit:\s*z\.boolean\(\)\.optional\(\)\.default\(false\),?\n/g,
    ""
  );

  if (text !== original) {
    fs.writeFileSync(purchaseRouteFile, text, "utf8");
    console.log("Corrigido:", path.relative(root, purchaseRouteFile));
  } else {
    console.log("Nenhuma alteração necessária na rota de compras.");
  }
}

function patchCardsClient() {
  if (!fs.existsSync(cardsClientFile)) {
    console.log("cards-client.tsx não encontrado:", path.relative(root, cardsClientFile));
    return;
  }

  backup(cardsClientFile, "backup-before-hard-block-card-limit");

  let text = fs.readFileSync(cardsClientFile, "utf8");
  const original = text;

  /*
    Se a etapa 2 foi aplicada, ela adicionou retry com allow_over_limit.
    Removemos esse fluxo. Agora o erro aparece e nada é salvo.
  */
  const submitPurchaseHardBlock = `async function submitPurchase(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const payload = await requestJson<{ data: unknown; warning?: string | null }>("/api/cards/purchases", {
        method: "POST",
        body: JSON.stringify({
          ...purchaseForm,
          category_id: purchaseForm.category_id || findCategoryIdByName(categories, purchaseForm.category_name) || null,
          category_name: purchaseForm.category_name || null
        })
      });

      setMessage(payload.warning ? \`Compra lançada. \${payload.warning}\` : "Compra lançada e parcelamento criado.");
      closeModal();
      await refreshCardsData();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Erro ao lançar compra.");
    } finally {
      setLoading(false);
    }
  }

  async function submitInvoicePayment`;

  text = text.replace(
    /async function submitPurchase\(event: FormEvent\) \{[\s\S]*?\}\s*async function submitInvoicePayment/g,
    submitPurchaseHardBlock
  );

  /*
    Se restou qualquer allow_over_limit em cards-client, remove.
  */
  text = text.replace(/,\s*allow_over_limit:\s*true/g, "");
  text = text.replace(/allow_over_limit:\s*true,?\s*/g, "");

  if (text !== original) {
    fs.writeFileSync(cardsClientFile, text, "utf8");
    console.log("Corrigido:", path.relative(root, cardsClientFile));
  } else {
    console.log("Nenhuma alteração necessária no cards-client.");
  }
}

patchPurchaseRoute();
patchCardsClient();

console.log("");
console.log("Bloqueio absoluto de limite aplicado. Rode: npm run build && npm run dev");
