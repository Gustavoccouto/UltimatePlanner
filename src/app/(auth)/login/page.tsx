import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
  return (
    <main className="auth-page auth-premium-page">
      <section className="auth-hero-panel" aria-label="Apresentação do UltimatePlanner">
        <div className="brand auth-brand">
          <div className="brand-mark" aria-hidden="true" />

          <div>
            <p className="brand-title">UltimatePlanner</p>
            <p className="brand-caption">Finanças, metas e planejamento</p>
          </div>
        </div>

        <div className="auth-hero-copy">
          <span className="eyebrow">Seu painel financeiro pessoal</span>

          <h1>Organize sua vida financeira com clareza, controle e visão de futuro.</h1>

          <p>
            O UltimatePlanner reúne contas, cartões, transações, metas, projetos, investimentos e recorrências em um
            único ambiente. Acompanhe seu dinheiro, planeje decisões importantes e mantenha tudo separado por usuário de
            forma segura.
          </p>
        </div>

        <div className="auth-feature-grid">
          <div>
            <strong>Controle</strong>
            <span>Contas, cartões e gastos</span>
          </div>

          <div>
            <strong>Planejamento</strong>
            <span>Metas, projetos e recorrências</span>
          </div>

          <div>
            <strong>Visão</strong>
            <span>Investimentos e projeções</span>
          </div>
        </div>
      </section>

      <section className="auth-card auth-card-premium">
        <span className="eyebrow">Acesso seguro</span>

        <h2 className="auth-title">Entrar no UltimatePlanner</h2>

        <p className="auth-subtitle">
          Acesse sua área pessoal para visualizar seus dados financeiros, acompanhar sua evolução e atualizar seu
          planejamento. Cada usuário vê apenas suas próprias informações e os itens compartilhados com ele.
        </p>

        <LoginForm />
      </section>
    </main>
  );
}