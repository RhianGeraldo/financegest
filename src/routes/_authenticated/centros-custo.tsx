import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, applyCompanyIdsFilter } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Edit2, ListTree, FolderTree } from "lucide-react";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { CrudDialog } from "@/components/simple-crud";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/centros-custo")({
  component: CentrosCustoPage,
  head: () => ({ meta: [{ title: "Centros de Custo e Categorias — Gestão Financeira" }] }),
});

function CentrosCustoPage() {
  const { selectedCompanyId, companies, canWrite } = useAuth();
  const qc = useQueryClient();
  const [openCC, setOpenCC] = useState(false);
  const [editCC, setEditCC] = useState<any>(null);
  const [openCat, setOpenCat] = useState(false);
  const [editCat, setEditCat] = useState<any>(null);

  const { data: costCenters } = useQuery({
    queryKey: ["cost_centers", selectedCompanyId],
    queryFn: async () => {
      let q = supabase.from("cost_centers").select("*").order("name");
      q = applyCompanyIdsFilter(q, selectedCompanyId, companies);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    }
  });

  const { data: categories } = useQuery({
    queryKey: ["categories", selectedCompanyId],
    queryFn: async () => {
      let q = supabase.from("categories").select("*").order("name");
      q = applyCompanyIdsFilter(q, selectedCompanyId, companies);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    }
  });

  const handleCreateCC = () => { setEditCC(null); setOpenCC(true); };
  const handleEditCC = (e: React.MouseEvent, cc: any) => { e.stopPropagation(); setEditCC(cc); setOpenCC(true); };
  const removeCC = async (id: string) => {
    const { error } = await supabase.from("cost_centers").delete().eq("id", id);
    if (error) return toast.error("Erro", { description: error.message });
    toast.success("Excluído");
    qc.invalidateQueries({ queryKey: ["cost_centers"] });
    qc.invalidateQueries({ queryKey: ["categories"] });
  };

  const handleCreateCat = (ccId: string) => { setEditCat({ cost_center_id: ccId }); setOpenCat(true); };
  const handleEditCat = (cat: any) => { setEditCat(cat); setOpenCat(true); };
  const removeCat = async (id: string) => {
    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (error) return toast.error("Erro", { description: error.message });
    toast.success("Excluído");
    qc.invalidateQueries({ queryKey: ["categories"] });
  };

  const ccFields = [{ name: "name", label: "Nome", type: "text" as const, required: true }];
  const catFields = [
    { name: "name", label: "Nome", type: "text" as const, required: true },
    { name: "cost_center_id", label: "Centro de Custo", type: "select" as const, required: true, options: (costCenters ?? []).map(c => ({ value: c.id, label: c.name })) },
    { name: "color", label: "Cor de identificação", type: "color" as const, required: true },
  ];

  return (
    <div className="space-y-4 max-w-4xl mx-auto p-4 md:p-6 lg:p-8 pt-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <FolderTree className="size-6 text-muted-foreground" />
            Centros de Custo e Categorias
          </h2>
          <p className="text-muted-foreground">Gerencie a hierarquia das suas finanças.</p>
        </div>
        {canWrite && (
          <Dialog open={openCC} onOpenChange={setOpenCC}>
            <DialogTrigger asChild><Button onClick={handleCreateCC}><Plus className="size-4 mr-2" /> Novo Centro</Button></DialogTrigger>
            {openCC && <CrudDialog table="cost_centers" queryKey="cost_centers" fields={ccFields} initialData={editCC} onClose={() => setOpenCC(false)} companyMode="multiple" />}
          </Dialog>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          <Accordion type="multiple" className="w-full">
            {(costCenters ?? []).map((cc) => {
              const cats = (categories ?? []).filter(c => c.cost_center_id === cc.id);
              return (
                <AccordionItem key={cc.id} value={cc.id} className="border-b px-4">
                  <AccordionTrigger className="hover:no-underline py-4">
                    <div className="flex flex-1 items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="font-semibold">{cc.name}</span>
                        <span className="text-xs text-muted-foreground bg-accent px-2 py-0.5 rounded-full">{cats.length} categorias</span>
                      </div>
                      {canWrite && (
                        <div className="flex items-center gap-2 mr-4">
                          <Button size="icon" variant="ghost" onClick={(e) => handleEditCC(e, cc)} className="size-8">
                            <Edit2 className="size-4 text-muted-foreground" />
                          </Button>
                          <div onClick={(e) => e.stopPropagation()}>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button size="icon" variant="ghost" className="size-8">
                                  <Trash2 className="size-4 text-destructive opacity-70 hover:opacity-100" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader><AlertDialogTitle>Excluir Centro de Custo?</AlertDialogTitle><AlertDialogDescription>Isso excluirá também todas as categorias vinculadas a ele.</AlertDialogDescription></AlertDialogHeader>
                                <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => removeCC(cc.id)}>Excluir</AlertDialogAction></AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>
                      )}
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="bg-accent/30 rounded-md p-4 space-y-3">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-medium text-muted-foreground flex items-center gap-2"><ListTree className="size-4" /> Categorias vinculadas</span>
                        {canWrite && (
                          <Button size="sm" variant="outline" onClick={() => handleCreateCat(cc.id)}>
                            <Plus className="size-4 mr-2" /> Adicionar Categoria
                          </Button>
                        )}
                      </div>
                      
                      {cats.length === 0 ? (
                        <div className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded-md">Nenhuma categoria cadastrada.</div>
                      ) : (
                        <div className="space-y-2">
                          {cats.map(cat => (
                            <div key={cat.id} className="flex justify-between items-center bg-card border p-3 rounded-md shadow-sm">
                              <div className="flex items-center gap-3">
                                <span className="size-3 rounded-full shadow-sm" style={{ background: cat.color }} />
                                <span className="font-medium text-sm">{cat.name}</span>
                              </div>
                              {canWrite && (
                                <div className="flex gap-2">
                                  <Button size="icon" variant="ghost" className="size-8" onClick={() => handleEditCat(cat)}><Edit2 className="size-4" /></Button>
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild><Button size="icon" variant="ghost" className="size-8"><Trash2 className="size-4 text-destructive" /></Button></AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader><AlertDialogTitle>Excluir categoria?</AlertDialogTitle></AlertDialogHeader>
                                      <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => removeCat(cat.id)}>Excluir</AlertDialogAction></AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
            {(costCenters ?? []).length === 0 && (
              <div className="py-10 text-center text-sm text-muted-foreground">Nenhum centro de custo cadastrado.</div>
            )}
          </Accordion>
        </CardContent>
      </Card>
      
      <Dialog open={openCat} onOpenChange={setOpenCat}>
        {openCat && <CrudDialog table="categories" queryKey="categories" fields={catFields} initialData={editCat} onClose={() => setOpenCat(false)} companyMode="multiple" />}
      </Dialog>
    </div>
  );
}
