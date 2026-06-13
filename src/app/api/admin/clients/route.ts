import { getAdminClient, withErrorHandler } from "@/lib/api-utils";
import { NextResponse } from "next/server";

export const GET = withErrorHandler(async () => {
  const adminClient = getAdminClient();

  const { data: shops } = await adminClient
    .from("shops")
    .select("id, name, phone, email, address, license_id, license_status, trial_started_at, created_at, licenses(plan, expires_at, status)")
    .order("created_at", { ascending: false });

  return NextResponse.json(shops || []);
});
