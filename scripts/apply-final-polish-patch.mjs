import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const targets = [
  {
    kind: "project",
    label: "projeto",
    componentPath: "src/components/projects/projects-client.tsx",
    endpoint: "/api/projects/sharing",
    idField: "project_id",
    selectedEntity: "selectedProject"
  },
  {
    kind: "goal",
    label: "meta",
    componentPath: "src/components/goals/goals-client.tsx",
    endpoint: "/api/goals/sharing",
    idField: "goal_id",
    selectedEntity: "selectedGoal"
  }
];

const cardsClientPath = path.join(root, "src/components/cards/cards-client.tsx");

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function write(filePath, content) {
  fs.writeFileSync(filePath, content);
}

function fileExists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function patchImport(source) {
  return source.replace(
    /import \{([^}]*?)useMemo([^}]*?)useState([^}]*?)\} from "react";/,
    (match) => (match.includes("useEffect") ? match : match.replace("useMemo", "useEffect, useMemo"))
  );
}

function patchShareSearchState(source) {
  if (source.includes("profileSearchLoading")) return source;

  return source.replace(
    /const \[shareRole, setShareRole\] = useState<"viewer" \| "editor">\("editor"\);/,
    `const [shareRole, setShareRole] = useState<"viewer" | "editor">("editor");
  const [profileResults, setProfileResults] = useState<Profile[]>([]);
  const [profileSearchLoading, setProfileSearchLoading] = useState(false);`
  );
}

function patchShareEffect(source) {
  if (source.includes("fetch(`/api/profiles?q=")) return source;

  return source.replace(
    /const canEditSelected = ([^;]+);/,
    `const canEditSelected = $1;

  useEffect(() => {
    const term = shareSearch.trim();
    let cancelled = false;

    if (modal !== "share" || term.length < 2) {
      setProfileResults([]);
      setProfileSearchLoading(false);
      return;
    }

    setProfileSearchLoading(true);

    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(\`/api/profiles?q=\${encodeURIComponent(term)}\`);
        const payload = await response.json().catch(() => ({ data: [] }));

        if (!cancelled) {
          setProfileResults(Array.isArray(payload.data) ? payload.data : []);
        }
      } catch {
        if (!cancelled) setProfileResults([]);
      } finally {
        if (!cancelled) setProfileSearchLoading(false);
      }
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [modal, shareSearch]);`
  );
}

function patchUpdateShareRole(source, target) {
  if (source.includes("async function updateShareRole")) return source;

  const insertion = `
  async function updateShareRole(profile: Profile, role: "viewer" | "editor") {
    if (!${target.selectedEntity}) return;
    setLoading(true);
    setError("");

    try {
      await requestJson("${target.endpoint}", {
        method: "POST",
        body: JSON.stringify({ ${target.idField}: ${target.selectedEntity}.id, user_id: profile.id, role, action: "add" })
      });

      await reload();
      setMessage("Permissão atualizada.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível atualizar a permissão.");
    } finally {
      setLoading(false);
    }
  }

`;

  return source.replace(/\n\s*const filteredProfiles = /, `${insertion}  const filteredProfiles = `);
}

function patchFilteredProfiles(source) {
  if (source.includes("profileResults" ) && source.includes("profilesForSharing")) return source;

  const regex = /const filteredProfiles = bundle\.profiles[\s\S]*?\.filter\(\(profile\) => \{[\s\S]*?return `\$\{profile\.display_name \|\| ""\} \$\{profile\.email \|\| ""\}`\.toLowerCase\(\)\.includes\(term\);[\s\S]*?\}\);/;
  const replacement = `const profilesForSharing = useMemo(() => {
    const map = new Map<string, Profile>();

    bundle.profiles.forEach((profile) => map.set(profile.id, profile));
    profileResults.forEach((profile) => map.set(profile.id, profile));

    return Array.from(map.values()).filter((profile) => profile.id !== bundle.currentUserId);
  }, [bundle.currentUserId, bundle.profiles, profileResults]);

  const filteredProfiles = profilesForSharing.filter((profile) => {
    const term = shareSearch.trim().toLowerCase();
    const alreadyShared = selectedShares.some((share) => share.user_id === profile.id);

    if (alreadyShared) return true;
    if (!term) return false;

    return \`\${profile.display_name || ""} \${profile.email || ""}\`.toLowerCase().includes(term);
  });`;

  if (regex.test(source)) return source.replace(regex, replacement);

  return source;
}

function patchShareActionButton(source) {
  if (source.includes("updateShareRole(profile")) return source;

  const oldSnippet = `<button className={\`btn \${share ? "btn-danger" : "btn-muted"}\`} type="button" onClick={() => toggleShare(profile, !!share)}>{share ? "Remover" : "Adicionar"}</button>`;
  const newSnippet = `<div className="share-actions">
            {share ? (
              <select value={share.role} onChange={(event) => updateShareRole(profile, event.target.value as "viewer" | "editor")} aria-label="Permissão do participante">
                <option value="editor">Editor</option>
                <option value="viewer">Leitor</option>
              </select>
            ) : null}
            <button className={\`btn \${share ? "btn-danger" : "btn-primary"}\`} type="button" onClick={() => toggleShare(profile, !!share)}>
              {share ? "Remover" : "Adicionar"}
            </button>
          </div>`;

  if (source.includes(oldSnippet)) return source.replace(oldSnippet, newSnippet);

  return source.replace(
    /<button className=\{`btn \$\{share \? "btn-danger" : "btn-muted"\}`} type="button" onClick=\{\(\) => toggleShare\(profile, !!share\)\}\>\{share \? "Remover" : "Adicionar"\}<\/button>/,
    newSnippet
  );
}

function patchShareModalCopy(source, target) {
  let next = source;

  next = next.replace(
    `subtitle="Somente o dono pode adicionar ou remover participantes."`,
    `subtitle="Adicione por nome ou e-mail. Editores podem alterar o ${target.label}; leitores apenas visualizam."`
  );

  if (!next.includes("Participantes atuais")) {
    next = next.replace(
      /<div className="share-list">/,
      `<p className="share-section-title">Participantes atuais</p>
      <div className="share-list">`
    );
  }

  next = next.replace(
    /\{!filteredProfiles\.length \? <div className="empty-state">Nenhum usuário encontrado\.<\/div> : null\}/,
    `{profileSearchLoading ? <div className="empty-state">Buscando usuários...</div> : null}
        {!profileSearchLoading && shareSearch.trim().length < 2 ? <div className="empty-state">Digite pelo menos 2 letras do nome ou e-mail para buscar.</div> : null}
        {!profileSearchLoading && shareSearch.trim().length >= 2 && !filteredProfiles.length ? <div className="empty-state">Nenhum usuário encontrado.</div> : null}`
  );

  return next;
}

function patchSharingClient(target) {
  const absolutePath = path.join(root, target.componentPath);

  if (!fs.existsSync(absolutePath)) {
    console.warn(`[${target.kind}] Arquivo não encontrado: ${target.componentPath}`);
    return;
  }

  let source = read(absolutePath);
  const original = source;

  source = patchImport(source);
  source = patchShareSearchState(source);
  source = patchShareEffect(source);
  source = patchUpdateShareRole(source, target);
  source = patchFilteredProfiles(source);
  source = patchShareActionButton(source);
  source = patchShareModalCopy(source, target);

  if (source !== original) {
    write(absolutePath, source);
    console.log(`[${target.kind}] Compartilhamento com busca dinâmica e edição de permissão aplicado.`);
  } else {
    console.log(`[${target.kind}] Nenhuma alteração necessária ou padrão não encontrado.`);
  }
}

function patchCardsClient() {
  if (!fs.existsSync(cardsClientPath)) {
    console.warn("[cards] Arquivo src/components/cards/cards-client.tsx não encontrado.");
    return;
  }

  let source = read(cardsClientPath);
  const original = source;

  if (!source.includes("function deleteInstallmentPlan")) {
    const insertBefore = "function togglePlan(planId: string)";
    const fn = `
  async function deleteInstallmentPlan(transaction: Transaction) {
    if (!transaction.installment_plan_id) {
      setError("Esta parcela não pertence a uma compra parcelada.");
      return;
    }

    const confirmed = window.confirm(
      "Isso vai excluir a compra parcelada inteira e remover todas as parcelas desta aba. Deseja continuar?"
    );

    if (!confirmed) return;

    setError("");

    try {
      await requestJson<{ ok: boolean }>("/api/cards/installments", {
        method: "PATCH",
        body: JSON.stringify({ action: "delete_plan", id: transaction.id })
      });

      setMessage("Compra parcelada inteira excluída.");
      await refreshCardsData();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Erro ao excluir a compra parcelada inteira.");
    }
  }

  `;

    if (source.includes(insertBefore)) {
      source = source.replace(insertBefore, `${fn}${insertBefore}`);
    } else {
      console.warn("[cards] Não encontrei togglePlan para inserir deleteInstallmentPlan.");
    }
  }

  if (!source.includes("Excluir compra inteira")) {
    const extraButton = `
                                  {transaction && transaction.installment_plan_id ? (
                                    <button className="btn btn-danger btn-soft-danger" type="button" onClick={() => deleteInstallmentPlan(transaction)}>
                                      Excluir compra inteira
                                    </button>
                                  ) : null}`;

    const patterns = [
      /\{transaction \?\s*<button([^>]*)onClick=\{\(\) => deleteInstallment\(transaction\)\}([^>]*)>Excluir<\/button>\s*:\s*null\}/,
      /\{transaction &&[^?]*\?\s*<button([^>]*)onClick=\{\(\) => deleteInstallment\(transaction\)\}([^>]*)>Excluir<\/button>\s*:\s*null\}/
    ];

    for (const pattern of patterns) {
      if (pattern.test(source)) {
        source = source.replace(pattern, (match) => `${match}${extraButton}`);
        break;
      }
    }
  }

  if (source !== original) {
    write(cardsClientPath, source);
    console.log("[cards] Botão de excluir compra parcelada inteira aplicado.");
  } else {
    console.log("[cards] Nenhuma alteração necessária ou padrão não encontrado.");
  }
}

for (const target of targets) patchSharingClient(target);
patchCardsClient();

console.log("Patch final concluído.");
