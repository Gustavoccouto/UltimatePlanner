#!/usr/bin/env node
import fs from "fs";
import path from "path";

const root = process.cwd();
const findings = [];

function walk(dir) {
  if (!fs.existsSync(dir)) return [];

  const result = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".next", ".git"].includes(entry.name)) continue;

    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) result.push(...walk(full));
    else if (/\.(ts|tsx|js|mjs|sql)$/.test(entry.name)) result.push(full);
  }

  return result;
}

for (const file of walk(path.join(root, "src"))) {
  const text = fs.readFileSync(file, "utf8");
  const rel = path.relative(root, file);

  if (text.includes("paid_installments")) {
    findings.push(`${rel}: ainda contém paid_installments`);
  }

  if (/status:\s*["']deleted["']/.test(text)) {
    findings.push(`${rel}: usa status "deleted"; prefira is_deleted=true + status "archived" se houver check constraint`);
  }

  if (text.includes("allow_over_limit")) {
    findings.push(`${rel}: contém allow_over_limit; confira se limite do cartão deve ser bloqueio absoluto`);
  }

  if (/account_id[^;\n]*MovementForm/.test(text) === false && rel.endsWith("projects-client.tsx") && text.includes("movementForm.account_id")) {
    findings.push(`${rel}: usa movementForm.account_id; confira se MovementForm possui account_id`);
  }
}

if (findings.length) {
  console.log("Pré-check encontrou pontos para revisar:");
  for (const finding of findings) console.log("-", finding);
  process.exitCode = 1;
} else {
  console.log("Pré-check OK: nenhum alerta conhecido encontrado.");
}
