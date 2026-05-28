import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

export const inviteUserFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ 
    email: z.string().email(), 
    role: z.enum(["super_admin", "financeiro", "gestor", "socio"]) 
  }))
  .handler(async ({ data }) => {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !serviceKey) {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY não está configurada no .env. Necessária para convidar usuários.");
    }

    const adminClient = createClient(url, serviceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      }
    });

    // 1. Invitar o usuário via Supabase Auth
    const { data: authData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(data.email);
    if (inviteError) {
      throw new Error(`Erro ao convidar: ${inviteError.message}`);
    }

    const userId = authData.user.id;

    // 2. Aguardamos o trigger 'on_auth_user_created' rodar e criar o profile/user_role padrão
    await new Promise(r => setTimeout(r, 600));

    // 3. Atualizamos o 'role' com a escolha feita pelo administrador
    const { error: roleError } = await adminClient
      .from("user_roles")
      .update({ role: data.role })
      .eq("user_id", userId);

    if (roleError) {
      console.error("Falha ao atualizar role após convite:", roleError);
    }

    return { success: true, userId, email: data.email };
  });

export const createUserDirectFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ 
    email: z.string().email(), 
    password: z.string().min(6),
    name: z.string().optional(),
    role: z.enum(["super_admin", "financeiro", "gestor", "socio"]) 
  }))
  .handler(async ({ data }) => {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !serviceKey) {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY não está configurada no .env.");
    }

    const adminClient = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { data: authData, error: createError } = await adminClient.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: data.name ? { full_name: data.name } : undefined,
    });

    if (createError) {
      throw new Error(`Erro ao criar: ${createError.message}`);
    }

    const userId = authData.user.id;

    await new Promise(r => setTimeout(r, 600));

    const { error: roleError } = await adminClient
      .from("user_roles")
      .update({ role: data.role })
      .eq("user_id", userId);

    if (roleError) console.error("Falha ao atualizar role:", roleError);

    return { success: true, userId };
  });

export const updateUserFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    id: z.string(),
    name: z.string().optional(),
    password: z.string().optional(),
  }))
  .handler(async ({ data }) => {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !serviceKey) {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada.");
    }

    const adminClient = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const updates: any = {};
    if (data.password) updates.password = data.password;
    if (data.name) updates.user_metadata = { full_name: data.name };

    if (Object.keys(updates).length > 0) {
      const { error: updateError } = await adminClient.auth.admin.updateUserById(data.id, updates);
      if (updateError) throw new Error(`Erro ao atualizar Auth: ${updateError.message}`);
    }

    if (data.name) {
      const { error: profileError } = await adminClient
        .from("profiles")
        .update({ full_name: data.name })
        .eq("id", data.id);
      if (profileError) throw new Error(`Erro ao atualizar Profile: ${profileError.message}`);
    }

    return { success: true };
  });

export const deleteUserFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !serviceKey) {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada.");
    }

    const adminClient = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { error } = await adminClient.auth.admin.deleteUser(data.id);
    if (error) throw new Error(`Erro ao excluir: ${error.message}`);

    return { success: true };
  });
