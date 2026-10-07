import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";

async function countRows(table: string, configure?: (query: any) => any) {
  const supabase = await createClient();
  let query = supabase.from(table).select("*", { count: "exact", head: true });
  if (configure) query = configure(query);
  const { count } = await query;
  return count ?? 0;
}

export default async function DashboardPage() {
  const now = new Date().toISOString();

  const [clients, providers, organizations, activeCases, openTasks, overdueTasks] =
    await Promise.all([
      countRows("clients", (q) => q.is("archived_at", null)),
      countRows("providers", (q) => q.is("archived_at", null)),
      countRows("organizations", (q) => q.is("archived_at", null)),
      countRows("enrollment_cases", (q) => q.is("archived_at", null).not("status_code", "in", "(operationally_complete,fully_activated,denied,withdrawn,cancelled)")),
      countRows("tasks", (q) => q.in("status", ["open", "in_progress", "blocked"])),
      countRows("tasks", (q) => q.in("status", ["open", "in_progress", "blocked"]).lt("due_at", now)),
    ]);

  const cards = [
    ["Clients", clients],
    ["Providers", providers],
    ["Organizations", organizations],
    ["Active cases", activeCases],
    ["Open tasks", openTasks],
    ["Overdue", overdueTasks],
  ] as const;

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Dashboard"
        description="A live summary of credentialing workload across your tenant."
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map(([label, value]) => (
          <div key={label} className="tba-card p-6">
            <p className="text-sm font-medium text-[#667085]">{label}</p>
            <p className="mt-3 text-4xl font-semibold tracking-tight text-[#101828]">{value}</p>
          </div>
        ))}
      </section>

      <section className="tba-card mt-6 p-6">
        <h2 className="text-lg font-semibold">Current build status</h2>
        <p className="mt-2 text-sm leading-6 text-[#667085]">
          The operational database, payer/knowledge engine, enrollment cases, workflows,
          tasks, document metadata, and live NPPES verification are connected. The next
          frontend slices will expand case operations and document workflows.
        </p>
      </section>
    </>
  );
}
