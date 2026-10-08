"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type RegisterUploadedDocumentInput = {
  objectPath: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number;
  clientId: string;
  providerId?: string | null;
  organizationId?: string | null;
  documentTypeId: string;
  title: string;
  issuedDate?: string | null;
  expirationDate?: string | null;
  caseId?: string | null;
  requirementId?: string | null;
};

async function context() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership, error } = await supabase
    .from("tenant_memberships")
    .select("tenant_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .single();

  if (error || !membership) throw new Error("No active tenant membership is available.");
  return { supabase, user, tenantId: membership.tenant_id };
}

export async function registerUploadedDocument(input: RegisterUploadedDocumentInput) {
  const { supabase } = await context();

  if (!input.clientId || !input.documentTypeId || !input.title || !input.objectPath) {
    throw new Error("Client, document type, title, and uploaded object are required.");
  }

  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0 || input.sizeBytes > 25 * 1024 * 1024) {
    throw new Error("Invalid file size.");
  }

  const { data, error } = await supabase.rpc("register_uploaded_document_metadata", {
    p_object_path: input.objectPath,
    p_file_name: input.fileName,
    p_mime_type: input.mimeType,
    p_size_bytes: input.sizeBytes,
    p_client_id: input.clientId,
    p_provider_id: input.providerId || null,
    p_organization_id: input.organizationId || null,
    p_document_type_id: input.documentTypeId,
    p_title: input.title.trim(),
    p_issued_date: input.issuedDate || null,
    p_expiration_date: input.expirationDate || null,
    p_case_id: input.caseId || null,
    p_requirement_id: input.requirementId || null,
  });

  if (error) throw new Error(error.message);

  if (input.caseId) {
    revalidatePath("/enrollment-cases/" + input.caseId);
  }

  revalidatePath("/documents");
  return { documentId: (data as { document_id?: string } | null)?.document_id ?? null };
}
