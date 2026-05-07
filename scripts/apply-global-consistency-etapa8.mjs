#!/usr/bin/env node
import fs from "fs";
import path from "path";

const root = process.cwd();

const targets = [
  path.join(root, "src", "app", "api", "accounts", "route.ts"),
  path.join(root, "src", "app", "api", "cards", "route.ts"),
  path.join(root, "src", "app", "api", "projects", "route.ts"),
  path.join(root, "src", "components", "dashboard", "dashboard-client.tsx")
];

function backup(file) {
  const backupFile = `${file}.backup-before-etapa8-consistency`;

  if (fs.existsSync(file) && !fs.existsSync(backupFile)) {
    fs.writeFileSync(backupFile, fs.readFileSync(file, "utf8"), "utf8");
    console.log("Backup criado:", path.relative(root, backupFile));
  }
}

function patchText(file, transform) {
  if (!fs.existsSync(file)) {
    console.log("Ignorado, não encontrado:", path.relative(root, file));
    return;
  }

  backup(file);

  const original = fs.readFileSync(file, "utf8");
  const next = transform(original);

  if (next !== original) {
    fs.writeFileSync(file, next, "utf8");
    console.log("Ajustado:", path.relative(root, file));
  } else {
    console.log("Sem alterações necessárias:", path.relative(root, file));
  }
}

/*
  1. Linguagem: para o usuário é Excluir.
  2. Banco: projetos continuam usando status interno permitido "archived".
  3. Dashboard: nunca mostra is_deleted/archived/canceled/deleted.
  4. Fetch de projetos no dashboard sem cache para Vercel/produção.
*/

patchText(targets[2], (text) => {
  let output = text;

  output = output.replace(/status:\s*"deleted"/g, 'status: "archived"');
  output = output.replace(/status:\s*'deleted'/g, "status: 'archived'");
  output = output.replace(/\(archived,canceled,deleted\)/g, "(archived,canceled)");
  output = output.replace(/\(archived, canceled, deleted\)/g, "(archived,canceled)");

  return output;
});

patchText(targets[3], (text) => {
  let output = text;

  output = output.replace(/fetch\("\/api\/projects"\)/g, 'fetch("/api/projects", { cache: "no-store" })');

  output = output.replace(
    /return !project\.is_deleted && !\["archived", "canceled"\]\.includes\(String\(project\.status \|\| "active"\)\);/g,
    'return !project.is_deleted && !["archived", "canceled", "deleted"].includes(String(project.status || "active").toLowerCase());'
  );

  return output;
});

for (const file of [targets[0], targets[1]]) {
  patchText(file, (text) => {
    let output = text;

    output = output.replace(/Arquivar/g, "Excluir");
    output = output.replace(/arquivar/g, "excluir");
    output = output.replace(/archived_history_preserved/g, "deleted_history_preserved");
    output = output.replace(/archived_installments_preserved_as_debt/g, "deleted_installments_preserved_as_debt");

    return output;
  });
}

console.log("");
console.log("Etapa 8 aplicada.");
console.log("Agora rode:");
console.log("npm run build");
console.log("npm run dev");
