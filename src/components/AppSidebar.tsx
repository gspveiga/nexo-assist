"use client";

import Link from "next/link";
import { useState } from "react";
import type { User } from "@/shared/types";
import { Brand } from "./Brand";

export function AppSidebar({ user, active, analyst = false, unreadCount = 0 }: { user: User; active: "chat" | "profile" | "console"; analyst?: boolean; unreadCount?: number }) {
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");

  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    setLogoutError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("A API não confirmou o encerramento da sessão.");
      window.location.replace("/");
    } catch {
      setLoggingOut(false);
      setLogoutError("Não foi possível sair agora. Tente novamente.");
    }
  }

  return (
    <aside className={`app-sidebar ${analyst ? "analyst-sidebar" : ""}`}>
      <div className="sidebar-brand"><Brand /></div>
      {analyst ? (
        <div className="console-sidebar-title"><span className="console-app-icon">N</span><span>Conversas</span>{unreadCount > 0 && <span className="unread-count" aria-label={`${unreadCount} conversas aguardando`}>{unreadCount}</span>}</div>
      ) : (
        <nav className="sidebar-nav" aria-label="Navegação principal">
          <Link className={active === "chat" ? "nav-item active" : "nav-item"} href="/chat"><span className="nav-icon">▱</span>Atendimento</Link>
          <Link className={active === "profile" ? "nav-item active" : "nav-item"} href="/profile"><span className="nav-icon">♙</span>Meu perfil</Link>
        </nav>
      )}
      <div className="sidebar-account">
        <div className="account-person">
          <div className="avatar avatar-blue">{initials(user.name)}</div>
          <div className="account-copy"><strong>{user.name}</strong><span>{user.email}</span></div>
        </div>
        <button className="logout-button" onClick={logout} disabled={loggingOut} aria-label="Sair" title={logoutError || "Sair"}>
          <span className="logout-icon" aria-hidden="true">⇥</span>
          <span className="logout-text">{loggingOut ? "Saindo…" : "Sair"}</span>
        </button>
        {logoutError && <span className={`logout-feedback ${analyst ? "logout-feedback-analyst" : ""}`} role="alert">{logoutError}</span>}
      </div>
    </aside>
  );
}

export function initials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toLocaleUpperCase("pt-BR");
}
