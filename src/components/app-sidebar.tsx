import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  ArrowLeftRight,
  Landmark,
  Tags,
  Building2,
  FolderTree,
  Wallet,
  LogOut,
  Users,
  BarChart3,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useAuth } from "@/lib/auth";
import { CompanySwitcher } from "./company-switcher";
import { Button } from "./ui/button";

const main = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Transações", url: "/transacoes", icon: ArrowLeftRight },
  { title: "Relatórios", url: "/relatorios", icon: BarChart3 },
];
const cadastros = [
  { title: "Contas bancárias", url: "/contas", icon: Landmark },
  { title: "Categorias", url: "/categorias", icon: Tags },
  { title: "Centros de custo", url: "/centros-custo", icon: FolderTree },
];

export function AppSidebar() {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const { hasRole, signOut, user } = useAuth();
  const isAdmin = hasRole("super_admin");

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b">
        <div className="flex items-center gap-2 py-1.5 group-data-[collapsible=icon]:justify-center">
          <div className="size-8 shrink-0 rounded-lg bg-primary/15 text-primary flex items-center justify-center">
            <Wallet className="size-4" />
          </div>
          <div className="flex flex-col min-w-0 leading-tight group-data-[collapsible=icon]:hidden">
            <span className="text-sm font-semibold truncate">Gestão Financeira</span>
            <span className="text-[10px] text-muted-foreground truncate">Sistema de Caixa</span>
          </div>
        </div>
        <div className="pb-2 group-data-[collapsible=icon]:hidden">
          <CompanySwitcher />
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Operação</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {main.map((it) => (
                <SidebarMenuItem key={it.url}>
                  <SidebarMenuButton asChild isActive={path === it.url}>
                    <Link to={it.url}>
                      <it.icon /> <span>{it.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Cadastros</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {cadastros.map((it) => (
                <SidebarMenuItem key={it.url}>
                  <SidebarMenuButton asChild isActive={path === it.url}>
                    <Link to={it.url}>
                      <it.icon /> <span>{it.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>Admin</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={path === "/empresas"}>
                    <Link to="/empresas">
                      <Building2 /> <span>Empresas</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={path === "/usuarios"}>
                    <Link to="/usuarios">
                      <Users /> <span>Usuários</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t">
        <div className="flex items-center gap-2 py-1.5 group-data-[collapsible=icon]:justify-center">
          <div className="size-8 shrink-0 rounded-full bg-accent text-accent-foreground flex items-center justify-center text-xs font-medium">
            {user?.email?.[0]?.toUpperCase() ?? "?"}
          </div>
          <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
            <p className="text-xs font-medium truncate">{user?.email}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={signOut} title="Sair" className="shrink-0 group-data-[collapsible=icon]:hidden">
            <LogOut className="size-4" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
