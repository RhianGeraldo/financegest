import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { formatBRL, formatDate, statusLabel, todayISO, maskBRL, parseBRL } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Search, Trash2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/transacoes")({
  component: TransacoesPage,
  head: () => ({ meta: [{ title: "Transações — Caixa" }] }),
});

function TransacoesPage() {
  const { selectedCompanyId, companies, canWrite } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const { data: txs } = useQuery({
    queryKey: ["transactions", selectedCompanyId],
    queryFn: async () => {
      let q = supabase.from("transactions").select("*").order("due_date", { ascending: false });
      if (selectedCompanyId !== "all") q = q.eq("company_id", selectedCompanyId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = (txs ?? []).filter((t) =>
    t.description.toLowerCase().includes(search.toLowerCase()),
  );

  const markPaid = async (id: string) => {
    const { error } = await supabase
      .from("transactions")
      .update({ status: "pago", paid_date: todayISO() })
      .eq("id", id);
    if (error) return toast.error("Erro", { description: error.message });
    toast.success("Marcada como paga");
    qc.invalidateQueries({ queryKey: ["transactions"] });
    qc.invalidateQueries({ queryKey: ["tx"] });
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir esta transação?")) return;
    const { error } = await supabase.from("transactions").delete().eq("id", id);
    if (error) return toast.error("Erro", { description: error.message });
    toast.success("Excluída");
    qc.invalidateQueries({ queryKey: ["transactions"] });
  };

  return (
    <div className="space-y-4 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Transações</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} registro(s)</p>
        </div>
        {canWrite && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="size-4 mr-1" /> Nova transação</Button>
            </DialogTrigger>
            <TransactionDialog onClose={() => setOpen(false)} />
          </Dialog>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="relative">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar descrição…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 max-w-sm"
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground border-b">
                <tr className="text-left">
                  <th className="py-2 px-2">Descrição</th>
                  <th className="py-2 px-2">Tipo</th>
                  <th className="py-2 px-2">Vencimento</th>
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
                              <Button size="icon" variant="ghost" onClick={() => markPaid(t.id)} title="Marcar pago">
                                <CheckCircle2 className="size-4 text-success" />
                              </Button>
                            )}
                            <Button size="icon" variant="ghost" onClick={() => remove(t.id)} title="Excluir">
                              <Trash2 className="size-4 text-destructive" />
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-sm text-muted-foreground">
                      Nenhuma transação encontrada.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function TransactionDialog({ onClose }: { onClose: () => void }) {
  const { companies, selectedCompanyId } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    company_id: selectedCompanyId !== "all" ? selectedCompanyId : (companies[0]?.id ?? ""),
    type: "saida" as "entrada" | "saida",
    description: "",
    amount: "",
    due_date: todayISO(),
    status: "pendente" as "pendente" | "pago",
    notes: "",
  });
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!form.company_id) return toast.error("Selecione uma empresa");
    if (!form.description) return toast.error("Informe a descrição");
    const amount = parseBRL(form.amount);
    if (amount <= 0) return toast.error("Informe um valor válido");

    setSaving(true);
    const { error } = await supabase.from("transactions").insert({
      company_id: form.company_id,
      type: form.type,
      description: form.description,
      amount,
      due_date: form.due_date,
      status: form.status,
      paid_date: form.status === "pago" ? todayISO() : null,
      notes: form.notes || null,
    });
    setSaving(false);
    if (error) return toast.error("Erro", { description: error.message });
    toast.success("Transação criada");
    qc.invalidateQueries({ queryKey: ["transactions"] });
    qc.invalidateQueries({ queryKey: ["tx"] });
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
              {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
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
        <div className="space-y-1.5">
          <Label>Descrição</Label>
          <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
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
            <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
          </div>
        </div>
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
