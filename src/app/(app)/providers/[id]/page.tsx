import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { NppesPanel } from "@/components/providers/nppes-panel";
import { createClient } from "@/lib/supabase/server";

export default async function ProviderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: provider } = await supabase
    .from("providers")
    .select("id,first_name,middle_name,last_name,suffix,credential,individual_npi,caqh_id,status,credentialing_readiness_percent,nppes_verification_status,nppes_last_verified_at,nppes_last_snapshot_id")
    .eq("id", id).single();
  if (!provider) notFound();

  let comparisons: Array<{ id: string; field_name: string; internal_value: unknown; nppes_value: unknown; comparison_status: string; user_decision: string | null; }> = [];
  if (provider.nppes_last_snapshot_id) {
    const { data } = await supabase.from("nppes_comparisons").select("id,field_name,internal_value,nppes_value,comparison_status,user_decision").eq("nppes_snapshot_id", provider.nppes_last_snapshot_id).order("created_at");
    comparisons = data ?? [];
  }

  const displayName = [provider.first_name, provider.middle_name, provider.last_name, provider.suffix, provider.credential].filter(Boolean).join(" ");
  return (
    <>
      <PageHeader eyebrow="Provider" title={displayName} description="Provider identity, credentialing readiness, and NPPES review." />
      <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[["NPI", provider.individual_npi ?? "—"],["CAQH ID", provider.caqh_id ?? "—"],["Readiness", `${Number(provider.credentialing_readiness_percent)}%`],["Status", provider.status]].map(([label, value]) => (
          <div key={label} className="tba-card p-5"><p className="text-xs font-semibold uppercase tracking-wide text-[#667085]">{label}</p><p className="mt-2 text-lg font-semibold capitalize text-[#101828]">{value}</p></div>
        ))}
      </section>
      <NppesPanel providerId={provider.id} npi={provider.individual_npi} status={provider.nppes_verification_status} comparisons={comparisons} />
      <section className="tba-card mt-6 p-6"><h2 className="text-lg font-semibold">Verification history</h2><p className="mt-2 text-sm text-[#667085]">{provider.nppes_last_verified_at ? `Last checked ${new Date(provider.nppes_last_verified_at).toLocaleString()}.` : "This provider has not been checked against NPPES yet."}</p></section>
    </>
  );
}
