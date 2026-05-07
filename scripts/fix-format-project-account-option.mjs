#!/usr/bin/env node
import fs from "fs";
import path from "path";

const root = process.cwd();
const file = path.join(root, "src", "components", "projects", "projects-client.tsx");

if (!fs.existsSync(file)) {
  console.error("Arquivo não encontrado:", path.relative(root, file));
  process.exit(1);
}

const backup = `${file}.backup-before-format-project-account-option-fix`;
if (!fs.existsSync(backup)) {
  fs.writeFileSync(backup, fs.readFileSync(file, "utf8"), "utf8");
  console.log("Backup criado:", path.relative(root, backup));
}

let text = fs.readFileSync(file, "utf8");
const original = text;

const helper = `
function formatProjectAccountCurrency(value: unknown) {
  const parsed = Number(value || 0);
  const safeValue = Number.isFinite(parsed) ? parsed : 0;

  return safeValue.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function getProjectAccountBalance(account: {
  balance?: number | string | null;
  current_balance?: number | string | null;
  derived_balance?: number | string | null;
  initial_balance?: number | string | null;
}) {
  return (
    account.derived_balance ??
    account.current_balance ??
    account.balance ??
    account.initial_balance ??
    0
  );
}

function formatProjectAccountOption(account: {
  name?: string | null;
  balance?: number | string | null;
  current_balance?: number | string | null;
  derived_balance?: number | string | null;
  initial_balance?: number | string | null;
}) {
  return \`\${account.name || "Conta"} - \${formatProjectAccountCurrency(getProjectAccountBalance(account))} (saldo em conta)\`;
}

`;

if (!/function\s+formatProjectAccountOption\s*\(/.test(text)) {
  const componentIndex = text.indexOf("export function ProjectsClient");

  if (componentIndex !== -1) {
    text = `${text.slice(0, componentIndex)}${helper}${text.slice(componentIndex)}`;
  } else {
    const typeIndex = text.search(/type\s+\w+Props\s*=/);
    if (typeIndex !== -1) {
      text = `${text.slice(0, typeIndex)}${helper}${text.slice(typeIndex)}`;
    } else {
      text = `${helper}${text}`;
    }
  }
}

/*
  Garante que o select de conta use o helper, mas sem quebrar se já estiver certo.
*/
text = text.replace(
  /\{bundle\.accounts\.map\(\(account\) => <option value=\{account\.id\} key=\{account\.id\}>\{account\.name\}<\/option>\)\}/g,
  '{bundle.accounts.map((account) => <option value={account.id} key={account.id}>{formatProjectAccountOption(account)}</option>)}'
);

text = text.replace(
  /\{accounts\.map\(\(account\) => <option value=\{account\.id\} key=\{account\.id\}>\{account\.name\}<\/option>\)\}/g,
  '{accounts.map((account) => <option value={account.id} key={account.id}>{formatProjectAccountOption(account)}</option>)}'
);

if (text !== original) {
  fs.writeFileSync(file, text, "utf8");
  console.log("Corrigido:", path.relative(root, file));
} else {
  console.log("Nenhuma alteração necessária. O helper já existe.");
}

console.log("Agora rode:");
console.log("npm run build");
console.log("npm run dev");
