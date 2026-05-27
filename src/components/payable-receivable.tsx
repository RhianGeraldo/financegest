import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { formatBRL, formatDate, statusLabel, todayISO, isOverdue } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export function PayableReceivablePage({ type, title }: { type: "entrada" | "saida"; title: string }) {
  const { selectedCompanyId, companies, canWrite } = useAuth();
  const qc = useQueryClient();

  const { data: items } = useQuery({
    queryKey: ["pr", type, selectedCompanyId],
    queryFn: async () => {
      let q = supabase.from("transactions").select("*").eq("type", type).eq("status", "pendente").order("due_date");
      if (selectedCompanyId !== "all") q = q.eq("company_id", selectedCompanyId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const total = (items ?? []).reduce((s, t) => s + Number(t.amount), 0);
  const overdueCount = (items ?? []).filter((t) => isOverdue(t.due_date, t.status)).length;

  const markPaid = async (id: string) => {
    const { error } = await supabase.from("transactions").update({ status: "pago", paid_date: todayISO() }).eq("id", id);
    if (error) return toast.error("Erro", { description: error.message });
    toast.success("Marcada como paga");
    qc.invalidateQueries({ queryKey: ["pr"] });
    qc.invalidateQueries({ queryKey: ["tx"] });
  };

  return (
    <div className="space-y-4 max-w-[1400px] mx-auto">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">
          {items?.length ?? 0} pendentes • Total: <span className="font-medium text-foreground tabular">{formatBRL(total)}</span>
          {overdueCount > 0 && (
            <span className="ml-3 text-destructive inline-flex items-center gap-1">
              <AlertTriangle className="size-3" /> {overdueCount} em atraso
            </span>
          )}
        </p>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-2">
          {(items ?? []).map((t) => {
            const st = statusLabel(t.status, t.due_date);
            const company = companies.find((c) => c.id === t.company_id);
            return (
              <div key={t.id} className={`flex items-center justify-between gap-3 py-3 border-b last:border-0 ${st === "atrasado" ? "bg-destructive/5 -mx-2 px-2 rounded" : ""}`}>
                <div className="min-w-0">
                  <p className="font-medium">{t.description}</p>
                  {company && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                      <span className="size-1.5 rounded-full" style={{ background: company.color }} />
                      {company.name} • Vence {formatDate(t.due_date)}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={st === "atrasado" ? "destructive" : "secondary"}>{st}</Badge>
                  <span className="tabular font-semibold w-32 text-right">{formatBRL(t.amount)}</span>
                  {canWrite && (
                    <Button size="sm" variant="outline" onClick={() => markPaid(t.id)}>
                      <CheckCircle2 className="size-3.5 mr-1" /> Pagar
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
          {(items ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-12">Nada pendente. 🎉</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
