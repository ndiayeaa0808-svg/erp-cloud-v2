import { getAdminClient, apiError, withErrorHandler } from "@/lib/api-utils";
import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

export const POST = withErrorHandler(async (request: Request) => {
  const { login, password } = await request.json();

  if (!login || !password) {
    return apiError("Login et mot de passe requis", 400);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRole) {
    return apiError("Configuration serveur manquante", 500);
  }

  const adminClient = getAdminClient();

  const { data: users, error: fetchError } = await adminClient
    .from("users")
    .select("id, login, email, name, role, shop_id, is_blocked, perms")
    .eq("login", login)
    .limit(1);

  if (fetchError) {
    return apiError("Erreur de connexion", 500);
  }

  if (!users || users.length === 0) {
    // Auto-création : chercher l'utilisateur Auth par metadata.login
    const { data: authUsers } = await adminClient.auth.admin.listUsers();
    const authUser = authUsers?.users?.find(u => u.user_metadata?.login === login);
    if (!authUser) {
      return apiError("Utilisateur introuvable", 401);
    }
    const meta = authUser.user_metadata || {};
    const { error: insertErr } = await adminClient.from("users").insert({
      id: authUser.id, login, email: authUser.email,
      name: meta.full_name || login, role: meta.role || "caissier",
      shop_id: meta.shop_id || login, perms: {},
      is_blocked: false,
    });
    if (insertErr) {
      return apiError("Erreur lors de la création du profil", 500);
    }
    const { data: newUsers } = await adminClient.from("users").select("*").eq("id", authUser.id).limit(1);
    if (!newUsers || newUsers.length === 0) {
      return apiError("Erreur de création utilisateur", 500);
    }
    var user: any = newUsers[0];
  } else {
    var user: any = users[0];
  }

  if (user.is_blocked) {
    return apiError("Compte bloqué", 403);
  }

  const email = user.email || `${user.login}@boutique.local`;

  const { data: signInData, error: signInError } = await adminClient.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError) {
    return apiError("Mot de passe incorrect", 401);
  }

  // Parse existing cookies to pass to server client
  const cookieHeader = request.headers.get("cookie") || "";

  const serverClient = createServerClient(
    supabaseUrl,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieHeader.split(";").filter(Boolean).map(c => {
          const eq = c.indexOf("=");
          return eq > 0 ? { name: c.substring(0, eq).trim(), value: c.substring(eq + 1).trim() } : { name: c.trim(), value: "" };
        }),
        setAll: () => {},
      },
    },
  );

  // Set session to get refresh token, etc.
  await serverClient.auth.setSession(signInData.session!);

  return NextResponse.json({
    session: signInData.session,
    user: {
      id: user.id,
      login: user.login,
      name: user.name,
      role: user.role,
      shop_id: user.shop_id,
      perms: user.perms,
    },
  });
});
