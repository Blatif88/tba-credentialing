"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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

function casePath(caseId: string) {
  return `/enrollment-cases/${caseId}`;
}

export async function updateCaseStatus(formData: FormData) {
  const { supabase, user } = await context();
  const caseId = value(formData, "case_id");
  const statusCode = value(formData, "status_code");

  if (!caseId || !statusCode) throw new Error("Case and status are required.");

  const updates: Record<string, unknown> = {
    status_code: statusCode,
    updated_by: user.id,
  };

  const now = new Date().toISOString();
  if (statusCode === "submitted") updates.submitted_at = now;
  if (statusCode === "credentialing_approved") updates.approved_at = now;

  const { error } = await supabase
    .from("enrollment_cases")
    .update(updates)
    .eq("id", caseId);

  if (error) throw new Error(error.message);

  revalidatePath(casePath(caseId));
  revalidatePath("/enrollment-cases");
}

export async function updateWorkflowStep(formData: FormData) {
  const { supabase, user } = await context();
  const caseId = value(formData, "case_id");
  const stepId = value(formData, "step_id");
  const status = value(formData, "status");
  const completionNotes = value(formData, "completion_notes");

  if (!caseId || !stepId || !status) throw new Error("Case, workflow step, and status are required.");

  const updates: Record<string, unknown> = {
    status,
    completion_notes: completionNotes || null,
    updated_by: user.id,
  };

  const now = new Date().toISOString();
  if (status === "in_progress") updates.started_at = now;
  if (status === "completed") updates.completed_at = now;

  const { error } = await supabase
    .from("workflow_step_instances")
    .update(updates)
    .eq("id", stepId);

  if (error) throw new Error(error.message);
  revalidatePath(casePath(caseId));
}

export async function createCaseTask(formData: FormData) {
  const { supabase, user, tenantId } = await context();
  const caseId = value(formData, "case_id");
  const title = value(formData, "title");

  if (!caseId || !title) throw new Error("Case and task title are required.");

  const { data: caseRow, error: caseError } = await supabase
    .from("enrollment_cases")
    .select("provider_id,project_id")
    .eq("id", caseId)
    .single();

  if (caseError || !caseRow) throw new Error("Case is not available.");

  const { data: project } = await supabase
    .from("credentialing_projects")
    .select("client_id")
    .eq("id", caseRow.project_id)
    .single();

  const dueAt = value(formData, "due_at");

  const { error } = await supabase.from("tasks").insert({
    tenant_id: tenantId,
    case_id: caseId,
    client_id: project?.client_id ?? null,
    provider_id: caseRow.provider_id ?? null,
    title,
    description: value(formData, "description") || null,
    task_type: value(formData, "task_type") || "case_work",
    source_type: "manual",
    assigned_user_id: user.id,
    priority: value(formData, "priority") || "normal",
    status: "open",
    due_at: dueAt ? new Date(dueAt).toISOString() : null,
    created_by: user.id,
    updated_by: user.id,
  });

  if (error) throw new Error(error.message);
  revalidatePath(casePath(caseId));
  revalidatePath("/today");
}

export async function updateTaskStatus(formData: FormData) {
  const { supabase, user } = await context();
  const caseId = value(formData, "case_id");
  const taskId = value(formData, "task_id");
  const status = value(formData, "status");

  if (!caseId || !taskId || !status) throw new Error("Case, task, and status are required.");

  const updates: Record<string, unknown> = {
    status,
    updated_by: user.id,
  };

  if (status === "completed") updates.completed_at = new Date().toISOString();

  const { error } = await supabase.from("tasks").update(updates).eq("id", taskId);
  if (error) throw new Error(error.message);

  revalidatePath(casePath(caseId));
  revalidatePath("/today");
}

export async function scheduleFollowup(formData: FormData) {
  const { supabase, user, tenantId } = await context();
  const caseId = value(formData, "case_id");
  const scheduledAt = value(formData, "scheduled_at");

  if (!caseId || !scheduledAt) throw new Error("Case and scheduled date/time are required.");

  const { data: last } = await supabase
    .from("followups")
    .select("sequence_number")
    .eq("case_id", caseId)
    .order("sequence_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const sequenceNumber = (last?.sequence_number ?? 0) + 1;

  const { error } = await supabase.from("followups").insert({
    tenant_id: tenantId,
    case_id: caseId,
    sequence_number: sequenceNumber,
    scheduled_at: new Date(scheduledAt).toISOString(),
    method: value(formData, "method") || null,
    notes: value(formData, "notes") || null,
    escalation_level: 0,
    created_by: user.id,
    updated_by: user.id,
  });

  if (error) throw new Error(error.message);

  const { error: caseError } = await supabase
    .from("enrollment_cases")
    .update({
      next_followup_at: new Date(scheduledAt).toISOString(),
      updated_by: user.id,
    })
    .eq("id", caseId);

  if (caseError) throw new Error(caseError.message);
  revalidatePath(casePath(caseId));
}

export async function completeFollowup(formData: FormData) {
  const { supabase, user } = await context();
  const caseId = value(formData, "case_id");
  const followupId = value(formData, "followup_id");

  if (!caseId || !followupId) throw new Error("Case and follow-up are required.");

  const nextFollowupAt = value(formData, "next_followup_at");

  const { error } = await supabase
    .from("followups")
    .update({
      completed_at: new Date().toISOString(),
      performed_by: user.id,
      outcome: value(formData, "outcome") || null,
      notes: value(formData, "notes") || null,
      next_followup_at: nextFollowupAt ? new Date(nextFollowupAt).toISOString() : null,
      updated_by: user.id,
    })
    .eq("id", followupId);

  if (error) throw new Error(error.message);
  revalidatePath(casePath(caseId));
}

export async function addCaseNote(formData: FormData) {
  const { supabase, user, tenantId } = await context();
  const caseId = value(formData, "case_id");
  const body = value(formData, "body");

  if (!caseId || !body) throw new Error("Case and note body are required.");

  const { error } = await supabase.from("notes").insert({
    tenant_id: tenantId,
    subject_type: "case",
    subject_id: caseId,
    category: value(formData, "category") || "internal",
    body,
    visibility: "internal",
    created_by: user.id,
    updated_by: user.id,
  });

  if (error) throw new Error(error.message);
  revalidatePath(casePath(caseId));
}


export async function generateCaseRequirements(formData: FormData) {
  const { supabase } = await context();
  const caseId = value(formData, "case_id");

  if (!caseId) throw new Error("Case is required.");

  const { error } = await supabase.rpc("generate_case_requirements", {
    p_case_id: caseId,
  });

  if (error) throw new Error(error.message);
  revalidatePath(casePath(caseId));
}

export async function updateRequirementStatus(formData: FormData) {
  const { supabase, user } = await context();
  const caseId = value(formData, "case_id");
  const requirementId = value(formData, "requirement_id");
  const status = value(formData, "status");
  const waiverReason = value(formData, "waiver_reason");

  if (!caseId || !requirementId || !status) {
    throw new Error("Case, requirement, and status are required.");
  }

  const updates: Record<string, unknown> = {
    status,
    updated_by: user.id,
  };

  if (status === "completed") {
    updates.completed_by = user.id;
    updates.completed_at = new Date().toISOString();
  }

  if (status === "waived") {
    if (!waiverReason) throw new Error("A waiver reason is required.");
    updates.waived_by = user.id;
    updates.waived_at = new Date().toISOString();
    updates.waiver_reason = waiverReason;
  }

  const { error } = await supabase
    .from("case_requirements")
    .update(updates)
    .eq("id", requirementId)
    .eq("case_id", caseId);

  if (error) throw new Error(error.message);
  revalidatePath(casePath(caseId));
}


export async function attachExistingDocumentToRequirement(formData: FormData) {
  const { supabase, user, tenantId } = await context();
  const caseId = value(formData, "case_id");
  const requirementId = value(formData, "requirement_id");
  const documentId = value(formData, "document_id");

  if (!caseId || !requirementId || !documentId) {
    throw new Error("Case, requirement, and document are required.");
  }

  const { data: requirement, error: requirementError } = await supabase
    .from("case_requirements")
    .select("id,case_id,requirement_type")
    .eq("id", requirementId)
    .eq("case_id", caseId)
    .single();

  if (requirementError || !requirement) {
    throw new Error("Requirement is not available.");
  }

  if (requirement.requirement_type !== "document") {
    throw new Error("Only document requirements can receive a document attachment.");
  }

  const { data: document, error: documentError } = await supabase
    .from("documents")
    .select("id")
    .eq("id", documentId)
    .is("archived_at", null)
    .single();

  if (documentError || !document) {
    throw new Error("Document is not available.");
  }

  const { error } = await supabase.from("document_links").insert({
    tenant_id: tenantId,
    document_id: documentId,
    linked_type: "case_requirement",
    linked_id: requirementId,
    link_purpose: "supports",
    status: "active",
    created_by: user.id,
  });

  if (error) throw new Error(error.message);
  revalidatePath(casePath(caseId));
}
