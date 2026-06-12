import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { userId } = await request.json();
    if (!userId) {
      return NextResponse.json({ shopId: null }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRole) {
      return NextResponse.json({ shopId: null }, { status: 500 });
    }

    const adminClient = createClient(supabaseUrl, serviceRole, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data } = await adminClient
      .from("users")
      .select("shop_id")
      .eq("id", userId)
      .single();

    return NextResponse.json({ shopId: data?.shop_id || null });
  } catch {
    return NextResponse.json({ shopId: null });
  }
}
