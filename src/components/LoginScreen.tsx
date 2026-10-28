"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Brand } from "./Brand";

export function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("ana.souza@nexo.com.br");
  const [password, setPassword] = useState("nexo2026");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const result = await response.json() as { error?: string; redirectTo?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível entrar.");
      router.push(result.redirectTo || "/chat");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível entrar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-story">
        <Brand light />
        <div className="story-copy">
          <p className="eyebrow">Service desk de TI da Nexo</p>
          <h1>Seu problema de TI, resolvido em uma conversa.</h1>
          <p className="story-description">Descreva o que está acontecendo. O assistente consulta seus chamados, busca na central de ajuda e chama um analista quando precisa.</p>
          <div className="sample-chat">
            <div className="sample-user">Meu notebook está lento desde a atualização do Windows.</div>
            <div className="sample-meta"><strong>Nexo Assist</strong><span>consultou o chamado · conferiu o prazo</span></div>
            <div className="sample-answer">O INC-20311 está sem atualização há 5 dias e o prazo da prioridade média venceu. Quer que eu chame um analista?</div>
            <div className="sample-ticket"><i /> <strong>INC-20311</strong><span>Hardware · Média · prazo vencido</span></div>
          </div>
        </div>
        <div className="service-metrics">
          <div><strong>8</strong><span>artigos na central de ajuda</span></div>
          <div><strong>30</strong><span>mensagens por sessão</span></div>
          <div><strong>2 <i className="green-dot" /></strong><span>perfis de acesso</span></div>
        </div>
      </section>
      <section className="login-panel">
        <div className="login-help">Problema para entrar? <a href="tel:4000">Ligue no ramal 4000</a></div>
        <div className="login-form-wrap">
          <h2>Entrar</h2>
          <p>Use seu e-mail corporativo e a senha da rede Nexo.</p>
          <form onSubmit={submit}>
            <label htmlFor="email">E-mail corporativo</label>
            <div className="input-wrap"><span aria-hidden="true">✉</span><input id="email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required /></div>
            <div className="label-row"><label htmlFor="password">Senha</label><a href="mailto:service-desk@nexo.com.br?subject=Redefini%C3%A7%C3%A3o%20de%20senha">Esqueci minha senha</a></div>
            <div className="input-wrap password-wrap"><span aria-hidden="true">♙</span><input id="password" type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /><button type="button" aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"} onClick={() => setShowPassword((value) => !value)}>◎</button></div>
            <label className="remember-row"><input type="checkbox" defaultChecked /> <span>Manter conectado neste computador</span></label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="primary-button login-submit" type="submit" disabled={busy}>{busy ? "Entrando…" : <>Entrar <span aria-hidden="true">→</span></>}</button>
          </form>
          <div className="login-divider" />
          <p className="demo-hint">Demonstração: Ana Souza · ana.souza@nexo.com.br</p>
        </div>
        <footer className="login-footer"><span>© 2026 Nexo · Service desk de TI</span><a href="mailto:service-desk@nexo.com.br?subject=Privacidade">Privacidade e uso de dados</a></footer>
      </section>
    </main>
  );
}
