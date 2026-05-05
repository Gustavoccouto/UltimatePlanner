#!/usr/bin/env node
import fs from "fs";
import path from "path";

const root = process.cwd();
const file = path.join(root, "src", "components", "cards", "cards-client.tsx");

if (!fs.existsSync(file)) {
  console.error("Arquivo não encontrado:", path.relative(root, file));
  console.error("Rode este script na raiz do projeto UltimatePlanner.");
  process.exit(1);
}

const backup = `${file}.backup-before-build-fix`;
let text = fs.readFileSync(file, "utf8");
const original = text;

if (!fs.existsSync(backup)) {
  fs.writeFileSync(backup, text, "utf8");
  console.log("Backup criado:", path.relative(root, backup));
}

/**
 * 1) Corrige o erro de build causado por um bloco JSX vazio:
 *
 *   {transaction && transaction.installment_plan_id ? (
 * ) : null}
 *
 * ou variações parecidas deixadas pelo patch anterior.
 */
text = text.replace(
  /\n\s*\{\s*transaction\s*&&\s*transaction\.installment_plan_id\s*\?\s*\(\s*\n\s*\)\s*:\s*null\s*\}/g,
  ""
);

text = text.replace(
  /\n\s*\{\s*transaction\s*&&\s*transaction\.installment_plan_id\s*\?\s*\(\s*\)\s*:\s*null\s*\}/g,
  ""
);

/**
 * 2) Remove botão "Excluir compra inteira" das linhas da tabela.
 * Mantém ações individuais como Pagar, Adiantar, Editar e Excluir.
 */
function removeWholePurchaseButtonsFromRows(source) {
  let output = source;

  output = output.replace(
    /\n\s*<button\b(?=[\s\S]*?Excluir compra inteira)[\s\S]{0,900}?Excluir compra inteira[\s\S]{0,900}?<\/button>/g,
    (match) => {
      const looksLikeRowAction =
        /deleteInstallmentPlan|deletePlan|installment_plan|transaction|installment/i.test(match) &&
        !/Ver parcelas|Recolher detalhes|plan-header|installment-plan-header/i.test(match);

      return looksLikeRowAction ? "" : match;
    }
  );

  output = output.replace(
    /\n\s*\{[^{}]*(?:transaction|installment)[^{}]*\?\s*\(\s*<button\b[\s\S]{0,900}?Excluir compra inteira[\s\S]{0,900}?<\/button>\s*\)\s*:\s*null\s*\}/g,
    ""
  );

  output = output.replace(
    /\n\s*\{[^{}]*(?:transaction|installment)[^{}]*&&\s*<button\b[\s\S]{0,900}?Excluir compra inteira[\s\S]{0,900}?<\/button>\s*\}/g,
    ""
  );

  return output;
}

text = removeWholePurchaseButtonsFromRows(text);

/**
 * 3) Garante classe visual bonita para botões destrutivos, sem deixar botão quadrado padrão.
 */
text = text.replace(/className="link-button danger-text"/g, 'className="btn btn-danger-soft"');

/**
 * 4) Se não houver mais "Excluir compra inteira", tenta adicionar uma única vez
 * no cabeçalho do plano, logo após Ver parcelas/Recolher detalhes.
 *
 * Observação:
 * usamos uma chamada opcional para não quebrar caso o handler tenha outro nome.
 * Caso seu arquivo use outro handler, ajuste manualmente para a função existente.
 */
if (!/Excluir compra inteira/.test(text)) {
  const headerButtonRegex =
    /(<button\b[^>]*(?:toggle|expanded|plan|details|parcelas|detalhes)[^>]*>[\s\S]{0,240}?(?:Ver parcelas|Recolher detalhes)[\s\S]{0,240}?<\/button>)/i;

  if (headerButtonRegex.test(text)) {
    text = text.replace(
      headerButtonRegex,
      `$1

                              {typeof handleDeleteInstallmentPlan === "function" ? (
                                <button
                                  type="button"
                                  className="btn btn-danger-soft"
                                  onClick={() => handleDeleteInstallmentPlan(plan)}
                                >
                                  Excluir compra inteira
                                </button>
                              ) : null}`
    );
  }
}

/**
 * 5) Limpeza de linhas vazias excessivas.
 */
text = text.replace(/\n{4,}/g, "\n\n\n");

if (text === original) {
  console.log("Nenhuma alteração necessária. O arquivo já parece corrigido.");
} else {
  fs.writeFileSync(file, text, "utf8");
  console.log("Corrigido:", path.relative(root, file));
  console.log("Agora rode: npm run dev");
}
