import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { createMcpKeyFn, listMcpKeysFn, revokeMcpKeyFn } from "@/lib/api/mcp.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Bot,
  Key,
  Plus,
  Copy,
  Check,
  ShieldCheck,
  Ban,
  RefreshCw,
  Cpu,
  Sparkles,
  Globe,
  FileCode,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Link as LinkIcon,
} from "lucide-react";
import { toast } from "sonner";
import { formatDate, formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/mcp")({
  component: McpConfigPage,
  head: () => ({ meta: [{ title: "Agentes & Chaves MCP — Gestão Financeira" }] }),
});

function getHttpMcpConfigSnippet(serverUrl: string, apiKey = "fg_live_SUA_CHAVE_AQUI") {
  return JSON.stringify(
    {
      mcpServers: {
        financegest: {
          serverUrl: `${serverUrl}/api/mcp`,
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        },
      },
    },
    null,
    2
  );
}

function McpConfigPage() {
  const { user, companies, hasRole } = useAuth();
  const isAdmin = hasRole("super_admin");
  const qc = useQueryClient();

  const [headerNode, setHeaderNode] = useState<HTMLElement | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<string[]>([]);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [autoIncludeNewAccounts, setAutoIncludeNewAccounts] = useState(true);
  const [createdKeyData, setCreatedKeyData] = useState<{ name: string; apiKey: string } | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showHowToConnect, setShowHowToConnect] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [originUrl, setOriginUrl] = useState("https://financegest.vercel.app");

  useEffect(() => {
    setHeaderNode(document.getElementById("page-header"));
    if (typeof window !== "undefined") {
      setOriginUrl(window.location.origin);
    }
  }, []);

  const mcpServerUrl = `${originUrl}/api/mcp`;

  const { data: bankAccounts = [] } = useQuery({
    queryKey: ["all_bank_accounts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_accounts")
        .select("id, company_id, bank, name, active")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: apiKeys = [], isLoading: loadingKeys, refetch } = useQuery({
    queryKey: ["mcp_api_keys", user?.id],
    queryFn: async () => {
      const res = await listMcpKeysFn({ data: { userId: isAdmin ? undefined : user?.id } });
      return res || [];
    },
    enabled: !!user,
  });

  const userCompanies = companies;

  const toggleCompany = (companyId: string) => {
    const isSelected = selectedCompanyIds.includes(companyId);
    let nextCompanies: string[];

    if (isSelected) {
      nextCompanies = selectedCompanyIds.filter((id) => id !== companyId);
      const companyAccountIds = bankAccounts.filter((a) => a.company_id === companyId).map((a) => a.id);
      setSelectedAccountIds((prev) => prev.filter((id) => !companyAccountIds.includes(id)));
    } else {
      nextCompanies = [...selectedCompanyIds, companyId];
      const companyAccountIds = bankAccounts.filter((a) => a.company_id === companyId).map((a) => a.id);
      setSelectedAccountIds((prev) => Array.from(new Set([...prev, ...companyAccountIds])));
    }

    setSelectedCompanyIds(nextCompanies);
  };

  const toggleAccount = (accountId: string, companyId: string) => {
    if (selectedAccountIds.includes(accountId)) {
      setSelectedAccountIds((prev) => prev.filter((id) => id !== accountId));
    } else {
      setSelectedAccountIds((prev) => [...prev, accountId]);
      if (!selectedCompanyIds.includes(companyId)) {
        setSelectedCompanyIds((prev) => [...prev, companyId]);
      }
    }
  };

  const handleCreate = async () => {
    if (!keyName.trim()) {
      toast.error("Informe um nome para a chave.");
      return;
    }
    if (selectedCompanyIds.length === 0) {
      toast.error("Selecione ao menos uma empresa.");
      return;
    }
    if (selectedAccountIds.length === 0 && !autoIncludeNewAccounts) {
      toast.error("Selecione ao menos uma conta bancária.");
      return;
    }
    if (!user) return;

    try {
      setIsSubmitting(true);
      const res = await createMcpKeyFn({
        data: {
          userId: user.id,
          name: keyName.trim(),
          allowedCompanyIds: selectedCompanyIds,
          allowedBankAccountIds: selectedAccountIds,
          autoIncludeNewAccounts,
        },
      });

      setCreatedKeyData({
        name: res.name,
        apiKey: res.apiKey,
      });

      toast.success("Chave de API gerada com sucesso!");
      qc.invalidateQueries({ queryKey: ["mcp_api_keys"] });
      setKeyName("");
      setSelectedCompanyIds([]);
      setSelectedAccountIds([]);
      setAutoIncludeNewAccounts(true);
    } catch (e: any) {
      toast.error("Erro ao criar chave", { description: e.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRevoke = async (keyId: string) => {
    try {
      await revokeMcpKeyFn({ data: { keyId } });
      toast.success("Chave revogada com sucesso.");
      qc.invalidateQueries({ queryKey: ["mcp_api_keys"] });
    } catch (e: any) {
      toast.error("Erro ao revogar chave", { description: e.message });
    }
  };

  const copyToClipboard = (text: string, id: string = "default") => {
    navigator.clipboard.writeText(text);
    setCopiedKey(id);
    toast.success("Copiado para a área de transferência!");
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const companyMap = new Map(companies.map((c) => [c.id, c.name]));
  const accountMap = new Map(bankAccounts.map((a) => [a.id, `${a.name} (${a.bank})`]));

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      {headerNode &&
        createPortal(
          <div className="flex flex-col">
            <h1 className="text-xl font-semibold tracking-tight leading-none">Agentes & Chaves MCP</h1>
            <p className="text-xs text-muted-foreground mt-1">
              Link de conexão de produção e controle de acesso granular por empresas e contas
            </p>
          </div>,
          headerNode
        )}

      {/* Card Principal com o Link do MCP em Destaque */}
      <Card className="border border-primary/20 bg-primary/5 shadow-2xs">
        <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="size-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shrink-0 shadow-sm">
              <Globe className="size-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                Endpoint MCP em Produção
                <Badge variant="outline" className="text-[10px] bg-background text-emerald-600 border-emerald-300">
                  Online (HTTP / SSE)
                </Badge>
              </h2>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span className="text-xs text-muted-foreground">URL de Conexão:</span>
                <code className="bg-background px-2 py-0.5 rounded border font-mono text-xs text-primary font-medium select-all">
                  {mcpServerUrl}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 text-[11px] px-2 cursor-pointer bg-background"
                  onClick={() => copyToClipboard(mcpServerUrl, "urlTop")}
                >
                  {copiedKey === "urlTop" ? <Check className="size-3 text-emerald-600 mr-1" /> : <Copy className="size-3 mr-1" />}
                  Copiar Link
                </Button>
                <a
                  href={mcpServerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1 hover:underline ml-1"
                >
                  <ExternalLink className="size-3" /> Testar no navegador
                </a>
              </div>
            </div>
          </div>

          <Dialog
            open={createOpen}
            onOpenChange={(v) => {
              setCreateOpen(v);
              if (!v) setCreatedKeyData(null);
            }}
          >
            <DialogTrigger asChild>
              <Button size="sm" className="shrink-0 shadow-sm cursor-pointer">
                <Plus className="size-4 mr-1.5" /> Nova Chave MCP
              </Button>
            </DialogTrigger>

            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              {createdKeyData ? (
                <div className="space-y-4 py-2">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-emerald-600">
                      <ShieldCheck className="size-5" /> Chave Gerada com Sucesso!
                    </DialogTitle>
                    <DialogDescription>
                      Esta chave foi configurada com acesso restrito às empresas e contas selecionadas. Guarde-a agora em local
                      seguro.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-2">
                    <Label className="text-xs font-semibold">Chave de API:</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        readOnly
                        value={createdKeyData.apiKey}
                        className="font-mono text-xs bg-muted select-all"
                      />
                      <Button
                        size="icon"
                        variant="outline"
                        className="shrink-0 cursor-pointer"
                        onClick={() => copyToClipboard(createdKeyData.apiKey, "newKey")}
                      >
                        {copiedKey === "newKey" ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
                      </Button>
                    </div>
                  </div>

                  <div className="p-3 bg-muted/50 rounded-lg border text-xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-foreground flex items-center gap-1.5">
                        <FileCode className="size-3.5 text-primary" /> Configuração Pronta (Produção):
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-[10px] px-2"
                        onClick={() =>
                          copyToClipboard(getHttpMcpConfigSnippet(originUrl, createdKeyData.apiKey), "newSnippet")
                        }
                      >
                        {copiedKey === "newSnippet" ? "Copiado!" : "Copiar Config"}
                      </Button>
                    </div>
                    <pre className="p-2 bg-background rounded border text-[11px] overflow-x-auto text-primary font-mono leading-relaxed">
{getHttpMcpConfigSnippet(originUrl, createdKeyData.apiKey)}
                    </pre>
                  </div>

                  <DialogFooter>
                    <Button onClick={() => setCreateOpen(false)} className="w-full">
                      Entendido e Copiado
                    </Button>
                  </DialogFooter>
                </div>
              ) : (
                <div className="space-y-4 py-1">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <Key className="size-4 text-primary" /> Nova Chave de API MCP
                    </DialogTitle>
                    <DialogDescription>
                      Dê um nome e selecione quais clínicas/empresas e contas bancárias esta chave poderá acessar.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-2">
                    <Label htmlFor="key-name">Nome da Chave / Identificação</Label>
                    <Input
                      id="key-name"
                      placeholder="Ex: Robô Aracruz, Agente Linhares, Conciliador..."
                      value={keyName}
                      onChange={(e) => setKeyName(e.target.value)}
                    />
                  </div>

                  {/* Auto-inclusão de novas contas */}
                  <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg flex items-start gap-2.5">
                    <Checkbox
                      id="auto-new-accounts"
                      checked={autoIncludeNewAccounts}
                      onCheckedChange={(c) => setAutoIncludeNewAccounts(!!c)}
                      className="mt-0.5"
                    />
                    <label htmlFor="auto-new-accounts" className="text-xs cursor-pointer select-none space-y-0.5">
                      <span className="font-semibold text-foreground flex items-center gap-1.5">
                        <Sparkles className="size-3.5 text-primary" /> Auto-incluir novas contas adicionadas futuramente
                      </span>
                      <p className="text-muted-foreground text-[11px] leading-relaxed">
                        Se novas contas bancárias forem criadas no FinanceGest para as empresas selecionadas, esta chave
                        terá acesso a elas automaticamente sem precisar recriar a chave.
                      </p>
                    </label>
                  </div>

                  {/* Seleção de Empresas e Contas */}
                  <div className="space-y-3 pt-1">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block">
                      Empresas e Contas Bancárias Autorizadas:
                    </Label>

                    <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                      {userCompanies.map((comp) => {
                        const compAccounts = bankAccounts.filter((a) => a.company_id === comp.id);
                        const isCompChecked = selectedCompanyIds.includes(comp.id);

                        return (
                          <div key={comp.id} className="border rounded-lg p-3 bg-card shadow-2xs space-y-2">
                            <div className="flex items-center justify-between">
                              <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer select-none">
                                <Checkbox
                                  checked={isCompChecked}
                                  onCheckedChange={() => toggleCompany(comp.id)}
                                />
                                <span>{comp.name}</span>
                                <Badge variant="outline" className="text-[10px] uppercase font-mono">
                                  {comp.kind}
                                </Badge>
                              </label>
                              <span className="text-[11px] text-muted-foreground">
                                {compAccounts.length} {compAccounts.length === 1 ? "conta" : "contas"}
                              </span>
                            </div>

                            {compAccounts.length > 0 ? (
                              <div className="pl-6 pt-1 space-y-1.5 border-t mt-2">
                                {compAccounts.map((acc) => {
                                  const isAccChecked = selectedAccountIds.includes(acc.id);
                                  return (
                                    <label
                                      key={acc.id}
                                      className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer select-none py-0.5"
                                    >
                                      <Checkbox
                                        checked={isAccChecked}
                                        onCheckedChange={() => toggleAccount(acc.id, comp.id)}
                                      />
                                      <span className="font-medium">{acc.name}</span>
                                      <span className="text-[10px] opacity-70">({acc.bank})</span>
                                    </label>
                                  );
                                })}
                              </div>
                            ) : (
                              <p className="text-[11px] text-muted-foreground pl-6 pt-1">
                                Nenhuma conta cadastrada no momento (novas contas serão integradas automaticamente).
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <DialogFooter className="pt-2">
                    <Button variant="outline" onClick={() => setCreateOpen(false)}>
                      Cancelar
                    </Button>
                    <Button onClick={handleCreate} disabled={isSubmitting}>
                      {isSubmitting ? "Gerando..." : "Gerar Chave de API"}
                    </Button>
                  </DialogFooter>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

      {/* GUIA DE CONEXÃO COM LINK DE PRODUÇÃO */}
      <Card className="border shadow-2xs bg-card">
        <CardHeader className="p-4 sm:p-5 border-b pb-3 flex flex-row items-center justify-between space-y-0">
          <div className="space-y-0.5">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <LinkIcon className="size-4 text-primary" /> Como se Conectar em Produção (serverUrl)
            </CardTitle>
            <CardDescription className="text-xs">
              Conecte qualquer agente (Antigravity, Cursor, Claude Desktop, AtendiAI, Lovable) diretamente pelo Link HTTP/SSE
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs"
            onClick={() => setShowHowToConnect(!showHowToConnect)}
          >
            {showHowToConnect ? (
              <>
                <ChevronUp className="size-3.5 mr-1" /> Ocultar
              </>
            ) : (
              <>
                <ChevronDown className="size-3.5 mr-1" /> Ver Guia
              </>
            )}
          </Button>
        </CardHeader>

        {showHowToConnect && (
          <CardContent className="p-4 sm:p-5 space-y-4">
            <div className="p-3 bg-muted/40 rounded-lg border space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                  <Globe className="size-3.5 text-primary" /> Link do Servidor MCP:
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-[11px] px-2 text-primary"
                  onClick={() => copyToClipboard(mcpServerUrl, "boxUrl")}
                >
                  {copiedKey === "boxUrl" ? "Copiado!" : "Copiar URL"}
                </Button>
              </div>
              <code className="block bg-background p-2 rounded border font-mono text-xs select-all text-primary">
                {mcpServerUrl}
              </code>
              <p className="text-[11px] text-muted-foreground">
                Este endpoint aceita requisições HTTP e streaming SSE. Ele pode ser acessado de qualquer lugar pelo seu agente de IA.
              </p>
            </div>

            <Tabs defaultValue="antigravity" className="w-full">
              <TabsList className="grid grid-cols-3 h-8 text-xs">
                <TabsTrigger value="antigravity" className="text-xs py-1">
                  Google Antigravity
                </TabsTrigger>
                <TabsTrigger value="cursor" className="text-xs py-1">
                  Cursor / Cline
                </TabsTrigger>
                <TabsTrigger value="claude" className="text-xs py-1">
                  Claude Desktop
                </TabsTrigger>
              </TabsList>

              <TabsContent value="antigravity" className="space-y-2.5 pt-2 text-xs">
                <p className="text-muted-foreground">
                  Cole no seu arquivo de configuração{" "}
                  <code className="bg-muted px-1.5 py-0.5 rounded border font-mono text-[11px]">
                    mcp_config.json
                  </code>{" "}
                  do Antigravity:
                </p>
                <div className="relative">
                  <pre className="p-3 bg-muted/60 rounded-lg border text-[11px] font-mono overflow-x-auto text-foreground leading-relaxed">
{getHttpMcpConfigSnippet(originUrl)}
                  </pre>
                  <Button
                    size="sm"
                    variant="outline"
                    className="absolute top-2 right-2 h-7 text-xs bg-background shadow-xs cursor-pointer"
                    onClick={() => copyToClipboard(getHttpMcpConfigSnippet(originUrl), "tabSnippet")}
                  >
                    {copiedKey === "tabSnippet" ? <Check className="size-3 text-emerald-600 mr-1" /> : <Copy className="size-3 mr-1" />}
                    Copiar JSON
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="cursor" className="space-y-2.5 pt-2 text-xs">
                <p className="text-muted-foreground">
                  No Cursor, vá em <strong>Settings &gt; Features &gt; MCP</strong> ou cole no seu{" "}
                  <code className="bg-muted px-1.5 py-0.5 rounded border font-mono text-[11px]">
                    mcp.json
                  </code>:
                </p>
                <div className="relative">
                  <pre className="p-3 bg-muted/60 rounded-lg border text-[11px] font-mono overflow-x-auto text-foreground leading-relaxed">
{getHttpMcpConfigSnippet(originUrl)}
                  </pre>
                  <Button
                    size="sm"
                    variant="outline"
                    className="absolute top-2 right-2 h-7 text-xs bg-background shadow-xs cursor-pointer"
                    onClick={() => copyToClipboard(getHttpMcpConfigSnippet(originUrl), "cursorSnippet")}
                  >
                    {copiedKey === "cursorSnippet" ? <Check className="size-3 text-emerald-600 mr-1" /> : <Copy className="size-3 mr-1" />}
                    Copiar JSON
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="claude" className="space-y-2.5 pt-2 text-xs">
                <p className="text-muted-foreground">
                  No Claude Desktop, insira em{" "}
                  <code className="bg-muted px-1.5 py-0.5 rounded border font-mono text-[11px]">
                    claude_desktop_config.json
                  </code>:
                </p>
                <div className="relative">
                  <pre className="p-3 bg-muted/60 rounded-lg border text-[11px] font-mono overflow-x-auto text-foreground leading-relaxed">
{getHttpMcpConfigSnippet(originUrl)}
                  </pre>
                  <Button
                    size="sm"
                    variant="outline"
                    className="absolute top-2 right-2 h-7 text-xs bg-background shadow-xs cursor-pointer"
                    onClick={() => copyToClipboard(getHttpMcpConfigSnippet(originUrl), "claudeSnippet")}
                  >
                    {copiedKey === "claudeSnippet" ? <Check className="size-3 text-emerald-600 mr-1" /> : <Copy className="size-3 mr-1" />}
                    Copiar JSON
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        )}
      </Card>

      {/* Lista de Chaves Ativas */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-tight flex items-center gap-2">
            <Key className="size-4 text-muted-foreground" /> Suas Chaves de API Cadastradas
            <Badge variant="secondary" className="text-xs">
              {apiKeys.length}
            </Badge>
          </h2>

          <Button variant="ghost" size="sm" onClick={() => refetch()} className="text-xs h-8">
            <RefreshCw className="size-3.5 mr-1" /> Atualizar
          </Button>
        </div>

        {loadingKeys ? (
          <div className="space-y-2">
            <div className="h-20 bg-muted animate-pulse rounded-xl" />
            <div className="h-20 bg-muted animate-pulse rounded-xl" />
          </div>
        ) : apiKeys.length === 0 ? (
          <Card className="border-dashed bg-card/50">
            <CardContent className="p-8 text-center space-y-2">
              <Cpu className="size-8 mx-auto text-muted-foreground opacity-50" />
              <p className="text-sm font-medium text-foreground">Nenhuma chave de API criada</p>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Crie sua primeira chave de API para permitir que agentes de IA acessem com segurança as contas bancárias selecionadas.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {apiKeys.map((k: any) => {
              const compNames = k.allowedCompanyIds.map((cid: string) => companyMap.get(cid) || "Unidade").filter(Boolean);
              const accNames = k.allowedBankAccountIds.map((aid: string) => accountMap.get(aid) || "Conta").filter(Boolean);

              return (
                <Card key={k.id} className="border shadow-2xs hover:border-primary/30 transition-colors">
                  <CardContent className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-2 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-foreground">{k.name}</span>
                        {k.active ? (
                          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">
                            Ativa
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-muted text-muted-foreground text-[10px]">
                            Revogada
                          </Badge>
                        )}
                        {k.autoIncludeNewAccounts !== false && (
                          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[10px] flex items-center gap-1">
                            <Sparkles className="size-2.5" /> Auto-inclui novas contas
                          </Badge>
                        )}
                        <code className="text-[11px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          {k.keyMasked}
                        </code>
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">Empresas:</span>
                        {compNames.length > 0 ? (
                          compNames.map((cn: string) => (
                            <Badge key={cn} variant="secondary" className="text-[11px] font-normal">
                              {cn}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-muted-foreground italic">Todas</span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">Contas:</span>
                        {accNames.slice(0, 3).map((an: string) => (
                          <span key={an} className="bg-muted/80 text-[11px] px-2 py-0.5 rounded border">
                            {an}
                          </span>
                        ))}
                        {accNames.length > 3 && (
                          <span className="text-[11px] text-muted-foreground">+{accNames.length - 3} outras</span>
                        )}
                        {k.autoIncludeNewAccounts !== false && (
                          <span className="text-[11px] text-blue-600 dark:text-blue-400 font-medium italic">
                            (+ quaisquer novas contas adicionadas a estas empresas)
                          </span>
                        )}
                      </div>

                      <div className="text-[11px] text-muted-foreground">
                        Criada em {formatDate(k.createdAt)}
                        {k.lastUsedAt && ` • Último uso: ${formatDateTime(k.lastUsedAt)}`}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {k.active && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="outline" size="sm" className="text-destructive hover:bg-destructive/10 shrink-0 cursor-pointer">
                              <Ban className="size-3.5 mr-1" /> Revogar
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Revogar chave "{k.name}"?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Agentes de IA configurados com esta chave perderão imediatamente o acesso a todas as operações. Esta ação é irreversível.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleRevoke(k.id)}
                                className="bg-destructive hover:bg-destructive/90 text-white"
                              >
                                Confirmar Revogação
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
