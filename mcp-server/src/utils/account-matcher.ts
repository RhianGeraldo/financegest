import { supabase } from "../config.js";
import { normalizeText } from "./formatters.js";
import type { ResolvedScope } from "../services/auth.service.js";

export { normalizeText };

export interface CompanyInfo {
  id: string;
  name: string;
  kind: "clinica" | "pessoal";
  active: boolean;
}

export interface BankAccountInfo {
  id: string;
  company_id: string;
  bank: string;
  name: string;
  initial_balance: number;
  active: boolean;
  company_name?: string;
}

export interface ResolvedAccountScope {
  company: CompanyInfo;
  bankAccount?: BankAccountInfo;
}

/**
 * Carrega todas as empresas e contas bancárias ativas, aplicando opcionalmente o escopo da API Key
 */
export async function getCompaniesAndAccounts(scope?: ResolvedScope): Promise<{
  companies: CompanyInfo[];
  bankAccounts: BankAccountInfo[];
}> {
  const [compRes, accRes] = await Promise.all([
    supabase.from("companies").select("id, name, kind, active").eq("active", true).order("name"),
    supabase.from("bank_accounts").select("id, company_id, bank, name, initial_balance, active").eq("active", true).order("name"),
  ]);

  if (compRes.error) throw new Error(`Erro ao buscar empresas: ${compRes.error.message}`);
  if (accRes.error) throw new Error(`Erro ao buscar contas bancárias: ${accRes.error.message}`);

  let companies = compRes.data as CompanyInfo[];
  let bankAccounts = accRes.data as BankAccountInfo[];

  // Aplica filtro do escopo da API Key se não for master
  if (scope && !scope.isMaster) {
    if (scope.allowedCompanyIds) {
      companies = companies.filter((c) => scope.allowedCompanyIds!.has(c.id));
    }
    if (scope.allowedBankAccountIds) {
      bankAccounts = bankAccounts.filter((a) => scope.allowedBankAccountIds!.has(a.id));
    }
  }

  const compMap = new Map<string, string>();
  for (const c of companies) {
    compMap.set(c.id, c.name);
  }

  bankAccounts = bankAccounts.map((acc) => ({
    ...acc,
    company_name: compMap.get(acc.company_id) || "Empresa não autorizada / não identificada",
  }));

  return {
    companies,
    bankAccounts,
  };
}

/**
 * Resolve e valida rigorosamente a conta bancária e a empresa alvo para o lançamento financeiro,
 * verificando o escopo autorizado da API Key.
 */
export async function resolveAccountAndCompany(
  params: {
    accountQuery?: string;
    companyQuery?: string;
    requireBankAccount?: boolean;
  },
  scope?: ResolvedScope
): Promise<ResolvedAccountScope> {
  const { accountQuery, companyQuery, requireBankAccount = false } = params;
  const { companies, bankAccounts } = await getCompaniesAndAccounts(scope);

  if (scope && !scope.isMaster && companies.length === 0) {
    throw new Error(
      "ACESSO NEGADO: Sua API Key não possui permissão para acessar nenhuma empresa ou conta do sistema."
    );
  }

  let targetAccount: BankAccountInfo | undefined;
  let targetCompany: CompanyInfo | undefined;

  // 1. Tentar resolver a Conta Bancária primeiro (se informada)
  if (accountQuery) {
    const qAcc = normalizeText(accountQuery);

    // Busca por ID exato
    targetAccount = bankAccounts.find((a) => a.id === accountQuery);

    if (!targetAccount) {
      // Busca por correspondência exata de nome ou banco
      targetAccount = bankAccounts.find(
        (a) => normalizeText(a.name) === qAcc || normalizeText(a.bank) === qAcc
      );
    }

    if (!targetAccount) {
      // Busca parcial / por palavras-chave (ex: "caixa aracruz", "infinit serra")
      const matches = bankAccounts.filter((a) => {
        const fullDesc = normalizeText(`${a.bank} ${a.name} ${a.company_name}`);
        const words = qAcc.split(" ").filter((w) => w.length > 2);
        return words.every((w) => fullDesc.includes(w));
      });

      if (matches.length === 1) {
        targetAccount = matches[0];
      } else if (matches.length > 1) {
        if (companyQuery) {
          const qComp = normalizeText(companyQuery);
          const filtered = matches.filter((a) => normalizeText(a.company_name || "").includes(qComp));
          if (filtered.length === 1) {
            targetAccount = filtered[0];
          }
        }

        if (!targetAccount) {
          const options = matches
            .map((m) => `• ID: "${m.id}" | Nome: "${m.name}" | Banco: "${m.bank}" | Empresa: "${m.company_name}"`)
            .join("\n");
          throw new Error(
            `Ambiguidade na conta bancária informada "${accountQuery}". Múltiplas opções encontradas no seu escopo:\n${options}\nPor favor, informe o ID ou nome exato.`
          );
        }
      }
    }

    if (!targetAccount) {
      const available = bankAccounts
        .map((a) => `• ${a.name} (${a.bank}) - Empresa: ${a.company_name}`)
        .join("\n");
      const scopeMsg = scope && !scope.isMaster ? " (dentro do escopo permitido da sua API Key)" : "";
      throw new Error(
        `Conta bancária não encontrada ou não autorizada para "${accountQuery}"${scopeMsg}.\nContas disponíveis para sua chave:\n${available || "Nenhuma conta liberada."}`
      );
    }

    // Deduz a empresa correspondente à conta
    targetCompany = companies.find((c) => c.id === targetAccount!.company_id);
  }

  // 2. Se a empresa foi especificada, validar ou resolver
  if (companyQuery) {
    const qComp = normalizeText(companyQuery);

    let specifiedCompany = companies.find((c) => c.id === companyQuery);

    if (!specifiedCompany) {
      specifiedCompany = companies.find(
        (c) => normalizeText(c.name) === qComp || normalizeText(c.name).includes(qComp)
      );
    }

    if (!specifiedCompany) {
      const compList = companies.map((c) => `• ${c.name} (${c.kind})`).join("\n");
      const scopeMsg = scope && !scope.isMaster ? " (permitidas para sua API Key)" : "";
      throw new Error(
        `Empresa "${companyQuery}" não encontrada ou não autorizada${scopeMsg}.\nEmpresas liberadas:\n${compList || "Nenhuma empresa liberada."}`
      );
    }

    if (targetCompany && targetCompany.id !== specifiedCompany.id) {
      throw new Error(
        `CONFLITO DE CONTA E EMPRESA:\nA conta bancária selecionada ("${targetAccount?.name}" / ${targetAccount?.bank}) pertence à empresa "${targetCompany.name}", mas você solicitou o lançamento na empresa "${specifiedCompany.name}".\nPor favor, selecione a conta correspondente da empresa "${specifiedCompany.name}".`
      );
    }

    targetCompany = specifiedCompany;
  }

  if (!targetCompany) {
    if (requireBankAccount) {
      throw new Error("É obrigatório informar a conta bancária ou empresa para esta operação.");
    }
    const compList = companies.map((c) => `• ${c.name} (${c.kind})`).join("\n");
    throw new Error(`Não foi possível identificar a empresa alvo. Empresas disponíveis:\n${compList}`);
  }

  if (requireBankAccount && !targetAccount) {
    const companyAccounts = bankAccounts.filter((a) => a.company_id === targetCompany!.id);
    if (companyAccounts.length === 0) {
      throw new Error(
        `A empresa "${targetCompany.name}" não possui nenhuma conta bancária cadastrada ou liberada no seu escopo.`
      );
    }
    if (companyAccounts.length === 1) {
      targetAccount = companyAccounts[0];
    } else {
      const options = companyAccounts
        .map((a) => `• ID: "${a.id}" | Nome: "${a.name}" | Banco: "${a.bank}"`)
        .join("\n");
      throw new Error(
        `A empresa "${targetCompany.name}" possui mais de uma conta liberada. Por favor, especifique qual conta usar:\n${options}`
      );
    }
  }

  return {
    company: targetCompany,
    bankAccount: targetAccount,
  };
}
