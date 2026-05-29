import { createFileRoute } from "@tanstack/react-router";
import { SimpleCrudPage } from "@/components/simple-crud";

export const Route = createFileRoute("/_authenticated/categorias")({
  component: () => (
    <SimpleCrudPage
      title="Categorias"
      table="categories"
      queryKey="categories"
      fields={[
        { name: "name", label: "Nome", type: "text", required: true },
        { name: "color", label: "Cor de identificação", type: "color", required: true },
      ]}
      columns={[
        { key: "name", label: "Nome" },
        { key: "color", label: "Cor", format: "color" },
      ]}
      companyMode="multiple"
    />
  ),
  head: () => ({ meta: [{ title: "Categorias — Gestão Financeira" }] }),
});
