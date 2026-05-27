import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "super_admin" | "financeiro" | "gestor" | "socio";

export interface Company {
  id: string;
  name: string;
  kind: "clinica" | "pessoal";
  color: string;
}

export interface AuthState {
  loading: boolean;
  session: Session | null;
  user: User | null;
  roles: AppRole[];
  companies: Company[];
  /** id da empresa selecionada, ou "all" para consolidado */
  selectedCompanyId: string;
  setSelectedCompanyId: (id: string) => void;
  hasRole: (r: AppRole) => boolean;
  canWrite: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

const SELECTED_KEY = "caixa:selected_company";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyIdState] = useState<string>(() => {
    if (typeof window === "undefined") return "all";
    return localStorage.getItem(SELECTED_KEY) || "all";
  });

  const setSelectedCompanyId = (id: string) => {
    setSelectedCompanyIdState(id);
    if (typeof window !== "undefined") localStorage.setItem(SELECTED_KEY, id);
  };

  async function loadUserScope(userId: string) {
    const [rolesRes, compRes] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase
        .from("companies")
        .select("id, name, kind, color")
        .eq("active", true)
        .order("name"),
    ]);
    setRoles((rolesRes.data?.map((r) => r.role as AppRole)) ?? []);
    setCompanies((compRes.data as Company[]) ?? []);
  }

  async function refresh() {
    const { data } = await supabase.auth.getSession();
    setSession(data.session);
    if (data.session?.user) {
      await loadUserScope(data.session.user.id);
    } else {
      setRoles([]);
      setCompanies([]);
    }
  }

  useEffect(() => {
    // ÚNICO listener — onAuthStateChange dispara INITIAL_SESSION também.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, sess) => {
      setSession(sess);
      if (sess?.user) {
        await loadUserScope(sess.user.id);
      } else {
        setRoles([]);
        setCompanies([]);
      }
      setLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  const hasRole = (r: AppRole) => roles.includes(r);
  const canWrite = hasRole("super_admin") || hasRole("financeiro");

  const value: AuthState = {
    loading,
    session,
    user: session?.user ?? null,
    roles,
    companies,
    selectedCompanyId,
    setSelectedCompanyId,
    hasRole,
    canWrite,
    refresh,
    signOut: async () => {
      await supabase.auth.signOut();
      setSelectedCompanyId("all");
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside AuthProvider");
  return v;
}
