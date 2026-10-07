import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";

export default async function EnrollmentCasesPage() {
  const supabase = await createClient();
  const { data: cases } = await supabase
    .from("enrollment_cases")
    .select("id,state,enrollment_type,entity_context,status_code,priority,next_followup_at,providers(first_name,last_name),payer_organizations(display_name)")
    .is("archived_at", null).order("updated_at", { ascending: false }).limit(100);

  return (
    <>
      <PageHeader eyebrow="Work" title="Enrollment Cases" description="The operational unit for provider/group/payer enrollment work." />
      <div className="tba-card overflow-hidden">
        <div className="grid grid-cols-[1.2fr_1.2fr_90px_1fr_1fr] border-b border-[#eaecf0] bg-[#f9fafb] px-5 py-3 text-xs font-semibold uppercase tracking-wide text-[#667085]"><span>Subject</span><span>Payer</span><span>State</span><span>Status</span><span>Next follow-up</span></div>
        {(cases ?? []).length ? cases!.map((item: any) => (
          <div key={item.id} className="grid grid-cols-[1.2fr_1.2fr_90px_1fr_1fr] border-b border-[#f2f4f7] px-5 py-4 text-sm last:border-0">
            <span className="font-medium text-[#101828]">{item.providers ? `${item.providers.first_name} ${item.providers.last_name}` : item.entity_context}</span>
            <span className="text-[#475467]">{item.payer_organizations?.display_name ?? "—"}</span><span className="text-[#475467]">{item.state}</span>
            <span className="capitalize text-[#475467]">{item.status_code.replaceAll("_", " ")}</span><span className="text-[#667085]">{item.next_followup_at ? new Date(item.next_followup_at).toLocaleDateString() : "—"}</span>
          </div>
        )) : <div className="px-5 py-10 text-center text-sm text-[#667085]">No enrollment cases created yet.</div>}
      </div>
    </>
  );
}
