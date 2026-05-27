import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { formatBRL, statusLabel, formatDate } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowDownRight,
  ArrowUpRight,
  Wallet,
  TrendingUp,
  Clock,
  CheckCircle2,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from "recharts";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
  head: () => ({ meta: [{ title: "Dashboard — Caixa" }] }),
});

function DashboardPage() {
  const { selectedCompanyId, companies } = useAuth();

  const companyFilter = (q: ReturnType<typeof supabase.from>) =>
    selectedCompanyId === "all" ? q : q.eq("company_id", selectedCompanyId);

  const { data: tx } = useQuery({
    queryKey: ["tx", selectedCompanyId],
    queryFn: async () => {
      let q = supabase.from("transactions").select("*").order("due_date", { ascending: false }).limit(500);
      if (selectedCompanyId !== "all") q = q.eq("company_id", selectedCompanyId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: banks } = useQuery({
    queryKey: ["banks", selectedCompanyId],
    queryFn: async () => {
      let q = supabase.from("bank_accounts").select("*");
      if (selectedCompanyId !== "all") q = q.eq("company_id", selectedCompanyId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const txs = tx ?? [];
  const paid = txs.filter((t) => t.status === "pago");
  const monthPaid = paid.filter((t) => (t.paid_date ?? "").startsWith(ym));
  const inMonth = monthPaid.filter((t) => t.type === "entrada").reduce((s, t) => s + Number(t.amount), 0);
  const outMonth = monthPaid.filter((t) => t.type === "saida").reduce((s, t) => s + Number(t.amount), 0);
  const lucro = inMonth - outMonth;

  const aPagar = txs.filter((t) => t.type === "saida" && t.status === "pendente").reduce((s, t) => s + Number(t.amount), 0);
  const aReceber = txs.filter((t) => t.type === "entrada" && t.status === "pendente").reduce((s, t) => s + Number(t.amount), 0);

  const initial = (banks ?? []).reduce((s, b) => s + Number(b.initial_balance), 0);
  const saldoTotal =
    initial +
    paid.reduce((s, t) => s + (t.type === "entrada" ? Number(t.amount) : -Number(t.amount)), 0);

  // Fluxo mensal últimos 6 meses
  const months: { label: string; entrada: number; saida: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("pt-BR", { month: "short" });
    const m = paid.filter((t) => (t.paid_date ?? "").startsWith(key));
    months.push({
      label,
      entrada: m.filter((t) => t.type === "entrada").reduce((s, t) => s + Number(t.amount), 0),
      saida: m.filter((t) => t.type === "saida").reduce((s, t) => s + Number(t.amount), 0),
    });
  }

  const recent = txs.slice(0, 6);
  const upcoming = txs
    .filter((t) => t.status === "pendente")
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
    .slice(0, 6);

  const stats = [
    { label: "Saldo total", value: formatBRL(saldoTotal), icon: Wallet, accent: "text-primary" },
    { label: "Entradas do mês", value: formatBRL(inMonth), icon: ArrowDownRight, accent: "text-success" },
    { label: "Saídas do mês", value: formatBRL(outMonth), icon: ArrowUpRight, accent: "text-destructive" },
    { label: "Lucro do mês", value: formatBRL(lucro), icon: TrendingUp, accent: lucro >= 0 ? "text-success" : "text-destructive" },
    { label: "A pagar", value: formatBRL(aPagar), icon: Clock, accent: "text-warning" },
    { label: "A receber", value: formatBRL(aReceber), icon: CheckCircle2, accent: "text-primary" },
  ];

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          {selectedCompanyId === "all"
            ? `Visão consolidada — ${companies.length} empresa(s)`
            : companies.find((c) => c.id === selectedCompanyId)?.name ?? ""}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{s.label}</span>
                <s.icon className={`size-4 ${s.accent}`} />
              </div>
              <div className="mt-2 text-xl font-semibold tabular">{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Fluxo de caixa — últimos 6 meses</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={months}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--muted-foreground)" fontSize={12} tickFormatter={(v) => formatBRL(v).replace("R$", "")} />
                <Tooltip
                  contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8 }}
                  formatter={(v: number) => formatBRL(v)}
                />
                <Line type="monotone" dataKey="entrada" stroke="var(--success)" strokeWidth={2} dot={false} name="Entradas" />
                <Line type="monotone" dataKey="saida" stroke="var(--destructive)" strokeWidth={2} dot={false} name="Saídas" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Despesas por categoria (mês)</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={Object.entries(
                    monthPaid
                      .filter((t) => t.type === "saida")
                      .reduce<Record<string, number>>((acc, t) => {
                        const k = t.category_id ?? "Outros";
                        acc[k] = (acc[k] ?? 0) + Number(t.amount);
                        return acc;
                      }, {}),
                  ).map(([name, value]) => ({ name, value }))}
                  dataKey="value"
                  innerRadius={50}
                  outerRadius={90}
                >
                  {["chart-1", "chart-2", "chart-3", "chart-4", "chart-5"].map((_, i) => (
                    <Cell key={i} fill={`var(--chart-${(i % 5) + 1})`} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => formatBRL(v)} contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)" }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Últimas transações</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {recent.length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">Sem transações ainda.</p>}
            {recent.map((t) => {
              const st = statusLabel(t.status, t.due_date);
              return (
                <div key={t.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{t.description}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(t.due_date)}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-medium tabular ${t.type === "entrada" ? "text-success" : "text-destructive"}`}>
                      {t.type === "entrada" ? "+" : "-"} {formatBRL(t.amount)}
                    </p>
                    <Badge variant={st === "pago" ? "default" : st === "atrasado" ? "destructive" : "secondary"} className="text-[10px]">
                      {st}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Próximos vencimentos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {upcoming.length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">Nada pendente.</p>}
            {upcoming.map((t) => {
              const st = statusLabel(t.status, t.due_date);
              return (
                <div key={t.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{t.description}</p>
                    <p className="text-xs text-muted-foreground">Vence {formatDate(t.due_date)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium tabular">{formatBRL(t.amount)}</p>
                    <Badge variant={st === "atrasado" ? "destructive" : "secondary"} className="text-[10px]">
                      {st}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
