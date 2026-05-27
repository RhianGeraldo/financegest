import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { formatBRL, maskBRL, parseBRL } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

type Field =
  | { name: string; label: string; type: "text" | "money"; required?: boolean }
  | { name: string; label: string; type: "select"; required?: boolean; options: { value: string; label: string }[] };

type Column = { key: string; label: string; format?: "money"; align?: "right" };

interface Props {
  title: string;
  table: "bank_accounts" | "categories" | "cost_centers";
  queryKey: string;
  fields: Field[];
  columns: Column[];
}

export function SimpleCrudPage({ title, table, queryKey, fields, columns }: Props) {
  const { selectedCompanyId, companies, canWrite } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data } = useQuery({
    queryKey: [queryKey, selectedCompanyId],
    queryFn: async () => {
      let q = supabase.from(table).select("*").order("created_at", { ascending: false });
      if (selectedCompanyId !== "all") q = q.eq("company_id", selectedCompanyId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const remove = async (id: string) => {
    if (!confirm("Excluir?")) return;
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) return toast.error("Erro", { description: error.message });
    toast.success("Excluído");
    qc.invalidateQueries({ queryKey: [queryKey] });
  };

  return (
    <div className="space-y-4 max-w-[1100px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">{data?.length ?? 0} registro(s)</p>
        </div>
        {canWrite && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="size-4 mr-1" /> Novo</Button></DialogTrigger>
            <CrudDialog table={table} queryKey={queryKey} fields={fields} onClose={() => setOpen(false)} />
          </Dialog>
        )}
      </div>

      <Card>
        <CardContent className="pt-6">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b">
              <tr className="text-left">
                <th className="py-2 px-2">Empresa</th>
                {columns.map((c) => (
                  <th key={c.key} className={`py-2 px-2 ${c.align === "right" ? "text-right" : ""}`}>{c.label}</th>
                ))}
                <th className="w-12" />
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((row: any) => {
                const company = companies.find((c) => c.id === row.company_id);
                return (
                  <tr key={row.id} className="border-b last:border-0 hover:bg-accent/30">
                    <td className="py-3 px-2">
                      {company && (
                        <span className="inline-flex items-center gap-1.5 text-xs">
                          <span className="size-1.5 rounded-full" style={{ background: company.color }} />
                          {company.name}
                        </span>
                      )}
                    </td>
                    {columns.map((c) => (
                      <td key={c.key} className={`py-3 px-2 ${c.align === "right" ? "text-right tabular" : ""}`}>
                        {c.format === "money" ? formatBRL(row[c.key]) : String(row[c.key] ?? "")}
                      </td>
                    ))}
                    <td>
                      {canWrite && (
                        <Button size="icon" variant="ghost" onClick={() => remove(row.id)}>
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {(data ?? []).length === 0 && (
                <tr><td colSpan={columns.length + 2} className="py-10 text-center text-sm text-muted-foreground">Nenhum registro.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function CrudDialog({ table, queryKey, fields, onClose }: { table: string; queryKey: string; fields: Field[]; onClose: () => void }) {
  const { companies, selectedCompanyId } = useAuth();
  const qc = useQueryClient();
  const [companyId, setCompanyId] = useState(selectedCompanyId !== "all" ? selectedCompanyId : (companies[0]?.id ?? ""));
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!companyId) return toast.error("Selecione uma empresa");
    const payload: any = { company_id: companyId };
    for (const f of fields) {
      const v = values[f.name];
      if (f.required && !v) return toast.error(`${f.label} é obrigatório`);
      payload[f.name] = f.type === "money" ? parseBRL(v ?? "") : v ?? "";
    }
    setSaving(true);
    const { error } = await supabase.from(table as any).insert(payload);
    setSaving(false);
    if (error) return toast.error("Erro", { description: error.message });
    toast.success("Criado");
    qc.invalidateQueries({ queryKey: [queryKey] });
    onClose();
  };

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Novo registro</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label>Empresa</Label>
          <Select value={companyId} onValueChange={setCompanyId}>
            <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
            <SelectContent>
              {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {fields.map((f) => (
          <div key={f.name} className="space-y-1.5">
            <Label>{f.label}</Label>
            {f.type === "select" ? (
              <Select value={values[f.name] ?? ""} onValueChange={(v) => setValues({ ...values, [f.name]: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                <SelectContent>
                  {f.options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : f.type === "money" ? (
              <Input
                inputMode="numeric"
                value={values[f.name] ?? ""}
                onChange={(e) => setValues({ ...values, [f.name]: maskBRL(e.target.value) })}
                placeholder="0,00"
              />
            ) : (
              <Input
                value={values[f.name] ?? ""}
                onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
              />
            )}
          </div>
        ))}
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button onClick={submit} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
      </DialogFooter>
    </DialogContent>
  );
}
