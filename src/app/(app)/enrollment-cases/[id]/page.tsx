import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/submit-button";
import {
  addCaseNote,
  attachExistingDocumentToRequirement,
  completeFollowup,
  closeCaseSubmission,
  createCaseContract,
  createCaseDeficiency,
  createCaseTask,
  assignCaseTask,
  setCaseTaskEscalation,
  generateCaseRequirements,
  recordCaseMilestone,
  recordCaseSubmission,
  recordClaimTest,
  recordDirectoryVerification,
  scheduleFollowup,
  updateCaseStatus,
  updateRequirementStatus,
  updateCaseDeficiency,
  updateTaskStatus,
  updateWorkflowStep,
} from "@/lib/actions/cases";
import { createClient } from "@/lib/supabase/server";
import { DocumentUploadForm } from "@/components/documents/document-upload-form";
import { DocumentOpenButton } from "@/components/documents/document-open-button";

function fmt(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

export default async function EnrollmentCaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: caseRow } = await supabase
    .from("enrollment_cases")
    .select(
      "id,tenant_id,project_id,provider_id,organization_id,payer_id,payer_offering_id,enrollment_type,network_intent,entity_context,state,status_code,priority,submitted_at,approved_at,effective_date,next_followup_at,providers(first_name,last_name,credential,individual_npi),organizations(legal_name,entity_npi),payer_organizations(display_name),payer_offerings(name),credentialing_projects(id,name,client_id,clients(name))"
    )
    .eq("id", id)
    .single();

  if (!caseRow) notFound();

  const [
    { data: statuses },
    { data: workflows },
    { data: requirements },
    { data: tasks },
    { data: taskGovernanceData },
    { data: followups },
    { data: notes },
    { data: timeline },
    { data: locations },
    { data: portals },
    { data: documents },
    { data: documentTypes },
    { data: documentLinks },
    { data: submissions },
    { data: milestones },
    { data: deficiencies },
    { data: contracts },
    { data: directoryVerifications },
    { data: claimTests },
  ] = await Promise.all([
    supabase.from("case_status_definitions").select("code,display_name,stage,terminal,sort_order").eq("active", true).order("sort_order"),
    supabase.from("workflow_instances").select("id,status,started_at,completed_at,workflow_step_instances(id,status,started_at,due_at,completed_at,completion_notes,workflow_step_definitions(name,stage,sequence,optional,instructions,step_code))").eq("case_id", id).order("created_at", { ascending: true }),
    supabase.from("case_requirements").select("id,requirement_type,title,description,required,status,sequence,source_reason,knowledge_sources(title,url,last_verified_at)").eq("case_id", id).order("sequence"),
    supabase.from("tasks").select("id,title,description,priority,status,due_at,completed_at,completion_notes,assigned_user_id,started_at,blocked_reason,cancelled_at,cancellation_reason,escalation_level,escalated_at,escalation_reason").eq("case_id", id).order("created_at", { ascending: false }),
    supabase.rpc("case_task_governance_context", { p_case_id: id }),
    supabase.from("followups").select("id,sequence_number,scheduled_at,completed_at,method,outcome,notes,next_followup_at,escalation_level").eq("case_id", id).order("sequence_number", { ascending: false }),
    supabase.from("notes").select("id,category,body,created_at").eq("subject_type", "case").eq("subject_id", id).order("created_at", { ascending: false }),
    supabase.from("timeline_events").select("id,event_type,title,description,occurred_at,metadata").eq("case_id", id).order("occurred_at", { ascending: false }),
    supabase.from("case_locations").select("id,included,locations(name,address_line_1,address_line_2,city,state,zip)").eq("case_id", id),
    supabase.rpc("case_portal_resources", {
      p_case_id: id,
    }),
    (caseRow as any).credentialing_projects?.client_id
      ? supabase
          .from("documents")
          .select("id,title,expiration_date,status,document_types(name,code)")
          .eq("client_id", (caseRow as any).credentialing_projects.client_id)
          .is("archived_at", null)
          .eq("status", "active")
          .order("title")
      : Promise.resolve({ data: [] as any[] }),
    supabase
      .from("document_types")
      .select("id,name,code,subject_type")
      .eq("active", true)
      .order("name"),
    supabase
      .from("document_links")
      .select("id,linked_id,document_id,documents(id,title,status,expiration_date,external_file_id,storage_connections(provider),document_types(name,code))")
      .eq("linked_type", "case_requirement")
      .eq("status", "active"),
    supabase
      .from("case_submissions")
      .select("id,sequence_number,submission_method,submitted_at,recipient,reference_number,notes,status,supersedes_submission_id,correction_reason,closed_at")
      .eq("case_id", id)
      .order("sequence_number", { ascending: false }),
    supabase
      .from("case_milestones")
      .select("id,milestone_code,outcome,occurred_at,value_date,reference_number,notes,submission_id")
      .eq("case_id", id)
      .order("occurred_at", { ascending: false }),
    supabase
      .from("case_deficiencies")
      .select("id,title,description,requested_by,received_at,due_at,status,response_submitted_at,resolved_at,notes,submission_id,prepared_at,prepared_by,waived_at,waived_by,waiver_reason,resolution_notes")
      .eq("case_id", id)
      .order("received_at", { ascending: false }),
    supabase
      .from("case_contracts")
      .select("id,contract_name,status,received_at,sent_for_signature_at,executed_at,effective_date,reference_number,notes")
      .eq("case_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("case_directory_verifications")
      .select("id,verified_at,directory_url,listing_found,name_correct,location_correct,specialty_correct,network_correct,outcome,notes")
      .eq("case_id", id)
      .order("verified_at", { ascending: false }),
    supabase
      .from("case_claim_tests")
      .select("id,test_type,submitted_at,response_at,outcome,payer_reference,clearinghouse_reference,response_code,notes")
      .eq("case_id", id)
      .order("submitted_at", { ascending: false }),
  ]);

  const workflow = workflows?.[0] as any;
  const workflowSteps = (workflow?.workflow_step_instances ?? [])
    .slice()
    .sort((a: any, b: any) => (a.workflow_step_definitions?.sequence ?? 999) - (b.workflow_step_definitions?.sequence ?? 999));

  const completedSteps = workflowSteps.filter((step: any) => step.status === "completed").length;
  const totalSteps = workflowSteps.length;

  const provider = (caseRow as any).providers;
  const organization = (caseRow as any).organizations;
  const payer = (caseRow as any).payer_organizations;
  const offering = (caseRow as any).payer_offerings;
  const project = (caseRow as any).credentialing_projects;

  const subject = provider
    ? [provider.first_name, provider.last_name, provider.credential].filter(Boolean).join(" ")
    : organization?.legal_name ?? caseRow.entity_context;

  const { data: readinessData } = await supabase.rpc("case_readiness", {
    p_case_id: id,
  });

  const readiness = readinessData as {
    ready?: boolean;
    blocker_count?: number;
    required_total?: number;
    satisfied_required?: number;
    blockers?: Array<{
      requirement_id?: string | null;
      title?: string;
      requirement_type?: string;
      status?: string;
    }>;
  } | null;

  const { data: activationReadinessData } = await supabase.rpc("case_activation_readiness", {
    p_case_id: id,
  });

  const activationReadiness = activationReadinessData as {
    ready_for_operational_completion?: boolean;
    blocker_count?: number;
    blockers?: Array<{ code?: string; title?: string }>;
    gates?: {
      credentialing_approved?: boolean;
      effective_date_confirmed?: boolean;
      payer_loaded?: boolean;
      directory_verified?: boolean;
      claims_test_passed?: boolean;
      no_open_deficiencies?: boolean;
    };
    contract?: {
      tracked?: boolean;
      latest_status?: string | null;
      satisfied?: boolean;
    };
    optional_activation?: {
      era_complete?: boolean;
      eft_complete?: boolean;
      edi_complete?: boolean;
    };
  } | null;

  const { data: followupPolicyData } = await supabase.rpc("case_followup_policy", {
    p_case_id: id,
  });

  const taskGovernance = taskGovernanceData as {
    current_user_id?: string;
    role?: string;
    can_manage_assignments?: boolean;
    members?: Array<{
      user_id: string;
      role_key: string;
      display_name: string;
    }>;
  } | null;

  const followupPolicy = followupPolicyData as {
    interval_days?: number;
    interval_source?: string;
    next_followup_at?: string | null;
    pending_count?: number;
    is_due?: boolean;
    is_overdue?: boolean;
  } | null;

  const { data: statusTransitionData } = await supabase.rpc("case_allowed_status_transitions", {
    p_case_id: id,
  });

  const statusTransitions = statusTransitionData as {
    current_status?: string;
    role?: string;
    admin_can_override?: boolean;
    allowed?: Array<{
      code: string;
      display_name: string;
      stage: string;
      terminal: boolean;
      transition_group: string;
      description?: string | null;
    }>;
  } | null;

  const allowedStatusTransitions = (statusTransitions?.allowed ?? []).filter(
    (status) => status.code !== "submitted",
  );

  const adminOverrideStatuses = (statuses ?? []).filter(
    (status) =>
      status.code !== caseRow.status_code &&
      status.code !== "submitted" &&
      !allowedStatusTransitions.some((allowed) => allowed.code === status.code),
  );

  const linksByRequirement = new Map<string, any[]>();
  for (const link of documentLinks ?? []) {
    const items = linksByRequirement.get(link.linked_id) ?? [];
    items.push(link);
    linksByRequirement.set(link.linked_id, items);
  }

  return (
    <>
      <PageHeader
        eyebrow="Enrollment case"
        title={subject}
        description={(payer?.display_name ?? "Payer") + " — " + (offering?.name ?? caseRow.state)}
      />

      <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        {[
          ["Client", project?.clients?.name ?? "—"],
          ["Project", project?.name ?? "—"],
          ["State", caseRow.state],
          ["Status", caseRow.status_code.replaceAll("_", " ")],
          ["Priority", caseRow.priority],
          ["Workflow", totalSteps ? completedSteps + "/" + totalSteps : "—"],
        ].map(([label, val]) => (
          <div key={label} className="tba-card p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#667085]">{label}</p>
            <p className="mt-2 text-base font-semibold capitalize text-[#101828]">{val}</p>
          </div>
        ))}
      </section>

      <section className="mb-6 grid gap-6 xl:grid-cols-[1.4fr_.6fr]">
        <div className="tba-card p-6">
          <h2 className="text-lg font-semibold">Overview</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div><p className="text-xs font-semibold uppercase tracking-wide text-[#667085]">Enrollment type</p><p className="mt-1 capitalize">{caseRow.enrollment_type.replaceAll("_", " ")}</p></div>
            <div><p className="text-xs font-semibold uppercase tracking-wide text-[#667085]">Relationship</p><p className="mt-1 capitalize">{caseRow.entity_context.replaceAll("_", " ")}</p></div>
            <div><p className="text-xs font-semibold uppercase tracking-wide text-[#667085]">Network intent</p><p className="mt-1 capitalize">{caseRow.network_intent.replaceAll("_", " ")}</p></div>
            <div><p className="text-xs font-semibold uppercase tracking-wide text-[#667085]">NPI</p><p className="mt-1">{provider?.individual_npi ?? organization?.entity_npi ?? "—"}</p></div>
            <div><p className="text-xs font-semibold uppercase tracking-wide text-[#667085]">Submitted</p><p className="mt-1">{fmt(caseRow.submitted_at)}</p></div>
            <div><p className="text-xs font-semibold uppercase tracking-wide text-[#667085]">Approved</p><p className="mt-1">{fmt(caseRow.approved_at)}</p></div>
            <div><p className="text-xs font-semibold uppercase tracking-wide text-[#667085]">Effective date</p><p className="mt-1">{caseRow.effective_date ?? "—"}</p></div>
            <div><p className="text-xs font-semibold uppercase tracking-wide text-[#667085]">Next follow-up</p><p className="mt-1">{fmt(caseRow.next_followup_at)}</p></div>
          </div>

          {(locations ?? []).length ? (
            <div className="mt-6 border-t border-[#eaecf0] pt-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#667085]">Locations</p>
              <div className="mt-3 grid gap-2">
                {(locations ?? []).map((item: any) => (
                  <div key={item.id} className="rounded-xl bg-[#f9fafb] px-4 py-3 text-sm">
                    <div className="font-medium">{item.locations?.name ?? item.locations?.address_line_1 ?? "Location"}</div>
                    <div className="mt-1 text-[#667085]">
                      {[item.locations?.address_line_1, item.locations?.address_line_2, item.locations?.city, item.locations?.state, item.locations?.zip].filter(Boolean).join(", ")}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="tba-card p-6">
          <h2 className="text-lg font-semibold">Case status</h2>

          <div className={["mt-4 rounded-xl border px-4 py-3 text-sm", readiness?.ready ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"].join(" ")}>
            <p className="font-semibold">
              {readiness?.ready ? "Ready for submission" : "Not ready for submission"}
            </p>
            <p className="mt-1">
              {readiness?.satisfied_required ?? 0} of {readiness?.required_total ?? 0} required items satisfied.
              {!readiness?.ready ? " " + (readiness?.blocker_count ?? 0) + " blocker(s) remain." : ""}
            </p>
          </div>

          {!readiness?.ready && (readiness?.blockers ?? []).length ? (
            <div className="mt-4 rounded-xl bg-[#f9fafb] p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#667085]">Submission blockers</p>
              <ul className="mt-2 space-y-2 text-sm text-[#475467]">
                {(readiness?.blockers ?? []).map((blocker, index) => (
                  <li key={(blocker.requirement_id ?? "system") + "-" + index}>
                    {blocker.title ?? "Requirement"} — {(blocker.status ?? "missing").replaceAll("_", " ")}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="mt-5 space-y-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[#667085]">
                Allowed next statuses
              </p>

              {allowedStatusTransitions.length ? (
                <div className="mt-3 grid gap-3">
                  {allowedStatusTransitions.map((status) => (
                    <form
                      key={status.code}
                      action={updateCaseStatus}
                      className="rounded-xl border border-[#eaecf0] p-4"
                    >
                      <input type="hidden" name="case_id" value={id} />
                      <input type="hidden" name="status_code" value={status.code} />
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-[#101828]">{status.display_name}</p>
                          <p className="mt-1 text-xs capitalize text-[#667085]">
                            {status.transition_group.replaceAll("_", " ")} · {status.stage.replaceAll("_", " ")}
                          </p>
                          {status.description ? (
                            <p className="mt-2 text-sm text-[#667085]">{status.description}</p>
                          ) : null}
                        </div>
                        <SubmitButton
                          idleLabel={"Move to " + status.display_name}
                          pendingLabel="Updating..."
                        />
                      </div>
                    </form>
                  ))}
                </div>
              ) : (
                <div className="mt-3 rounded-xl bg-[#f9fafb] p-4 text-sm text-[#667085]">
                  No standard manual transition is available from this status. Continue using the workflow actions and milestone controls below.
                </div>
              )}
            </div>

            {statusTransitions?.admin_can_override && adminOverrideStatuses.length ? (
              <details className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
                <summary className="cursor-pointer font-semibold text-amber-900">
                  Administrative status override
                </summary>
                <p className="mt-2 text-sm text-amber-900/80">
                  Use only for a documented exception. This bypasses the normal transition matrix and is written to status history as an administrative override.
                </p>

                <form action={updateCaseStatus} className="mt-4 space-y-3">
                  <input type="hidden" name="case_id" value={id} />
                  <div>
                    <label className="tba-label">Override destination</label>
                    <select name="status_code" className="tba-input" required defaultValue="">
                      <option value="" disabled>Select a status</option>
                      {adminOverrideStatuses.map((status) => (
                        <option key={status.code} value={status.code}>
                          {status.display_name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="tba-label">Override reason</label>
                    <textarea
                      name="override_reason"
                      className="tba-input min-h-20"
                      placeholder="Document why the normal workflow sequence is being bypassed."
                      required
                    />
                  </div>

                  <SubmitButton idleLabel="Apply administrative override" pendingLabel="Applying..." />
                </form>
              </details>
            ) : null}
          </div>
        </div>
      </section>


      <section className="tba-card mb-6 p-6">
        <div>
          <h2 className="text-lg font-semibold">Portal access & enrollment channels</h2>
          <p className="mt-1 text-sm text-[#667085]">
            Verified payer resources for this program. Enrollment access and post-enrollment account access are shown separately.
          </p>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          {(portals ?? []).length ? portals!.map((portal: any) => (
            <div key={portal.id} className="rounded-xl border border-[#eaecf0] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-[#101828]">{portal.name}</p>
                  <p className="mt-1 text-xs text-[#667085]">{portal.purpose ?? "Payer portal"}</p>
                </div>
                <span className="rounded-full bg-[#f2f4f7] px-2 py-1 text-xs capitalize text-[#475467]">
                  {portal.automation_level.replaceAll("_", " ")}
                </span>
              </div>

              {portal.instructions ? <p className="mt-3 text-sm text-[#667085]">{portal.instructions}</p> : null}
              {portal.notes ? <p className="mt-2 text-xs text-[#98a2b3]">{portal.notes}</p> : null}

              <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-[#667085]">
                <span>MFA: {portal.mfa_required ? "Required" : "Not flagged"}</span>
                {portal.last_verified_at ? <span>Verified {new Date(portal.last_verified_at).toLocaleDateString()}</span> : null}
              </div>

              {portal.portal_url ? (
                <a
                  href={portal.portal_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-flex rounded-lg border border-[#d0d5dd] px-3 py-2 text-sm font-semibold text-[#344054] hover:bg-[#f9fafb]"
                >
                  Open resource
                </a>
              ) : null}
            </div>
          )) : (
            <div className="lg:col-span-3 rounded-xl bg-[#f9fafb] px-4 py-8 text-center text-sm text-[#667085]">
              No verified portal/resource route has been added for this payer program yet.
            </div>
          )}
        </div>
      </section>

      <section className="tba-card mb-6 p-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Workflow</h2>
            <p className="mt-1 text-sm text-[#667085]">{completedSteps} of {totalSteps} standard steps completed.</p>
          </div>
          {totalSteps ? (
            <div className="w-48 overflow-hidden rounded-full bg-[#eaecf0]">
              <div className="h-2 rounded-full bg-[#175cd3]" style={{ width: Math.round((completedSteps / totalSteps) * 100) + "%" }} />
            </div>
          ) : null}
        </div>

        <div className="mt-5 divide-y divide-[#f2f4f7]">
          {workflowSteps.map((step: any) => (
            <div key={step.id} className="grid gap-4 py-5 lg:grid-cols-[1fr_170px_280px] lg:items-center">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-[#101828]">{step.workflow_step_definitions?.name}</span>
                  {step.workflow_step_definitions?.optional ? <span className="rounded-full bg-[#f2f4f7] px-2 py-0.5 text-xs text-[#667085]">Optional</span> : null}
                </div>
                <p className="mt-1 text-xs capitalize text-[#667085]">
                  {step.workflow_step_definitions?.stage?.replaceAll("_", " ")}
                  {step.due_at ? " · due " + new Date(step.due_at).toLocaleDateString() : ""}
                </p>
                {step.workflow_step_definitions?.instructions ? <p className="mt-2 text-sm text-[#667085]">{step.workflow_step_definitions.instructions}</p> : null}
              </div>

              <span className="capitalize text-sm font-medium text-[#475467]">{step.status.replaceAll("_", " ")}</span>

              <form action={updateWorkflowStep} className="grid gap-2">
                <input type="hidden" name="case_id" value={id} />
                <input type="hidden" name="step_id" value={step.id} />
                <select name="status" className="tba-input !py-2" defaultValue={step.status}>
                  <option value="pending">Pending</option>
                  <option value="in_progress">In progress</option>
                  <option value="blocked">Blocked</option>
                  {![
                    "verify_nppes",
                    "resolve_requirements",
                    "collect_documents",
                    "readiness_review",
                    "submit_application",
                    "capture_confirmation",
                    "payer_followup",
                    "resolve_deficiency",
                    "record_approval",
                    "contracting",
                    "effective_date",
                    "payer_loading",
                    "directory_verify",
                    "claims_test",
                    "era_eft_edi",
                    "operational_complete",
                  ].includes(step.workflow_step_definitions?.step_code) ? (
                    <option value="completed">Completed</option>
                  ) : null}
                  {step.workflow_step_definitions?.optional ? <option value="skipped">Skipped</option> : null}
                  <option value="cancelled">Cancelled</option>
                </select>
                <input
                  name="completion_notes"
                  className="tba-input !py-2"
                  defaultValue={step.completion_notes ?? ""}
                  placeholder="Required for blocked or manual completion"
                />
                {step.workflow_step_definitions?.optional ? (
                  <input
                    name="skipped_reason"
                    className="tba-input !py-2"
                    placeholder="Required when skipping"
                  />
                ) : null}
                <button className="rounded-lg border border-[#d0d5dd] px-3 py-2 text-sm font-semibold hover:bg-[#f9fafb]" type="submit">Save</button>
              </form>
            </div>
          ))}

          {!workflowSteps.length ? <div className="py-8 text-center text-sm text-[#667085]">No workflow steps are attached to this case.</div> : null}
        </div>
      </section>

      <section className="mb-6 grid gap-6 xl:grid-cols-2">
        <div className="tba-card p-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
            <div>
              <h2 className="text-lg font-semibold">Requirements</h2>
              <p className="mt-1 text-sm text-[#667085]">
                Generated from approved knowledge rules and preserved across refreshes.
              </p>
            </div>
            <form action={generateCaseRequirements}>
              <input type="hidden" name="case_id" value={id} />
              <SubmitButton
                idleLabel={(requirements ?? []).length ? "Refresh requirements" : "Generate requirements"}
                pendingLabel="Evaluating rules..."
              />
            </form>
          </div>

          <div className="mt-4 divide-y divide-[#f2f4f7]">
            {(requirements ?? []).length ? requirements!.map((req: any) => (
              <div key={req.id} className="py-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <span className="font-medium text-[#101828]">{req.title}</span>
                    <p className="mt-1 text-xs capitalize text-[#667085]">
                      {req.requirement_type.replaceAll("_", " ")}
                      {req.required ? " · required" : " · optional"}
                    </p>
                  </div>
                  <span className="rounded-full bg-[#f2f4f7] px-2.5 py-1 text-xs font-semibold capitalize text-[#475467]">
                    {req.status.replaceAll("_", " ")}
                  </span>
                </div>

                {req.description ? <p className="mt-2 text-sm text-[#667085]">{req.description}</p> : null}

                {req.requirement_type === "document" ? (
                  <div className="mt-4 rounded-xl bg-[#f9fafb] p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#667085]">Supporting document</p>

                    {(linksByRequirement.get(req.id) ?? []).length ? (
                      <div className="mt-3 grid gap-2">
                        {(linksByRequirement.get(req.id) ?? []).map((link: any) => (
                          <div key={link.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#eaecf0] bg-white px-3 py-2">
                            <div>
                              <p className="text-sm font-medium text-[#101828]">{link.documents?.title ?? "Linked document"}</p>
                              <p className="mt-1 text-xs text-[#667085]">
                                {link.documents?.document_types?.name ?? "Document"}
                                {link.documents?.expiration_date ? " · expires " + link.documents.expiration_date : ""}
                              </p>
                            </div>
                            {link.documents?.external_file_id && link.documents?.storage_connections?.provider === "supabase_storage" ? (
                              <DocumentOpenButton objectPath={link.documents.external_file_id} />
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {(documents ?? []).length ? (
                      <form action={attachExistingDocumentToRequirement} className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                        <input type="hidden" name="case_id" value={id} />
                        <input type="hidden" name="requirement_id" value={req.id} />
                        <select name="document_id" className="tba-input !py-2" defaultValue="" required>
                          <option value="" disabled>Select existing document</option>
                          {(documents ?? []).map((document: any) => (
                            <option key={document.id} value={document.id}>
                              {document.title}
                              {document.document_types?.name ? " — " + document.document_types.name : ""}
                              {document.expiration_date ? " — expires " + document.expiration_date : ""}
                            </option>
                          ))}
                        </select>
                        <input
                          name="reuse_reason"
                          className="tba-input !py-2"
                          placeholder="Reason for reuse"
                          required
                        />
                        <button
                          type="submit"
                          className="rounded-lg border border-[#d0d5dd] px-3 py-2 text-sm font-semibold hover:bg-white"
                        >
                          Approve reuse
                        </button>
                      </form>
                    ) : (
                      <p className="mt-2 text-sm text-[#667085]">
                        No active client documents are available yet. Add the document to the document repository first, then return here to approve reuse.
                      </p>
                    )}
                    <p className="mt-2 text-xs text-[#98a2b3]">
                      Reuse is recorded explicitly. Linking a document moves the requirement to Received; verification remains a human review step.
                    </p>

                    <div className="mt-4 border-t border-[#eaecf0] pt-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-[#667085]">Or upload a new document</p>
                      <div className="mt-3">
                        <DocumentUploadForm
                          tenantId={caseRow.tenant_id}
                          clients={[]}
                          providers={[]}
                          organizations={[]}
                          documentTypes={(documentTypes ?? []).map((type: any) => ({
                            id: type.id,
                            name: type.name,
                          }))}
                          fixedClientId={project?.client_id ?? null}
                          fixedProviderId={caseRow.provider_id}
                          fixedOrganizationId={caseRow.organization_id}
                          caseId={id}
                          requirementId={req.id}
                          defaultTitle={req.title}
                        />
                      </div>
                    </div>
                  </div>
                ) : null}

                {req.source_reason ? (
                  <p className="mt-3 text-xs text-[#667085]">{req.source_reason}</p>
                ) : null}

                {req.knowledge_sources ? (
                  <div className="mt-2 text-xs text-[#475467]">
                    <span className="font-semibold">Source:</span>{" "}
                    {req.knowledge_sources.url ? (
                      <a
                        href={req.knowledge_sources.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#175cd3] underline"
                      >
                        {req.knowledge_sources.title}
                      </a>
                    ) : (
                      req.knowledge_sources.title
                    )}
                    {req.knowledge_sources.last_verified_at
                      ? " · verified " + new Date(req.knowledge_sources.last_verified_at).toLocaleDateString()
                      : ""}
                  </div>
                ) : null}

                <form action={updateRequirementStatus} className="mt-4 grid gap-2 sm:grid-cols-2">
                  <input type="hidden" name="case_id" value={id} />
                  <input type="hidden" name="requirement_id" value={req.id} />
                  <select name="status" className="tba-input !py-2" defaultValue={req.status}>
                    <option value="needed">Needed</option>
                    <option value="requested">Requested</option>
                    <option value="received">Received</option>
                    <option value="verified">Verified</option>
                    <option value="completed">Completed</option>
                    <option value="waived">Waived</option>
                    <option value="not_applicable">Not applicable</option>
                  </select>
                  <input
                    name="waiver_reason"
                    className="tba-input !py-2"
                    placeholder="Waiver reason if waived"
                  />
                  <textarea
                    name="review_note"
                    className="tba-input min-h-20 sm:col-span-2"
                    placeholder="Completion/review note. Required when verifying or completing forms, instructions, questions, fields, portals, or verification items."
                  />
                  <div className="sm:col-span-2">
                    <button
                      type="submit"
                      className="rounded-lg border border-[#d0d5dd] px-3 py-2 text-sm font-semibold hover:bg-[#f9fafb]"
                    >
                      Save requirement
                    </button>
                  </div>
                </form>
              </div>
            )) : (
              <div className="py-8 text-center text-sm text-[#667085]">
                No requirements yet. Run the rules engine to generate them.
              </div>
            )}
          </div>
        </div>

        <div className="tba-card p-6">
          <h2 className="text-lg font-semibold">Tasks</h2>
          <p className="mt-1 text-sm text-[#667085]">
            Governed case work with assignment, escalation, blocked reasons, and completion evidence.
          </p>

          <form action={createCaseTask} className="mt-5 grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="case_id" value={id} />
            <div className="sm:col-span-2">
              <label className="tba-label">Task</label>
              <input name="title" className="tba-input" required />
            </div>
            <div>
              <label className="tba-label">Priority</label>
              <select name="priority" className="tba-input" defaultValue="normal">
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div>
              <label className="tba-label">Due</label>
              <input name="due_at" type="datetime-local" className="tba-input" />
            </div>
            <div className="sm:col-span-2">
              <label className="tba-label">Description</label>
              <textarea name="description" className="tba-input min-h-24" />
            </div>
            <div className="sm:col-span-2">
              <SubmitButton idleLabel="Create task" pendingLabel="Creating task..." />
            </div>
          </form>

          <div className="mt-6 border-t border-[#eaecf0] pt-5">
            <h3 className="font-semibold">Case tasks</h3>
            <div className="mt-3 grid gap-4">
              {(tasks ?? []).length ? tasks!.map((task) => {
                const overdue = !!task.due_at
                  && !["completed", "cancelled"].includes(task.status)
                  && new Date(task.due_at).getTime() < Date.now();

                const assignee = (taskGovernance?.members ?? []).find(
                  (member) => member.user_id === task.assigned_user_id,
                );

                const canSelfManage = ["credentialing_specialist", "reviewer"].includes(taskGovernance?.role ?? "")
                  && (!task.assigned_user_id || task.assigned_user_id === taskGovernance?.current_user_id);

                const canManageAssignment = !!taskGovernance?.can_manage_assignments || canSelfManage;
                const assignmentMembers = taskGovernance?.can_manage_assignments
                  ? (taskGovernance?.members ?? [])
                  : (taskGovernance?.members ?? []).filter(
                      (member) => member.user_id === taskGovernance?.current_user_id,
                    );
                const escalationLevels = taskGovernance?.can_manage_assignments
                  ? [0, 1, 2, 3]
                  : [1, 2, 3].filter((level) => level > (task.escalation_level ?? 0));

                return (
                  <div key={task.id} className="rounded-xl border border-[#eaecf0] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{task.title}</p>
                        <p className="mt-1 text-xs capitalize text-[#667085]">
                          {task.priority} · {task.status.replaceAll("_", " ")}
                          {task.due_at ? " · due " + new Date(task.due_at).toLocaleString() : ""}
                        </p>
                        <p className="mt-1 text-xs text-[#667085]">
                          Assigned to: {assignee?.display_name ?? (task.assigned_user_id ? "Tenant member" : "Unassigned")}
                          {task.escalation_level ? " · escalation level " + task.escalation_level : ""}
                        </p>
                      </div>
                      {overdue ? (
                        <span className="rounded-full bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">Overdue</span>
                      ) : task.escalation_level ? (
                        <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
                          Escalated L{task.escalation_level}
                        </span>
                      ) : null}
                    </div>

                    {task.description ? <p className="mt-3 text-sm text-[#667085]">{task.description}</p> : null}
                    {task.blocked_reason ? <p className="mt-2 text-sm text-amber-800">Blocked: {task.blocked_reason}</p> : null}
                    {task.completion_notes ? <p className="mt-2 text-sm text-emerald-800">Completed: {task.completion_notes}</p> : null}
                    {task.cancellation_reason ? <p className="mt-2 text-sm text-[#667085]">Cancelled: {task.cancellation_reason}</p> : null}
                    {task.escalation_reason ? <p className="mt-2 text-xs text-[#667085]">Escalation: {task.escalation_reason}</p> : null}

                    {!["completed", "cancelled"].includes(task.status) ? (
                      <div className="mt-4 grid gap-3">
                        <form action={updateTaskStatus} className="grid gap-2">
                          <input type="hidden" name="case_id" value={id} />
                          <input type="hidden" name="task_id" value={task.id} />
                          <select name="status" className="tba-input !py-2" defaultValue={task.status}>
                            <option value="open">Open</option>
                            <option value="in_progress">In progress</option>
                            <option value="blocked">Blocked</option>
                            <option value="completed">Completed</option>
                            {["organization_admin", "credentialing_manager"].includes(taskGovernance?.role ?? "") ? (
                              <option value="cancelled">Cancelled</option>
                            ) : null}
                          </select>
                          <input name="completion_notes" className="tba-input !py-2" placeholder="Required when completing" />
                          <input name="blocked_reason" className="tba-input !py-2" placeholder="Required when blocking" />
                          {["organization_admin", "credentialing_manager"].includes(taskGovernance?.role ?? "") ? (
                            <input name="cancellation_reason" className="tba-input !py-2" placeholder="Required when cancelling" />
                          ) : null}
                          <button className="rounded-lg border border-[#d0d5dd] px-3 py-2 text-sm font-semibold hover:bg-[#f9fafb]" type="submit">
                            Update task
                          </button>
                        </form>

                        {canManageAssignment ? (
                          <form action={assignCaseTask} className="grid gap-2 sm:grid-cols-[1fr_auto]">
                            <input type="hidden" name="case_id" value={id} />
                            <input type="hidden" name="task_id" value={task.id} />
                            <select name="assigned_user_id" className="tba-input !py-2" defaultValue={task.assigned_user_id ?? ""}>
                              <option value="">Unassigned</option>
                              {assignmentMembers.map((member) => (
                                <option key={member.user_id} value={member.user_id}>
                                  {member.display_name} · {member.role_key.replaceAll("_", " ")}
                                </option>
                              ))}
                            </select>
                            <button className="rounded-lg border border-[#d0d5dd] px-3 py-2 text-sm font-semibold hover:bg-[#f9fafb]" type="submit">
                              Assign
                            </button>
                          </form>
                        ) : null}

                        <form action={setCaseTaskEscalation} className="grid gap-2 sm:grid-cols-[130px_1fr_auto]">
                          <input type="hidden" name="case_id" value={id} />
                          <input type="hidden" name="task_id" value={task.id} />
                          <select
                            name="escalation_level"
                            className="tba-input !py-2"
                            defaultValue={String(
                              taskGovernance?.can_manage_assignments
                                ? (task.escalation_level ?? 0)
                                : (escalationLevels[0] ?? task.escalation_level ?? 0),
                            )}
                          >
                            {escalationLevels.map((level) => (
                              <option key={level} value={level}>Level {level}</option>
                            ))}
                          </select>
                          <input name="escalation_reason" className="tba-input !py-2" placeholder="Reason required" required />
                          <button className="rounded-lg border border-[#d0d5dd] px-3 py-2 text-sm font-semibold hover:bg-[#f9fafb]" type="submit">
                            Escalate
                          </button>
                        </form>
                      </div>
                    ) : (
                      ["organization_admin", "credentialing_manager"].includes(taskGovernance?.role ?? "") ? (
                        <form action={updateTaskStatus} className="mt-4 grid gap-2 sm:grid-cols-[180px_1fr_auto]">
                          <input type="hidden" name="case_id" value={id} />
                          <input type="hidden" name="task_id" value={task.id} />
                          <select name="status" className="tba-input !py-2" defaultValue="open">
                            <option value="open">Reopen</option>
                            <option value="in_progress">Reopen in progress</option>
                          </select>
                          <input name="reopen_reason" className="tba-input !py-2" placeholder="Reopen reason required" required />
                          <button className="rounded-lg border border-[#d0d5dd] px-3 py-2 text-sm font-semibold hover:bg-[#f9fafb]" type="submit">
                            Reopen
                          </button>
                        </form>
                      ) : null
                    )}
                  </div>
                );
              }) : <p className="text-sm text-[#667085]">No tasks yet.</p>}
            </div>
          </div>
        </div>
      </section>

      <section className="mb-6 grid gap-6 xl:grid-cols-2">
        <div className="tba-card p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Follow-ups</h2>
              <p className="mt-1 text-sm text-[#667085]">
                Default cadence: {followupPolicy?.interval_days ?? 14} days · {(followupPolicy?.interval_source ?? "tenant_default").replaceAll("_", " ")}
              </p>
            </div>
            {followupPolicy?.next_followup_at ? (
              <span className={[
                "rounded-full px-2.5 py-1 text-xs font-semibold",
                followupPolicy.is_overdue ? "bg-red-50 text-red-700" : followupPolicy.is_due ? "bg-amber-50 text-amber-700" : "bg-[#f2f4f7] text-[#475467]",
              ].join(" ")}>
                {followupPolicy.is_overdue ? "Overdue" : followupPolicy.is_due ? "Due" : "Scheduled"} · {fmt(followupPolicy.next_followup_at)}
              </span>
            ) : (
              <span className="rounded-full bg-[#f2f4f7] px-2.5 py-1 text-xs font-semibold text-[#475467]">No pending follow-up</span>
            )}
          </div>

          <form action={scheduleFollowup} className="mt-5 grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="case_id" value={id} />
            <div>
              <label className="tba-label">Schedule</label>
              <input name="scheduled_at" type="datetime-local" className="tba-input" />
              <p className="mt-1 text-xs text-[#667085]">Leave blank when using the default cadence.</p>
            </div>
            <div><label className="tba-label">Method</label><select name="method" className="tba-input" defaultValue="phone"><option value="phone">Phone</option><option value="email">Email</option><option value="portal">Portal</option><option value="fax">Fax</option><option value="mail">Mail</option><option value="other">Other</option></select></div>
            <label className="sm:col-span-2 flex items-start gap-2 text-sm text-[#475467]">
              <input type="checkbox" name="use_default_interval" className="mt-1" />
              <span>Schedule automatically using the current {followupPolicy?.interval_days ?? 14}-day follow-up policy.</span>
            </label>
            <div className="sm:col-span-2"><label className="tba-label">Notes</label><textarea name="notes" className="tba-input min-h-20" /></div>
            <div className="sm:col-span-2"><SubmitButton idleLabel="Schedule follow-up" pendingLabel="Scheduling..." /></div>
          </form>

          <div className="mt-6 border-t border-[#eaecf0] pt-5">
            <div className="grid gap-3">
              {(followups ?? []).length ? followups!.map((followup) => {
                const overdue = !followup.completed_at && new Date(followup.scheduled_at).getTime() < Date.now();
                return (
                <div key={followup.id} className="rounded-xl border border-[#eaecf0] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">Follow-up #{followup.sequence_number}</p>
                      <p className="mt-1 text-xs capitalize text-[#667085]">{followup.method ?? "method not set"} · {fmt(followup.scheduled_at)}</p>
                    </div>
                    <span className={[
                      "text-xs font-semibold",
                      overdue ? "text-red-700" : "text-[#475467]",
                    ].join(" ")}>
                      {followup.completed_at ? "Completed" : overdue ? "Overdue" : "Pending"}
                    </span>
                  </div>

                  {followup.completed_at ? (
                    <div className="mt-3 text-sm text-[#667085]">
                      {followup.outcome ?? followup.notes ?? "Completed"}
                      {followup.next_followup_at ? <p className="mt-1 text-xs">Next requested: {fmt(followup.next_followup_at)}</p> : null}
                    </div>
                  ) : (
                    <form action={completeFollowup} className="mt-4 grid gap-3">
                      <input type="hidden" name="case_id" value={id} />
                      <input type="hidden" name="followup_id" value={followup.id} />
                      <input name="outcome" className="tba-input" placeholder="Outcome" />
                      <textarea name="notes" className="tba-input min-h-20" placeholder="Follow-up notes" />
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className="tba-label">Next follow-up</label>
                          <input name="next_followup_at" type="datetime-local" className="tba-input" />
                        </div>
                        <div>
                          <label className="tba-label">Next method</label>
                          <select name="next_method" className="tba-input" defaultValue={followup.method ?? "phone"}>
                            <option value="phone">Phone</option><option value="email">Email</option><option value="portal">Portal</option><option value="fax">Fax</option><option value="mail">Mail</option><option value="other">Other</option>
                          </select>
                        </div>
                      </div>
                      <label className="flex items-start gap-2 text-sm text-[#475467]">
                        <input type="checkbox" name="schedule_default_next" className="mt-1" />
                        <span>If no date is entered, automatically schedule the next follow-up using the {followupPolicy?.interval_days ?? 14}-day policy.</span>
                      </label>
                      <SubmitButton idleLabel="Complete follow-up" pendingLabel="Completing..." />
                    </form>
                  )}
                </div>
              )}) : <p className="text-sm text-[#667085]">No follow-ups yet.</p>}
            </div>
          </div>
        </div>

        <div className="tba-card p-6">
          <h2 className="text-lg font-semibold">Notes</h2>
          <form action={addCaseNote} className="mt-5 grid gap-4">
            <input type="hidden" name="case_id" value={id} />
            <div><label className="tba-label">Category</label><select name="category" className="tba-input" defaultValue="internal"><option value="internal">Internal</option><option value="payer_call">Payer call</option><option value="client_communication">Client communication</option><option value="followup">Follow-up</option><option value="escalation">Escalation</option><option value="document">Document</option><option value="contract">Contract</option><option value="portal">Portal</option><option value="approval">Approval</option><option value="other">Other</option></select></div>
            <div><label className="tba-label">Note</label><textarea name="body" className="tba-input min-h-28" required /></div>
            <SubmitButton idleLabel="Add note" pendingLabel="Adding note..." />
          </form>

          <div className="mt-6 border-t border-[#eaecf0] pt-5">
            <div className="grid gap-3">
              {(notes ?? []).length ? notes!.map((note) => (
                <div key={note.id} className="rounded-xl bg-[#f9fafb] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold capitalize text-[#475467]">{note.category.replaceAll("_", " ")}</span>
                    <span className="text-xs text-[#98a2b3]">{fmt(note.created_at)}</span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-[#344054]">{note.body}</p>
                </div>
              )) : <p className="text-sm text-[#667085]">No notes yet.</p>}
            </div>
          </div>
        </div>
      </section>

      <section className="tba-card mb-6 p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <h2 className="text-lg font-semibold">Submission</h2>
            <p className="mt-1 text-sm text-[#667085]">
              Record actual payer submission evidence. The case advances to Submitted only when readiness rules allow it.
            </p>
          </div>
          <span className={["rounded-full px-3 py-1 text-xs font-semibold", readiness?.ready ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"].join(" ")}>
            {readiness?.ready ? "Ready" : "Blocked"}
          </span>
        </div>

        <form action={recordCaseSubmission} className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <input type="hidden" name="case_id" value={id} />

          <div>
            <label className="tba-label">Submission method</label>
            <select name="submission_method" className="tba-input" defaultValue="mail" required>
              <option value="secure_email">Secure email</option>
              <option value="email">Email</option>
              <option value="fax">Fax</option>
              <option value="mail">Mail</option>
              <option value="portal">Portal</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label className="tba-label">Submitted date/time</label>
            <input name="submitted_at" type="datetime-local" className="tba-input" required />
          </div>

          <div>
            <label className="tba-label">Recipient / destination</label>
            <input name="recipient" className="tba-input" />
          </div>

          <div>
            <label className="tba-label">Reference / tracking number</label>
            <input name="reference_number" className="tba-input" />
          </div>

          <div className="md:col-span-2 xl:col-span-4">
            <label className="tba-label">Submission notes</label>
            <textarea name="notes" className="tba-input min-h-24" />
          </div>

          {(submissions ?? []).some((submission) => !["cancelled", "superseded"].includes(submission.status)) ? (
            <>
              <div className="md:col-span-2">
                <label className="tba-label">Correction of prior submission</label>
                <select name="supersedes_submission_id" className="tba-input" defaultValue="">
                  <option value="">No — record as a new submission</option>
                  {(submissions ?? [])
                    .filter((submission) => !["cancelled", "superseded"].includes(submission.status))
                    .map((submission) => (
                      <option key={submission.id} value={submission.id}>
                        Submission #{submission.sequence_number} · {submission.status.replaceAll("_", " ")}
                      </option>
                    ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="tba-label">Correction reason</label>
                <input
                  name="correction_reason"
                  className="tba-input"
                  placeholder="Required when superseding a prior submission"
                />
              </div>
            </>
          ) : null}

          {!readiness?.ready ? (
            <div className="md:col-span-2 xl:col-span-4">
              <label className="tba-label">Admin override reason</label>
              <textarea name="override_reason" className="tba-input min-h-20" />
            </div>
          ) : null}

          <div className="md:col-span-2 xl:col-span-4">
            <SubmitButton idleLabel="Record submission + mark Submitted" pendingLabel="Recording submission..." />
          </div>
        </form>

        <div className="mt-6 border-t border-[#eaecf0] pt-5">
          <h3 className="font-semibold">Submission history</h3>
          <div className="mt-3 grid gap-3">
            {(submissions ?? []).length ? submissions!.map((submission) => (
              <div key={submission.id} className="rounded-xl border border-[#eaecf0] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">Submission #{submission.sequence_number}</p>
                    <p className="mt-1 text-xs capitalize text-[#667085]">
                      {submission.submission_method.replaceAll("_", " ")} · {fmt(submission.submitted_at)}
                    </p>
                  </div>
                  <span className="rounded-full bg-[#f2f4f7] px-2 py-1 text-xs font-semibold capitalize text-[#475467]">
                    {submission.status.replaceAll("_", " ")}
                  </span>
                </div>
                {submission.recipient ? <p className="mt-2 text-sm text-[#667085]">Recipient: {submission.recipient}</p> : null}
                {submission.reference_number ? <p className="mt-1 text-sm text-[#667085]">Reference: {submission.reference_number}</p> : null}
                {submission.supersedes_submission_id ? (
                  <p className="mt-1 text-sm text-[#667085]">
                    Correction of prior submission
                  </p>
                ) : null}
                {submission.correction_reason ? (
                  <p className="mt-1 text-sm text-[#667085]">Reason: {submission.correction_reason}</p>
                ) : null}
                {submission.closed_at ? (
                  <p className="mt-1 text-xs text-[#98a2b3]">Closed {fmt(submission.closed_at)}</p>
                ) : null}
                {submission.notes ? <p className="mt-2 whitespace-pre-wrap text-sm text-[#667085]">{submission.notes}</p> : null}

                {!["cancelled", "superseded"].includes(submission.status) ? (
                  <form action={closeCaseSubmission} className="mt-4 grid gap-2 sm:grid-cols-[160px_1fr_auto]">
                    <input type="hidden" name="case_id" value={id} />
                    <input type="hidden" name="submission_id" value={submission.id} />
                    <select name="status" className="tba-input !py-2" defaultValue="cancelled">
                      <option value="cancelled">Cancel record</option>
                      <option value="returned">Returned by payer</option>
                    </select>
                    <input name="reason" className="tba-input !py-2" placeholder="Reason required" required />
                    <button type="submit" className="rounded-lg border border-[#d0d5dd] px-3 py-2 text-sm font-semibold hover:bg-[#f9fafb]">
                      Save
                    </button>
                  </form>
                ) : null}
              </div>
            )) : <p className="text-sm text-[#667085]">No submission has been recorded yet.</p>}
          </div>
        </div>
      </section>

      <section className="mb-6 grid gap-6 xl:grid-cols-2">
        <div id="post-submission-milestones" className="tba-card scroll-mt-6 p-6">
          <h2 className="text-lg font-semibold">Post-submission milestones</h2>
          <p className="mt-1 text-sm text-[#667085]">
            Record payer confirmation, approval, effective date, loading, directory verification, claims testing, and activation milestones.
          </p>

          <form action={recordCaseMilestone} className="mt-5 grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="case_id" value={id} />

            <div>
              <label className="tba-label">Milestone</label>
              <select name="milestone_code" className="tba-input" defaultValue="submission_confirmation" required>
                <option value="submission_confirmation">Submission confirmation</option>
                <option value="credentialing_approval">Credentialing approval</option>
                <option value="effective_date">Effective date</option>
                <option value="payer_loaded">Payer loaded</option>
                <option value="era_complete">ERA complete</option>
                <option value="eft_complete">EFT complete</option>
                <option value="edi_complete">EDI complete</option>
                {activationReadiness?.ready_for_operational_completion ? (
                  <option value="operational_complete">Operational complete</option>
                ) : null}
              </select>
            </div>

            <div>
              <label className="tba-label">Outcome</label>
              <select name="outcome" className="tba-input" defaultValue="completed">
                <option value="completed">Completed</option>
                <option value="passed">Passed</option>
                <option value="failed">Failed</option>
                <option value="not_applicable">Not applicable</option>
              </select>
            </div>

            <div>
              <label className="tba-label">Occurred date/time</label>
              <input name="occurred_at" type="datetime-local" className="tba-input" required />
            </div>

            <div>
              <label className="tba-label">Effective/value date</label>
              <input name="value_date" type="date" className="tba-input" />
            </div>

            <div>
              <label className="tba-label">Related submission</label>
              <select name="submission_id" className="tba-input" defaultValue="">
                <option value="">No specific submission</option>
                {(submissions ?? []).map((submission) => (
                  <option key={submission.id} value={submission.id}>
                    Submission #{submission.sequence_number} · {new Date(submission.submitted_at).toLocaleDateString()}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="tba-label">Reference number</label>
              <input name="reference_number" className="tba-input" />
            </div>

            <div className="sm:col-span-2">
              <label className="tba-label">Notes</label>
              <textarea name="notes" className="tba-input min-h-24" />
            </div>

            <div className="sm:col-span-2">
              <SubmitButton idleLabel="Record milestone" pendingLabel="Recording..." />
            </div>
          </form>

          <div className="mt-6 border-t border-[#eaecf0] pt-5">
            <h3 className="font-semibold">Milestone history</h3>
            <div className="mt-3 grid gap-3">
              {(milestones ?? []).length ? milestones!.map((milestone) => (
                <div key={milestone.id} className="rounded-xl border border-[#eaecf0] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="font-medium capitalize">{milestone.milestone_code.replaceAll("_", " ")}</p>
                    <span className="rounded-full bg-[#f2f4f7] px-2 py-1 text-xs font-semibold capitalize text-[#475467]">
                      {milestone.outcome.replaceAll("_", " ")}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[#667085]">{fmt(milestone.occurred_at)}</p>
                  {milestone.value_date ? <p className="mt-2 text-sm text-[#667085]">Date: {milestone.value_date}</p> : null}
                  {milestone.reference_number ? <p className="mt-1 text-sm text-[#667085]">Reference: {milestone.reference_number}</p> : null}
                  {milestone.notes ? <p className="mt-2 whitespace-pre-wrap text-sm text-[#667085]">{milestone.notes}</p> : null}
                </div>
              )) : <p className="text-sm text-[#667085]">No post-submission milestones recorded yet.</p>}
            </div>
          </div>
        </div>

        <div id="deficiencies" className="tba-card scroll-mt-6 p-6">
          <h2 className="text-lg font-semibold">Deficiencies / additional information</h2>
          <p className="mt-1 text-sm text-[#667085]">
            Track payer requests, response submission, and resolution without losing the original request history.
          </p>

          <form action={createCaseDeficiency} className="mt-5 grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="case_id" value={id} />

            <div className="sm:col-span-2">
              <label className="tba-label">Request title</label>
              <input name="title" className="tba-input" required />
            </div>

            <div>
              <label className="tba-label">Received date/time</label>
              <input name="received_at" type="datetime-local" className="tba-input" required />
            </div>

            <div>
              <label className="tba-label">Due date/time</label>
              <input name="due_at" type="datetime-local" className="tba-input" />
            </div>

            <div className="sm:col-span-2">
              <label className="tba-label">Requested by</label>
              <input name="requested_by" className="tba-input" placeholder="Payer reviewer, portal, department..." />
            </div>

            <div className="sm:col-span-2">
              <label className="tba-label">Description</label>
              <textarea name="description" className="tba-input min-h-24" />
            </div>

            <div className="sm:col-span-2">
              <label className="tba-label">Notes</label>
              <textarea name="notes" className="tba-input min-h-20" />
            </div>

            <div className="sm:col-span-2">
              <SubmitButton idleLabel="Add deficiency" pendingLabel="Adding..." />
            </div>
          </form>

          <div className="mt-6 border-t border-[#eaecf0] pt-5">
            <div className="grid gap-3">
              {(deficiencies ?? []).length ? deficiencies!.map((item) => (
                <div key={item.id} className="rounded-xl border border-[#eaecf0] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">{item.title}</p>
                      <p className="mt-1 text-xs text-[#667085]">
                        Received {fmt(item.received_at)}
                        {item.due_at ? " · due " + fmt(item.due_at) : ""}
                      </p>
                    </div>
                    <span className="rounded-full bg-[#f2f4f7] px-2 py-1 text-xs font-semibold capitalize text-[#475467]">
                      {item.status.replaceAll("_", " ")}
                    </span>
                  </div>

                  {item.description ? <p className="mt-3 text-sm text-[#667085]">{item.description}</p> : null}
                  {item.requested_by ? <p className="mt-2 text-xs text-[#667085]">Requested by: {item.requested_by}</p> : null}

                  {item.prepared_at ? <p className="mt-2 text-xs text-[#667085]">Response prepared {fmt(item.prepared_at)}</p> : null}
                  {item.response_submitted_at ? <p className="mt-1 text-xs text-[#667085]">Response submitted {fmt(item.response_submitted_at)}</p> : null}
                  {item.resolved_at ? <p className="mt-1 text-xs text-[#667085]">Resolved {fmt(item.resolved_at)}</p> : null}
                  {item.waived_at ? <p className="mt-1 text-xs text-[#667085]">Waived {fmt(item.waived_at)}</p> : null}
                  {item.waiver_reason ? <p className="mt-2 text-sm text-[#667085]">Waiver reason: {item.waiver_reason}</p> : null}
                  {item.resolution_notes ? <p className="mt-2 text-sm text-[#667085]">Resolution: {item.resolution_notes}</p> : null}

                  <form action={updateCaseDeficiency} className="mt-4 grid gap-2">
                    <input type="hidden" name="case_id" value={id} />
                    <input type="hidden" name="deficiency_id" value={item.id} />
                    <div className="grid gap-2 sm:grid-cols-2">
                      <select name="status" className="tba-input !py-2" defaultValue={item.status}>
                        <option value="open">Open</option>
                        <option value="response_prepared">Response prepared</option>
                        <option value="response_submitted">Response submitted</option>
                        <option value="resolved">Resolved</option>
                        <option value="waived">Waived</option>
                      </select>
                      <input name="notes" className="tba-input !py-2" defaultValue={item.notes ?? ""} placeholder="Preparation/submission notes" />
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <input name="resolution_notes" className="tba-input !py-2" placeholder="Required when resolving" />
                      <input name="waiver_reason" className="tba-input !py-2" placeholder="Required when waiving" />
                    </div>
                    <button type="submit" className="rounded-lg border border-[#d0d5dd] px-3 py-2 text-sm font-semibold hover:bg-[#f9fafb]">
                      Save deficiency update
                    </button>
                  </form>
                </div>
              )) : <p className="text-sm text-[#667085]">No payer deficiencies recorded.</p>}
            </div>
          </div>
        </div>
      </section>

      <section className="tba-card mb-6 p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <h2 className="text-lg font-semibold">Activation readiness</h2>
            <p className="mt-1 text-sm text-[#667085]">
              Final evidence gates required before this case can be marked operationally complete.
            </p>
          </div>
          <span className={["rounded-full px-3 py-1 text-xs font-semibold", activationReadiness?.ready_for_operational_completion ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"].join(" ")}>
            {activationReadiness?.ready_for_operational_completion ? "Operationally ready" : (activationReadiness?.blocker_count ?? 0) + " blocker(s)"}
          </span>
        </div>

        <p className="mt-4 text-xs text-[#667085]">
          These are evidence-backed status indicators, not manual checkboxes. Use the action on an incomplete gate to record the evidence that completes it.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[
            {
              label: "Credentialing approved",
              complete: activationReadiness?.gates?.credentialing_approved,
              href: "#post-submission-milestones",
              action: "Record approval",
            },
            {
              label: "Effective date confirmed",
              complete: activationReadiness?.gates?.effective_date_confirmed,
              href: "#post-submission-milestones",
              action: "Record effective date",
            },
            {
              label: "Payer loaded",
              complete: activationReadiness?.gates?.payer_loaded,
              href: "#post-submission-milestones",
              action: "Record payer loading",
            },
            {
              label: "Directory verified",
              complete: activationReadiness?.gates?.directory_verified,
              href: "#directory-verification",
              action: "Verify directory",
            },
            {
              label: "Claims test passed",
              complete: activationReadiness?.gates?.claims_test_passed,
              href: "#claims-testing",
              action: "Record claims test",
            },
            {
              label: "No open deficiencies",
              complete: activationReadiness?.gates?.no_open_deficiencies,
              href: "#deficiencies",
              action: "Review deficiencies",
            },
          ].map((gate) => (
            <div
              key={gate.label}
              className={["rounded-xl border px-4 py-3 text-sm", gate.complete ? "border-emerald-200 bg-emerald-50" : "border-[#eaecf0] bg-[#f9fafb]"].join(" ")}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium text-[#101828]">{gate.complete ? "✓ " : "○ "}{gate.label}</p>
                {gate.complete ? (
                  <span className="text-xs font-semibold text-emerald-700">Complete</span>
                ) : (
                  <a href={gate.href} className="text-xs font-semibold text-[#175cd3] underline underline-offset-2">
                    {gate.action}
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-[#eaecf0] p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#667085]">Contracting</p>
            <p className="mt-2 text-sm text-[#344054]">
              {activationReadiness?.contract?.tracked
                ? "Latest status: " + (activationReadiness.contract.latest_status ?? "unknown").replaceAll("_", " ")
                : "No contract record yet."}
            </p>
            <p className="mt-1 text-xs text-[#667085]">
              Contracting is tracked separately because some payer programs may not require a contract.
            </p>
          </div>

          <div className="rounded-xl border border-[#eaecf0] p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#667085]">Optional activation</p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-[#f2f4f7] px-2 py-1">
                ERA {activationReadiness?.optional_activation?.era_complete ? "complete" : "pending"}
              </span>
              <span className="rounded-full bg-[#f2f4f7] px-2 py-1">
                EFT {activationReadiness?.optional_activation?.eft_complete ? "complete" : "pending"}
              </span>
              <span className="rounded-full bg-[#f2f4f7] px-2 py-1">
                EDI {activationReadiness?.optional_activation?.edi_complete ? "complete" : "pending"}
              </span>
            </div>
          </div>
        </div>

        {!activationReadiness?.ready_for_operational_completion && (activationReadiness?.blockers ?? []).length ? (
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Remaining activation blockers</p>
            <ul className="mt-2 grid gap-2 text-sm text-amber-900">
              {(activationReadiness?.blockers ?? []).map((blocker, index) => (
                <li key={(blocker.code ?? "blocker") + "-" + index}>{blocker.title ?? blocker.code}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="mb-6 grid gap-6 xl:grid-cols-3">
        <div className="tba-card p-6">
          <h2 className="text-lg font-semibold">Contracting</h2>
          <p className="mt-1 text-sm text-[#667085]">
            Track contract receipt, review, signature, execution, and effective date.
          </p>

          <form action={createCaseContract} className="mt-5 grid gap-3">
            <input type="hidden" name="case_id" value={id} />
            <input name="contract_name" className="tba-input" placeholder="Contract name" required />

            <select name="status" className="tba-input" defaultValue="pending">
              <option value="pending">Pending</option>
              <option value="under_review">Under review</option>
              <option value="signature_pending">Signature pending</option>
              <option value="executed">Executed</option>
              <option value="not_required">Not required</option>
              <option value="declined">Declined</option>
            </select>

            <input name="received_at" type="datetime-local" className="tba-input" />
            <input name="sent_for_signature_at" type="datetime-local" className="tba-input" />
            <input name="executed_at" type="datetime-local" className="tba-input" />
            <input name="effective_date" type="date" className="tba-input" />
            <input name="reference_number" className="tba-input" placeholder="Contract/reference number" />
            <textarea name="notes" className="tba-input min-h-20" placeholder="Contract notes" />

            <SubmitButton idleLabel="Add contract record" pendingLabel="Saving..." />
          </form>

          <div className="mt-5 grid gap-3 border-t border-[#eaecf0] pt-4">
            {(contracts ?? []).length ? contracts!.map((item) => (
              <div key={item.id} className="rounded-xl border border-[#eaecf0] p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium">{item.contract_name}</p>
                  <span className="text-xs font-semibold capitalize text-[#475467]">
                    {item.status.replaceAll("_", " ")}
                  </span>
                </div>
                {item.reference_number ? <p className="mt-2 text-xs text-[#667085]">Ref: {item.reference_number}</p> : null}
                {item.effective_date ? <p className="mt-1 text-xs text-[#667085]">Effective: {item.effective_date}</p> : null}
              </div>
            )) : <p className="text-sm text-[#667085]">No contract records yet.</p>}
          </div>
        </div>

        <div id="directory-verification" className="tba-card scroll-mt-6 p-6">
          <h2 className="text-lg font-semibold">Directory verification</h2>
          <p className="mt-1 text-sm text-[#667085]">
            Verify the payer directory listing before claims testing.
          </p>

          <form action={recordDirectoryVerification} className="mt-5 grid gap-3">
            <input type="hidden" name="case_id" value={id} />
            <input name="verified_at" type="datetime-local" className="tba-input" required />
            <input name="directory_url" className="tba-input" placeholder="Directory URL" />

            <select name="outcome" className="tba-input" defaultValue="passed">
              <option value="passed">Passed</option>
              <option value="failed">Failed</option>
            </select>

            <label className="flex items-center gap-2 text-sm text-[#475467]">
              <input type="checkbox" name="listing_found" /> Listing found
            </label>
            <label className="flex items-center gap-2 text-sm text-[#475467]">
              <input type="checkbox" name="name_correct" /> Name correct
            </label>
            <label className="flex items-center gap-2 text-sm text-[#475467]">
              <input type="checkbox" name="location_correct" /> Location correct
            </label>
            <label className="flex items-center gap-2 text-sm text-[#475467]">
              <input type="checkbox" name="specialty_correct" /> Specialty correct
            </label>
            <label className="flex items-center gap-2 text-sm text-[#475467]">
              <input type="checkbox" name="network_correct" /> Network correct
            </label>

            <textarea name="notes" className="tba-input min-h-20" placeholder="Directory verification notes" />
            <SubmitButton idleLabel="Record directory check" pendingLabel="Saving..." />
          </form>

          <div className="mt-5 grid gap-3 border-t border-[#eaecf0] pt-4">
            {(directoryVerifications ?? []).length ? directoryVerifications!.map((item) => (
              <div key={item.id} className="rounded-xl border border-[#eaecf0] p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium">{fmt(item.verified_at)}</p>
                  <span className="text-xs font-semibold capitalize text-[#475467]">{item.outcome}</span>
                </div>
                {item.directory_url ? (
                  <a href={item.directory_url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-semibold text-[#175cd3] underline">
                    Open directory
                  </a>
                ) : null}
              </div>
            )) : <p className="text-sm text-[#667085]">No directory checks yet.</p>}
          </div>
        </div>

        <div id="claims-testing" className="tba-card scroll-mt-6 p-6">
          <h2 className="text-lg font-semibold">Claims testing</h2>
          <p className="mt-1 text-sm text-[#667085]">
            Record the first billing/claims connectivity test and payer response.
          </p>

          <form action={recordClaimTest} className="mt-5 grid gap-3">
            <input type="hidden" name="case_id" value={id} />

            <select name="test_type" className="tba-input" defaultValue="professional_837p">
              <option value="professional_837p">Professional 837P</option>
              <option value="institutional_837i">Institutional 837I</option>
              <option value="dental_837d">Dental 837D</option>
              <option value="other">Other</option>
            </select>

            <input name="submitted_at" type="datetime-local" className="tba-input" required />
            <input name="response_at" type="datetime-local" className="tba-input" />

            <select name="outcome" className="tba-input" defaultValue="pending">
              <option value="pending">Pending</option>
              <option value="passed">Passed</option>
              <option value="failed">Failed</option>
            </select>

            <input name="payer_reference" className="tba-input" placeholder="Payer reference" />
            <input name="clearinghouse_reference" className="tba-input" placeholder="Clearinghouse reference" />
            <input name="response_code" className="tba-input" placeholder="Response/denial code" />
            <textarea name="notes" className="tba-input min-h-20" placeholder="Claims test notes" />

            <SubmitButton idleLabel="Record claims test" pendingLabel="Saving..." />
          </form>

          <div className="mt-5 grid gap-3 border-t border-[#eaecf0] pt-4">
            {(claimTests ?? []).length ? claimTests!.map((item) => (
              <div key={item.id} className="rounded-xl border border-[#eaecf0] p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium capitalize">{item.test_type.replaceAll("_", " ")}</p>
                  <span className="text-xs font-semibold capitalize text-[#475467]">{item.outcome}</span>
                </div>
                <p className="mt-1 text-xs text-[#667085]">Submitted {fmt(item.submitted_at)}</p>
                {item.response_code ? <p className="mt-1 text-xs text-[#667085]">Response: {item.response_code}</p> : null}
              </div>
            )) : <p className="text-sm text-[#667085]">No claims tests recorded yet.</p>}
          </div>
        </div>
      </section>

      <section className="tba-card p-6">
        <h2 className="text-lg font-semibold">Timeline</h2>
        <div className="mt-5 grid gap-4">
          {(timeline ?? []).length ? timeline!.map((event) => (
            <div key={event.id} className="grid grid-cols-[12px_1fr] gap-4">
              <div className="mt-1.5 h-3 w-3 rounded-full bg-[#175cd3]" />
              <div className="border-b border-[#f2f4f7] pb-4 last:border-0">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-medium text-[#101828]">{event.title}</p>
                  <p className="text-xs text-[#98a2b3]">{fmt(event.occurred_at)}</p>
                </div>
                <p className="mt-1 text-xs capitalize text-[#667085]">{event.event_type.replaceAll("_", " ")}</p>
                {event.description ? <p className="mt-2 text-sm text-[#667085]">{event.description}</p> : null}
              </div>
            </div>
          )) : <p className="text-sm text-[#667085]">No timeline events yet.</p>}
        </div>
      </section>
    </>
  );
}
