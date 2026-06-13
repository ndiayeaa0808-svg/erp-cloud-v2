import { getAdminClient, withErrorHandler } from "@/lib/api-utils";
import { NextResponse } from "next/server";

export const POST = withErrorHandler(async (request: Request) => {
  const { code } = await request.json();
  if (!code?.trim()) {
    return NextResponse.json({ valid: false, error: "Code requis" }, { status: 400 });
  }

  const adminClient = getAdminClient();

  const { data: license } = await adminClient
    .from("licenses")
    .select("*")
    .eq("code", code.trim())
    .single();

  if (!license) {
    return NextResponse.json({ valid: false, error: "Code de licence invalide" });
  }

  if (license.status !== "active") {
    return NextResponse.json({ valid: false, error: "Cette licence n'est plus active" });
  }

  if (license.shop_id) {
    return NextResponse.json({ valid: false, error: "Ce code a déjà été utilisé" });
  }

  if (license.expires_at && new Date(license.expires_at) < new Date()) {
    return NextResponse.json({ valid: false, error: "Cette licence a expiré" });
  }

  return NextResponse.json({
    valid: true,
    plan: license.plan,
    installation_fee_paid: license.installation_fee_paid,
    expires_at: license.expires_at,
  });
});
