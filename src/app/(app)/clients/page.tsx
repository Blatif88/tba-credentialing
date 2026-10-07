import { PageHeader } from "@/components/page-header";
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
      <PageHeader eyebrow="Master data" title="Clients" description="Credentialing customers and their operational records." />
      <div className="tba-card overflow-hidden">
        <div className="grid grid-cols-[1.4fr_1fr_1fr_1.4fr] border-b border-[#eaecf0] bg-[#f9fafb] px-5 py-3 text-xs font-semibold uppercase tracking-wide text-[#667085]">
          <span>Client</span><span>Type</span><span>Status</span><span>Primary contact</span>
        </div>
        {(clients ?? []).length ? clients!.map((client) => (
          <div key={client.id} className="grid grid-cols-[1.4fr_1fr_1fr_1.4fr] border-b border-[#f2f4f7] px-5 py-4 text-sm last:border-0">
            <span className="font-medium text-[#101828]">{client.name}</span>
            <span className="text-[#475467]">{client.client_type ?? "—"}</span>
            <span className="capitalize text-[#475467]">{client.status}</span>
            <span className="text-[#667085]">{client.primary_contact_name ?? client.primary_contact_email ?? "—"}</span>
          </div>
        )) : <div className="px-5 py-10 text-center text-sm text-[#667085]">No clients created yet.</div>}
      </div>
    </>
  );
}
