import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, applyCompanyFilter, applyCompanyIdsFilter } from "@/lib/auth";
import { formatBRL, maskBRL, parseBRL } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
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
  companyMode?: "single" | "multiple";
}

export function SimpleCrudPage({ title, table, queryKey, fields, columns, companyMode = "single" }: Props) {
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
      if (companyMode === "multiple") {
        q = applyCompanyIdsFilter(q, selectedCompanyId, companies);
      } else {
        q = applyCompanyFilter(q, selectedCompanyId, companies);
      }
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
            <p className="text-xs text-muted-foreground mt-1">
              <span className="font-medium text-foreground">
                {selectedCompanyId === "all_clinica" ? "Consolidado Comercial" : selectedCompanyId === "all_pessoal" ? "Consolidado Pessoal" : companies.find((c) => c.id === selectedCompanyId)?.name ?? ""}
              </span>
              {" • "}{data?.length ?? 0} registro(s)
            </p>
          </div>
          {canWrite && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild><Button size="sm" onClick={handleCreate}><Plus className="size-4 mr-1" /> Novo</Button></DialogTrigger>
              <CrudDialog table={table} queryKey={queryKey} fields={fields} initialData={editData} onClose={() => setOpen(false)} companyMode={companyMode} />
            </Dialog>
          )}
        </>,
        headerNode
      )}

      <Card>
        <CardContent className="pt-0 px-0">
          {/* Mobile View */}
          <div className="md:hidden flex flex-col">
            {(data ?? []).map((row: any) => {
              const rowCompanies = companyMode === "multiple"
                ? companies.filter(c => (row.company_ids ?? []).includes(c.id))
                : companies.filter(c => c.id === row.company_id);
              return (
                <div key={row.id} className="p-4 border-b last:border-0 hover:bg-accent/30 flex flex-col gap-2">
                  {rowCompanies.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      {rowCompanies.map(company => (
                        <div key={company.id} className="flex items-center gap-1.5 text-xs text-muted-foreground bg-accent/50 px-2 py-0.5 rounded-full">
                          <span className="size-1.5 rounded-full shrink-0" style={{ background: company.color }} />
                          <span className="truncate">{company.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {columns.map((c) => (
                    <div key={c.key} className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">{c.label}:</span>
                      {c.format === "money" ? (
                        <span className="font-medium tabular">{formatBRL(row[c.key])}</span>
                      ) : c.format === "color" ? (
                        <div className="flex items-center gap-2">
                          <span className="size-3 rounded-full shadow-sm" style={{ background: row[c.key] }} />
                          <span className="text-muted-foreground text-xs">{row[c.key]}</span>
                        </div>
                      ) : (
                        <span className="font-medium">{String(row[c.key] ?? "")}</span>
                      )}
                    </div>
                  ))}
                  {canWrite && (
                    <div className="flex justify-end gap-2 mt-2 pt-2 border-t border-dashed border-border/50">
                      <Button size="sm" variant="ghost" className="h-7 w-7 text-muted-foreground px-0" onClick={() => handleEdit(row)}>
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
                            <AlertDialogTitle>Excluir registro?</AlertDialogTitle>
                            <AlertDialogDescription>Esta ação não pode ser desfeita. O registro será removido permanentemente.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => remove(row.id)}>Excluir</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  )}
                </div>
              );
            })}
            {(data ?? []).length === 0 && (
              <div className="py-10 text-center text-sm text-muted-foreground">Nenhum registro.</div>
            )}
          </div>

          {/* Desktop View */}
          <div className="hidden md:block overflow-auto max-h-[calc(100vh-240px)]">
            <table className="w-full text-sm relative min-w-[500px]">
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
                const rowCompanies = companyMode === "multiple"
                  ? companies.filter(c => (row.company_ids ?? []).includes(c.id))
                  : companies.filter(c => c.id === row.company_id);
                return (
                  <tr key={row.id} className="border-b last:border-0 hover:bg-accent/30">
                    <td className="py-3 px-2">
                      <div className="flex flex-wrap gap-1">
                        {rowCompanies.map(company => (
                          <span key={company.id} className="inline-flex items-center gap-1.5 text-xs bg-accent/50 px-2 py-0.5 rounded-full">
                            <span className="size-1.5 rounded-full" style={{ background: company.color }} />
                            {company.name}
                          </span>
                        ))}
                      </div>
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

function CrudDialog({ table, queryKey, fields, initialData, onClose, companyMode = "single" }: { table: string; queryKey: string; fields: Field[]; initialData?: any; onClose: () => void; companyMode?: "single" | "multiple" }) {
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
  const [companyIds, setCompanyIds] = useState<string[]>(initialData?.company_ids ?? [getSelectedCompanyId()]);
  const [values, setValues] = useState<Record<string, string>>({});
  
  useEffect(() => {
    setCompanyId(initialData?.company_id ?? getSelectedCompanyId());
    setCompanyIds(initialData?.company_ids ?? [getSelectedCompanyId()]);
    
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
    if (companyMode === "single" && !companyId) return toast.error("Selecione uma empresa");
    if (companyMode === "multiple" && companyIds.length === 0) return toast.error("Selecione ao menos uma empresa");
    
    const payload: any = companyMode === "multiple" ? { company_ids: companyIds } : { company_id: companyId };
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
        {companyMode === "multiple" ? (
          <div className="space-y-2">
            <Label>Empresas disponíveis</Label>
            <div className="flex flex-col gap-2 border rounded-md p-3 max-h-[200px] overflow-auto">
              {companies.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-accent/50 p-1.5 rounded-md -mx-1.5 transition-colors">
                  <Checkbox 
                    checked={companyIds.includes(c.id)} 
                    onCheckedChange={(checked) => {
                      if (checked) setCompanyIds([...companyIds, c.id]);
                      else setCompanyIds(companyIds.filter(id => id !== c.id));
                    }}
                  />
                  <span className="size-2 rounded-full shrink-0" style={{ background: c.color }} />
                  {c.name}
                </label>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label>Empresa</Label>
            <Select value={companyId} onValueChange={setCompanyId}>
              <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
              <SelectContent>
                {filteredCompanies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
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
