import { createAdminClient } from "@/lib/api-utils";
import { createHash } from "node:crypto";

function hashPin(pin: string): string {
  return createHash("sha256").update(pin + "erp-cloud-salt").digest("hex");
}

export async function POST(request: Request) {
  const { id } = await request.json();
  if (!id) {
    return Response.json({ error: "ID utilisateur requis" }, { status: 400 });
  }

  const { client: adminClient, error } = createAdminClient();
  if (error || !adminClient) {
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }

  const { error: updateError } = await adminClient
    .from("users")
    .update({ pin: hashPin("0000") })
    .eq("id", id);

  if (updateError) {
    return Response.json({ error: updateError.message }, { status: 500 });
  }

  return Response.json({ success: true, message: "PIN réinitialisé à 0000" });
}
