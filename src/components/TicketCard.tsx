import type { QuickAction, Ticket, TicketDraft } from "@/shared/types";
import { formatDateTime, isOverdue } from "@/server/services/sla.ts";

function StatusDot({ tone = "amber" }: { tone?: string }) {
  return <i className={`status-dot dot-${tone}`} />;
}

function ActionButtons({ actions, onAction, disabled }: { actions: QuickAction[]; onAction?: (value: string) => void; disabled?: boolean }) {
  if (!actions.length || !onAction) return null;
  return <div className="message-actions">{actions.map((action) => <button key={action.value} className={action.value === "confirmar" ? "quick-action action-primary" : "quick-action"} onClick={() => onAction(action.value)} disabled={disabled}>{action.label}</button>)}</div>;
}

export function TicketCardView({ ticket, actions, onAction, disabled }: { ticket: Ticket; actions: QuickAction[]; onAction?: (value: string) => void; disabled?: boolean }) {
  const overdue = isOverdue(ticket.slaDueAt) && !["Resolvido", "Fechado", "Cancelado"].includes(ticket.status);
  return (
    <article className="ticket-card">
      <div className="ticket-card-top"><span>Chamado <span className="muted-dot">·</span> {ticket.number}</span><strong className={`ticket-status ${overdue ? "status-overdue" : ""}`}><StatusDot tone={overdue ? "amber" : "blue"} />{ticket.status}</strong></div>
      <h3>{ticket.title}</h3>
      <p className="ticket-description">{ticket.description}</p>
      <div className="ticket-fields">
        <div><span>Categoria</span><strong>{ticket.category}</strong></div>
        <div><span>Prioridade</span><strong><StatusDot tone={ticket.priority === "Alta" || ticket.priority === "Crítica" ? "amber" : ticket.priority === "Baixa" ? "green" : "gray"} />{ticket.priority}</strong></div>
        <div><span>Aberto em</span><strong>{formatDateTime(ticket.createdAt)}</strong></div>
        <div><span>Última atualização</span><strong className={overdue ? "overdue-text" : ""}>{formatDateTime(ticket.updatedAt)}{overdue ? " · prazo vencido" : ""}</strong></div>
      </div>
      <ActionButtons actions={actions} onAction={onAction} disabled={disabled} />
    </article>
  );
}

export function TicketDraftCard({ draft, actions, onAction, disabled }: { draft: TicketDraft; actions: QuickAction[]; onAction?: (value: string) => void; disabled?: boolean }) {
  const creating = draft.operation === "create";
  const heading = creating ? "Novo chamado" : draft.operation === "reopen" ? "Reabrir chamado" : "Complementar chamado";
  const description = creating ? draft.description : `${draft.description}\n\nNova informação: ${draft.pendingNote ?? ""}`;
  return (
    <article className="ticket-card draft-card">
      <div className="ticket-card-top"><span>{heading} <span className="muted-dot">·</span> Rascunho {draft.ticketNumber ?? "D-381"}</span><strong className="draft-status"><StatusDot />Aguardando confirmação</strong></div>
      <h3>{draft.title}</h3>
      <p className="ticket-description">{description}</p>
      <div className="ticket-fields draft-fields">
        <div><span>Categoria</span><strong>{draft.category}</strong></div>
        <div><span>Prioridade</span><strong><StatusDot tone={draft.priority === "Alta" || draft.priority === "Crítica" ? "amber" : "gray"} />{draft.priority}{draft.priority === "Alta" ? " · resposta em até 4 h úteis" : draft.priority === "Média" ? " · resposta em até 3 dias úteis" : draft.priority === "Baixa" ? " · resposta em até 5 dias úteis" : " · resposta em até 1 h"}</strong></div>
        <div><span>Afetados</span><strong>{draft.affectedScope ?? "A confirmar"}</strong></div>
      </div>
      <div className="draft-card-actions"><ActionButtons actions={actions} onAction={onAction} disabled={disabled} /></div>
    </article>
  );
}

export function QuickActions({ actions, onAction, disabled }: { actions: QuickAction[]; onAction?: (value: string) => void; disabled?: boolean }) {
  return <ActionButtons actions={actions} onAction={onAction} disabled={disabled} />;
}
