#!/usr/bin/env node
import fs from "fs";
import path from "path";

const root = process.cwd();

const files = [
  {
    name: "cards-client",
    file: path.join(root, "src", "components", "cards", "cards-client.tsx"),
    hasCategories: true,
    hasTransactions: true
  },
  {
    name: "transactions-client",
    file: path.join(root, "src", "components", "transactions", "transactions-client.tsx"),
    hasCategories: true,
    hasTransactions: true
  },
  {
    name: "projects-client",
    file: path.join(root, "src", "components", "projects", "projects-client.tsx"),
    hasProjectCategories: true
  }
];

function backup(file, suffix) {
  if (!fs.existsSync(file)) return;

  const backupFile = `${file}.${suffix}`;

  if (!fs.existsSync(backupFile)) {
    fs.writeFileSync(backupFile, fs.readFileSync(file, "utf8"), "utf8");
    console.log("Backup criado:", path.relative(root, backupFile));
  }
}

function addListAttributeToCategoryInputs(text) {
  return text.replace(
    /<input(?![^>]*\blist=)([^>]*(category_name|categoryName|category)[^>]*)>/g,
    (match, attrs) => {
      if (/type=["'](?:hidden|checkbox|radio)["']/.test(attrs)) return match;
      return `<input list="finance-category-suggestions"${attrs}>`;
    }
  );
}

function addListAttributeToDescriptionInputs(text) {
  return text.replace(
    /<input(?![^>]*\blist=)([^>]*(description|Description)[^>]*)>/g,
    (match, attrs) => {
      if (/type=["'](?:hidden|checkbox|radio|number|date|month)["']/.test(attrs)) return match;
      if (attrs.includes("finance-description-suggestions")) return match;
      return `<input list="finance-description-suggestions"${attrs}>`;
    }
  );
}

function patchReturnDatalists(text, config) {
  if (text.includes("finance-category-suggestions") && text.includes("finance-description-suggestions")) {
    return text;
  }

  const datalists = [];

  if (config.hasCategories && !text.includes('<datalist id="finance-category-suggestions"')) {
    datalists.push(`      <datalist id="finance-category-suggestions">
        {(categories || []).map((category) => (
          <option value={category.name} key={category.id} />
        ))}
      </datalist>`);
  }

  if (config.hasTransactions && !text.includes('<datalist id="finance-description-suggestions"')) {
    datalists.push(`      <datalist id="finance-description-suggestions">
        {Array.from(new Set((transactions || []).map((transaction) => transaction.description).filter(Boolean))).slice(0, 40).map((description) => (
          <option value={String(description)} key={String(description)} />
        ))}
      </datalist>`);
  }

  if (config.hasProjectCategories && !text.includes('<datalist id="finance-category-suggestions"')) {
    datalists.push(`      <datalist id="finance-category-suggestions">
        {Array.from(new Set((selectedItems || []).map((item) => metadataValue(item, "category")).filter(Boolean))).slice(0, 40).map((category) => (
          <option value={String(category)} key={String(category)} />
        ))}
      </datalist>`);
  }

  if (!datalists.length) return text;

  /*
    Insere os datalists logo depois da primeira div do return do componente.
    É propositalmente simples para não alterar layout.
  */
  return text.replace(
    /return\s*\(\s*<div([^>]*)>/,
    (match, attrs) => `return (
    <div${attrs}>
${datalists.join("\n")}`
  );
}

function patchFile(config) {
  if (!fs.existsSync(config.file)) {
    console.log("Ignorado, não encontrado:", path.relative(root, config.file));
    return;
  }

  backup(config.file, "backup-before-smart-autocomplete");
  let text = fs.readFileSync(config.file, "utf8");
  const original = text;

  text = addListAttributeToCategoryInputs(text);
  text = addListAttributeToDescriptionInputs(text);
  text = patchReturnDatalists(text, config);

  /*
    Proteção de build: se o patch adicionou selectedItems/metadataValue em arquivo que não tem essas variáveis,
    remove só o datalist de projetos.
  */
  if (config.hasProjectCategories && (!text.includes("selectedItems") || !text.includes("metadataValue"))) {
    text = text.replace(
      /\s*<datalist id="finance-category-suggestions">[\s\S]*?<\/datalist>/,
      ""
    );
  }

  if (text !== original) {
    fs.writeFileSync(config.file, text, "utf8");
    console.log("Ajustado:", path.relative(root, config.file));
  } else {
    console.log("Sem alterações necessárias:", path.relative(root, config.file));
  }
}

for (const config of files) patchFile(config);

console.log("");
console.log("Autocomplete leve aplicado.");
console.log("Rode:");
console.log("npm run build");
console.log("npm run dev");
