import { getAdminClient, apiError, apiSuccess, withErrorHandler } from "@/lib/api-utils";

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 16; i++) {
    if (i > 0 && i % 4 === 0) code += "-";
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function computeExpiry(plan: string): string | null {
  const now = new Date();
  switch (plan) {
    case "trial": return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    case "monthly": return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
    case "quarterly": return new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString();
    case "semi_annual": return new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000).toISOString();
    case "lifetime": return null;
    default: return null;
  }
}

export const POST = withErrorHandler(async (request: Request) => {
  const { plan, notes } = await request.json();

  if (!["trial", "monthly", "quarterly", "semi_annual", "lifetime"].includes(plan)) {
    return apiError("Plan invalide", 400);
  }

  const adminClient = getAdminClient();

  let code: string;
  let attempts = 0;
  do {
    code = generateCode();
    const { data: existing } = await adminClient.from("licenses").select("id").eq("code", code).maybeSingle();
    if (!existing) break;
    attempts++;
  } while (attempts < 10);

  const expiresAt = computeExpiry(plan);

  const { data: license, error } = await adminClient.from("licenses").insert({
    code,
    plan,
    status: "active",
    expires_at: expiresAt,
    notes: notes || null,
  }).select().single();

  if (error) {
    return apiError(error.message, 400);
  }

  return apiSuccess({ code, plan, expires_at: expiresAt });
});
