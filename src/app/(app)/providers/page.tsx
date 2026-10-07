import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/submit-button";
import { createClient } from "@/lib/supabase/server";
import { createProvider } from "./actions";

export default async function ProvidersPage() {
  const supabase = await createClient();
  const { data: providers } = await supabase
    .from("providers")
    .select("id,first_name,middle_name,last_name,credential,individual_npi,status,credentialing_readiness_percent,nppes_verification_status")
    .is("archived_at", null)
    .order("last_name");

  return (
    <>
      <PageHeader
        eyebrow="Master data"
        title="Providers"
        description="Individual providers, identity verification, credentialing readiness, affiliations, documents, and payer enrollment work."
      />

      <section className="tba-card mb-6 p-6">
        <h2 className="text-lg font-semibold">Add provider</h2>
        <p className="mt-1 text-sm text-[#667085]">
          Create a provider record first, then run live NPPES verification from the provider screen.
        </p>

        <form action={createProvider} className="mt-5 grid gap-4 md:grid-cols-5">
          <div>
            <label className="tba-label">First name</label>
            <input name="first_name" className="tba-input" required />
          </div>
          <div>
            <label className="tba-label">Middle name</label>
            <input name="middle_name" className="tba-input" />
          </div>
          <div>
            <label className="tba-label">Last name</label>
            <input name="last_name" className="tba-input" required />
          </div>
          <div>
            <label className="tba-label">Credential</label>
            <input name="credential" className="tba-input" placeholder="MD, NP, LCSW..." />
          </div>
          <div>
            <label className="tba-label">NPI</label>
            <input name="individual_npi" className="tba-input" inputMode="numeric" pattern="[0-9]{10}" />
          </div>
          <div className="md:col-span-5">
            <SubmitButton idleLabel="Create provider" pendingLabel="Creating provider..." />
          </div>
        </form>
      </section>

      <div className="tba-card overflow-hidden">
        <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr_1fr] border-b border-[#eaecf0] bg-[#f9fafb] px-5 py-3 text-xs font-semibold uppercase tracking-wide text-[#667085]">
          <span>Provider</span><span>NPI</span><span>NPPES</span><span>Readiness</span><span>Status</span>
        </div>
        {(providers ?? []).length ? providers!.map((provider) => (
          <Link
            key={provider.id}
            href={`/providers/${provider.id}`}
            className="grid grid-cols-[1.5fr_1fr_1fr_1fr_1fr] border-b border-[#f2f4f7] px-5 py-4 text-sm transition last:border-0 hover:bg-[#f9fafb]"
          >
            <span className="font-medium text-[#101828]">
              {[provider.first_name, provider.middle_name, provider.last_name, provider.credential].filter(Boolean).join(" ")}
            </span>
            <span className="text-[#475467]">{provider.individual_npi ?? "—"}</span>
            <span className="capitalize text-[#475467]">{provider.nppes_verification_status.replaceAll("_", " ")}</span>
            <span className="text-[#475467]">{Number(provider.credentialing_readiness_percent)}%</span>
            <span className="capitalize text-[#475467]">{provider.status}</span>
          </Link>
        )) : (
          <div className="px-5 py-10 text-center text-sm text-[#667085]">No providers created yet.</div>
        )}
      </div>
    </>
  );
}
