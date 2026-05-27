import { createFileRoute } from "@tanstack/react-router";
import { PayableReceivablePage } from "@/components/payable-receivable";

export const Route = createFileRoute("/_authenticated/a-pagar")({
  component: () => <PayableReceivablePage type="saida" title="Contas a pagar" />,
  head: () => ({ meta: [{ title: "A pagar — Caixa" }] }),
});
