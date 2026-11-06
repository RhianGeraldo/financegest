import { useState } from "react";
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
  KeyRound,
  Settings,
  ChevronsUpDown,
  Bot,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth";
import { CompanySwitcher } from "./company-switcher";
import { ChangePasswordDialog } from "./change-password-dialog";

const main = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Transações", url: "/transacoes", icon: ArrowLeftRight },
  { title: "Relatórios", url: "/relatorios", icon: BarChart3 },
];
const cadastros = [
  { title: "Contas bancárias", url: "/contas", icon: Landmark },
  { title: "Categorias", url: "/categorias", icon: Tags },
  { title: "Centros de custo", url: "/centros-custo", icon: FolderTree },
  { title: "Chaves MCP (IA)", url: "/mcp", icon: Bot },
  { title: "Ajustes do Sistema", url: "/configuracoes", icon: Settings },
];

export function AppSidebar() {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const { hasRole, signOut, user } = useAuth();
  const isAdmin = hasRole("super_admin");
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);

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
          <SidebarGroupLabel>Cadastros & Ajustes</SidebarGroupLabel>
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-accent/60 transition-colors w-full text-left outline-none group-data-[collapsible=icon]:justify-center cursor-pointer"
            >
              <div className="size-8 shrink-0 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold">
                {user?.email?.[0]?.toUpperCase() ?? "?"}
              </div>
              <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                <p className="text-xs font-semibold truncate leading-tight">{user?.email}</p>
                <p className="text-[10px] text-muted-foreground truncate">
                  {isAdmin ? "Super Admin" : "Meu Perfil"}
                </p>
              </div>
              <ChevronsUpDown className="size-4 text-muted-foreground shrink-0 group-data-[collapsible=icon]:hidden" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-xs font-semibold leading-none truncate">{user?.email}</p>
                <p className="text-[10px] leading-none text-muted-foreground">
                  {isAdmin ? "Super Admin" : "Usuário"}
                </p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => setChangePasswordOpen(true)}
              className="cursor-pointer gap-2 text-xs"
            >
              <KeyRound className="size-4 text-primary" />
              <span>Alterar Senha</span>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className="cursor-pointer gap-2 text-xs">
              <Link to="/configuracoes">
                <Settings className="size-4 text-muted-foreground" />
                <span>Ajustes do Sistema</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={signOut}
              className="cursor-pointer gap-2 text-xs text-destructive focus:text-destructive"
            >
              <LogOut className="size-4" />
              <span>Sair da conta</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <ChangePasswordDialog
          open={changePasswordOpen}
          onOpenChange={setChangePasswordOpen}
        />
      </SidebarFooter>
    </Sidebar>
  );
}

