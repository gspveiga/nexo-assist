"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { ChatMessage, Conversation, Ticket, User } from "@/shared/types";
import { AppSidebar, initials } from "./AppSidebar";
import { QuickActions, TicketCardView, TicketDraftCard } from "./TicketCard";

interface ChatState {
  conversation: Conversation;
  messages: ChatMessage[];
}

function actionLabel(value: string): string {
  const labels: Record<string, string> = {
    buscar_central_de_ajuda: "buscou na central de ajuda",
    consultar_meus_chamados: "consultou seus chamados",
    consultar_chamado: "consultou o chamado",
    criar_chamado: "criou um chamado",
    complementar_chamado: "atualizou o chamado",
    reabrir_chamado: "reabriu o chamado",
    transferir_conversa: "transferiu para um analista",
    classificar_chamado: "classificou a prioridade",
    montar_rascunho: "montou o rascunho",
    validar_regra_de_negocio: "validou as regras do chamado",
    validar_titularidade: "verificou a titularidade",
  };
  return labels[value] ?? value.replaceAll("_", " ");
}

function MessageMeta({ message }: { message: ChatMessage }) {
  if (!message.decision) return null;
  return (
    <div className="message-meta">
      <strong>Nexo Assist</strong>
      <span aria-hidden="true">✓</span>
      <span>{actionLabel(message.decision.tool || message.decision.action)}</span>
      <details className="decision-details">
        <summary>Detalhes</summary>
        <div className="decision-popover">
          <strong>O que entendi</strong><p>{message.decision.intent}</p>
          <strong>Ação</strong><p>{message.decision.action}</p>
          <strong>Confiança</strong><p>{Math.round(message.decision.confidence * 100)}%</p>
          <strong>Por quê</strong><p>{message.decision.reason}</p>
          <strong>Resultado</strong><p>{message.decision.outcome === "success" ? "Operação confirmada" : message.decision.outcome === "blocked" ? "Ação bloqueada por regra" : message.decision.outcome === "error" ? "Falha controlada" : "Aguardando informação"}</p>
        </div>
      </details>
    </div>
  );
}

function MessageBody({ message, onAction, disabled }: { message: ChatMessage; onAction: (value: string) => void; disabled: boolean }) {
  const payload = message.payload;
  return (
    <>
      <div className={`message-bubble ${message.senderRole === "employee" ? "bubble-user" : message.senderRole === "analyst" ? "bubble-analyst" : "bubble-assistant"}`}>
        {message.body}
        {payload?.ticket && <TicketCardView ticket={payload.ticket} actions={message.actions} onAction={onAction} disabled={disabled} />}
        {payload?.draft && <TicketDraftCard draft={payload.draft} actions={message.actions} onAction={onAction} disabled={disabled} />}
        {payload?.tickets && <div className="ticket-list-card">{payload.tickets.map((ticket: Ticket) => <TicketListRow key={ticket.id} ticket={ticket} onAction={onAction} disabled={disabled} />)}</div>}
        {!payload?.ticket && !payload?.draft && !payload?.tickets && <QuickActions actions={message.actions} onAction={onAction} disabled={disabled} />}
        {message.senderRole === "analyst" && <span className="message-time">Suporte N2 · {clock(message.createdAt)}</span>}
      </div>
    </>
  );
}

function TicketListRow({ ticket, onAction, disabled }: { ticket: Ticket; onAction: (value: string) => void; disabled: boolean }) {
  const tone = ticket.status === "Aprovado" || ticket.status === "Resolvido" ? "green" : ticket.status === "Em andamento" ? "blue" : "amber";
  return (
    <button className="ticket-list-row" onClick={() => onAction(`consultar:${ticket.number}`)} disabled={disabled}>
      <span className={`radio-status ${tone}`} />
      <span className="ticket-list-number">{ticket.number}</span>
      <strong>{ticket.title}</strong>
      <span className="ticket-list-status"><i className={`status-dot dot-${tone}`} />{ticket.status}</span>
      <time>{new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(new Date(ticket.updatedAt))}</time>
    </button>
  );
}

function clock(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export function ChatWorkspace({ user, agentMode, initial, history }: { user: User; agentMode: string; initial: ChatState; history: Conversation[] }) {
  const [conversation, setConversation] = useState(initial.conversation);
  const [messages, setMessages] = useState(initial.messages);
  const [conversations, setConversations] = useState(history);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const paused = conversation.state === "waiting" || conversation.state === "human";
  const count = Math.min(conversation.sessionMessageCount, 30);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  useEffect(() => {
    const interval = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/conversations?id=${conversation.id}`, { cache: "no-store" });
        if (!response.ok) return;
        const result = await response.json() as ChatState;
        setConversation(result.conversation);
        setMessages(result.messages);
      } catch { /* A later poll retries a transient connection issue. */ }
    }, 5000);
    return () => window.clearInterval(interval);
  }, [conversation.id]);

  async function send(value: string) {
    const body = value.trim();
    if (!body || busy || paused) return;
    setBusy(true);
    setError("");
    setInput("");
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: conversation.id, message: body }),
      });
      const result = await response.json() as ChatState & { error?: string };
      if (!response.ok) throw new Error(result.error || "A mensagem não foi enviada.");
      setConversation(result.conversation);
      setMessages(result.messages);
      setConversations((items) => [result.conversation, ...items.filter((item) => item.id !== result.conversation.id)]);
    } catch (err) {
      setInput(body);
      setError(err instanceof Error ? err.message : "Não foi possível enviar a mensagem.");
    } finally {
      setBusy(false);
    }
  }

  async function startNewConversation() {
    const response = await fetch("/api/conversations", { method: "POST" });
    const result = await response.json() as { conversation: Conversation; error?: string };
    if (!response.ok) { setError(result.error || "Não foi possível iniciar uma conversa."); return; }
    setConversation(result.conversation);
    setMessages([]);
    setConversations((items) => [result.conversation, ...items]);
    setError("");
  }

  async function selectConversation(item: Conversation) {
    const response = await fetch(`/api/conversations?id=${item.id}`, { cache: "no-store" });
    const result = await response.json() as ChatState & { error?: string };
    if (!response.ok) { setHistoryError(result.error || "Não foi possível abrir a conversa."); return; }
    setConversation(result.conversation);
    setMessages(result.messages);
    setError("");
    setHistoryError("");
  }

  async function removeConversation(item: Conversation) {
    if (item.state === "waiting" || item.state === "human") return;
    if (!window.confirm("Excluir esta conversa e todas as mensagens dela? Essa ação não pode ser desfeita.")) return;
    setHistoryError("");
    try {
      const response = await fetch(`/api/conversations?id=${encodeURIComponent(item.id)}`, { method: "DELETE" });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível excluir a conversa.");
      const remaining = conversations.filter((conversationItem) => conversationItem.id !== item.id);
      setConversations((items) => items.filter((conversationItem) => conversationItem.id !== item.id));
      if (item.id === conversation.id) {
        if (remaining[0]) await selectConversation(remaining[0]);
        else await startNewConversation();
      }
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : "Não foi possível excluir a conversa.");
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send(input);
  }

  function keyboardSubmit(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send(input);
    }
  }

  const title = messages.at(-1)?.body.slice(0, 54) || "Nova conversa";
  return (
    <main className="app-layout">
      <AppSidebar user={user} active="chat" />
      <section className="main-column">
        <header className="app-topbar">
          <div className="breadcrumbs"><span>Service desk de TI</span><b>›</b><strong>Atendimento</strong></div>
          <div className={`online-pill ${agentMode === "mastra" ? "" : "local-pill"}`}><i />{agentMode === "mastra" ? "Assistente online" : "Assistente local online"}</div>
        </header>
        <div className="chat-toolbar">
          <div><h1>Atendimento</h1><p>{conversation.state === "agent" ? "Conte o que está acontecendo e acompanhe tudo por aqui." : conversation.state === "closed" ? "Esta conversa foi encerrada." : "Um analista dará continuidade ao atendimento."}</p></div>
          <div className="chat-toolbar-actions"><button className="secondary-button" onClick={() => setHistoryOpen(true)}>Histórico <span className="toolbar-count">{conversations.length}</span></button><button className="secondary-button new-chat-button" onClick={startNewConversation}>＋ Nova conversa</button></div>
        </div>
        <section className="chat-stage">
          <div className="chat-scroll" ref={scrollRef}>
            {messages.length === 0 ? (
              <div className="welcome-state">
                <div className="welcome-avatar">N</div>
                <h2>Olá, {user.name.split(" ")[0]}.</h2>
                <p>Sou o Nexo Assist. Posso consultar seus chamados, procurar na central de ajuda ou montar um chamado com você.</p>
                <div className="suggestion-grid">
                  <button onClick={() => void send("Como resolvo o erro 809 da VPN no Windows 10?")}>Como resolvo um erro técnico?</button>
                  <button onClick={() => void send("Qual o status do meu chamado?")}>Consultar meus chamados</button>
                  <button onClick={() => void send("Preciso abrir um chamado")}>Abrir um chamado</button>
                  <button onClick={() => void send("Quero falar com um analista")}>Falar com um analista</button>
                </div>
              </div>
            ) : (
              <div className="message-column">
                {messages.map((message) => (
                  <div key={message.id} className={`message-row ${message.senderRole === "employee" ? "row-user" : "row-assistant"}`}>
                    {message.senderRole === "assistant" && <MessageMeta message={message} />}
                    {message.senderRole === "system" ? <div className="system-divider"><span>{message.body}</span></div> : <MessageBody message={message} onAction={send} disabled={busy || paused} />}
                    {message.senderRole === "employee" && <span className="message-clock">{clock(message.createdAt)}</span>}
                  </div>
                ))}
                {busy && <div className="typing-indicator"><span /><span /><span />Nexo Assist está pensando…</div>}
              </div>
            )}
          </div>
          {paused ? (
            <div className="paused-banner"><span className="paused-icon">✋</span><div><strong>{conversation.state === "closed" ? "Atendimento encerrado" : "Aguardando um atendente"}</strong><span>{conversation.state === "closed" ? "Crie uma nova conversa para voltar ao Nexo." : "O Nexo Assist está pausado. Você pode acompanhar esta conversa enquanto aguarda."}</span></div></div>
          ) : (
            <div className="composer-wrap">
              {error && <div className="inline-error" role="alert">{error}</div>}
              <form className="chat-composer" onSubmit={submit}>
                <textarea aria-label="Mensagem para o Nexo Assist" placeholder="Escreva para o Nexo…" value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={keyboardSubmit} maxLength={2000} disabled={busy || count >= 30} />
                <button className="primary-button send-button" type="submit" disabled={busy || !input.trim() || count >= 30}><span aria-hidden="true">↑</span> Enviar</button>
              </form>
              <div className="composer-caption"><span>Enter para enviar · Shift + Enter para nova linha</span><span className={count >= 30 ? "limit-reached" : ""}>{count}/30 mensagens nesta sessão</span></div>
            </div>
          )}
        </section>
        <footer className="chat-bottom-note"><span><i /> Seus chamados são visíveis apenas para você e para o service desk.</span><span>Histórico salvo automaticamente</span></footer>
      </section>
      {historyOpen && <button className="history-backdrop" aria-label="Fechar histórico" onClick={() => setHistoryOpen(false)} />}
      <aside className={`chat-history-panel ${historyOpen ? "history-open" : ""}`}>
        <div className="history-head"><div><strong>Conversas</strong><span>{conversations.length} salvas</span></div><button onClick={() => setHistoryOpen(false)} aria-label="Fechar histórico">×</button></div>
        {historyError && <div className="history-error" role="alert">{historyError}</div>}
        <div className="history-list">
          {conversations.length === 0 ? <p className="history-empty">Nenhuma conversa salva.</p> : conversations.map((item) => {
            const selected = item.id === conversation.id;
            const activeWithServiceDesk = item.state === "waiting" || item.state === "human";
            return <div key={item.id} className="history-row">
              <button className={`history-item ${selected ? "selected" : ""}`} onClick={() => void selectConversation(item)}>
                <div className="history-avatar">{initials(user.name)}</div>
                <div className="history-copy"><strong>{selected ? title : item.state === "waiting" ? "Aguardando analista" : "Atendimento de TI"}</strong><span>{new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(item.updatedAt))} · {item.state === "waiting" ? "Transferida" : item.state === "human" ? "Com analista" : item.state === "closed" ? "Encerrada" : "Com o agente"}</span></div>
              </button>
              <button className="history-delete" type="button" onClick={() => void removeConversation(item)} disabled={busy || activeWithServiceDesk} title={activeWithServiceDesk ? "A conversa está com o service desk" : "Excluir conversa"} aria-label={`Excluir conversa das ${new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(item.updatedAt))}`}>Excluir</button>
            </div>;
          })}
        </div>
        <div className="history-footer"><div className="mini-kb-icon">⌕</div><strong>Central de ajuda</strong><span>Artigos rápidos sobre sistemas e acessos da Nexo.</span><button onClick={() => { setHistoryOpen(false); void send("faq:lista"); }}>Explorar artigos →</button></div>
      </aside>
    </main>
  );
}
