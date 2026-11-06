# FinanceGest MCP Server

Servidor MCP (Model Context Protocol) oficial para o **FinanceGest**, permitindo controle financeiro total via agentes de IA com **controle de acesso baseado em API Keys e escopo granular por empresa e contas bancárias**.

---

## 🔑 Segurança e Escopo por Usuário e Contas Bancárias

Cada usuário do FinanceGest pode criar chaves de API restritas exclusivamente às empresas e contas bancárias que ele possui acesso no sistema:
* **Escopo Restrito:** A API Key só permite consultar, movimentar e conciliar as contas e empresas selecionadas no momento da sua geração.
* **Bloqueio Automático:** Qualquer tentativa de lançar ou consultar contas de outras unidades ou finanças pessoais não autorizadas é sumariamente rejeitada.
* **Rastreabilidade Automática:** Lançamentos e liquidações efetuados pela IA com a chave gravam automaticamente o `user_id` do criador nos campos `created_by` e `paid_by`.

---

## 🛠️ Ferramentas Disponíveis (19 Tools)

### 1. Autenticação e Chaves de API
* `criar_api_key`: Gera uma nova API Key vinculada a um usuário, selecionando as empresas e contas bancárias liberadas.
* `listar_api_keys`: Lista as API Keys cadastradas e seus escopos.
* `revogar_api_key`: Desativa imediatamente uma API Key.
* `consultar_escopo_usuario`: Consulta quais empresas e contas um determinado usuário pode selecionar.

### 2. Empresas e Contas Bancárias
* `listar_empresas`: Lista as empresas e clínicas cadastradas (filtradas pelo escopo da chave).
* `listar_contas_bancarias`: Lista contas bancárias ativas e seus saldos calculados.
* `resolver_conta_e_empresa`: Valida se uma conta bancária ou empresa é válida e autorizada.

### 3. Lançamentos Financeiros (Transações)
* `lancar_transacao`: Cria receitas ou despesas com valor, vencimento, categoria, conta, parcelas e anexo de boleto.
* `marcar_como_pago`: Dá baixa bancária, definindo data, conta liquidada e upload do comprovante.
* `estornar_pagamento`: Reverte o status de uma transação paga para pendente.
* `editar_transacao`: Altera dados de lançamentos existentes.
* `excluir_transacao`: Exclui transações do sistema.
* `consultar_transacoes`: Filtro completo por período, status, tipo, empresa e conta.

### 4. Documentos e Anexos
* `anexar_documento`: Faz upload de boletos (`invoice`) ou comprovantes (`receipt`) no bucket `receipts` do Supabase Storage.

### 5. Conciliação Bancária e Auditoria
* `relatorio_saldos_contas`: Exibe o balanço contábil por conta e consolidado.
* `conciliar_extrato`: Cruza linhas de extrato bancário contra pendências no sistema com suporte a auto-baixa.
* `listar_transacoes_sem_comprovante`: Auditoria de contas pagas sem comprovante anexado.
* `listar_contas_atrasadas`: Lista contas vencidas com contagem de dias em atraso.

### 6. Relatórios e Classificação
* `resumo_financeiro`: DRE executivo com receitas, despesas, lucro líquido e previsões.
* `listar_categorias_e_centros`: Lista categorias e centros de custo ativos para apoiar a classificação.

---

## ⚙️ Configuração no Antigravity (`mcp_config.json`)

Para configurar um agente com uma chave de escopo restrito (ex: apenas Clínica Aracruz):

```json
{
  "mcpServers": {
    "financegest": {
      "command": "node",
      "args": [
        "/home/rhiangeraldo/Desenvolvimentos/financegest/mcp-server/dist/index.js"
      ],
      "env": {
        "FINANCEGEST_API_KEY": "fg_live_aracruz_..."
      }
    }
  }
}
```

* Se `FINANCEGEST_API_KEY` for omitida ou `"master"`, o servidor opera em modo Master Admin.
* Se informada, todas as ações do MCP ficam estritamente limitadas às contas selecionadas pelo usuário.
