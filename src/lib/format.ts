// Utilitários de formatação BRL e datas
export const BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
});

export function formatBRL(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? parseFloat(value) : (value ?? 0);
  if (Number.isNaN(n)) return "R$ 0,00";
  return BRL.format(n);
}

export function parseBRL(input: string): number {
  // Aceita "1.234,56" ou "1234.56" ou "1234,56"
  const cleaned = input.replace(/[^\d,.-]/g, "");
  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned;
  const n = parseFloat(normalized);
  return Number.isNaN(n) ? 0 : n;
}

export function maskBRL(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  const n = parseInt(digits, 10) / 100;
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d + (d.length === 10 ? "T00:00:00" : "")) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("pt-BR");
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isOverdue(dueDate: string, status: string): boolean {
  if (status === "pago") return false;
  return new Date(dueDate + "T00:00:00") < new Date(new Date().toDateString());
}

export function statusLabel(status: string, dueDate: string): "pago" | "atrasado" | "pendente" {
  if (status === "pago") return "pago";
  return isOverdue(dueDate, status) ? "atrasado" : "pendente";
}
