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

export function applyCompanyFilter(q: any, selectedCompanyId: string, companies: Company[]) {
  if (selectedCompanyId === "all_clinica") {
    const ids = companies.filter((c) => c.kind === "clinica").map((c) => c.id);
    return ids.length > 0 ? q.in("company_id", ids) : q.eq("company_id", "00000000-0000-0000-0000-000000000000");
  }
  if (selectedCompanyId === "all_pessoal") {
    const ids = companies.filter((c) => c.kind === "pessoal").map((c) => c.id);
    return ids.length > 0 ? q.in("company_id", ids) : q.eq("company_id", "00000000-0000-0000-0000-000000000000");
  }
  return q.eq("company_id", selectedCompanyId);
}

const Ctx = createContext<AuthState | null>(null);

const SELECTED_KEY = "caixa:selected_company";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyIdState] = useState<string>(() => {
    if (typeof window === "undefined") return "all_clinica";
    const saved = localStorage.getItem(SELECTED_KEY);
    if (!saved || saved === "all") return "all_clinica";
    return saved;
  });

  const setSelectedCompanyId = (id: string) => {
    setSelectedCompanyIdState(id);
    if (typeof window !== "undefined") localStorage.setItem(SELECTED_KEY, id);
  };

  async function loadUserScope(userId: string) {
    try {
      const fetchPromise = Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", userId),
        supabase
          .from("companies")
          .select("id, name, kind, color")
          .eq("active", true)
          .order("name"),
      ]);
      
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Supabase timeout! O banco demorou mais de 5s para responder.")), 5000)
      );

      const [rolesRes, compRes] = await Promise.race([fetchPromise, timeoutPromise]) as any;

      setRoles((rolesRes.data?.map((r: any) => r.role as AppRole)) ?? []);
      setCompanies((compRes.data as Company[]) ?? []);
    } catch (e: any) {
      console.error("Erro fatal no loadUserScope:", e.message || e);
    }
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
      try {
        setSession(sess);
        if (sess?.user) {
          await loadUserScope(sess.user.id);
        } else {
          setRoles([]);
          setCompanies([]);
        }
      } catch (err) {
        console.error("Erro ao carregar escopo de usuário:", err);
      } finally {
        setLoading(false);
      }
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
      setSelectedCompanyId("all_clinica");
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside AuthProvider");
  return v;
}
