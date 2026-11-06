import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "node:path";
import fs from "node:fs";

// Tenta carregar .env da raiz do projeto ou diretório corrente
const possibleEnvPaths = [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "../.env"),
  path.resolve(import.meta.dirname, "../../.env"),
  "/home/rhiangeraldo/Desenvolvimentos/financegest/.env",
];

for (const envPath of possibleEnvPaths) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    break;
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) {
  throw new Error("SUPABASE_URL ou VITE_SUPABASE_URL não definida nas variáveis de ambiente.");
}

if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY não definida nas variáveis de ambiente. Necessária para operações administrativas do MCP.");
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

export const STORAGE_BUCKET = "receipts";
