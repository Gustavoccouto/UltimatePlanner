#!/usr/bin/env node
import fs from "fs";
import path from "path";

const root = process.cwd();
const file = path.join(root, "src", "components", "projects", "projects-client.tsx");

if (!fs.existsSync(file)) {
  console.error("Arquivo não encontrado:", path.relative(root, file));
  process.exit(1);
}

const backup = `${file}.backup-before-accounts-prop-fix`;
if (!fs.existsSync(backup)) {
  fs.writeFileSync(backup, fs.readFileSync(file, "utf8"), "utf8");
  console.log("Backup criado:", path.relative(root, backup));
}

let text = fs.readFileSync(file, "utf8");
const original = text;

// 1) Garante import do tipo Account.
text = text.replace(
  /import type \{([^}]+)\} from ["']@\/lib\/domain\/app-types["'];/,
  (match, names) => {
    const parts = names
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean);

    if (!parts.includes("Account")) parts.unshift("Account");

    return `import type { ${Array.from(new Set(parts)).join(", ")} } from "@/lib/domain/app-types";`;
  }
);

// 2) Se por algum motivo não encontrou o import agrupado, adiciona uma linha separada.
const firstLines = text.split("\n").slice(0, 40).join("\n");
if (!firstLines.includes("Account")) {
  text = `import type { Account } from "@/lib/domain/app-types";\n${text}`;
}

// 3) Adiciona accounts ao tipo/interface Bundle.
text = text.replace(
  /(profiles\s*:\s*Profile\[\]\s*;\s*)(currentUserId\s*:\s*string\s*;)/g,
  "$1accounts: Account[];\n  $2"
);

text = text.replace(
  /(profiles\s*:\s*Profile\[\]\s*,\s*)(currentUserId\s*:\s*string\s*,?)/g,
  "$1accounts: Account[], $2"
);

// 4) Caso esteja sem ponto e vírgula.
text = text.replace(
  /(profiles\s*:\s*Profile\[\]\s*)(\n\s*currentUserId\s*:)/g,
  (match, before, after) => {
    if (match.includes("accounts")) return match;
    return `${before};\n  accounts: Account[];${after}`;
  }
);

// 5) Garante que a desestruturação do componente receba accounts.
text = text.replace(
  /export function ProjectsClient\(\{([\s\S]*?)currentUserId([\s\S]*?)\}: Bundle\)/,
  (match, before, after) => {
    if (before.includes("accounts") || after.includes("accounts")) return match;
    return `export function ProjectsClient({${before}accounts,\n  currentUserId${after}}: Bundle)`;
  }
);

// 6) Garante que objetos locais com profiles/currentUserId também tenham accounts.
text = text.replace(
  /(profiles\s*,\s*)(currentUserId\s*[,}])/g,
  (match, before, after) => {
    if (match.includes("accounts")) return match;
    return `${before}accounts,\n    ${after}`;
  }
);

text = text.replace(
  /(profiles:\s*profiles\s*,\s*)(currentUserId\s*[,}])/g,
  "$1accounts,\n    $2"
);

text = text.replace(
  /(profiles\s*:\s*profiles\s*\|\|\s*\[\]\s*,\s*)(currentUserId\s*:)/g,
  "$1accounts: accounts || [],\n    $2"
);

text = text.replace(
  /(profiles\s*:\s*profiles\s*,\s*)(currentUserId\s*:)/g,
  "$1accounts,\n    $2"
);

// 7) Fallback seguro para runtime.
text = text.replace(/bundle\.accounts\.map/g, "(bundle.accounts || []).map");

if (text !== original) {
  fs.writeFileSync(file, text, "utf8");
  console.log("Corrigido:", path.relative(root, file));
} else {
  console.log("Nenhuma alteração automática feita. Talvez o arquivo já esteja corrigido.");
}

console.log("");
console.log("Agora rode:");
console.log("npm run build");
