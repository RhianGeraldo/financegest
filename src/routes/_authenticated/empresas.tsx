import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Sparkles } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/empresas")({
  component: EmpresasPage,
  head: () => ({ meta: [{ title: "Empresas — Gestão Financeira" }] }),
});

function EmpresasPage() {
  const { hasRole, refresh, user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const { data } = useQuery({
    queryKey: ["companies-admin"],
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: hasRole("super_admin"),
  });

  if (!hasRole("super_admin")) {
    return <p className="text-sm text-muted-foreground">Apenas Super Admin pode gerenciar empresas.</p>;
  }

  const remove = async (id: string) => {
    const { error } = await supabase.from("companies").delete().eq("id", id);
    if (error) return toast.error("Erro", { description: error.message });
    toast.success("Empresa excluída");
    qc.invalidateQueries({ queryKey: ["companies-admin"] });
    refresh();
  };

  const seedDemo = async () => {
    if (!user) return;
    if (!confirm("Criar dados de demonstração (5 empresas + 2 contas pessoais + transações)?")) return;
    setSeeding(true);
    try {
      const demos = [
        { name: "Empresa 1", kind: "clinica", color: "#6366f1" },
        { name: "Empresa 2", kind: "clinica", color: "#8b5cf6" },
        { name: "Empresa 3", kind: "clinica", color: "#06b6d4" },
        { name: "Empresa 4", kind: "clinica", color: "#10b981" },
        { name: "Empresa 5", kind: "clinica", color: "#f59e0b" },
        { name: "Conta Pessoal 1", kind: "pessoal", color: "#ec4899" },
        { name: "Conta Pessoal 2", kind: "pessoal", color: "#ef4444" },
      ];
      const { data: comps, error } = await supabase.from("companies").insert(demos).select();
      if (error) throw error;

      // Vincular usuário a todas
      await supabase.from("company_members").insert(comps!.map((c) => ({ company_id: c.id, user_id: user.id })));

      // Para cada empresa: contas, categorias, transações
      for (const c of comps!) {
        await supabase.from("bank_accounts").insert([
          { company_id: c.id, bank: "Itaú", name: "Conta Principal", initial_balance: 10000 },
          { company_id: c.id, bank: "Nubank", name: "Conta PJ", initial_balance: 5000 },
        ]);
        const catData = [
          { company_id: c.id, name: "Procedimentos", kind: "receita", color: "#10b981" },
          { company_id: c.id, name: "Convênios", kind: "receita", color: "#06b6d4" },
          { company_id: c.id, name: "Aluguel", kind: "despesa", color: "#ef4444" },
          { company_id: c.id, name: "Folha", kind: "despesa", color: "#f59e0b" },
          { company_id: c.id, name: "Marketing", kind: "despesa", color: "#8b5cf6" },
          { company_id: c.id, name: "Fornecedores", kind: "despesa", color: "#ec4899" },
        ];
        await supabase.from("categories").insert(catData);
        await supabase.from("cost_centers").insert([
          { company_id: c.id, name: "Comercial" },
          { company_id: c.id, name: "Administrativo" },
          { company_id: c.id, name: "Recepção" },
        ]);

        // ~12 transações distribuídas nos últimos 3 meses
        const now = new Date();
        const txs: any[] = [];
        for (let i = 0; i < 12; i++) {
          const d = new Date(now.getFullYear(), now.getMonth() - (i % 3), 1 + (i * 2 + 1));
          const iso = d.toISOString().slice(0, 10);
          const isIn = i % 3 === 0;
          const past = d < now;
          txs.push({
            company_id: c.id,
            type: isIn ? "entrada" : "saida",
            description: isIn ? `Faturamento ${d.toLocaleDateString("pt-BR")}` : ["Aluguel", "Folha", "Marketing", "Fornecedor"][i % 4],
            amount: isIn ? 8000 + Math.random() * 12000 : 1500 + Math.random() * 4000,
            due_date: iso,
            paid_date: past && i % 4 !== 0 ? iso : null,
            status: past && i % 4 !== 0 ? "pago" : "pendente",
          });
        }
        await supabase.from("transactions").insert(txs);
      }

      toast.success("Dados de demonstração criados!");
      qc.invalidateQueries();
      refresh();
    } catch (e: any) {
      toast.error("Erro ao criar demo", { description: e.message });
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="space-y-4 max-w-[1100px] mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Empresas</h1>
          <p className="text-sm text-muted-foreground">{data?.length ?? 0} cadastradas</p>
        </div>
        <div className="flex gap-2">
          {(data?.length ?? 0) === 0 && (
            <Button variant="outline" onClick={seedDemo} disabled={seeding}>
              <Sparkles className="size-4 mr-1" /> {seeding ? "Criando…" : "Popular demo"}
            </Button>
          )}
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="size-4 mr-1" /> Nova empresa</Button></DialogTrigger>
            <NewCompanyDialog onClose={() => setOpen(false)} />
          </Dialog>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          {(data ?? []).map((c) => (
            <div key={c.id} className="flex items-center justify-between py-3 border-b last:border-0">
              <div className="flex items-center gap-3">
                <span className="size-3 rounded-full" style={{ background: c.color }} />
                <div>
                  <p className="font-medium">{c.name}</p>
                  <p className="text-xs text-muted-foreground capitalize">{c.kind}</p>
                </div>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="icon" variant="ghost">
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Excluir empresa?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esta ação não pode ser desfeita. Todos os dados ligados (contas, categorias, transações) serão removidos permanentemente.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => remove(c.id)}>Excluir</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ))}
          {(data ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhuma empresa. Crie a primeira ou popule com dados de demonstração.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function NewCompanyDialog({ onClose }: { onClose: () => void }) {
  const { user, refresh } = useAuth();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"clinica"|"pessoal">("clinica");
  const [color, setColor] = useState("#6366f1");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name || !user) return;
    setSaving(true);
    const { data, error } = await supabase.from("companies").insert({ name, kind, color }).select().single();
    if (error) { setSaving(false); return toast.error("Erro", { description: error.message }); }
    await supabase.from("company_members").insert({ company_id: data.id, user_id: user.id });
    setSaving(false);
    toast.success("Empresa criada");
    qc.invalidateQueries({ queryKey: ["companies-admin"] });
    refresh();
    onClose();
  };

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Nova empresa</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div className="space-y-1.5"><Label>Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="space-y-1.5">
          <Label>Tipo</Label>
          <Select value={kind} onValueChange={(v: "clinica"|"pessoal") => setKind(v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="clinica">Empresa (Comercial)</SelectItem>
              <SelectItem value="pessoal">Conta Pessoal</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label>Cor</Label><Input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-20 p-1" /></div>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button onClick={save} disabled={saving || !name}>{saving ? "Salvando…" : "Criar"}</Button>
      </DialogFooter>
    </DialogContent>
  );
}
