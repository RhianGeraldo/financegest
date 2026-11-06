import { supabase } from "../config.js";
import { getCompaniesAndAccounts, resolveAccountAndCompany } from "../utils/account-matcher.js";
import { formatBRL, todayISO } from "../utils/formatters.js";
import { markTransactionAsPaid } from "./transactions.service.js";
import type { ResolvedScope } from "./auth.service.js";

export interface StatementItem {
  date: string;
  amount: number;
  type: "entrada" | "saida";
  description?: string;
}

export interface ReconcileOptions {
  accountQuery: string;
  statementItems: StatementItem[];
  dateToleranceDays?: number;
  autoApplyExactMatches?: boolean;
}

/**
 * Calcula os saldos detalhados das contas respeitando o escopo da API Key
 */
export async function getAccountsBalanceReport(filterCompanyQuery?: string, scope?: ResolvedScope) {
  const { companies, bankAccounts } = await getCompaniesAndAccounts(scope);

  let targetCompanies = companies;
  if (filterCompanyQuery) {
    const resolved = await resolveAccountAndCompany({ companyQuery: filterCompanyQuery }, scope);
    targetCompanies = [resolved.company];
  }

  const targetCompIds = new Set(targetCompanies.map((c) => c.id));
  const relevantAccounts = bankAccounts.filter((a) => targetCompIds.has(a.company_id));

  const { data: allTxs, error } = await supabase
    .from("transactions")
    .select("id, company_id, bank_account_id, type, amount, status, due_date, paid_date")
    .in("company_id", Array.from(targetCompIds));

  if (error) throw new Error(`Erro ao buscar transações para relatório de saldo: ${error.message}`);

  const txs = allTxs || [];

  const accountReports = relevantAccounts.map((acc) => {
    const accTxs = txs.filter((t) => t.bank_account_id === acc.id);
    const paidTxs = accTxs.filter((t) => t.status === "pago");
    const pendingTxs = accTxs.filter((t) => t.status === "pendente");

    const totalEntradasPagas = paidTxs
      .filter((t) => t.type === "entrada")
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const totalSaidasPagas = paidTxs
      .filter((t) => t.type === "saida")
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const saldoCalculado = Number(acc.initial_balance) + totalEntradasPagas - totalSaidasPagas;

    const pendenteEntradas = pendingTxs
      .filter((t) => t.type === "entrada")
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const pendenteSaidas = pendingTxs
      .filter((t) => t.type === "saida")
      .reduce((sum, t) => sum + Number(t.amount), 0);

    return {
      accountId: acc.id,
      accountName: acc.name,
      bank: acc.bank,
      companyId: acc.company_id,
      companyName: acc.company_name,
      initialBalance: Number(acc.initial_balance),
      initialBalanceFormatted: formatBRL(acc.initial_balance),
      totalEntradasPagas,
      totalEntradasPagasFormatted: formatBRL(totalEntradasPagas),
      totalSaidasPagas,
      totalSaidasPagasFormatted: formatBRL(totalSaidasPagas),
      currentBalance: saldoCalculado,
      currentBalanceFormatted: formatBRL(saldoCalculado),
      pendingInflows: pendenteEntradas,
      pendingInflowsFormatted: formatBRL(pendenteEntradas),
      pendingOutflows: pendenteSaidas,
      pendingOutflowsFormatted: formatBRL(pendenteSaidas),
      pendingTransactionsCount: pendingTxs.length,
    };
  });

  const companyReports = targetCompanies.map((c) => {
    const accounts = accountReports.filter((a) => a.companyId === c.id);
    const totalBalance = accounts.reduce((sum, a) => sum + a.currentBalance, 0);
    const totalPendingIn = accounts.reduce((sum, a) => sum + a.pendingInflows, 0);
    const totalPendingOut = accounts.reduce((sum, a) => sum + a.pendingOutflows, 0);

    return {
      companyId: c.id,
      companyName: c.name,
      kind: c.kind,
      accountsCount: accounts.length,
      totalBalance,
      totalBalanceFormatted: formatBRL(totalBalance),
      totalPendingInflows: totalPendingIn,
      totalPendingInflowsFormatted: formatBRL(totalPendingIn),
      totalPendingOutflows: totalPendingOut,
      totalPendingOutflowsFormatted: formatBRL(totalPendingOut),
      accounts,
    };
  });

  const grandTotalBalance = accountReports.reduce((sum, a) => sum + a.currentBalance, 0);

  return {
    grandTotalBalance,
    grandTotalBalanceFormatted: formatBRL(grandTotalBalance),
    companies: companyReports,
  };
}

/**
 * Conciliação bancária respeitando escopo da API Key
 */
export async function reconcileStatement(options: ReconcileOptions, scope?: ResolvedScope) {
  const { accountQuery, statementItems, dateToleranceDays = 3, autoApplyExactMatches = false } = options;

  const resolved = await resolveAccountAndCompany(
    {
      accountQuery,
      requireBankAccount: true,
    },
    scope
  );

  const accountId = resolved.bankAccount!.id;
  const companyId = resolved.company.id;

  const { data: pendingTxs, error } = await supabase
    .from("transactions")
    .select("id, description, amount, due_date, type, bank_account_id, company_id")
    .eq("company_id", companyId)
    .eq("status", "pendente");

  if (error) throw new Error(`Erro ao buscar transações pendentes: ${error.message}`);

  const availablePending = [...(pendingTxs || [])];
  const matchedStatementItems: any[] = [];
  const unmatchedStatementItems: any[] = [];
  const autoAppliedList: any[] = [];

  for (const item of statementItems) {
    const itemAmount = Math.abs(Number(item.amount));
    const itemDate = new Date(item.date).getTime();

    let bestMatchIndex = -1;
    let minDaysDiff = Infinity;

    for (let i = 0; i < availablePending.length; i++) {
      const p = availablePending[i];
      if (p.type !== item.type) continue;

      const diffAmount = Math.abs(Number(p.amount) - itemAmount);
      if (diffAmount < 0.05) {
        const pDate = new Date(p.due_date).getTime();
        const daysDiff = Math.abs(itemDate - pDate) / (1000 * 60 * 60 * 24);

        if (daysDiff <= dateToleranceDays && daysDiff < minDaysDiff) {
          minDaysDiff = daysDiff;
          bestMatchIndex = i;
        }
      }
    }

    if (bestMatchIndex >= 0) {
      const matchedTx = availablePending.splice(bestMatchIndex, 1)[0];
      const matchResult = {
        statementItem: item,
        matchedTransaction: {
          id: matchedTx.id,
          description: matchedTx.description,
          amount: matchedTx.amount,
          amountFormatted: formatBRL(matchedTx.amount),
          dueDate: matchedTx.due_date,
          daysDifference: Math.round(minDaysDiff),
        },
        confidence: minDaysDiff <= 1 ? "EXACT" : "HIGH",
      };

      if (autoApplyExactMatches && minDaysDiff <= 1) {
        try {
          await markTransactionAsPaid(
            {
              transactionId: matchedTx.id,
              paidDate: item.date,
              accountQuery: accountId,
              notes: `Baixa automática via conciliação bancária: extrato "${item.description || "N/A"}"`,
            },
            scope
          );
          autoAppliedList.push(matchedTx.id);
        } catch (err: any) {
          console.error(`Falha na auto-baixa da transação ${matchedTx.id}:`, err.message);
        }
      }

      matchedStatementItems.push(matchResult);
    } else {
      unmatchedStatementItems.push(item);
    }
  }

  return {
    account: {
      id: resolved.bankAccount!.id,
      name: resolved.bankAccount!.name,
      bank: resolved.bankAccount!.bank,
      company: resolved.company.name,
    },
    totalStatementItems: statementItems.length,
    matchedCount: matchedStatementItems.length,
    unmatchedCount: unmatchedStatementItems.length,
    autoAppliedCount: autoAppliedList.length,
    matched: matchedStatementItems,
    unmatchedInStatement: unmatchedStatementItems,
    unmatchedInSystemRemaining: availablePending.map((p) => ({
      id: p.id,
      description: p.description,
      amount: p.amount,
      amountFormatted: formatBRL(p.amount),
      dueDate: p.due_date,
      type: p.type,
    })),
  };
}

export async function getPendingWithoutReceipt(companyQuery?: string, scope?: ResolvedScope) {
  let q = supabase
    .from("transactions")
    .select("id, company_id, bank_account_id, description, amount, paid_date, notes, type")
    .eq("status", "pago")
    .is("receipt_url", null)
    .order("paid_date", { ascending: false });

  if (scope && !scope.isMaster) {
    if (scope.allowedCompanyIds) q = q.in("company_id", Array.from(scope.allowedCompanyIds));
  }

  if (companyQuery) {
    const resolved = await resolveAccountAndCompany({ companyQuery }, scope);
    q = q.eq("company_id", resolved.company.id);
  }

  const { data, error } = await q;
  if (error) throw new Error(`Erro ao listar transações sem comprovante: ${error.message}`);

  const withoutReceipt = (data || []).filter((t) => {
    if (!t.notes) return true;
    return !t.notes.includes("[Comprovante]:");
  });

  const { bankAccounts, companies } = await getCompaniesAndAccounts(scope);
  const compMap = new Map(companies.map((c) => [c.id, c.name]));
  const accMap = new Map(bankAccounts.map((a) => [a.id, `${a.name} (${a.bank})`]));

  return {
    total: withoutReceipt.length,
    transactions: withoutReceipt.map((t) => ({
      id: t.id,
      description: t.description,
      amount: t.amount,
      amountFormatted: formatBRL(t.amount),
      paidDate: t.paid_date,
      companyName: compMap.get(t.company_id) || "N/A",
      accountName: t.bank_account_id ? accMap.get(t.bank_account_id) || "N/A" : "N/A",
    })),
  };
}

export async function getOverdueTransactions(companyQuery?: string, scope?: ResolvedScope) {
  const today = todayISO();
  let q = supabase
    .from("transactions")
    .select("id, company_id, bank_account_id, description, amount, due_date, type")
    .eq("status", "pendente")
    .lt("due_date", today)
    .order("due_date", { ascending: true });

  if (scope && !scope.isMaster) {
    if (scope.allowedCompanyIds) q = q.in("company_id", Array.from(scope.allowedCompanyIds));
  }

  if (companyQuery) {
    const resolved = await resolveAccountAndCompany({ companyQuery }, scope);
    q = q.eq("company_id", resolved.company.id);
  }

  const { data, error } = await q;
  if (error) throw new Error(`Erro ao listar transações atrasadas: ${error.message}`);

  const { bankAccounts, companies } = await getCompaniesAndAccounts(scope);
  const compMap = new Map(companies.map((c) => [c.id, c.name]));
  const accMap = new Map(bankAccounts.map((a) => [a.id, `${a.name} (${a.bank})`]));

  const enriched = (data || []).map((t) => {
    const diffTime = new Date(today).getTime() - new Date(t.due_date).getTime();
    const daysOverdue = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));

    return {
      id: t.id,
      description: t.description,
      amount: t.amount,
      amountFormatted: formatBRL(t.amount),
      dueDate: t.due_date,
      daysOverdue,
      type: t.type,
      companyName: compMap.get(t.company_id) || "N/A",
      accountName: t.bank_account_id ? accMap.get(t.bank_account_id) || "N/A" : "Não vinculada",
    };
  });

  const totalAmount = enriched.reduce((sum, t) => sum + Number(t.amount), 0);

  return {
    totalCount: enriched.length,
    totalAmount,
    totalAmountFormatted: formatBRL(totalAmount),
    transactions: enriched,
  };
}
