import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/submit-button";
import {
  addCaseNote,
  completeFollowup,
  createCaseTask,
  generateCaseRequirements,
  scheduleFollowup,
  updateCaseStatus,
  updateRequirementStatus,
  updateTaskStatus,
  updateWorkflowStep,
} from "@/lib/actions/cases";
import { createClient } from "@/lib/supabase/server";

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
      "id,tenant_id,project_id,provider_id,organization_id,payer_id,payer_offering_id,enrollment_type,network_intent,entity_context,state,status_code,priority,submitted_at,approved_at,effective_date,next_followup_at,providers(first_name,last_name,credential,individual_npi),organizations(legal_name,entity_npi),payer_organizations(display_name),payer_offerings(name),credentialing_projects(name,clients(name))"
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
  ] = await Promise.all([
    supabase.from("case_status_definitions").select("code,display_name,stage,terminal,sort_order").eq("active", true).order("sort_order"),
    supabase.from("workflow_instances").select("id,status,started_at,completed_at,workflow_step_instances(id,status,started_at,due_at,completed_at,completion_notes,workflow_step_definitions(name,stage,sequence,optional,instructions))").eq("case_id", id).order("created_at", { ascending: true }),
    supabase.from("case_requirements").select("id,requirement_type,title,description,required,status,sequence,source_reason,knowledge_sources(title,url,last_verified_at)").eq("case_id", id).order("sequence"),
    supabase.from("tasks").select("id,title,description,priority,status,due_at,completed_at").eq("case_id", id).order("created_at", { ascending: false }),
    supabase.from("followups").select("id,sequence_number,scheduled_at,completed_at,method,outcome,notes,next_followup_at,escalation_level").eq("case_id", id).order("sequence_number", { ascending: false }),
    supabase.from("notes").select("id,category,body,created_at").eq("subject_type", "case").eq("subject_id", id).order("created_at", { ascending: false }),
    supabase.from("timeline_events").select("id,event_type,title,description,occurred_at,metadata").eq("case_id", id).order("occurred_at", { ascending: false }),
    supabase.from("case_locations").select("id,included,locations(name,address_line_1,address_line_2,city,state,zip)").eq("case_id", id),
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
          <form action={updateCaseStatus} className="mt-5 space-y-4">
            <input type="hidden" name="case_id" value={id} />
            <div>
              <label className="tba-label">Status</label>
              <select name="status_code" className="tba-input" defaultValue={caseRow.status_code}>
                {(statuses ?? []).map((status) => <option key={status.code} value={status.code}>{status.display_name}</option>)}
              </select>
            </div>
            <SubmitButton idleLabel="Update status" pendingLabel="Updating..." />
          </form>
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

                <form action={updateRequirementStatus} className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
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
                  <button
                    type="submit"
                    className="rounded-lg border border-[#d0d5dd] px-3 py-2 text-sm font-semibold hover:bg-[#f9fafb]"
                  >
                    Save
                  </button>
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
