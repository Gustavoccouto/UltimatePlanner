"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

function getEmailRedirectTo() {
  if (typeof window === "undefined") return undefined;
  return `${window.location.origin}/auth/callback?next=/dashboard`;
}

function getFriendlyAuthError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "Erro inesperado.");

  if (message.includes("Supabase público não configurado")) {
    return "Supabase não configurado no ambiente local. Crie/ajuste o .env.local com NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY, depois reinicie o npm run dev.";
  }

  if (message.toLowerCase().includes("invalid login credentials")) {
    return "E-mail ou senha incorretos. Verifique os dados e tente novamente.";
  }

  if (message.toLowerCase().includes("email not confirmed")) {
    return "Seu e-mail ainda não foi confirmado. Abra o link enviado pelo Supabase e tente entrar novamente.";
  }

  return message;
}

export function LoginForm() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const isSignup = mode === "signup";

  const submitLabel = useMemo(() => {
    if (loading) return "Processando...";
    return isSignup ? "Criar conta" : "Entrar";
  }, [isSignup, loading]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setLoading(true);
    setError("");
    setMessage("");

    try {
      const supabase = createSupabaseBrowserClient();

      const authCall = isSignup
        ? supabase.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo: getEmailRedirectTo(),
              data: {
                display_name: email.split("@")[0]
              }
            }
          })
        : supabase.auth.signInWithPassword({ email, password });

      const { error: authError } = await authCall;

      if (authError) {
        setError(getFriendlyAuthError(authError));
        return;
      }

      if (isSignup) {
        setMessage("Conta criada. Enviamos um e-mail de confirmação com o link correto deste site. Confirme o cadastro antes de entrar.");
        setMode("login");
        return;
      }

      router.replace("/dashboard");
      router.refresh();
    } catch (caughtError) {
      setError(getFriendlyAuthError(caughtError));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <label className="auth-field">
        <span>E-mail</span>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          autoComplete="email"
          placeholder="seu@email.com"
        />
      </label>

      <label className="auth-field">
        <span>Senha</span>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          minLength={6}
          autoComplete={isSignup ? "new-password" : "current-password"}
          placeholder="Sua senha"
        />
      </label>

      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {message ? <p className="form-success" role="status">{message}</p> : null}

      <div className="auth-actions auth-actions-stacked">
        <button className="auth-submit" type="submit" disabled={loading}>
          {submitLabel}
        </button>

        <button
          className="auth-switch"
          type="button"
          disabled={loading}
          onClick={() => {
            setMode(isSignup ? "login" : "signup");
            setError("");
            setMessage("");
          }}
        >
          {isSignup ? "Já tenho conta" : "Criar conta nova"}
        </button>
      </div>

      <style jsx>{`
        .auth-form {
          display: grid;
          gap: 16px;
          width: 100%;
          margin-top: 20px;
        }

        .auth-field {
          display: grid;
          gap: 8px;
          font-weight: 700;
          color: #0f172a;
        }

        .auth-field span {
          font-size: 14px;
          letter-spacing: -0.01em;
        }

        .auth-field input {
          width: 100%;
          min-height: 46px;
          border-radius: 14px;
          border: 1px solid rgba(148, 163, 184, 0.34);
          background: rgba(255, 255, 255, 0.94);
          padding: 0 14px;
          font: inherit;
          color: #0f172a;
          outline: none;
          transition: border-color 160ms ease, box-shadow 160ms ease, background 160ms ease;
        }

        .auth-field input::placeholder {
          color: #94a3b8;
        }

        .auth-field input:focus {
          border-color: rgba(16, 185, 129, 0.75);
          background: #ffffff;
          box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.16);
        }

        .auth-actions {
          display: grid;
          gap: 12px;
          margin-top: 2px;
          width: 100%;
        }

        .auth-submit,
        .auth-switch {
          width: 100%;
          min-height: 46px;
          border-radius: 14px;
          border: 1px solid transparent;
          padding: 0 18px;
          font: inherit;
          font-weight: 800;
          cursor: pointer;
          transition: transform 160ms ease, box-shadow 160ms ease, background 160ms ease, border-color 160ms ease, opacity 160ms ease;
        }

        .auth-submit {
          color: white;
          background: linear-gradient(135deg, #10b981, #22c55e);
          box-shadow: 0 14px 28px rgba(16, 185, 129, 0.24);
        }

        .auth-submit:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 18px 34px rgba(16, 185, 129, 0.3);
        }

        .auth-switch {
          color: #0f172a;
          background: rgba(255, 255, 255, 0.86);
          border-color: rgba(148, 163, 184, 0.28);
          box-shadow: 0 10px 24px rgba(15, 23, 42, 0.07);
        }

        .auth-switch:hover:not(:disabled) {
          transform: translateY(-1px);
          background: rgba(255, 255, 255, 0.98);
          border-color: rgba(148, 163, 184, 0.44);
        }

        .auth-submit:focus-visible,
        .auth-switch:focus-visible {
          outline: 3px solid rgba(16, 185, 129, 0.26);
          outline-offset: 3px;
        }

        .auth-submit:disabled,
        .auth-switch:disabled {
          cursor: not-allowed;
          opacity: 0.62;
          transform: none;
          box-shadow: none;
        }

        .form-error,
        .form-success {
          margin: 0;
          border-radius: 14px;
          padding: 12px 14px;
          font-size: 13px;
          font-weight: 700;
          line-height: 1.45;
        }

        .form-error {
          color: #991b1b;
          background: rgba(254, 226, 226, 0.92);
          border: 1px solid rgba(220, 38, 38, 0.18);
        }

        .form-success {
          color: #166534;
          background: rgba(220, 252, 231, 0.92);
          border: 1px solid rgba(34, 197, 94, 0.2);
        }
      `}</style>
    </form>
  );
}
