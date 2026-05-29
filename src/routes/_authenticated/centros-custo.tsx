import { createFileRoute } from "@tanstack/react-router";
import { SimpleCrudPage } from "@/components/simple-crud";

export const Route = createFileRoute("/_authenticated/centros-custo")({
  component: () => (
    <SimpleCrudPage
      title="Centros de custo"
      table="cost_centers"
      queryKey="cost_centers"
      fields={[{ name: "name", label: "Nome", type: "text", required: true }]}
      columns={[{ key: "name", label: "Nome" }]}
      companyMode="multiple"
    />
  ),
  head: () => ({ meta: [{ title: "Centros de custo — Gestão Financeira" }] }),
});
