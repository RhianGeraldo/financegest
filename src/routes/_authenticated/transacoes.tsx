import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, applyCompanyFilter } from "@/lib/auth";
import { formatBRL, formatDate, statusLabel, todayISO, maskBRL, parseBRL, addMonths } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { DatePicker } from "@/components/ui/date-picker";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Plus, Search, Trash2, CheckCircle2, Filter, Edit2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/transacoes")({
  component: TransacoesPage,
  head: () => ({ meta: [{ title: "Transações — Gestão Financeira" }] }),
});

function TransacoesPage() {
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
    queryKey: ["transactions", selectedCompanyId],
    queryFn: async () => {
      let q = supabase.from("transactions").select("*").order("due_date", { ascending: false });
      q = applyCompanyFilter(q, selectedCompanyId, companies);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !loading,
  });

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

  const submitMarkPaid = async () => {
    if (!markPaidId) return;
    const { error } = await supabase
      .from("transactions")
      .update({ status: "pago", paid_date: markPaidDate, paid_by: user?.id })
      .eq("id", markPaidId);
    if (error) return toast.error("Erro", { description: error.message });
    toast.success("Marcada como paga");
    setMarkPaidId(null);
    qc.invalidateQueries({ queryKey: ["transactions"] });
    qc.invalidateQueries({ queryKey: ["tx"] });
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
      <Dialog open={!!markPaidId} onOpenChange={(o) => !o && setMarkPaidId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Confirmar pagamento</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Data do Pagamento</Label>
              <DatePicker value={markPaidDate} onChange={(v) => setMarkPaidDate(v)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMarkPaidId(null)}>Cancelar</Button>
            <Button onClick={submitMarkPaid}>Confirmar</Button>
          </DialogFooter>
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
                  <TransactionDialog initialData={editData} onClose={() => { setOpen(false); setEditData(null); }} />
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
                      <p className="text-xs text-muted-foreground mt-0.5">Vencimento: {formatDate(t.due_date)}</p>
                      {t.paid_date && (
                        <p className="text-xs text-muted-foreground mt-0.5">Pago em: {formatDate(t.paid_date)}</p>
                      )}
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
            <table className="w-full text-sm relative min-w-[700px]">
              <thead className="text-xs text-muted-foreground border-b sticky top-0 bg-card z-10 shadow-sm">
                <tr className="text-left">
                  <th className="py-2 px-2">Descrição</th>
                  <th className="py-2 px-2">Tipo</th>
                  <th className="py-2 px-2">Vencimento</th>
                  <th className="py-2 px-2">Pagamento</th>
                  <th className="py-2 px-2">Status</th>
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
                      </td>
                      <td className="py-3 px-2">
                        <Badge variant={t.type === "entrada" ? "default" : "secondary"}>
                          {t.type === "entrada" ? "Entrada" : "Saída"}
                        </Badge>
                      </td>
                      <td className="py-3 px-2">{formatDate(t.due_date)}</td>
                      <td className="py-3 px-2 text-muted-foreground">{t.paid_date ? formatDate(t.paid_date) : "-"}</td>
                      <td className="py-3 px-2">
                        <Badge variant={st === "pago" ? "default" : st === "atrasado" ? "destructive" : "secondary"}>
                          {st}
                        </Badge>
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
                    <td colSpan={7} className="py-12 text-center text-sm text-muted-foreground animate-pulse">
                      Carregando transações...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-sm text-muted-foreground">
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

function TransactionDialog({ onClose, initialData }: { onClose: () => void; initialData?: any }) {
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
        notes: initialData.notes ?? "",
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

  useEffect(() => {
    if (initialData) {
      setForm({
        company_id: initialData.company_id ?? getSelectedCompanyId(),
        type: initialData.type ?? "saida",
        description: initialData.description ?? "",
        amount: initialData.amount ? maskBRL(Math.round(Number(initialData.amount) * 100).toString()) : "",
        due_date: initialData.due_date ?? todayISO(),
        status: initialData.status ?? "pendente",
        category_id: initialData.category_id ?? "none",
        cost_center_id: initialData.cost_center_id ?? "none",
        notes: initialData.notes ?? "",
        paid_date: initialData.paid_date ?? todayISO(),
        isInstallment: false,
        installments: "2",
        amountType: "total" as "total" | "parcela",
      });
    } else {
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
    queryKey: ["categories", form.company_id],
    queryFn: async () => {
      if (!form.company_id) return [];
      const { data, error } = await supabase.from("categories").select("id, name").contains("company_ids", [form.company_id]);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!form.company_id,
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
      const payload = {
        company_id: form.company_id,
        type: form.type,
        description: form.description,
        amount: baseAmount,
        due_date: form.due_date,
        status: form.status,
        paid_date: form.status === "pago" ? form.paid_date : null,
        paid_by: form.status === "pago" ? (initialData.status === "pago" ? initialData.paid_by : user?.id) : null,
        category_id: form.category_id !== "none" ? form.category_id : null,
        cost_center_id: form.cost_center_id !== "none" ? form.cost_center_id : null,
        notes: form.notes || null,
      };
      const { error } = await supabase.from("transactions").update(payload).eq("id", initialData.id);
      setSaving(false);
      if (error) return toast.error("Erro", { description: error.message });
      toast.success("Transação atualizada");
    } else {
      const payloads: any[] = [];
      for (let i = 0; i < numInstallments; i++) {
      payloads.push({
        company_id: form.company_id,
        type: form.type,
        description: form.isInstallment ? `${form.description} (${i + 1}/${numInstallments})` : form.description,
        amount: baseAmount,
        due_date: addMonths(form.due_date, i),
        status: i === 0 ? form.status : "pendente",
        paid_date: i === 0 && form.status === "pago" ? todayISO() : null,
        category_id: form.category_id !== "none" ? form.category_id : null,
        cost_center_id: form.cost_center_id !== "none" ? form.cost_center_id : null,
        notes: form.notes || null,
      });
    }

      const { error } = await supabase.from("transactions").insert(payloads);
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
    <DialogContent className="sm:max-w-md">
      <DialogHeader><DialogTitle>Nova transação</DialogTitle></DialogHeader>
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
            <Label>Categoria</Label>
            <Select value={form.category_id} onValueChange={(v) => setForm({ ...form, category_id: v })}>
              <SelectTrigger><SelectValue placeholder="Nenhuma" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhuma</SelectItem>
                {(categories ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Centro de Custo</Label>
            <Select value={form.cost_center_id} onValueChange={(v) => setForm({ ...form, cost_center_id: v })}>
              <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhum</SelectItem>
                {(costCenters ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
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
            <div className="space-y-1.5">
              <Label>Data de Pagamento</Label>
              <DatePicker value={form.paid_date} onChange={(v) => setForm({ ...form, paid_date: v })} />
            </div>
          )}
          {form.status === "pago" && paidByProfile && (
            <div className="col-span-1 sm:col-span-2 space-y-1.5 mt-2">
              <Label className="text-muted-foreground text-xs block">
                Baixa realizada por: <span className="font-medium text-foreground">{paidByProfile.full_name}</span>
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
