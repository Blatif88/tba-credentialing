import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";

export default async function PayerProgramsPage() {
  const supabase = await createClient();

  const [
    { data: offerings },
    { data: portals },
    { data: sources },
    { data: payerConditions },
  ] = await Promise.all([
    supabase
      .from("payer_offerings")
      .select("id,name,state,program_name,offering_type,status,payer_organizations(display_name,website)")
      .eq("status", "active")
      .order("state", { ascending: true, nullsFirst: true })
      .order("name"),
    supabase
      .from("portals")
      .select("id,payer_offering_id,status")
      .eq("status", "active"),
    supabase
      .from("knowledge_sources")
      .select("id,payer_offering_id,status,authority_level")
      .in("status", ["active", "unverified"]),
    supabase
      .from("rule_conditions")
      .select("rule_version_id,value")
      .eq("field", "payer_offering_id")
      .eq("operator", "equals"),
  ]);

  const portalCounts = new Map<string, number>();
  for (const portal of portals ?? []) {
    if (!portal.payer_offering_id) continue;
    portalCounts.set(
      portal.payer_offering_id,
      (portalCounts.get(portal.payer_offering_id) ?? 0) + 1,
    );
  }

  const sourceCounts = new Map<string, number>();
  for (const source of sources ?? []) {
    if (!source.payer_offering_id) continue;
    sourceCounts.set(
      source.payer_offering_id,
      (sourceCounts.get(source.payer_offering_id) ?? 0) + 1,
    );
  }

  const ruleCounts = new Map<string, Set<string>>();
  for (const condition of payerConditions ?? []) {
    const offeringId =
      typeof condition.value === "string"
        ? condition.value
        : String(condition.value ?? "").replaceAll('"', "");

    if (!offeringId) continue;
    const set = ruleCounts.get(offeringId) ?? new Set<string>();
    set.add(condition.rule_version_id);
    ruleCounts.set(offeringId, set);
  }

  return (
    <>
      <PageHeader
        eyebrow="Knowledge administration"
        title="Payer Programs"
        description="Browse the payer-program catalog, official sources, portal routes, and rules that drive credentialing requirements."
      />

      <div className="mb-6 rounded-2xl border border-blue-200 bg-blue-50 px-5 py-4 text-sm text-blue-900">
        <strong>Governed knowledge model.</strong> Global production rules and sources are protected.
        Organization admins can create tenant-scoped override drafts, review them, and approve versioned changes
        without modifying the shared global catalog.
      </div>

      <section className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {(offerings ?? []).map((offering: any) => {
          const payerName = offering.payer_organizations?.display_name ?? "Payer";
          const ruleCount = ruleCounts.get(offering.id)?.size ?? 0;

          return (
            <Link
              key={offering.id}
              href={"/payer-programs/" + offering.id}
              className="tba-card block p-6 transition hover:-translate-y-0.5 hover:border-[#b2ccff] hover:shadow-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#175cd3]">
                    {offering.state ?? "Federal"}
                  </p>
                  <h2 className="mt-1 text-lg font-semibold text-[#101828]">{payerName}</h2>
                  <p className="mt-1 text-sm text-[#475467]">{offering.name}</p>
                </div>
                <span className="rounded-full bg-[#f2f4f7] px-2.5 py-1 text-xs font-semibold capitalize text-[#475467]">
                  {offering.offering_type.replaceAll("_", " ")}
                </span>
              </div>

              <div className="mt-5 grid grid-cols-3 gap-3">
                <div className="rounded-xl bg-[#f9fafb] p-3">
                  <p className="text-xs text-[#667085]">Rules</p>
                  <p className="mt-1 text-xl font-semibold">{ruleCount}</p>
                </div>
                <div className="rounded-xl bg-[#f9fafb] p-3">
                  <p className="text-xs text-[#667085]">Sources</p>
                  <p className="mt-1 text-xl font-semibold">{sourceCounts.get(offering.id) ?? 0}</p>
                </div>
                <div className="rounded-xl bg-[#f9fafb] p-3">
                  <p className="text-xs text-[#667085]">Resources</p>
                  <p className="mt-1 text-xl font-semibold">{portalCounts.get(offering.id) ?? 0}</p>
                </div>
              </div>

              <p className="mt-4 text-xs font-semibold text-[#175cd3]">Open program governance →</p>
            </Link>
          );
        })}
      </section>

      {!(offerings ?? []).length ? (
        <div className="tba-card px-5 py-10 text-center text-sm text-[#667085]">
          No active payer programs are available.
        </div>
      ) : null}
    </>
  );
}
