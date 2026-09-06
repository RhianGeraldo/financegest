-- Adiciona a coluna invoice_url para armazenar o link do boleto/fatura/documento da transação
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS invoice_url TEXT;

COMMENT ON COLUMN public.transactions.invoice_url IS 'URL do boleto, fatura, nota fiscal ou documento de cobrança associado à transação';
