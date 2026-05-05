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

const backup = `${file}.backup-before-delete-plan-handler-fix`;
let text = fs.readFileSync(file, "utf8");
const original = text;

if (!fs.existsSync(backup)) {
  fs.writeFileSync(backup, original, "utf8");
  console.log("Backup criado:", path.relative(root, backup));
}

/**
 * Corrige o erro:
 * Cannot find name 'handleDeleteInstallmentPlan'. Did you mean 'deleteInstallmentPlan'?
 *
 * O handler real criado nos patches anteriores é deleteInstallmentPlan.
 * O botão do cabeçalho ficou chamando um nome antigo/inexistente.
 */
text = text.replaceAll("handleDeleteInstallmentPlan?.(plan.id)", "deleteInstallmentPlan(plan.id)");
text = text.replaceAll("handleDeleteInstallmentPlan?.(plan)", "deleteInstallmentPlan(plan.id)");
text = text.replaceAll("handleDeleteInstallmentPlan(plan.id)", "deleteInstallmentPlan(plan.id)");
text = text.replaceAll("handleDeleteInstallmentPlan(plan)", "deleteInstallmentPlan(plan.id)");

/**
 * Se o botão ficou com className duplicado ou visual errado, mantém o padrão badge vermelho
 * solicitado pelo usuário.
 */
text = text.replace(
  /className="btn btn-danger-soft installment-plan-summary btn-danger-summary"/g,
  'className="badge badge-danger-action"'
);

text = text.replace(
  /className="btn btn-danger-soft btn-danger-summary"/g,
  'className="badge badge-danger-action"'
);

/**
 * Garante que o botão destrutivo do plano não submeta formulário por acidente.
 */
text = text.replace(
  /<button\s+className="badge badge-danger-action"\s+onClick=\{\(\) => deleteInstallmentPlan\(plan\.id\)\}/g,
  '<button type="button" className="badge badge-danger-action" onClick={() => deleteInstallmentPlan(plan.id)}'
);

text = text.replace(
  /<button\s+type="button"\s+className="badge badge-danger-action"\s+onClick=\{\(\) => deleteInstallmentPlan\(plan\.id\)\}/g,
  '<button type="button" className="badge badge-danger-action" onClick={() => deleteInstallmentPlan(plan.id)}'
);

/**
 * Se o arquivo ainda não tiver o CSS do badge vermelho, adiciona instrução via comentário
 * para evitar alterar escopo demais aqui. O CSS global deve estar em src/app/ux-polish.css.
 */
if (text === original) {
  console.log("Nenhuma substituição foi necessária. Verifique se o erro já foi corrigido.");
} else {
  fs.writeFileSync(file, text, "utf8");
  console.log("Corrigido:", path.relative(root, file));
  console.log("Agora rode: npm run build");
}
