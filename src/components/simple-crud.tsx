import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, applyCompanyFilter } from "@/lib/auth";
import { formatBRL, maskBRL, parseBRL } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Edit2 } from "lucide-react";
import { toast } from "sonner";

type Field =
  | { name: string; label: string; type: "text" | "money" | "color"; required?: boolean }
  | { name: string; label: string; type: "select"; required?: boolean; options: { value: string; label: string }[] };

type Column = { key: string; label: string; format?: "money" | "color"; align?: "right" };

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
  const [editData, setEditData] = useState<any>(null);

  const handleCreate = () => {
    setEditData(null);
    setOpen(true);
  };

  const handleEdit = (row: any) => {
    setEditData(row);
    setOpen(true);
  };

  const { data } = useQuery({
    queryKey: [queryKey, selectedCompanyId],
    queryFn: async () => {
      let q = supabase.from(table).select("*").order("created_at", { ascending: false });
      q = applyCompanyFilter(q, selectedCompanyId, companies);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const remove = async (id: string) => {
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) return toast.error("Erro", { description: error.message });
    toast.success("Excluído");
    qc.invalidateQueries({ queryKey: [queryKey] });
  };

  const [headerNode, setHeaderNode] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setHeaderNode(document.getElementById("page-header"));
  }, []);

  return (
    <div className="space-y-4 max-w-[1100px] mx-auto">
      {headerNode && createPortal(
        <>
          <div className="flex flex-col">
            <h1 className="text-xl font-semibold tracking-tight leading-none">{title}</h1>
            <p className="text-xs text-muted-foreground mt-1">{data?.length ?? 0} registro(s)</p>
          </div>
          {canWrite && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild><Button size="sm" onClick={handleCreate}><Plus className="size-4 mr-1" /> Novo</Button></DialogTrigger>
              <CrudDialog table={table} queryKey={queryKey} fields={fields} initialData={editData} onClose={() => setOpen(false)} />
            </Dialog>
          )}
        </>,
        headerNode
      )}

      <Card>
        <CardContent className="pt-0 px-0">
          <div className="overflow-auto max-h-[calc(100vh-240px)]">
            <table className="w-full text-sm relative">
              <thead className="text-xs text-muted-foreground border-b sticky top-0 bg-card z-10 shadow-sm">
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
                        {c.format === "money" ? (
                          formatBRL(row[c.key])
                        ) : c.format === "color" ? (
                          <div className="flex items-center gap-2">
                            <span className="size-3 rounded-full shadow-sm" style={{ background: row[c.key] }} />
                            <span className="text-muted-foreground text-xs">{row[c.key]}</span>
                          </div>
                        ) : (
                          String(row[c.key] ?? "")
                        )}
                      </td>
                    ))}
                    <td>
                      {canWrite && (
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" onClick={() => handleEdit(row)}>
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
                                <AlertDialogTitle>Excluir registro?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Esta ação não pode ser desfeita. O registro será removido permanentemente.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => remove(row.id)}>Excluir</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
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
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function CrudDialog({ table, queryKey, fields, initialData, onClose }: { table: string; queryKey: string; fields: Field[]; initialData?: any; onClose: () => void }) {
  const { companies, selectedCompanyId } = useAuth();
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

  const [companyId, setCompanyId] = useState(initialData?.company_id ?? getSelectedCompanyId());
  const [values, setValues] = useState<Record<string, string>>({});
  
  useEffect(() => {
    setCompanyId(initialData?.company_id ?? getSelectedCompanyId());
    
    if (!initialData) {
      const initNew: Record<string, string> = {};
      for (const f of fields) {
        if (f.type === "color") initNew[f.name] = "#6366f1";
        if (f.type === "select" && f.options?.[0]) initNew[f.name] = f.options[0].value;
      }
      setValues(initNew);
      return;
    }
    
    const init: Record<string, string> = {};
    for (const f of fields) {
      if (initialData[f.name] !== undefined && initialData[f.name] !== null) {
        init[f.name] = f.type === "money" 
          ? maskBRL(Math.round(Number(initialData[f.name]) * 100).toString()) 
          : String(initialData[f.name]);
      }
    }
    setValues(init);
  }, [initialData]);
  
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
    
    let error;
    if (initialData) {
      const res = await supabase.from(table as any).update(payload).eq("id", initialData.id);
      error = res.error;
    } else {
      const res = await supabase.from(table as any).insert(payload);
      error = res.error;
    }
    
    setSaving(false);
    if (error) return toast.error("Erro", { description: error.message });
    toast.success(initialData ? "Atualizado" : "Criado");
    qc.invalidateQueries({ queryKey: [queryKey] });
    onClose();
  };

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>{initialData ? "Editar registro" : "Novo registro"}</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label>Empresa</Label>
          <Select value={companyId} onValueChange={setCompanyId}>
            <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
            <SelectContent>
              {filteredCompanies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
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
            ) : f.type === "color" ? (
              <Input
                type="color"
                className="h-10 w-16 p-1"
                value={values[f.name] ?? "#6366f1"}
                onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
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
