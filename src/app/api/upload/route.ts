import { getAdminClient, apiError, withErrorHandler } from "@/lib/api-utils";
import { NextResponse } from "next/server";

export const POST = withErrorHandler(async (request: Request) => {
  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return apiError("Fichier requis", 400);
  }

  const adminClient = getAdminClient();

  const ext = file.name.split(".").pop() || "jpg";
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { data, error } = await adminClient.storage
    .from("erp-images")
    .upload(fileName, buffer, {
      contentType: file.type,
      upsert: false,
    });

  if (error) {
    return apiError(error.message, 400);
  }

  const { data: urlData } = adminClient.storage
    .from("erp-images")
    .getPublicUrl(fileName);

  return NextResponse.json({ secure_url: urlData.publicUrl });
});
