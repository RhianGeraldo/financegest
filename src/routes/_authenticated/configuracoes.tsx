import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/lib/auth";
import { CompanySwitcher } from "@/components/company-switcher";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Landmark,
  Tags,
  Building,
  Building2,
  Users,
  LogOut,
  ChevronRight,
  UserCircle
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  component: ConfiguracoesPage,
  head: () => ({ meta: [{ title: "Configurações — Gestão Financeira" }] }),
});

function ConfiguracoesPage() {
  const { user, signOut, hasRole } = useAuth();
  const isAdmin = hasRole("super_admin");
  const [headerNode, setHeaderNode] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setHeaderNode(document.getElementById("page-header"));
  }, []);

  const cadastros = [
    { title: "Contas bancárias", url: "/contas", icon: Landmark, color: "text-blue-500", bg: "bg-blue-500/10" },
    { title: "Categorias", url: "/categorias", icon: Tags, color: "text-amber-500", bg: "bg-amber-500/10" },
    { title: "Centros de custo", url: "/centros-custo", icon: Building, color: "text-emerald-500", bg: "bg-emerald-500/10" },
  ];

  const adminMenu = [
    { title: "Empresas", url: "/empresas", icon: Building2, color: "text-purple-500", bg: "bg-purple-500/10" },
    { title: "Usuários", url: "/usuarios", icon: Users, color: "text-rose-500", bg: "bg-rose-500/10" },
  ];

  return (
    <div className="space-y-6 max-w-2xl mx-auto pb-6">
      {headerNode && createPortal(
        <div className="flex flex-col">
          <h1 className="text-xl font-semibold tracking-tight leading-none">Ajustes</h1>
          <p className="text-xs text-muted-foreground mt-1">Configurações e Cadastros</p>
        </div>,
        headerNode
      )}

      {/* Perfil & Sessão */}
      <Card className="border-none shadow-sm bg-accent/50">
        <CardContent className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-full bg-primary/10 text-primary flex items-center justify-center">
              <UserCircle className="size-6" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold truncate">{user?.email}</span>
              <span className="text-xs text-muted-foreground">{isAdmin ? "Super Admin" : "Usuário"}</span>
            </div>
          </div>
          <Button variant="outline" size="sm" className="text-destructive border-destructive/20 hover:bg-destructive/10" onClick={signOut}>
            <LogOut className="size-4 mr-1.5" /> Sair
          </Button>
        </CardContent>
      </Card>

      {/* Escopo de Dados (Empresa) */}
      <div className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">Escopo de Dados</h2>
        <div className="bg-card border rounded-xl p-2 shadow-sm">
          <CompanySwitcher />
        </div>
      </div>

      {/* Cadastros */}
      <div className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">Cadastros Básicos</h2>
        <Card className="shadow-sm overflow-hidden">
          <CardContent className="p-0 flex flex-col">
            {cadastros.map((item, i) => (
              <Link 
                key={item.url} 
                to={item.url}
                className={`flex items-center justify-between p-4 hover:bg-accent/50 active:bg-accent transition-colors ${i !== cadastros.length - 1 ? 'border-b' : ''}`}
              >
                <div className="flex items-center gap-3">
                  <div className={`size-8 rounded-md flex items-center justify-center ${item.bg} ${item.color}`}>
                    <item.icon className="size-4" />
                  </div>
                  <span className="text-sm font-medium">{item.title}</span>
                </div>
                <ChevronRight className="size-4 text-muted-foreground opacity-50" />
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Admin */}
      {isAdmin && (
        <div className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">Administração</h2>
          <Card className="shadow-sm overflow-hidden border-primary/20">
            <CardContent className="p-0 flex flex-col">
              {adminMenu.map((item, i) => (
                <Link 
                  key={item.url} 
                  to={item.url}
                  className={`flex items-center justify-between p-4 hover:bg-accent/50 active:bg-accent transition-colors ${i !== adminMenu.length - 1 ? 'border-b' : ''}`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`size-8 rounded-md flex items-center justify-center ${item.bg} ${item.color}`}>
                      <item.icon className="size-4" />
                    </div>
                    <span className="text-sm font-medium">{item.title}</span>
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground opacity-50" />
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
