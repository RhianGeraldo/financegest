import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, applyCompanyFilter } from "@/lib/auth";
import { formatBRL, formatDate } from "@/lib/format";
import { exportToPDF, exportToExcel, ExportColumn } from "@/lib/export";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { FileText, Table as TableIcon } from "lucide-react";
import { motion } from "framer-motion";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

export const Route = createFileRoute("/_authenticated/relatorios")({
  component: RelatoriosPage,
  head: () => ({ meta: [{ title: "Relatórios — Caixa" }] }),
});

function RelatoriosPage() {
  const { selectedCompanyId, companies } = useAuth();
  const [headerNode, setHeaderNode] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setHeaderNode(document.getElementById("page-header"));
  }, []);

  const { data: txs, isPending } = useQuery({
    queryKey: ["transactions", selectedCompanyId],
    queryFn: async () => {
      let q = supabase.from("transactions").select("amount, type, status, due_date, paid_date, category_id");
      q = applyCompanyFilter(q, selectedCompanyId, companies);
      const { data, error } = await q.order("due_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: cats } = useQuery({
    queryKey: ["categories", selectedCompanyId],
    queryFn: async () => {
      let q = supabase.from("categories").select("id, name, color, kind");
      q = applyCompanyFilter(q, selectedCompanyId, companies);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  if (isPending) {
    return (
      <div className="space-y-4 max-w-[1400px] mx-auto animate-pulse">
        <div className="h-8 w-48 bg-muted rounded"></div>
        <div className="h-[400px] bg-muted rounded-xl"></div>
      </div>
    );
  }

  const allTx = txs ?? [];
  const allCats = cats ?? [];
  
  // Dados de Fluxo de Caixa (Mensal)
  const monthlyFlow = allTx.reduce<Record<string, { month: string, entrada: number, saida: number }>>((acc, tx) => {
    if (tx.status !== "pago" || !tx.paid_date) return acc;
    const month = tx.paid_date.slice(0, 7);
    if (!acc[month]) acc[month] = { month, entrada: 0, saida: 0 };
    acc[month][tx.type as "entrada"|"saida"] += Number(tx.amount);
    return acc;
  }, {});
  const flowData = Object.values(monthlyFlow).sort((a, b) => a.month.localeCompare(b.month));

  // Dados de Despesas por Categoria
  const expensesByCategory = allTx
    .filter(t => t.type === "saida" && t.status === "pago")
    .reduce<Record<string, number>>((acc, tx) => {
      const catName = allCats.find(c => c.id === tx.category_id)?.name ?? "Sem categoria";
      acc[catName] = (acc[catName] ?? 0) + Number(tx.amount);
      return acc;
    }, {});
  const catData = Object.entries(expensesByCategory).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value);

  const handleExportFlow = (type: 'pdf' | 'excel') => {
    const cols: ExportColumn[] = [
      { header: "Mês", dataKey: "month" },
      { header: "Entradas", dataKey: "entrada" },
      { header: "Saídas", dataKey: "saida" },
      { header: "Saldo", dataKey: "saldo" }
    ];
    const data = flowData.map(d => ({
      month: d.month,
      entrada: formatBRL(d.entrada),
      saida: formatBRL(d.saida),
      saldo: formatBRL(d.entrada - d.saida)
    }));
    
    if (type === 'pdf') exportToPDF("Relatório de Fluxo de Caixa", cols, data);
    else exportToExcel("Fluxo_de_Caixa", data);
  };

  const handleExportCat = (type: 'pdf' | 'excel') => {
    const cols: ExportColumn[] = [
      { header: "Categoria", dataKey: "name" },
      { header: "Valor Total (Saídas)", dataKey: "value" }
    ];
    const data = catData.map(d => ({
      name: d.name,
      value: formatBRL(d.value)
    }));
    
    if (type === 'pdf') exportToPDF("Despesas por Categoria", cols, data);
    else exportToExcel("Despesas_Categoria", data);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 max-w-[1400px] mx-auto"
    >
      {headerNode && createPortal(
        <div className="flex flex-col">
          <h1 className="text-xl font-semibold tracking-tight leading-none">Relatórios Gerenciais</h1>
          <p className="text-xs text-muted-foreground mt-1">Análise financeira de {flowData.length} meses</p>
        </div>,
        headerNode
      )}

      <Tabs defaultValue="fluxo">
        <TabsList className="mb-4">
          <TabsTrigger value="fluxo">Fluxo de Caixa</TabsTrigger>
          <TabsTrigger value="categorias">Despesas por Categoria</TabsTrigger>
        </TabsList>

        <TabsContent value="fluxo">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base font-medium">Fluxo Mensal (Realizado)</CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => handleExportFlow('pdf')}>
                  <FileText className="size-4 mr-1.5" /> PDF
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleExportFlow('excel')}>
                  <TableIcon className="size-4 mr-1.5" /> Excel
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-[400px] mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={flowData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="month" stroke="var(--muted-foreground)" fontSize={12} />
                    <YAxis stroke="var(--muted-foreground)" fontSize={12} tickFormatter={(v) => formatBRL(v).replace("R$", "")} />
                    <Tooltip 
                      formatter={(val: number) => formatBRL(val)}
                      contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)" }}
                    />
                    <Bar dataKey="entrada" name="Entradas" fill="var(--success)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="saida" name="Saídas" fill="var(--destructive)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="categorias">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base font-medium">Saídas Pagas por Categoria</CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => handleExportCat('pdf')}>
                  <FileText className="size-4 mr-1.5" /> PDF
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleExportCat('excel')}>
                  <TableIcon className="size-4 mr-1.5" /> Excel
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-[400px] mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={catData} layout="vertical" margin={{ left: 50 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
                    <XAxis type="number" stroke="var(--muted-foreground)" fontSize={12} tickFormatter={(v) => formatBRL(v).replace("R$", "")} />
                    <YAxis dataKey="name" type="category" stroke="var(--muted-foreground)" fontSize={12} />
                    <Tooltip 
                      formatter={(val: number) => formatBRL(val)}
                      contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)" }}
                    />
                    <Bar dataKey="value" name="Total" fill="var(--primary)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}
