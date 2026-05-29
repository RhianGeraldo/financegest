-- Adiciona a coluna paid_by para registrar quem deu a baixa na transação
ALTER TABLE public.transactions ADD COLUMN paid_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
