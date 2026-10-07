import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("credentialing_projects")
    .select("id,name,status,start_date,target_date,created_at,clients(id,name)")
    .eq("id", id)
    .single();

  if (!project) notFound();

  const [
    { data: providers },
    { data: organizations },
    { data: locations },
    { data: payerTargets },
    { data: cases },
  ] = await Promise.all([
    supabase
      .from("project_providers")
      .select("id,providers(id,first_name,last_name,credential,individual_npi)")
      .eq("project_id", id),
    supabase
      .from("project_organizations")
      .select("id,organizations(id,legal_name,entity_npi)")
      .eq("project_id", id),
    supabase
      .from("project_locations")
      .select("id,locations(id,name,address_line_1,city,state,zip)")
      .eq("project_id", id),
    supabase
      .from("project_payers")
      .select("id,payer_organizations(display_name),payer_offerings(name,state)")
      .eq("project_id", id),
    supabase
      .from("enrollment_cases")
      .select("id,status_code,state,enrollment_type,entity_context,priority,next_followup_at,providers(first_name,last_name),organizations(legal_name),payer_organizations(display_name),payer_offerings(name)")
      .eq("project_id", id)
      .is("archived_at", null)
      .order("created_at", { ascending: false }),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Credentialing project"
        title={project.name}
        description={project.clients?.name ?? "Project workspace"}
      />

      <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ["Status", project.status],
          ["Client", project.clients?.name ?? "—"],
          ["Start date", project.start_date ?? "—"],
          ["Target date", project.target_date ?? "—"],
          ["Cases", String((cases ?? []).length)],
        ].map(([label, value]) => (
          <div key={label} className="tba-card p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#667085]">{label}</p>
            <p className="mt-2 text-base font-semibold capitalize text-[#101828]">{value}</p>
          </div>
        ))}
      </section>

      <section className="mb-6 grid gap-6 xl:grid-cols-2">
        <div className="tba-card p-6">
          <h2 className="text-lg font-semibold">Subjects</h2>
          <div className="mt-4 space-y-4">
            {(providers ?? []).map((row: any) => (
              <div key={row.id} className="rounded-xl bg-[#f9fafb] p-4">
                <p className="font-medium">
                  {[row.providers?.first_name, row.providers?.last_name, row.providers?.credential]
                    .filter(Boolean)
                    .join(" ")}
                </p>
                <p className="mt-1 text-xs text-[#667085]">
                  NPI {row.providers?.individual_npi ?? "—"}
                </p>
              </div>
            ))}

            {(organizations ?? []).map((row: any) => (
              <div key={row.id} className="rounded-xl bg-[#f9fafb] p-4">
                <p className="font-medium">{row.organizations?.legal_name ?? "Organization"}</p>
                <p className="mt-1 text-xs text-[#667085]">
                  NPI {row.organizations?.entity_npi ?? "—"}
                </p>
              </div>
            ))}

            {!(providers ?? []).length && !(organizations ?? []).length ? (
              <p className="text-sm text-[#667085]">No provider or organization linked.</p>
            ) : null}
          </div>
        </div>

        <div className="tba-card p-6">
          <h2 className="text-lg font-semibold">Payer & locations</h2>

          <div className="mt-4 space-y-3">
            {(payerTargets ?? []).map((row: any) => (
              <div key={row.id} className="rounded-xl bg-[#f9fafb] p-4">
                <p className="font-medium">
                  {row.payer_organizations?.display_name ?? "Payer"}
                </p>
                <p className="mt-1 text-sm text-[#667085]">
                  {row.payer_offerings?.name ?? "Offering"}
                  {row.payer_offerings?.state ? " · " + row.payer_offerings.state : ""}
                </p>
              </div>
            ))}

            {(locations ?? []).map((row: any) => (
              <div key={row.id} className="rounded-xl border border-[#eaecf0] p-4">
                <p className="font-medium">
                  {row.locations?.name ?? row.locations?.address_line_1 ?? "Location"}
                </p>
                <p className="mt-1 text-sm text-[#667085]">
                  {[row.locations?.address_line_1, row.locations?.city, row.locations?.state, row.locations?.zip]
                    .filter(Boolean)
                    .join(", ")}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="tba-card overflow-hidden">
        <div className="border-b border-[#eaecf0] px-5 py-4">
          <h2 className="text-lg font-semibold">Enrollment cases</h2>
          <p className="mt-1 text-sm text-[#667085]">
            Open a case to work requirements, documents, tasks, follow-ups, and submission.
          </p>
        </div>

        <div className="grid grid-cols-[1.25fr_1.35fr_90px_1fr_1fr] border-b border-[#eaecf0] bg-[#f9fafb] px-5 py-3 text-xs font-semibold uppercase tracking-wide text-[#667085]">
          <span>Subject</span>
          <span>Payer</span>
          <span>State</span>
          <span>Status</span>
          <span>Next follow-up</span>
        </div>

        {(cases ?? []).length ? cases!.map((item: any) => (
          <Link
            key={item.id}
            href={"/enrollment-cases/" + item.id}
            className="grid grid-cols-[1.25fr_1.35fr_90px_1fr_1fr] border-b border-[#f2f4f7] px-5 py-4 text-sm transition last:border-0 hover:bg-[#f9fafb]"
          >
            <span className="font-medium text-[#175cd3] underline-offset-2 hover:underline">
              {item.providers
                ? item.providers.first_name + " " + item.providers.last_name
                : item.organizations?.legal_name ?? item.entity_context}
            </span>
            <span className="text-[#475467]">
              {item.payer_organizations?.display_name ?? "—"}
              {item.payer_offerings?.name ? " — " + item.payer_offerings.name : ""}
            </span>
            <span className="text-[#475467]">{item.state}</span>
            <span className="capitalize text-[#475467]">
              {item.status_code.replaceAll("_", " ")}
            </span>
            <span className="text-[#667085]">
              {item.next_followup_at ? new Date(item.next_followup_at).toLocaleDateString() : "—"}
            </span>
          </Link>
        )) : (
          <div className="px-5 py-10 text-center text-sm text-[#667085]">
            No enrollment cases linked to this project.
          </div>
        )}
      </section>
    </>
  );
}
