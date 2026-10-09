import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { CreateClientForm } from "@/components/intake/duplicate-aware-forms";
import { createClient } from "@/lib/supabase/server";


export default async function ClientsPage() {
  const supabase = await createClient();
  const { data: clients } = await supabase
    .from("clients")
    .select("id,name,client_type,status,primary_contact_name,primary_contact_email")
    .is("archived_at", null)
    .order("name");

  return (
    <>
      <PageHeader
        eyebrow="Master data"
        title="Clients"
        description="Credentialing customers and the organizations, providers, projects, and cases attached to them."
      />

      <section className="tba-card mb-6 p-6">
        <h2 className="text-lg font-semibold">Add client</h2>
        <p className="mt-1 text-sm text-[#667085]">
          Start the intake record here, then attach organizations, providers, locations, and projects.
        </p>

        <CreateClientForm existing={(clients ?? []).map(({ id, name }) => ({ id, name }))} />
      </section>

      <div className="tba-card overflow-hidden">
        <div className="grid grid-cols-[1.4fr_1fr_1fr_1.4fr] border-b border-[#eaecf0] bg-[#f9fafb] px-5 py-3 text-xs font-semibold uppercase tracking-wide text-[#667085]">
          <span>Client</span><span>Type</span><span>Status</span><span>Primary contact</span>
        </div>
        {(clients ?? []).length ? (
          clients!.map((client) => (
            <Link key={client.id} href={`/clients/${client.id}`} className="grid grid-cols-[1.4fr_1fr_1fr_1.4fr] border-b border-[#f2f4f7] px-5 py-4 text-sm transition last:border-0 hover:bg-[#f9fafb]">
              <span className="font-medium text-[#175cd3] underline-offset-2 hover:underline">{client.name}</span>
              <span className="capitalize text-[#475467]">{client.client_type ?? "—"}</span>
              <span className="capitalize text-[#475467]">{client.status}</span>
              <span className="text-[#667085]">{client.primary_contact_name ?? client.primary_contact_email ?? "—"}</span>
            </Link>
          ))
        ) : (
          <div className="px-5 py-10 text-center text-sm text-[#667085]">No clients created yet.</div>
        )}
      </div>
    </>
  );
}
