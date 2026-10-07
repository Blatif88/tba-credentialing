import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/submit-button";
import {
  addCaseNote,
  attachExistingDocumentToRequirement,
  completeFollowup,
  createCaseContract,
  createCaseDeficiency,
  createCaseTask,
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
    supabase.from("workflow_instances").select("id,status,started_at,completed_at,workflow_step_instances(id,status,started_at,due_at,completed_at,completion_notes,workflow_step_definitions(name,stage,sequence,optional,instructions))").eq("case_id", id).order("created_at", { ascending: true }),
    supabase.from("case_requirements").select("id,requirement_type,title,description,required,status,sequence,source_reason,knowledge_sources(title,url,last_verified_at)").eq("case_id", id).order("sequence"),
    supabase.from("tasks").select("id,title,description,priority,status,due_at,completed_at").eq("case_id", id).order("created_at", { ascending: false }),
    supabase.from("followups").select("id,sequence_number,scheduled_at,completed_at,method,outcome,notes,next_followup_at,escalation_level").eq("case_id", id).order("sequence_number", { ascending: false }),
    supabase.from("notes").select("id,category,body,created_at").eq("subject_type", "case").eq("subject_id", id).order("created_at", { ascending: false }),
    supabase.from("timeline_events").select("id,event_type,title,description,occurred_at,metadata").eq("case_id", id).order("occurred_at", { ascending: false }),
    supabase.from("case_locations").select("id,included,locations(name,address_line_1,address_line_2,city,state,zip)").eq("case_id", id),
    supabase
      .from("portals")
      .select("id,name,portal_url,purpose,instructions,notes,mfa_required,automation_level,last_verified_at")
      .eq("payer_offering_id", caseRow.payer_offering_id)
      .eq("state", caseRow.state)
      .eq("status", "active")
      .order("name"),
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
      .select("id,sequence_number,submission_method,submitted_at,recipient,reference_number,notes,status")
      .eq("case_id", id)
      .order("sequence_number", { ascending: false }),
    supabase
      .from("case_milestones")
      .select("id,milestone_code,outcome,occurred_at,value_date,reference_number,notes,submission_id")
      .eq("case_id", id)
      .order("occurred_at", { ascending: false }),
    supabase
      .from("case_deficiencies")
      .select("id,title,description,requested_by,received_at,due_at,status,response_submitted_at,resolved_at,notes,submission_id")
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

          <form action={updateCaseStatus} className="mt-5 space-y-4">
            <input type="hidden" name="case_id" value={id} />
            <div>
              <label className="tba-label">Status</label>
              <select name="status_code" className="tba-input" defaultValue={caseRow.status_code}>
                {(statuses ?? [])
                  .filter((status) => status.code !== "submitted")
                  .map((status) => <option key={status.code} value={status.code}>{status.display_name}</option>)}
              </select>
            </div>

            <div>
              <label className="tba-label">Admin override reason</label>
              <textarea
                name="override_reason"
                className="tba-input min-h-20"
                placeholder="Only used if an organization admin intentionally advances a case despite readiness blockers."
              />
            </div>

            <SubmitButton idleLabel="Update status" pendingLabel="Updating..." />
          </form>
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

              <form action={updateWorkflowStep} className="flex gap-2">
                <input type="hidden" name="case_id" value={id} />
                <input type="hidden" name="step_id" value={step.id} />
                <select name="status" className="tba-input !py-2" defaultValue={step.status}>
                  <option value="pending">Pending</option>
                  <option value="in_progress">In progress</option>
                  <option value="blocked">Blocked</option>
                  <option value="completed">Completed</option>
                  <option value="skipped">Skipped</option>
                  <option value="cancelled">Cancelled</option>
                </select>
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
          <h2 className="text-lg font-semibold">Create task</h2>
          <form action={createCaseTask} className="mt-5 grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="case_id" value={id} />
            <div className="sm:col-span-2"><label className="tba-label">Task</label><input name="title" className="tba-input" required /></div>
            <div><label className="tba-label">Priority</label><select name="priority" className="tba-input" defaultValue="normal"><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></div>
            <div><label className="tba-label">Due</label><input name="due_at" type="datetime-local" className="tba-input" /></div>
            <div className="sm:col-span-2"><label className="tba-label">Description</label><textarea name="description" className="tba-input min-h-24" /></div>
            <div className="sm:col-span-2"><SubmitButton idleLabel="Create task" pendingLabel="Creating task..." /></div>
          </form>

          <div className="mt-6 border-t border-[#eaecf0] pt-5">
            <h3 className="font-semibold">Case tasks</h3>
            <div className="mt-3 grid gap-3">
              {(tasks ?? []).length ? tasks!.map((task) => (
                <div key={task.id} className="rounded-xl border border-[#eaecf0] p-4">
                  <div className="flex justify-between gap-3">
                    <div>
                      <p className="font-medium">{task.title}</p>
                      <p className="mt-1 text-xs capitalize text-[#667085]">{task.priority} · {task.status.replaceAll("_", " ")}{task.due_at ? " · due " + new Date(task.due_at).toLocaleString() : ""}</p>
                    </div>
                    <form action={updateTaskStatus}>
                      <input type="hidden" name="case_id" value={id} />
                      <input type="hidden" name="task_id" value={task.id} />
                      <select name="status" className="tba-input !py-2" defaultValue={task.status}>
                        <option value="open">Open</option>
                        <option value="in_progress">In progress</option>
                        <option value="blocked">Blocked</option>
                        <option value="completed">Completed</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                      <button className="mt-2 w-full rounded-lg border border-[#d0d5dd] px-2 py-1 text-xs font-semibold">Save</button>
                    </form>
                  </div>
                  {task.description ? <p className="mt-3 text-sm text-[#667085]">{task.description}</p> : null}
                </div>
              )) : <p className="text-sm text-[#667085]">No tasks yet.</p>}
            </div>
          </div>
        </div>
      </section>

      <section className="mb-6 grid gap-6 xl:grid-cols-2">
        <div className="tba-card p-6">
          <h2 className="text-lg font-semibold">Follow-ups</h2>
          <form action={scheduleFollowup} className="mt-5 grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="case_id" value={id} />
            <div><label className="tba-label">Schedule</label><input name="scheduled_at" type="datetime-local" className="tba-input" required /></div>
            <div><label className="tba-label">Method</label><select name="method" className="tba-input" defaultValue="phone"><option value="phone">Phone</option><option value="email">Email</option><option value="portal">Portal</option><option value="fax">Fax</option><option value="mail">Mail</option><option value="other">Other</option></select></div>
            <div className="sm:col-span-2"><label className="tba-label">Notes</label><textarea name="notes" className="tba-input min-h-20" /></div>
            <div className="sm:col-span-2"><SubmitButton idleLabel="Schedule follow-up" pendingLabel="Scheduling..." /></div>
          </form>

          <div className="mt-6 border-t border-[#eaecf0] pt-5">
            <div className="grid gap-3">
              {(followups ?? []).length ? followups!.map((followup) => (
                <div key={followup.id} className="rounded-xl border border-[#eaecf0] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">Follow-up #{followup.sequence_number}</p>
                      <p className="mt-1 text-xs capitalize text-[#667085]">{followup.method ?? "method not set"} · {fmt(followup.scheduled_at)}</p>
                    </div>
                    <span className="text-xs font-semibold text-[#475467]">{followup.completed_at ? "Completed" : "Pending"}</span>
                  </div>

                  {followup.completed_at ? (
                    <div className="mt-3 text-sm text-[#667085]">{followup.outcome ?? followup.notes ?? "Completed"}</div>
                  ) : (
                    <form action={completeFollowup} className="mt-4 grid gap-3">
                      <input type="hidden" name="case_id" value={id} />
                      <input type="hidden" name="followup_id" value={followup.id} />
                      <input name="outcome" className="tba-input" placeholder="Outcome" />
                      <input name="next_followup_at" type="datetime-local" className="tba-input" />
                      <textarea name="notes" className="tba-input min-h-20" placeholder="Follow-up notes" />
                      <SubmitButton idleLabel="Complete follow-up" pendingLabel="Completing..." />
                    </form>
                  )}
                </div>
              )) : <p className="text-sm text-[#667085]">No follow-ups yet.</p>}
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
                {submission.notes ? <p className="mt-2 whitespace-pre-wrap text-sm text-[#667085]">{submission.notes}</p> : null}
              </div>
            )) : <p className="text-sm text-[#667085]">No submission has been recorded yet.</p>}
          </div>
        </div>
      </section>

      <section className="mb-6 grid gap-6 xl:grid-cols-2">
        <div className="tba-card p-6">
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
                <option value="operational_complete">Operational complete</option>
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

        <div className="tba-card p-6">
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

                  <form action={updateCaseDeficiency} className="mt-4 grid gap-2 sm:grid-cols-[1fr_1.5fr_auto]">
                    <input type="hidden" name="case_id" value={id} />
                    <input type="hidden" name="deficiency_id" value={item.id} />
                    <select name="status" className="tba-input !py-2" defaultValue={item.status}>
                      <option value="open">Open</option>
                      <option value="response_prepared">Response prepared</option>
                      <option value="response_submitted">Response submitted</option>
                      <option value="resolved">Resolved</option>
                      <option value="waived">Waived</option>
                    </select>
                    <input name="notes" className="tba-input !py-2" defaultValue={item.notes ?? ""} placeholder="Update notes" />
                    <button type="submit" className="rounded-lg border border-[#d0d5dd] px-3 py-2 text-sm font-semibold hover:bg-[#f9fafb]">
                      Save
                    </button>
                  </form>
                </div>
              )) : <p className="text-sm text-[#667085]">No payer deficiencies recorded.</p>}
            </div>
          </div>
        </div>
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

        <div className="tba-card p-6">
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

        <div className="tba-card p-6">
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
