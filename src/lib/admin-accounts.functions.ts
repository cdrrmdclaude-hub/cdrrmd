import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Role = "admin" | "employee";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin role required");
}

export const adminCreateAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    email: string;
    password: string;
    name: string;
    department: string;
    position: string;
    role: Role;
  }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const initials = data.name.trim().split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email.trim(),
      password: data.password,
      email_confirm: true,
      user_metadata: {
        full_name: data.name.trim(),
        department: data.department,
        position: data.position,
        avatar: initials || "EM",
      },
    });
    if (error || !created.user) throw new Error(error?.message || "Failed to create user");

    // handle_new_user trigger creates profile + employee role. Override role if admin requested.
    if (data.role === "admin") {
      await supabaseAdmin.from("user_roles").delete().eq("user_id", created.user.id);
      const { error: rErr } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: created.user.id, role: "admin" });
      if (rErr) throw new Error(rErr.message);
    }
    return { id: created.user.id, email: created.user.email };
  });

export const adminBulkCreateAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    rows: Array<{
      email: string; password: string; name: string;
      department: string; position: string; role: Role;
      employmentStatus?: string;
    }>;
  }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ALLOWED_STATUSES = ["Regular", "Casual", "Service Contract", "Job Order"];
    const results: Array<{ email: string; ok: boolean; error?: string }> = [];
    for (const row of data.rows) {
      try {
        const initials = row.name.trim().split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();
        const employmentStatus = ALLOWED_STATUSES.includes(row.employmentStatus || "")
          ? row.employmentStatus
          : "Regular";
        const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
          email: row.email.trim(),
          password: row.password,
          email_confirm: true,
          user_metadata: {
            full_name: row.name.trim(),
            department: row.department,
            position: row.position,
            employment_status: employmentStatus,
            avatar: initials || "EM",
          },
        });
        if (error || !created.user) throw new Error(error?.message || "create failed");
        if (row.role === "admin") {
          await supabaseAdmin.from("user_roles").delete().eq("user_id", created.user.id);
          await supabaseAdmin.from("user_roles").insert({ user_id: created.user.id, role: "admin" });
        }
        results.push({ email: row.email, ok: true });
      } catch (e: any) {
        results.push({ email: row.email, ok: false, error: e?.message || "error" });
      }
    }
    return { results };
  });


export const adminResetPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; newPassword: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.newPassword.length < 6) throw new Error("Password must be at least 6 characters");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: data.newPassword,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminDeleteAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.userId === context.userId) throw new Error("You cannot delete your own account");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
