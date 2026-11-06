import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getCompaniesAndAccounts, resolveAccountAndCompany } from "./utils/account-matcher.js";
import {
  createTransaction,
  markTransactionAsPaid,
  rollbackPayment,
  updateTransaction,
  deleteTransaction,
  listTransactions,
} from "./services/transactions.service.js";
import { uploadTransactionAttachment } from "./services/storage.service.js";
import {
  getAccountsBalanceReport,
  reconcileStatement,
  getPendingWithoutReceipt,
  getOverdueTransactions,
} from "./services/reconciliation.service.js";
import { getFinancialSummary, getCategoriesAndCostCenters } from "./services/reports.service.js";
import {
  validateApiKey,
  createApiKey,
  listApiKeys,
  revokeApiKey,
  getUserAvailableScope,
} from "./services/auth.service.js";
import { formatBRL } from "./utils/formatters.js";

const server = new McpServer({
  name: "financegest",
  version: "1.0.0",
});

function formatResponse(data: any) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof data === "string" ? data : JSON.stringify(data, null, 2),
      },
    ],
  };
}

function formatError(err: any) {
  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text: `ERRO: ${err.message || String(err)}`,
      },
    ],
  };
}

// ==========================================
// 1. GERENCIAMENTO DE API KEYS E ESCOPO
// ==========================================

server.tool(
  "criar_api_key",
  "Cria uma nova API Key vinculada a um usuário do sistema, com seleção estrita de quais empresas e contas bancárias o agente poderá acessar.",
  {
    usuario: z
      .string()
      .describe("Nome, e-mail ou ID do usuário dono da chave (ex: 'Patrícia Karla', 'Rhian Geraldo', 'Paulo Vinicius')"),
    nome_chave: z
      .string()
      .describe("Nome identificador da chave (ex: 'Agente Aracruz', 'Robô de Conciliação Linhares', 'Agente Pessoal')"),
    empresas: z
      .array(z.string())
      .optional()
      .describe("Lista de empresas que a chave poderá acessar. Se omitido, herda as empresas vinculadas às contas bancárias."),
    contas_bancarias: z
      .array(z.string())
      .optional()
      .describe("Lista de contas bancárias específicas liberadas (ex: ['CAIXA ARACRUZ', 'INFINIT - ARACRUZ']). Se omitido, libera todas as contas das empresas selecionadas."),
  },
  async ({ usuario, nome_chave, empresas, contas_bancarias }) => {
    try {
      const result = await createApiKey({
        userQuery: usuario,
        name: nome_chave,
        companyQueries: empresas,
        accountQueries: contas_bancarias,
      });
      return formatResponse({
        success: true,
        message: "API Key gerada com sucesso! Guarde o token em local seguro.",
        apiKey: result.apiKey,
        summary: result.summary,
      });
    } catch (e: any) {
      return formatError(e);
    }
  }
);

server.tool(
  "listar_api_keys",
  "Lista as API Keys cadastradas no sistema, com seus escopos de empresas e contas autorizadas.",
  {
    usuario: z.string().optional().describe("Filtrar chaves de um usuário específico"),
  },
  async ({ usuario }) => {
    try {
      const keys = await listApiKeys(usuario);
      return formatResponse(keys);
    } catch (e: any) {
      return formatError(e);
    }
  }
);

server.tool(
  "revogar_api_key",
  "Desativa imediatamente uma API Key para revogar seu acesso.",
  {
    chave_ou_id: z.string().describe("ID ou o token da chave a ser revogada"),
  },
  async ({ chave_ou_id }) => {
    try {
      const success = await revokeApiKey(chave_ou_id);
      return formatResponse({
        success,
        message: success ? "API Key revogada com sucesso." : "Chave não encontrada.",
      });
    } catch (e: any) {
      return formatError(e);
    }
  }
);

server.tool(
  "consultar_escopo_usuario",
  "Consulta quais empresas e contas bancárias um usuário tem permissão de acessar no sistema para criação de API Keys.",
  {
    usuario: z.string().describe("Nome, email ou ID do usuário"),
  },
  async ({ usuario }) => {
    try {
      const scope = await getUserAvailableScope(usuario);
      return formatResponse({
        usuario: {
          id: scope.user.id,
          nome: scope.user.full_name || scope.user.email,
          superAdmin: scope.isSuperAdmin,
        },
        empresasDisponiveis: scope.companies.map((c) => ({ id: c.id, nome: c.name, tipo: c.kind })),
        contasDisponiveis: scope.accounts.map((a) => ({
          id: a.id,
          nome: a.name,
          banco: a.bank,
          empresaId: a.company_id,
        })),
      });
    } catch (e: any) {
      return formatError(e);
    }
  }
);

// ==========================================
// 2. EMPRESAS E CONTAS BANCÁRIAS
// ==========================================

server.tool(
  "listar_empresas",
  "Lista as empresas e clínicas cadastradas. Se configurado com API Key, exibe apenas as empresas autorizadas para aquela chave.",
  {},
  async () => {
    try {
      const scope = await validateApiKey();
      const { companies, bankAccounts } = await getCompaniesAndAccounts(scope);
      const result = companies.map((c) => ({
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
      return formatResponse(result);
    } catch (e: any) {
      return formatError(e);
    }
  }
);

server.tool(
  "listar_contas_bancarias",
  "Lista as contas bancárias ativas e seus saldos calculados (restrito ao escopo da API Key).",
  {
    empresa: z.string().optional().describe("Filtrar por nome ou ID da empresa"),
  },
  async ({ empresa }) => {
    try {
      const scope = await validateApiKey();
      const report = await getAccountsBalanceReport(empresa, scope);
      return formatResponse(report);
    } catch (e: any) {
      return formatError(e);
    }
  }
);

server.tool(
  "resolver_conta_e_empresa",
  "Valida se uma conta bancária ou empresa é válida e autorizada no escopo da sua API Key.",
  {
    conta: z.string().optional().describe("Termo de busca para a conta bancária"),
    empresa: z.string().optional().describe("Termo de busca para a empresa"),
  },
  async ({ conta, empresa }) => {
    try {
      const scope = await validateApiKey();
      const resolved = await resolveAccountAndCompany(
        {
          accountQuery: conta,
          companyQuery: empresa,
          requireBankAccount: false,
        },
        scope
      );
      return formatResponse({
        company: resolved.company,
        bankAccount: resolved.bankAccount || "Nenhuma conta específica informada",
      });
    } catch (e: any) {
      return formatError(e);
    }
  }
);

// ==========================================
// 3. LANÇAMENTOS FINANCEIROS (TRANSAÇÕES)
// ==========================================

server.tool(
  "lancar_transacao",
  "Lança uma nova receita ou despesa garantindo a conta certa e gravando o autor da operação automaticamente.",
  {
    tipo: z.enum(["entrada", "saida"]).describe("Tipo da transação: 'entrada' (receita) ou 'saida' (despesa)"),
    descricao: z.string().describe("Descrição da transação"),
    valor: z.number().positive().describe("Valor monetário em reais"),
    data_vencimento: z.string().describe("Vencimento no formato AAAA-MM-DD"),
    conta_bancaria: z.string().optional().describe("Conta bancária onde será lançado"),
    empresa: z.string().optional().describe("Empresa ou clínica alvo"),
    categoria: z.string().optional().describe("Categoria financeira"),
    centro_custo: z.string().optional().describe("Centro de custo"),
    status: z.enum(["pendente", "pago"]).optional().default("pendente"),
    data_pagamento: z.string().optional().describe("Data de pagamento se 'pago'"),
    observacoes: z.string().optional().describe("Observações"),
    boleto_arquivo: z.string().optional().describe("Caminho, Base64 ou URL do boleto"),
    comprovante_arquivo: z.string().optional().describe("Caminho, Base64 ou URL do comprovante"),
    parcelas: z.number().int().min(1).optional().default(1),
    tipo_valor_parcela: z.enum(["total", "parcela"]).optional().default("total"),
  },
  async (params) => {
    try {
      const scope = await validateApiKey();
      const result = await createTransaction(
        {
          type: params.tipo,
          description: params.descricao,
          amount: params.valor,
          dueDate: params.data_vencimento,
          accountQuery: params.conta_bancaria,
          companyQuery: params.empresa,
          categoryQuery: params.categoria,
          costCenterQuery: params.centro_custo,
          status: params.status,
          paidDate: params.data_pagamento,
          notes: params.observacoes,
          invoiceFile: params.boleto_arquivo,
          receiptFile: params.comprovante_arquivo,
          installments: params.parcelas,
          installmentAmountType: params.tipo_valor_parcela,
        },
        scope
      );
      return formatResponse(result);
    } catch (e: any) {
      return formatError(e);
    }
  }
);

server.tool(
  "marcar_como_pago",
  "Dá baixa bancária em uma transação financeira, validando a conta debitada e gravando o autor da baixa.",
  {
    transacao_id: z.string().uuid().describe("ID da transação"),
    data_pagamento: z.string().optional().describe("Data do pagamento (AAAA-MM-DD)"),
    conta_bancaria: z.string().optional().describe("Conta bancária de liquidação"),
    comprovante_arquivo: z.string().optional().describe("Caminho, Base64 ou URL do comprovante"),
    observacoes: z.string().optional().describe("Observações sobre o pagamento"),
  },
  async (params) => {
    try {
      const scope = await validateApiKey();
      const result = await markTransactionAsPaid(
        {
          transactionId: params.transacao_id,
          paidDate: params.data_pagamento,
          accountQuery: params.conta_bancaria,
          receiptFile: params.comprovante_arquivo,
          notes: params.observacoes,
        },
        scope
      );
      return formatResponse(result);
    } catch (e: any) {
      return formatError(e);
    }
  }
);

server.tool(
  "estornar_pagamento",
  "Reverte o pagamento de uma transação para pendente.",
  {
    transacao_id: z.string().uuid().describe("ID da transação a ser estornada"),
  },
  async ({ transacao_id }) => {
    try {
      const scope = await validateApiKey();
      const result = await rollbackPayment(transacao_id, scope);
      return formatResponse(result);
    } catch (e: any) {
      return formatError(e);
    }
  }
);

server.tool(
  "editar_transacao",
  "Atualiza os dados de uma transação existente.",
  {
    transacao_id: z.string().uuid().describe("ID da transação"),
    descricao: z.string().optional(),
    valor: z.number().positive().optional(),
    data_vencimento: z.string().optional(),
    conta_bancaria: z.string().optional(),
    categoria: z.string().optional(),
    centro_custo: z.string().optional(),
    observacoes: z.string().optional(),
  },
  async (params) => {
    try {
      const scope = await validateApiKey();
      const result = await updateTransaction(
        params.transacao_id,
        {
          description: params.descricao,
          amount: params.valor,
          dueDate: params.data_vencimento,
          accountQuery: params.conta_bancaria,
          categoryQuery: params.categoria,
          costCenterQuery: params.centro_custo,
          notes: params.observacoes,
        },
        scope
      );
      return formatResponse(result);
    } catch (e: any) {
      return formatError(e);
    }
  }
);

server.tool(
  "excluir_transacao",
  "Exclui uma transação financeira do sistema.",
  {
    transacao_id: z.string().uuid().describe("ID da transação a excluir"),
  },
  async ({ transacao_id }) => {
    try {
      const scope = await validateApiKey();
      const result = await deleteTransaction(transacao_id, scope);
      return formatResponse(result);
    } catch (e: any) {
      return formatError(e);
    }
  }
);

// ==========================================
// 4. DOCUMENTOS E ANEXOS
// ==========================================

server.tool(
  "anexar_documento",
  "Faz o upload e anexa um boleto ou comprovante a uma transação existente.",
  {
    transacao_id: z.string().uuid().describe("ID da transação"),
    tipo_documento: z.enum(["boleto", "comprovante"]),
    arquivo: z.string().describe("Caminho no disco, Base64 ou URL HTTP"),
    nome_arquivo: z.string().optional(),
  },
  async ({ transacao_id, tipo_documento, arquivo, nome_arquivo }) => {
    try {
      const scope = await validateApiKey();
      const prefix = tipo_documento === "boleto" ? "invoice" : "receipt";
      const uploadedUrl = await uploadTransactionAttachment({
        txId: transacao_id,
        type: prefix,
        fileInput: arquivo,
        fileName: nome_arquivo,
      });

      const updates =
        tipo_documento === "boleto" ? { invoice_url: uploadedUrl } : { receipt_url: uploadedUrl };

      await updateTransaction(transacao_id, updates as any, scope);

      return formatResponse({
        success: true,
        transactionId: transacao_id,
        documentType: tipo_documento,
        url: uploadedUrl,
      });
    } catch (e: any) {
      return formatError(e);
    }
  }
);

// ==========================================
// 5. CONCILIAÇÃO BANCÁRIA E AUDITORIA
// ==========================================

server.tool(
  "relatorio_saldos_contas",
  "Relatório detalhado do saldo de cada conta autorizada e consolidado por empresa.",
  {
    empresa: z.string().optional().describe("Filtrar por empresa"),
  },
  async ({ empresa }) => {
    try {
      const scope = await validateApiKey();
      const report = await getAccountsBalanceReport(empresa, scope);
      return formatResponse(report);
    } catch (e: any) {
      return formatError(e);
    }
  }
);

server.tool(
  "conciliar_extrato",
  "Cruza linhas de extrato com transações pendentes no sistema das contas autorizadas.",
  {
    conta_bancaria: z.string().describe("Conta bancária do extrato"),
    itens_extrato: z.array(
      z.object({
        date: z.string().describe("AAAA-MM-DD"),
        amount: z.number().positive(),
        type: z.enum(["entrada", "saida"]),
        description: z.string().optional(),
      })
    ),
    tolerancia_dias: z.number().int().min(0).max(30).optional().default(3),
    auto_aplicar_baixa: z.boolean().optional().default(false),
  },
  async (params) => {
    try {
      const scope = await validateApiKey();
      const result = await reconcileStatement(
        {
          accountQuery: params.conta_bancaria,
          statementItems: params.itens_extrato,
          dateToleranceDays: params.tolerancia_dias,
          autoApplyExactMatches: params.auto_aplicar_baixa,
        },
        scope
      );
      return formatResponse(result);
    } catch (e: any) {
      return formatError(e);
    }
  }
);

server.tool(
  "listar_transacoes_sem_comprovante",
  "Auditoria de contas pagas sem comprovante anexado nas empresas autorizadas.",
  {
    empresa: z.string().optional(),
  },
  async ({ empresa }) => {
    try {
      const scope = await validateApiKey();
      const result = await getPendingWithoutReceipt(empresa, scope);
      return formatResponse(result);
    } catch (e: any) {
      return formatError(e);
    }
  }
);

server.tool(
  "listar_contas_atrasadas",
  "Lista transações pendentes que já venceram nas contas autorizadas.",
  {
    empresa: z.string().optional(),
  },
  async ({ empresa }) => {
    try {
      const scope = await validateApiKey();
      const result = await getOverdueTransactions(empresa, scope);
      return formatResponse(result);
    } catch (e: any) {
      return formatError(e);
    }
  }
);

// ==========================================
// 6. CONSULTAS E RELATÓRIOS
// ==========================================

server.tool(
  "consultar_transacoes",
  "Filtra e lista transações financeiras das contas autorizadas para sua chave.",
  {
    empresa: z.string().optional(),
    conta_bancaria: z.string().optional(),
    tipo: z.enum(["entrada", "saida", "all"]).optional().default("all"),
    status: z.enum(["pendente", "pago", "all"]).optional().default("all"),
    vencimento_de: z.string().optional(),
    vencimento_ate: z.string().optional(),
    pagamento_de: z.string().optional(),
    pagamento_ate: z.string().optional(),
    busca: z.string().optional(),
    limite: z.number().int().min(1).max(200).optional().default(50),
  },
  async (params) => {
    try {
      const scope = await validateApiKey();
      const result = await listTransactions(
        {
          companyQuery: params.empresa,
          accountQuery: params.conta_bancaria,
          type: params.tipo,
          status: params.status,
          dueDateFrom: params.vencimento_de,
          dueDateTo: params.vencimento_ate,
          paidDateFrom: params.pagamento_de,
          paidDateTo: params.pagamento_ate,
          search: params.busca,
          limit: params.limite,
        },
        scope
      );
      return formatResponse(result);
    } catch (e: any) {
      return formatError(e);
    }
  }
);

server.tool(
  "resumo_financeiro",
  "DRE / Resumo executivo financeiro das empresas autorizadas.",
  {
    empresa: z.string().optional(),
    data_inicio: z.string().optional(),
    data_fim: z.string().optional(),
  },
  async ({ empresa, data_inicio, data_fim }) => {
    try {
      const scope = await validateApiKey();
      const summary = await getFinancialSummary(
        {
          companyQuery: empresa,
          dateFrom: data_inicio,
          dateTo: data_fim,
        },
        scope
      );
      return formatResponse(summary);
    } catch (e: any) {
      return formatError(e);
    }
  }
);

server.tool(
  "listar_categorias_e_centros",
  "Lista categorias e centros de custo ativos para apoiar a classificação.",
  {
    empresa: z.string().optional(),
  },
  async ({ empresa }) => {
    try {
      const scope = await validateApiKey();
      const data = await getCategoriesAndCostCenters(empresa, scope);
      return formatResponse(data);
    } catch (e: any) {
      return formatError(e);
    }
  }
);

// ==========================================
// INICIALIZAÇÃO
// ==========================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("FinanceGest MCP Server conectado via STDIO com sucesso!");
}

main().catch((err) => {
  console.error("Falha fatal ao iniciar FinanceGest MCP Server:", err);
  process.exit(1);
});
