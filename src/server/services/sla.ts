import type { TicketPriority } from "@/shared/types";

const timeZone = (): string => process.env.APP_TIMEZONE ?? "America/Bahia";

interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
}

function localParts(date: Date): LocalParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timeZone(),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const weekdays: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: Number(value.year),
    month: Number(value.month),
    day: Number(value.day),
    hour: Number(value.hour),
    minute: Number(value.minute),
    weekday: weekdays[value.weekday] ?? 0,
  };
}

function zonedInstant(parts: LocalParts): Date {
  const target = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  let candidate = target;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timeZone(),
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const formatted = Object.fromEntries(formatter.formatToParts(new Date(candidate)).map((part) => [part.type, part.value]));
    const actual = Date.UTC(Number(formatted.year), Number(formatted.month) - 1, Number(formatted.day), Number(formatted.hour), Number(formatted.minute));
    candidate += target - actual;
  }
  return new Date(candidate);
}

export function addBusinessMinutes(start: Date, minutes: number): Date {
  let remaining = minutes;
  let cursor = new Date(start);
  while (remaining > 0) {
    const midpoint = new Date(cursor.getTime() + 30_000);
    const parts = localParts(midpoint);
    cursor = new Date(cursor.getTime() + 60_000);
    if (parts.weekday > 0 && parts.weekday < 6 && parts.hour >= 8 && parts.hour < 18) remaining -= 1;
  }
  return cursor;
}

export function addBusinessDays(start: Date, days: number): Date {
  const parts = localParts(start);
  let remaining = days;
  const calendarCursor = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  while (remaining > 0) {
    calendarCursor.setUTCDate(calendarCursor.getUTCDate() + 1);
    const weekday = calendarCursor.getUTCDay();
    if (weekday > 0 && weekday < 6) remaining -= 1;
  }
  return zonedInstant({
    ...parts,
    year: calendarCursor.getUTCFullYear(),
    month: calendarCursor.getUTCMonth() + 1,
    day: calendarCursor.getUTCDate(),
  });
}

export function calculateSlaDueAt(priority: TicketPriority, start = new Date()): string {
  if (priority === "Crítica") return new Date(start.getTime() + 60 * 60_000).toISOString();
  if (priority === "Alta") return addBusinessMinutes(start, 4 * 60).toISOString();
  if (priority === "Média") return addBusinessDays(start, 3).toISOString();
  return addBusinessDays(start, 5).toISOString();
}

export function isOverdue(dueAt: string, now = new Date()): boolean {
  return new Date(dueAt).getTime() < now.getTime();
}

export function prioritySlaLabel(priority: TicketPriority): string {
  switch (priority) {
    case "Crítica": return "resposta em até 1 h";
    case "Alta": return "resposta em até 4 h úteis";
    case "Média": return "resposta em até 3 dias úteis";
    case "Baixa": return "resposta em até 5 dias úteis";
  }
}

export function formatShortDate(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: timeZone(), day: "2-digit", month: "short" }).format(new Date(value));
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: timeZone(), day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  }).format(new Date(value));
}
