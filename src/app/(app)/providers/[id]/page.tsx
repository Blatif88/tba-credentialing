import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/submit-button";
import { NppesPanel } from "@/components/providers/nppes-panel";
import { updateProviderRecord } from "@/lib/actions/intake";
import { createClient } from "@/lib/supabase/server";

export default async function ProviderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: provider }, { data: clients }] = await Promise.all([
    supabase
      .from("providers")
      .select("id,client_id,first_name,middle_name,last_name,suffix,credential,individual_npi,caqh_id,status,credentialing_readiness_percent,nppes_verification_status,nppes_last_verified_at,nppes_last_snapshot_id")
      .eq("id", id)
      .single(),
    supabase.from("clients").select("id,name").is("archived_at", null).order("name"),
  ]);

  if (!provider) notFound();

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
          <div className="md:col-span-2 xl:col-span-4">
            <SubmitButton idleLabel="Save provider" pendingLabel="Saving provider..." />
          </div>
        </form>
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
