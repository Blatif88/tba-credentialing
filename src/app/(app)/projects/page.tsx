import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/submit-button";
import { createCredentialingProject } from "@/lib/actions/intake";
import { createClient } from "@/lib/supabase/server";

export default async function ProjectsPage() {
  const supabase = await createClient();

  const [
    { data: projects },
    { data: clients },
    { data: providers },
    { data: organizations },
    { data: locations },
    { data: payerOfferings },
  ] = await Promise.all([
    supabase
      .from("credentialing_projects")
      .select("id,name,status,start_date,target_date,clients(name)")
      .is("archived_at", null)
      .order("created_at", { ascending: false }),
    supabase.from("clients").select("id,name").is("archived_at", null).order("name"),
    supabase.from("providers").select("id,client_id,first_name,last_name,credential").is("archived_at", null).order("last_name"),
    supabase.from("organizations").select("id,client_id,legal_name").is("archived_at", null).order("legal_name"),
    supabase.from("locations").select("id,name,address_line_1,city,state").is("archived_at", null).order("created_at", { ascending: false }),
    supabase
      .from("payer_offerings")
      .select("id,name,state,program_name,external_code,payer_organizations(display_name)")
      .eq("status", "active")
      .order("state", { ascending: true, nullsFirst: true }),
  ]);

  const hasClients = (clients ?? []).length > 0;

  return (
    <>
      <PageHeader
        eyebrow="Credentialing intake"
        title="Projects"
        description="Create a project and generate its first enrollment case against a verified payer program."
      />

      {!hasClients ? (
        <div className="mb-6 rounded-2xl border border-blue-200 bg-blue-50 px-5 py-4 text-sm text-blue-900">
          <strong>No client record exists yet.</strong> You can create one directly in this form using the New client name field.
        </div>
      ) : null}

      <section className="tba-card mb-6 p-6">
        <h2 className="text-lg font-semibold">Create credentialing case</h2>
        <p className="mt-1 text-sm text-[#667085]">
          This creates the project, payer target, enrollment case, case location, and 18-step standard workflow in one transaction.
        </p>

        <form action={createCredentialingProject} className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="xl:col-span-2">
            <label className="tba-label">Project name</label>
            <input name="name" className="tba-input" placeholder="ABC Medical - Texas Medicaid Enrollment" required />
          </div>

          <div>
            <label className="tba-label">Existing client</label>
            <select name="client_id" className="tba-input" defaultValue="">
              <option value="">No existing client</option>
              {(clients ?? []).map((client) => (
                <option key={client.id} value={client.id}>{client.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="tba-label">New client name</label>
            <input
              name="new_client_name"
              className="tba-input"
              placeholder="Use if client does not exist yet"
            />
          </div>

          <div>
            <label className="tba-label">Provider</label>
            <select name="provider_id" className="tba-input" defaultValue="">
              <option value="">No provider selected</option>
              {(providers ?? []).map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {[provider.first_name, provider.last_name, provider.credential].filter(Boolean).join(" ")}
                  {provider.client_id ? " — client assigned" : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="tba-label">Organization</label>
            <select name="organization_id" className="tba-input" defaultValue="">
              <option value="">No organization selected</option>
              {(organizations ?? []).map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.legal_name}{organization.client_id ? " — client assigned" : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="tba-label">Location</label>
            <select name="location_id" className="tba-input" defaultValue="">
              <option value="">No location selected</option>
              {(locations ?? []).map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name ?? location.address_line_1} — {location.city}, {location.state}
                </option>
              ))}
            </select>
          </div>

          <div className="xl:col-span-2">
            <label className="tba-label">Verified payer program</label>
            <select name="payer_offering_id" className="tba-input" defaultValue="" required>
              <option value="" disabled>Select payer program</option>
              {(payerOfferings ?? []).map((offering: any) => (
                <option key={offering.id} value={offering.id}>
                  {offering.payer_organizations?.display_name ?? "Payer"} — {offering.name}
                  {offering.state ? ` (${offering.state})` : " (Federal)"}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="tba-label">State</label>
            <select name="state" className="tba-input" defaultValue="TX" required>
              {["TX","CA","NV","NY","NJ","CO"].map((state) => (
                <option key={state} value={state}>{state}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="tba-label">Enrollment type</label>
            <select name="enrollment_type" className="tba-input" defaultValue="initial">
              <option value="initial">Initial enrollment</option>
              <option value="revalidation">Revalidation</option>
              <option value="change_of_information">Change of information</option>
              <option value="recredentialing">Recredentialing</option>
            </select>
          </div>

          <div>
            <label className="tba-label">Enrollment relationship</label>
            <select name="entity_context" className="tba-input" defaultValue="individual">
              <option value="individual">Individual</option>
              <option value="under_existing_group">Under existing group</option>
              <option value="group">Group</option>
              <option value="organization">Organization</option>
              <option value="facility">Facility</option>
              <option value="supplier">Supplier</option>
            </select>
          </div>

          <div>
            <label className="tba-label">Network intent</label>
            <select name="network_intent" className="tba-input" defaultValue="in_network">
              <option value="in_network">In network</option>
              <option value="out_of_network">Out of network</option>
              <option value="either">Either</option>
            </select>
          </div>

          <div>
            <label className="tba-label">Start date</label>
            <input name="start_date" type="date" className="tba-input" />
          </div>

          <div>
            <label className="tba-label">Target date</label>
            <input name="target_date" type="date" className="tba-input" />
          </div>

          <div className="md:col-span-2 xl:col-span-4">
            <SubmitButton
              idleLabel="Create project + enrollment case"
              pendingLabel="Creating case..."
              disabled={!(payerOfferings ?? []).length}
            />
          </div>
        </form>
      </section>

      <div className="tba-card overflow-hidden">
        <div className="grid grid-cols-[1.5fr_1.2fr_1fr_1fr] border-b border-[#eaecf0] bg-[#f9fafb] px-5 py-3 text-xs font-semibold uppercase tracking-wide text-[#667085]">
          <span>Project</span><span>Client</span><span>Status</span><span>Target</span>
        </div>
        {(projects ?? []).length ? projects!.map((project: any) => (
          <div key={project.id} className="grid grid-cols-[1.5fr_1.2fr_1fr_1fr] border-b border-[#f2f4f7] px-5 py-4 text-sm last:border-0">
            <span className="font-medium text-[#101828]">{project.name}</span>
            <span className="text-[#475467]">{project.clients?.name ?? "—"}</span>
            <span className="capitalize text-[#475467]">{project.status}</span>
            <span className="text-[#667085]">{project.target_date ?? "—"}</span>
          </div>
        )) : (
          <div className="px-5 py-10 text-center text-sm text-[#667085]">No projects created yet.</div>
        )}
      </div>
    </>
  );
}
