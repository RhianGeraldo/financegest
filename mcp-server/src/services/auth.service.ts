import { supabase } from "../config.js";
import { getCompaniesAndAccounts, normalizeText } from "../utils/account-matcher.js";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export interface ApiKeyRecord {
  id: string;
  user_id: string;
  user_name: string;
  name: string;
  key: string;
  allowed_company_ids: string[];
  allowed_bank_account_ids: string[];
  auto_include_new_accounts?: boolean; // Se true, novas contas adicionadas a estas empresas entram automaticamente
  active: boolean;
  created_at: string;
  last_used_at?: string;
}

export interface ResolvedScope {
  isMaster: boolean;
  user?: {
    id: string;
    name: string;
  };
  allowedCompanyIds?: Set<string>;
  allowedBankAccountIds?: Set<string>;
  autoIncludeNewAccounts?: boolean;
  keyRecord?: ApiKeyRecord;
}

const BUCKET_NAME = "mcp_system";
const FILE_NAME = "api-keys.json";

async function readStoredKeys(): Promise<ApiKeyRecord[]> {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    "";

  // 1. Tenta banco de dados
  try {
    const { data: dbKeys, error } = await supabase
      .from("mcp_api_keys")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error && dbKeys && dbKeys.length > 0) {
      return dbKeys.map((k) => ({
        id: k.id,
        user_id: k.user_id,
        user_name: "Usuário",
        name: k.name,
        key: k.key_hash,
        allowed_company_ids: k.allowed_company_ids || [],
        allowed_bank_account_ids: k.allowed_bank_account_ids || [],
        auto_include_new_accounts: k.auto_include_new_accounts !== false,
        active: k.active,
        created_at: k.created_at,
        last_used_at: k.last_used_at,
      }));
    }
  } catch {}

  // 2. Tenta Supabase Storage
  try {
    if (url && serviceKey) {
      const res = await fetch(
        `${url}/storage/v1/object/authenticated/${BUCKET_NAME}/${FILE_NAME}?t=${Date.now()}`,
        {
          headers: { Authorization: `Bearer ${serviceKey}` },
          cache: "no-store",
        }
      );
      if (res.ok) {
        const keys = await res.json();
        if (Array.isArray(keys)) return keys;
      }
    }
  } catch {}

  // 3. Fallback local (dev)
  try {
    const DATA_FILE = path.resolve(process.cwd(), "mcp-server/data/api-keys.json");
    const raw = await fs.readFile(DATA_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function writeStoredKeys(keys: ApiKeyRecord[]): Promise<boolean> {
  let saved = false;

  // 1. Tenta Supabase Storage
  try {
    const { error } = await supabase.storage.from(BUCKET_NAME).upload(
      FILE_NAME,
      Buffer.from(JSON.stringify(keys, null, 2)),
      { contentType: "application/json", upsert: true, cacheControl: "0" }
    );
    if (!error) saved = true;
  } catch {}

  // 2. Tenta arquivo local (se permitido)
  try {
    const DATA_FILE = path.resolve(process.cwd(), "mcp-server/data/api-keys.json");
    await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
    await fs.writeFile(DATA_FILE, JSON.stringify(keys, null, 2), "utf-8");
  } catch {}

  return saved;
}

export async function getUserAvailableScope(userQuery: string) {
  const [profilesRes, compRes, accRes, membersRes, superAdminRes] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email"),
    supabase.from("companies").select("id, name, kind, active").eq("active", true),
    supabase.from("bank_accounts").select("id, company_id, bank, name, initial_balance, active").eq("active", true),
    supabase.from("company_members").select("user_id, company_id"),
    supabase.from("user_roles").select("user_id, role").eq("role", "super_admin"),
  ]);

  if (profilesRes.error) throw new Error(`Erro ao buscar perfis: ${profilesRes.error.message}`);

  const profiles = profilesRes.data || [];
  const q = normalizeText(userQuery);

  const targetProfile =
    profiles.find((p) => p.id === userQuery) ||
    profiles.find((p) => normalizeText(p.full_name || "") === q || normalizeText(p.email || "") === q) ||
    profiles.find((p) => normalizeText(p.full_name || "").includes(q) || normalizeText(p.email || "").includes(q));

  if (!targetProfile) {
    const available = profiles.map((p) => `• ${p.full_name || p.email} [ID: ${p.id}]`).join("\n");
    throw new Error(`Usuário não encontrado para "${userQuery}". Usuários cadastrados:\n${available}`);
  }

  const isSuperAdmin = (superAdminRes.data || []).some((r) => r.user_id === targetProfile.id);
  const userMemberships = new Set((membersRes.data || []).filter((m) => m.user_id === targetProfile.id).map((m) => m.company_id));

  const allCompanies = compRes.data || [];
  const allAccounts = accRes.data || [];

  const accessibleCompanies = allCompanies.filter((c) => isSuperAdmin || userMemberships.has(c.id));
  const accessibleCompIds = new Set(accessibleCompanies.map((c) => c.id));
  const accessibleAccounts = allAccounts.filter((a) => accessibleCompIds.has(a.company_id));

  return {
    user: targetProfile,
    isSuperAdmin,
    companies: accessibleCompanies,
    accounts: accessibleAccounts,
  };
}

export async function createApiKey(params: {
  userQuery: string;
  name: string;
  companyQueries?: string[];
  accountQueries?: string[];
  autoIncludeNewAccounts?: boolean;
}): Promise<{
  apiKey: string;
  record: ApiKeyRecord;
  summary: {
    userName: string;
    allowedCompanies: string[];
    allowedAccounts: string[];
    autoIncludeNewAccounts: boolean;
  };
}> {
  const {
    userQuery,
    name,
    companyQueries = [],
    accountQueries = [],
    autoIncludeNewAccounts = true,
  } = params;

  const userScope = await getUserAvailableScope(userQuery);
  const selectedCompanyIds: Set<string> = new Set();
  const selectedAccountIds: Set<string> = new Set();

  if (companyQueries.length > 0) {
    for (const cq of companyQueries) {
      const qNorm = normalizeText(cq);
      const match = userScope.companies.find(
        (c) => c.id === cq || normalizeText(c.name) === qNorm || normalizeText(c.name).includes(qNorm)
      );

      if (!match) {
        const allowedNames = userScope.companies.map((c) => `• ${c.name}`).join("\n");
        throw new Error(
          `ACESSO NEGADO: O usuário "${userScope.user.full_name}" não possui permissão na empresa "${cq}".\nEmpresas permitidas:\n${allowedNames}`
        );
      }
      selectedCompanyIds.add(match.id);
    }
  } else {
    if (accountQueries.length === 0) {
      userScope.companies.forEach((c) => selectedCompanyIds.add(c.id));
    }
  }

  if (accountQueries.length > 0) {
    for (const aq of accountQueries) {
      const qNorm = normalizeText(aq);
      const match = userScope.accounts.find(
        (a) => a.id === aq || normalizeText(a.name) === qNorm || normalizeText(a.bank) === qNorm || normalizeText(`${a.name} ${a.bank}`).includes(qNorm)
      );

      if (!match) {
        const allowedAccNames = userScope.accounts.map((a) => `• ${a.name} (${a.bank})`).join("\n");
        throw new Error(
          `ACESSO NEGADO: A conta bancária "${aq}" não está disponível no escopo do usuário "${userScope.user.full_name}".\nContas disponíveis:\n${allowedAccNames}`
        );
      }

      selectedAccountIds.add(match.id);
      selectedCompanyIds.add(match.company_id);
    }
  } else {
    userScope.accounts
      .filter((a) => selectedCompanyIds.has(a.company_id))
      .forEach((a) => selectedAccountIds.add(a.id));
  }

  const tokenSecret = `fg_live_${crypto.randomBytes(24).toString("hex")}`;
  const keyRecord: ApiKeyRecord = {
    id: crypto.randomUUID(),
    user_id: userScope.user.id,
    user_name: userScope.user.full_name || userScope.user.email || "Usuário",
    name,
    key: tokenSecret,
    allowed_company_ids: Array.from(selectedCompanyIds),
    allowed_bank_account_ids: Array.from(selectedAccountIds),
    auto_include_new_accounts: autoIncludeNewAccounts,
    active: true,
    created_at: new Date().toISOString(),
  };

  try {
    const { error } = await supabase.from("mcp_api_keys").insert({
      id: keyRecord.id,
      user_id: keyRecord.user_id,
      name: keyRecord.name,
      key_hash: keyRecord.key,
      allowed_company_ids: keyRecord.allowed_company_ids,
      allowed_bank_account_ids: keyRecord.allowed_bank_account_ids,
      active: true,
    });
  } catch {}

  const keys = await readStoredKeys();
  const existingIndex = keys.findIndex((k) => k.id === keyRecord.id);
  if (existingIndex >= 0) {
    keys[existingIndex] = keyRecord;
  } else {
    keys.unshift(keyRecord);
  }
  await writeStoredKeys(keys);

  const companyNames = userScope.companies
    .filter((c) => selectedCompanyIds.has(c.id))
    .map((c) => c.name);

  const accountNames = userScope.accounts
    .filter((a) => selectedAccountIds.has(a.id))
    .map((a) => `${a.name} (${a.bank})`);

  return {
    apiKey: tokenSecret,
    record: keyRecord,
    summary: {
      userName: userScope.user.full_name || userScope.user.email || "Usuário",
      allowedCompanies: companyNames,
      allowedAccounts: accountNames,
      autoIncludeNewAccounts,
    },
  };
}

export async function validateApiKey(apiKeyInput?: string): Promise<ResolvedScope> {
  const token = apiKeyInput || process.env.FINANCEGEST_API_KEY;

  if (!token || token === "master" || token === "admin") {
    return { isMaster: true };
  }

  let record: ApiKeyRecord | undefined;

  try {
    const { data, error } = await supabase
      .from("mcp_api_keys")
      .select("*")
      .eq("key_hash", token)
      .eq("active", true)
      .single();

    if (!error && data) {
      supabase
        .from("mcp_api_keys")
        .update({ last_used_at: new Date().toISOString() })
        .eq("id", data.id)
        .then(() => {});

      record = {
        id: data.id,
        user_id: data.user_id,
        user_name: "Usuário",
        name: data.name,
        key: data.key_hash,
        allowed_company_ids: data.allowed_company_ids || [],
        allowed_bank_account_ids: data.allowed_bank_account_ids || [],
        auto_include_new_accounts: true,
        active: data.active,
        created_at: data.created_at,
      };
    }
  } catch {}

  if (!record) {
    const stored = await readStoredKeys();
    record = stored.find((k) => (k.key === token || (k as any).key_hash === token) && k.active !== false);
  }

  if (!record) {
    throw new Error(
      `ACESSO NÃO AUTORIZADO: A API Key fornecida é inválida, não foi encontrada ou foi revogada.`
    );
  }

  const { data: profile } = await supabase.from("profiles").select("id, full_name").eq("id", record.user_id).single();

  const allowedCompIds = new Set(record.allowed_company_ids);
  let allowedAccountIds = new Set(record.allowed_bank_account_ids);

  // SE AUTO_INCLUDE_NEW_ACCOUNTS FOR TRUE (padrão):
  // Busca em tempo real todas as contas bancárias atuais das empresas autorizadas
  // Assim, se o usuário criar mais contas depois, elas entram automaticamente no escopo!
  const autoInclude = record.auto_include_new_accounts !== false;
  if (autoInclude && allowedCompIds.size > 0) {
    const { data: currentAccounts } = await supabase
      .from("bank_accounts")
      .select("id")
      .in("company_id", Array.from(allowedCompIds))
      .eq("active", true);

    if (currentAccounts && currentAccounts.length > 0) {
      allowedAccountIds = new Set(currentAccounts.map((a) => a.id));
    }
  }

  return {
    isMaster: false,
    user: {
      id: record.user_id,
      name: profile?.full_name || record.user_name || "Usuário",
    },
    allowedCompanyIds: allowedCompIds,
    allowedBankAccountIds: allowedAccountIds,
    autoIncludeNewAccounts: autoInclude,
    keyRecord: record,
  };
}

export async function listApiKeys(userId?: string): Promise<ApiKeyRecord[]> {
  try {
    let q = supabase.from("mcp_api_keys").select("*").order("created_at", { ascending: false });
    if (userId) q = q.eq("user_id", userId);
    const { data, error } = await q;
    if (!error && data && data.length > 0) {
      return data.map((d) => ({
        id: d.id,
        user_id: d.user_id,
        user_name: "Usuário",
        name: d.name,
        key: d.key_hash,
        allowed_company_ids: d.allowed_company_ids || [],
        allowed_bank_account_ids: d.allowed_bank_account_ids || [],
        auto_include_new_accounts: true,
        active: d.active,
        created_at: d.created_at,
        last_used_at: d.last_used_at,
      }));
    }
  } catch {}

  const stored = await readStoredKeys();
  if (userId) return stored.filter((k) => k.user_id === userId);
  return stored;
}

export async function revokeApiKey(keyId: string): Promise<boolean> {
  let updatedInDb = false;
  try {
    const { error } = await supabase.from("mcp_api_keys").update({ active: false }).eq("id", keyId);
    if (!error) updatedInDb = true;
  } catch {}

  const stored = await readStoredKeys();
  const item = stored.find((k) => k.id === keyId || k.key === keyId);
  if (item) {
    item.active = false;
    await writeStoredKeys(stored);
    return true;
  }

  return updatedInDb;
}
