
## Observação importante sobre a stack

Você pediu **Next.js**, mas este projeto Lovable roda em **TanStack Start + React 19 + Vite** (full-stack, SSR, server functions). Funcionalmente entrega o mesmo que Next.js (rotas, SSR, API/server actions, deploy edge) e é a stack oficial suportada aqui — Next.js não é. Demais itens batem: **TypeScript, TailwindCSS, shadcn/ui, Supabase (Postgres + Auth)** via Lovable Cloud.

Se você concordar, sigo com TanStack Start. Caso contrário, este projeto não é o lugar certo.

## Escopo do MVP (V1)

Tudo do seu brief está dentro do escopo, organizado em fases para entregar rápido e com qualidade. Relatórios em PDF/Excel e dark mode entram na Fase 3 para não atrasar o núcleo financeiro.

### Fase 1 — Fundação
1. Ativar Lovable Cloud (Supabase: Postgres + Auth + Storage).
2. Schema SQL completo com RLS multiempresa:
   - `companies`, `company_members` (vínculo user↔empresa)
   - `user_roles` (`super_admin`, `financeiro`, `gestor`, `socio`) em tabela separada + função `has_role` security definer
   - `bank_accounts`, `categories` (receita/despesa), `cost_centers`
   - `transactions` (tipo, valor, vencimento, pagamento, status pendente/pago/atrasado, conta, categoria, centro de custo, empresa)
   - View/trigger para saldo de conta e status "atrasado" automático
   - GRANTs corretos + policies via `has_role` e `company_members` (sem recursão)
3. Design system premium (tokens oklch em `src/styles.css`): paleta corporativa escura/clara, tipografia, componentes shadcn customizados (botões, cards, tabela, badges de status).
4. Auth (email/senha + Google), guarda de rota `_authenticated`, trigger de criação de perfil.
5. Layout app: sidebar colapsável, seletor de empresa (com opção "Consolidado"), topbar com usuário.

### Fase 2 — Núcleo financeiro
6. CRUD **Transações** (tabela com filtros, busca, paginação, máscara monetária, validação Zod, toasts).
7. CRUD **Contas bancárias** (com saldo calculado).
8. CRUD **Categorias** e **Centros de custo**.
9. Telas **Contas a pagar** e **Contas a receber** (views filtradas com alerta de vencimento).
10. **Dashboard executivo**: cards (saldo, entradas, saídas, lucro, a pagar, a receber), gráficos (fluxo de caixa, despesas/receitas por categoria, evolução mensal) com Recharts, últimas transações, próximos vencimentos, filtro empresa/período.
11. **Dashboard consolidado** somando todas as empresas que o usuário pode ver.

### Fase 3 — Relatórios e polimento
12. Relatórios (fluxo de caixa, despesas, receitas, por categoria, por centro de custo).
13. Exportação **Excel** (xlsx) e **PDF** (jsPDF).
14. Dark mode, animações finais (framer-motion), empty states, loading skeletons.
15. **Seed** de demonstração: 5 clínicas + 2 financeiros pessoais, contas bancárias, categorias/centros padrão, ~80 transações distribuídas em 3 meses.

### Preparado para o futuro (sem implementar)
- Tabela `external_accounts` reservada para Open Finance.
- Estrutura de eventos/auditoria para alimentar assistente IA (Lovable AI Gateway) depois.

## Detalhes técnicos

- **Multiempresa via RLS**: toda tabela de domínio tem `company_id`; policies cruzam `company_members` para liberar leitura/escrita. `super_admin` ignora o filtro via `has_role`.
- **Status atrasado**: campo computado no SELECT (`CASE WHEN status='pendente' AND due_date < now() ...`) — evita job.
- **Saldo conta**: `saldo_inicial + SUM(transações pagas)` via view materializada leve ou função.
- **Server functions** (`createServerFn` + `requireSupabaseAuth`) para queries pesadas do dashboard e relatórios; CRUDs simples usam o client Supabase direto com RLS.
- **Validações** com `zod` + `react-hook-form`; máscara BRL via `Intl.NumberFormat`.

## Confirmação que preciso antes de começar

1. **OK seguir com TanStack Start** no lugar de Next.js?
2. **Login**: email/senha **+** Google (recomendado), ou só email/senha?
3. **Seed**: pode popular com dados fictícios de demonstração das 5 clínicas + 2 sócios?

Confirmando esses 3 pontos, começo pela Fase 1 imediatamente.
