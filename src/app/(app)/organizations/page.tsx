import { PageHeader } from "@/components/page-header";
import { CreateOrganizationForm } from "@/components/intake/duplicate-aware-forms";
import { createClient } from "@/lib/supabase/server";


export default async function OrganizationsPage() {
  const supabase = await createClient();

  const [{ data: organizations }, { data: clients }] = await Promise.all([
    supabase
      .from("organizations")
      .select("id,client_id,legal_name,dba_name,organization_type,entity_npi,status,nppes_verification_status")
      .is("archived_at", null)
      .order("legal_name"),
    supabase.from("clients").select("id,name").is("archived_at", null).order("name"),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Master data"
        title="Organizations"
        description="Groups, facilities, suppliers, agencies, and other credentialing entities."
      />

      <section className="tba-card mb-6 p-6">
        <h2 className="text-lg font-semibold">Add organization</h2>
        <p className="mt-1 text-sm text-[#667085]">
          Create the legal entity that providers, locations, and payer enrollment work belong to.
        </p>

        <CreateOrganizationForm existing={(organizations ?? []).map(({ id, legal_name, entity_npi, client_id }) => ({ id, legal_name, entity_npi, client_id }))} clients={clients ?? []} />
      </section>

      <div className="tba-card overflow-hidden">
        <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr_1fr] border-b border-[#eaecf0] bg-[#f9fafb] px-5 py-3 text-xs font-semibold uppercase tracking-wide text-[#667085]">
          <span>Legal name</span><span>Type</span><span>NPI</span><span>Status</span><span>NPPES</span>
        </div>
        {(organizations ?? []).length ? (
          organizations!.map((organization) => (
            <div key={organization.id} className="grid grid-cols-[1.5fr_1fr_1fr_1fr_1fr] border-b border-[#f2f4f7] px-5 py-4 text-sm last:border-0">
              <div>
                <div className="font-medium text-[#101828]">{organization.legal_name}</div>
                <div className="text-xs text-[#667085]">{organization.dba_name ?? ""}</div>
              </div>
              <span className="text-[#475467]">{organization.organization_type ?? "—"}</span>
              <span className="text-[#475467]">{organization.entity_npi ?? "—"}</span>
              <span className="capitalize text-[#475467]">{organization.status}</span>
              <span className="capitalize text-[#475467]">{organization.nppes_verification_status.replaceAll("_", " ")}</span>
            </div>
          ))
        ) : (
          <div className="px-5 py-10 text-center text-sm text-[#667085]">No organizations created yet.</div>
        )}
      </div>
    </>
  );
}
