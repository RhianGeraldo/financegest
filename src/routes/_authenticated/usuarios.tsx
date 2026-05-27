import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/usuarios")({
  component: () => (
    <div className="max-w-[1100px] mx-auto space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Usuários e permissões</h1>
      <Card><CardContent className="pt-6 text-sm text-muted-foreground">
        Em breve. Os usuários se cadastram via tela de login; o primeiro torna-se Super Admin automaticamente.
        Próximas iterações: convites por e-mail, atribuição de papéis e vínculo a empresas.
      </CardContent></Card>
    </div>
  ),
  head: () => ({ meta: [{ title: "Usuários — Caixa" }] }),
});
