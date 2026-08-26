-- Adiciona a coluna receipt_url para armazenar o link do comprovante da transação
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS receipt_url TEXT;

-- Criar bucket de storage para comprovantes (receipts) se não existir
INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', true)
ON CONFLICT (id) DO NOTHING;

-- Políticas de acesso para o bucket de comprovantes
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Permitir leitura pública de comprovantes'
    ) THEN
        CREATE POLICY "Permitir leitura pública de comprovantes" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'receipts');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Permitir upload de comprovantes para usuários autenticados'
    ) THEN
        CREATE POLICY "Permitir upload de comprovantes para usuários autenticados" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'receipts');
    END IF;
END $$;
