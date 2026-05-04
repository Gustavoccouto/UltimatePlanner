"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const RESET_CONFIRMATION = "APAGAR MEUS DADOS";

type ResetState = "idle" | "confirming" | "loading" | "success" | "error";

export default function SettingsPage() {
  const router = useRouter();

  const [confirmation, setConfirmation] = useState("");
  const [state, setState] = useState<ResetState>("idle");
  const [message, setMessage] = useState("");

  const canReset = useMemo(() => confirmation.trim() === RESET_CONFIRMATION, [confirmation]);

  async function handleResetAccountData() {
    if (!canReset || state === "loading") {
      return;
    }

    const browserConfirmed = window.confirm(
      "Esta ação apagará os dados financeiros e organizacionais da sua conta atual. Outros usuários não serão apagados. Deseja continuar?"
    );

    if (!browserConfirmed) {
      return;
    }

    const finalConfirmed = window.confirm(
      "Confirmação final: esta ação não pode ser desfeita. Deseja apagar todos os seus dados agora?"
    );

    if (!finalConfirmed) {
      return;
    }

    setState("loading");
    setMessage("");

    try {
      const response = await fetch("/api/account/reset-data", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          confirmation: RESET_CONFIRMATION
        })
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.error || "Não foi possível apagar os dados da conta.");
      }

      setState("success");
      setConfirmation("");
      setMessage("Dados da conta apagados com sucesso.");
      router.refresh();
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Erro inesperado ao apagar os dados.");
    }
  }

  return (
    <section className="settings-page-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">Conta</p>
          <h1>Configurações da conta</h1>
          <p>Gerencie ações administrativas do usuário logado sem alterar o restante do app.</p>
        </div>
      </header>

      <div className="settings-grid">
        <article className="panel settings-panel">
          <div>
            <p className="eyebrow">Usuário logado</p>
            <h2>Sessão atual</h2>
            <p className="muted">
              O usuário atual também aparece no topo do app para deixar claro qual conta está em uso antes de ações sensíveis.
            </p>
          </div>
        </article>

        <article className="panel danger-zone" aria-labelledby="danger-zone-title">
          <div className="danger-zone-copy">
            <p className="eyebrow danger-eyebrow">Zona de perigo</p>
            <h2 id="danger-zone-title">Apagar todos os meus dados</h2>
            <p>
              Remove dados financeiros e organizacionais vinculados ao usuário autenticado. Esta ação não remove outros usuários e não
              exclui a conta de autenticação do Supabase.
            </p>

            <ul>
              <li>Transações, contas, cartões, categorias customizadas e recorrências.</li>
              <li>Projetos, metas, investimentos, corretoras e históricos vinculados ao usuário.</li>
              <li>Compartilhamentos criados pelo usuário ou associados ao usuário atual.</li>
            </ul>
          </div>

          <div className="danger-confirmation">
            <label htmlFor="reset-confirmation">
              Digite <strong>{RESET_CONFIRMATION}</strong> para confirmar.
            </label>

            <input
              id="reset-confirmation"
              type="text"
              value={confirmation}
              onChange={(event) => {
                setConfirmation(event.target.value);
                setState("confirming");
                setMessage("");
              }}
              placeholder={RESET_CONFIRMATION}
              autoComplete="off"
              aria-describedby="reset-help"
            />

            <small id="reset-help">
              A confirmação textual reduz o risco de exclusão acidental em mobile e desktop.
            </small>

            <button
              type="button"
              className="danger-button"
              disabled={!canReset || state === "loading"}
              onClick={handleResetAccountData}
            >
              {state === "loading" ? "Apagando dados..." : "Apagar todos os meus dados"}
            </button>

            {message ? (
              <p className={state === "success" ? "settings-feedback success" : "settings-feedback error"} role="status">
                {message}
              </p>
            ) : null}
          </div>
        </article>
      </div>

      <style jsx>{`
        .settings-page-shell {
          display: grid;
          gap: 24px;
        }

        .settings-grid {
          display: grid;
          gap: 18px;
        }

        .settings-panel {
          display: grid;
          gap: 8px;
        }

        .danger-zone {
          display: grid;
          grid-template-columns: minmax(0, 1.3fr) minmax(280px, 0.7fr);
          gap: 24px;
          border: 1px solid rgba(220, 38, 38, 0.28);
          background:
            linear-gradient(135deg, rgba(127, 29, 29, 0.09), rgba(255, 255, 255, 0.02)),
            var(--panel-bg, rgba(255, 255, 255, 0.92));
        }

        .danger-zone-copy {
          display: grid;
          gap: 10px;
        }

        .danger-zone-copy ul {
          margin: 4px 0 0;
          padding-left: 18px;
          color: var(--muted, #64748b);
        }

        .danger-zone-copy li + li {
          margin-top: 6px;
        }

        .danger-eyebrow {
          color: #b91c1c;
        }

        .danger-confirmation {
          display: grid;
          align-content: start;
          gap: 10px;
          padding: 16px;
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.72);
          border: 1px solid rgba(220, 38, 38, 0.22);
        }

        .danger-confirmation label {
          font-weight: 700;
          color: #7f1d1d;
        }

        .danger-confirmation input {
          width: 100%;
          min-height: 44px;
          border-radius: 12px;
          border: 1px solid rgba(127, 29, 29, 0.28);
          padding: 0 12px;
          outline: none;
          font: inherit;
          background: white;
        }

        .danger-confirmation input:focus {
          border-color: #dc2626;
          box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.16);
        }

        .danger-confirmation small {
          color: var(--muted, #64748b);
        }

        .danger-button {
          min-height: 44px;
          border: 0;
          border-radius: 12px;
          padding: 0 16px;
          font-weight: 800;
          color: white;
          background: #dc2626;
          cursor: pointer;
          transition:
            transform 160ms ease,
            filter 160ms ease,
            opacity 160ms ease;
        }

        .danger-button:hover:not(:disabled) {
          filter: brightness(0.94);
          transform: translateY(-1px);
        }

        .danger-button:focus-visible {
          outline: 3px solid rgba(220, 38, 38, 0.35);
          outline-offset: 3px;
        }

        .danger-button:disabled {
          cursor: not-allowed;
          opacity: 0.48;
        }

        .settings-feedback {
          margin: 0;
          font-weight: 700;
        }

        .settings-feedback.success {
          color: #15803d;
        }

        .settings-feedback.error {
          color: #b91c1c;
        }

        @media (max-width: 820px) {
          .danger-zone {
            grid-template-columns: 1fr;
          }

          .danger-confirmation {
            padding: 14px;
          }

          .danger-button {
            width: 100%;
          }
        }
      `}</style>
    </section>
  );
}