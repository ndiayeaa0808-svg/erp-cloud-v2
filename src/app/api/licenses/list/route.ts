import { getAdminClient, withErrorHandler } from "@/lib/api-utils";
import { NextResponse } from "next/server";

export const GET = withErrorHandler(async () => {
  const adminClient = getAdminClient();

  const { data: licenses } = await adminClient
    .from("licenses")
    .select("*, shops(name, phone, email, license_status)")
    .order("created_at", { ascending: false });

  return NextResponse.json(licenses || []);
});
