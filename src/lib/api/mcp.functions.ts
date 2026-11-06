import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

function getAdminClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada no .env.");
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const LOCAL_DATA_PATH = path.resolve(process.cwd(), "mcp-server/data/api-keys.json");

async function readLocalKeys(): Promise<any[]> {
  try {
    const raw = await fs.readFile(LOCAL_DATA_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function saveLocalKeys(keys: any[]): Promise<void> {
  try {
    await fs.mkdir(path.dirname(LOCAL_DATA_PATH), { recursive: true });
    await fs.writeFile(LOCAL_DATA_PATH, JSON.stringify(keys, null, 2), "utf-8");
  } catch (err) {
    console.warn("Falha ao salvar fallback local:", err);
  }
}

export const createMcpKeyFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      userId: z.string().uuid(),
      name: z.string().min(2, "Nome da chave deve ter no mínimo 2 caracteres"),
      allowedCompanyIds: z.array(z.string().uuid()).min(1, "Selecione ao menos uma empresa"),
      allowedBankAccountIds: z.array(z.string().uuid()).optional().default([]),
      autoIncludeNewAccounts: z.boolean().optional().default(true),
    })
  )
  .handler(async ({ data }) => {
    const admin = getAdminClient();
    const token = `fg_live_${crypto.randomBytes(24).toString("hex")}`;
    const id = crypto.randomUUID();

    const record = {
      id,
      user_id: data.userId,
      name: data.name,
      key_hash: token,
      allowed_company_ids: data.allowedCompanyIds,
      allowed_bank_account_ids: data.allowedBankAccountIds,
      auto_include_new_accounts: data.autoIncludeNewAccounts,
      active: true,
      created_at: new Date().toISOString(),
    };

    let savedInDb = false;
    try {
      const { error } = await admin.from("mcp_api_keys").insert({
        id: record.id,
        user_id: record.user_id,
        name: record.name,
        key_hash: record.key_hash,
        allowed_company_ids: record.allowed_company_ids,
        allowed_bank_account_ids: record.allowed_bank_account_ids,
        active: true,
      });
      if (!error) savedInDb = true;
      else console.warn("Aviso ao salvar no banco mcp_api_keys:", error.message);
    } catch (e: any) {
      console.warn("Tabela mcp_api_keys não acessível, usando fallback local:", e.message);
    }

    const local = await readLocalKeys();
    local.push({
      ...record,
      key: token,
    });
    await saveLocalKeys(local);

    return {
      success: true,
      id,
      name: data.name,
      apiKey: token,
      savedInDb,
    };
  });

export const listMcpKeysFn = createServerFn({ method: "GET" })
  .inputValidator(z.object({ userId: z.string().uuid().optional() }).optional())
  .handler(async ({ data }) => {
    const admin = getAdminClient();
    let keys: any[] = [];

    try {
      let q = admin.from("mcp_api_keys").select("*").order("created_at", { ascending: false });
      if (data?.userId) q = q.eq("user_id", data.userId);
      const { data: dbKeys, error } = await q;
      if (!error && dbKeys && dbKeys.length > 0) {
        keys = dbKeys.map((k) => ({
          id: k.id,
          userId: k.user_id,
          name: k.name,
          keyMasked: `${k.key_hash.slice(0, 12)}...${k.key_hash.slice(-4)}`,
          allowedCompanyIds: k.allowed_company_ids || [],
          allowedBankAccountIds: k.allowed_bank_account_ids || [],
          autoIncludeNewAccounts: true, // Default ativo
          active: k.active,
          createdAt: k.created_at,
          lastUsedAt: k.last_used_at,
        }));
      }
    } catch {}

    if (keys.length === 0) {
      const local = await readLocalKeys();
      const filtered = data?.userId ? local.filter((k) => k.user_id === data.userId) : local;
      keys = filtered.map((k) => ({
        id: k.id,
        userId: k.user_id,
        name: k.name,
        keyMasked: `${(k.key || k.key_hash || "").slice(0, 12)}...${(k.key || k.key_hash || "").slice(-4)}`,
        allowedCompanyIds: k.allowed_company_ids || [],
        allowedBankAccountIds: k.allowed_bank_account_ids || [],
        autoIncludeNewAccounts: k.auto_include_new_accounts !== false,
        active: k.active,
        createdAt: k.created_at,
        lastUsedAt: k.last_used_at,
      }));
    }

    return keys;
  });

export const revokeMcpKeyFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ keyId: z.string() }))
  .handler(async ({ data }) => {
    const admin = getAdminClient();
    try {
      await admin.from("mcp_api_keys").update({ active: false }).eq("id", data.keyId);
    } catch {}

    const local = await readLocalKeys();
    const item = local.find((k) => k.id === data.keyId);
    if (item) {
      item.active = false;
      await saveLocalKeys(local);
    }

    return { success: true };
  });
