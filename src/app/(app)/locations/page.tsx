import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/submit-button";
import { createLocationRecord } from "@/lib/actions/intake";
import { createClient } from "@/lib/supabase/server";

export default async function LocationsPage() {
  const supabase = await createClient();

  const [{ data: locations }, { data: clients }, { data: organizations }] = await Promise.all([
    supabase
      .from("locations")
      .select("id,name,address_line_1,address_line_2,city,state,zip,location_type,active,clients(name),organizations(legal_name)")
      .is("archived_at", null)
      .order("created_at", { ascending: false }),
    supabase.from("clients").select("id,name").is("archived_at", null).order("name"),
    supabase.from("organizations").select("id,legal_name").is("archived_at", null).order("legal_name"),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Master data"
        title="Locations"
        description="Service, mailing, billing, and credentialing locations used across provider and payer enrollment work."
      />

      <section className="tba-card mb-6 p-6">
        <h2 className="text-lg font-semibold">Add location</h2>
        <form action={createLocationRecord} className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <label className="tba-label">Location name</label>
            <input name="name" className="tba-input" placeholder="Main Office" />
          </div>
          <div>
            <label className="tba-label">Client</label>
            <select name="client_id" className="tba-input" defaultValue="">
              <option value="">No client selected</option>
              {(clients ?? []).map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
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
            <label className="tba-label">Location type</label>
            <input name="location_type" className="tba-input" placeholder="Service, Office..." />
          </div>

          <div className="md:col-span-2">
            <label className="tba-label">Address line 1</label>
            <input name="address_line_1" className="tba-input" required />
          </div>
          <div className="md:col-span-2">
            <label className="tba-label">Address line 2</label>
            <input name="address_line_2" className="tba-input" />
          </div>
          <div>
            <label className="tba-label">City</label>
            <input name="city" className="tba-input" required />
          </div>
          <div>
            <label className="tba-label">State</label>
            <input name="state" className="tba-input uppercase" maxLength={2} required />
          </div>
          <div>
            <label className="tba-label">ZIP</label>
            <input name="zip" className="tba-input" required />
          </div>
          <div>
            <label className="tba-label">County</label>
            <input name="county" className="tba-input" />
          </div>
          <div>
            <label className="tba-label">Phone</label>
            <input name="phone" className="tba-input" />
          </div>

          <div className="flex flex-wrap items-center gap-5 md:col-span-2 xl:col-span-3">
            <label className="flex items-center gap-2 text-sm text-[#475467]">
              <input name="credentialing_location" type="checkbox" defaultChecked />
              Credentialing
            </label>
            <label className="flex items-center gap-2 text-sm text-[#475467]">
              <input name="billing_location" type="checkbox" />
              Billing
            </label>
            <label className="flex items-center gap-2 text-sm text-[#475467]">
              <input name="mailing_location" type="checkbox" />
              Mailing
            </label>
          </div>
          <div className="md:col-span-2 xl:col-span-4">
            <SubmitButton idleLabel="Create location" pendingLabel="Creating location..." />
          </div>
        </form>
      </section>

      <div className="tba-card overflow-hidden">
        <div className="grid grid-cols-[1.2fr_1.6fr_1fr_1fr] border-b border-[#eaecf0] bg-[#f9fafb] px-5 py-3 text-xs font-semibold uppercase tracking-wide text-[#667085]">
          <span>Location</span><span>Address</span><span>Organization</span><span>Client</span>
        </div>
        {(locations ?? []).length ? locations!.map((location: any) => (
          <div key={location.id} className="grid grid-cols-[1.2fr_1.6fr_1fr_1fr] border-b border-[#f2f4f7] px-5 py-4 text-sm last:border-0">
            <div>
              <div className="font-medium text-[#101828]">{location.name ?? "Unnamed location"}</div>
              <div className="text-xs text-[#667085]">{location.location_type ?? ""}</div>
            </div>
            <span className="text-[#475467]">
              {[location.address_line_1, location.address_line_2, location.city, location.state, location.zip].filter(Boolean).join(", ")}
            </span>
            <span className="text-[#475467]">{location.organizations?.legal_name ?? "—"}</span>
            <span className="text-[#475467]">{location.clients?.name ?? "—"}</span>
          </div>
        )) : <div className="px-5 py-10 text-center text-sm text-[#667085]">No locations created yet.</div>}
      </div>
    </>
  );
}
