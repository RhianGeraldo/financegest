import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

function getAdminClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    "";
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const BUCKET_NAME = "mcp_system";
const FILE_NAME = "api-keys.json";

async function readAllKeys(): Promise<any[]> {
  const admin = getAdminClient();
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    "";

  // 1. Tenta banco de dados relacional mcp_api_keys
  try {
    const { data: dbKeys, error } = await admin
      .from("mcp_api_keys")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error && dbKeys && dbKeys.length > 0) {
      return dbKeys.map((k) => ({
        id: k.id,
        user_id: k.user_id,
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

  // 2. Tenta Supabase Storage (persistente na nuvem, compartilhado entre instâncias serverless)
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

  // 3. Fallback arquivo local (dev local)
  try {
    const LOCAL_DATA_PATH = path.resolve(process.cwd(), "mcp-server/data/api-keys.json");
    const raw = await fs.readFile(LOCAL_DATA_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function saveAllKeys(keys: any[]): Promise<boolean> {
  const admin = getAdminClient();
  let saved = false;

  // 1. Tenta Supabase Storage
  try {
    const { error } = await admin.storage.from(BUCKET_NAME).upload(
      FILE_NAME,
      Buffer.from(JSON.stringify(keys, null, 2)),
      { contentType: "application/json", upsert: true, cacheControl: "0" }
    );
    if (!error) saved = true;
  } catch {}

  // 2. Tenta arquivo local (silencioso caso o disco seja somente leitura na Vercel)
  try {
    const LOCAL_DATA_PATH = path.resolve(process.cwd(), "mcp-server/data/api-keys.json");
    await fs.mkdir(path.dirname(LOCAL_DATA_PATH), { recursive: true });
    await fs.writeFile(LOCAL_DATA_PATH, JSON.stringify(keys, null, 2), "utf-8");
  } catch {}

  return saved;
}

export const createMcpKeyFn = createServerFn({ method: "POST" })
  .validator(
    (d: {
      userId: string;
      name: string;
      allowedCompanyIds: string[];
      allowedBankAccountIds?: string[];
      autoIncludeNewAccounts?: boolean;
    }) => d
  )
  .handler(async ({ data }) => {
    const admin = getAdminClient();
    const token = `fg_live_${crypto.randomBytes(24).toString("hex")}`;
    const id = crypto.randomUUID();

    const record = {
      id,
      user_id: data.userId,
      name: data.name,
      key: token,
      key_hash: token,
      allowed_company_ids: data.allowedCompanyIds,
      allowed_bank_account_ids: data.allowedBankAccountIds || [],
      auto_include_new_accounts: data.autoIncludeNewAccounts !== false,
      active: true,
      created_at: new Date().toISOString(),
    };

    // Tenta salvar no Postgres se a tabela existir
    try {
      await admin.from("mcp_api_keys").insert({
        id: record.id,
        user_id: record.user_id,
        name: record.name,
        key_hash: record.key,
        allowed_company_ids: record.allowed_company_ids,
        allowed_bank_account_ids: record.allowed_bank_account_ids,
        active: true,
      });
    } catch {}

    // Salva no storage persistente
    const keys = await readAllKeys();
    const existingIndex = keys.findIndex((k) => k.id === id);
    if (existingIndex >= 0) {
      keys[existingIndex] = record;
    } else {
      keys.unshift(record);
    }
    await saveAllKeys(keys);

    return {
      success: true,
      id,
      name: data.name,
      apiKey: token,
    };
  });

export const listMcpKeysFn = createServerFn({ method: "POST" })
  .validator((d?: { userId?: string }) => d)
  .handler(async ({ data }) => {
    const allKeys = await readAllKeys();
    const filtered = data?.userId ? allKeys.filter((k) => k.user_id === data.userId) : allKeys;

    return filtered.map((k) => ({
      id: k.id,
      userId: k.user_id,
      name: k.name,
      keyMasked: `${(k.key || k.key_hash || "").slice(0, 12)}...${(k.key || k.key_hash || "").slice(-4)}`,
      allowedCompanyIds: k.allowed_company_ids || [],
      allowedBankAccountIds: k.allowed_bank_account_ids || [],
      autoIncludeNewAccounts: k.auto_include_new_accounts !== false,
      active: k.active !== false,
      createdAt: k.created_at,
      lastUsedAt: k.last_used_at,
    }));
  });

export const revokeMcpKeyFn = createServerFn({ method: "POST" })
  .validator((d: { keyId: string }) => d)
  .handler(async ({ data }) => {
    const admin = getAdminClient();
    try {
      await admin.from("mcp_api_keys").update({ active: false }).eq("id", data.keyId);
    } catch {}

    const keys = await readAllKeys();
    const item = keys.find((k) => k.id === data.keyId);
    if (item) {
      item.active = false;
      await saveAllKeys(keys);
    }

    return { success: true };
  });
