import type { AffectedScope, TicketCategory, TicketPriority, TicketType } from "@/shared/types";

const compact = (value: string): string => value.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export function inferCategory(text: string): TicketCategory {
  const value = compact(text);
  if (/vpn|wi[- ]?fi|wifi|rede|internet|conexao|conectar/.test(value)) return "Rede e VPN";
  if (/notebook|computador|monitor|teclado|mouse|hardware|tela/.test(value)) return "Hardware";
  if (/outlook|email|e-mail|correio/.test(value)) return "E-mail";
  if (/senha|acesso|login|permissao|sharepoint|sap|conta|autenticacao/.test(value)) return "Acesso";
  if (/sistema|aplicativo|software|programa|erro 0x|windows|instalar/.test(value)) return "Software";
  return "Outros";
}

export function inferType(text: string): TicketType {
  const value = compact(text);
  return /solicito|solicitar|pedido|preciso de|quero um|equipamento|acesso a|licenca|instalacao/.test(value)
    ? "REQ"
    : "INC";
}

export function inferAffectedScope(text: string): AffectedScope | null {
  const value = compact(text);
  if (/toda a empresa|empresa toda|todos da empresa|todos estao|empresa inteira/.test(value)) return "Toda a empresa";
  if (/minha equipe|meu time|equipe toda|time todo|colegas/.test(value)) return "Minha equipe";
  if (/so eu|somente eu|apenas eu|meu notebook|meu computador/.test(value)) return "Só você";
  return null;
}

export function inferPriority(text: string, scope: AffectedScope | null, type: TicketType): TicketPriority {
  const value = compact(text);
  const broadImpact = scope === "Minha equipe" || scope === "Toda a empresa";
  const blocked = /nao consigo trabalhar|sem trabalhar|parou|indisponivel|fora do ar|todos sem|equipe sem|empresa sem|nao temos conexao|sem internet/.test(value);
  const sameDay = /hoje|agora|reuniao|cliente|prazo|urgente|14h|15h|16h|17h/.test(value);
  if (broadImpact && blocked) return "Crítica";
  if (blocked || sameDay) return "Alta";
  if (type === "REQ") return "Baixa";
  return "Média";
}

export function makeTicketTitle(text: string, category: TicketCategory): string {
  const cleaned = text
    .replace(/^(oi[,!]?\s*)?(meu|minha|o|a|estou com|tenho|preciso|quero|por favor)\s+/i, "")
    .replace(/[.!?]+$/g, "")
    .trim();
  if (cleaned.length >= 12) return cleaned.slice(0, 72);
  const defaults: Record<TicketCategory, string> = {
    "Acesso": "Preciso de ajuda com acesso",
    "Rede e VPN": "Problema de conexão com a rede ou VPN",
    "Hardware": "Problema com equipamento",
    "Software": "Problema com software",
    "E-mail": "Problema com e-mail",
    "Outros": "Solicitação de suporte de TI",
  };
  return defaults[category];
}

export function tokens(value: string): Set<string> {
  const words = compact(value).split(/[^a-z0-9]+/).filter((word) => word.length >= 4 && !["para", "meu", "minha", "esta", "isso", "problema", "chamado", "preciso"].includes(word));
  return new Set(words.map((word) => word.length > 6 ? word.replace(/(?:ados|adas|ado|ada|idos|idas|ido|ida)$/, "") : word));
}

export function similarity(left: string, right: string): number {
  const a = tokens(left);
  const b = tokens(right);
  if (!a.size || !b.size) return 0;
  const common = [...a].filter((token) => b.has(token)).length;
  return common / Math.max(a.size, b.size);
}
