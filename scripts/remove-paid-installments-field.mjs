#!/usr/bin/env node
import fs from "fs";
import path from "path";

const root = process.cwd();

const targets = [
  path.join(root, "src", "app", "api", "transactions", "route.ts"),
  path.join(root, "src", "app", "api", "cards", "installments", "route.ts"),
  path.join(root, "src", "lib", "server", "card-ledger.ts")
];

function backup(file) {
  const backupFile = `${file}.backup-before-remove-paid-installments`;

  if (!fs.existsSync(backupFile)) {
    fs.writeFileSync(backupFile, fs.readFileSync(file, "utf8"), "utf8");
    console.log("Backup criado:", path.relative(root, backupFile));
  }
}

function removePaidInstallmentsField(text) {
  let output = text;

  /*
    Remove linhas em objetos JS/TS:
      paid_installments: 0,
      paid_installments: paidInstallments,
  */
  output = output.replace(/^\s*paid_installments\s*:\s*[^,\n]+,\s*\n/gm, "");

  /*
    Remove linhas sem vírgula final, se estiverem no fim do objeto.
  */
  output = output.replace(/,\s*\n\s*paid_installments\s*:\s*[^,\n]+(\s*\n\s*[}\]])/gm, "$1");

  /*
    Remove updates SQL em strings/template strings, caso algum script tenha ficado dentro de src:
      paid_installments = 0,
      paid_installments = greatest(...),
  */
  output = output.replace(/^\s*paid_installments\s*=\s*[^,\n]+,\s*\n/gm, "");

  return output;
}

let changed = 0;

for (const file of targets) {
  if (!fs.existsSync(file)) {
    console.log("Ignorado, não encontrado:", path.relative(root, file));
    continue;
  }

  const original = fs.readFileSync(file, "utf8");
  const patched = removePaidInstallmentsField(original);

  if (patched !== original) {
    backup(file);
    fs.writeFileSync(file, patched, "utf8");
    changed += 1;
    console.log("Corrigido:", path.relative(root, file));
  } else {
    console.log("Sem paid_installments para remover:", path.relative(root, file));
  }
}

/*
  Varredura extra opcional: avisa onde ainda existe paid_installments em src.
*/
function walk(dir) {
  if (!fs.existsSync(dir)) return [];

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (["node_modules", ".next", ".git"].includes(entry.name)) continue;
      files.push(...walk(full));
    } else if (/\.(ts|tsx|js|mjs|sql)$/.test(entry.name)) {
      files.push(full);
    }
  }

  return files;
}

const remaining = walk(path.join(root, "src")).filter((file) =>
  fs.readFileSync(file, "utf8").includes("paid_installments")
);

if (remaining.length) {
  console.log("");
  console.log("Ainda existem referências a paid_installments para revisar:");
  for (const file of remaining) {
    console.log("-", path.relative(root, file));
  }
} else {
  console.log("");
  console.log("Nenhuma referência a paid_installments restante em src.");
}

console.log("");
console.log(changed ? "Pronto. Rode: npm run build && npm run dev" : "Nada foi alterado.");
