import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, applyCompanyFilter } from "@/lib/auth";
import { formatBRL, statusLabel, formatDate, getDaysOverdue, todayISO } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  ArrowDownRight,
  ArrowUpRight,
  Wallet,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Plus,
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
  head: () => ({ meta: [{ title: "Dashboard — Gestão Financeira" }] }),
});

function DashboardPage() {
  const { selectedCompanyId, companies, loading } = useAuth();

  const { data: tx, isPending: txLoading } = useQuery({
    queryKey: ["transactions", selectedCompanyId, companies.map(c => c.id).join(",")],
    queryFn: async () => {
      let q = supabase
        .from("transactions")
        .select("id, company_id, type, description, amount, category_id, cost_center_id, bank_account_id, due_date, paid_date, status, notes, created_by, paid_by, receipt_url, created_at")
        .order("due_date", { ascending: false });
      q = applyCompanyFilter(q, selectedCompanyId, companies);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !loading,
  });

  const { data: banks, isPending: banksLoading } = useQuery({
    queryKey: ["banks", selectedCompanyId, companies.map(c => c.id).join(",")],
    queryFn: async () => {
      let q = supabase.from("bank_accounts").select("initial_balance");
      q = applyCompanyFilter(q, selectedCompanyId, companies);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !loading,
  });

  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const txs = tx ?? [];
  const paid = txs.filter((t) => t.status === "pago");
  const monthPaid = paid.filter((t) => t.due_date.startsWith(ym));
  const inMonth = monthPaid.filter((t) => t.type === "entrada").reduce((s, t) => s + Number(t.amount), 0);
  const outMonth = monthPaid.filter((t) => t.type === "saida").reduce((s, t) => s + Number(t.amount), 0);
  const lucro = inMonth - outMonth;

  const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];
  const aPagar = txs.filter((t) => t.type === "saida" && t.status === "pendente" && t.due_date <= lastDayOfMonth).reduce((s, t) => s + Number(t.amount), 0);
  const aReceber = txs.filter((t) => t.type === "entrada" && t.status === "pendente" && t.due_date <= lastDayOfMonth).reduce((s, t) => s + Number(t.amount), 0);

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
  
  const today = todayISO();
  const pendingTxs = txs.filter((t) => t.status === "pendente");

  const vencidos = pendingTxs
    .filter((t) => t.due_date < today)
    .sort((a, b) => a.due_date.localeCompare(b.due_date));

  const aVencerHoje = pendingTxs
    .filter((t) => t.due_date === today)
    .sort((a, b) => a.due_date.localeCompare(b.due_date));

  const aVencerFuturo = pendingTxs
    .filter((t) => t.due_date > today)
    .sort((a, b) => a.due_date.localeCompare(b.due_date));

  const stats = [
    { label: "Saldo total", value: formatBRL(saldoTotal), icon: Wallet, accent: "text-primary" },
    { label: "Entradas do mês", value: formatBRL(inMonth), icon: ArrowDownRight, accent: "text-success" },
    { label: "Saídas do mês", value: formatBRL(outMonth), icon: ArrowUpRight, accent: "text-destructive" },
    { label: "Lucro do mês", value: formatBRL(lucro), icon: TrendingUp, accent: lucro >= 0 ? "text-success" : "text-destructive" },
    { label: "A pagar", value: formatBRL(aPagar), icon: Clock, accent: "text-warning" },
    { label: "A receber", value: formatBRL(aReceber), icon: CheckCircle2, accent: "text-primary" },
  ];

  const [headerNode, setHeaderNode] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setHeaderNode(document.getElementById("page-header"));
  }, []);

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      {headerNode && createPortal(
        <div className="flex flex-col">
          <h1 className="text-xl font-semibold tracking-tight leading-none">Dashboard</h1>
          <p className="text-xs text-muted-foreground mt-1">
            {selectedCompanyId === "all_clinica"
              ? "Consolidado Comercial"
              : selectedCompanyId === "all_pessoal"
              ? "Consolidado Pessoal"
              : companies.find((c) => c.id === selectedCompanyId)?.name ?? ""}
          </p>
        </div>,
        headerNode
      )}

      {(txLoading || banksLoading) ? (
        <div className="space-y-6 animate-pulse">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {[...Array(6)].map((_, i) => <div key={i} className="h-24 bg-muted/60 rounded-xl"></div>)}
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2 h-[350px] bg-muted/60 rounded-xl"></div>
            <div className="h-[350px] bg-muted/60 rounded-xl"></div>
          </div>
        </div>
      ) : (
        <>


      <div className="flex flex-col gap-6">
        <div className="order-2 lg:order-1 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
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

        <div className="order-3 lg:order-2 grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2 min-w-0 overflow-hidden">
            <CardHeader>
              <CardTitle className="text-base">Fluxo de caixa — últimos 6 meses</CardTitle>
            </CardHeader>
            <CardContent className="h-72 min-w-0">
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

          <Card className="min-w-0 overflow-hidden">
            <CardHeader>
              <CardTitle className="text-base">Despesas por categoria (mês)</CardTitle>
            </CardHeader>
            <CardContent className="h-72 min-w-0">
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

        <div className="order-4 lg:order-3 contents lg:grid lg:grid-cols-2 gap-4 items-stretch">
          <Card className="order-4 lg:order-none flex flex-col h-full">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Últimas transações</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 space-y-2 overflow-y-auto max-h-[480px]">
              {recent.length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">Sem transações ainda.</p>}
              {recent.map((t) => {
                const st = statusLabel(t.status, t.due_date);
                const company = companies.find((c) => c.id === t.company_id);
                return (
                  <Link key={t.id} to="/transacoes" search={{ editId: t.id }} className="flex items-center justify-between py-2 border-b last:border-0 hover:bg-accent/20 px-1 rounded transition-colors cursor-pointer">
                    <div className="min-w-0 pr-2">
                      <p className="text-sm font-medium truncate">{t.description}</p>
                      {company && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                          <span className="size-1.5 rounded-full shrink-0" style={{ background: company.color }} />
                          <span className="truncate">{company.name}</span>
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-0.5">{formatDate(t.due_date)}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-sm font-medium tabular ${t.type === "entrada" ? "text-success" : "text-destructive"}`}>
                        {t.type === "entrada" ? "+" : "-"} {formatBRL(t.amount)}
                      </p>
                      <Badge variant={st === "pago" ? "default" : st === "atrasado" ? "destructive" : "secondary"} className="text-[10px]">
                        {st}
                      </Badge>
                    </div>
                  </Link>
                );
              })}
            </CardContent>
          </Card>

          <Card className="order-1 lg:order-none flex flex-col h-full">
            <Tabs defaultValue={vencidos.length > 0 ? "vencidos" : aVencerHoje.length > 0 ? "hoje" : "a_vencer"} className="flex flex-col h-full">
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <CardTitle className="text-base font-semibold whitespace-nowrap shrink-0">Próximos vencimentos</CardTitle>
                  <TabsList className="h-8 p-1 w-full sm:w-auto overflow-x-auto justify-start sm:justify-center shrink-0">
                    <TabsTrigger value="vencidos" className="text-xs px-2.5 h-6 shrink-0">
                      Vencidos ({vencidos.length})
                    </TabsTrigger>
                    <TabsTrigger value="hoje" className="text-xs px-2.5 h-6 shrink-0">
                      A vencer hoje ({aVencerHoje.length})
                    </TabsTrigger>
                    <TabsTrigger value="a_vencer" className="text-xs px-2.5 h-6 shrink-0">
                      A vencer ({aVencerFuturo.length})
                    </TabsTrigger>
                  </TabsList>
                </div>
              </CardHeader>

              <CardContent className="pt-2 flex-1 overflow-y-auto min-h-[480px] sm:min-h-[360px] max-h-[580px] sm:max-h-[480px] pr-1">
                <TabsContent value="vencidos" className="mt-0 space-y-2">
                  {vencidos.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">Nenhum título vencido.</p>
                  ) : (
                    vencidos.map((t) => {
                      const daysOverdue = getDaysOverdue(t.due_date);
                      const company = companies.find((c) => c.id === t.company_id);
                      return (
                        <Link key={t.id} to="/transacoes" search={{ editId: t.id }} className="flex items-center justify-between py-2 border-b last:border-0 hover:bg-accent/20 px-1 rounded transition-colors cursor-pointer">
                          <div className="min-w-0 pr-2">
                            <p className="text-sm font-medium truncate">{t.description}</p>
                            {company && (
                              <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                                <span className="size-1.5 rounded-full shrink-0" style={{ background: company.color }} />
                                <span className="truncate">{company.name}</span>
                              </p>
                            )}
                            <p className="text-xs text-destructive font-medium mt-0.5">
                              Venceu {formatDate(t.due_date)} • {daysOverdue} {daysOverdue === 1 ? "dia" : "dias"} em atraso
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-medium tabular">{formatBRL(t.amount)}</p>
                            <Badge variant="destructive" className="text-[10px] mt-0.5">
                              atrasado
                            </Badge>
                          </div>
                        </Link>
                      );
                    })
                  )}
                </TabsContent>

                <TabsContent value="hoje" className="mt-0 space-y-2">
                  {aVencerHoje.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">Nenhum título a vencer hoje.</p>
                  ) : (
                    aVencerHoje.map((t) => {
                      const company = companies.find((c) => c.id === t.company_id);
                      return (
                        <Link key={t.id} to="/transacoes" search={{ editId: t.id }} className="flex items-center justify-between py-2 border-b last:border-0 hover:bg-accent/20 px-1 rounded transition-colors cursor-pointer">
                          <div className="min-w-0 pr-2">
                            <p className="text-sm font-medium truncate">{t.description}</p>
                            {company && (
                              <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                                <span className="size-1.5 rounded-full shrink-0" style={{ background: company.color }} />
                                <span className="truncate">{company.name}</span>
                              </p>
                            )}
                            <p className="text-xs text-amber-600 dark:text-amber-400 font-medium mt-0.5">
                              Vence hoje ({formatDate(t.due_date)})
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-medium tabular">{formatBRL(t.amount)}</p>
                            <Badge variant="secondary" className="text-[10px] bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20 mt-0.5">
                              hoje
                            </Badge>
                          </div>
                        </Link>
                      );
                    })
                  )}
                </TabsContent>

                <TabsContent value="a_vencer" className="mt-0 space-y-2">
                  {aVencerFuturo.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">Nenhum título a vencer nos próximos dias.</p>
                  ) : (
                    aVencerFuturo.map((t) => {
                      const company = companies.find((c) => c.id === t.company_id);
                      return (
                        <Link key={t.id} to="/transacoes" search={{ editId: t.id }} className="flex items-center justify-between py-2 border-b last:border-0 hover:bg-accent/20 px-1 rounded transition-colors cursor-pointer">
                          <div className="min-w-0 pr-2">
                            <p className="text-sm font-medium truncate">{t.description}</p>
                            {company && (
                              <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                                <span className="size-1.5 rounded-full shrink-0" style={{ background: company.color }} />
                                <span className="truncate">{company.name}</span>
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Vence {formatDate(t.due_date)}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-medium tabular">{formatBRL(t.amount)}</p>
                            <Badge variant="secondary" className="text-[10px] mt-0.5">
                              pendente
                            </Badge>
                          </div>
                        </Link>
                      );
                    })
                  )}
                </TabsContent>
              </CardContent>
            </Tabs>
          </Card>
        </div>
      </div>
        </>
      )}
    </div>
  );
}
