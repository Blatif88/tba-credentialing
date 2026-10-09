import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";
import { findDuplicateGroups } from "@/lib/duplicate-review";

type Kind = "clients" | "organizations";
const PAGE_SIZE = 500;
const LIMIT = 5000;

async function loadAll(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: "clients" | "organizations",
  selection: string,
): Promise<{ records: any[]; truncated: boolean }> {
  const records: any[] = [];
  for (let offset = 0; offset < LIMIT; offset += PAGE_SIZE) {
    const { data, error } = await supabase.from(table)
      .select(selection).is("archived_at", null).order("id")
      .range(offset, offset + PAGE_SIZE - 1);
    if (error || !data) throw new Error("Unable to load " + table + " for duplicate review.");
    records.push(...data);
    if (data.length < PAGE_SIZE) return { records, truncated: false };
  }
  return { records, truncated: true };
}

async function relatedCounts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: string,
  column: string,
  id: string,
): Promise<number | null> {
  const { count, error } = await supabase.from(table)
    .select("id", { head: true, count: "exact" }).eq(column, id);
  return error ? null : count ?? 0;
}

type RecordInfo = {
  id: string;
  name: string;
  npi: string | null;
  clientName: string | null;
  status: string;
  createdAt: string;
  links: { label: string; count: number | null }[];
};

function countLabel(count: number | null): string {
  return count === null ? "Unavailable" : String(count);
}

export default async function DuplicateReviewPage({
  searchParams,
}: { searchParams: Promise<{ type?: string }> }) {
  const params = await searchParams;
  const kind: Kind = params.type === "clients" ? "clients" : "organizations";
  const supabase = await createClient();
  let error: string | null = null;
  let truncated = false;
  let groups: ReturnType<typeof findDuplicateGroups<RecordInfo>> = [];

  try {
    const [{ records, truncated: limited }, clientList] = await Promise.all([
      loadAll(supabase, kind, kind === "clients"
        ? "id,name,status,created_at"
        : "id,legal_name,entity_npi,client_id,status,created_at"),
      kind === "organizations" ? loadAll(supabase, "clients", "id,name") : Promise.resolve({ records: [], truncated: false }),
    ]);
    truncated = limited || clientList.truncated;
    const clientNames = new Map<string, string>(clientList.records.map((row) => [row.id, row.name]));
    const candidates = records.map((row) => ({
      id: row.id as string,
      name: String(kind === "clients" ? row.name : row.legal_name),
      npi: kind === "organizations" ? (row.entity_npi as string | null) : null,
      clientName: kind === "organizations" ? (clientNames.get(row.client_id) ?? null) : null,
      status: String(row.status),
      createdAt: String(row.created_at),
      links: [] as { label: string; count: number | null }[],
    }));
    const detected = findDuplicateGroups(candidates, kind === "organizations");
    const ids = [...new Set(detected.flatMap((group) => group.records.map((record) => record.id)))];
    const relations = kind === "organizations"
      ? [["Provider affiliations", "provider_affiliations", "organization_id"],
         ["Enrollment cases", "enrollment_cases", "organization_id"],
         ["Projects", "project_organizations", "organization_id"],
         ["Locations", "locations", "organization_id"],
         ["Documents", "documents", "organization_id"]]
      : [["Providers", "providers", "client_id"],
         ["Organizations", "organizations", "client_id"],
         ["Projects", "credentialing_projects", "client_id"],
         ["Locations", "locations", "client_id"],
         ["Documents", "documents", "client_id"],
         ["Tasks", "tasks", "client_id"]];
    const countsById = new Map<string, { label: string; count: number | null }[]>();
    await Promise.all(ids.map(async (id) => {
      const counts = await Promise.all(relations.map(async ([label, table, col]) => ({
        label,
        count: await relatedCounts(supabase, table, col, id),
      })));
      countsById.set(id, counts);
    }));
    groups = detected.map((group) => ({
      ...group,
      records: group.records.map((item) => ({ ...item, links: countsById.get(item.id) ?? [] })),
    }));
  } catch {
    error = "Duplicate review could not load all records. Refresh or check your account permissions.";
  }

  return (
    <>
      <PageHeader eyebrow="Data quality" title="Duplicate Review"
        description="Compare suspected duplicate clients and medical organizations before any manual data cleanup."
        action={<Link href="/organizations" className="rounded-lg border border-[#d0d5dd] bg-white px-4 py-2 text-sm font-semibold">Organizations</Link>} />
      <p className="mb-5 rounded-xl border border-[#d0d5dd] bg-[#f9fafb] px-5 py-4 text-sm text-[#475467]">
        This screen is read-only. Similar names or matching NPIs are review signals, not permission to merge or delete records. Check all links and identifiers first.
      </p>
      <nav aria-label="Duplicate type" className="mb-5 flex gap-2">
        <Link href="/duplicate-review?type=organizations" aria-current={kind === "organizations" ? "page" : undefined}
          className={kind === "organizations" ? "rounded-lg bg-[#175cd3] px-4 py-2 text-sm font-semibold text-white" : "rounded-lg border px-4 py-2 text-sm"}>Organizations</Link>
        <Link href="/duplicate-review?type=clients" aria-current={kind === "clients" ? "page" : undefined}
          className={kind === "clients" ? "rounded-lg bg-[#175cd3] px-4 py-2 text-sm font-semibold text-white" : "rounded-lg border px-4 py-2 text-sm"}>Clients</Link>
      </nav>
      {error ? <p role="alert" className="mb-5 rounded-xl border border-[#fecdca] p-4 text-sm text-[#b42318]">{error}</p> : null}
      {truncated ? <p role="alert" className="mb-5 rounded-xl border border-[#fecdca] p-4 text-sm text-[#b42318]">Review is limited to the first {LIMIT} records. This is not a complete duplicate audit.</p> : null}
      <section className="mb-5 grid gap-4 sm:grid-cols-2">
        <div className="tba-card p-5"><p className="text-sm text-[#667085]">Potential duplicate groups</p>
          <p className="mt-2 text-3xl font-semibold">{groups.length}</p></div>
        <div className="tba-card p-5"><p className="text-sm text-[#667085]">Records needing review</p>
          <p className="mt-2 text-3xl font-semibold">{groups.reduce((sum, group) => sum + group.records.length, 0)}</p></div>
      </section>
      {!error && !groups.length ? <div className="tba-card p-8 text-sm text-[#667085]">
        No duplicate groups were found within the loaded {kind} records.
      </div> : null}
      <div className="space-y-6">
        {groups.map((group, index) => (
          <section key={group.id} className="tba-card overflow-hidden">
            <div className="border-b border-[#eaecf0] bg-[#f9fafb] px-5 py-4">
              <h2 className="text-lg font-semibold">Review group {index + 1}: {group.records[0]?.name}</h2>
              <p className="mt-1 text-sm text-[#667085]">
                Match signal: {group.reasons.map((reason) => reason === "npi" ? "same NPI" : "normalized name").join(" and ")} · {group.records.length} records
              </p>
            </div>
            <div className="grid gap-4 p-5 xl:grid-cols-2">
              {group.records.map((record) => (
                <article key={record.id} className="rounded-xl border border-[#eaecf0] p-4">
                  <h3 className="font-semibold text-[#101828]">{record.name}</h3>
                  <p className="mt-1 text-xs text-[#667085]">Record ID: <code className="break-all">{record.id}</code></p>
                  <p className="mt-2 text-sm text-[#475467]">NPI: {record.npi || "Not recorded"} · Status: {record.status}</p>
                  {kind === "organizations" ? <p className="mt-1 text-sm text-[#475467]">Client: {record.clientName ?? "Unassigned"}</p> : null}
                  <p className="mt-1 text-sm text-[#667085]">Created: {new Date(record.createdAt).toLocaleDateString("en-US", { timeZone: "UTC" })}</p>
                  <h4 className="mt-4 text-sm font-semibold">Related records</h4>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {record.links.map((link) => <p key={link.label} className="rounded-lg bg-[#f9fafb] px-3 py-2 text-xs text-[#475467]">{link.label}: <strong>{countLabel(link.count)}</strong></p>)}
                  </div>
                  {kind === "clients" ? <Link className="mt-4 inline-block text-sm font-semibold text-[#175cd3] hover:underline" href={`/clients/${record.id}`}>Open client workspace →</Link>
                    : <Link className="mt-4 inline-block text-sm font-semibold text-[#175cd3] hover:underline" href="/organizations">Open organizations directory →</Link>}
                </article>
              ))}
            </div>
            <p className="border-t border-[#eaecf0] px-5 py-3 text-xs text-[#667085]">
              Review identifiers, client ownership and linked records before selecting which record should eventually be retained. No automatic actions are available.
            </p>
          </section>
        ))}
      </div>
    </>
  );
}
