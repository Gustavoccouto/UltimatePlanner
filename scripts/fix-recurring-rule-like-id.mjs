#!/usr/bin/env node
import fs from "fs";
import path from "path";

const root = process.cwd();
const planningFile = path.join(root, "src", "lib", "server", "planning.ts");
const routeFile = path.join(root, "src", "app", "api", "recurring-rules", "route.ts");

function backup(file, suffix) {
  if (!fs.existsSync(file)) return;

  const backupFile = `${file}.${suffix}`;
  if (!fs.existsSync(backupFile)) {
    fs.writeFileSync(backupFile, fs.readFileSync(file, "utf8"), "utf8");
    console.log("Backup criado:", path.relative(root, backupFile));
  }
}

function patchPlanning() {
  if (!fs.existsSync(planningFile)) {
    console.log("Ignorado, não encontrado:", path.relative(root, planningFile));
    return;
  }

  backup(planningFile, "backup-before-recurring-rule-like-id-fix");

  let text = fs.readFileSync(planningFile, "utf8");
  const original = text;

  /*
    Erro:
    record ainda não tem id antes do insert, mas RecurringRuleLike exigia id.
    Correção:
    id passa a ser opcional para validação de limite antes de salvar.
  */

  text = text.replace(
    /type RecurringRuleLike = Pick<\s*RecurringRule,\s*\|\s*"id"\s*\|([\s\S]*?)>;/,
    `type RecurringRuleLike = Pick<
  RecurringRule,
$1> & {
  id?: string | null;
};`
  );

  /*
    Fallback para variações de formatação:
    remove a linha | "id" dentro do Pick e acrescenta id opcional.
  */
  if (text === original && text.includes("type RecurringRuleLike = Pick<")) {
    text = text.replace(/\n\s*\|\s*"id"/, "");
    text = text.replace(/type RecurringRuleLike = Pick<([\s\S]*?)>;/, "type RecurringRuleLike = Pick<$1> & {\n  id?: string | null;\n};");
  }

  if (text !== original) {
    fs.writeFileSync(planningFile, text, "utf8");
    console.log("Corrigido:", path.relative(root, planningFile));
  } else {
    console.log("Nenhuma alteração automática em planning.ts. Talvez já esteja corrigido.");
  }
}

function patchRouteFallback() {
  if (!fs.existsSync(routeFile)) {
    console.log("Ignorado, não encontrado:", path.relative(root, routeFile));
    return;
  }

  backup(routeFile, "backup-before-recurring-rule-like-id-fix");

  let text = fs.readFileSync(routeFile, "utf8");
  const original = text;

  /*
    Fallback defensivo:
    se por algum motivo o tipo do planning continuar rígido, o record de criação recebe id null.
    Isso não vai para o banco como coluna extra problemática, porque id é uma coluna válida e null deixa o banco gerar uuid/default quando houver default.
    Porém só aplicamos se o erro persistir e se ainda não houver id no buildRecord.
  */
  text = text.replace(
    /return \{\s*owner_id: ownerId,/,
    "return {\n    id: payload.id || null,\n    owner_id: ownerId,"
  );

  if (text !== original) {
    fs.writeFileSync(routeFile, text, "utf8");
    console.log("Fallback aplicado:", path.relative(root, routeFile));
  } else {
    console.log("Nenhum fallback necessário em route.ts.");
  }
}

patchPlanning();

/*
  Normalmente só planning.ts resolve.
  Não aplico fallback na rota automaticamente para evitar mexer no insert do banco sem necessidade.
  Caso ainda dê erro depois, rode este script com:
    node scripts/fix-recurring-rule-like-id.mjs --with-route-fallback
*/
if (process.argv.includes("--with-route-fallback")) {
  patchRouteFallback();
}

console.log("");
console.log("Agora rode:");
console.log("npm run build");
console.log("npm run dev");
