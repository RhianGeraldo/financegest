import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, applyCompanyFilter } from "@/lib/auth";
import { formatBRL, formatDate, formatDateTime, statusLabel, todayISO, maskBRL, parseBRL, addMonths } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { DatePicker } from "@/components/ui/date-picker";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card";
import { Plus, Search, Trash2, CheckCircle2, Filter, Edit2, Paperclip, ExternalLink, FileText, X, Eye, Download } from "lucide-react";
import { toast } from "sonner";

async function uploadTransactionFile(file: File, txId: string, prefix: "invoice" | "receipt" = "receipt"): Promise<string | null> {
  try {
    const ext = file.name.split(".").pop() || "png";
    const path = `${txId}/${prefix}_${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from("receipts").upload(path, file, { upsert: true });
    if (uploadError) {
      console.warn(`Storage upload warn for ${prefix} (falling back to DataURL if storage unavailable):`, uploadError.message);
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
      });
    }
    const { data: publicUrlData } = supabase.storage.from("receipts").getPublicUrl(path);
    return publicUrlData.publicUrl;
  } catch (err: any) {
    console.error(`Erro ao enviar ${prefix}:`, err);
    return null;
  }
}

export const uploadReceiptFile = (file: File, txId: string) => uploadTransactionFile(file, txId, "receipt");

export function openFileInNewTab(url: string) {
  if (url.startsWith("data:")) {
    try {
      const parts = url.split(";base64,");
      const mime = parts[0].replace("data:", "") || "application/pdf";
      const byteCharacters = atob(parts[1]);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: mime });
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, "_blank");
      return;
    } catch (e) {
      console.error("Erro ao abrir base64 em nova aba:", e);
    }
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

export function downloadFile(url: string, filename = "documento") {
  if (url.startsWith("data:")) {
    try {
      const parts = url.split(";base64,");
      const mime = parts[0].replace("data:", "") || "application/pdf";
      const ext = mime.includes("pdf") ? ".pdf" : mime.includes("png") ? ".png" : ".jpg";
      const byteCharacters = atob(parts[1]);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: mime });
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename.endsWith(ext) ? filename : `${filename}${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
      return;
    } catch (e) {
      console.error("Erro ao baixar base64:", e);
    }
  }
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
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
  const currentInvoice = attachments?.invoice !== undefined ? attachments.invoice : getInvoiceUrl({ notes: existingNotes });
  const currentReceipt = attachments?.receipt !== undefined ? attachments.receipt : getReceiptUrl({ notes: existingNotes });

  const parts: string[] = [];
  if (base) parts.push(base);
  if (currentInvoice) parts.push(`[Boleto]: ${currentInvoice}`);
  if (currentReceipt) parts.push(`[Comprovante]: ${currentReceipt}`);

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

function AttachmentBadge({
  url,
  type,
  onOpen,
}: {
  url: string;
  type: "invoice" | "receipt";
  onOpen: (url: string, title: string) => void;
}) {
  const isInvoice = type === "invoice";
  const title = isInvoice ? "Boleto / Fatura" : "Comprovante de Pagamento";
  const isPdf = url.toLowerCase().includes(".pdf") || url.includes("application/pdf");

  return (
    <HoverCard openDelay={150} closeDelay={150}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onOpen(url, title);
          }}
          className={cn(
            "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium border transition-all cursor-pointer shadow-2xs hover:scale-105 active:scale-95",
            isInvoice
              ? "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 hover:border-blue-300 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800 dark:hover:bg-blue-900/60"
              : "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 hover:border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800 dark:hover:bg-emerald-900/60"
          )}
          title={`Clique para visualizar ${title}`}
        >
          {isInvoice ? <FileText className="size-3 shrink-0" /> : <Paperclip className="size-3 shrink-0" />}
          <span>{isInvoice ? "Boleto" : "Comprovante"}</span>
        </button>
      </HoverCardTrigger>
      <HoverCardContent side="top" align="center" className="w-64 p-2.5 z-50 shadow-lg">
        <div className="space-y-2">
          <div className="flex items-center justify-between border-b pb-1.5 text-xs font-semibold">
            <span className="flex items-center gap-1.5 text-foreground truncate max-w-[170px]">
              {isInvoice ? <FileText className="size-3.5 text-blue-600 shrink-0" /> : <CheckCircle2 className="size-3.5 text-emerald-600 shrink-0" />}
              {title}
            </span>
            <span className="text-[10px] text-muted-foreground uppercase font-mono px-1 py-0.5 bg-muted rounded">
              {isPdf ? "PDF" : "Imagem"}
            </span>
          </div>
          <div
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onOpen(url, title);
            }}
            className="w-full h-36 bg-muted/30 rounded border flex items-center justify-center overflow-hidden cursor-pointer hover:opacity-90 transition-opacity relative group"
          >
            {isPdf ? (
              <div className="flex flex-col items-center justify-center p-3 text-center">
                <FileText className="size-10 text-primary/70 mb-1" />
                <span className="text-xs font-medium text-foreground">Documento em PDF</span>
                <span className="text-[10px] text-muted-foreground mt-0.5">Clique para visualizar</span>
              </div>
            ) : (
              <img src={url} alt={title} className="max-h-full max-w-full object-contain" />
            )}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-medium gap-1">
              <Eye className="size-3.5" /> Visualizar
            </div>
          </div>
          <div className="flex items-center justify-between text-[11px] pt-0.5">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onOpen(url, title);
              }}
              className="text-primary hover:underline font-medium flex items-center gap-1"
            >
              <Eye className="size-3" /> Ver em tela cheia
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground flex items-center gap-1 hover:underline"
                onClick={(e) => {
                  e.stopPropagation();
                  downloadFile(url, isInvoice ? "boleto" : "comprovante");
                }}
                title="Baixar arquivo"
              >
                <Download className="size-3" /> Baixar
              </button>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground flex items-center gap-1 hover:underline"
                onClick={(e) => {
                  e.stopPropagation();
                  openFileInNewTab(url);
                }}
                title="Abrir em nova aba"
              >
                <ExternalLink className="size-3" /> Nova aba
              </button>
            </div>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

interface TransacoesSearch {
  editId?: string;
}

export const Route = createFileRoute("/_authenticated/transacoes")({
  validateSearch: (search: Record<string, unknown>): TransacoesSearch => {
    return {
      editId: (search.editId as string) || undefined,
    };
  },
  component: TransacoesPage,
  head: () => ({ meta: [{ title: "Transações — Gestão Financeira" }] }),
});

function TransacoesPage() {
  const { editId } = Route.useSearch();
  const { selectedCompanyId, companies, canWrite, loading, user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterCompany, setFilterCompany] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterMinAmount, setFilterMinAmount] = useState("");
  const [filterMaxAmount, setFilterMaxAmount] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [open, setOpen] = useState(false);
  const [editData, setEditData] = useState<any>(null);
  const [markPaidId, setMarkPaidId] = useState<string | null>(null);
  const [markPaidDate, setMarkPaidDate] = useState<string>(todayISO());

  const filteredCompanies = companies.filter(c => {
    if (selectedCompanyId === "all_clinica") return c.kind === "clinica";
    if (selectedCompanyId === "all_pessoal") return c.kind === "pessoal";
    const active = companies.find(ac => ac.id === selectedCompanyId);
    if (active) return c.kind === active.kind;
    return true;
  });

  const { data: txs, isPending } = useQuery({
    queryKey: ["transactions", selectedCompanyId, companies.map(c => c.id).join(",")],
    queryFn: async () => {
      let q = supabase
        .from("transactions")
        .select("id, company_id, type, description, amount, category_id, cost_center_id, bank_account_id, due_date, paid_date, status, notes, created_by, paid_by, receipt_url, invoice_url, created_at")
        .order("due_date", { ascending: false });
      q = applyCompanyFilter(q, selectedCompanyId, companies);
      const { data, error } = await q;
      if (error && (error.message.includes("invoice_url") || (error as any).code === "PGRST204" || (error as any).code === "42703")) {
        let fallbackQ = supabase
          .from("transactions")
          .select("id, company_id, type, description, amount, category_id, cost_center_id, bank_account_id, due_date, paid_date, status, notes, created_by, paid_by, receipt_url, created_at")
          .order("due_date", { ascending: false });
        fallbackQ = applyCompanyFilter(fallbackQ, selectedCompanyId, companies);
        const { data: fallbackData, error: fallbackError } = await fallbackQ;
        if (fallbackError) throw fallbackError;
        return (fallbackData ?? []).map((t: any) => ({ ...t, invoice_url: null }));
      }
      if (error) throw error;
      return data ?? [];
    },
    enabled: !loading,
  });

  useEffect(() => {
    if (!editId) return;
    if (txs) {
      const found = txs.find((t) => t.id === editId);
      if (found) {
        setEditData(found);
        setOpen(true);
        return;
      }
    }
    supabase.from("transactions").select("*").eq("id", editId).single().then(({ data }) => {
      if (data) {
        setEditData(data);
        setOpen(true);
      }
    });
  }, [editId, txs]);

  const filtered = (txs ?? []).filter((t) => {
    // Descrição
    if (search && !t.description.toLowerCase().includes(search.toLowerCase())) return false;
    // Empresa
    if (filterCompany !== "all" && t.company_id !== filterCompany) return false;
    // Tipo
    if (filterType !== "all" && t.type !== filterType) return false;
    // Status
    if (filterStatus !== "all") {
      const st = statusLabel(t.status, t.due_date);
      if (st !== filterStatus) return false;
    }
    // Datas
    if (filterDateFrom && new Date(t.due_date + "T12:00:00") < new Date(filterDateFrom + "T00:00:00")) return false;
    if (filterDateTo && new Date(t.due_date + "T12:00:00") > new Date(filterDateTo + "T23:59:59")) return false;
    // Valores
    if (filterMinAmount) {
      const min = parseBRL(filterMinAmount);
      if (t.amount < min) return false;
    }
    if (filterMaxAmount) {
      const max = parseBRL(filterMaxAmount);
      if (t.amount > max) return false;
    }
    return true;
  });

  const userIdsKey = Array.from(new Set([
    ...(txs ?? []).map(t => t.created_by),
    ...(txs ?? []).map(t => t.paid_by)
  ].filter((id): id is string => !!id))).sort().join(",");

  const { data: profiles } = useQuery({
    queryKey: ["profiles", userIdsKey],
    queryFn: async () => {
      const ids = userIdsKey ? userIdsKey.split(",") : [];
      if (ids.length === 0) return [];
      const { data, error } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      if (error) throw error;
      return data ?? [];
    },
    enabled: userIdsKey.length > 0,
    staleTime: 10 * 60 * 1000,
  });

  const [markPaidFile, setMarkPaidFile] = useState<File | null>(null);
  const [previewFile, setPreviewFile] = useState<{ url: string; title: string } | null>(null);
  const openPreview = (url: string, title = "Visualizar Documento") => setPreviewFile({ url, title });

  const submitMarkPaid = async () => {
    if (!markPaidId) return;
    const timePart = new Date().toISOString().slice(10);
    const finalPaidDate = markPaidDate.includes("T") ? markPaidDate : markPaidDate + timePart;
    
    let receiptUrl: string | null = null;
    if (markPaidFile) {
      receiptUrl = await uploadTransactionFile(markPaidFile, markPaidId, "receipt");
    }

    const payload: any = {
      status: "pago",
      paid_date: finalPaidDate,
      paid_by: user?.id,
    };
    if (receiptUrl) payload.receipt_url = receiptUrl;

    let { error } = await supabase
      .from("transactions")
      .update(payload)
      .eq("id", markPaidId);

    // Fallback gracioso se a coluna receipt_url não existir no banco do Supabase
    if (error && (error.message.includes("receipt_url") || error.message.includes("schema cache"))) {
      delete payload.receipt_url;
      if (receiptUrl) {
        const { data: currentTx } = await supabase.from("transactions").select("notes").eq("id", markPaidId).single();
        payload.notes = composeNotesWithAttachments(currentTx?.notes, { receipt: receiptUrl });
      }
      const retry = await supabase.from("transactions").update(payload).eq("id", markPaidId);
      error = retry.error;
    }

    if (error) return toast.error("Erro", { description: error.message });
    toast.success("Marcada como paga com sucesso");
    setMarkPaidId(null);
    setMarkPaidFile(null);
    qc.invalidateQueries({ queryKey: ["transactions"] });
    qc.invalidateQueries({ queryKey: ["tx"] });
  };

  const handleQuickAttachInvoice = async (txId: string, file: File) => {
    const toastId = toast.loading("Enviando boleto/fatura...");
    try {
      const uploadedUrl = await uploadTransactionFile(file, txId, "invoice");
      if (!uploadedUrl) {
        toast.error("Não foi possível enviar o arquivo", { id: toastId });
        return;
      }
      let payload: any = { invoice_url: uploadedUrl };
      let { error } = await supabase.from("transactions").update(payload).eq("id", txId);
      if (error && (error.message.includes("invoice_url") || error.message.includes("schema cache"))) {
        const { data: currentTx } = await supabase.from("transactions").select("notes").eq("id", txId).single();
        payload = { notes: composeNotesWithAttachments(currentTx?.notes, { invoice: uploadedUrl }) };
        const retry = await supabase.from("transactions").update(payload).eq("id", txId);
        error = retry.error;
      }
      if (error) {
        toast.error("Erro ao salvar anexo: " + error.message, { id: toastId });
        return;
      }
      toast.success("Boleto/fatura anexado com sucesso!", { id: toastId });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["tx"] });
    } catch (err: any) {
      toast.error("Erro: " + err.message, { id: toastId });
    }
  };

  const handleQuickAttachReceipt = async (txId: string, file: File) => {
    const toastId = toast.loading("Enviando comprovante...");
    try {
      const uploadedUrl = await uploadTransactionFile(file, txId, "receipt");
      if (!uploadedUrl) {
        toast.error("Não foi possível enviar o arquivo", { id: toastId });
        return;
      }
      let payload: any = { receipt_url: uploadedUrl };
      let { error } = await supabase.from("transactions").update(payload).eq("id", txId);
      if (error && (error.message.includes("receipt_url") || error.message.includes("schema cache"))) {
        const { data: currentTx } = await supabase.from("transactions").select("notes").eq("id", txId).single();
        payload = { notes: composeNotesWithAttachments(currentTx?.notes, { receipt: uploadedUrl }) };
        const retry = await supabase.from("transactions").update(payload).eq("id", txId);
        error = retry.error;
      }
      if (error) {
        toast.error("Erro ao salvar comprovante: " + error.message, { id: toastId });
        return;
      }
      toast.success("Comprovante anexado com sucesso!", { id: toastId });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["tx"] });
    } catch (err: any) {
      toast.error("Erro: " + err.message, { id: toastId });
    }
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("transactions").delete().eq("id", id);
    if (error) return toast.error("Erro", { description: error.message });
    toast.success("Excluída");
    qc.invalidateQueries({ queryKey: ["transactions"] });
  };

  const [headerNode, setHeaderNode] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setHeaderNode(document.getElementById("page-header"));
  }, []);

  return (
    <div className="space-y-4 max-w-[1400px] mx-auto">
      {headerNode && createPortal(
        <div className="flex flex-col">
          <h1 className="text-xl font-semibold tracking-tight leading-none">Transações</h1>
          <p className="text-xs text-muted-foreground mt-1">
            <span className="font-medium text-foreground">
              {selectedCompanyId === "all_clinica" ? "Consolidado Comercial" : selectedCompanyId === "all_pessoal" ? "Consolidado Pessoal" : companies.find((c) => c.id === selectedCompanyId)?.name ?? ""}
            </span>
            {" • "}{filtered.length} registro(s)
          </p>
        </div>,
        headerNode
      )}


      {/* Mark Paid Dialog */}
      <Dialog open={!!markPaidId} onOpenChange={(o) => { if (!o) { setMarkPaidId(null); setMarkPaidFile(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmar pagamento</DialogTitle>
            <DialogDescription className="sr-only">Selecione a data e comprovante do pagamento</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {(() => {
              const currentTx = txs?.find((t) => t.id === markPaidId);
              const invoiceUrl = getInvoiceUrl(currentTx);
              if (!invoiceUrl) return null;
              return (
                <div className="p-3 bg-muted/40 rounded-lg border flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <FileText className="size-4 text-primary" />
                    <div>
                      <p className="font-medium text-foreground">Boleto / Fatura anexo</p>
                      <p className="text-muted-foreground">Consulte o documento para conferir ou pagar</p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs gap-1.5"
                    onClick={() => openPreview(invoiceUrl, "Boleto / Fatura")}
                  >
                    <ExternalLink className="size-3" /> Visualizar
                  </Button>
                </div>
              );
            })()}

            <div className="space-y-2">
              <Label>Data do Pagamento</Label>
              <DatePicker value={markPaidDate} onChange={(v) => setMarkPaidDate(v)} />
            </div>
            <div className="space-y-2">
              <Label>Comprovante de Pagamento (opcional)</Label>
              <Input
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => setMarkPaidFile(e.target.files?.[0] || null)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setMarkPaidId(null); setMarkPaidFile(null); }}>Cancelar</Button>
            <Button onClick={submitMarkPaid}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unified File Preview Dialog */}
      <Dialog open={!!previewFile} onOpenChange={(o) => !o && setPreviewFile(null)}>
        <DialogContent className="sm:max-w-4xl w-[95vw] max-h-[92vh] flex flex-col p-4 sm:p-6">
          <DialogHeader className="pb-3 border-b">
            <DialogTitle className="text-base flex items-center justify-between">
              <span className="flex items-center gap-2">
                {previewFile?.title?.includes("Boleto") ? (
                  <FileText className="size-4 text-blue-600 dark:text-blue-400" />
                ) : (
                  <Paperclip className="size-4 text-emerald-600 dark:text-emerald-400" />
                )}
                {previewFile?.title || "Visualização do Arquivo"}
              </span>
              {previewFile?.url && (
                <div className="flex items-center gap-3 mr-6">
                  <button
                    type="button"
                    onClick={() => downloadFile(previewFile.url, previewFile.title || "documento")}
                    className="text-xs text-muted-foreground hover:text-foreground font-normal flex items-center gap-1 hover:underline cursor-pointer"
                  >
                    <Download className="size-3.5" /> Baixar
                  </button>
                  <button
                    type="button"
                    onClick={() => openFileInNewTab(previewFile.url)}
                    className="text-xs text-primary font-normal flex items-center gap-1 hover:underline cursor-pointer"
                  >
                    <ExternalLink className="size-3.5" /> Abrir em nova aba
                  </button>
                </div>
              )}
            </DialogTitle>
            <DialogDescription className="sr-only">Visualização do documento anexo</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto flex items-center justify-center min-h-[350px] max-h-[calc(92vh-130px)] bg-muted/20 rounded-md p-2 border my-2">
            {previewFile?.url && (
              previewFile.url.toLowerCase().includes(".pdf") || previewFile.url.includes("application/pdf") ? (
                <iframe src={previewFile.url} className="w-full h-[650px] rounded border-0" title={previewFile.title} />
              ) : (
                <img
                  src={previewFile.url}
                  alt={previewFile.title}
                  className="max-h-[650px] max-w-full object-contain rounded shadow-sm"
                />
              )
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full">
            <div className="flex gap-2 w-full sm:w-auto">
              {canWrite && (
                <Dialog open={open} onOpenChange={(o) => { setOpen(o); if(!o) setEditData(null); }}>
                  <DialogTrigger asChild>
                    <Button className="flex-1 sm:flex-none" onClick={() => setEditData(null)}><Plus className="size-4 mr-1" /> Nova transação</Button>
                  </DialogTrigger>
                  {open && (
                    <TransactionDialog
                      initialData={editData}
                      onClose={() => { setOpen(false); setEditData(null); }}
                      onPreviewFile={(url, title) => openPreview(url, title)}
                      onPreviewReceipt={(url) => openPreview(url, "Comprovante de Pagamento")}
                    />
                  )}
                </Dialog>
              )}
              <Button className="flex-1 sm:flex-none" variant={showFilters ? "secondary" : "outline"} onClick={() => setShowFilters(!showFilters)}>
                <Filter className="size-4 mr-2" />
                Filtros
              </Button>
            </div>
            <div className="relative flex-1 w-full sm:max-w-sm">
              <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar descrição…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 w-full"
              />
            </div>
          </div>

          {showFilters && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 mt-4 pt-4 border-t">
              <div className="space-y-1.5">
                <Label className="text-xs">Empresa</Label>
                <Select value={filterCompany} onValueChange={setFilterCompany}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todas" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {filteredCompanies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Tipo</Label>
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="entrada">Entradas</SelectItem>
                    <SelectItem value="saida">Saídas</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Status</Label>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="pendente">Pendente</SelectItem>
                    <SelectItem value="pago">Pago</SelectItem>
                    <SelectItem value="atrasado">Atrasado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">De (Data)</Label>
                <DatePicker className="h-8 text-xs" value={filterDateFrom} onChange={setFilterDateFrom} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Até (Data)</Label>
                <DatePicker className="h-8 text-xs" value={filterDateTo} onChange={setFilterDateTo} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Valor Min / Max</Label>
                <div className="flex gap-1">
                  <Input placeholder="R$ Min" className="h-8 text-xs w-full px-2" value={filterMinAmount} onChange={(e) => setFilterMinAmount(maskBRL(e.target.value))} />
                  <Input placeholder="R$ Max" className="h-8 text-xs w-full px-2" value={filterMaxAmount} onChange={(e) => setFilterMaxAmount(maskBRL(e.target.value))} />
                </div>
              </div>
            </div>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {/* Mobile Card View */}
          <div className="md:hidden flex flex-col max-h-[calc(100vh-240px)] overflow-y-auto">
            {filtered.map((t) => {
              const st = statusLabel(t.status, t.due_date);
              const company = companies.find((c) => c.id === t.company_id);
              return (
                <div key={t.id} className="p-4 border-b last:border-0 hover:bg-accent/30 flex flex-col gap-2">
                  <div className="flex justify-between items-start">
                    <div className="min-w-0 pr-2">
                      <p className="font-medium text-sm truncate">{t.description}</p>
                      {company && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                          <span className="size-1.5 rounded-full shrink-0" style={{ background: company.color }} />
                          <span className="truncate">{company.name}</span>
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Lançado por: <span className="font-medium text-foreground">{profiles?.find((p: any) => p.id === t.created_by)?.full_name || "Usuário"}</span> em {formatDateTime(t.created_at)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">Vencimento: {formatDate(t.due_date)}</p>
                      {t.paid_date && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Baixa por: <span className="font-medium text-foreground">{profiles?.find((p: any) => p.id === t.paid_by)?.full_name || "Usuário"}</span> em {formatDateTime(t.paid_date)}
                        </p>
                      )}
                      {cleanUserNotes(t.notes) && (
                        <p className="text-xs text-muted-foreground/80 italic mt-0.5 line-clamp-1" title={cleanUserNotes(t.notes)}>
                          Obs: {cleanUserNotes(t.notes)}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-2 mt-2 pt-2 border-t border-dashed border-border/40">
                        {getInvoiceUrl(t) && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); openPreview(getInvoiceUrl(t)!, "Boleto / Fatura"); }}
                            className="h-7 px-2.5 text-xs font-medium bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-900/60 border-blue-200 dark:border-blue-800 gap-1.5"
                          >
                            <FileText className="size-3.5 text-blue-600 dark:text-blue-400" />
                            <span>Ver Boleto / Fatura</span>
                          </Button>
                        )}
                        {getReceiptUrl(t) && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); openPreview(getReceiptUrl(t)!, "Comprovante de Pagamento"); }}
                            className="h-7 px-2.5 text-xs font-medium bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-900/60 border-emerald-200 dark:border-emerald-800 gap-1.5"
                          >
                            <Paperclip className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                            <span>Ver Comprovante</span>
                          </Button>
                        )}
                        {!getInvoiceUrl(t) && canWrite && (
                          <label
                            htmlFor={`mobile-quick-invoice-${t.id}`}
                            className="inline-flex items-center gap-1.5 px-2.5 h-7 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground bg-muted/40 hover:bg-muted border border-dashed border-border/70 cursor-pointer transition-colors"
                            title="Anexar boleto ou fatura antes de pagar"
                          >
                            <Plus className="size-3.5" />
                            <span>Anexar Boleto</span>
                            <input
                              id={`mobile-quick-invoice-${t.id}`}
                              type="file"
                              accept="image/*,application/pdf"
                              className="sr-only"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleQuickAttachInvoice(t.id, file);
                                e.target.value = "";
                              }}
                            />
                          </label>
                        )}
                        {!getReceiptUrl(t) && t.status === "pago" && canWrite && (
                          <label
                            htmlFor={`mobile-quick-receipt-${t.id}`}
                            className="inline-flex items-center gap-1.5 px-2.5 h-7 rounded-md text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 bg-emerald-500/10 hover:bg-emerald-500/20 border border-dashed border-emerald-500/30 cursor-pointer transition-colors"
                            title="Anexar comprovante de pagamento"
                          >
                            <Plus className="size-3.5" />
                            <span>Anexar Comprovante</span>
                            <input
                              id={`mobile-quick-receipt-${t.id}`}
                              type="file"
                              accept="image/*,application/pdf"
                              className="sr-only"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleQuickAttachReceipt(t.id, file);
                                e.target.value = "";
                              }}
                            />
                          </label>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0 flex flex-col items-end">
                      <p className={`text-sm font-semibold tabular ${t.type === "entrada" ? "text-success" : "text-destructive"}`}>
                        {t.type === "entrada" ? "+" : "-"} {formatBRL(t.amount)}
                      </p>
                      <Badge variant={st === "pago" ? "default" : st === "atrasado" ? "destructive" : "secondary"} className="mt-1 text-[10px] leading-none px-1.5 py-0.5">
                        {st}
                      </Badge>
                    </div>
                  </div>
                  {canWrite && (
                    <div className="flex justify-end gap-2 mt-2 pt-2 border-t border-dashed border-border/50">
                      {t.status !== "pago" && (
                        <Button size="sm" variant="secondary" className="h-7 text-xs bg-success/10 text-success hover:bg-success/20 border-none px-2" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMarkPaidId(t.id); setMarkPaidDate(todayISO()); }}>
                          <CheckCircle2 className="size-3 mr-1" /> Marcar Pago
                        </Button>
                      )}
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={() => { setEditData(t); setOpen(true); }}>
                        <Edit2 className="size-3" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:bg-destructive/10 px-2">
                            <Trash2 className="size-3 mr-1" /> Excluir
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Excluir transação?</AlertDialogTitle>
                            <AlertDialogDescription>Esta ação não pode ser desfeita. A transação será removida permanentemente.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => remove(t.id)}>Excluir</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  )}
                </div>
              );
            })}
            {isPending && <p className="p-6 text-center text-sm text-muted-foreground animate-pulse">Carregando transações...</p>}
            {!isPending && filtered.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">Nenhuma transação encontrada.</p>}
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto overflow-y-auto max-h-[calc(100vh-240px)] w-full min-w-0">
            <table className="w-full text-sm relative min-w-[750px]">
              <thead className="text-xs text-muted-foreground border-b sticky top-0 bg-card z-10 shadow-sm">
                <tr className="text-left">
                  <th className="py-2 px-2">Descrição</th>
                  <th className="py-2 px-2">Tipo</th>
                  <th className="py-2 px-2">Lançamento</th>
                  <th className="py-2 px-2">Vencimento</th>
                  <th className="py-2 px-2">Pagamento</th>
                  <th className="py-2 px-2">Status</th>
                  <th className="py-2 px-2 text-center">Anexos</th>
                  <th className="py-2 px-2 text-right">Valor</th>
                  <th className="py-2 px-2 w-20"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => {
                  const st = statusLabel(t.status, t.due_date);
                  const company = companies.find((c) => c.id === t.company_id);
                  return (
                    <tr key={t.id} className="border-b last:border-0 hover:bg-accent/30">
                      <td className="py-3 px-2">
                        <div className="font-medium">{t.description}</div>
                        {company && (
                          <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                            <span className="size-1.5 rounded-full" style={{ background: company.color }} />
                            {company.name}
                          </div>
                        )}
                        {cleanUserNotes(t.notes) && (
                          <div className="text-[11px] text-muted-foreground/80 italic line-clamp-1 mt-0.5" title={cleanUserNotes(t.notes)}>
                            Obs: {cleanUserNotes(t.notes)}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-2">
                        <Badge variant={t.type === "entrada" ? "default" : "secondary"}>
                          {t.type === "entrada" ? "Entrada" : "Saída"}
                        </Badge>
                      </td>
                      <td className="py-3 px-2 text-muted-foreground">
                        <div className="flex flex-col">
                          <span>{formatDateTime(t.created_at)}</span>
                          <span className="text-[10px] opacity-80">por {profiles?.find((p: any) => p.id === t.created_by)?.full_name || "Usuário"}</span>
                        </div>
                      </td>
                      <td className="py-3 px-2">{formatDate(t.due_date)}</td>
                      <td className="py-3 px-2 text-muted-foreground">
                        {t.paid_date ? (
                          <div className="flex flex-col">
                            <span>{formatDateTime(t.paid_date)}</span>
                            {t.paid_by && profiles?.find((p: any) => p.id === t.paid_by) && (
                              <span className="text-[10px] opacity-80">por {profiles.find((p: any) => p.id === t.paid_by)?.full_name}</span>
                            )}
                          </div>
                        ) : "-"}
                      </td>
                      <td className="py-3 px-2">
                        <Badge variant={st === "pago" ? "default" : st === "atrasado" ? "destructive" : "secondary"}>
                          {st}
                        </Badge>
                      </td>
                      <td className="py-3 px-2 text-center">
                        <div className="flex items-center justify-center gap-1.5 flex-wrap min-w-[120px]">
                          {getInvoiceUrl(t) && (
                            <AttachmentBadge
                              url={getInvoiceUrl(t)!}
                              type="invoice"
                              onOpen={(url, title) => openPreview(url, title)}
                            />
                          )}
                          {getReceiptUrl(t) && (
                            <AttachmentBadge
                              url={getReceiptUrl(t)!}
                              type="receipt"
                              onOpen={(url, title) => openPreview(url, title)}
                            />
                          )}
                          {!getInvoiceUrl(t) && canWrite && (
                            <label
                              htmlFor={`quick-invoice-${t.id}`}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-normal text-muted-foreground/70 hover:text-primary hover:bg-accent border border-dashed border-border/70 cursor-pointer transition-colors shadow-2xs"
                              title="Anexar Boleto/Fatura rapidamente antes de pagar"
                            >
                              <Plus className="size-3" />
                              <span>Boleto</span>
                              <input
                                id={`quick-invoice-${t.id}`}
                                type="file"
                                accept="image/*,application/pdf"
                                className="sr-only"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) handleQuickAttachInvoice(t.id, file);
                                  e.target.value = "";
                                }}
                              />
                            </label>
                          )}
                          {!getReceiptUrl(t) && t.status === "pago" && canWrite && (
                            <label
                              htmlFor={`quick-receipt-${t.id}`}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-normal text-emerald-600/70 dark:text-emerald-400/70 hover:text-emerald-700 hover:bg-emerald-500/10 border border-dashed border-emerald-500/30 cursor-pointer transition-colors shadow-2xs"
                              title="Anexar Comprovante de Pagamento"
                            >
                              <Plus className="size-3" />
                              <span>Comprovante</span>
                              <input
                                id={`quick-receipt-${t.id}`}
                                type="file"
                                accept="image/*,application/pdf"
                                className="sr-only"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) handleQuickAttachReceipt(t.id, file);
                                  e.target.value = "";
                                }}
                              />
                            </label>
                          )}
                          {!getInvoiceUrl(t) && !getReceiptUrl(t) && !canWrite && (
                            <span className="text-xs text-muted-foreground/40">-</span>
                          )}
                        </div>
                      </td>
                      <td className={`py-3 px-2 text-right tabular font-medium ${t.type === "entrada" ? "text-success" : "text-destructive"}`}>
                        {t.type === "entrada" ? "+" : "-"} {formatBRL(t.amount)}
                      </td>
                      <td className="py-3 px-2">
                        {canWrite && (
                          <div className="flex gap-1 justify-end">
                            {t.status !== "pago" && (
                              <Button size="icon" variant="ghost" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMarkPaidId(t.id); setMarkPaidDate(todayISO()); }} title="Marcar pago">
                                <CheckCircle2 className="size-4 text-success" />
                              </Button>
                            )}
                            <Button size="icon" variant="ghost" onClick={() => { setEditData(t); setOpen(true); }} title="Editar">
                              <Edit2 className="size-4 text-muted-foreground" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button size="icon" variant="ghost">
                                  <Trash2 className="size-4 text-destructive opacity-70 hover:opacity-100" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Excluir transação?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Esta ação não pode ser desfeita. A transação será removida permanentemente.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => remove(t.id)}>Excluir</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {isPending ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-sm text-muted-foreground animate-pulse">
                      Carregando transações...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-sm text-muted-foreground">
                      Nenhuma transação encontrada.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function TransactionDialog({
  onClose,
  initialData,
  onPreviewFile,
  onPreviewReceipt,
}: {
  onClose: () => void;
  initialData?: any;
  onPreviewFile?: (url: string, title?: string) => void;
  onPreviewReceipt?: (url: string) => void;
}) {
  const { companies, selectedCompanyId, user } = useAuth();
  const qc = useQueryClient();

  const getSelectedCompanyId = () => {
    if (selectedCompanyId === "all_clinica" || selectedCompanyId === "all_pessoal") {
      const filtered = companies.filter(c => c.kind === (selectedCompanyId === "all_clinica" ? "clinica" : "pessoal"));
      return filtered[0]?.id ?? "";
    }
    return selectedCompanyId !== "all" ? selectedCompanyId : (companies[0]?.id ?? "");
  };

  const filteredCompanies = companies.filter(c => {
    if (selectedCompanyId === "all_clinica") return c.kind === "clinica";
    if (selectedCompanyId === "all_pessoal") return c.kind === "pessoal";
    const active = companies.find(ac => ac.id === selectedCompanyId);
    if (active) return c.kind === active.kind;
    return true;
  });

  const [form, setForm] = useState(() => {
    if (initialData) {
      return {
        company_id: initialData.company_id ?? getSelectedCompanyId(),
        type: initialData.type ?? "saida",
        description: initialData.description ?? "",
        amount: initialData.amount ? maskBRL(Math.round(Number(initialData.amount) * 100).toString()) : "",
        due_date: initialData.due_date ?? todayISO(),
        status: initialData.status ?? "pendente",
        category_id: initialData.category_id ?? "none",
        cost_center_id: initialData.cost_center_id ?? "none",
        notes: cleanUserNotes(initialData.notes),
        paid_date: initialData.paid_date ?? todayISO(),
        isInstallment: false,
        installments: "2",
        amountType: "total" as "total" | "parcela",
      };
    }
    return {
      company_id: getSelectedCompanyId(),
      type: "saida" as "entrada" | "saida",
      description: "",
      amount: "",
      due_date: todayISO(),
      status: "pendente" as "pendente" | "pago",
      category_id: "none",
      cost_center_id: "none",
      notes: "",
      paid_date: todayISO(),
      isInstallment: false,
      installments: "2",
      amountType: "total" as "total" | "parcela",
    };
  });

  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [currentInvoiceUrl, setCurrentInvoiceUrl] = useState<string | null>(getInvoiceUrl(initialData));
  const [removeInvoice, setRemoveInvoice] = useState(false);

  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [currentReceiptUrl, setCurrentReceiptUrl] = useState<string | null>(getReceiptUrl(initialData));
  const [removeReceipt, setRemoveReceipt] = useState(false);

  useEffect(() => {
    if (initialData) {
      setCurrentInvoiceUrl(getInvoiceUrl(initialData));
      setInvoiceFile(null);
      setRemoveInvoice(false);

      setCurrentReceiptUrl(getReceiptUrl(initialData));
      setReceiptFile(null);
      setRemoveReceipt(false);

      setForm({
        company_id: initialData.company_id ?? getSelectedCompanyId(),
        type: initialData.type ?? "saida",
        description: initialData.description ?? "",
        amount: initialData.amount ? maskBRL(Math.round(Number(initialData.amount) * 100).toString()) : "",
        due_date: initialData.due_date ?? todayISO(),
        status: initialData.status ?? "pendente",
        category_id: initialData.category_id ?? "none",
        cost_center_id: initialData.cost_center_id ?? "none",
        notes: cleanUserNotes(initialData.notes),
        paid_date: initialData.paid_date ?? todayISO(),
        isInstallment: false,
        installments: "2",
        amountType: "total" as "total" | "parcela",
      });
    } else {
      setCurrentInvoiceUrl(null);
      setInvoiceFile(null);
      setRemoveInvoice(false);

      setCurrentReceiptUrl(null);
      setReceiptFile(null);
      setRemoveReceipt(false);

      setForm({
        company_id: getSelectedCompanyId(),
        type: "saida" as "entrada" | "saida",
        description: "",
        amount: "",
        due_date: todayISO(),
        status: "pendente" as "pendente" | "pago",
        category_id: "none",
        cost_center_id: "none",
        notes: "",
        paid_date: todayISO(),
        isInstallment: false,
        installments: "2",
        amountType: "total" as "total" | "parcela",
      });
    }
  }, [initialData]);
  const [saving, setSaving] = useState(false);

  const { data: categories } = useQuery({
    queryKey: ["categories", form.company_id, form.cost_center_id],
    queryFn: async () => {
      if (!form.company_id || !form.cost_center_id) return [];
      const { data, error } = await supabase.from("categories").select("id, name").contains("company_ids", [form.company_id]).contains("cost_center_ids", [form.cost_center_id]);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!form.company_id && !!form.cost_center_id,
  });

  const { data: costCenters } = useQuery({
    queryKey: ["cost_centers", form.company_id],
    queryFn: async () => {
      if (!form.company_id) return [];
      const { data, error } = await supabase.from("cost_centers").select("id, name").contains("company_ids", [form.company_id]);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!form.company_id,
  });

  const { data: paidByProfile } = useQuery({
    queryKey: ["profile", initialData?.paid_by],
    queryFn: async () => {
      if (!initialData?.paid_by) return null;
      const { data, error } = await supabase.from("profiles").select("full_name").eq("id", initialData.paid_by).single();
      if (error) throw error;
      return data;
    },
    enabled: !!initialData?.paid_by,
  });

  const { data: createdByProfile } = useQuery({
    queryKey: ["profile", initialData?.created_by],
    queryFn: async () => {
      if (!initialData?.created_by) return null;
      const { data, error } = await supabase.from("profiles").select("full_name").eq("id", initialData.created_by).single();
      if (error) throw error;
      return data;
    },
    enabled: !!initialData?.created_by,
  });

  const submit = async () => {
    if (!form.company_id) return toast.error("Selecione uma empresa");
    if (!form.description) return toast.error("Informe a descrição");
    const amount = parseBRL(form.amount);
    if (amount <= 0) return toast.error("Informe um valor válido");

    let numInstallments = 1;
    if (form.isInstallment) {
      numInstallments = parseInt(form.installments, 10);
      if (isNaN(numInstallments) || numInstallments < 2 || numInstallments > 360) {
        return toast.error("Número de parcelas inválido");
      }
    }

    const baseAmount = form.isInstallment && form.amountType === "total" 
      ? amount / numInstallments 
      : amount;

    setSaving(true);
    
    if (initialData) {
      let finalInvoiceUrl = removeInvoice ? null : currentInvoiceUrl;
      if (invoiceFile && initialData.id) {
        const uploadedInvoice = await uploadTransactionFile(invoiceFile, initialData.id, "invoice");
        if (uploadedInvoice) finalInvoiceUrl = uploadedInvoice;
      }

      let finalReceiptUrl = (form.status === "pago" && !removeReceipt) ? currentReceiptUrl : null;
      if (receiptFile && initialData.id && form.status === "pago") {
        const uploadedReceipt = await uploadTransactionFile(receiptFile, initialData.id, "receipt");
        if (uploadedReceipt) finalReceiptUrl = uploadedReceipt;
      }

      const composedNotes = composeNotesWithAttachments(form.notes, {
        invoice: finalInvoiceUrl,
        receipt: form.status === "pago" ? finalReceiptUrl : null,
      });

      const payload: any = {
        company_id: form.company_id,
        type: form.type,
        description: form.description,
        amount: baseAmount,
        due_date: form.due_date,
        status: form.status,
        paid_date: form.status === "pago" 
          ? (form.paid_date.includes("T") ? form.paid_date : form.paid_date + new Date().toISOString().slice(10)) 
          : null,
        paid_by: form.status === "pago" ? (initialData.status === "pago" ? initialData.paid_by : user?.id) : null,
        receipt_url: form.status === "pago" ? finalReceiptUrl : null,
        invoice_url: finalInvoiceUrl,
        category_id: form.category_id !== "none" ? form.category_id : null,
        cost_center_id: form.cost_center_id !== "none" ? form.cost_center_id : null,
        notes: composedNotes,
      };
      let { error } = await supabase.from("transactions").update(payload).eq("id", initialData.id);
      
      if (error && (error.message.includes("invoice_url") || error.message.includes("receipt_url") || error.message.includes("schema cache"))) {
        delete payload.invoice_url;
        delete payload.receipt_url;
        payload.notes = composedNotes;
        const retry = await supabase.from("transactions").update(payload).eq("id", initialData.id);
        error = retry.error;
      }

      setSaving(false);
      if (error) return toast.error("Erro", { description: error.message });
      toast.success("Transação atualizada");
    } else {
      const tempId = crypto.randomUUID();
      let newInvoiceUrl: string | null = null;
      if (invoiceFile) {
        newInvoiceUrl = await uploadTransactionFile(invoiceFile, tempId, "invoice");
      }

      let newReceiptUrl: string | null = null;
      if (receiptFile && form.status === "pago") {
        newReceiptUrl = await uploadTransactionFile(receiptFile, tempId, "receipt");
      }

      const payloads: any[] = [];
      for (let i = 0; i < numInstallments; i++) {
        const composedNotes = composeNotesWithAttachments(form.notes, {
          invoice: newInvoiceUrl,
          receipt: i === 0 && form.status === "pago" ? newReceiptUrl : null,
        });

        payloads.push({
          company_id: form.company_id,
          type: form.type,
          description: form.isInstallment ? `${form.description} (${i + 1}/${numInstallments})` : form.description,
          amount: baseAmount,
          due_date: addMonths(form.due_date, i),
          status: i === 0 ? form.status : "pendente",
          paid_date: i === 0 && form.status === "pago" ? todayISO() + new Date().toISOString().slice(10) : null,
          paid_by: i === 0 && form.status === "pago" ? user?.id : null,
          invoice_url: newInvoiceUrl,
          receipt_url: i === 0 && form.status === "pago" ? newReceiptUrl : null,
          created_by: user?.id,
          category_id: form.category_id !== "none" ? form.category_id : null,
          cost_center_id: form.cost_center_id !== "none" ? form.cost_center_id : null,
          notes: composedNotes,
        });
      }

      let { error } = await supabase.from("transactions").insert(payloads);

      if (error && (error.message.includes("invoice_url") || error.message.includes("receipt_url") || error.message.includes("schema cache"))) {
        const fallbackPayloads = payloads.map((p) => {
          const cp = { ...p };
          delete cp.invoice_url;
          delete cp.receipt_url;
          return cp;
        });
        const retry = await supabase.from("transactions").insert(fallbackPayloads);
        error = retry.error;
      }

      setSaving(false);
      if (error) return toast.error("Erro", { description: error.message });
      toast.success(form.isInstallment ? `${numInstallments} parcelas criadas` : "Transação criada");
    }
    qc.invalidateQueries({ queryKey: ["transactions"] });
    qc.invalidateQueries({ queryKey: ["tx"] });
    qc.invalidateQueries({ queryKey: ["pr"] });
    onClose();
  };

  return (
    <DialogContent className="w-[95vw] sm:max-w-lg max-h-[90vh] overflow-y-auto p-4 sm:p-6">
      <DialogHeader>
        <DialogTitle>{initialData ? "Editar transação" : "Nova transação"}</DialogTitle>
        <DialogDescription className="sr-only">Preencha os campos da transação</DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label>Empresa</Label>
          <Select value={form.company_id} onValueChange={(v) => setForm({ ...form, company_id: v })}>
            <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
            <SelectContent>
              {filteredCompanies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select value={form.type} onValueChange={(v: "entrada"|"saida") => setForm({ ...form, type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="entrada">Entrada</SelectItem>
                <SelectItem value="saida">Saída</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v: "pendente"|"pago") => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="pago">Pago</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Centro de Custo</Label>
            <Select value={form.cost_center_id} onValueChange={(v) => setForm({ ...form, cost_center_id: v, category_id: "none" })}>
              <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhum</SelectItem>
                {(costCenters ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Categoria</Label>
            <Select value={form.category_id} onValueChange={(v) => setForm({ ...form, category_id: v })}>
              <SelectTrigger><SelectValue placeholder="Nenhuma" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhuma</SelectItem>
                {(categories ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Descrição</Label>
          <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Valor (R$)</Label>
            <Input
              inputMode="numeric"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: maskBRL(e.target.value) })}
              placeholder="0,00"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Vencimento</Label>
            <DatePicker value={form.due_date} onChange={(v) => setForm({ ...form, due_date: v })} />
          </div>
          {form.status === "pago" && (
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Data de Pagamento</Label>
              <DatePicker value={form.paid_date} onChange={(v) => setForm({ ...form, paid_date: v })} />
            </div>
          )}

          {/* Anexo 1: Boleto / Fatura / Documento da Despesa (Sempre visível) */}
          <div className="col-span-1 sm:col-span-2 space-y-1.5 p-3 rounded-lg bg-muted/30 border">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold flex items-center gap-1.5">
                <FileText className="size-3.5 text-primary" />
                Boleto / Fatura / Documento (opcional)
              </Label>
              {currentInvoiceUrl && !removeInvoice && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[11px] text-destructive hover:bg-destructive/10 px-2"
                  onClick={() => setRemoveInvoice(true)}
                >
                  <Trash2 className="size-3 mr-1" /> Remover documento
                </Button>
              )}
            </div>

            {currentInvoiceUrl && !removeInvoice ? (
              <div className="flex items-center justify-between bg-card p-2 rounded border text-xs">
                <span className="text-muted-foreground truncate max-w-[240px]">Documento anexado</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => {
                    if (onPreviewFile) onPreviewFile(currentInvoiceUrl, "Boleto / Fatura");
                    else if (onPreviewReceipt) onPreviewReceipt(currentInvoiceUrl);
                  }}
                >
                  <ExternalLink className="size-3" /> Visualizar
                </Button>
              </div>
            ) : (
              <Input
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => {
                  setInvoiceFile(e.target.files?.[0] || null);
                  setRemoveInvoice(false);
                }}
                className="h-9 text-xs"
              />
            )}
          </div>

          {/* Anexo 2: Comprovante de Pagamento (Visível apenas se status for "pago") */}
          {form.status === "pago" && (
            <div className="col-span-1 sm:col-span-2 space-y-1.5 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                  <Paperclip className="size-3.5" />
                  Comprovante de Pagamento (opcional)
                </Label>
                {currentReceiptUrl && !removeReceipt && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[11px] text-destructive hover:bg-destructive/10 px-2"
                    onClick={() => setRemoveReceipt(true)}
                  >
                    <Trash2 className="size-3 mr-1" /> Remover comprovante
                  </Button>
                )}
              </div>

              {currentReceiptUrl && !removeReceipt ? (
                <div className="flex items-center justify-between bg-card p-2 rounded border text-xs">
                  <span className="text-muted-foreground truncate max-w-[240px]">Comprovante anexado</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => {
                      if (onPreviewFile) onPreviewFile(currentReceiptUrl, "Comprovante de Pagamento");
                      else if (onPreviewReceipt) onPreviewReceipt(currentReceiptUrl);
                    }}
                  >
                    <ExternalLink className="size-3" /> Visualizar
                  </Button>
                </div>
              ) : (
                <Input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={(e) => {
                    setReceiptFile(e.target.files?.[0] || null);
                    setRemoveReceipt(false);
                  }}
                  className="h-9 text-xs"
                />
              )}
            </div>
          )}

          {initialData && (
            <div className="col-span-1 sm:col-span-2 space-y-1.5 mt-2 pt-2 border-t border-dashed">
              <Label className="text-muted-foreground text-xs block">
                Lançado por: <span className="font-medium text-foreground">{createdByProfile?.full_name || "Usuário"}</span> em {formatDateTime(initialData.created_at)}
              </Label>
            </div>
          )}
          {form.status === "pago" && paidByProfile && initialData?.paid_date && (
            <div className="col-span-1 sm:col-span-2 space-y-1.5 mt-1">
              <Label className="text-muted-foreground text-xs block">
                Baixa realizada por: <span className="font-medium text-foreground">{paidByProfile.full_name}</span> em {formatDateTime(initialData.paid_date)}
              </Label>
            </div>
          )}
        </div>
        
        {!initialData && (
          <div className="flex items-center space-x-2 pt-1 pb-1">
            <Checkbox 
              id="isInstallment" 
              checked={form.isInstallment} 
              onCheckedChange={(c) => setForm({ ...form, isInstallment: c === true })} 
            />
            <label htmlFor="isInstallment" className="text-sm font-medium leading-none cursor-pointer">
              Repetir / Parcelar transação
            </label>
          </div>
        )}

        {form.isInstallment && (
          <div className="p-3 bg-muted/40 rounded-md border space-y-3">
            <div className="space-y-1.5">
              <Label>Quantidade de Parcelas</Label>
              <Input
                type="number"
                min="2"
                max="360"
                value={form.installments}
                onChange={(e) => setForm({ ...form, installments: e.target.value })}
              />
            </div>
            <div className="space-y-1.5 pt-1">
              <Label className="text-muted-foreground">O valor digitado acima (R$ {form.amount || "0,00"}) é:</Label>
              <RadioGroup 
                value={form.amountType} 
                onValueChange={(v: "total"|"parcela") => setForm({ ...form, amountType: v })}
                className="flex flex-col gap-2 mt-1"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="total" id="r-total" />
                  <Label htmlFor="r-total" className="font-normal cursor-pointer">Valor Total (Será dividido em {form.installments || 2}x)</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="parcela" id="r-parcela" />
                  <Label htmlFor="r-parcela" className="font-normal cursor-pointer">Valor da Parcela (Multiplicado por {form.installments || 2})</Label>
                </div>
              </RadioGroup>
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <Label>Observação</Label>
          <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button onClick={submit} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
      </DialogFooter>
    </DialogContent>
  );
}
