import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/submit-button";
import { NppesPanel } from "@/components/providers/nppes-panel";
import { updateProviderRecord } from "@/lib/actions/intake";
import { addProviderAffiliation, changeProviderAffiliationStatus } from "@/lib/actions/affiliations";
import { createClient } from "@/lib/supabase/server";

export default async function ProviderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: provider }, { data: clients }, { data: providerTypes }, { data: specialties }] = await Promise.all([
    supabase
      .from("providers")
      .select("id,client_id,first_name,middle_name,last_name,suffix,credential,individual_npi,caqh_id,provider_type_id,primary_specialty_id,status,credentialing_readiness_percent,nppes_verification_status,nppes_last_verified_at,nppes_last_snapshot_id")
      .eq("id", id)
      .single(),
    supabase.from("clients").select("id,name").is("archived_at", null).order("name"),
    supabase.from("provider_types").select("id,name,code").eq("active", true).eq("subject_type", "individual").order("name"),
    supabase.from("specialties").select("id,name,code").eq("active", true).order("name"),
  ]);

  if (!provider) notFound();

  const [
    { data: affiliations, error: affiliationError },
    { data: organizations, error: organizationError },
    { data: caseRows, error: caseError },
  ] = await Promise.all([
    supabase.from("provider_affiliations")
      .select("id,organization_id,affiliation_type,effective_from,effective_to,status,primary_affiliation,organizations(legal_name,entity_npi)")
      .eq("provider_id", id).is("archived_at", null)
      .order("created_at", { ascending: false }).limit(100),
    provider.client_id
      ? supabase.from("organizations")
        .select("id,legal_name,entity_npi")
        .eq("client_id", provider.client_id).is("archived_at", null).order("legal_name").limit(100)
      : Promise.resolve({ data: [], error: null }),
    supabase.from("enrollment_cases")
      .select("id,organization_id,state,status_code,entity_context,payer_organizations(display_name)")
      .eq("provider_id", id).is("archived_at", null)
      .order("created_at", { ascending: false }).limit(100),
  ]);
  const busyOrganizationIds = new Set((affiliations ?? [])
    .filter((row) => row.status === "current" || row.status === "pending")
    .map((row) => row.organization_id));
  const eligibleOrganizations = (organizations ?? []).filter((org) => !busyOrganizationIds.has(org.id));

  let comparisons: Array<{
    id: string;
    field_name: string;
    internal_value: unknown;
    nppes_value: unknown;
    comparison_status: string;
    user_decision: string | null;
  }> = [];

  if (provider.nppes_last_snapshot_id) {
    const { data } = await supabase
      .from("nppes_comparisons")
      .select("id,field_name,internal_value,nppes_value,comparison_status,user_decision")
      .eq("nppes_snapshot_id", provider.nppes_last_snapshot_id)
      .order("created_at");

    comparisons = data ?? [];
  }

  const displayName = [
    provider.first_name,
    provider.middle_name,
    provider.last_name,
    provider.suffix,
    provider.credential,
  ].filter(Boolean).join(" ");

  return (
    <>
      <PageHeader
        eyebrow="Provider"
        title={displayName}
        description="Provider identity, credentialing readiness, client assignment, and NPPES review."
      />

      <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["NPI", provider.individual_npi ?? "—"],
          ["CAQH ID", provider.caqh_id ?? "—"],
          ["Readiness", `${Number(provider.credentialing_readiness_percent)}%`],
          ["Status", provider.status],
        ].map(([label, value]) => (
          <div key={label} className="tba-card p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#667085]">{label}</p>
            <p className="mt-2 text-lg font-semibold capitalize text-[#101828]">{value}</p>
          </div>
        ))}
      </section>

      <section className="tba-card mb-6 p-6">
        <h2 className="text-lg font-semibold">Provider profile</h2>
        <form action={updateProviderRecord} className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <input type="hidden" name="provider_id" value={provider.id} />

          <div>
            <label className="tba-label">Client</label>
            <select name="client_id" className="tba-input" defaultValue={provider.client_id ?? ""}>
              <option value="">No client selected</option>
              {(clients ?? []).map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
            </select>
          </div>
          <div>
            <label className="tba-label">First name</label>
            <input name="first_name" className="tba-input" defaultValue={provider.first_name} required />
          </div>
          <div>
            <label className="tba-label">Middle name</label>
            <input name="middle_name" className="tba-input" defaultValue={provider.middle_name ?? ""} />
          </div>
          <div>
            <label className="tba-label">Last name</label>
            <input name="last_name" className="tba-input" defaultValue={provider.last_name} required />
          </div>
          <div>
            <label className="tba-label">Suffix</label>
            <input name="suffix" className="tba-input" defaultValue={provider.suffix ?? ""} />
          </div>
          <div>
            <label className="tba-label">Credential</label>
            <input name="credential" className="tba-input" defaultValue={provider.credential ?? ""} />
          </div>
          <div>
            <label className="tba-label">NPI</label>
            <input name="individual_npi" className="tba-input" defaultValue={provider.individual_npi ?? ""} inputMode="numeric" pattern="[0-9]{10}" />
          </div>
          <div>
            <label className="tba-label">CAQH ID</label>
            <input name="caqh_id" className="tba-input" defaultValue={provider.caqh_id ?? ""} />
          </div>
          <div>
            <label className="tba-label">Provider type</label>
            <select name="provider_type_id" className="tba-input" defaultValue={provider.provider_type_id ?? ""}>
              <option value="">Not set</option>
              {(providerTypes ?? []).map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="tba-label">Primary specialty</label>
            <select name="primary_specialty_id" className="tba-input" defaultValue={provider.primary_specialty_id ?? ""}>
              <option value="">Not set</option>
              {(specialties ?? []).map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2 xl:col-span-4">
            <SubmitButton idleLabel="Save provider" pendingLabel="Saving provider..." />
          </div>
        </form>
      </section>

      <section className="tba-card mt-6 p-6">
        <h2 className="text-lg font-semibold">Medical group affiliations</h2>
        <p className="mt-1 text-sm text-[#667085]">
          Record employment or group relationships separately from payer enrollment approval. A group affiliation does not enroll this provider with a payer.
        </p>
        {affiliationError || organizationError ? <p role="alert" className="mt-4 text-sm text-[#b42318]">Could not load all affiliation records. Refresh and check access.</p> : null}
        {(affiliations ?? []).length ? <div className="mt-5 space-y-3">
          {(affiliations ?? []).map((affiliation) => {
            const group = (Array.isArray(affiliation.organizations) ? affiliation.organizations[0] : affiliation.organizations) as { legal_name?: string; entity_npi?: string | null } | null;
            return <div key={affiliation.id} className="rounded-xl border border-[#eaecf0] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-[#101828]">{group?.legal_name ?? "Organization"}</p>
                <span className="rounded-full bg-[#f2f4f7] px-2.5 py-1 text-xs font-semibold capitalize text-[#475467]">{affiliation.status}</span>
              </div>
              <p className="mt-1 text-sm text-[#667085]">
                {(affiliation.affiliation_type ?? "Unspecified").replaceAll("_", " ")}
                {" · NPI "}{group?.entity_npi ?? "not entered"}
                {" · Start "}{affiliation.effective_from ?? "not set"}
                {affiliation.effective_to ? " · End " + affiliation.effective_to : ""}
              </p>
              {affiliation.status === "pending" ? <div className="mt-3 flex flex-wrap gap-3">
                <form action={changeProviderAffiliationStatus}>
                  <input type="hidden" name="provider_id" value={id} />
                  <input type="hidden" name="affiliation_id" value={affiliation.id} />
                  <input type="hidden" name="next_status" value="current" />
                  <SubmitButton idleLabel="Activate affiliation" pendingLabel="Activating..." />
                </form>
              </div> : null}
              {affiliation.status === "current" || affiliation.status === "pending" ? <form action={changeProviderAffiliationStatus} className="mt-3 flex flex-wrap items-end gap-3">
                <input type="hidden" name="provider_id" value={id} />
                <input type="hidden" name="affiliation_id" value={affiliation.id} />
                <input type="hidden" name="next_status" value="historical" />
                <div><label className="tba-label">End date</label><input type="date" name="effective_to" className="tba-input" /></div>
                <SubmitButton idleLabel="Mark historical" pendingLabel="Saving..." />
              </form> : null}
            </div>;
          })}
        </div> : <p className="mt-4 text-sm text-[#667085]">No group affiliations recorded yet.</p>}

        <h3 className="mt-8 font-semibold">Add group affiliation</h3>
        {!provider.client_id ? <p className="mt-2 text-sm text-[#b54708]">Assign this provider to a client above before linking a medical group.</p>
          : !eligibleOrganizations.length ? <p className="mt-2 text-sm text-[#667085]">No eligible medical groups are available for this client. Create an organization under the same client or review existing links in the Organizations section.</p>
            : <form action={addProviderAffiliation} className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <input type="hidden" name="provider_id" value={id} />
              <div className="xl:col-span-2"><label className="tba-label">Medical group</label>
                <select name="organization_id" className="tba-input" required defaultValue="">
                  <option value="" disabled>Select organization</option>
                  {eligibleOrganizations.map((org) => <option key={org.id} value={org.id}>{org.legal_name}{org.entity_npi ? " · NPI " + org.entity_npi : ""}</option>)}
                </select></div>
              <div><label className="tba-label">Relationship</label>
                <select name="affiliation_type" className="tba-input" defaultValue="employed">
                  <option value="employed">Employed</option><option value="contracted">Contracted</option>
                  <option value="medical_staff">Medical staff</option><option value="other">Other</option>
                </select></div>
              <div><label className="tba-label">Status</label>
                <select name="status" className="tba-input" defaultValue="current">
                  <option value="current">Current</option><option value="pending">Pending</option>
                </select></div>
              <div><label className="tba-label">Effective start date</label>
                <input type="date" name="effective_from" className="tba-input" /></div>
              <div className="md:col-span-2 xl:col-span-4">
                <SubmitButton idleLabel="Add affiliation" pendingLabel="Adding affiliation..." />
              </div>
            </form>}
      </section>

      <section className="tba-card mt-6 overflow-hidden">
        <div className="border-b border-[#eaecf0] p-6">
          <h2 className="text-lg font-semibold">Provider payer enrollment cases</h2>
          <p className="mt-1 text-sm text-[#667085]">Separate enrollment status for this provider with each payer. Group names are context, not proof of enrollment.</p>
        </div>
        {caseError ? <p role="alert" className="p-5 text-sm text-[#b42318]">Could not load payer enrollment cases.</p> : null}
        {(caseRows ?? []).length ? (caseRows ?? []).map((item) => {
          const payer = (Array.isArray(item.payer_organizations) ? item.payer_organizations[0] : item.payer_organizations) as { display_name?: string } | null;
          const linkedGroup = (affiliations ?? []).find((affiliation) => affiliation.organization_id === item.organization_id);
          const group = linkedGroup
            ? (Array.isArray(linkedGroup.organizations) ? linkedGroup.organizations[0] : linkedGroup.organizations) as { legal_name?: string } | null
            : null;
          return <Link key={item.id} href={`/enrollment-cases/${item.id}`} className="block border-b border-[#eaecf0] px-6 py-4 text-sm last:border-0 hover:bg-[#f9fafb]">
            <div className="flex flex-wrap justify-between gap-2">
              <span className="font-semibold text-[#175cd3]">{payer?.display_name ?? "Payer not specified"} · {item.state}</span>
              <span className="capitalize text-[#475467]">{item.status_code.replaceAll("_", " ")}</span>
            </div>
            <p className="mt-1 text-xs text-[#667085]">{item.entity_context.replaceAll("_", " ")}{item.organization_id ? " · Group: " + (group?.legal_name ?? "See case details") : " · Individual context"}</p>
          </Link>;
        }) : <p className="p-5 text-sm text-[#667085]">No provider payer enrollment cases yet. Create a project and case from Projects.</p>}
      </section>

      <NppesPanel
        providerId={provider.id}
        npi={provider.individual_npi}
        status={provider.nppes_verification_status}
        comparisons={comparisons}
      />

      <section className="tba-card mt-6 p-6">
        <h2 className="text-lg font-semibold">Verification history</h2>
        <p className="mt-2 text-sm text-[#667085]">
          {provider.nppes_last_verified_at
            ? `Last checked ${new Date(provider.nppes_last_verified_at).toLocaleString()}.`
            : "This provider has not been checked against NPPES yet."}
        </p>
      </section>
    </>
  );
}
