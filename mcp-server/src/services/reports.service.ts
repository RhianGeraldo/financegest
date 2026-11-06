import { supabase } from "../config.js";
import { resolveAccountAndCompany } from "../utils/account-matcher.js";
import { formatBRL } from "../utils/formatters.js";
import type { ResolvedScope } from "./auth.service.js";

export async function getFinancialSummary(
  options: {
    companyQuery?: string;
    dateFrom?: string;
    dateTo?: string;
  } = {},
  scope?: ResolvedScope
) {
  const { companyQuery, dateFrom, dateTo } = options;

  let q = supabase
    .from("transactions")
    .select("id, company_id, bank_account_id, category_id, type, amount, due_date, paid_date, status");

  if (scope && !scope.isMaster) {
    if (scope.allowedCompanyIds) q = q.in("company_id", Array.from(scope.allowedCompanyIds));
    if (scope.allowedBankAccountIds) q = q.in("bank_account_id", Array.from(scope.allowedBankAccountIds));
  }

  let companyName = scope && !scope.isMaster ? `Visão Autorizada (${scope.user?.name})` : "Consolidado Geral";
  if (companyQuery) {
    const resolved = await resolveAccountAndCompany({ companyQuery }, scope);
    q = q.eq("company_id", resolved.company.id);
    companyName = resolved.company.name;
  }

  const { data: txs, error } = await q;
  if (error) throw new Error(`Erro ao gerar resumo financeiro: ${error.message}`);

  const all = txs || [];

  const filtered = all.filter((t) => {
    const refDate = t.status === "pago" && t.paid_date ? t.paid_date.slice(0, 10) : t.due_date;
    if (dateFrom && refDate < dateFrom) return false;
    if (dateTo && refDate > dateTo) return false;
    return true;
  });

  const paid = filtered.filter((t) => t.status === "pago");
  const pending = filtered.filter((t) => t.status === "pendente");

  const totalEntradas = paid
    .filter((t) => t.type === "entrada")
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const totalSaidas = paid
    .filter((t) => t.type === "saida")
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const lucroLiquido = totalEntradas - totalSaidas;

  const totalAReceber = pending
    .filter((t) => t.type === "entrada")
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const totalAPagar = pending
    .filter((t) => t.type === "saida")
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const { data: categories } = await supabase.from("categories").select("id, name");
  const catMap = new Map((categories || []).map((c) => [c.id, c.name]));

  const despesasPorCategoriaMap = new Map<string, number>();
  for (const t of paid.filter((x) => x.type === "saida")) {
    const catName = t.category_id ? catMap.get(t.category_id) || "Sem categoria" : "Sem categoria";
    despesasPorCategoriaMap.set(
      catName,
      (despesasPorCategoriaMap.get(catName) || 0) + Number(t.amount)
    );
  }

  const despesasPorCategoria = Array.from(despesasPorCategoriaMap.entries())
    .map(([category, amount]) => ({
      category,
      amount,
      amountFormatted: formatBRL(amount),
    }))
    .sort((a, b) => b.amount - a.amount);

  return {
    company: companyName,
    period: {
      from: dateFrom || "Início histórico",
      to: dateTo || "Até o momento",
    },
    realized: {
      inflows: totalEntradas,
      inflowsFormatted: formatBRL(totalEntradas),
      outflows: totalSaidas,
      outflowsFormatted: formatBRL(totalSaidas),
      netProfit: lucroLiquido,
      netProfitFormatted: formatBRL(lucroLiquido),
    },
    projectedPending: {
      toReceive: totalAReceber,
      toReceiveFormatted: formatBRL(totalAReceber),
      toPay: totalAPagar,
      toPayFormatted: formatBRL(totalAPagar),
      pendingCount: pending.length,
    },
    expensesByCategory: despesasPorCategoria,
  };
}

export async function getCategoriesAndCostCenters(companyQuery?: string, scope?: ResolvedScope) {
  let companyId: string | undefined;
  if (companyQuery) {
    const resolved = await resolveAccountAndCompany({ companyQuery }, scope);
    companyId = resolved.company.id;
  }

  const [catRes, centerRes] = await Promise.all([
    supabase.from("categories").select("id, name, color, company_ids, cost_center_ids").order("name"),
    supabase.from("cost_centers").select("id, name, company_ids").order("name"),
  ]);

  if (catRes.error) throw new Error(`Erro ao buscar categorias: ${catRes.error.message}`);
  if (centerRes.error) throw new Error(`Erro ao buscar centros de custo: ${centerRes.error.message}`);

  let categories = catRes.data || [];
  let costCenters = centerRes.data || [];

  if (companyId) {
    categories = categories.filter((c) => !c.company_ids || c.company_ids.includes(companyId!));
    costCenters = costCenters.filter((c) => !c.company_ids || c.company_ids.includes(companyId!));
  } else if (scope && !scope.isMaster && scope.allowedCompanyIds) {
    const allowed = scope.allowedCompanyIds;
    categories = categories.filter(
      (c) => !c.company_ids || c.company_ids.some((cid: string) => allowed.has(cid))
    );
    costCenters = costCenters.filter(
      (c) => !c.company_ids || c.company_ids.some((cid: string) => allowed.has(cid))
    );
  }

  return {
    totalCategories: categories.length,
    categories: categories.map((c) => ({
      id: c.id,
      name: c.name,
      color: c.color,
    })),
    totalCostCenters: costCenters.length,
    costCenters: costCenters.map((cc) => ({
      id: cc.id,
      name: cc.name,
    })),
  };
}
