#!/usr/bin/env node
import fs from "fs";
import path from "path";

const root = process.cwd();
const projectsRouteFile = path.join(root, "src", "app", "api", "projects", "route.ts");
const dashboardFile = path.join(root, "src", "components", "dashboard", "dashboard-client.tsx");

function backup(file, suffix) {
  if (!fs.existsSync(file)) return;

  const backupFile = `${file}.${suffix}`;
  if (!fs.existsSync(backupFile)) {
    fs.writeFileSync(backupFile, fs.readFileSync(file, "utf8"), "utf8");
    console.log("Backup criado:", path.relative(root, backupFile));
  }
}

function patchProjectsRoute() {
  if (!fs.existsSync(projectsRouteFile)) {
    console.error("Arquivo não encontrado:", path.relative(root, projectsRouteFile));
    process.exit(1);
  }

  backup(projectsRouteFile, "backup-before-project-delete-status-check-fix");

  let text = fs.readFileSync(projectsRouteFile, "utf8");
  const original = text;

  /*
    A tabela projects tem check constraint e não aceita status = "deleted".
    A exclusão deve ser soft delete:
      is_deleted = true
      status = "archived"  // valor já permitido pelo schema
    A UI continua mostrando "Excluir"; "archived" fica apenas como status interno seguro.
  */
  text = text.replace(/status:\s*"deleted"/g, 'status: "archived"');
  text = text.replace(/status:\s*'deleted'/g, "status: 'archived'");

  /*
    Se algum filtro foi deixado com deleted, não tem problema, mas removemos para evitar confusão.
  */
  text = text.replace(/\(archived,canceled,deleted\)/g, "(archived,canceled)");
  text = text.replace(/\(archived, canceled, deleted\)/g, "(archived,canceled)");

  /*
    Garante que o DELETE use is_deleted true e status permitido.
    Se o patch anterior tinha metadata de exclusão, preserva.
  */
  text = text.replace(
    /update\(\{\s*is_deleted:\s*true,\s*status:\s*"archived"\s*\}\)/g,
    'update({ is_deleted: true, status: "archived", metadata: { deleted_at: new Date().toISOString(), delete_source: "projects" } })'
  );

  if (text !== original) {
    fs.writeFileSync(projectsRouteFile, text, "utf8");
    console.log("Corrigido:", path.relative(root, projectsRouteFile));
  } else {
    console.log("Nenhuma alteração necessária na rota de projetos.");
  }
}

function patchDashboardDefensiveFilter() {
  if (!fs.existsSync(dashboardFile)) {
    console.log("Dashboard não encontrado, pulando:", path.relative(root, dashboardFile));
    return;
  }

  backup(dashboardFile, "backup-before-project-delete-status-check-fix");

  let text = fs.readFileSync(dashboardFile, "utf8");
  const original = text;

  /*
    Mantém o Dashboard sem mostrar projeto excluído.
    O status interno correto volta a ser archived, então archived precisa continuar fora.
  */
  text = text.replace(
    /\["archived", "canceled", "deleted", "excluded", "excluido", "excluído"\]\.includes\(status\)/g,
    '["archived", "canceled", "deleted", "excluded", "excluido", "excluído"].includes(status)'
  );

  if (text !== original) {
    fs.writeFileSync(dashboardFile, text, "utf8");
    console.log("Filtro defensivo mantido:", path.relative(root, dashboardFile));
  } else {
    console.log("Nenhuma alteração necessária no dashboard.");
  }
}

patchProjectsRoute();
patchDashboardDefensiveFilter();

console.log("");
console.log("Correção aplicada.");
console.log("Agora rode:");
console.log("npm run build");
console.log("npm run dev");
