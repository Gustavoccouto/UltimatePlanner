#!/usr/bin/env node
import fs from "fs";
import path from "path";

const root = process.cwd();

const files = {
  projectsClient: path.join(root, "src", "components", "projects", "projects-client.tsx"),
  projectsPage: path.join(root, "src", "app", "(app)", "projects", "page.tsx"),
  projectItemsRoute: path.join(root, "src", "app", "api", "projects", "items", "route.ts"),
  planningServer: path.join(root, "src", "lib", "server", "planning.ts")
};

function backup(file, suffix) {
  if (!fs.existsSync(file)) return;

  const backupFile = `${file}.${suffix}`;
  if (!fs.existsSync(backupFile)) {
    fs.writeFileSync(backupFile, fs.readFileSync(file, "utf8"), "utf8");
    console.log("Backup criado:", path.relative(root, backupFile));
  }
}

function patchProjectsClient() {
  const file = files.projectsClient;

  if (!fs.existsSync(file)) {
    console.log("Ignorado, não encontrado:", path.relative(root, file));
    return;
  }

  backup(file, "backup-before-vercel-type-hardening");

  let text = fs.readFileSync(file, "utf8");
  const original = text;

  /*
    1) Corrige o erro atual do Vercel:
       Property 'account_id' does not exist on type 'MovementForm'.
  */
  text = text.replace(
    /type\s+MovementForm\s*=\s*\{\s*project_id:\s*string;\s*type:\s*"add"\s*\|\s*"remove";\s*amount:\s*string;\s*description:\s*string;\s*\};/g,
    'type MovementForm = { project_id: string; account_id: string; type: "add" | "remove"; amount: string; description: string; };'
  );

  text = text.replace(
    /type\s+MovementForm\s*=\s*\{\s*project_id:\s*string;\s*type:\s*"add"\s*\|\s*"remove"\s*\|\s*"adjust";\s*amount:\s*string;\s*description:\s*string;\s*\};/g,
    'type MovementForm = { project_id: string; account_id: string; type: "add" | "remove" | "adjust"; amount: string; description: string; };'
  );

  /*
    Fallback para formatações multi-line do MovementForm.
  */
  text = text.replace(
    /type\s+MovementForm\s*=\s*\{([\s\S]*?)\};/g,
    (match, body) => {
      if (body.includes("account_id")) return match;
      if (!body.includes("project_id") || !body.includes("amount") || !body.includes("description")) return match;

      return `type MovementForm = {${body.replace(/project_id:\s*string;/, "project_id: string;\n  account_id: string;")}};`;
    }
  );

  /*
    2) Garante que o form inicial tenha account_id.
  */
  text = text.replace(
    /const\s+emptyMovementForm:\s*MovementForm\s*=\s*\{\s*project_id:\s*"",\s*type:\s*"add",\s*amount:\s*"0",\s*description:\s*""\s*\};/g,
    'const emptyMovementForm: MovementForm = { project_id: "", account_id: "", type: "add", amount: "0", description: "" };'
  );

  text = text.replace(
    /const\s+emptyMovementForm:\s*MovementForm\s*=\s*\{([\s\S]*?)\};/g,
    (match, body) => {
      if (body.includes("account_id")) return match;
      return `const emptyMovementForm: MovementForm = {${body.replace(/project_id:\s*""\s*,/, 'project_id: "", account_id: "",')}};`;
    }
  );

  /*
    3) Garante que Account exista no import de tipos e Bundle aceite accounts.
  */
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

  const firstLines = text.split("\n").slice(0, 50).join("\n");
  if (!firstLines.includes("Account")) {
    text = `import type { Account } from "@/lib/domain/app-types";\n${text}`;
  }

  text = text.replace(
    /(profiles\s*:\s*Profile\[\]\s*;\s*)(currentUserId\s*:\s*string\s*;)/g,
    "$1accounts: Account[];\n  $2"
  );

  text = text.replace(
    /(profiles\s*:\s*Profile\[\]\s*,\s*)(currentUserId\s*:\s*string\s*,?)/g,
    "$1accounts: Account[], $2"
  );

  text = text.replace(
    /(profiles\s*:\s*Profile\[\]\s*)(\n\s*currentUserId\s*:)/g,
    (match, before, after) => {
      if (match.includes("accounts")) return match;
      return `${before};\n  accounts: Account[];${after}`;
    }
  );

  /*
    4) Garante que ProjectsClient desestruture accounts.
  */
  text = text.replace(
    /export function ProjectsClient\(\{([\s\S]*?)currentUserId([\s\S]*?)\}: Bundle\)/,
    (match, before, after) => {
      if (before.includes("accounts") || after.includes("accounts")) return match;
      return `export function ProjectsClient({${before}accounts,\n  currentUserId${after}}: Bundle)`;
    }
  );

  /*
    5) Fallback seguro para map de accounts.
  */
  text = text.replace(/bundle\.accounts\.map/g, "(bundle.accounts || []).map");
  text = text.replace(/accounts\.map\(\(account\)/g, "(accounts || []).map((account)");

  /*
    6) Se o submitMovement montar body explicitamente e esquecer account_id, injeta.
  */
  text = text.replace(
    /(project_id:\s*movementForm\.project_id,\s*)(type:\s*movementForm\.type,)/g,
    "$1account_id: movementForm.account_id || null,\n        $2"
  );

  text = text.replace(
    /(body:\s*JSON\.stringify\(\{\s*[\s\S]*?project_id:\s*movementForm\.project_id,[\s\S]*?)(type:\s*movementForm\.type,)/g,
    (match, before, after) => {
      if (match.includes("account_id")) return match;
      return `${before}account_id: movementForm.account_id || null,\n        ${after}`;
    }
  );

  /*
    7) Se setMovementForm reseta manualmente o form, mantém account_id.
  */
  text = text.replace(
    /setMovementForm\(\{\s*project_id:\s*[^,}]+,\s*type:\s*"add",\s*amount:\s*"0",\s*description:\s*""\s*\}\)/g,
    (match) => match.replace("type:", 'account_id: "", type:')
  );

  if (text !== original) {
    fs.writeFileSync(file, text, "utf8");
    console.log("Corrigido:", path.relative(root, file));
  } else {
    console.log("Sem alterações necessárias:", path.relative(root, file));
  }
}

function patchProjectsPage() {
  const file = files.projectsPage;

  if (!fs.existsSync(file)) {
    console.log("Ignorado, não encontrado:", path.relative(root, file));
    return;
  }

  backup(file, "backup-before-vercel-type-hardening");

  let text = fs.readFileSync(file, "utf8");
  const original = text;

  /*
    Se a página envia accounts, garante import de Account.
  */
  if (text.includes("accounts={") && !text.includes("Account")) {
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
  }

  if (text !== original) {
    fs.writeFileSync(file, text, "utf8");
    console.log("Corrigido:", path.relative(root, file));
  } else {
    console.log("Sem alterações necessárias:", path.relative(root, file));
  }
}

function patchProjectItemsRoute() {
  const file = files.projectItemsRoute;

  if (!fs.existsSync(file)) {
    console.log("Ignorado, não encontrado:", path.relative(root, file));
    return;
  }

  backup(file, "backup-before-vercel-type-hardening");

  let text = fs.readFileSync(file, "utf8");
  const original = text;

  /*
    Corrige narrowing de status:
    else if (previousStatus === "completed" && nextStatus !== "completed")
    quebra no build estrito porque no else o nextStatus já não é completed.
  */
  text = text.replace(
    /else if \(previousStatus === ["']completed["'] && nextStatus !== ["']completed["']\) \{/g,
    'else if (previousStatus === "completed") {'
  );

  text = text.replace(
    /const previousStatus = String\(existing\.status \|\| "pending"\);\s*const nextStatus = payload\.status;/,
    'const previousStatus = String(existing.status || "pending");\n    const nextStatus: "pending" | "completed" | "canceled" = payload.status;'
  );

  if (text !== original) {
    fs.writeFileSync(file, text, "utf8");
    console.log("Corrigido:", path.relative(root, file));
  } else {
    console.log("Sem alterações necessárias:", path.relative(root, file));
  }
}

function patchPlanningServer() {
  const file = files.planningServer;

  if (!fs.existsSync(file)) {
    console.log("Ignorado, não encontrado:", path.relative(root, file));
    return;
  }

  backup(file, "backup-before-vercel-type-hardening");

  let text = fs.readFileSync(file, "utf8");
  const original = text;

  /*
    RecurringRuleLike não deve exigir id antes do insert.
  */
  text = text.replace(
    /type RecurringRuleLike = Pick<\s*RecurringRule,\s*\|\s*"id"\s*\|([\s\S]*?)>;/,
    `type RecurringRuleLike = Pick<
  RecurringRule,
$1> & {
  id?: string | null;
};`
  );

  if (text === original && text.includes("type RecurringRuleLike = Pick<") && text.includes('| "id"')) {
    text = text.replace(/\n\s*\|\s*"id"/, "");
    text = text.replace(
      /type RecurringRuleLike = Pick<([\s\S]*?)>;/,
      "type RecurringRuleLike = Pick<$1> & {\n  id?: string | null;\n};"
    );
  }

  if (text !== original) {
    fs.writeFileSync(file, text, "utf8");
    console.log("Corrigido:", path.relative(root, file));
  } else {
    console.log("Sem alterações necessárias:", path.relative(root, file));
  }
}

patchProjectsClient();
patchProjectsPage();
patchProjectItemsRoute();
patchPlanningServer();

console.log("");
console.log("Correções de build/Vercel aplicadas.");
console.log("Agora rode:");
console.log("npm run build");
console.log("npm run dev");
