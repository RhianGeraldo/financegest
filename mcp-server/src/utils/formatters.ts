export function formatBRL(value: number | string | null | undefined): string {
  const num = typeof value === "string" ? parseFloat(value) : (value ?? 0);
  if (isNaN(num)) return "R$ 0,00";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(num);
}

export function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

export function parseFlexibleDate(val?: string | null): string {
  if (!val) return todayISO();
  const lower = val.toLowerCase().trim();
  if (lower === "hoje" || lower === "today") return todayISO();
  if (lower === "ontem" || lower === "yesterday") {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split("T")[0];
  }
  if (lower === "amanha" || lower === "amanhã" || lower === "tomorrow") {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split("T")[0];
  }

  // DD/MM/YYYY
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(lower)) {
    const [day, month, year] = lower.split("/");
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  // YYYY-MM-DD
  if (lower.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(lower)) {
    return lower.slice(0, 10);
  }

  return val;
}

export function addMonths(dateStr: string, months: number): string {
  const parts = dateStr.split("-");
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);

  const d = new Date(year, month + months, day);
  const expectedMonth = (month + months) % 12;
  const normalizedExpectedMonth = expectedMonth < 0 ? expectedMonth + 12 : expectedMonth;
  if (d.getMonth() !== normalizedExpectedMonth) {
    d.setDate(0);
  }

  return d.toISOString().split("T")[0];
}

export function cleanUserNotes(notes?: string | null): string {
  if (!notes) return "";
  return notes
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith("[Boleto]:") && !trimmed.startsWith("[Comprovante]:") && !trimmed.startsWith("data:");
    })
    .join("\n")
    .trim();
}

export function composeNotesWithAttachments(
  existingNotes?: string | null,
  attachments?: { invoice?: string | null; receipt?: string | null }
): string | null {
  const base = cleanUserNotes(existingNotes);
  const parts: string[] = [];
  if (base) parts.push(base);
  if (attachments?.invoice) parts.push(`[Boleto]: ${attachments.invoice}`);
  if (attachments?.receipt) parts.push(`[Comprovante]: ${attachments.receipt}`);
  return parts.length > 0 ? parts.join("\n") : null;
}

export function getReceiptUrl(t?: { receipt_url?: string | null; notes?: string | null } | null): string | null {
  if (!t) return null;
  if (t.receipt_url) return t.receipt_url;
  if (!t.notes) return null;
  const match = t.notes.match(/\[Comprovante\]:\s*(https?:\/\/[^\s\n\r]+|data:[^\s\n\r]+)/i);
  return match ? match[1] : null;
}

export function getInvoiceUrl(t?: { invoice_url?: string | null; notes?: string | null } | null): string | null {
  if (!t) return null;
  if (t.invoice_url) return t.invoice_url;
  if (!t.notes) return null;
  const match = t.notes.match(/\[Boleto\]:\s*(https?:\/\/[^\s\n\r]+|data:[^\s\n\r]+)/i);
  if (match) return match[1];
  const directMatch = t.notes.match(/(data:application\/pdf;base64,[A-Za-z0-9+/=]+|data:image\/[^;\s]+;base64,[A-Za-z0-9+/=]+)/i);
  return directMatch ? directMatch[1] : null;
}
