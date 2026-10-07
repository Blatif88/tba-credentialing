"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const BUCKET = "credentialing-documents";
const MAX_FILE_BYTES = 25 * 1024 * 1024;

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

function value(formData: FormData, key: string) {
  const raw = formData.get(key);
  return raw === null ? "" : String(raw).trim();
}

function safeFileName(name: string) {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]/g, "_");
  return cleaned.slice(-120) || "document";
}

async function storeDocument({
  supabase,
  userId,
  tenantId,
  clientId,
  providerId,
  organizationId,
  documentTypeId,
  title,
  issuedDate,
  expirationDate,
  file,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  tenantId: string;
  clientId: string;
  providerId: string | null;
  organizationId: string | null;
  documentTypeId: string;
  title: string;
  issuedDate: string | null;
  expirationDate: string | null;
  file: File;
}) {
  if (!file || file.size <= 0) throw new Error("Choose a file to upload.");
  if (file.size > MAX_FILE_BYTES) throw new Error("File exceeds the 25 MB upload limit.");
  if (!clientId || !documentTypeId || !title) {
    throw new Error("Client, document type, and title are required.");
  }

  const { data: connection, error: connectionError } = await supabase
    .from("storage_connections")
    .select("id,external_account_id")
    .eq("tenant_id", tenantId)
    .eq("provider", "supabase_storage")
    .eq("status", "active")
    .limit(1)
    .single();

  if (connectionError || !connection) {
    throw new Error("Internal document storage is not configured.");
  }

  const documentId = crypto.randomUUID();
  const objectPath =
    tenantId +
    "/" +
    clientId +
    "/" +
    documentId +
    "/" +
    crypto.randomUUID() +
    "-" +
    safeFileName(file.name);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(objectPath, bytes, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
      cacheControl: "3600",
    });

  if (uploadError) throw new Error(uploadError.message);

  const { data: document, error: documentError } = await supabase
    .from("documents")
    .insert({
      id: documentId,
      tenant_id: tenantId,
      client_id: clientId,
      provider_id: providerId,
      organization_id: organizationId,
      document_type_id: documentTypeId,
      title,
      status: "active",
      issued_date: issuedDate,
      expiration_date: expirationDate,
      storage_connection_id: connection.id,
      external_file_id: objectPath,
      source_type: "manual",
      metadata: {
        bucket: BUCKET,
        original_file_name: file.name,
        mime_type: file.type || null,
        size_bytes: file.size,
      },
      created_by: userId,
      updated_by: userId,
    })
    .select("id")
    .single();

  if (documentError || !document) {
    await supabase.storage.from(BUCKET).remove([objectPath]);
    throw new Error(documentError?.message ?? "Could not create the document record.");
  }

  const { data: version, error: versionError } = await supabase
    .from("document_versions")
    .insert({
      tenant_id: tenantId,
      document_id: document.id,
      version_number: 1,
      storage_connection_id: connection.id,
      external_file_id: objectPath,
      file_name: file.name,
      mime_type: file.type || null,
      size_bytes: file.size,
      source_type: "manual",
      uploaded_by: userId,
      metadata: {
        bucket: BUCKET,
      },
    })
    .select("id")
    .single();

  if (versionError || !version) {
    await supabase.storage.from(BUCKET).remove([objectPath]);
    await supabase
      .from("documents")
      .update({
        status: "rejected",
        archived_at: new Date().toISOString(),
        updated_by: userId,
      })
      .eq("id", document.id);

    throw new Error(versionError?.message ?? "Could not create the document version.");
  }

  const { error: currentVersionError } = await supabase
    .from("documents")
    .update({
      current_version_id: version.id,
      updated_by: userId,
    })
    .eq("id", document.id);

  if (currentVersionError) throw new Error(currentVersionError.message);

  return { documentId: document.id };
}

export async function uploadDocument(formData: FormData) {
  const { supabase, user, tenantId } = await context();

  const fileValue = formData.get("file");
  if (!(fileValue instanceof File)) throw new Error("Choose a file to upload.");

  await storeDocument({
    supabase,
    userId: user.id,
    tenantId,
    clientId: value(formData, "client_id"),
    providerId: value(formData, "provider_id") || null,
    organizationId: value(formData, "organization_id") || null,
    documentTypeId: value(formData, "document_type_id"),
    title: value(formData, "title"),
    issuedDate: value(formData, "issued_date") || null,
    expirationDate: value(formData, "expiration_date") || null,
    file: fileValue,
  });

  revalidatePath("/documents");
}

export async function uploadDocumentForRequirement(formData: FormData) {
  const { supabase, user, tenantId } = await context();

  const caseId = value(formData, "case_id");
  const requirementId = value(formData, "requirement_id");
  const fileValue = formData.get("file");

  if (!caseId || !requirementId) throw new Error("Case and requirement are required.");
  if (!(fileValue instanceof File)) throw new Error("Choose a file to upload.");

  const { data: requirement, error: requirementError } = await supabase
    .from("case_requirements")
    .select("id,requirement_type")
    .eq("id", requirementId)
    .eq("case_id", caseId)
    .single();

  if (requirementError || !requirement) throw new Error("Requirement is not available.");
  if (requirement.requirement_type !== "document") {
    throw new Error("This requirement does not accept a document.");
  }

  const { data: caseRow, error: caseError } = await supabase
    .from("enrollment_cases")
    .select("provider_id,organization_id,project_id")
    .eq("id", caseId)
    .single();

  if (caseError || !caseRow) throw new Error("Case is not available.");

  const { data: project, error: projectError } = await supabase
    .from("credentialing_projects")
    .select("client_id")
    .eq("id", caseRow.project_id)
    .single();

  if (projectError || !project?.client_id) throw new Error("Case client is not available.");

  const result = await storeDocument({
    supabase,
    userId: user.id,
    tenantId,
    clientId: project.client_id,
    providerId: caseRow.provider_id,
    organizationId: caseRow.organization_id,
    documentTypeId: value(formData, "document_type_id"),
    title: value(formData, "title"),
    issuedDate: value(formData, "issued_date") || null,
    expirationDate: value(formData, "expiration_date") || null,
    file: fileValue,
  });

  const { error: linkError } = await supabase.from("document_links").insert({
    tenant_id: tenantId,
    document_id: result.documentId,
    linked_type: "case_requirement",
    linked_id: requirementId,
    link_purpose: "supports",
    status: "active",
    created_by: user.id,
  });

  if (linkError) throw new Error(linkError.message);

  revalidatePath("/documents");
  revalidatePath("/enrollment-cases/" + caseId);
}
