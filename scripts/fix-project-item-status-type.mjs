#!/usr/bin/env node
import fs from "fs";
import path from "path";

const root = process.cwd();
const file = path.join(root, "src", "app", "api", "projects", "items", "route.ts");

if (!fs.existsSync(file)) {
  console.error("Arquivo não encontrado:", path.relative(root, file));
  process.exit(1);
}

const backup = `${file}.backup-before-project-item-status-type-fix`;
if (!fs.existsSync(backup)) {
  fs.writeFileSync(backup, fs.readFileSync(file, "utf8"), "utf8");
  console.log("Backup criado:", path.relative(root, backup));
}

let text = fs.readFileSync(file, "utf8");
const original = text;

/*
  Corrige o narrowing do TypeScript:
  quando o código usa:
    if (nextStatus === "completed") { ... }
    else if (previousStatus === "completed" && nextStatus !== "completed") { ... }

  o TS entende que, no else, nextStatus já não pode ser "completed",
  então a comparação nextStatus !== "completed" vira redundante/impossível.
*/

text = text.replace(
  /const previousStatus = String\(existing\.status \|\| "pending"\);\s*const nextStatus = payload\.status;/,
  'const previousStatus = String(existing.status || "pending");\n    const nextStatus: "pending" | "completed" | "canceled" = payload.status;'
);

text = text.replace(
  /else if \(previousStatus === "completed" && nextStatus !== "completed"\) \{/g,
  'else if (previousStatus === "completed") {'
);

/*
  Fallback caso o arquivo tenha sido formatado diferente.
*/
text = text.replace(
  /else if \(previousStatus === ['"]completed['"] && nextStatus !== ['"]completed['"]\) \{/g,
  'else if (previousStatus === "completed") {'
);

if (text !== original) {
  fs.writeFileSync(file, text, "utf8");
  console.log("Corrigido:", path.relative(root, file));
} else {
  console.log("Nenhuma alteração automática feita. Talvez o arquivo já esteja corrigido ou diferente do esperado.");
}

console.log("");
console.log("Agora rode:");
console.log("npm run build");
console.log("npm run dev");
