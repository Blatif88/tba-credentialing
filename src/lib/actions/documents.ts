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
  const { supabase, user, tenantId } = await context();

  if (!input.clientId || !input.documentTypeId || !input.title || !input.objectPath) {
    throw new Error("Client, document type, title, and uploaded object are required.");
  }

  const expectedPrefix = tenantId + "/" + input.clientId + "/";
  if (!input.objectPath.startsWith(expectedPrefix)) {
    throw new Error("Uploaded object path does not match the active tenant/client.");
  }

  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0 || input.sizeBytes > 25 * 1024 * 1024) {
    throw new Error("Invalid file size.");
  }

  const { data: clientRow, error: clientError } = await supabase
    .from("clients")
    .select("id")
    .eq("id", input.clientId)
    .single();

  if (clientError || !clientRow) throw new Error("Client is not available.");

  if (input.caseId || input.requirementId) {
    if (!input.caseId || !input.requirementId) {
      throw new Error("Case and requirement must both be supplied.");
    }

    const { data: requirement, error: requirementError } = await supabase
      .from("case_requirements")
      .select("id,case_id,requirement_type")
      .eq("id", input.requirementId)
      .eq("case_id", input.caseId)
      .single();

    if (requirementError || !requirement) throw new Error("Requirement is not available.");
    if (requirement.requirement_type !== "document") {
      throw new Error("This requirement does not accept a document.");
    }

    const { data: caseRow, error: caseError } = await supabase
      .from("enrollment_cases")
      .select("project_id,provider_id,organization_id")
      .eq("id", input.caseId)
      .single();

    if (caseError || !caseRow) throw new Error("Case is not available.");

    const { data: project, error: projectError } = await supabase
      .from("credentialing_projects")
      .select("client_id")
      .eq("id", caseRow.project_id)
      .single();

    if (projectError || project?.client_id !== input.clientId) {
      throw new Error("Uploaded document client does not match the case.");
    }

    if (input.providerId && caseRow.provider_id && input.providerId !== caseRow.provider_id) {
      throw new Error("Uploaded document provider does not match the case.");
    }

    if (input.organizationId && caseRow.organization_id && input.organizationId !== caseRow.organization_id) {
      throw new Error("Uploaded document organization does not match the case.");
    }
  }

  const { data: connection, error: connectionError } = await supabase
    .from("storage_connections")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("provider", "supabase_storage")
    .eq("external_account_id", "credentialing-documents")
    .eq("status", "active")
    .limit(1)
    .single();

  if (connectionError || !connection) {
    throw new Error("Internal document storage is not configured.");
  }

  const documentId = crypto.randomUUID();

  const { data: document, error: documentError } = await supabase
    .from("documents")
    .insert({
      id: documentId,
      tenant_id: tenantId,
      client_id: input.clientId,
      provider_id: input.providerId || null,
      organization_id: input.organizationId || null,
      document_type_id: input.documentTypeId,
      title: input.title.trim(),
      status: "active",
      issued_date: input.issuedDate || null,
      expiration_date: input.expirationDate || null,
      storage_connection_id: connection.id,
      external_file_id: input.objectPath,
      source_type: "manual",
      metadata: {
        bucket: "credentialing-documents",
        original_file_name: input.fileName,
        mime_type: input.mimeType,
        size_bytes: input.sizeBytes,
      },
      created_by: user.id,
      updated_by: user.id,
    })
    .select("id")
    .single();

  if (documentError || !document) {
    throw new Error(documentError?.message ?? "Could not create the document record.");
  }

  const { data: version, error: versionError } = await supabase
    .from("document_versions")
    .insert({
      tenant_id: tenantId,
      document_id: document.id,
      version_number: 1,
      storage_connection_id: connection.id,
      external_file_id: input.objectPath,
      file_name: input.fileName,
      mime_type: input.mimeType,
      size_bytes: input.sizeBytes,
      source_type: "manual",
      uploaded_by: user.id,
      metadata: { bucket: "credentialing-documents" },
    })
    .select("id")
    .single();

  if (versionError || !version) {
    await supabase
      .from("documents")
      .update({
        status: "rejected",
        archived_at: new Date().toISOString(),
        updated_by: user.id,
      })
      .eq("id", document.id);

    throw new Error(versionError?.message ?? "Could not create the document version.");
  }

  const { error: currentVersionError } = await supabase
    .from("documents")
    .update({
      current_version_id: version.id,
      updated_by: user.id,
    })
    .eq("id", document.id);

  if (currentVersionError) throw new Error(currentVersionError.message);

  if (input.caseId && input.requirementId) {
    const { error: linkError } = await supabase.from("document_links").insert({
      tenant_id: tenantId,
      document_id: document.id,
      linked_type: "case_requirement",
      linked_id: input.requirementId,
      link_purpose: "supports",
      status: "active",
      created_by: user.id,
    });

    if (linkError) throw new Error(linkError.message);
    revalidatePath("/enrollment-cases/" + input.caseId);
  }

  revalidatePath("/documents");
  return { documentId: document.id };
}
