import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/submit-button";
import {
  reviewKnowledgeSource,
  reviewPortalResource,
  setPortalChangeProposalStatus,
  updatePortalChangeProposal,
} from "@/lib/actions/knowledge";
import { createClient } from "@/lib/supabase/server";

function fmt(value?: string | null) {
  if (!value) return "Never";
  return new Date(value).toLocaleString();
}

export default async function KnowledgeReviewPage() {
  const supabase = await createClient();
  const [
    { data, error },
    { data: portalData, error: portalError },
  ] = await Promise.all([
    supabase.rpc("knowledge_review_snapshot", { p_stale_days: 90 }),
    supabase.rpc("portal_review_snapshot", { p_stale_days: 90 }),
  ]);

  if (error) throw new Error(error.message);
  if (portalError) throw new Error(portalError.message);

  const snapshot = (data ?? {}) as any;
  const portalSnapshot = (portalData ?? {}) as any;
  const counts = snapshot.counts ?? {};
  const drafts = snapshot.drafts ?? [];
  const pending = snapshot.pending_review ?? [];
  const approved = snapshot.approved_overrides ?? [];
  const sourceActions = snapshot.source_actions ?? [];
  const staleSources = snapshot.stale_sources ?? [];
  const stalePortals = portalSnapshot.stale_portals ?? [];
  const portalActions = portalSnapshot.actions ?? [];
  const portalCounts = portalSnapshot.counts ?? {};

  return (
    <>
      <PageHeader
        eyebrow="Knowledge governance"
        title="Knowledge Review"
        description="Central review queue for tenant rule changes, approved overrides, and official sources or portals that are due for re-verification."
      />

      <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        {[
          ["Drafts", counts.drafts ?? 0],
          ["Pending review", counts.pending_review ?? 0],
          ["Approved overrides", counts.approved_overrides ?? 0],
          ["Source actions", counts.source_actions ?? 0],
          ["Stale sources", counts.stale_sources ?? 0],
          ["Portal actions", portalCounts.portal_actions ?? 0],
          ["Stale portals", portalCounts.stale_portals ?? 0],
        ].map(([label, value]) => (
          <div key={String(label)} className="tba-card p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#667085]">{label}</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-[#101828]">{String(value)}</p>
          </div>
        ))}
      </section>

      <section className="mb-6 grid gap-6 xl:grid-cols-2">
        <div className="tba-card p-6">
          <h2 className="text-lg font-semibold">Draft rule versions</h2>
          <p className="mt-1 text-sm text-[#667085]">Tenant-scoped changes that still need editing or review submission.</p>

          <div className="mt-5 grid gap-3">
            {drafts.length ? drafts.map((item: any) => (
              <div key={item.rule_version_id} className="rounded-xl border border-[#eaecf0] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-[#101828]">{item.name}</p>
                    <p className="mt-1 text-xs text-[#667085]">
                      v{item.version_number} · {item.payer_name ?? "Universal"}{item.state ? " · " + item.state : ""}
                    </p>
                  </div>
                  <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
                    Draft
                  </span>
                </div>
                <p className="mt-2 text-xs text-[#667085]">Updated {fmt(item.updated_at)}</p>
                {item.offering_id ? (
                  <Link
                    href={"/payer-programs/" + item.offering_id}
                    className="mt-3 inline-block text-sm font-semibold text-[#175cd3] underline underline-offset-2"
                  >
                    Open program
                  </Link>
                ) : null}
              </div>
            )) : <p className="text-sm text-[#667085]">No draft tenant rule versions.</p>}
          </div>
        </div>

        <div className="tba-card p-6">
          <h2 className="text-lg font-semibold">Pending review</h2>
          <p className="mt-1 text-sm text-[#667085]">Tenant rule versions waiting for administrator decision.</p>

          <div className="mt-5 grid gap-3">
            {pending.length ? pending.map((item: any) => (
              <div key={item.rule_version_id} className="rounded-xl border border-[#eaecf0] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-[#101828]">{item.name}</p>
                    <p className="mt-1 text-xs text-[#667085]">
                      v{item.version_number} · {item.payer_name ?? "Universal"}{item.state ? " · " + item.state : ""}
                    </p>
                  </div>
                  <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">
                    Pending review
                  </span>
                </div>
                {item.change_reason ? <p className="mt-2 text-sm text-[#667085]">{item.change_reason}</p> : null}
                {item.offering_id ? (
                  <Link
                    href={"/payer-programs/" + item.offering_id}
                    className="mt-3 inline-block text-sm font-semibold text-[#175cd3] underline underline-offset-2"
                  >
                    Review in program
                  </Link>
                ) : null}
              </div>
            )) : <p className="text-sm text-[#667085]">Nothing is waiting for review.</p>}
          </div>
        </div>
      </section>

      <section className="mb-6 tba-card p-6">
        <h2 className="text-lg font-semibold">Approved tenant overrides</h2>
        <p className="mt-1 text-sm text-[#667085]">
          Active tenant-specific rules that supersede their global production parent.
        </p>

        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {approved.length ? approved.map((item: any) => (
            <div key={item.rule_version_id} className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-[#101828]">{item.name}</p>
                  <p className="mt-1 text-xs text-[#667085]">
                    v{item.version_number} · {item.payer_name ?? "Universal"}{item.state ? " · " + item.state : ""}
                  </p>
                </div>
                <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800">
                  Approved
                </span>
              </div>
              <p className="mt-2 text-xs text-[#667085]">Approved {fmt(item.approved_at)}</p>
              {item.offering_id ? (
                <Link
                  href={"/payer-programs/" + item.offering_id}
                  className="mt-3 inline-block text-sm font-semibold text-[#175cd3] underline underline-offset-2"
                >
                  Open program
                </Link>
              ) : null}
            </div>
          )) : <p className="text-sm text-[#667085]">No approved tenant overrides.</p>}
        </div>
      </section>

      <section className="mb-6 tba-card p-6">
        <h2 className="text-lg font-semibold">Source changes requiring action</h2>
        <p className="mt-1 text-sm text-[#667085]">
          Reviews where an official source changed, became unavailable, or needs follow-up. Existing approved rules stay active until any proposed replacement version is approved.
        </p>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {sourceActions.length ? sourceActions.map((item: any) => (
            <div key={item.review_id} className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-[#101828]">{item.source_title}</p>
                  <p className="mt-1 text-xs text-[#667085]">
                    {item.payer_name ?? "Knowledge source"}{item.state ? " · " + item.state : ""}
                  </p>
                </div>
                <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold capitalize text-amber-800">
                  {String(item.outcome).replaceAll("_", " ")}
                </span>
              </div>

              <p className="mt-3 text-sm text-[#475467]">{item.summary}</p>
              <p className="mt-2 text-xs text-[#667085]">Reviewed {fmt(item.reviewed_at)}</p>

              <div className="mt-4 grid gap-2">
                {(item.proposals ?? []).length ? (item.proposals ?? []).map((proposal: any, index: number) => (
                  <div key={(proposal.proposed_rule_version_id ?? proposal.source_rule_version_id) + "-" + index} className="rounded-lg border border-amber-200 bg-white p-3 text-sm">
                    <p className="font-medium text-[#344054]">
                      {proposal.proposed_rule_name ?? "Rule review required"}
                    </p>
                    <p className="mt-1 text-xs capitalize text-[#667085]">
                      {String(proposal.proposal_action).replaceAll("_", " ")}
                      {proposal.proposed_status ? " · " + String(proposal.proposed_status).replaceAll("_", " ") : ""}
                    </p>
                  </div>
                )) : (
                  <p className="text-sm text-[#667085]">No rule proposal was created automatically. Manual review is required.</p>
                )}
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                {item.reviewed_url ? (
                  <a href={item.reviewed_url} target="_blank" rel="noreferrer" className="text-sm font-semibold text-[#175cd3] underline">
                    Open reviewed source
                  </a>
                ) : null}
                {item.offering_id ? (
                  <Link href={"/payer-programs/" + item.offering_id} className="text-sm font-semibold text-[#175cd3] underline">
                    Open proposed rule
                  </Link>
                ) : null}
              </div>
            </div>
          )) : <p className="text-sm text-[#667085]">No source changes currently require action.</p>}
        </div>
      </section>

      <section className="mb-6 tba-card p-6">
        <h2 className="text-lg font-semibold">Portal changes requiring action</h2>
        <p className="mt-1 text-sm text-[#667085]">
          Portal changes remain proposals until approved. The current portal stays active until a tenant override is approved.
        </p>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {portalActions.length ? portalActions.map((item: any) => {
            const proposal = item.proposal;
            return (
              <div key={item.review_id} className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-[#101828]">{item.portal_name}</p>
                    <p className="mt-1 text-xs text-[#667085]">
                      {item.payer_name ?? "Portal"}{item.state ? " · " + item.state : ""}
                    </p>
                  </div>
                  <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold capitalize text-amber-800">
                    {String(item.outcome).replaceAll("_", " ")}
                  </span>
                </div>

                <p className="mt-3 text-sm text-[#475467]">{item.summary}</p>

                {proposal?.status === "draft" ? (
                  <form action={updatePortalChangeProposal} className="mt-4 grid gap-3 rounded-xl border border-amber-200 bg-white p-4">
                    <input type="hidden" name="proposal_id" value={proposal.id} />
                    <div>
                      <label className="tba-label">Portal name</label>
                      <input name="proposed_name" className="tba-input" defaultValue={proposal.proposed_name ?? ""} required />
                    </div>
                    <div>
                      <label className="tba-label">Portal URL</label>
                      <input name="proposed_url" className="tba-input" defaultValue={proposal.proposed_url ?? ""} />
                    </div>
                    <div>
                      <label className="tba-label">Purpose</label>
                      <textarea name="proposed_purpose" className="tba-input min-h-20" defaultValue={proposal.proposed_purpose ?? ""} />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="tba-label">MFA</label>
                        <select name="proposed_mfa_required" className="tba-input" defaultValue={proposal.proposed_mfa_required ? "true" : "false"}>
                          <option value="true">Required</option>
                          <option value="false">Not required</option>
                        </select>
                      </div>
                      <div>
                        <label className="tba-label">Automation level</label>
                        <select name="proposed_automation_level" className="tba-input" defaultValue={proposal.proposed_automation_level ?? "manual"}>
                          <option value="manual">Manual</option>
                          <option value="assisted">Assisted</option>
                          <option value="api">API</option>
                          <option value="browser_automation">Browser automation</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="tba-label">Instructions</label>
                      <textarea name="proposed_instructions" className="tba-input min-h-24" defaultValue={proposal.proposed_instructions ?? ""} />
                    </div>
                    <div>
                      <label className="tba-label">Notes</label>
                      <textarea name="proposed_notes" className="tba-input min-h-20" defaultValue={proposal.proposed_notes ?? ""} />
                    </div>
                    <div>
                      <label className="tba-label">Change reason</label>
                      <textarea name="change_reason" className="tba-input min-h-20" defaultValue={proposal.change_reason ?? item.summary ?? ""} />
                    </div>
                    <SubmitButton idleLabel="Save portal draft" pendingLabel="Saving..." />
                  </form>
                ) : proposal ? (
                  <div className="mt-4 rounded-xl border border-amber-200 bg-white p-4 text-sm">
                    <p className="font-medium text-[#344054]">{proposal.proposed_name}</p>
                    <p className="mt-1 text-xs capitalize text-[#667085]">{String(proposal.status).replaceAll("_", " ")}</p>
                    {proposal.proposed_url ? <p className="mt-2 break-all text-xs text-[#667085]">{proposal.proposed_url}</p> : null}
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-[#667085]">No automatic portal proposal was created.</p>
                )}

                {proposal?.status === "draft" ? (
                  <form action={setPortalChangeProposalStatus} className="mt-3">
                    <input type="hidden" name="proposal_id" value={proposal.id} />
                    <input type="hidden" name="status" value="pending_review" />
                    <input type="hidden" name="change_reason" value={proposal.change_reason ?? item.summary ?? ""} />
                    <SubmitButton idleLabel="Submit portal for review" pendingLabel="Submitting..." />
                  </form>
                ) : null}

                {proposal?.status === "pending_review" ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <form action={setPortalChangeProposalStatus}>
                      <input type="hidden" name="proposal_id" value={proposal.id} />
                      <input type="hidden" name="status" value="approved" />
                      <input type="hidden" name="change_reason" value={proposal.change_reason ?? item.summary ?? ""} />
                      <SubmitButton idleLabel="Approve portal override" pendingLabel="Approving..." />
                    </form>
                    <form action={setPortalChangeProposalStatus}>
                      <input type="hidden" name="proposal_id" value={proposal.id} />
                      <input type="hidden" name="status" value="rejected" />
                      <input type="hidden" name="change_reason" value="Rejected during portal review." />
                      <SubmitButton idleLabel="Reject" pendingLabel="Rejecting..." />
                    </form>
                  </div>
                ) : null}
              </div>
            );
          }) : <p className="text-sm text-[#667085]">No portal changes currently require action.</p>}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="tba-card p-6">
          <h2 className="text-lg font-semibold">Official sources due for re-verification</h2>
          <p className="mt-1 text-sm text-[#667085]">
            Active or unverified knowledge sources not verified within the last {snapshot.stale_days ?? 90} days.
          </p>

          <div className="mt-5 grid gap-3">
            {staleSources.length ? staleSources.map((item: any) => (
              <div key={item.id} className="rounded-xl border border-[#eaecf0] p-4">
                <p className="font-medium text-[#101828]">{item.title}</p>
                <p className="mt-1 text-xs capitalize text-[#667085]">
                  {(item.authority_level ?? "unknown").replaceAll("_", " ")} · {(item.source_type ?? "source").replaceAll("_", " ")}
                </p>
                <p className="mt-2 text-xs text-[#667085]">
                  Catalog verified: {fmt(item.last_verified_at)}
                  {item.last_tenant_reviewed_at ? " · Tenant reviewed: " + fmt(item.last_tenant_reviewed_at) : ""}
                </p>
                <div className="mt-3 flex flex-wrap gap-3">
                  {item.url ? (
                    <a href={item.url} target="_blank" rel="noreferrer" className="text-sm font-semibold text-[#175cd3] underline">
                      Open source
                    </a>
                  ) : null}
                  {item.offering_id ? (
                    <Link href={"/payer-programs/" + item.offering_id} className="text-sm font-semibold text-[#175cd3] underline">
                      Open program
                    </Link>
                  ) : null}
                </div>

                {snapshot.is_admin ? (
                  <form action={reviewKnowledgeSource} className="mt-4 grid gap-3 border-t border-[#eaecf0] pt-4">
                    <input type="hidden" name="source_id" value={item.id} />
                    <input type="hidden" name="reviewed_url" value={item.url ?? ""} />

                    <div>
                      <label className="tba-label">Review outcome</label>
                      <select name="outcome" className="tba-input" defaultValue="no_change">
                        <option value="no_change">No change</option>
                        <option value="change_detected">Change detected</option>
                        <option value="unavailable">Source unavailable</option>
                        <option value="needs_followup">Needs follow-up</option>
                      </select>
                    </div>

                    <div>
                      <label className="tba-label">Review summary</label>
                      <textarea
                        name="summary"
                        className="tba-input min-h-20"
                        placeholder="What did you verify or what changed?"
                        required
                      />
                    </div>

                    <label className="flex items-start gap-2 text-sm text-[#475467]">
                      <input type="checkbox" name="create_proposals" className="mt-1" />
                      <span>Create draft rule proposals automatically when the outcome is Change detected.</span>
                    </label>

                    <SubmitButton idleLabel="Record source review" pendingLabel="Recording..." />
                  </form>
                ) : null}
              </div>
            )) : <p className="text-sm text-[#667085]">No stale sources under the current threshold.</p>}
          </div>
        </div>

        <div className="tba-card p-6">
          <h2 className="text-lg font-semibold">Portal resources due for re-verification</h2>
          <p className="mt-1 text-sm text-[#667085]">
            Active portal resources not verified within the last {snapshot.stale_days ?? 90} days.
          </p>

          <div className="mt-5 grid gap-3">
            {stalePortals.length ? stalePortals.map((item: any) => (
              <div key={item.id} className="rounded-xl border border-[#eaecf0] p-4">
                <p className="font-medium text-[#101828]">{item.name}</p>
                <p className="mt-1 text-xs text-[#667085]">
                  {item.payer_name ?? "Payer"}{item.state ? " · " + item.state : ""}
                </p>
                <p className="mt-2 text-xs text-[#667085]">
                  Catalog verified: {fmt(item.last_verified_at)}
                  {item.last_tenant_reviewed_at ? " · Tenant reviewed: " + fmt(item.last_tenant_reviewed_at) : ""}
                </p>
                <div className="mt-3 flex flex-wrap gap-3">
                  {item.url ? (
                    <a href={item.url} target="_blank" rel="noreferrer" className="text-sm font-semibold text-[#175cd3] underline">
                      Open portal
                    </a>
                  ) : null}
                  {item.offering_id ? (
                    <Link href={"/payer-programs/" + item.offering_id} className="text-sm font-semibold text-[#175cd3] underline">
                      Open program
                    </Link>
                  ) : null}
                </div>

                {portalSnapshot.is_admin ? (
                  <form action={reviewPortalResource} className="mt-4 grid gap-3 border-t border-[#eaecf0] pt-4">
                    <input type="hidden" name="portal_id" value={item.id} />
                    <div>
                      <label className="tba-label">Observed portal URL</label>
                      <input name="reviewed_url" className="tba-input" defaultValue={item.url ?? ""} />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="tba-label">Observed MFA</label>
                        <select name="observed_mfa_required" className="tba-input" defaultValue={item.mfa_required ? "true" : "false"}>
                          <option value="true">Required</option>
                          <option value="false">Not required</option>
                        </select>
                      </div>
                      <div>
                        <label className="tba-label">Observed automation</label>
                        <select name="observed_automation_level" className="tba-input" defaultValue={item.automation_level ?? "manual"}>
                          <option value="manual">Manual</option>
                          <option value="assisted">Assisted</option>
                          <option value="api">API</option>
                          <option value="browser_automation">Browser automation</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="tba-label">Review outcome</label>
                      <select name="outcome" className="tba-input" defaultValue="no_change">
                        <option value="no_change">No change</option>
                        <option value="change_detected">Change detected</option>
                        <option value="unavailable">Portal unavailable</option>
                        <option value="needs_followup">Needs follow-up</option>
                      </select>
                    </div>
                    <div>
                      <label className="tba-label">Review summary</label>
                      <textarea name="summary" className="tba-input min-h-20" required />
                    </div>
                    <label className="flex items-start gap-2 text-sm text-[#475467]">
                      <input type="checkbox" name="create_proposal" className="mt-1" />
                      <span>Create a tenant portal override proposal when Change detected is selected.</span>
                    </label>
                    <SubmitButton idleLabel="Record portal review" pendingLabel="Recording..." />
                  </form>
                ) : null}
              </div>
            )) : <p className="text-sm text-[#667085]">No stale portal resources under the current threshold.</p>}
          </div>
        </div>
      </section>
    </>
  );
}
