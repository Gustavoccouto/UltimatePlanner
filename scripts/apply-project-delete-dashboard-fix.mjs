#!/usr/bin/env node
import fs from "fs";
import path from "path";

const root = process.cwd();

const dashboardFile = path.join(root, "src", "components", "dashboard", "dashboard-client.tsx");
const projectsClientFile = path.join(root, "src", "components", "projects", "projects-client.tsx");
const projectsRouteFile = path.join(root, "src", "app", "api", "projects", "route.ts");

function backup(file, suffix) {
  if (!fs.existsSync(file)) return;

  const backupFile = `${file}.${suffix}`;
  if (!fs.existsSync(backupFile)) {
    fs.writeFileSync(backupFile, fs.readFileSync(file, "utf8"), "utf8");
    console.log("Backup criado:", path.relative(root, backupFile));
  }
}

function patchDashboard() {
  if (!fs.existsSync(dashboardFile)) {
    console.log("Dashboard não encontrado:", path.relative(root, dashboardFile));
    return;
  }

  backup(dashboardFile, "backup-before-projects-delete-dashboard-fix");

  let text = fs.readFileSync(dashboardFile, "utf8");
  const original = text;

  /*
    Depois de excluir projeto, ele não deve aparecer nem por snapshot antigo nem por payload de /api/projects.
    Esta função fica mais rígida e considera status/metadata também.
  */
  text = text.replace(
    /function activeDashboardProjects\(projects: ProjectDashboardProject\[\]\) \{\s*return projects\.filter\(\(project\) => \{\s*return !project\.is_deleted && !\["archived", "canceled"\]\.includes\(String\(project\.status \|\| "active"\)\);\s*\}\);\s*\}/,
    `function activeDashboardProjects(projects: ProjectDashboardProject[]) {
  return projects.filter((project) => {
    const status = String(project.status || "active").toLowerCase();
    const metadata = project && typeof (project as any).metadata === "object" && !Array.isArray((project as any).metadata)
      ? ((project as any).metadata as Record<string, unknown>)
      : {};
    const deletedByMetadata = metadata.deleted === true || metadata.is_deleted === true || Boolean(metadata.deleted_at);

    return !project.is_deleted && !deletedByMetadata && !["archived", "canceled", "deleted", "excluded", "excluido", "excluído"].includes(status);
  });
}`
  );

  /*
    Se houver fetch de /api/projects, força leitura fresca para não aparecer projeto excluído por cache.
  */
  text = text.replace(
    /fetch\("\/api\/projects"\)/g,
    'fetch("/api/projects", { cache: "no-store" })'
  );

  if (text !== original) {
    fs.writeFileSync(dashboardFile, text, "utf8");
    console.log("Ajustado:", path.relative(root, dashboardFile));
  } else {
    console.log("Nenhuma alteração necessária no dashboard.");
  }
}

function patchProjectsClient() {
  if (!fs.existsSync(projectsClientFile)) {
    console.log("Projects client não encontrado:", path.relative(root, projectsClientFile));
    return;
  }

  backup(projectsClientFile, "backup-before-projects-delete-dashboard-fix");

  let text = fs.readFileSync(projectsClientFile, "utf8");
  const original = text;

  /*
    Troca só a linguagem visível. A ação pode continuar chamando a mesma função de delete/archive,
    mas para o usuário deve ser Excluir.
  */
  const replacements = [
    [/Arquivar projeto/g, "Excluir projeto"],
    [/Arquivar Projeto/g, "Excluir Projeto"],
    [/>Arquivar</g, ">Excluir<"],
    [/>Arquivar projeto</g, ">Excluir projeto<"],
    [/aria-label="Arquivar projeto"/g, 'aria-label="Excluir projeto"'],
    [/title="Arquivar projeto"/g, 'title="Excluir projeto"'],
    [/Projeto arquivado/g, "Projeto excluído"],
    [/projeto arquivado/g, "projeto excluído"],
    [/arquivado com sucesso/g, "excluído com sucesso"],
    [/Arquivado/g, "Excluído"],
    [/arquivado/g, "excluído"],
    [/arquivar este projeto/g, "excluir este projeto"],
    [/arquivar o projeto/g, "excluir o projeto"],
    [/arquivar projeto/g, "excluir projeto"],
    [/Arquivar este projeto/g, "Excluir este projeto"]
  ];

  for (const [pattern, replacement] of replacements) {
    text = text.replace(pattern, replacement);
  }

  /*
    Se o confirm ainda fala em arquivar, deixa claro que some do Dashboard.
  */
  text = text.replace(
    /confirm\("Deseja excluir este projeto\?"\)/g,
    'confirm("Deseja excluir este projeto? Ele não aparecerá mais em Projetos nem no Dashboard.")'
  );

  text = text.replace(
    /confirm\("Tem certeza que deseja excluir este projeto\?"\)/g,
    'confirm("Tem certeza que deseja excluir este projeto? Ele não aparecerá mais em Projetos nem no Dashboard.")'
  );

  /*
    Após excluir, remove localmente do state para sumir sem esperar cache/reload.
    Patch conservador: tenta encontrar mensagem de sucesso e injeta remoção local se existir selectedProject.
  */
  if (!text.includes("removeDeletedProjectLocally")) {
    const helper = `
  function removeDeletedProjectLocally(projectId: string) {
    setBundle((current) => ({
      ...current,
      projects: current.projects.filter((project) => project.id !== projectId),
      items: current.items.filter((item) => item.project_id !== projectId),
      movements: current.movements.filter((movement) => movement.project_id !== projectId),
      shares: current.shares.filter((share) => share.item_id !== projectId)
    }));

    setSelectedProjectId((current) => (current === projectId ? "" : current));
  }

`;
    text = text.replace(/(\s+async function reload\(\) \{)/, `${helper}$1`);
  }

  text = text.replace(
    /setMessage\("Projeto excluído\."\);\s*await reload\(\);/g,
    'removeDeletedProjectLocally(payload.id); setMessage("Projeto excluído."); await reload();'
  );

  text = text.replace(
    /setMessage\("Projeto excluído com sucesso\."\);\s*await reload\(\);/g,
    'removeDeletedProjectLocally(payload.id); setMessage("Projeto excluído com sucesso."); await reload();'
  );

  if (text !== original) {
    fs.writeFileSync(projectsClientFile, text, "utf8");
    console.log("Ajustado:", path.relative(root, projectsClientFile));
  } else {
    console.log("Nenhuma alteração necessária no projects-client.");
  }
}

function patchProjectsRoute() {
  if (!fs.existsSync(projectsRouteFile)) {
    console.log("Projects route não encontrada:", path.relative(root, projectsRouteFile));
    return;
  }

  backup(projectsRouteFile, "backup-before-projects-delete-dashboard-fix");

  let text = fs.readFileSync(projectsRouteFile, "utf8");
  const original = text;

  /*
    Reforça o GET para nunca devolver arquivados/cancelados/excluídos.
  */
  text = text.replace(
    /context\.supabase\.from\("projects"\)\.select\("\*"\)\.eq\("is_deleted", false\)\.order\("created_at", \{ ascending: true \}\)/g,
    'context.supabase.from("projects").select("*").eq("is_deleted", false).not("status", "in", "(archived,canceled,deleted)").order("created_at", { ascending: true })'
  );

  text = text.replace(
    /context\.supabase\.from\("projects"\)\.select\("\*"\)\.eq\("is_deleted", false\)\.order\("created_at", \{ ascending: false \}\)/g,
    'context.supabase.from("projects").select("*").eq("is_deleted", false).not("status", "in", "(archived,canceled,deleted)").order("created_at", { ascending: false })'
  );

  /*
    No DELETE, status não deve mais ser archived, porque para usuário isso confunde.
    Usa deleted/canceled e is_deleted true.
  */
  text = text.replace(
    /update\(\{ is_deleted: true, status: "archived" \}\)/g,
    'update({ is_deleted: true, status: "deleted", metadata: { deleted_at: new Date().toISOString(), delete_source: "projects" } })'
  );

  text = text.replace(
    /actionType: "project_deleted"/g,
    'actionType: "project_deleted"'
  );

  if (text !== original) {
    fs.writeFileSync(projectsRouteFile, text, "utf8");
    console.log("Ajustado:", path.relative(root, projectsRouteFile));
  } else {
    console.log("Nenhuma alteração necessária na route de projects.");
  }
}

patchDashboard();
patchProjectsClient();
patchProjectsRoute();

console.log("");
console.log("Correção aplicada. Rode:");
console.log("npm run build");
console.log("npm run dev");
