#!/usr/bin/env node
import fs from "fs";
import path from "path";

const root = process.cwd();
const file = path.join(root, "src", "components", "transactions", "transactions-client.tsx");

if (!fs.existsSync(file)) {
  console.error("Arquivo não encontrado:", path.relative(root, file));
  console.error("Rode este script na raiz do projeto UltimatePlanner.");
  process.exit(1);
}

const backup = `${file}.backup-before-transactions-handler-fix`;
let text = fs.readFileSync(file, "utf8");
const original = text;

if (!fs.existsSync(backup)) {
  fs.writeFileSync(backup, original, "utf8");
  console.log("Backup criado:", path.relative(root, backup));
}

/**
 * A tela src/components/transactions/transactions-client.tsx é de parcelamentos no DÉBITO.
 * O handler real existente nesse componente é handleDeleteDebitPlan(plan).
 *
 * Remove o handler inexistente handleDeleteInstallmentPlan, que foi introduzido por patch anterior.
 */
text = text.replace(
  /onClick=\{\(\)\s*=>\s*handleDeleteInstallmentPlan\?\.\(plan\.id\)\}/g,
  "onClick={() => handleDeleteDebitPlan(plan)}"
);

text = text.replace(
  /onClick=\{\(\)\s*=>\s*handleDeleteInstallmentPlan\(plan\.id\)\}/g,
  "onClick={() => handleDeleteDebitPlan(plan)}"
);

text = text.replace(
  /onClick=\{\(\)\s*=>\s*deleteInstallmentPlan\(plan\.id\)\}/g,
  "onClick={() => handleDeleteDebitPlan(plan)}"
);

/**
 * Ajusta o texto da ação. Em transações, a seção é de débito,
 * então o texto correto é "Excluir parcelamento".
 */
text = text.replace(/Excluir compra inteira/g, "Excluir parcelamento");

/**
 * Mantém o botão com classe existente do projeto.
 * Se o patch anterior deixou classe muito genérica ou de crédito, normaliza.
 */
text = text.replace(
  /className="btn btn-danger-soft installment-plan-summary btn-danger-summary"/g,
  'className="btn btn-danger-soft"'
);

text = text.replace(
  /className="badge badge-danger-action"/g,
  'className="btn btn-danger-soft"'
);

/**
 * Corrige possível botão sem type.
 */
text = text.replace(
  /<button\s+className="btn btn-danger-soft"\s+onClick=\{\(\)\s*=>\s*handleDeleteDebitPlan\(plan\)\}/g,
  '<button type="button" className="btn btn-danger-soft" onClick={() => handleDeleteDebitPlan(plan)}'
);

if (text === original) {
  console.log("Nenhuma alteração foi necessária. Talvez o arquivo já esteja corrigido.");
} else {
  fs.writeFileSync(file, text, "utf8");
  console.log("Corrigido:", path.relative(root, file));
  console.log("Agora rode: npm run build");
}
