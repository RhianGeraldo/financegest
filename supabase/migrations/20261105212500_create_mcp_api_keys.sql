-- Migration: Criação da tabela mcp_api_keys com escopo granular de empresas e contas
CREATE TABLE IF NOT EXISTS public.mcp_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  allowed_company_ids UUID[] NOT NULL DEFAULT '{}',
  allowed_bank_account_ids UUID[] NOT NULL DEFAULT '{}',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ
);

COMMENT ON TABLE public.mcp_api_keys IS 'Chaves de API para agentes MCP com whitelist de empresas e contas bancárias';
COMMENT ON COLUMN public.mcp_api_keys.allowed_company_ids IS 'IDs das empresas às quais a chave tem acesso';
COMMENT ON COLUMN public.mcp_api_keys.allowed_bank_account_ids IS 'IDs das contas bancárias específicas liberadas para movimentação e conciliação';

-- Índices de consulta rápida
CREATE INDEX IF NOT EXISTS idx_mcp_api_keys_key_hash ON public.mcp_api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_mcp_api_keys_user_id ON public.mcp_api_keys(user_id);

-- Habilitar RLS
ALTER TABLE public.mcp_api_keys ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS: o usuário só vê e gerencia as suas próprias chaves (ou super_admin)
CREATE POLICY "mcp_api_keys_select" ON public.mcp_api_keys
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_super_admin(auth.uid()));

CREATE POLICY "mcp_api_keys_insert" ON public.mcp_api_keys
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.is_super_admin(auth.uid()));

CREATE POLICY "mcp_api_keys_update" ON public.mcp_api_keys
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_super_admin(auth.uid()));

CREATE POLICY "mcp_api_keys_delete" ON public.mcp_api_keys
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_super_admin(auth.uid()));
