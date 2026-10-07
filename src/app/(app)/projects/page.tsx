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
    { data: payers },
  ] = await Promise.all([
    supabase
      .from("credentialing_projects")
      .select("id,name,status,start_date,target_date,clients(name)")
      .is("archived_at", null)
      .order("created_at", { ascending: false }),
    supabase.from("clients").select("id,name").is("archived_at", null).order("name"),
    supabase.from("providers").select("id,first_name,last_name,credential").is("archived_at", null).order("last_name"),
    supabase.from("organizations").select("id,legal_name").is("archived_at", null).order("legal_name"),
    supabase.from("locations").select("id,name,address_line_1,city,state").is("archived_at", null).order("created_at", { ascending: false }),
    supabase.from("payer_organizations").select("id,display_name").eq("status", "active").order("display_name"),
  ]);

  const hasPayers = (payers ?? []).length > 0;

  return (
    <>
      <PageHeader
        eyebrow="Credentialing intake"
        title="Projects"
        description="Create a credentialing project, attach the subject and location, then add payer targets when the verified payer catalog is available."
      />

      {!hasPayers ? (
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
          <strong>Payer case generation is intentionally paused.</strong> The payer master currently has no verified payer records, so this screen creates the project scope only. We will enable payer selection and enrollment-case generation after the payer catalog is seeded from verified sources.
        </div>
      ) : null}

      <section className="tba-card mb-6 p-6">
        <h2 className="text-lg font-semibold">Create project</h2>
        <form action={createCredentialingProject} className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="xl:col-span-2">
            <label className="tba-label">Project name</label>
            <input name="name" className="tba-input" placeholder="ABC Medical - Initial Credentialing" required />
          </div>
          <div>
            <label className="tba-label">Client</label>
            <select name="client_id" className="tba-input" defaultValue="" required>
              <option value="" disabled>Select client</option>
              {(clients ?? []).map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
            </select>
          </div>
          <div>
            <label className="tba-label">Provider</label>
            <select name="provider_id" className="tba-input" defaultValue="">
              <option value="">No provider selected</option>
              {(providers ?? []).map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {[provider.first_name, provider.last_name, provider.credential].filter(Boolean).join(" ")}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="tba-label">Organization</label>
            <select name="organization_id" className="tba-input" defaultValue="">
              <option value="">No organization selected</option>
              {(organizations ?? []).map((organization) => <option key={organization.id} value={organization.id}>{organization.legal_name}</option>)}
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
          <div>
            <label className="tba-label">Start date</label>
            <input name="start_date" type="date" className="tba-input" />
          </div>
          <div>
            <label className="tba-label">Target date</label>
            <input name="target_date" type="date" className="tba-input" />
          </div>
          <div className="md:col-span-2 xl:col-span-4">
            <SubmitButton idleLabel="Create draft project" pendingLabel="Creating project..." />
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
        )) : <div className="px-5 py-10 text-center text-sm text-[#667085]">No projects created yet.</div>}
      </div>
    </>
  );
}
