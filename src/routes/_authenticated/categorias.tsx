import { createFileRoute } from "@tanstack/react-router";
import { SimpleCrudPage } from "@/components/simple-crud";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, applyCompanyIdsFilter } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/categorias")({
  component: CategoriasPage,
  head: () => ({ meta: [{ title: "Categorias — Gestão Financeira" }] }),
});

function CategoriasPage() {
  const { selectedCompanyId, companies } = useAuth();
  
  const { data: costCenters } = useQuery({
    queryKey: ["cost_centers", selectedCompanyId],
    queryFn: async () => {
      let q = supabase.from("cost_centers").select("id, name").order("name");
      q = applyCompanyIdsFilter(q, selectedCompanyId, companies);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    }
  });

  const costCenterOptions = (costCenters ?? []).map((c) => ({ value: c.id, label: c.name }));

  return (
    <SimpleCrudPage
      title="Categorias"
      table="categories"
      queryKey="categories"
      fields={[
        { name: "name", label: "Nome", type: "text", required: true },
        { name: "cost_center_ids", label: "Centros de Custo", type: "multiselect", required: true, options: costCenterOptions },
        { name: "color", label: "Cor de identificação", type: "color", required: true },
      ]}
      columns={[
        { key: "name", label: "Nome" },
        { key: "cost_center_ids", label: "Centros de Custo", format: "multiselect" },
        { key: "color", label: "Cor", format: "color" },
      ]}
      companyMode="multiple"
    />
  );
}
