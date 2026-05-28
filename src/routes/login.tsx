import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Wallet } from "lucide-react";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  head: () => ({ meta: [{ title: "Entrar — Caixa" }] }),
});

const schema = z.object({
  email: z.string().email("E-mail inválido"),
  password: z.string().min(6, "Mínimo 6 caracteres"),
});
type Form = z.infer<typeof schema>;

function LoginPage() {
  const nav = useNavigate();
  const { session, loading } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    console.log("LoginPage state:", { loading, hasSession: !!session });
    if (!loading && session) nav({ to: "/dashboard", replace: true });
  }, [loading, session, nav]);

  const form = useForm<Form>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } });

  const onSubmit = async (data: Form) => {
    try {
      setSubmitting(true);
      const { error, data: authData } = await supabase.auth.signInWithPassword(data);
      if (error) {
        toast.error("Credenciais inválidas", { description: "E-mail ou senha incorretos." });
        return;
      }
      toast.success("Bem-vindo de volta!");
    } catch (err: any) {
      toast.error("Erro inesperado", { description: err.message });
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const onGoogle = async () => {
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (result.error) toast.error("Falha no Google", { description: String(result.error) });
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between p-12 bg-gradient-to-br from-primary/15 via-background to-background border-r">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <Wallet className="size-6 text-primary" /> Caixa
        </div>
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">
            Gestão financeira <br /> de empresas e contas pessoais.
          </h1>
          <p className="mt-4 text-muted-foreground max-w-md">
            Fluxo de caixa, contas a pagar e a receber, dashboard consolidado — tudo num só lugar.
          </p>
        </div>
        <div className="text-xs text-muted-foreground">© Caixa</div>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-6">
          <div className="lg:hidden flex items-center gap-2 text-lg font-semibold">
            <Wallet className="size-6 text-primary" /> Caixa
          </div>
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Entrar</h2>
            <p className="text-sm text-muted-foreground mt-1">Use seu e-mail corporativo ou Google.</p>
          </div>

          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" type="email" autoComplete="email" {...form.register("email")} />
              {form.formState.errors.email && (
                <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Senha</Label>
              <Input id="password" type="password" autoComplete="current-password" {...form.register("password")} />
              {form.formState.errors.password && (
                <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Entrando…" : "Entrar"}
            </Button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">ou</span>
            </div>
          </div>

          <Button variant="outline" className="w-full" onClick={onGoogle}>
            Entrar com Google
          </Button>

          <p className="text-sm text-center text-muted-foreground">
            Não tem conta?{" "}
            <Link to="/signup" className="text-primary hover:underline font-medium">
              Cadastre-se
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
