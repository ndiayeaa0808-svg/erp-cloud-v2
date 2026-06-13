import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { login, password } = await request.json();

    if (!login || !password) {
      return NextResponse.json({ error: "Login et mot de passe requis" }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!serviceRole) {
      return NextResponse.json({ error: "Configuration serveur manquante" }, { status: 500 });
    }

    const adminClient = createClient(supabaseUrl, serviceRole, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: users, error: fetchError } = await adminClient
      .from("users")
      .select("id, login, email, name, role, shop_id, is_blocked, perms")
      .eq("login", login)
      .limit(1);

    if (fetchError) {
      return NextResponse.json({ error: "Erreur de connexion" }, { status: 500 });
    }

    if (!users || users.length === 0) {
      // Auto-création : chercher l'utilisateur Auth par metadata.login
      const { data: authUsers } = await adminClient.auth.admin.listUsers();
      const authUser = authUsers?.users?.find(u => u.user_metadata?.login === login);
      if (!authUser) {
        return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 401 });
      }
      const meta = authUser.user_metadata || {};
      const { error: insertErr } = await adminClient.from("users").insert({
        id: authUser.id, login, email: authUser.email,
        name: meta.full_name || login, role: meta.role || "caissier",
        shop_id: meta.shop_id || login, perms: {},
        is_blocked: false,
      });
      if (insertErr) {
        return NextResponse.json({ error: "Erreur lors de la création du profil" }, { status: 500 });
      }
      const { data: newUsers } = await adminClient.from("users").select("*").eq("id", authUser.id).limit(1);
      if (!newUsers || newUsers.length === 0) {
        return NextResponse.json({ error: "Erreur de création utilisateur" }, { status: 500 });
      }
      var user: any = newUsers[0];
    } else {
      var user: any = users[0];
    }

    if (user.is_blocked) {
      return NextResponse.json({ error: "Compte bloqué" }, { status: 403 });
    }

    const email = user.email || `${user.login}@boutique.local`;

    const { data: signInData, error: signInError } = await adminClient.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      return NextResponse.json({ error: "Mot de passe incorrect" }, { status: 401 });
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
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur serveur" },
      { status: 500 },
    );
  }
}
