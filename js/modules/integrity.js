import { pageHeader, toast } from "../ui.js";
import { state, loadState } from "../state.js";
import { processSyncQueue, pullRemoteIntoLocal } from "../services/sync.js";

export function renderIntegrity() {
  const issues = collectIssues();
  const failedSync = state.data.syncQueue.filter(
    (item) => item.syncStatus === "failed",
  ).length;
  const pendingSync = state.data.syncQueue.filter(
    (item) => item.syncStatus === "pending",
  ).length;
  const severityCount = issues.reduce((acc, issue) => {
    acc[issue.severity] = (acc[issue.severity] || 0) + 1;
    return acc;
  }, {});

  return `${pageHeader("Integridade", "Validação reforçada de consistência local, referências, duplicidades e status de sync.", `<button id="reprocess-sync-btn" class="action-btn"><i class="fa-solid fa-rotate mr-2"></i>Reprocessar sync</button>`)}
    <section class="module-stack">
      <div class="grid md:grid-cols-4 gap-4">
        ${metricCard("Problemas encontrados", String(issues.length))}
        ${metricCard("Falhas de sync", String(failedSync))}
        ${metricCard("Itens pendentes", String(pendingSync))}
        ${metricCard("Alertas altos", String(severityCount.high || 0))}
      </div>

      <article class="card p-6 overflow-hidden">
        <div class="section-head section-head-spaced"><div><div class="text-sm text-slate-500">Leitura atual</div><div class="section-title">Checklist de integridade</div></div><span class="badge badge-muted">${issues.length} ocorrência(s)</span></div>
        ${issues.length ? `<div class="space-y-3">${issues.map((issue) => `<div class="rounded-[22px] px-4 py-4 ${issue.severity === "high" ? "bg-red-50 text-red-800" : issue.severity === "medium" ? "bg-amber-50 text-amber-800" : "bg-sky-50 text-sky-800"}"><div class="font-semibold">${issue.title}</div><div class="text-sm mt-1">${issue.text}</div></div>`).join("")}</div>` : `<div class="text-slate-500">Nenhuma inconsistência crítica detectada nesta leitura local.</div>`}
      </article>
    </section>`;
}

export function bindIntegrityEvents() {
  document
    .getElementById("reprocess-sync-btn")
    ?.addEventListener("click", async () => {
      try {
        await processSyncQueue();
        await pullRemoteIntoLocal();
        await loadState();
        toast("Reprocessamento concluído.", "success");
      } catch (error) {
        toast(error.message, "error");
      }
    });
}

function collectIssues() {
  const issues = [];
  const accountIds = new Set(
    state.data.accounts.filter((a) => !a.isDeleted).map((a) => a.id),
  );
  const cardIds = new Set(
    state.data.creditCards.filter((a) => !a.isDeleted).map((a) => a.id),
  );
  const projectIds = new Set(
    state.data.projects.filter((a) => !a.isDeleted).map((a) => a.id),
  );
  const planIds = new Set(
    state.data.installmentPlans.filter((a) => !a.isDeleted).map((a) => a.id),
  );
  const duplicateAccounts = new Set();

  state.data.accounts
    .filter((a) => !a.isDeleted)
    .forEach((account) => {
      const key = `${String(account.bankName || "")
        .trim()
        .toLowerCase()}::${String(account.name || "")
        .trim()
        .toLowerCase()}`;
      if (duplicateAccounts.has(key)) {
        issues.push({
          severity: "medium",
          title: "Conta potencialmente duplicada",
          text: `A conta ${account.name} do banco ${account.bankName} aparece repetida.`,
        });
      }
      duplicateAccounts.add(key);
    });

  state.data.transactions
    .filter((tx) => !tx.isDeleted)
    .forEach((tx) => {
      if (
        tx.type !== "card_expense" &&
        tx.type !== "adjustment" &&
        !accountIds.has(tx.accountId)
      ) {
        issues.push({
          severity: "high",
          title: "Transação órfã",
          text: `A transação “${tx.description}” referencia uma conta inexistente.`,
        });
      }
      if (
        tx.type === "transfer" &&
        (!tx.destinationAccountId ||
          tx.destinationAccountId === tx.accountId ||
          !accountIds.has(tx.destinationAccountId))
      ) {
        issues.push({
          severity: "high",
          title: "Transferência inconsistente",
          text: `A transferência “${tx.description}” tem conta destino inválida.`,
        });
      }
      if (tx.type === "card_expense" && !cardIds.has(tx.cardId)) {
        issues.push({
          severity: "high",
          title: "Compra de cartão órfã",
          text: `A compra “${tx.description}” aponta para um cartão inexistente.`,
        });
      }
      if (tx.installmentPlanId && !planIds.has(tx.installmentPlanId)) {
        issues.push({
          severity: "medium",
          title: "Parcela sem plano",
          text: `A transação “${tx.description}” referencia um parcelamento ausente.`,
        });
      }
      if (tx.projectId && !projectIds.has(tx.projectId)) {
        issues.push({
          severity: "medium",
          title: "Projeto ausente",
          text: `A transação “${tx.description}” está vinculada a um projeto inexistente.`,
        });
      }
      if (Number(tx.amount || 0) <= 0) {
        issues.push({
          severity: "medium",
          title: "Valor inválido",
          text: `A transação “${tx.description}” possui valor menor ou igual a zero.`,
        });
      }
    });

  state.data.goals
    .filter((goal) => !goal.isDeleted)
    .forEach((goal) => {
      if (Number(goal.targetAmount || 0) <= 0) {
        issues.push({
          severity: "high",
          title: "Meta inválida",
          text: `A meta “${goal.name}” precisa ter valor alvo maior que zero.`,
        });
      }
      if (
        Number(goal.currentAmount || 0) >
        Number(goal.targetAmount || 0) * 1.5
      ) {
        issues.push({
          severity: "low",
          title: "Meta acima do alvo",
          text: `A meta “${goal.name}” está muito acima do alvo; revise se o valor alvo continua correto.`,
        });
      }
    });

  state.data.investments
    .filter((investment) => !investment.isDeleted)
    .forEach((investment) => {
      if (Number(investment.amountInvested || 0) <= 0) {
        issues.push({
          severity: "high",
          title: "Investimento sem aporte",
          text: `O investimento “${investment.name}” precisa de valor aportado maior que zero.`,
        });
      }
      if (Number(investment.currentValue || 0) < 0) {
        issues.push({
          severity: "high",
          title: "Investimento inválido",
          text: `O investimento “${investment.name}” possui valor atual negativo.`,
        });
      }
    });

  state.data.syncErrors.forEach((error) => {
    issues.push({
      severity: "medium",
      title: "Erro de sincronização",
      text: `${error.entity} / ${error.recordId}: ${error.message}`,
    });
  });

  return issues;
}

function metricCard(label, value) {
  return `<div class="card p-6"><div class="text-sm text-slate-500">${label}</div><div class="text-4xl font-extrabold mt-3">${value}</div></div>`;
}
