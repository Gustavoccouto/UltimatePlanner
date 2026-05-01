import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
  return (
    <main className="auth-page auth-premium-page">
      <section className="auth-hero-panel" aria-label="Apresentação do UltimatePlanner">
        <div className="brand auth-brand">
          <div className="brand-mark" aria-hidden="true" />
          <div>
            <p className="brand-title">UltimatePlanner</p>
            <p className="brand-caption">Finanças & Planejamento</p>
          </div>
        </div>
        <div className="auth-hero-copy">
          <span className="eyebrow">Migração web</span>
          <h1>Seu app financeiro, agora com backend real.</h1>
          <p>
            Mesma lógica de contas, cartões, projetos, metas e investimentos, preservando a identidade visual premium do projeto original.
          </p>
        </div>
        <div className="auth-feature-grid">
          <div><strong>Supabase</strong><span>Dados por usuário</span></div>
          <div><strong>Next.js</strong><span>App Router</span></div>
          <div><strong>Mobile</strong><span>Menu adaptado</span></div>
        </div>
      </section>

      <section className="auth-card auth-card-premium">
        <span className="eyebrow">Acesso</span>
        <h2 className="auth-title">Entrar no UltimatePlanner</h2>
        <p className="auth-subtitle">Use o e-mail e senha criados no Supabase Auth. Cada usuário acessa apenas seus próprios dados e itens compartilhados.</p>
        <LoginForm />
      </section>
    </main>
  );
}
