import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { inviteUserFn, createUserDirectFn, updateUserFn, deleteUserFn } from "@/lib/api/users.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Edit2, ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/usuarios")({
  component: UsuariosPage,
  head: () => ({ meta: [{ title: "Usuários — Gestão Financeira" }] }),
});

function UsuariosPage() {
  const { hasRole, user, companies } = useAuth();
  const isAdmin = hasRole("super_admin");
  const qc = useQueryClient();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [editUser, setEditUser] = useState<any>(null);
  const [deleteConfirmUser, setDeleteConfirmUser] = useState<any>(null);

  const { data: profiles, isPending, isError, error } = useQuery({
    queryKey: ["admin_profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: isAdmin,
    retry: 0,
  });

  const { data: roles } = useQuery({
    queryKey: ["admin_roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("*");
      if (error) throw error;
      return data ?? [];
    },
    enabled: isAdmin,
  });

  const { data: members } = useQuery({
    queryKey: ["admin_members"],
    queryFn: async () => {
      const { data, error } = await supabase.from("company_members").select("*");
      if (error) throw error;
      return data ?? [];
    },
    enabled: isAdmin,
  });

  if (!isAdmin) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Acesso restrito a Super Admins.
      </div>
    );
  }

  const allProfiles = profiles ?? [];
  const allRoles = roles ?? [];
  const allMembers = members ?? [];

  const handleEdit = (profile: any) => {
    const roleRecord = allRoles.find(r => r.user_id === profile.id);
    const userMembers = allMembers.filter(m => m.user_id === profile.id).map(m => m.company_id);
    
    setEditUser({
      ...profile,
      role: roleRecord?.role ?? "financeiro",
      companyIds: userMembers
    });
  };

  const handleDelete = async () => {
    if (!deleteConfirmUser) return;
    try {
      await deleteUserFn({ data: { id: deleteConfirmUser.id } });
      toast.success("Usuário excluído com sucesso.");
      qc.invalidateQueries({ queryKey: ["admin_profiles"] });
      qc.invalidateQueries({ queryKey: ["admin_roles"] });
      qc.invalidateQueries({ queryKey: ["admin_members"] });
    } catch (err: any) {
      toast.error("Erro ao excluir", { description: err.message });
    } finally {
      setDeleteConfirmUser(null);
    }
  };

  const [headerNode, setHeaderNode] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setHeaderNode(document.getElementById("page-header"));
  }, []);

  return (
    <div className="space-y-6 max-w-[1200px] mx-auto">
      {headerNode && createPortal(
        <>
          <div className="flex flex-col">
            <h1 className="text-xl font-semibold tracking-tight leading-none">Usuários e Permissões</h1>
            <p className="text-xs text-muted-foreground mt-1">Gerencie o nível de acesso e o vínculo às empresas</p>
          </div>
          <Button size="sm" onClick={() => setInviteOpen(true)}><Plus className="size-4 mr-1"/> Novo Usuário</Button>
        </>,
        headerNode
      )}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-auto max-h-[calc(100vh-240px)]">
            <table className="w-full text-sm relative">
              <thead className="text-xs text-muted-foreground border-b sticky top-0 bg-card z-10 shadow-sm">
                <tr className="text-left">
                  <th className="py-3 px-4">Nome / Email</th>
                  <th className="py-3 px-4">Cargo</th>
                  <th className="py-3 px-4">Acesso às Empresas</th>
                  <th className="py-3 px-4 w-28"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {isError && <tr><td colSpan={4} className="py-8 text-center text-destructive">Erro: {error?.message}</td></tr>}
                {isPending && !isError && <tr><td colSpan={4} className="py-8 text-center text-muted-foreground">Carregando usuários...</td></tr>}
                {allProfiles.map(p => {
                  const role = allRoles.find(r => r.user_id === p.id)?.role ?? "financeiro";
                  const count = allMembers.filter(m => m.user_id === p.id).length;
                  return (
                    <tr key={p.id} className="hover:bg-accent/30">
                      <td className="py-3 px-4">
                        <div className="font-medium">{p.full_name || "Sem nome (Aguardando acesso)"}</div>
                        <div className="text-xs text-muted-foreground">{p.email}</div>
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant={role === "super_admin" ? "default" : "secondary"} className="capitalize font-normal">
                          {role.replace("_", " ")}
                        </Badge>
                      </td>
                      <td className="py-3 px-4">
                        {role === "super_admin" ? (
                          <span className="text-muted-foreground">Todas (Administrador)</span>
                        ) : (
                          <span>{count} empresa(s) vinculada(s)</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right space-x-1 flex justify-end">
                        <Button size="icon" variant="ghost" onClick={() => handleEdit(p)} title="Editar Acessos">
                          <Edit2 className="size-4 text-muted-foreground" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => setDeleteConfirmUser(p)} title="Excluir Usuário">
                          <Trash2 className="size-4 text-destructive opacity-70 hover:opacity-100" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
                {allProfiles.length === 0 && !isPending && (
                  <tr><td colSpan={4} className="py-8 text-center text-muted-foreground">Nenhum usuário encontrado.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {inviteOpen && <NewUserDialog onClose={() => setInviteOpen(false)} />}
      {editUser && <EditUserDialog user={editUser} companies={companies} onClose={() => setEditUser(null)} />}
      
      {deleteConfirmUser && (
        <Dialog open onOpenChange={() => setDeleteConfirmUser(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Excluir usuário</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground py-4">
              Tem certeza que deseja excluir o acesso de <b>{deleteConfirmUser.full_name || deleteConfirmUser.email}</b>? Esta ação não pode ser desfeita.
            </p>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setDeleteConfirmUser(null)}>Cancelar</Button>
              <Button variant="destructive" onClick={handleDelete}>Excluir</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function NewUserDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<"invite" | "create">("create");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"super_admin"|"financeiro"|"gestor"|"socio">("financeiro");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!email) return toast.error("Informe o e-mail.");
    if (mode === "create" && password.length < 6) return toast.error("A senha deve ter no mínimo 6 caracteres.");
    
    setLoading(true);
    try {
      if (mode === "invite") {
        await inviteUserFn({ data: { email, role } });
        toast.success("Convite enviado! O usuário receberá um e-mail.");
      } else {
        await createUserDirectFn({ data: { email, password, name, role } });
        toast.success("Usuário criado com sucesso!");
      }
      qc.invalidateQueries({ queryKey: ["admin_profiles"] });
      qc.invalidateQueries({ queryKey: ["admin_roles"] });
      onClose();
    } catch (err: any) {
      toast.error("Erro ao processar", { description: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Adicionar Usuário</DialogTitle></DialogHeader>
        
        <Tabs value={mode} onValueChange={(v: any) => setMode(v)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="create">Criar com Senha</TabsTrigger>
            <TabsTrigger value="invite">Enviar Convite</TabsTrigger>
          </TabsList>
          
          <div className="space-y-4 py-4 mt-2">
            <div className="space-y-1.5">
              <Label>E-mail</Label>
              <Input type="email" placeholder="email@exemplo.com" value={email} onChange={e => setEmail(e.target.value)} />
            </div>

            {mode === "create" && (
              <>
                <div className="space-y-1.5">
                  <Label>Nome Completo</Label>
                  <Input type="text" placeholder="Nome do funcionário" value={name} onChange={e => setName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Senha Inicial</Label>
                  <Input type="password" placeholder="Mínimo 6 caracteres" value={password} onChange={e => setPassword(e.target.value)} />
                </div>
              </>
            )}

            <div className="space-y-1.5 pt-2">
              <Label>Cargo inicial</Label>
              <Select value={role} onValueChange={(v: any) => setRole(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="financeiro">Financeiro</SelectItem>
                  <SelectItem value="gestor">Gestor</SelectItem>
                  <SelectItem value="socio">Sócio</SelectItem>
                  <SelectItem value="super_admin">Super Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {mode === "invite" && (
              <div className="p-3 bg-muted/50 rounded-md border text-xs flex gap-3 text-muted-foreground mt-4">
                <ShieldAlert className="size-6 shrink-0 text-primary" />
                <p>O sistema enviará um e-mail com um link mágico. Requer a variável SUPABASE_SERVICE_ROLE_KEY no .env.</p>
              </div>
            )}
          </div>
        </Tabs>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={loading}>{loading ? "Aguarde..." : mode === "create" ? "Criar Usuário" : "Enviar Convite"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditUserDialog({ user, companies, onClose }: { user: any, companies: any[], onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(user.full_name || "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState(user.role);
  const [selectedCompanies, setSelectedCompanies] = useState<string[]>(user.companyIds);
  const [saving, setSaving] = useState(false);

  const toggleCompany = (id: string, checked: boolean) => {
    setSelectedCompanies(prev => 
      checked ? [...prev, id] : prev.filter(c => c !== id)
    );
  };

  const submit = async () => {
    setSaving(true);
    try {
      // 1. Atualizar dados pessoais via Server Function
      if (name !== user.full_name || password) {
        await updateUserFn({ data: { id: user.id, name, password: password || undefined } });
      }

      // 2. Atualizar cargo
      if (role !== user.role) {
        await supabase.from("user_roles").update({ role }).eq("user_id", user.id);
      }
      
      // 3. Atualizar clínicas
      await supabase.from("company_members").delete().eq("user_id", user.id);
      
      if (selectedCompanies.length > 0 && role !== "super_admin") {
        const inserts = selectedCompanies.map(cid => ({ company_id: cid, user_id: user.id }));
        await supabase.from("company_members").insert(inserts);
      }

      toast.success("Dados e acessos atualizados!");
      qc.invalidateQueries({ queryKey: ["admin_profiles"] });
      qc.invalidateQueries({ queryKey: ["admin_roles"] });
      qc.invalidateQueries({ queryKey: ["admin_members"] });
      onClose();
    } catch (err: any) {
      toast.error("Erro", { description: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Usuário</DialogTitle>
          <p className="text-sm text-muted-foreground">{user.email}</p>
        </DialogHeader>
        
        <div className="space-y-5 py-2">
          {/* Dados Pessoais */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-foreground border-b pb-1">Dados Pessoais</h4>
            <div className="space-y-1.5">
              <Label>Nome Completo</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: João da Silva" />
            </div>
            <div className="space-y-1.5">
              <Label>Nova Senha (opcional)</Label>
              <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Deixe em branco para não alterar" />
            </div>
          </div>

          {/* Acessos */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-foreground border-b pb-1">Permissões de Acesso</h4>
            <div className="space-y-1.5">
              <Label>Cargo no Sistema</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="financeiro">Financeiro (Operacional)</SelectItem>
                  <SelectItem value="gestor">Gestor (Relatórios)</SelectItem>
                  <SelectItem value="socio">Sócio (Leitura e Receitas)</SelectItem>
                  <SelectItem value="super_admin">Super Admin (Acesso Total)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {role !== "super_admin" && (
              <div className="space-y-3 pt-2">
                <Label>Vincular às Empresas / Contas</Label>
                <div className="space-y-2 max-h-[160px] overflow-y-auto border rounded-md p-3">
                  {companies.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma empresa criada ainda.</p>}
                  {companies.map(c => (
                    <div key={c.id} className="flex items-center space-x-2">
                      <Checkbox 
                        id={`c-${c.id}`} 
                        checked={selectedCompanies.includes(c.id)}
                        onCheckedChange={(checked) => toggleCompany(c.id, checked as boolean)}
                      />
                      <label htmlFor={`c-${c.id}`} className="text-sm cursor-pointer leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                        {c.name}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {role === "super_admin" && (
              <div className="text-sm text-muted-foreground p-3 bg-muted/30 rounded border mt-2">
                Super Admins têm acesso automático a todas as empresas criadas no sistema.
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Salvando..." : "Salvar Alterações"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
