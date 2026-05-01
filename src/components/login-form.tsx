"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    const supabase = createSupabaseBrowserClient();
    const authCall = mode === "login"
      ? supabase.auth.signInWithPassword({ email, password })
      : supabase.auth.signUp({ email, password, options: { data: { display_name: email.split("@")[0] } } });

    const { error: authError } = await authCall;
    setLoading(false);

    if (authError) {
      setError(authError.message);
      return;
    }

    if (mode === "signup") {
      setMessage("Conta criada. Se o Supabase pedir confirmação de e-mail, confirme antes de entrar.");
      setMode("login");
      return;
    }

    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <form className="form-stack" onSubmit={handleSubmit}>
      <div className="field">
        <label htmlFor="email">E-mail</label>
        <input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
      </div>
      <div className="field">
        <label htmlFor="password">Senha</label>
        <input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={6} />
      </div>
      {error ? <div className="error-box">{error}</div> : null}
      {message ? <div className="success-box">{message}</div> : null}
      <button className="btn btn-primary" type="submit" disabled={loading}>
        {loading ? "Processando..." : mode === "login" ? "Entrar" : "Criar conta"}
      </button>
      <button className="btn btn-muted" type="button" onClick={() => setMode(mode === "login" ? "signup" : "login")}>
        {mode === "login" ? "Criar conta nova" : "Já tenho conta"}
      </button>
    </form>
  );
}
