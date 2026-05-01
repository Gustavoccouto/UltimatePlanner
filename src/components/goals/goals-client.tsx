"use client";

import { CSSProperties, FormEvent, useMemo, useState } from "react";
import type { ActivityLog, Goal, GoalMovement, Profile, SharedItem } from "@/lib/domain/app-types";
import { currencyBRL, datePt, percent } from "@/lib/domain/formatters";
import { ColorPickerField } from "@/components/ui/color-picker-field";

type Bundle = {
  goals: Goal[];
  movements: GoalMovement[];
  shares: SharedItem[];
  activityLogs: ActivityLog[];
  profiles: Profile[];
  currentUserId: string;
};

type GoalForm = {
  id?: string;
  name: string;
  description: string;
  category: string;
  target_amount: string;
  current_amount: string;
  due_date: string;
  status: "active" | "completed" | "archived" | "canceled";
  color: string;
  notes: string;
};

type MovementForm = {
  goal_id: string;
  type: "add" | "remove";
  amount: string;
  description: string;
};

const emptyGoalForm: GoalForm = {
  name: "",
  description: "",
  category: "",
  target_amount: "0",
  current_amount: "0",
  due_date: "",
  status: "active",
  color: "",
  notes: ""
};

const emptyMovementForm: MovementForm = {
  goal_id: "",
  type: "add",
  amount: "0",
  description: ""
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {})
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Erro inesperado.");
  return payload as T;
}

function metadataValue(record: { metadata?: Record<string, unknown> | null }, key: string, fallback = "") {
  const value = record.metadata?.[key];
  return typeof value === "string" ? value : fallback;
}

function movementDelta(type: GoalMovement["type"], amount: number) {
  return type === "remove" ? -Math.abs(amount) : Math.abs(amount);
}


function accentStyle(color?: string | null): CSSProperties | undefined {
  return color ? ({ "--item-accent": color } as CSSProperties) : undefined;
}

function profileName(profile?: Profile | null) {
  if (!profile) return "Usuário";
  return profile.display_name || profile.email || profile.id;
}

function activityLabel(log: ActivityLog, profile?: Profile) {
  const actor = profileName(profile);
  const amount = typeof log.new_value === "number" || typeof log.new_value === "string" ? currencyBRL(Number(log.new_value || 0)) : "";
  switch (log.action_type) {
    case "goal_created": return `${actor} criou a meta.`;
    case "goal_updated": return `${actor} atualizou a meta.`;
    case "goal_deleted": return `${actor} arquivou a meta.`;
    case "goal_share_added": return `${actor} compartilhou a meta.`;
    case "goal_share_removed": return `${actor} removeu um participante.`;
    case "goal_contribution_added": return `${actor} adicionou ${amount} à meta.`;
    case "goal_contribution_removed": return `${actor} removeu ${amount} da meta.`;
    case "goal_contribution_deleted": return `${actor} excluiu uma movimentação.`;
    default: return `${actor} registrou uma atividade.`;
  }
}

export function GoalsClient(props: Bundle) {
  const [bundle, setBundle] = useState<Bundle>(props);
  const [selectedGoalId, setSelectedGoalId] = useState(props.goals[0]?.id || "");
  const [modal, setModal] = useState<"goal" | "movement" | "share" | "history" | null>(null);
  const [goalForm, setGoalForm] = useState<GoalForm>(emptyGoalForm);
  const [movementForm, setMovementForm] = useState<MovementForm>(emptyMovementForm);
  const [shareSearch, setShareSearch] = useState("");
  const [shareRole, setShareRole] = useState<"viewer" | "editor">("editor");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const selectedGoal = bundle.goals.find((goal) => goal.id === selectedGoalId) || bundle.goals[0] || null;
  const profileById = useMemo(() => new Map(bundle.profiles.map((profile) => [profile.id, profile])), [bundle.profiles]);
  const selectedShares = useMemo(() => selectedGoal ? bundle.shares.filter((share) => share.item_id === selectedGoal.id) : [], [bundle.shares, selectedGoal]);
  const selectedMovements = useMemo(() => selectedGoal ? bundle.movements.filter((movement) => movement.goal_id === selectedGoal.id) : [], [bundle.movements, selectedGoal]);
  const selectedLogs = useMemo(() => selectedGoal ? bundle.activityLogs.filter((log) => log.entity_id === selectedGoal.id || log.metadata?.goal_id === selectedGoal.id) : [], [bundle.activityLogs, selectedGoal]);
  const canManageSharing = selectedGoal?.owner_id === bundle.currentUserId;
  const canEditSelected = canManageSharing || selectedShares.some((share) => share.user_id === bundle.currentUserId && share.role === "editor");

  const totals = useMemo(() => {
    const activeGoals = bundle.goals.filter((goal) => goal.status === "active" || goal.status === "completed");
    const totalTarget = activeGoals.reduce((sum, goal) => sum + Number(goal.target_amount || 0), 0);
    const totalCurrent = activeGoals.reduce((sum, goal) => sum + Number(goal.current_amount || 0), 0);
    const dueSoon = activeGoals.filter((goal) => {
      if (!goal.due_date) return false;
      const days = (new Date(goal.due_date).getTime() - Date.now()) / 86400000;
      return days >= 0 && days <= 45;
    }).length;
    return { activeGoals: activeGoals.length, totalTarget, totalCurrent, dueSoon };
  }, [bundle.goals]);

  const selectedProgress = selectedGoal ? Math.min(100, (Number(selectedGoal.current_amount || 0) / Math.max(Number(selectedGoal.target_amount || 1), 1)) * 100) : 0;

  async function reload() {
    const next = await requestJson<Omit<Bundle, "currentUserId">>("/api/goals");
    setBundle({ ...next, currentUserId: bundle.currentUserId });
  }

  function openGoalCreate() {
    setGoalForm(emptyGoalForm);
    setModal("goal");
    setError("");
    setMessage("");
  }

  function openGoalEdit(goal: Goal) {
    setGoalForm({
      id: goal.id,
      name: goal.name,
      description: goal.description || "",
      category: metadataValue(goal, "category"),
      target_amount: String(goal.target_amount || 0),
      current_amount: String(goal.current_amount || 0),
      due_date: goal.due_date || "",
      status: goal.status,
      color: goal.color || "",
      notes: metadataValue(goal, "notes")
    });
    setModal("goal");
  }

  function openMovementCreate(type: "add" | "remove" = "add") {
    if (!selectedGoal) return;
    setMovementForm({ ...emptyMovementForm, goal_id: selectedGoal.id, type });
    setModal("movement");
  }

  async function submitGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    try {
      await requestJson("/api/goals", {
        method: goalForm.id ? "PATCH" : "POST",
        body: JSON.stringify({
          ...goalForm,
          target_amount: Number(goalForm.target_amount || 0),
          current_amount: Number(goalForm.current_amount || 0),
          due_date: goalForm.due_date || null
        })
      });
      await reload();
      setModal(null);
      setMessage(goalForm.id ? "Meta atualizada." : "Meta criada.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível salvar.");
    } finally {
      setLoading(false);
    }
  }

  async function submitMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    try {
      await requestJson("/api/goals/movements", {
        method: "POST",
        body: JSON.stringify({ ...movementForm, amount: Number(movementForm.amount || 0) })
      });
      await reload();
      setModal(null);
      setMessage(movementForm.type === "add" ? "Aporte registrado." : "Retirada registrada.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível registrar.");
    } finally {
      setLoading(false);
    }
  }

  async function deleteGoal(goal: Goal) {
    if (!window.confirm(`Arquivar meta\n\nDeseja arquivar "${goal.name}"?`)) return;
    setLoading(true);
    try {
      await requestJson("/api/goals", { method: "DELETE", body: JSON.stringify({ id: goal.id }) });
      await reload();
      setSelectedGoalId("");
      setMessage("Meta arquivada.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível arquivar.");
    } finally {
      setLoading(false);
    }
  }

  async function deleteMovement(movement: GoalMovement) {
    if (!window.confirm("Excluir movimentação da meta?")) return;
    setLoading(true);
    try {
      await requestJson("/api/goals/movements", { method: "DELETE", body: JSON.stringify({ id: movement.id, goal_id: movement.goal_id }) });
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível excluir.");
    } finally {
      setLoading(false);
    }
  }

  async function toggleShare(profile: Profile, exists: boolean) {
    if (!selectedGoal) return;
    setLoading(true);
    setError("");
    try {
      await requestJson("/api/goals/sharing", {
        method: "POST",
        body: JSON.stringify({
          goal_id: selectedGoal.id,
          user_id: profile.id,
          role: shareRole,
          action: exists ? "remove" : "add"
        })
      });
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível alterar o compartilhamento.");
    } finally {
      setLoading(false);
    }
  }

  const filteredProfiles = bundle.profiles
    .filter((profile) => profile.id !== bundle.currentUserId)
    .filter((profile) => {
      const term = shareSearch.trim().toLowerCase();
      if (!term) return true;
      return `${profile.display_name || ""} ${profile.email || ""}`.toLowerCase().includes(term);
    });

  return (
    <div className="grid">
      <header className="page-header">
        <div>
          <h1 className="page-title">Metas</h1>
          <p className="page-caption">Objetivos financeiros, aportes, progresso e compartilhamento.</p>
        </div>
        <button className="btn btn-primary" type="button" onClick={openGoalCreate}>Nova meta</button>
      </header>

      {error ? <div className="alert alert-error">{error}</div> : null}
      {message ? <div className="alert alert-success">{message}</div> : null}

      <section className="stats-grid goals-stats-grid">
        <article className="stat-card"><div className="stat-label">Metas ativas</div><div className="stat-value">{totals.activeGoals}</div></article>
        <article className="stat-card"><div className="stat-label">Valor alvo consolidado</div><div className="stat-value">{currencyBRL(totals.totalTarget)}</div></article>
        <article className="stat-card"><div className="stat-label">Guardado</div><div className="stat-value">{currencyBRL(totals.totalCurrent)}</div></article>
        <article className="stat-card"><div className="stat-label">A vencer em 45 dias</div><div className="stat-value">{totals.dueSoon}</div></article>
      </section>

      <section className="goals-grid">
        {bundle.goals.map((goal) => {
          const progress = Math.min(100, (Number(goal.current_amount || 0) / Math.max(Number(goal.target_amount || 1), 1)) * 100);
          const shares = bundle.shares.filter((share) => share.item_id === goal.id);
          const isOwner = goal.owner_id === bundle.currentUserId;
          return (
            <article className={`goal-card accent-card ${selectedGoal?.id === goal.id ? "active" : ""}`} key={goal.id} style={accentStyle(goal.color)} onClick={() => setSelectedGoalId(goal.id)}>
              <div className="finance-card-topline"><span className="badge">{metadataValue(goal, "category") || "Meta"}</span><span>{isOwner ? "Dono" : "Compartilhada"}</span></div>
              <h2>{goal.name}</h2>
              <p>{goal.description || "Objetivo financeiro com progresso visível."}</p>
              <div className="progress-track"><span style={{ width: `${progress}%`, background: goal.color || undefined }} /></div>
              <div className="split-row"><span>Atual</span><strong>{currencyBRL(goal.current_amount)}</strong></div>
              <div className="split-row"><span>Alvo</span><strong>{currencyBRL(goal.target_amount)}</strong></div>
              <div className="split-row"><span>Progresso</span><strong>{percent(progress)}</strong></div>
              <small>{goal.due_date ? `Prazo: ${datePt(goal.due_date)}` : "Sem prazo"} • {shares.length} participante(s)</small>
            </article>
          );
        })}
        {!bundle.goals.length ? <div className="panel"><div className="empty-state">Nenhuma meta cadastrada.</div></div> : null}
      </section>

      {selectedGoal ? (
        <section className="panel">
          <div className="section-heading">
            <div>
              <h2>{selectedGoal.name}</h2>
              <p>{currencyBRL(selectedGoal.current_amount)} de {currencyBRL(selectedGoal.target_amount)} • {percent(selectedProgress)}</p>
            </div>
            <div className="header-actions">
              {canEditSelected ? <button className="btn btn-primary" type="button" onClick={() => openMovementCreate("add")}>+ Aporte</button> : null}
              {canEditSelected ? <button className="btn btn-muted" type="button" onClick={() => openMovementCreate("remove")}>- Retirada</button> : null}
              {canEditSelected ? <button className="btn btn-muted" type="button" onClick={() => openGoalEdit(selectedGoal)}>Editar</button> : null}
              {canManageSharing ? <button className="btn btn-muted" type="button" onClick={() => setModal("share")}>Compartilhar</button> : null}
              <button className="btn btn-muted" type="button" onClick={() => setModal("history")}>Histórico</button>
              {canManageSharing ? <button className="btn btn-danger" type="button" onClick={() => deleteGoal(selectedGoal)}>Arquivar</button> : null}
            </div>
          </div>

          <div className="progress-track large"><span style={{ width: `${selectedProgress}%`, background: selectedGoal?.color || undefined }} /></div>

          <div className="table-scroll">
            <table className="table">
              <thead><tr><th>Data</th><th>Tipo</th><th>Descrição</th><th>Valor</th><th>Quem fez</th><th>Ações</th></tr></thead>
              <tbody>
                {selectedMovements.map((movement) => (
                  <tr key={movement.id}>
                    <td>{datePt((movement.created_at || "").slice(0, 10))}</td>
                    <td>{movement.type === "add" ? "Aporte" : "Retirada"}</td>
                    <td>{movement.description || "—"}</td>
                    <td>{currencyBRL(movement.amount)}</td>
                    <td>{profileName(profileById.get(movement.actor_id || ""))}</td>
                    <td>{canEditSelected ? <button className="link-button danger-text" type="button" onClick={() => deleteMovement(movement)}>Excluir</button> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!selectedMovements.length ? <div className="empty-state">Nenhuma movimentação registrada nesta meta.</div> : null}
          </div>
        </section>
      ) : null}

      {modal === "goal" ? (
        <Modal title={goalForm.id ? "Editar meta" : "Nova meta"} subtitle="Defina valor alvo, prazo e observações." onClose={() => setModal(null)}>
          <form className="form-grid two-columns" onSubmit={submitGoal}>
            <label className="field full-span"><span>Nome</span><input value={goalForm.name} onChange={(e) => setGoalForm({ ...goalForm, name: e.target.value })} required /></label>
            <label className="field"><span>Valor alvo</span><input type="number" step="0.01" min="0.01" value={goalForm.target_amount} onChange={(e) => setGoalForm({ ...goalForm, target_amount: e.target.value })} required /></label>
            {!goalForm.id ? <label className="field"><span>Valor atual inicial</span><input type="number" step="0.01" min="0" value={goalForm.current_amount} onChange={(e) => setGoalForm({ ...goalForm, current_amount: e.target.value })} /></label> : null}
            <label className="field"><span>Categoria</span><input value={goalForm.category} onChange={(e) => setGoalForm({ ...goalForm, category: e.target.value })} /></label>
            <label className="field"><span>Prazo</span><input type="date" value={goalForm.due_date} onChange={(e) => setGoalForm({ ...goalForm, due_date: e.target.value })} /></label>
            <label className="field"><span>Status</span><select value={goalForm.status} onChange={(e) => setGoalForm({ ...goalForm, status: e.target.value as GoalForm["status"] })}><option value="active">Ativa</option><option value="completed">Concluída</option><option value="archived">Arquivada</option><option value="canceled">Cancelada</option></select></label>
            <ColorPickerField
              label="Cor da meta"
              value={goalForm.color}
              onChange={(color) => setGoalForm({ ...goalForm, color })}
              helper="A cor facilita reconhecer a meta nos cards e relatórios."
            />
            <label className="field full-span"><span>Descrição</span><textarea rows={3} value={goalForm.description} onChange={(e) => setGoalForm({ ...goalForm, description: e.target.value })} /></label>
            <label className="field full-span"><span>Observações</span><textarea rows={3} value={goalForm.notes} onChange={(e) => setGoalForm({ ...goalForm, notes: e.target.value })} /></label>
            <div className="modal-actions full-span"><button className="btn btn-muted" type="button" onClick={() => setModal(null)}>Cancelar</button><button className="btn btn-primary" disabled={loading} type="submit">Salvar meta</button></div>
          </form>
        </Modal>
      ) : null}

      {modal === "movement" ? (
        <Modal title={movementForm.type === "add" ? "Novo aporte" : "Nova retirada"} subtitle="Ajuste o progresso financeiro da meta." onClose={() => setModal(null)}>
          <form className="form-grid two-columns" onSubmit={submitMovement}>
            <label className="field"><span>Tipo</span><select value={movementForm.type} onChange={(e) => setMovementForm({ ...movementForm, type: e.target.value as MovementForm["type"] })}><option value="add">Aporte</option><option value="remove">Retirada</option></select></label>
            <label className="field"><span>Valor</span><input type="number" step="0.01" min="0.01" value={movementForm.amount} onChange={(e) => setMovementForm({ ...movementForm, amount: e.target.value })} required /></label>
            <label className="field full-span"><span>Descrição</span><input value={movementForm.description} onChange={(e) => setMovementForm({ ...movementForm, description: e.target.value })} /></label>
            <div className="modal-actions full-span"><button className="btn btn-muted" type="button" onClick={() => setModal(null)}>Cancelar</button><button className="btn btn-primary" disabled={loading} type="submit">Registrar</button></div>
          </form>
        </Modal>
      ) : null}

      {modal === "share" && selectedGoal ? (
        <Modal title="Compartilhar meta" subtitle="Somente o dono pode adicionar ou remover participantes." onClose={() => setModal(null)}>
          <div className="form-grid">
            <div className="filters-panel">
              <label className="field"><span>Buscar usuário</span><input value={shareSearch} onChange={(e) => setShareSearch(e.target.value)} placeholder="Nome ou e-mail" /></label>
              <label className="field"><span>Permissão</span><select value={shareRole} onChange={(e) => setShareRole(e.target.value as "viewer" | "editor")}><option value="editor">Editor</option><option value="viewer">Leitor</option></select></label>
            </div>
            <div className="share-list">
              {filteredProfiles.map((profile) => {
                const share = selectedShares.find((item) => item.user_id === profile.id);
                return (
                  <div className="share-row" key={profile.id}>
                    <div><strong>{profileName(profile)}</strong><small>{profile.email || "sem e-mail"}{share ? ` • ${share.role}` : ""}</small></div>
                    <button className={`btn ${share ? "btn-danger" : "btn-muted"}`} type="button" onClick={() => toggleShare(profile, !!share)}>{share ? "Remover" : "Adicionar"}</button>
                  </div>
                );
              })}
              {!filteredProfiles.length ? <div className="empty-state">Nenhum usuário encontrado.</div> : null}
            </div>
          </div>
        </Modal>
      ) : null}

      {modal === "history" ? (
        <Modal title="Histórico da meta" subtitle="Ações recentes e autores." onClose={() => setModal(null)}>
          <ActivityFeed logs={selectedLogs} profileById={profileById} />
        </Modal>
      ) : null}
    </div>
  );
}

function ActivityFeed({ logs, profileById }: { logs: ActivityLog[]; profileById: Map<string, Profile> }) {
  if (!logs.length) return <div className="empty-state">Nenhuma atividade registrada ainda.</div>;
  return (
    <div className="activity-feed">
      {logs.map((log) => (
        <div className="activity-item" key={log.id}>
          <strong>{activityLabel(log, profileById.get(log.actor_id || ""))}</strong>
          <span>{datePt((log.created_at || "").slice(0, 10))}</span>
        </div>
      ))}
    </div>
  );
}

function Modal({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card">
        <div className="modal-header">
          <div><h2>{title}</h2><p>{subtitle}</p></div>
          <button className="icon-button" type="button" onClick={onClose}>Fechar</button>
        </div>
        {children}
      </div>
    </div>
  );
}
