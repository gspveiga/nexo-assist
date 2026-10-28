"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { ChatMessage, Conversation, Ticket, User } from "@/shared/types";
import { AppSidebar, initials } from "./AppSidebar";

interface QueueItem {
  conversation: Conversation;
  owner: User | null;
  messages: ChatMessage[];
  tickets: Ticket[];
}

function shortTime(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function statusTone(ticket: Ticket): string {
  if (["Resolvido", "Aprovado", "Fechado"].includes(ticket.status)) return "green";
  if (["Em andamento", "Em atendimento"].includes(ticket.status)) return "blue";
  return "amber";
}

export function ConsoleWorkspace({ analyst, initialQueue }: { analyst: User; initialQueue: QueueItem[] }) {
  const [queue, setQueue] = useState(initialQueue);
  const [selectedId, setSelectedId] = useState(initialQueue[0]?.conversation.id ?? "");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "mine" | "waiting">("all");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selected = queue.find((item) => item.conversation.id === selectedId) ?? null;
  const assignedToMe = selected?.conversation.assignedAnalystId === analyst.id;
  const waiting = selected?.conversation.state === "waiting";
  const activeTicket = selected?.tickets.find((ticket) => ticket.id === selected.conversation.activeTicketId) ?? null;

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/console", { cache: "no-store" });
      if (!response.ok) return;
      const result = await response.json() as { queue: QueueItem[] };
      setQueue(result.queue);
      setSelectedId((current) => result.queue.some((item) => item.conversation.id === current) ? current : result.queue[0]?.conversation.id ?? "");
    } catch { /* Retry on the next refresh cycle. */ }
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => void refresh(), 4000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const filteredQueue = useMemo(() => queue.filter((item) => {
    if (filter === "mine" && item.conversation.assignedAnalystId !== analyst.id) return false;
    if (filter === "waiting" && item.conversation.state !== "waiting") return false;
    const needle = search.trim().toLocaleLowerCase("pt-BR");
    if (!needle) return true;
    return `${item.owner?.name ?? ""} ${item.conversation.handoffSummary ?? ""} ${item.messages.at(-1)?.body ?? ""}`.toLocaleLowerCase("pt-BR").includes(needle);
  }), [queue, filter, search, analyst.id]);

  async function runAction(action: "take" | "return" | "close") {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/console/${selected.conversation.id}/${action}`, { method: "POST" });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Ação não concluída.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ação não concluída.");
    } finally {
      setBusy(false);
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !input.trim() || !assignedToMe) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/console/${selected.conversation.id}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: input.trim() }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "A resposta não foi enviada.");
      setInput("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "A resposta não foi enviada.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="console-layout">
      <AppSidebar user={analyst} active="console" analyst unreadCount={queue.filter((item) => item.conversation.state === "waiting").length} />
      <aside className="conversation-list-panel">
        <div className="conversation-list-head"><div className="conversation-title-row"><h1>Conversas</h1><span className="online-pill"><i />Disponível</span></div>
          <label className="search-box"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar conversa ou chamado" /></label>
          <div className="filter-row">
            <button className={filter === "all" ? "selected" : ""} onClick={() => setFilter("all")}>Todas {queue.length}</button>
            <button className={filter === "waiting" ? "selected" : ""} onClick={() => setFilter("waiting")}>Para você {queue.filter((item) => item.conversation.state === "waiting").length}</button>
            <button className={filter === "mine" ? "selected" : ""} onClick={() => setFilter("mine")}>Minhas {queue.filter((item) => item.conversation.assignedAnalystId === analyst.id).length}</button>
          </div>
        </div>
        <div className="conversation-list">
          {filteredQueue.map((item, index) => {
            const owner = item.owner;
            const last = item.messages.at(-1);
            const isWaiting = item.conversation.state === "waiting";
            const ticket = item.tickets.find((candidate) => candidate.id === item.conversation.activeTicketId);
            return <button key={item.conversation.id} className={`conversation-item ${item.conversation.id === selectedId ? "active" : ""}`} onClick={() => setSelectedId(item.conversation.id)}>
              <span className={`avatar conversation-avatar ${avatarColor(index)}`}>{owner ? initials(owner.name) : "N"}<i /></span>
              <span className="conversation-item-copy"><span className="conversation-item-name"><strong>{owner?.name ?? "Funcionário"}</strong><time>{last ? shortTime(last.createdAt) : "agora"}</time></span><span className="conversation-preview">{last?.senderRole === "employee" ? last.body : item.conversation.handoffSummary?.split("\n").at(-1) || "Atendimento transferido"}</span><span className={`conversation-tag ${isWaiting ? "red-tag" : "green-tag"}`}><i />{isWaiting ? "Transferida" : "Você está atendendo"}{ticket ? ` · ${ticket.number}` : ""}</span></span>
            </button>;
          })}
          {!filteredQueue.length && <div className="empty-queue"><span>✓</span><strong>Nenhuma conversa nesta fila</strong><p>As conversas transferidas pelo Nexo Assist aparecerão aqui.</p></div>}
        </div>
        <div className="analyst-account"><span className="avatar avatar-blue">{initials(analyst.name)}</span><div><strong>{analyst.name}</strong><span>{analyst.department}</span></div><i /></div>
      </aside>
      <section className="console-main">
        {selected && selected.owner ? (
          <>
            <header className="console-chat-header">
              <span className="avatar avatar-blue large-avatar">{initials(selected.owner.name)}</span>
              <div className="console-contact"><strong>{selected.owner.name}</strong><span>{selected.owner.department}{activeTicket ? ` · ${activeTicket.number}` : ""}</span></div>
              {waiting ? <span className="waiting-pill">♙ &nbsp; Aguardando atendente</span> : <span className="human-pill"><i />Você está atendendo</span>}
              {selected.conversation.state === "human" && assignedToMe && <button className="danger-soft-button" onClick={() => void runAction("close")} disabled={busy}>⊙ &nbsp; Encerrar atendimento</button>}
              <button className="icon-button" aria-label="Atualizar fila" onClick={() => void refresh()}>↻</button>
            </header>
            <div className="console-messages">
              {selected.conversation.handoffSummary && <div className="handoff-summary"><strong>Resumo enviado pelo Nexo Assist</strong><p>{selected.conversation.handoffSummary}</p></div>}
              {selected.messages.map((message) => <div key={message.id} className={`console-message ${message.senderRole === "employee" ? "console-customer" : message.senderRole === "analyst" ? "console-analyst" : message.senderRole === "system" ? "console-system" : "console-assistant"}`}>
                {message.senderRole === "system" ? <span>{message.body}</span> : <><div className="console-message-name">{message.senderRole === "employee" ? selected.owner?.name : message.senderRole === "analyst" ? analyst.name : "Nexo Assist"}{message.senderRole === "assistant" && <small>IA</small>}</div><div className="console-message-bubble">{message.body}<time>{shortTime(message.createdAt)}</time></div></>}
              </div>)}
            </div>
            <div className="console-control-area">
              {waiting ? <div className="waiting-control"><span className="waiting-hand">✋</span><div><strong>{selected.owner.name.split(" ")[0]} espera um atendente</strong><span>O agente está pausado enquanto esta conversa aguarda.</span></div><button className="secondary-button" onClick={() => void runAction("return")} disabled={busy}>↶ &nbsp; Devolver ao agente</button><button className="primary-button" onClick={() => void runAction("take")} disabled={busy}>♧ &nbsp; Assumir atendimento</button></div>
                : <div className="active-control"><div className="active-control-top"><div><strong>Atendimento assumido por {analyst.name}</strong><span>O Nexo Assist continua pausado nesta conversa.</span></div><button className="secondary-button" onClick={() => void runAction("return")} disabled={busy}>↶ &nbsp; Devolver ao agente</button></div><form className="analyst-composer" onSubmit={sendMessage}><input aria-label="Mensagem do analista" placeholder={assignedToMe ? "Escreva uma resposta…" : "Assuma o atendimento para responder"} value={input} onChange={(event) => setInput(event.target.value)} disabled={!assignedToMe || busy} /><button className="primary-button" type="submit" disabled={!assignedToMe || !input.trim() || busy}>Enviar&nbsp; →</button></form></div>}
              {error && <p className="inline-error" role="alert">{error}</p>}
            </div>
          </>
        ) : <div className="console-empty"><div>⌕</div><h2>Selecione uma conversa</h2><p>As transferências que precisam da equipe aparecem na lista ao lado.</p></div>}
      </section>
      <aside className="ticket-side-panel">
        <div className="ticket-side-heading"><div><strong>Chamados {selected?.owner ? `de ${selected.owner.name.split(" ")[0]}` : "do funcionário"}</strong><span>{selected?.tickets.filter((ticket) => !["Resolvido", "Fechado", "Cancelado"].includes(ticket.status)).length ?? 0} abertos · {selected?.tickets.filter((ticket) => ["Resolvido", "Fechado"].includes(ticket.status)).length ?? 0} encerrados</span></div><button aria-label="Fechar painel" onClick={() => setSelectedId("")}>×</button></div>
        {activeTicket && <div className="side-ticket-active"><span className="side-section-label">Desta conversa</span><div className="side-ticket-card"><div className="side-ticket-row"><span>{activeTicket.number}</span><strong><i className={`status-dot dot-${statusTone(activeTicket)}`} />{activeTicket.status}</strong></div><h3>{activeTicket.title}</h3><span>{activeTicket.category} · prioridade {activeTicket.priority.toLocaleLowerCase("pt-BR")}</span><div className="side-transfer-row">⇄ &nbsp; {selected?.conversation.state === "human" ? `Assumido por ${analyst.name}` : "Transferido para um analista"}<time>{shortTime(selected?.conversation.updatedAt ?? activeTicket.updatedAt)}</time></div></div></div>}
        <div className="other-tickets" id="other-tickets"><span className="side-section-label">Outros chamados</span>{selected?.tickets.filter((ticket) => ticket.id !== activeTicket?.id).map((ticket) => <div key={ticket.id} className="other-ticket"><i className={`status-dot dot-${statusTone(ticket)}`} /><div><strong>{ticket.title}</strong><span>{ticket.number} · {ticket.status}</span></div><b>›</b></div>)}</div>
        <div className="ticket-side-footer"><button className="secondary-button" onClick={() => document.getElementById("other-tickets")?.scrollIntoView({ behavior: "smooth", block: "start" })}>Ver todos os chamados ↗</button></div>
      </aside>
    </main>
  );
}

function avatarColor(index: number): string {
  return ["avatar-blue", "avatar-peach", "avatar-violet", "avatar-green", "avatar-pink", "avatar-gray"][index % 6];
}
