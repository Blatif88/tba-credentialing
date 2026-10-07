import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";

function fmt(value?: string | null) {
  if (!value) return "Never";
  return new Date(value).toLocaleString();
}

export default async function KnowledgeReviewPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("knowledge_review_snapshot", {
    p_stale_days: 90,
  });

  if (error) {
    throw new Error(error.message);
  }

  const snapshot = (data ?? {}) as any;
  const counts = snapshot.counts ?? {};
  const drafts = snapshot.drafts ?? [];
  const pending = snapshot.pending_review ?? [];
  const approved = snapshot.approved_overrides ?? [];
  const staleSources = snapshot.stale_sources ?? [];
  const stalePortals = snapshot.stale_portals ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Knowledge governance"
        title="Knowledge Review"
        description="Central review queue for tenant rule changes, approved overrides, and official sources or portals that are due for re-verification."
      />

      <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ["Drafts", counts.drafts ?? 0],
          ["Pending review", counts.pending_review ?? 0],
          ["Approved overrides", counts.approved_overrides ?? 0],
          ["Stale sources", counts.stale_sources ?? 0],
          ["Stale portals", counts.stale_portals ?? 0],
        ].map(([label, value]) => (
          <div key={String(label)} className="tba-card p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#667085]">{label}</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-[#101828]">{String(value)}</p>
          </div>
        ))}
      </section>

      <section className="mb-6 grid gap-6 xl:grid-cols-2">
        <div className="tba-card p-6">
          <h2 className="text-lg font-semibold">Draft rule versions</h2>
          <p className="mt-1 text-sm text-[#667085]">Tenant-scoped changes that still need editing or review submission.</p>

          <div className="mt-5 grid gap-3">
            {drafts.length ? drafts.map((item: any) => (
              <div key={item.rule_version_id} className="rounded-xl border border-[#eaecf0] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-[#101828]">{item.name}</p>
                    <p className="mt-1 text-xs text-[#667085]">
                      v{item.version_number} · {item.payer_name ?? "Universal"}{item.state ? " · " + item.state : ""}
                    </p>
                  </div>
                  <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
                    Draft
                  </span>
                </div>
                <p className="mt-2 text-xs text-[#667085]">Updated {fmt(item.updated_at)}</p>
                {item.offering_id ? (
                  <Link
                    href={"/payer-programs/" + item.offering_id}
                    className="mt-3 inline-block text-sm font-semibold text-[#175cd3] underline underline-offset-2"
                  >
                    Open program
                  </Link>
                ) : null}
              </div>
            )) : <p className="text-sm text-[#667085]">No draft tenant rule versions.</p>}
          </div>
        </div>

        <div className="tba-card p-6">
          <h2 className="text-lg font-semibold">Pending review</h2>
          <p className="mt-1 text-sm text-[#667085]">Tenant rule versions waiting for administrator decision.</p>

          <div className="mt-5 grid gap-3">
            {pending.length ? pending.map((item: any) => (
              <div key={item.rule_version_id} className="rounded-xl border border-[#eaecf0] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-[#101828]">{item.name}</p>
                    <p className="mt-1 text-xs text-[#667085]">
                      v{item.version_number} · {item.payer_name ?? "Universal"}{item.state ? " · " + item.state : ""}
                    </p>
                  </div>
                  <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">
                    Pending review
                  </span>
                </div>
                {item.change_reason ? <p className="mt-2 text-sm text-[#667085]">{item.change_reason}</p> : null}
                {item.offering_id ? (
                  <Link
                    href={"/payer-programs/" + item.offering_id}
                    className="mt-3 inline-block text-sm font-semibold text-[#175cd3] underline underline-offset-2"
                  >
                    Review in program
                  </Link>
                ) : null}
              </div>
            )) : <p className="text-sm text-[#667085]">Nothing is waiting for review.</p>}
          </div>
        </div>
      </section>

      <section className="mb-6 tba-card p-6">
        <h2 className="text-lg font-semibold">Approved tenant overrides</h2>
        <p className="mt-1 text-sm text-[#667085]">
          Active tenant-specific rules that supersede their global production parent.
        </p>

        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {approved.length ? approved.map((item: any) => (
            <div key={item.rule_version_id} className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-[#101828]">{item.name}</p>
                  <p className="mt-1 text-xs text-[#667085]">
                    v{item.version_number} · {item.payer_name ?? "Universal"}{item.state ? " · " + item.state : ""}
                  </p>
                </div>
                <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800">
                  Approved
                </span>
              </div>
              <p className="mt-2 text-xs text-[#667085]">Approved {fmt(item.approved_at)}</p>
              {item.offering_id ? (
                <Link
                  href={"/payer-programs/" + item.offering_id}
                  className="mt-3 inline-block text-sm font-semibold text-[#175cd3] underline underline-offset-2"
                >
                  Open program
                </Link>
              ) : null}
            </div>
          )) : <p className="text-sm text-[#667085]">No approved tenant overrides.</p>}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="tba-card p-6">
          <h2 className="text-lg font-semibold">Official sources due for re-verification</h2>
          <p className="mt-1 text-sm text-[#667085]">
            Active or unverified knowledge sources not verified within the last {snapshot.stale_days ?? 90} days.
          </p>

          <div className="mt-5 grid gap-3">
            {staleSources.length ? staleSources.map((item: any) => (
              <div key={item.id} className="rounded-xl border border-[#eaecf0] p-4">
                <p className="font-medium text-[#101828]">{item.title}</p>
                <p className="mt-1 text-xs capitalize text-[#667085]">
                  {(item.authority_level ?? "unknown").replaceAll("_", " ")} · {(item.source_type ?? "source").replaceAll("_", " ")}
                </p>
                <p className="mt-2 text-xs text-[#667085]">Last verified: {fmt(item.last_verified_at)}</p>
                <div className="mt-3 flex flex-wrap gap-3">
                  {item.url ? (
                    <a href={item.url} target="_blank" rel="noreferrer" className="text-sm font-semibold text-[#175cd3] underline">
                      Open source
                    </a>
                  ) : null}
                  {item.offering_id ? (
                    <Link href={"/payer-programs/" + item.offering_id} className="text-sm font-semibold text-[#175cd3] underline">
                      Open program
                    </Link>
                  ) : null}
                </div>
              </div>
            )) : <p className="text-sm text-[#667085]">No stale sources under the current threshold.</p>}
          </div>
        </div>

        <div className="tba-card p-6">
          <h2 className="text-lg font-semibold">Portal resources due for re-verification</h2>
          <p className="mt-1 text-sm text-[#667085]">
            Active portal resources not verified within the last {snapshot.stale_days ?? 90} days.
          </p>

          <div className="mt-5 grid gap-3">
            {stalePortals.length ? stalePortals.map((item: any) => (
              <div key={item.id} className="rounded-xl border border-[#eaecf0] p-4">
                <p className="font-medium text-[#101828]">{item.name}</p>
                <p className="mt-1 text-xs text-[#667085]">
                  {item.payer_name ?? "Payer"}{item.state ? " · " + item.state : ""}
                </p>
                <p className="mt-2 text-xs text-[#667085]">Last verified: {fmt(item.last_verified_at)}</p>
                <div className="mt-3 flex flex-wrap gap-3">
                  {item.url ? (
                    <a href={item.url} target="_blank" rel="noreferrer" className="text-sm font-semibold text-[#175cd3] underline">
                      Open portal
                    </a>
                  ) : null}
                  {item.offering_id ? (
                    <Link href={"/payer-programs/" + item.offering_id} className="text-sm font-semibold text-[#175cd3] underline">
                      Open program
                    </Link>
                  ) : null}
                </div>
              </div>
            )) : <p className="text-sm text-[#667085]">No stale portal resources under the current threshold.</p>}
          </div>
        </div>
      </section>
    </>
  );
}
