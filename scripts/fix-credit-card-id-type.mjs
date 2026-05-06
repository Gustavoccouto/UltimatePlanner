#!/usr/bin/env node
import fs from "fs";
import path from "path";

const root = process.cwd();
const file = path.join(root, "src", "app", "api", "cards", "installments", "route.ts");

if (!fs.existsSync(file)) {
  console.error("Arquivo não encontrado:", path.relative(root, file));
  console.error("Rode este script na raiz do projeto UltimatePlanner.");
  process.exit(1);
}

const backup = `${file}.backup-before-credit-card-id-type-fix`;
let text = fs.readFileSync(file, "utf8");
const original = text;

if (!fs.existsSync(backup)) {
  fs.writeFileSync(backup, original, "utf8");
  console.log("Backup criado:", path.relative(root, backup));
}

/**
 * A função readCreditInstallmentTransaction valida que credit_card_id existe,
 * mas o TypeScript não consegue estreitar o tipo do objeto inteiro.
 *
 * Então adicionamos uma constante local tipada como string logo após:
 * const transaction = await readCreditInstallmentTransaction(...)
 */
text = text.replace(
  /const transaction = await readCreditInstallmentTransaction\(context, payload\.id\);\n\s*const previousBillingMonth/g,
  `const transaction = await readCreditInstallmentTransaction(context, payload.id);
    const creditCardId = transaction.credit_card_id;
    if (!creditCardId) {
      return jsonError("Esta parcela não está vinculada a um cartão.", 400);
    }

    const previousBillingMonth`
);

/**
 * Troca os usos em funções que exigem string.
 */
text = text.replaceAll(
  "recalculateInvoicesForCardMonths(context.supabase, context.user.id, transaction.credit_card_id,",
  "recalculateInvoicesForCardMonths(context.supabase, context.user.id, creditCardId,"
);

/**
 * Para inserts/updates, manter credit_card_id pode continuar aceitando null dependendo do schema.
 * Aqui também usamos a constante validada para evitar novos avisos.
 */
text = text.replaceAll(
  "credit_card_id: transaction.credit_card_id,",
  "credit_card_id: creditCardId,"
);

if (text === original) {
  console.log("Nenhuma alteração foi necessária. O arquivo talvez já esteja corrigido.");
} else {
  fs.writeFileSync(file, text, "utf8");
  console.log("Corrigido:", path.relative(root, file));
  console.log("Agora rode: npm run build");
}
