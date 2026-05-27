import { createFileRoute } from "@tanstack/react-router";
import { PayableReceivablePage } from "@/components/payable-receivable";

export const Route = createFileRoute("/_authenticated/a-receber")({
  component: () => <PayableReceivablePage type="entrada" title="Contas a receber" />,
  head: () => ({ meta: [{ title: "A receber — Caixa" }] }),
});
