"use client";

import { useState } from "react";
import type { User } from "@/shared/types";
import { AppSidebar } from "./AppSidebar";

export function ProfileWorkspace({ user }: { user: User }) {
  const [message, setMessage] = useState("");
  return (
    <main className="app-layout">
      <AppSidebar user={user} active="profile" />
      <section className="main-column profile-main">
        <header className="app-topbar"><div className="breadcrumbs"><span>Service desk de TI</span><b>›</b><strong>Meu perfil</strong></div></header>
        <div className="profile-content">
          <h1>Meu perfil</h1>
          <p className="profile-intro">Seus dados de acesso ao service desk de TI.</p>
          <section className="profile-data-card">
            <div><span>Nome</span><strong>{user.name}</strong></div>
            <div><span>E-mail corporativo</span><strong>{user.email}</strong><small>♙ Gerenciado pela TI</small></div>
          </section>
          <section className="password-card">
            <div className="password-card-main"><span className="password-icon">⚿</span><div><strong>Senha</strong><span>Gerenciada pela rede Nexo</span></div><button className="secondary-button" onClick={() => setMessage("A redefinição de senha é gerenciada pela rede Nexo. Ligue para o ramal 4000; este modo de demonstração não envia e-mails.")}>⟲ &nbsp; Redefinir senha</button></div>
            <div className="password-card-note">✉ &nbsp; O Nexo Assist não armazena nem altera sua senha da rede.</div>
            {message && <p className="profile-notice" role="status">{message}</p>}
          </section>
        </div>
      </section>
    </main>
  );
}
