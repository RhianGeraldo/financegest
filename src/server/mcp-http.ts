import {
  validateApiKey,
  createApiKey,
  listApiKeys,
  revokeApiKey,
  getUserAvailableScope,
  type ResolvedScope,
} from "../../mcp-server/src/services/auth.service.js";
import {
  createTransaction,
  markTransactionAsPaid,
  rollbackPayment,
  updateTransaction,
  deleteTransaction,
  listTransactions,
} from "../../mcp-server/src/services/transactions.service.js";
import {
  getAccountsBalanceReport,
  reconcileStatement,
  getPendingWithoutReceipt,
  getOverdueTransactions,
} from "../../mcp-server/src/services/reconciliation.service.js";
import {
  getFinancialSummary,
  getCategoriesAndCostCenters,
} from "../../mcp-server/src/services/reports.service.js";
import { uploadTransactionAttachment } from "../../mcp-server/src/services/storage.service.js";
import { getCompaniesAndAccounts, resolveAccountAndCompany } from "../../mcp-server/src/utils/account-matcher.js";
import { formatBRL } from "../../mcp-server/src/utils/formatters.js";

// Definição das ferramentas expostas pelo MCP
const TOOLS_DEFINITIONS = [
  {
    name: "listar_empresas",
    description: "Lista todas as empresas, clínicas e pessoas físicas cadastradas no sistema com suas contas bancárias associadas (filtradas pelo escopo da API Key).",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "listar_contas_bancarias",
    description: "Lista as contas bancárias ativas no sistema com o saldo atual calculado de cada conta.",
    inputSchema: {
      type: "object",
      properties: {
        empresa: { type: "string", description: "Nome ou ID da empresa para filtrar (opcional)" },
      },
    },
  },
  {
    name: "resolver_conta_e_empresa",
    description: "Testa e valida como uma conta bancária ou empresa é resolvida a partir de um termo de busca antes de efetuar lançamentos.",
    inputSchema: {
      type: "object",
      properties: {
        conta: { type: "string", description: "Termo de busca para a conta bancária" },
        empresa: { type: "string", description: "Termo de busca para a empresa" },
      },
    },
  },
  {
    name: "lancar_transacao",
    description: "Lança uma nova receita ou despesa no sistema garantindo a conta bancária e empresa corretas. Suporta anexar boleto e parcelamento automático.",
    inputSchema: {
      type: "object",
      properties: {
        tipo: { type: "string", enum: ["entrada", "saida"], description: "Tipo da transação: 'entrada' ou 'saida'" },
        descricao: { type: "string", description: "Descrição clara da transação" },
        valor: { type: "number", description: "Valor monetário em reais (positivo)" },
        data_vencimento: { type: "string", description: "Data de vencimento (AAAA-MM-DD)" },
        conta_bancaria: { type: "string", description: "Nome, banco ou ID da conta bancária" },
        empresa: { type: "string", description: "Nome ou ID da clínica ou empresa" },
        categoria: { type: "string", description: "Nome ou ID da categoria" },
        centro_custo: { type: "string", description: "Nome ou ID do centro de custo" },
        status: { type: "string", enum: ["pendente", "pago"], default: "pendente" },
        data_pagamento: { type: "string", description: "Data de pagamento se 'pago' (AAAA-MM-DD)" },
        observacoes: { type: "string", description: "Notas adicionais" },
        boleto_arquivo: { type: "string", description: "Caminho, Base64 ou URL do boleto" },
        comprovante_arquivo: { type: "string", description: "Caminho, Base64 ou URL do comprovante" },
        parcelas: { type: "number", default: 1, description: "Número de parcelas" },
        tipo_valor_parcela: { type: "string", enum: ["total", "parcela"], default: "total" },
      },
      required: ["tipo", "descricao", "valor", "data_vencimento"],
    },
  },
  {
    name: "marcar_como_pago",
    description: "Dá baixa (liquidação) em uma transação financeira, marcando-a como paga, com data, conta bancária e comprovante.",
    inputSchema: {
      type: "object",
      properties: {
        transacao_id: { type: "string", description: "ID da transação (UUID)" },
        data_pagamento: { type: "string", description: "Data de pagamento (AAAA-MM-DD)" },
        conta_bancaria: { type: "string", description: "Conta bancária debitada/creditada" },
        comprovante_arquivo: { type: "string", description: "Caminho, Base64 ou URL do comprovante" },
        observacoes: { type: "string", description: "Observações" },
      },
      required: ["transacao_id"],
    },
  },
  {
    name: "estornar_pagamento",
    description: "Reverte o pagamento de uma transação para pendente.",
    inputSchema: {
      type: "object",
      properties: {
        transacao_id: { type: "string", description: "ID da transação" },
      },
      required: ["transacao_id"],
    },
  },
  {
    name: "editar_transacao",
    description: "Atualiza os dados de uma transação existente.",
    inputSchema: {
      type: "object",
      properties: {
        transacao_id: { type: "string", description: "ID da transação" },
        descricao: { type: "string" },
        valor: { type: "number" },
        data_vencimento: { type: "string" },
        conta_bancaria: { type: "string" },
        categoria: { type: "string" },
        centro_custo: { type: "string" },
        observacoes: { type: "string" },
      },
      required: ["transacao_id"],
    },
  },
  {
    name: "excluir_transacao",
    description: "Exclui uma transação financeira permanentemente.",
    inputSchema: {
      type: "object",
      properties: {
        transacao_id: { type: "string", description: "ID da transação" },
      },
      required: ["transacao_id"],
    },
  },
  {
    name: "anexar_documento",
    description: "Faz o upload e anexa um boleto ou comprovante a uma transação existente.",
    inputSchema: {
      type: "object",
      properties: {
        transacao_id: { type: "string" },
        tipo_documento: { type: "string", enum: ["boleto", "comprovante"] },
        arquivo: { type: "string", description: "Caminho no disco, Base64 ou URL HTTP" },
        nome_arquivo: { type: "string" },
      },
      required: ["transacao_id", "tipo_documento", "arquivo"],
    },
  },
  {
    name: "relatorio_saldos_contas",
    description: "Relatório detalhado do saldo de cada conta autorizada e consolidado por empresa.",
    inputSchema: {
      type: "object",
      properties: {
        empresa: { type: "string" },
      },
    },
  },
  {
    name: "conciliar_extrato",
    description: "Cruza linhas de extrato com transações pendentes no sistema das contas autorizadas.",
    inputSchema: {
      type: "object",
      properties: {
        conta_bancaria: { type: "string" },
        itens_extrato: {
          type: "array",
          items: {
            type: "object",
            properties: {
              date: { type: "string" },
              amount: { type: "number" },
              type: { type: "string", enum: ["entrada", "saida"] },
              description: { type: "string" },
            },
            required: ["date", "amount", "type"],
          },
        },
        tolerancia_dias: { type: "number", default: 3 },
        auto_aplicar_baixa: { type: "boolean", default: false },
      },
      required: ["conta_bancaria", "itens_extrato"],
    },
  },
  {
    name: "listar_transacoes_sem_comprovante",
    description: "Auditoria de contas pagas sem comprovante anexado nas empresas autorizadas.",
    inputSchema: {
      type: "object",
      properties: {
        empresa: { type: "string" },
      },
    },
  },
  {
    name: "listar_contas_atrasadas",
    description: "Lista transações pendentes que já venceram nas contas autorizadas.",
    inputSchema: {
      type: "object",
      properties: {
        empresa: { type: "string" },
      },
    },
  },
  {
    name: "consultar_transacoes",
    description: "Filtra e lista transações financeiras das contas autorizadas para sua chave.",
    inputSchema: {
      type: "object",
      properties: {
        empresa: { type: "string" },
        conta_bancaria: { type: "string" },
        tipo: { type: "string", enum: ["entrada", "saida", "all"], default: "all" },
        status: { type: "string", enum: ["pendente", "pago", "all"], default: "all" },
        vencimento_de: { type: "string" },
        vencimento_ate: { type: "string" },
        pagamento_de: { type: "string" },
        pagamento_ate: { type: "string" },
        busca: { type: "string" },
        limite: { type: "number", default: 50 },
      },
    },
  },
  {
    name: "resumo_financeiro",
    description: "DRE / Resumo executivo financeiro das empresas autorizadas.",
    inputSchema: {
      type: "object",
      properties: {
        empresa: { type: "string" },
        data_inicio: { type: "string" },
        data_fim: { type: "string" },
      },
    },
  },
  {
    name: "listar_categorias_e_centros",
    description: "Lista categorias e centros de custo ativos para apoiar a classificação.",
    inputSchema: {
      type: "object",
      properties: {
        empresa: { type: "string" },
      },
    },
  },
];

// Helper para executar uma ferramenta
async function executeTool(name: string, args: any, scope: ResolvedScope) {
  switch (name) {
    case "listar_empresas": {
      const { companies, bankAccounts } = await getCompaniesAndAccounts(scope);
      return companies.map((c) => ({
        id: c.id,
        name: c.name,
        kind: c.kind,
        active: c.active,
        accounts: bankAccounts
          .filter((a) => a.company_id === c.id)
          .map((a) => ({
            id: a.id,
            name: a.name,
            bank: a.bank,
            initialBalanceFormatted: formatBRL(a.initial_balance),
          })),
      }));
    }

    case "listar_contas_bancarias":
      return await getAccountsBalanceReport(args?.empresa, scope);

    case "resolver_conta_e_empresa": {
      const resolved = await resolveAccountAndCompany(
        {
          accountQuery: args?.conta,
          companyQuery: args?.empresa,
          requireBankAccount: false,
        },
        scope
      );
      return {
        company: resolved.company,
        bankAccount: resolved.bankAccount || "Nenhuma conta específica informada",
      };
    }

    case "lancar_transacao":
      return await createTransaction(
        {
          type: args.tipo,
          description: args.descricao,
          amount: args.valor,
          dueDate: args.data_vencimento,
          accountQuery: args.conta_bancaria,
          companyQuery: args.empresa,
          categoryQuery: args.categoria,
          costCenterQuery: args.centro_custo,
          status: args.status,
          paidDate: args.data_pagamento,
          notes: args.observacoes,
          invoiceFile: args.boleto_arquivo,
          receiptFile: args.comprovante_arquivo,
          installments: args.parcelas,
          installmentAmountType: args.tipo_valor_parcela,
        },
        scope
      );

    case "marcar_como_pago":
      return await markTransactionAsPaid(
        {
          transactionId: args.transacao_id,
          paidDate: args.data_pagamento,
          accountQuery: args.conta_bancaria,
          receiptFile: args.comprovante_arquivo,
          notes: args.observacoes,
        },
        scope
      );

    case "estornar_pagamento":
      return await rollbackPayment(args.transacao_id, scope);

    case "editar_transacao":
      return await updateTransaction(
        args.transacao_id,
        {
          description: args.descricao,
          amount: args.valor,
          dueDate: args.data_vencimento,
          accountQuery: args.conta_bancaria,
          categoryQuery: args.categoria,
          costCenterQuery: args.centro_custo,
          notes: args.observacoes,
        },
        scope
      );

    case "excluir_transacao":
      return await deleteTransaction(args.transacao_id, scope);

    case "anexar_documento": {
      const prefix = args.tipo_documento === "boleto" ? "invoice" : "receipt";
      const uploadedUrl = await uploadTransactionAttachment({
        txId: args.transacao_id,
        type: prefix,
        fileInput: args.arquivo,
        fileName: args.nome_arquivo,
      });

      const updates =
        args.tipo_documento === "boleto" ? { invoice_url: uploadedUrl } : { receipt_url: uploadedUrl };

      await updateTransaction(args.transacao_id, updates as any, scope);

      return {
        success: true,
        transactionId: args.transacao_id,
        documentType: args.tipo_documento,
        url: uploadedUrl,
      };
    }

    case "relatorio_saldos_contas":
      return await getAccountsBalanceReport(args?.empresa, scope);

    case "conciliar_extrato":
      return await reconcileStatement(
        {
          accountQuery: args.conta_bancaria,
          statementItems: args.itens_extrato,
          dateToleranceDays: args.tolerancia_dias,
          autoApplyExactMatches: args.auto_aplicar_baixa,
        },
        scope
      );

    case "listar_transacoes_sem_comprovante":
      return await getPendingWithoutReceipt(args?.empresa, scope);

    case "listar_contas_atrasadas":
      return await getOverdueTransactions(args?.empresa, scope);

    case "consultar_transacoes":
      return await listTransactions(
        {
          companyQuery: args?.empresa,
          accountQuery: args?.conta_bancaria,
          type: args?.tipo,
          status: args?.status,
          dueDateFrom: args?.vencimento_de,
          dueDateTo: args?.vencimento_ate,
          paidDateFrom: args?.pagamento_de,
          paidDateTo: args?.pagamento_ate,
          search: args?.busca,
          limit: args?.limite,
        },
        scope
      );

    case "resumo_financeiro":
      return await getFinancialSummary(
        {
          companyQuery: args?.empresa,
          dateFrom: args?.data_inicio,
          dateTo: args?.data_fim,
        },
        scope
      );

    case "listar_categorias_e_centros":
      return await getCategoriesAndCostCenters(args?.empresa, scope);

    default:
      throw new Error(`Ferramenta desconhecida: "${name}"`);
  }
}

// Handler HTTP principal para o endpoint /api/mcp
export async function handleMcpHttpRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);

  // CORS headers
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // 1. Extração da API Key
  const authHeader = request.headers.get("authorization") || "";
  let token = "";
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    token = authHeader.slice(7).trim();
  }
  if (!token) {
    token = request.headers.get("x-api-key") || "";
  }
  if (!token) {
    token = url.searchParams.get("api_key") || url.searchParams.get("apiKey") || "";
  }

  // 2. Validação da Chave e Escopo
  let scope: ResolvedScope;
  try {
    scope = await validateApiKey(token);
  } catch (authErr: any) {
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32000, message: authErr.message || "Acesso não autorizado." },
      }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // 3. GET: Handshake / Info / SSE
  if (request.method === "GET") {
    const accept = request.headers.get("accept") || "";

    // Se o cliente pedir text/event-stream (SSE)
    if (accept.includes("text/event-stream")) {
      const sessionId = crypto.randomUUID();
      const messageEndpoint = `${url.origin}/api/mcp?sessionId=${sessionId}`;

      const stream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          // Envia o evento de endpoint inicial do SSE
          controller.enqueue(encoder.encode(`event: endpoint\ndata: ${messageEndpoint}\n\n`));
        },
      });

      return new Response(stream, {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    // Se for requisição GET comum (Health check / Documentação)
    return new Response(
      JSON.stringify(
        {
          status: "online",
          server: "FinanceGest MCP Server",
          version: "1.0.0",
          protocolVersion: "2024-11-05",
          serverUrl: `${url.origin}/api/mcp`,
          authenticatedUser: scope.user ? scope.user.name : "Master Admin",
          availableToolsCount: TOOLS_DEFINITIONS.length,
          tools: TOOLS_DEFINITIONS.map((t) => ({ name: t.name, description: t.description })),
        },
        null,
        2
      ),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  // 4. POST: Mensagens JSON-RPC (initialize, tools/list, tools/call)
  if (request.method === "POST") {
    let body: any;
    try {
      body = await request.json();
    } catch {
      return new Response(
        JSON.stringify({ jsonrpc: "2.0", error: { code: -32700, message: "JSON inválido" } }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { id, method, params } = body;

    // Resposta padrão JSON-RPC
    const jsonRpcResponse = (result: any) =>
      new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    const jsonRpcError = (code: number, message: string) =>
      new Response(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    switch (method) {
      case "initialize":
        return jsonRpcResponse({
          protocolVersion: "2024-11-05",
          capabilities: { tools: { listChanged: true } },
          serverInfo: { name: "financegest", version: "1.0.0" },
        });

      case "notifications/initialized":
        return new Response(null, { status: 204, headers: corsHeaders });

      case "tools/list":
        return jsonRpcResponse({
          tools: TOOLS_DEFINITIONS,
        });

      case "tools/call": {
        try {
          const toolName = params?.name;
          const toolArgs = params?.arguments || {};
          const toolResult = await executeTool(toolName, toolArgs, scope);

          return jsonRpcResponse({
            content: [
              {
                type: "text",
                text: typeof toolResult === "string" ? toolResult : JSON.stringify(toolResult, null, 2),
              },
            ],
          });
        } catch (err: any) {
          return jsonRpcResponse({
            isError: true,
            content: [
              {
                type: "text",
                text: `ERRO: ${err.message || String(err)}`,
              },
            ],
          });
        }
      }

      default:
        return jsonRpcError(-32601, `Método não suportado: "${method}"`);
    }
  }

  return new Response("Método não suportado", { status: 405, headers: corsHeaders });
}
