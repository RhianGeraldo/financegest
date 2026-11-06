import { supabase } from "../config.js";
import { resolveAccountAndCompany } from "../utils/account-matcher.js";
import {
  todayISO,
  parseFlexibleDate,
  addMonths,
  composeNotesWithAttachments,
  normalizeText,
  formatBRL,
  getInvoiceUrl,
  getReceiptUrl,
} from "../utils/formatters.js";
import { uploadTransactionAttachment } from "./storage.service.js";
import type { ResolvedScope } from "./auth.service.js";
import crypto from "node:crypto";

export interface CreateTransactionParams {
  type: "entrada" | "saida";
  description: string;
  amount: number;
  dueDate: string; // YYYY-MM-DD
  accountQuery?: string;
  companyQuery?: string;
  categoryQuery?: string;
  costCenterQuery?: string;
  status?: "pendente" | "pago";
  paidDate?: string;
  notes?: string;
  invoiceFile?: string;
  receiptFile?: string;
  installments?: number;
  installmentAmountType?: "total" | "parcela";
  createdBy?: string;
}

export interface MarkAsPaidParams {
  transactionId: string;
  paidDate?: string;
  accountQuery?: string;
  receiptFile?: string;
  notes?: string;
  paidBy?: string;
}

export interface ListTransactionsFilter {
  companyQuery?: string;
  accountQuery?: string;
  type?: "entrada" | "saida" | "all";
  status?: "pendente" | "pago" | "all";
  dueDateFrom?: string;
  dueDateTo?: string;
  paidDateFrom?: string;
  paidDateTo?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export async function resolveCategory(query?: string, companyId?: string): Promise<string | null> {
  if (!query) return null;
  const { data: categories, error } = await supabase.from("categories").select("id, name, company_ids");
  if (error || !categories) return null;

  const byId = categories.find((c) => c.id === query);
  if (byId) return byId.id;

  const q = normalizeText(query);
  const matches = categories.filter((c) => {
    const nameMatch = normalizeText(c.name).includes(q);
    const companyMatch = companyId && Array.isArray(c.company_ids) ? c.company_ids.includes(companyId) : true;
    return nameMatch && companyMatch;
  });

  if (matches.length > 0) return matches[0].id;
  const anyMatch = categories.find((c) => normalizeText(c.name).includes(q));
  return anyMatch ? anyMatch.id : null;
}

export async function resolveCostCenter(query?: string, companyId?: string): Promise<string | null> {
  if (!query) return null;
  const { data: centers, error } = await supabase.from("cost_centers").select("id, name, company_ids");
  if (error || !centers) return null;

  const byId = centers.find((c) => c.id === query);
  if (byId) return byId.id;

  const q = normalizeText(query);
  const matches = centers.filter((c) => {
    const nameMatch = normalizeText(c.name).includes(q);
    const companyMatch = companyId && Array.isArray(c.company_ids) ? c.company_ids.includes(companyId) : true;
    return nameMatch && companyMatch;
  });

  if (matches.length > 0) return matches[0].id;
  const anyMatch = centers.find((c) => normalizeText(c.name).includes(q));
  return anyMatch ? anyMatch.id : null;
}

/**
 * Lança uma nova transação financeira garantindo conta e empresa corretas e respeitando o escopo da API Key
 */
export async function createTransaction(params: CreateTransactionParams, scope?: ResolvedScope) {
  const {
    type,
    description,
    amount,
    dueDate,
    accountQuery,
    companyQuery,
    categoryQuery,
    costCenterQuery,
    status = "pendente",
    paidDate,
    notes,
    invoiceFile,
    receiptFile,
    installments = 1,
    installmentAmountType = "total",
    createdBy,
  } = params;

  if (amount <= 0) {
    throw new Error("O valor da transação deve ser positivo e maior que zero.");
  }

  // 1. Normalizar tipo ("despesa" -> "saida", "receita" -> "entrada")
  let effectiveType: "entrada" | "saida" = "saida";
  const rawType = (type || "").toLowerCase().trim();
  if (rawType === "entrada" || rawType === "receita" || rawType === "income") {
    effectiveType = "entrada";
  } else {
    effectiveType = "saida";
  }

  // 2. Normalizar data de vencimento (aceita "hoje", "ontem", DD/MM/YYYY, etc)
  const normalizedDueDate = parseFlexibleDate(dueDate);

  // 3. Resolver rigorosamente Empresa e Conta Bancária dentro do escopo da API Key
  const resolved = await resolveAccountAndCompany(
    {
      accountQuery,
      companyQuery,
      requireBankAccount: false,
    },
    scope
  );

  const companyId = resolved.company.id;
  const bankAccountId = resolved.bankAccount?.id || null;
  const effectiveDesc = description && description.trim() ? description.trim() : `Despesa - ${resolved.company.name}`;

  // 4. Resolver Categoria e Centro de Custo
  const categoryId = await resolveCategory(categoryQuery, companyId);
  const costCenterId = await resolveCostCenter(costCenterQuery, companyId);

  // 5. Identifica autor da operação (usuário da API Key se fornecido)
  const effectiveUserId = scope && !scope.isMaster && scope.user ? scope.user.id : createdBy || null;

  // 6. Tratar parcelamento se houver
  const numInstallments = Math.max(1, Math.floor(installments));
  const baseAmount =
    numInstallments > 1 && installmentAmountType === "total"
      ? Number((amount / numInstallments).toFixed(2))
      : amount;

  const createdTransactions: any[] = [];

  for (let i = 0; i < numInstallments; i++) {
    const currentTxId = crypto.randomUUID();
    const currentDueDate = i === 0 ? normalizedDueDate : addMonths(normalizedDueDate, i);
    const currentDesc =
      numInstallments > 1 ? `${effectiveDesc} (${i + 1}/${numInstallments})` : effectiveDesc;

    let invoiceUrl: string | null = null;
    let receiptUrl: string | null = null;

    if (invoiceFile && i === 0) {
      try {
        invoiceUrl = await uploadTransactionAttachment({
          txId: currentTxId,
          type: "invoice",
          fileInput: invoiceFile,
        });
      } catch (e: any) {
        console.warn("Aviso ao enviar boleto:", e.message);
      }
    }

    if (receiptFile && i === 0 && status === "pago") {
      try {
        receiptUrl = await uploadTransactionAttachment({
          txId: currentTxId,
          type: "receipt",
          fileInput: receiptFile,
        });
      } catch (e: any) {
        console.warn("Aviso ao enviar comprovante:", e.message);
      }
    }

    const composedNotes = composeNotesWithAttachments(notes, {
      invoice: invoiceUrl,
      receipt: receiptUrl,
    });

    const isPaid = i === 0 && status === "pago";
    const finalPaidDate = isPaid
      ? paidDate
        ? paidDate.includes("T")
          ? paidDate
          : `${paidDate}T${new Date().toISOString().slice(11, 19)}`
        : new Date().toISOString()
      : null;

    const payload: any = {
      id: currentTxId,
      company_id: companyId,
      bank_account_id: bankAccountId,
      category_id: categoryId,
      cost_center_id: costCenterId,
      type: effectiveType,
      description: currentDesc,
      amount: baseAmount,
      due_date: currentDueDate,
      paid_date: finalPaidDate,
      status: isPaid ? "pago" : "pendente",
      notes: composedNotes,
      invoice_url: invoiceUrl,
      receipt_url: receiptUrl,
      created_by: effectiveUserId,
      paid_by: isPaid ? effectiveUserId : null,
    };

    const { data, error } = await supabase.from("transactions").insert(payload).select().single();

    if (error) {
      if (error.message.includes("invoice_url") || error.message.includes("receipt_url")) {
        delete payload.invoice_url;
        delete payload.receipt_url;
        const retry = await supabase.from("transactions").insert(payload).select().single();
        if (retry.error) throw new Error(`Erro ao criar transação: ${retry.error.message}`);
        createdTransactions.push(retry.data);
      } else {
        throw new Error(`Erro ao criar transação: ${error.message}`);
      }
    } else {
      createdTransactions.push(data);
    }
  }

  return {
    success: true,
    totalCreated: createdTransactions.length,
    company: { id: resolved.company.id, name: resolved.company.name },
    bankAccount: resolved.bankAccount
      ? { id: resolved.bankAccount.id, name: resolved.bankAccount.name, bank: resolved.bankAccount.bank }
      : null,
    executedBy: scope?.user ? scope.user.name : "Administrador",
    transactions: createdTransactions,
  };
}

/**
 * Marca uma transação como paga (baixa bancária), validando escopo de permissão
 */
export async function markTransactionAsPaid(params: MarkAsPaidParams, scope?: ResolvedScope) {
  const { transactionId, paidDate, accountQuery, receiptFile, notes, paidBy } = params;

  const { data: currentTx, error: findError } = await supabase
    .from("transactions")
    .select("*")
    .eq("id", transactionId)
    .single();

  if (findError || !currentTx) {
    throw new Error(`Transação não encontrada com ID "${transactionId}".`);
  }

  // Validação de escopo: a transação pertence a uma empresa autorizada?
  if (scope && !scope.isMaster) {
    if (scope.allowedCompanyIds && !scope.allowedCompanyIds.has(currentTx.company_id)) {
      throw new Error("ACESSO NEGADO: Esta transação pertence a uma empresa fora do escopo autorizado da sua API Key.");
    }
  }

  let bankAccountId = currentTx.bank_account_id;

  if (accountQuery) {
    const resolved = await resolveAccountAndCompany(
      {
        accountQuery,
        companyQuery: currentTx.company_id,
        requireBankAccount: true,
      },
      scope
    );
    bankAccountId = resolved.bankAccount!.id;
  } else if (bankAccountId && scope && !scope.isMaster && scope.allowedBankAccountIds) {
    if (!scope.allowedBankAccountIds.has(bankAccountId)) {
      throw new Error("ACESSO NEGADO: A conta bancária desta transação não está autorizada no escopo da sua API Key.");
    }
  }

  let receiptUrl = currentTx.receipt_url;
  if (receiptFile) {
    receiptUrl = await uploadTransactionAttachment({
      txId: transactionId,
      type: "receipt",
      fileInput: receiptFile,
    });
  }

  const finalPaidDate = paidDate
    ? paidDate.includes("T")
      ? paidDate
      : `${paidDate}T${new Date().toISOString().slice(11, 19)}`
    : new Date().toISOString();

  const finalNotes = composeNotesWithAttachments(notes || currentTx.notes, {
    receipt: receiptUrl,
  });

  const effectiveUserId = scope && !scope.isMaster && scope.user ? scope.user.id : paidBy || currentTx.paid_by || null;

  const payload: any = {
    status: "pago",
    paid_date: finalPaidDate,
    bank_account_id: bankAccountId,
    paid_by: effectiveUserId,
    notes: finalNotes,
    receipt_url: receiptUrl,
  };

  let { data, error } = await supabase
    .from("transactions")
    .update(payload)
    .eq("id", transactionId)
    .select()
    .single();

  if (error && (error.message.includes("receipt_url") || error.message.includes("schema cache"))) {
    delete payload.receipt_url;
    const retry = await supabase
      .from("transactions")
      .update(payload)
      .eq("id", transactionId)
      .select()
      .single();
    if (retry.error) throw new Error(`Erro ao dar baixa: ${retry.error.message}`);
    data = retry.data;
  } else if (error) {
    throw new Error(`Erro ao dar baixa na transação: ${error.message}`);
  }

  return {
    success: true,
    transaction: data,
    receiptUrl,
    executedBy: scope?.user ? scope.user.name : "Administrador",
  };
}

export async function rollbackPayment(transactionId: string, scope?: ResolvedScope) {
  const { data: currentTx } = await supabase.from("transactions").select("company_id").eq("id", transactionId).single();
  if (currentTx && scope && !scope.isMaster && scope.allowedCompanyIds && !scope.allowedCompanyIds.has(currentTx.company_id)) {
    throw new Error("ACESSO NEGADO: Operação não autorizada para esta empresa.");
  }

  const { data, error } = await supabase
    .from("transactions")
    .update({
      status: "pendente",
      paid_date: null,
      paid_by: null,
    })
    .eq("id", transactionId)
    .select()
    .single();

  if (error) throw new Error(`Erro ao estornar transação: ${error.message}`);
  return { success: true, transaction: data };
}

export async function updateTransaction(
  transactionId: string,
  updates: {
    description?: string;
    amount?: number;
    dueDate?: string;
    accountQuery?: string;
    categoryQuery?: string;
    costCenterQuery?: string;
    notes?: string;
  },
  scope?: ResolvedScope
) {
  const { data: currentTx, error: findError } = await supabase
    .from("transactions")
    .select("*")
    .eq("id", transactionId)
    .single();

  if (findError || !currentTx) throw new Error(`Transação "${transactionId}" não encontrada.`);

  if (scope && !scope.isMaster && scope.allowedCompanyIds && !scope.allowedCompanyIds.has(currentTx.company_id)) {
    throw new Error("ACESSO NEGADO: Operação não autorizada para esta empresa.");
  }

  const payload: any = {};
  if (updates.description !== undefined) payload.description = updates.description;
  if (updates.amount !== undefined) {
    if (updates.amount <= 0) throw new Error("Valor deve ser maior que zero.");
    payload.amount = updates.amount;
  }
  if (updates.dueDate !== undefined) payload.due_date = updates.dueDate;

  if (updates.accountQuery) {
    const resolved = await resolveAccountAndCompany(
      {
        accountQuery: updates.accountQuery,
        companyQuery: currentTx.company_id,
        requireBankAccount: true,
      },
      scope
    );
    payload.bank_account_id = resolved.bankAccount!.id;
  }

  if (updates.categoryQuery) {
    payload.category_id = await resolveCategory(updates.categoryQuery, currentTx.company_id);
  }

  if (updates.costCenterQuery) {
    payload.cost_center_id = await resolveCostCenter(updates.costCenterQuery, currentTx.company_id);
  }

  if (updates.notes !== undefined) {
    payload.notes = composeNotesWithAttachments(updates.notes, {
      invoice: currentTx.invoice_url,
      receipt: currentTx.receipt_url,
    });
  }

  const { data, error } = await supabase
    .from("transactions")
    .update(payload)
    .eq("id", transactionId)
    .select()
    .single();

  if (error) throw new Error(`Erro ao atualizar transação: ${error.message}`);
  return { success: true, transaction: data };
}

export async function deleteTransaction(transactionId: string, scope?: ResolvedScope) {
  const { data: currentTx } = await supabase.from("transactions").select("company_id").eq("id", transactionId).single();
  if (currentTx && scope && !scope.isMaster && scope.allowedCompanyIds && !scope.allowedCompanyIds.has(currentTx.company_id)) {
    throw new Error("ACESSO NEGADO: Operação de exclusão não autorizada para esta empresa.");
  }

  const { error } = await supabase.from("transactions").delete().eq("id", transactionId);
  if (error) throw new Error(`Erro ao excluir transação: ${error.message}`);
  return { success: true, message: `Transação "${transactionId}" excluída com sucesso.` };
}

export async function listTransactions(filter: ListTransactionsFilter = {}, scope?: ResolvedScope) {
  const buildQuery = (columns: string) => {
    let q = supabase
      .from("transactions")
      .select(columns)
      .order("due_date", { ascending: false });

    if (scope && !scope.isMaster) {
      if (scope.allowedCompanyIds) {
        q = q.in("company_id", Array.from(scope.allowedCompanyIds));
      }
    }

    if (filter.companyQuery) {
      q = q.eq("company_id", filter.companyQuery);
    }

    if (filter.accountQuery) {
      q = q.eq("bank_account_id", filter.accountQuery);
    }

    if (filter.type && filter.type !== "all") {
      let normType = filter.type;
      if (normType === "despesa" as any) normType = "saida";
      if (normType === "receita" as any) normType = "entrada";
      q = q.eq("type", normType);
    }

    if (filter.status && filter.status !== "all") {
      let normStatus = filter.status;
      if (normStatus === "aberto" as any) normStatus = "pendente";
      q = q.eq("status", normStatus);
    }

    if (filter.dueDateFrom) {
      q = q.gte("due_date", parseFlexibleDate(filter.dueDateFrom));
    }

    if (filter.dueDateTo) {
      q = q.lte("due_date", parseFlexibleDate(filter.dueDateTo));
    }

    if (filter.paidDateFrom) {
      q = q.gte("paid_date", parseFlexibleDate(filter.paidDateFrom));
    }

    if (filter.paidDateTo) {
      q = q.lte("paid_date", parseFlexibleDate(filter.paidDateTo));
    }

    if (filter.search) {
      q = q.ilike("description", `%${filter.search}%`);
    }

    const limit = filter.limit || 50;
    const offset = filter.offset || 0;
    return q.range(offset, offset + limit - 1);
  };

  if (filter.companyQuery) {
    const resolved = await resolveAccountAndCompany({ companyQuery: filter.companyQuery }, scope);
    filter.companyQuery = resolved.company.id;
  }

  if (filter.accountQuery) {
    const resolved = await resolveAccountAndCompany(
      { accountQuery: filter.accountQuery, requireBankAccount: true },
      scope
    );
    filter.accountQuery = resolved.bankAccount!.id;
  }

  let data: any[] | null = null;

  // Tentativa 1: com invoice_url e receipt_url
  const fullCols = "id, company_id, bank_account_id, category_id, cost_center_id, type, description, amount, due_date, paid_date, status, notes, receipt_url, invoice_url, created_at";
  let res = await buildQuery(fullCols);

  if (res.error && (res.error.message.includes("invoice_url") || res.error.message.includes("receipt_url") || (res.error as any).code === "42703")) {
    // Tentativa 2: fallback sem invoice_url e receipt_url (extrai de notes)
    const fallbackCols = "id, company_id, bank_account_id, category_id, cost_center_id, type, description, amount, due_date, paid_date, status, notes, created_at";
    const fallbackRes = await buildQuery(fallbackCols);
    if (fallbackRes.error) throw new Error(`Erro ao listar transações: ${fallbackRes.error.message}`);
    data = (fallbackRes.data || []).map((t: any) => ({
      ...t,
      invoice_url: getInvoiceUrl(t),
      receipt_url: getReceiptUrl(t),
    }));
  } else if (res.error) {
    throw new Error(`Erro ao listar transações: ${res.error.message}`);
  } else {
    data = (res.data || []).map((t: any) => ({
      ...t,
      invoice_url: t.invoice_url || getInvoiceUrl(t),
      receipt_url: t.receipt_url || getReceiptUrl(t),
    }));
  }

  const [compRes, accRes, catRes] = await Promise.all([
    supabase.from("companies").select("id, name"),
    supabase.from("bank_accounts").select("id, name, bank"),
    supabase.from("categories").select("id, name"),
  ]);

  const compMap = new Map((compRes.data || []).map((c) => [c.id, c.name]));
  const accMap = new Map((accRes.data || []).map((a) => [a.id, `${a.name} (${a.bank})`]));
  const catMap = new Map((catRes.data || []).map((c) => [c.id, c.name]));

  const enriched = (data || []).map((t) => ({
    ...t,
    amount_formatted: formatBRL(t.amount),
    company_name: compMap.get(t.company_id) || "N/A",
    account_name: t.bank_account_id ? accMap.get(t.bank_account_id) || "N/A" : "Não vinculada",
    category_name: t.category_id ? catMap.get(t.category_id) || "Sem categoria" : "Sem categoria",
    has_invoice: !!t.invoice_url,
    has_receipt: !!t.receipt_url,
  }));

  return {
    total: enriched.length,
    transactions: enriched,
  };
}

export async function createBankAccount(
  params: {
    companyQuery: string;
    bank: string;
    name: string;
    initialBalance?: number;
  },
  scope?: ResolvedScope
) {
  const resolved = await resolveAccountAndCompany({ companyQuery: params.companyQuery }, scope);
  const companyId = resolved.company.id;

  const id = crypto.randomUUID();
  const initialBalance = Number(params.initialBalance) || 0;

  const { data, error } = await supabase
    .from("bank_accounts")
    .insert({
      id,
      company_id: companyId,
      bank: params.bank.trim(),
      name: params.name.trim(),
      initial_balance: initialBalance,
      active: true,
    })
    .select()
    .single();

  if (error) throw new Error(`Erro ao cadastrar conta bancária: ${error.message}`);

  return {
    success: true,
    message: `Conta bancária "${params.name}" (${params.bank}) cadastrada com sucesso para ${resolved.company.name}.`,
    account: {
      id: data.id,
      companyId: data.company_id,
      companyName: resolved.company.name,
      bank: data.bank,
      name: data.name,
      initialBalance: data.initial_balance,
      initialBalanceFormatted: formatBRL(data.initial_balance),
    },
  };
}
