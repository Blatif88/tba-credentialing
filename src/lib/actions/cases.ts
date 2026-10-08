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
  const { supabase } = await context();
  const caseId = value(formData, "case_id");
  const statusCode = value(formData, "status_code");
  const overrideReason = value(formData, "override_reason");

  if (!caseId || !statusCode) throw new Error("Case and status are required.");

  const { error } = await supabase.rpc("transition_enrollment_case_status", {
    p_case_id: caseId,
    p_status_code: statusCode,
    p_override_reason: overrideReason || null,
  });

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
  const { supabase } = await context();
  const caseId = value(formData, "case_id");
  const scheduledAt = value(formData, "scheduled_at");
  const useDefaultInterval = formData.get("use_default_interval") === "on";

  if (!caseId) throw new Error("Case is required.");
  if (!scheduledAt && !useDefaultInterval) {
    throw new Error("Choose a scheduled date/time or use the default interval.");
  }

  const { error } = await supabase.rpc("schedule_case_followup", {
    p_case_id: caseId,
    p_scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
    p_method: value(formData, "method") || "phone",
    p_notes: value(formData, "notes") || null,
  });

  if (error) throw new Error(error.message);
  revalidatePath(casePath(caseId));
}

export async function completeFollowup(formData: FormData) {
  const { supabase } = await context();
  const caseId = value(formData, "case_id");
  const followupId = value(formData, "followup_id");
  const nextFollowupAt = value(formData, "next_followup_at");
  const scheduleDefaultNext = formData.get("schedule_default_next") === "on";

  if (!caseId || !followupId) throw new Error("Case and follow-up are required.");

  const { error } = await supabase.rpc("complete_case_followup", {
    p_followup_id: followupId,
    p_outcome: value(formData, "outcome") || null,
    p_notes: value(formData, "notes") || null,
    p_next_followup_at: nextFollowupAt ? new Date(nextFollowupAt).toISOString() : null,
    p_schedule_default_next: scheduleDefaultNext,
    p_next_method: value(formData, "next_method") || null,
  });

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
  const { supabase } = await context();
  const caseId = value(formData, "case_id");
  const requirementId = value(formData, "requirement_id");
  const status = value(formData, "status");

  if (!caseId || !requirementId || !status) {
    throw new Error("Case, requirement, and status are required.");
  }

  const { error } = await supabase.rpc("transition_case_requirement_status", {
    p_case_id: caseId,
    p_requirement_id: requirementId,
    p_status: status,
    p_review_note: value(formData, "review_note") || null,
    p_waiver_reason: value(formData, "waiver_reason") || null,
  });

  if (error) throw new Error(error.message);
  revalidatePath(casePath(caseId));
}


export async function attachExistingDocumentToRequirement(formData: FormData) {
  const { supabase } = await context();
  const caseId = value(formData, "case_id");
  const requirementId = value(formData, "requirement_id");
  const documentId = value(formData, "document_id");

  if (!caseId || !requirementId || !documentId) {
    throw new Error("Case, requirement, and document are required.");
  }

  const { error } = await supabase.rpc("approve_document_reuse_for_requirement", {
    p_case_id: caseId,
    p_requirement_id: requirementId,
    p_document_id: documentId,
    p_reason: value(formData, "reuse_reason") || null,
  });

  if (error) throw new Error(error.message);
  revalidatePath(casePath(caseId));
}


export async function recordCaseSubmission(formData: FormData) {
  const { supabase } = await context();
  const caseId = value(formData, "case_id");
  const submittedAt = value(formData, "submitted_at");
  const submissionMethod = value(formData, "submission_method");
  const supersedesSubmissionId = value(formData, "supersedes_submission_id");
  const correctionReason = value(formData, "correction_reason");

  if (!caseId || !submittedAt || !submissionMethod) {
    throw new Error("Case, submission date/time, and submission method are required.");
  }

  if (supersedesSubmissionId && !correctionReason) {
    throw new Error("Correction reason is required when superseding a prior submission.");
  }

  const { error } = await supabase.rpc("record_case_submission", {
    p_case_id: caseId,
    p_submission_method: submissionMethod,
    p_submitted_at: new Date(submittedAt).toISOString(),
    p_recipient: value(formData, "recipient") || null,
    p_reference_number: value(formData, "reference_number") || null,
    p_notes: value(formData, "notes") || null,
    p_override_reason: value(formData, "override_reason") || null,
    p_supersedes_submission_id: supersedesSubmissionId || null,
    p_correction_reason: correctionReason || null,
  });

  if (error) throw new Error(error.message);

  revalidatePath(casePath(caseId));
  revalidatePath("/enrollment-cases");
}

export async function closeCaseSubmission(formData: FormData) {
  const { supabase } = await context();
  const caseId = value(formData, "case_id");
  const submissionId = value(formData, "submission_id");
  const status = value(formData, "status");
  const reason = value(formData, "reason");

  if (!caseId || !submissionId || !status || !reason) {
    throw new Error("Case, submission, close status, and reason are required.");
  }

  const { error } = await supabase.rpc("close_case_submission", {
    p_submission_id: submissionId,
    p_status: status,
    p_reason: reason,
  });

  if (error) throw new Error(error.message);
  revalidatePath(casePath(caseId));
}


export async function recordCaseMilestone(formData: FormData) {
  const { supabase, user, tenantId } = await context();
  const caseId = value(formData, "case_id");
  const milestoneCode = value(formData, "milestone_code");
  const outcome = value(formData, "outcome") || "completed";
  const occurredAt = value(formData, "occurred_at");

  if (!caseId || !milestoneCode || !occurredAt) {
    throw new Error("Case, milestone, and occurrence date/time are required.");
  }

  const { data: caseRow, error: caseError } = await supabase
    .from("enrollment_cases")
    .select("tenant_id")
    .eq("id", caseId)
    .single();

  if (caseError || !caseRow || caseRow.tenant_id !== tenantId) {
    throw new Error("Case is not available.");
  }

  const { error } = await supabase.from("case_milestones").insert({
    tenant_id: tenantId,
    case_id: caseId,
    submission_id: value(formData, "submission_id") || null,
    milestone_code: milestoneCode,
    outcome,
    occurred_at: new Date(occurredAt).toISOString(),
    value_date: value(formData, "value_date") || null,
    reference_number: value(formData, "reference_number") || null,
    notes: value(formData, "notes") || null,
    created_by: user.id,
    updated_by: user.id,
  });

  if (error) throw new Error(error.message);

  revalidatePath(casePath(caseId));
  revalidatePath("/enrollment-cases");
}


export async function createCaseDeficiency(formData: FormData) {
  const { supabase, user, tenantId } = await context();
  const caseId = value(formData, "case_id");
  const title = value(formData, "title");
  const receivedAt = value(formData, "received_at");
  const dueAt = value(formData, "due_at");

  if (!caseId || !title || !receivedAt) {
    throw new Error("Case, deficiency title, and received date/time are required.");
  }

  const { data: caseRow, error: caseError } = await supabase
    .from("enrollment_cases")
    .select("tenant_id")
    .eq("id", caseId)
    .single();

  if (caseError || !caseRow || caseRow.tenant_id !== tenantId) {
    throw new Error("Case is not available.");
  }

  const { data: latestSubmission } = await supabase
    .from("case_submissions")
    .select("id")
    .eq("case_id", caseId)
    .order("sequence_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("case_deficiencies").insert({
    tenant_id: tenantId,
    case_id: caseId,
    submission_id: latestSubmission?.id ?? null,
    title,
    description: value(formData, "description") || null,
    requested_by: value(formData, "requested_by") || null,
    received_at: new Date(receivedAt).toISOString(),
    due_at: dueAt ? new Date(dueAt).toISOString() : null,
    status: "open",
    notes: value(formData, "notes") || null,
    created_by: user.id,
    updated_by: user.id,
  });

  if (error) throw new Error(error.message);
  revalidatePath(casePath(caseId));
}

export async function updateCaseDeficiency(formData: FormData) {
  const { supabase, user } = await context();
  const caseId = value(formData, "case_id");
  const deficiencyId = value(formData, "deficiency_id");
  const status = value(formData, "status");

  if (!caseId || !deficiencyId || !status) {
    throw new Error("Case, deficiency, and status are required.");
  }

  const updates: Record<string, unknown> = {
    status,
    notes: value(formData, "notes") || null,
    updated_by: user.id,
  };

  if (status === "response_submitted") {
    updates.response_submitted_at = new Date().toISOString();
  }

  if (status === "resolved") {
    updates.resolved_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from("case_deficiencies")
    .update(updates)
    .eq("id", deficiencyId)
    .eq("case_id", caseId);

  if (error) throw new Error(error.message);
  revalidatePath(casePath(caseId));
  revalidatePath("/enrollment-cases");
}


export async function createCaseContract(formData: FormData) {
  const { supabase, user, tenantId } = await context();
  const caseId = value(formData, "case_id");
  const contractName = value(formData, "contract_name");
  const status = value(formData, "status") || "pending";

  if (!caseId || !contractName) {
    throw new Error("Case and contract name are required.");
  }

  const { error } = await supabase.from("case_contracts").insert({
    tenant_id: tenantId,
    case_id: caseId,
    contract_name: contractName,
    status,
    received_at: value(formData, "received_at") ? new Date(value(formData, "received_at")).toISOString() : null,
    sent_for_signature_at: value(formData, "sent_for_signature_at") ? new Date(value(formData, "sent_for_signature_at")).toISOString() : null,
    executed_at: value(formData, "executed_at") ? new Date(value(formData, "executed_at")).toISOString() : null,
    effective_date: value(formData, "effective_date") || null,
    reference_number: value(formData, "reference_number") || null,
    notes: value(formData, "notes") || null,
    created_by: user.id,
    updated_by: user.id,
  });

  if (error) throw new Error(error.message);
  revalidatePath(casePath(caseId));
  revalidatePath("/enrollment-cases");
}

export async function recordDirectoryVerification(formData: FormData) {
  const { supabase, user, tenantId } = await context();
  const caseId = value(formData, "case_id");
  const outcome = value(formData, "outcome");
  const verifiedAt = value(formData, "verified_at");

  if (!caseId || !outcome || !verifiedAt) {
    throw new Error("Case, outcome, and verified date/time are required.");
  }

  const checked = (key: string) => formData.get(key) === "on";

  const { error } = await supabase.from("case_directory_verifications").insert({
    tenant_id: tenantId,
    case_id: caseId,
    verified_at: new Date(verifiedAt).toISOString(),
    directory_url: value(formData, "directory_url") || null,
    listing_found: checked("listing_found"),
    name_correct: checked("name_correct"),
    location_correct: checked("location_correct"),
    specialty_correct: checked("specialty_correct"),
    network_correct: checked("network_correct"),
    outcome,
    notes: value(formData, "notes") || null,
    created_by: user.id,
    updated_by: user.id,
  });

  if (error) throw new Error(error.message);
  revalidatePath(casePath(caseId));
  revalidatePath("/enrollment-cases");
}

export async function recordClaimTest(formData: FormData) {
  const { supabase, user, tenantId } = await context();
  const caseId = value(formData, "case_id");
  const testType = value(formData, "test_type");
  const outcome = value(formData, "outcome");
  const submittedAt = value(formData, "submitted_at");
  const responseAt = value(formData, "response_at");

  if (!caseId || !testType || !outcome || !submittedAt) {
    throw new Error("Case, test type, outcome, and submitted date/time are required.");
  }

  const { error } = await supabase.from("case_claim_tests").insert({
    tenant_id: tenantId,
    case_id: caseId,
    test_type: testType,
    submitted_at: new Date(submittedAt).toISOString(),
    response_at: responseAt ? new Date(responseAt).toISOString() : null,
    outcome,
    payer_reference: value(formData, "payer_reference") || null,
    clearinghouse_reference: value(formData, "clearinghouse_reference") || null,
    response_code: value(formData, "response_code") || null,
    notes: value(formData, "notes") || null,
    created_by: user.id,
    updated_by: user.id,
  });

  if (error) throw new Error(error.message);
  revalidatePath(casePath(caseId));
  revalidatePath("/enrollment-cases");
}
