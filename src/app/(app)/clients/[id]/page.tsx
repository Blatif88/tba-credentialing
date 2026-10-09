import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/submit-button";
import { updateClientRecord } from "@/lib/actions/intake";
import { createClient } from "@/lib/supabase/server";

function displayDate(date: string | null) {
  return date ? new Date(date).toLocaleDateString("en-US", { timeZone: "UTC" }) : "—";
}

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("id,name,client_type,status,primary_contact_name,primary_contact_email,primary_contact_phone,created_at")
    .eq("id", id)
    .is("archived_at", null)
    .single();

  if (clientError || !client) notFound();

  const [
    { data: providers, error: providersError },
    { data: organizations, error: organizationsError },
    { data: projects, error: projectsError },
  ] = await Promise.all([
    supabase.from("providers")
      .select("id,first_name,last_name,credential,individual_npi,status")
      .eq("client_id", id).is("archived_at", null).order("last_name").limit(100),
    supabase.from("organizations")
      .select("id,legal_name,entity_npi,status")
      .eq("client_id", id).is("archived_at", null).order("legal_name").limit(100),
    supabase.from("credentialing_projects")
      .select("id,name,status,target_date")
      .eq("client_id", id).is("archived_at", null).order("created_at", { ascending: false }).limit(100),
  ]);

  const projectIds = (projects ?? []).map((project) => project.id);
  const { data: cases, error: casesError } = projectIds.length
    ? await supabase.from("enrollment_cases")
      .select("id,project_id,status_code,state,next_followup_at,providers(first_name,last_name),organizations(legal_name),payer_organizations(display_name)")
      .in("project_id", projectIds).is("archived_at", null)
      .order("created_at", { ascending: false }).limit(100)
    : { data: [], error: null };

  const projectsById = new Map((projects ?? []).map((project) => [project.id, project.name]));
  const hasLoadErrors = Boolean(providersError || organizationsError || projectsError || casesError);
  return (
    <>
      <PageHeader eyebrow="Client workspace" title={client.name}
        description="Contact details, linked providers and organizations, credentialing projects, and enrollment progress."
        action={<Link href="/clients" className="rounded-lg border border-[#d0d5dd] bg-white px-4 py-2.5 text-sm font-semibold text-[#344054] hover:bg-[#f9fafb]">Back to clients</Link>} />

      {hasLoadErrors ? <p role="alert" className="mb-6 rounded-xl border border-[#fecdca] bg-[#fffbfa] p-4 text-sm text-[#b42318]">
        Some related records could not be loaded. Check access permissions and refresh.
      </p> : null}

      <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Providers", String((providers ?? []).length)],
          ["Organizations", String((organizations ?? []).length)],
          ["Projects", String((projects ?? []).length)],
          ["Enrollment cases", String((cases ?? []).length)],
        ].map(([label, total]) => (
          <div key={label} className="tba-card p-5">
            <p className="text-sm text-[#667085]">{label}</p>
            <p className="mt-2 text-3xl font-semibold tabular-nums text-[#101828]">{total}</p>
          </div>
        ))}
      </section>
      <p className="mb-6 text-xs text-[#667085]">Overview lists show up to 100 records per type. For a complete search, use the corresponding section.</p>

      <section className="tba-card mb-6 p-6">
        <h2 className="text-lg font-semibold">Client profile</h2>
        <p className="mt-1 text-sm text-[#667085]">Created {displayDate(client.created_at)}. Update contact information and client status here.</p>
        <form action={updateClientRecord} className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <input type="hidden" name="client_id" value={client.id} />
          <div>
            <label htmlFor="client-name" className="tba-label">Client name</label>
            <input id="client-name" name="name" className="tba-input" defaultValue={client.name} maxLength={200} required />
          </div>
          <div>
            <label htmlFor="client-type" className="tba-label">Client type</label>
            <select id="client-type" name="client_type" className="tba-input" defaultValue={client.client_type}>
              {["individual", "group", "company", "facility", "other"].map((type) => <option key={type} value={type} className="capitalize">{type}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="client-status" className="tba-label">Status</label>
            <select id="client-status" name="status" className="tba-input" defaultValue={client.status}>
              {["prospect", "onboarding", "active", "inactive"].map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="contact-name" className="tba-label">Primary contact</label>
            <input id="contact-name" name="primary_contact_name" className="tba-input" defaultValue={client.primary_contact_name ?? ""} />
          </div>
          <div>
            <label htmlFor="contact-email" className="tba-label">Contact email</label>
            <input id="contact-email" name="primary_contact_email" type="email" className="tba-input" defaultValue={client.primary_contact_email ?? ""} />
          </div>
          <div>
            <label htmlFor="contact-phone" className="tba-label">Contact phone</label>
            <input id="contact-phone" name="primary_contact_phone" type="tel" className="tba-input" defaultValue={client.primary_contact_phone ?? ""} />
          </div>
          <div className="md:col-span-2 xl:col-span-3">
            <SubmitButton idleLabel="Save client" pendingLabel="Saving client..." />
          </div>
        </form>
      </section>

      <section className="mb-6 grid gap-6 xl:grid-cols-2">
        <div className="tba-card overflow-hidden">
          <div className="border-b border-[#eaecf0] px-5 py-4"><h2 className="text-lg font-semibold">Providers</h2></div>
          {(providers ?? []).length ? providers!.map((provider) =>
            <Link key={provider.id} href={`/providers/${provider.id}`} className="block border-b border-[#eaecf0] px-5 py-3 text-sm last:border-0 hover:bg-[#f9fafb]">
              <span className="font-semibold text-[#175cd3]">{[provider.first_name, provider.last_name, provider.credential].filter(Boolean).join(" ")}</span>
              <span className="ml-2 text-[#667085]">{provider.individual_npi ? "NPI " + provider.individual_npi : "NPI not entered"}</span>
            </Link>) : <p className="p-5 text-sm text-[#667085]">No providers linked to this client.</p>}
        </div>
        <div className="tba-card overflow-hidden">
          <div className="border-b border-[#eaecf0] px-5 py-4"><h2 className="text-lg font-semibold">Organizations</h2></div>
          {(organizations ?? []).length ? organizations!.map((organization) =>
            <div key={organization.id} className="border-b border-[#eaecf0] px-5 py-3 text-sm last:border-0">
              <span className="font-semibold">{organization.legal_name}</span>
              <span className="ml-2 text-[#667085]">{organization.entity_npi ? "NPI " + organization.entity_npi : "NPI not entered"}</span>
            </div>) : <p className="p-5 text-sm text-[#667085]">No organizations linked to this client.</p>}
        </div>
      </section>

      <section className="tba-card mb-6 overflow-hidden">
        <div className="border-b border-[#eaecf0] px-5 py-4"><h2 className="text-lg font-semibold">Credentialing projects</h2></div>
        {(projects ?? []).length ? projects!.map((project) =>
          <Link key={project.id} href={`/projects/${project.id}`} className="flex flex-wrap justify-between gap-2 border-b border-[#eaecf0] px-5 py-3 text-sm last:border-0 hover:bg-[#f9fafb]">
            <span className="font-semibold text-[#175cd3]">{project.name}</span>
            <span className="capitalize text-[#667085]">{project.status.replaceAll("_", " ")} · Target {displayDate(project.target_date)}</span>
          </Link>) : <p className="p-5 text-sm text-[#667085]">No projects linked to this client.</p>}
      </section>

      <section className="tba-card overflow-hidden">
        <div className="border-b border-[#eaecf0] px-5 py-4"><h2 className="text-lg font-semibold">Enrollment cases</h2></div>
        {(cases ?? []).length ? cases!.map((item) => {
          const provider = (Array.isArray(item.providers) ? item.providers[0] : item.providers) as { first_name?: string; last_name?: string } | null;
          const organization = (Array.isArray(item.organizations) ? item.organizations[0] : item.organizations) as { legal_name?: string } | null;
          const payer = (Array.isArray(item.payer_organizations) ? item.payer_organizations[0] : item.payer_organizations) as { display_name?: string } | null;
          const subject = [provider?.first_name, provider?.last_name].filter(Boolean).join(" ") || organization?.legal_name || "Enrollment case";
          return <Link key={item.id} href={`/enrollment-cases/${item.id}`} className="block border-b border-[#eaecf0] px-5 py-3 text-sm last:border-0 hover:bg-[#f9fafb]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-[#175cd3]">{subject} · {payer?.display_name || "Payer"}</span>
              <span className="capitalize text-[#667085]">{item.status_code.replaceAll("_", " ")}</span>
            </div>
            <p className="mt-1 text-xs text-[#667085]">{projectsById.get(item.project_id) || "Project"} · {item.state} · Next follow-up {item.next_followup_at ? new Date(item.next_followup_at).toLocaleDateString() : "not scheduled"}</p>
          </Link>;
        }) : <p className="p-5 text-sm text-[#667085]">No enrollment cases found for these projects.</p>}
      </section>
    </>
  );
}
