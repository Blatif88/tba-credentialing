import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/submit-button";
import {
  cloneGlobalRuleToTenantDraft,
  createNextTenantRuleVersion,
  setTenantRuleVersionStatus,
  updateTenantRuleDraft,
} from "@/lib/actions/knowledge";
import { createClient } from "@/lib/supabase/server";

function fmt(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function prettyValue(value: unknown) {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

export default async function PayerProgramDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) notFound();

  const [{ data: snapshotData, error }, { data: membership }] = await Promise.all([
    supabase.rpc("payer_program_admin_snapshot", { p_offering_id: id }),
    supabase
      .from("tenant_memberships")
      .select("tenant_id,role_key,status")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .single(),
  ]);

  if (error || !snapshotData) notFound();

  const snapshot = snapshotData as any;
  const program = snapshot.program;
  const portals = (snapshot.portals ?? []) as any[];
  const sources = (snapshot.sources ?? []) as any[];
  const rules = (snapshot.rules ?? []) as any[];
  const isAdmin = membership?.role_key === "organization_admin";

  const tenantOverrideParents = new Set(
    rules
      .filter((rule) => rule.scope === "tenant" && rule.supersedes_rule_id)
      .map((rule) => rule.supersedes_rule_id),
  );

  const grouped = new Map<string, any[]>();
  for (const rule of rules) {
    const items = grouped.get(rule.knowledge_rule_id) ?? [];
    items.push(rule);
    grouped.set(rule.knowledge_rule_id, items);
  }

  return (
    <>
      <PageHeader
        eyebrow="Payer program governance"
        title={program.payer_name + " — " + program.offering_name}
        description={
          (program.state ?? "Federal") +
          " · " +
          (program.program_name ?? program.offering_type) +
          " · official sources, portal routes, and versioned requirement rules"
        }
        action={
          <Link
            href="/payer-programs"
            className="rounded-lg border border-[#d0d5dd] px-4 py-2 text-sm font-semibold text-[#344054] hover:bg-[#f9fafb]"
          >
            Back to catalog
          </Link>
        }
      />

      <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ["Jurisdiction", program.state ?? "Federal"],
          ["Program", program.program_name ?? program.offering_name],
          ["Rules / versions", String(rules.length)],
          ["Official sources", String(sources.filter((s) => s.authority_level === "official").length)],
          ["Portal resources", String(portals.length)],
        ].map(([label, value]) => (
          <div key={label} className="tba-card p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#667085]">{label}</p>
            <p className="mt-2 text-base font-semibold text-[#101828]">{value}</p>
          </div>
        ))}
      </section>

      <section className="mb-6 grid gap-6 xl:grid-cols-2">
        <div className="tba-card p-6">
          <h2 className="text-lg font-semibold">Official portal resources</h2>
          <p className="mt-1 text-sm text-[#667085]">
            Verified operational destinations used by enrollment cases for this payer program.
          </p>

          <div className="mt-5 grid gap-4">
            {portals.length ? portals.map((portal) => (
              <div key={portal.id} className="rounded-xl border border-[#eaecf0] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-[#101828]">{portal.name}</p>
                    <p className="mt-1 text-xs text-[#667085]">
                      {portal.state ?? "Federal"} · {portal.automation_level.replaceAll("_", " ")}
                      {portal.mfa_required ? " · MFA" : ""}
                    </p>
                  </div>
                  <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                    {portal.status}
                  </span>
                </div>

                {portal.purpose ? <p className="mt-3 text-sm text-[#475467]">{portal.purpose}</p> : null}
                {portal.instructions ? <p className="mt-2 text-sm text-[#667085]">{portal.instructions}</p> : null}

                <div className="mt-3 flex flex-wrap items-center gap-3">
                  {portal.url ? (
                    <a
                      href={portal.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-semibold text-[#175cd3] underline underline-offset-2"
                    >
                      Open official resource
                    </a>
                  ) : null}
                  <span className="text-xs text-[#667085]">
                    Verified {fmt(portal.last_verified_at)}
                  </span>
                </div>
              </div>
            )) : <p className="text-sm text-[#667085]">No active portal resources recorded.</p>}
          </div>
        </div>

        <div className="tba-card p-6">
          <h2 className="text-lg font-semibold">Knowledge sources</h2>
          <p className="mt-1 text-sm text-[#667085]">
            Source-of-truth material supporting the production rules below.
          </p>

          <div className="mt-5 grid gap-3">
            {sources.length ? sources.map((source) => (
              <div key={source.id} className="rounded-xl border border-[#eaecf0] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-[#101828]">{source.title}</p>
                    <p className="mt-1 text-xs capitalize text-[#667085]">
                      {source.authority_level.replaceAll("_", " ")} · {source.source_type.replaceAll("_", " ")}
                    </p>
                  </div>
                  <span className="rounded-full bg-[#f2f4f7] px-2 py-1 text-xs font-semibold capitalize text-[#475467]">
                    {source.scope}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-3">
                  {source.url ? (
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-semibold text-[#175cd3] underline underline-offset-2"
                    >
                      Open source
                    </a>
                  ) : null}
                  <span className="text-xs text-[#667085]">
                    Verified {fmt(source.last_verified_at)}
                  </span>
                </div>
              </div>
            )) : <p className="text-sm text-[#667085]">No program-specific sources recorded.</p>}
          </div>
        </div>
      </section>

      <section className="tba-card mb-6 p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <h2 className="text-lg font-semibold">Rules & versions</h2>
            <p className="mt-1 max-w-3xl text-sm text-[#667085]">
              Global rules are shared production knowledge. Organization admins can clone a global rule into a tenant draft,
              edit its operational wording, submit it for review, and approve a tenant version. An approved tenant override
              suppresses its global parent only for this tenant.
            </p>
          </div>
          <span className={["rounded-full px-3 py-1 text-xs font-semibold", isAdmin ? "bg-blue-50 text-blue-700" : "bg-[#f2f4f7] text-[#475467]"].join(" ")}>
            {isAdmin ? "Admin governance enabled" : "Read only"}
          </span>
        </div>

        <div className="mt-6 grid gap-5">
          {Array.from(grouped.entries()).map(([ruleId, versions]) => {
            const sorted = [...versions].sort((a, b) => b.version_number - a.version_number);
            const latest = sorted[0];
            const isTenantRule = latest.scope === "tenant";
            const hasTenantOverride = tenantOverrideParents.has(ruleId);
            const hasDraft = sorted.some((version) => version.version_status === "draft");
            const effectIds = latest.effects.map((effect: any) => effect.id).join(",");

            return (
              <article key={ruleId} className="rounded-2xl border border-[#eaecf0] p-5">
                <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold text-[#101828]">{latest.name}</h3>
                      <span className={["rounded-full px-2 py-1 text-xs font-semibold", isTenantRule ? "bg-violet-50 text-violet-700" : "bg-[#f2f4f7] text-[#475467]"].join(" ")}>
                        {isTenantRule ? "Tenant override" : "Global"}
                      </span>
                      <span className="rounded-full bg-[#f2f4f7] px-2 py-1 text-xs font-semibold capitalize text-[#475467]">
                        {latest.category.replaceAll("_", " ")}
                      </span>
                    </div>
                    {latest.description ? <p className="mt-2 text-sm text-[#667085]">{latest.description}</p> : null}
                  </div>

                  {!isTenantRule && isAdmin && !hasTenantOverride && latest.version_status === "approved" ? (
                    <form action={cloneGlobalRuleToTenantDraft}>
                      <input type="hidden" name="payer_offering_id" value={id} />
                      <input type="hidden" name="rule_version_id" value={latest.rule_version_id} />
                      <SubmitButton idleLabel="Create tenant override" pendingLabel="Cloning..." />
                    </form>
                  ) : null}

                  {isTenantRule && isAdmin && !hasDraft && latest.version_status === "approved" ? (
                    <form action={createNextTenantRuleVersion}>
                      <input type="hidden" name="payer_offering_id" value={id} />
                      <input type="hidden" name="knowledge_rule_id" value={latest.knowledge_rule_id} />
                      <SubmitButton idleLabel="Create next version" pendingLabel="Creating..." />
                    </form>
                  ) : null}
                </div>

                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  <div className="rounded-xl bg-[#f9fafb] p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#667085]">Conditions</p>
                    <div className="mt-2 grid gap-2">
                      {latest.conditions.length ? latest.conditions.map((condition: any) => (
                        <p key={condition.id} className="text-sm text-[#475467]">
                          <span className="font-medium">{condition.field}</span>{" "}
                          <span className="text-[#667085]">{condition.operator}</span>{" "}
                          <code className="rounded bg-white px-1 py-0.5 text-xs">{prettyValue(condition.value)}</code>
                        </p>
                      )) : <p className="text-sm text-[#667085]">Universal rule — no conditions.</p>}
                    </div>
                  </div>

                  <div className="rounded-xl bg-[#f9fafb] p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#667085]">Version history</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {sorted.map((version) => (
                        <span
                          key={version.rule_version_id}
                          className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold capitalize text-[#475467]"
                        >
                          v{version.version_number} · {version.version_status.replaceAll("_", " ")}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {latest.scope === "tenant" && latest.version_status === "draft" && isAdmin ? (
                  <form action={updateTenantRuleDraft} className="mt-5 rounded-xl border border-violet-200 bg-violet-50/40 p-4">
                    <input type="hidden" name="payer_offering_id" value={id} />
                    <input type="hidden" name="knowledge_rule_id" value={latest.knowledge_rule_id} />
                    <input type="hidden" name="rule_version_id" value={latest.rule_version_id} />
                    <input type="hidden" name="effect_ids" value={effectIds} />

                    <div className="grid gap-4 lg:grid-cols-2">
                      <div>
                        <label className="tba-label">Rule name</label>
                        <input name="rule_name" className="tba-input" defaultValue={latest.name} required />
                      </div>
                      <div>
                        <label className="tba-label">Version summary</label>
                        <input name="summary" className="tba-input" defaultValue={latest.summary ?? ""} />
                      </div>
                      <div className="lg:col-span-2">
                        <label className="tba-label">Rule description</label>
                        <textarea name="rule_description" className="tba-input min-h-20" defaultValue={latest.description ?? ""} />
                      </div>
                      <div>
                        <label className="tba-label">Effective from</label>
                        <input name="effective_from" type="date" className="tba-input" defaultValue={latest.effective_from ?? ""} />
                      </div>
                      <div>
                        <label className="tba-label">Effective to</label>
                        <input name="effective_to" type="date" className="tba-input" defaultValue={latest.effective_to ?? ""} />
                      </div>
                      <div className="lg:col-span-2">
                        <label className="tba-label">Change reason</label>
                        <textarea name="change_reason" className="tba-input min-h-20" defaultValue={latest.change_reason ?? ""} />
                      </div>
                    </div>

                    <div className="mt-5 grid gap-4">
                      {latest.effects.map((effect: any) => (
                        <div key={effect.id} className="rounded-xl border border-[#eaecf0] bg-white p-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-medium capitalize">{effect.effect_type.replaceAll("_", " ")}</p>
                            <span className="text-xs text-[#667085]">{effect.payload?.requirement_key ?? "No requirement key"}</span>
                          </div>
                          <div className="mt-3 grid gap-3 lg:grid-cols-2">
                            <div>
                              <label className="tba-label">Title</label>
                              <input
                                name={"effect_title_" + effect.id}
                                className="tba-input"
                                defaultValue={effect.payload?.title ?? ""}
                                required
                              />
                            </div>
                            <div>
                              <label className="tba-label">Severity</label>
                              <select name={"effect_severity_" + effect.id} className="tba-input" defaultValue={effect.severity}>
                                <option value="info">Info</option>
                                <option value="normal">Normal</option>
                                <option value="warning">Warning</option>
                                <option value="critical">Critical</option>
                              </select>
                            </div>
                            <div className="lg:col-span-2">
                              <label className="tba-label">Description</label>
                              <textarea
                                name={"effect_description_" + effect.id}
                                className="tba-input min-h-20"
                                defaultValue={effect.payload?.description ?? ""}
                              />
                            </div>
                            <div>
                              <label className="tba-label">Required</label>
                              <select
                                name={"effect_required_" + effect.id}
                                className="tba-input"
                                defaultValue={effect.payload?.required === false ? "false" : "true"}
                              >
                                <option value="true">Required</option>
                                <option value="false">Optional</option>
                              </select>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-4">
                      <SubmitButton idleLabel="Save draft changes" pendingLabel="Saving..." />
                    </div>
                  </form>
                ) : (
                  <div className="mt-5 grid gap-3">
                    {latest.effects.map((effect: any) => (
                      <div key={effect.id} className="rounded-xl border border-[#eaecf0] p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="font-medium text-[#101828]">{effect.payload?.title ?? effect.effect_type}</p>
                            <p className="mt-1 text-xs capitalize text-[#667085]">
                              {effect.effect_type.replaceAll("_", " ")} · {effect.severity}
                            </p>
                          </div>
                          <span className="rounded-full bg-[#f2f4f7] px-2 py-1 text-xs font-semibold text-[#475467]">
                            {effect.payload?.required === false ? "Optional" : "Required"}
                          </span>
                        </div>
                        {effect.payload?.description ? (
                          <p className="mt-2 text-sm text-[#667085]">{effect.payload.description}</p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}

                {latest.source ? (
                  <div className="mt-4 rounded-xl bg-[#f9fafb] p-4 text-sm text-[#667085]">
                    <span className="font-medium text-[#344054]">Source:</span>{" "}
                    {latest.source.url ? (
                      <a href={latest.source.url} target="_blank" rel="noreferrer" className="font-semibold text-[#175cd3] underline">
                        {latest.source.title}
                      </a>
                    ) : latest.source.title}
                    {" · "}verified {fmt(latest.source.last_verified_at)}
                  </div>
                ) : null}

                {latest.scope === "tenant" && isAdmin ? (
                  <div className="mt-4 flex flex-wrap gap-3 border-t border-[#eaecf0] pt-4">
                    {latest.version_status === "draft" ? (
                      <form action={setTenantRuleVersionStatus} className="flex flex-wrap gap-2">
                        <input type="hidden" name="payer_offering_id" value={id} />
                        <input type="hidden" name="rule_version_id" value={latest.rule_version_id} />
                        <input type="hidden" name="status" value="pending_review" />
                        <input name="change_reason" className="tba-input !w-64 !py-2" placeholder="Review note / change reason" />
                        <SubmitButton idleLabel="Submit for review" pendingLabel="Submitting..." />
                      </form>
                    ) : null}

                    {latest.version_status === "pending_review" ? (
                      <>
                        <form action={setTenantRuleVersionStatus}>
                          <input type="hidden" name="payer_offering_id" value={id} />
                          <input type="hidden" name="rule_version_id" value={latest.rule_version_id} />
                          <input type="hidden" name="status" value="approved" />
                          <input type="hidden" name="change_reason" value="Approved by organization administrator." />
                          <SubmitButton idleLabel="Approve version" pendingLabel="Approving..." />
                        </form>
                        <form action={setTenantRuleVersionStatus}>
                          <input type="hidden" name="payer_offering_id" value={id} />
                          <input type="hidden" name="rule_version_id" value={latest.rule_version_id} />
                          <input type="hidden" name="status" value="rejected" />
                          <input type="hidden" name="change_reason" value="Rejected during organization review." />
                          <SubmitButton idleLabel="Reject" pendingLabel="Rejecting..." />
                        </form>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </article>
            );
          })}

          {!rules.length ? <p className="text-sm text-[#667085]">No matching rules were found for this program.</p> : null}
        </div>
      </section>
    </>
  );
}
