import { createFileRoute } from "@tanstack/react-router";
import { SimpleCrudPage } from "@/components/simple-crud";

export const Route = createFileRoute("/_authenticated/contas")({
  component: () => (
    <SimpleCrudPage
      title="Contas bancárias"
      table="bank_accounts"
      queryKey="bank_accounts"
      fields={[
        { name: "bank", label: "Banco", type: "text", required: true },
        { name: "name", label: "Nome da conta", type: "text", required: true },
        { name: "initial_balance", label: "Saldo inicial", type: "money", required: true },
      ]}
      columns={[
        { key: "bank", label: "Banco" },
        { key: "name", label: "Nome" },
        { key: "initial_balance", label: "Saldo inicial", format: "money", align: "right" },
      ]}
    />
  ),
  head: () => ({ meta: [{ title: "Contas — Gestão Financeira" }] }),
});
