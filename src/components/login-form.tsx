"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

function getEmailRedirectTo() {
  if (typeof window === "undefined") {
    return undefined;
  }

  return `${window.location.origin}/auth/callback?next=/dashboard`;
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
      : supabase.auth.signInWithPassword({
          email,
          password
        });

    const { error: authError } = await authCall;

    setLoading(false);

    if (authError) {
      setError(authError.message);
      return;
    }

    if (isSignup) {
      setMessage(
        "Conta criada. Enviamos um e-mail de confirmação com o link correto deste site. Confirme o cadastro antes de entrar."
      );
      setMode("login");
      return;
    }

    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <label>
        E-mail
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          autoComplete="email"
          placeholder="seu@email.com"
        />
      </label>

      <label>
        Senha
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

      {error ? <p className="form-error">{error}</p> : null}

      {message ? <p className="form-success">{message}</p> : null}

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
    </form>
  );
}