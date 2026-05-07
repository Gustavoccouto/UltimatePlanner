#!/usr/bin/env node
import fs from "fs";
import path from "path";

const root = process.cwd();

function backup(file, suffix) {
  if (!fs.existsSync(file)) return;

  const backupFile = `${file}.${suffix}`;

  if (!fs.existsSync(backupFile)) {
    fs.writeFileSync(backupFile, fs.readFileSync(file, "utf8"), "utf8");
    console.log("Backup criado:", path.relative(root, backupFile));
  }
}

function patchCardsClient() {
  const file = path.join(root, "src", "components", "cards", "cards-client.tsx");

  if (!fs.existsSync(file)) {
    console.log("cards-client.tsx não encontrado.");
    return;
  }

  backup(file, "backup-before-hide-canceled-installments");

  let text = fs.readFileSync(file, "utf8");
  const original = text;

  text = text.replace(
    /const planViews = useMemo\(\(\) => buildPlanViews\(plans, installments, transactions, activeCards\), \[activeCards, installments, plans, transactions\]\);/,
    `const visiblePlans = useMemo(
    () => plans.filter((plan) => plan.payment_method === "credit_card" && plan.status !== "canceled"),
    [plans]
  );
  const visibleInstallments = useMemo(
    () => installments.filter((installment) => installment.status !== "canceled"),
    [installments]
  );
  const planViews = useMemo(
    () => buildPlanViews(visiblePlans, visibleInstallments, transactions, activeCards),
    [activeCards, visibleInstallments, visiblePlans, transactions]
  );`
  );

  /*
   * Remove a lógica visual antiga que deixava parcelamento cinza/riscado.
   * Agora removidos/cancelados simplesmente não entram no planViews.
   */
  text = text.replace(
    /const isOpen = expandedPlans\.has\(plan\.id\);\s*const isRemoved = plan\.status === "canceled" \|\| \(plan\.remaining_count === 0 && plan\.paid_count === 0\);\s*return \(/g,
    "const isOpen = expandedPlans.has(plan.id); return ("
  );

  text = text.replace(
    /className=\{`installment-plan-card \$\{isOpen \? "is-open" : ""\}\$\{isRemoved \? " is-removed" : ""\}`\}/g,
    'className={`installment-plan-card ${isOpen ? "is-open" : ""}`}'
  );

  text = text.replace(
    /<span className=\{`badge \$\{isRemoved \? "badge-muted" : ""\}`\}>\{isRemoved \? "Removido" : isOpen \? "Recolher detalhes" : "Ver parcelas"\}<\/span>/g,
    '<span className="badge">{isOpen ? "Recolher detalhes" : "Ver parcelas"}</span>'
  );

  text = text.replace(/\{isRemoved \? " • removido" : ""\}/g, "");

  /*
   * Depois de excluir, remove localmente o plano/parcelas/transações para não piscar item removido antes do reload.
   */
  text = text.replace(
    /setMessage\("Compra parcelada inteira excluída\."\);\s*await refreshCardsData\(\);/,
    `setPlans((current) => current.filter((item) => item.id !== planId));
      setInstallments((current) => current.filter((item) => item.installment_plan_id !== planId));
      setTransactions((current) => current.filter((item) => item.installment_plan_id !== planId));
      setMessage("Compra parcelada inteira excluída.");
      await refreshCardsData();`
  );

  if (text !== original) {
    fs.writeFileSync(file, text, "utf8");
    console.log("Ajustado:", path.relative(root, file));
  } else {
    console.log("Nenhuma alteração automática no cards-client.tsx.");
  }
}

function patchCardsPage() {
  const file = path.join(root, "src", "app", "(app)", "cards", "page.tsx");

  if (!fs.existsSync(file)) {
    console.log("cards/page.tsx não encontrado.");
    return;
  }

  backup(file, "backup-before-filter-canceled-installments");

  let text = fs.readFileSync(file, "utf8");
  const original = text;

  text = text.replace(
    /supabase\.from\("installment_plans"\)\.select\("\*"\)\.eq\("owner_id", user\.id\)\.eq\("payment_method", "credit_card"\)\.order\("first_date", \{ ascending: false \}\)/g,
    'supabase.from("installment_plans").select("*").eq("owner_id", user.id).eq("payment_method", "credit_card").neq("status", "canceled").order("first_date", { ascending: false })'
  );

  text = text.replace(
    /supabase\.from\("installments"\)\.select\("\*"\)\.eq\("owner_id", user\.id\)\.order\("due_date", \{ ascending: true \}\)/g,
    'supabase.from("installments").select("*").eq("owner_id", user.id).neq("status", "canceled").order("due_date", { ascending: true })'
  );

  if (text !== original) {
    fs.writeFileSync(file, text, "utf8");
    console.log("Ajustado:", path.relative(root, file));
  } else {
    console.log("Nenhuma alteração automática no cards/page.tsx.");
  }
}

function patchCss() {
  const file = path.join(root, "src", "app", "ux-polish.css");

  if (!fs.existsSync(file)) {
    console.log("ux-polish.css não encontrado.");
    return;
  }

  backup(file, "backup-before-remove-gray-deleted-installments");

  let text = fs.readFileSync(file, "utf8");
  const original = text;

  /*
   * Neutraliza patches anteriores que deixavam parcelamentos removidos cinzas/riscados.
   * Não remove o CSS antigo para evitar edição arriscada; apenas garante que não terá efeito visual.
   */
  const marker = "/* no-gray-removed-installments-final */";

  if (!text.includes(marker)) {
    text += `

${marker}
.installment-plan-card.is-removed,
.installment-plan-card.is-removed * {
  opacity: initial !important;
  text-decoration: none !important;
}
`;
  }

  if (text !== original) {
    fs.writeFileSync(file, text, "utf8");
    console.log("Ajustado:", path.relative(root, file));
  } else {
    console.log("Nenhuma alteração automática no CSS.");
  }
}

patchCardsClient();
patchCardsPage();
patchCss();

console.log("Concluído. Rode: npm run build");
