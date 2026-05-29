import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Wallet } from "lucide-react";

export const Route = createFileRoute("/signup")({
  component: SignupPage,
  head: () => ({ meta: [{ title: "Criar conta — Gestão Financeira" }] }),
});

const schema = z.object({
  full_name: z.string().min(2, "Informe seu nome"),
  email: z.string().email("E-mail inválido"),
  password: z.string().min(6, "Mínimo 6 caracteres"),
});
type Form = z.infer<typeof schema>;

function SignupPage() {
  const nav = useNavigate();
  const { session, loading } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && session) nav({ to: "/dashboard", replace: true });
  }, [loading, session, nav]);

  const form = useForm<Form>({ resolver: zodResolver(schema), defaultValues: { full_name: "", email: "", password: "" } });

  const onSubmit = async (data: Form) => {
    setSubmitting(true);
    const { data: authData, error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: { full_name: data.full_name },
      },
    });
    setSubmitting(false);

    if (error) {
      if (error.message.includes("already registered")) {
        toast.error("E-mail já cadastrado.", { description: "Tente fazer login com esse e-mail." });
      } else {
        toast.error("Falha no cadastro", { description: error.message });
      }
      return;
    }

    // Se a sessão foi criada imediatamente = e-mail confirmação desativado no Supabase
    if (authData.session) {
      toast.success("Conta criada! Bem-vindo.");
      nav({ to: "/dashboard", replace: true });
    } else {
      // E-mail de confirmação ainda ativo no Supabase — redireciona para login
      toast.success("Conta criada!", {
        description: "Confirme seu e-mail e depois faça login.",
      });
      nav({ to: "/login", replace: true });
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between p-12 bg-gradient-to-br from-primary/15 via-background to-background border-r">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <Wallet className="size-6 text-primary" /> Caixa
        </div>
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">
            Comece em <br /> menos de um minuto.
          </h1>
          <p className="mt-4 text-muted-foreground max-w-md">
            O primeiro usuário cadastrado torna-se Super Admin e pode criar empresas e convidar a equipe.
          </p>
        </div>
        <div className="text-xs text-muted-foreground">© Caixa</div>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-6">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Criar conta</h2>
            <p className="text-sm text-muted-foreground mt-1">Use seu e-mail corporativo.</p>
          </div>

          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="full_name">Nome completo</Label>
              <Input id="full_name" {...form.register("full_name")} />
              {form.formState.errors.full_name && (
                <p className="text-xs text-destructive">{form.formState.errors.full_name.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" type="email" autoComplete="email" {...form.register("email")} />
              {form.formState.errors.email && (
                <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Senha</Label>
              <Input id="password" type="password" autoComplete="new-password" {...form.register("password")} />
              {form.formState.errors.password && (
                <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Criando…" : "Criar conta"}
            </Button>
          </form>

          <p className="text-sm text-center text-muted-foreground">
            Já tem conta?{" "}
            <Link to="/login" className="text-primary hover:underline font-medium">
              Entrar
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
