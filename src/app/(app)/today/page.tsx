import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";

type View = "all" | "attention" | "week";
type WorkItem = {
  id: string;
  kind: "task" | "followup";
  title: string;
  detail: string;
  caseId: string | null;
  dueAt: string | null;
  priority: string;
  status: string;
  escalationLevel: number;
};

type CaseSummary = {
  label: string;
  payer: string;
  status: string;
};

const LIMIT_PER_QUEUE = 100;
const DAY_MS = 24 * 60 * 60 * 1000;

function urgency(item: WorkItem, now: number): "overdue" | "soon" | "week" | "later" | "undated" {
  if (!item.dueAt) return "undated";
  const due = Date.parse(item.dueAt);
  if (!Number.isFinite(due)) return "undated";
  if (due < now) return "overdue";
  if (due <= now + DAY_MS) return "soon";
  if (due <= now + 7 * DAY_MS) return "week";
  return "later";
}

function formatDue(date: string | null): string {
  if (!date || !Number.isFinite(Date.parse(date))) return "Not scheduled";
  return new Date(date).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }) + " UTC";
}

function workList(items: WorkItem[], summaries: Map<string, CaseSummary>, now: number) {
  if (!items.length) {
    return <p className="px-5 py-8 text-sm text-[#667085]">No matching items in this queue.</p>;
  }

  return items.map((item) => {
    const bucket = urgency(item, now);
    const summary = item.caseId ? summaries.get(item.caseId) : undefined;
    const isImportant = bucket === "overdue" || item.status === "blocked" || item.escalationLevel > 0;
    const dueClass = bucket === "overdue" ? "text-[#b42318]" : bucket === "soon" ? "text-[#b54708]" : "text-[#667085]";

    return (
      <div key={item.kind + ":" + item.id} className="flex flex-col gap-3 border-b border-[#eaecf0] px-5 py-4 last:border-b-0 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-[#101828]">{item.title}</span>
            {isImportant ? (
              <span className="rounded-full bg-[#fff1f0] px-2 py-0.5 text-xs font-semibold text-[#b42318]">
                {bucket === "overdue" ? "Overdue" : item.status === "blocked" ? "Blocked" : "Escalated"}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-[#667085]">
            {item.detail ? item.detail + " · " : ""}
            {summary ? summary.label + " · " + summary.payer : item.caseId ? "Case details unavailable" : "Unlinked task"}
          </p>
          {summary ? <p className="mt-1 text-xs capitalize text-[#667085]">Case status: {summary.status.replaceAll("_", " ")}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-3 lg:justify-end">
          <span className="text-xs capitalize text-[#475467]">{item.priority.replaceAll("_", " ")} · {item.status.replaceAll("_", " ")}</span>
          <span className={"min-w-40 text-sm font-medium " + dueClass}>{formatDue(item.dueAt)}</span>
          {item.caseId && summary ? (
            <Link
              href={"/enrollment-cases/" + item.caseId}
              className="rounded-lg border border-[#b2ccff] px-3 py-2 text-sm font-semibold text-[#175cd3] hover:bg-[#eff8ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#175cd3]"
            >
              Open case
            </Link>
          ) : null}
        </div>
      </div>
    );
  });
}

export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const params = await searchParams;
  const view: View = params.view === "attention" || params.view === "week" ? params.view : "all";
  const supabase = await createClient();
  const now = Date.now();

  const [
    { data: tasks, error: taskError, count: taskCount },
    { data: followups, error: followupError, count: followupCount },
  ] = await Promise.all([
    supabase
      .from("tasks")
      .select("id,case_id,title,description,priority,status,due_at,escalation_level", { count: "exact" })
      .in("status", ["open", "in_progress", "blocked"])
      .order("due_at", { ascending: true, nullsFirst: false })
      .limit(LIMIT_PER_QUEUE),
    supabase
      .from("followups")
      .select("id,case_id,method,scheduled_at,notes,escalation_level", { count: "exact" })
      .is("completed_at", null)
      .order("scheduled_at", { ascending: true })
      .limit(LIMIT_PER_QUEUE),
  ]);

  const caseIds = Array.from(new Set(
    [...(tasks ?? []), ...(followups ?? [])]
      .map((record) => record.case_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0),
  ));

  const { data: cases, error: caseError } = caseIds.length
    ? await supabase
      .from("enrollment_cases")
      .select("id,status_code,state,providers(first_name,last_name),organizations(legal_name),payer_organizations(display_name)")
      .in("id", caseIds)
    : { data: [], error: null };

  const summaries = new Map<string, CaseSummary>();
  for (const row of cases ?? []) {
    const provider = (Array.isArray(row.providers) ? row.providers[0] : row.providers) as { first_name?: string; last_name?: string } | null;
    const organization = (Array.isArray(row.organizations) ? row.organizations[0] : row.organizations) as { legal_name?: string } | null;
    const payer = (Array.isArray(row.payer_organizations) ? row.payer_organizations[0] : row.payer_organizations) as { display_name?: string } | null;
    summaries.set(row.id, {
      label: [provider?.first_name, provider?.last_name].filter(Boolean).join(" ") || organization?.legal_name || "Enrollment case",
      payer: payer?.display_name || row.state || "Payer not set",
      status: row.status_code,
    });
  }

  const taskItems: WorkItem[] = (tasks ?? []).map((task) => ({
    id: task.id,
    kind: "task",
    title: task.title,
    detail: task.description ? task.description.slice(0, 140) : "Case task",
    caseId: task.case_id,
    dueAt: task.due_at,
    priority: task.priority || "normal",
    status: task.status || "open",
    escalationLevel: task.escalation_level || 0,
  }));

  const followupItems: WorkItem[] = (followups ?? []).map((followup) => ({
    id: followup.id,
    kind: "followup",
    title: "Payer follow-up",
    detail: (followup.method || "Follow-up").replaceAll("_", " "),
    caseId: followup.case_id,
    dueAt: followup.scheduled_at,
    priority: (followup.escalation_level ?? 0) > 0 ? "high" : "normal",
    status: "scheduled",
    escalationLevel: followup.escalation_level || 0,
  }));

  const items = [...taskItems, ...followupItems];
  const countOverdue = items.filter((item) => urgency(item, now) === "overdue").length;
  const countSoon = items.filter((item) => urgency(item, now) === "soon").length;
  const isVisible = (item: WorkItem) => {
    if (view === "all") return true;
    const category = urgency(item, now);
    if (view === "week") return category === "overdue" || category === "soon" || category === "week";
    return category === "overdue" || category === "soon" || item.status === "blocked" || item.escalationLevel > 0;
  };
  const sortByDue = (a: WorkItem, b: WorkItem) => {
    const first = a.dueAt ? Date.parse(a.dueAt) : Number.POSITIVE_INFINITY;
    const second = b.dueAt ? Date.parse(b.dueAt) : Number.POSITIVE_INFINITY;
    return first - second || b.escalationLevel - a.escalationLevel;
  };
  const taskRows = taskItems.filter(isVisible).sort(sortByDue);
  const followupRows = followupItems.filter(isVisible).sort(sortByDue);
  const incomplete = Boolean(taskError || followupError || caseError);
  const limited = (taskCount ?? 0) > LIMIT_PER_QUEUE || (followupCount ?? 0) > LIMIT_PER_QUEUE;

  return (
    <>
      <PageHeader
        eyebrow="Daily operations"
        title="Today's Work"
        description="Tasks and scheduled payer follow-ups in one queue. Dates are displayed in UTC."
        action={<Link href="/enrollment-cases" className="rounded-lg bg-[#175cd3] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1849a9]">View all cases</Link>}
      />

      {incomplete ? (
        <div role="alert" className="mb-5 rounded-xl border border-[#fecdca] bg-[#fffbfa] px-4 py-3 text-sm text-[#b42318]">
          Some work items or case details could not be loaded. Refresh this page or check your access permissions.
        </div>
      ) : null}

      <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Workload summary">
        {[
          ["Overdue", countOverdue],
          ["Next 24 hours", countSoon],
          ["Open tasks", taskCount ?? taskItems.length],
          ["Pending follow-ups", followupCount ?? followupItems.length],
        ].map(([label, count]) => (
          <div key={label} className="tba-card p-5">
            <p className="text-sm text-[#667085]">{label}</p>
            <p className="mt-2 text-3xl font-semibold tabular-nums text-[#101828]">{count}</p>
          </div>
        ))}
      </section>

      <nav aria-label="Work queue filters" className="mb-6 flex flex-wrap gap-2">
        {([
          ["all", "All outstanding"],
          ["attention", "Needs attention"],
          ["week", "Next 7 days"],
        ] as const).map(([key, label]) => (
          <Link
            key={key}
            href={key === "all" ? "/today" : "/today?view=" + key}
            aria-current={view === key ? "page" : undefined}
            className={view === key
              ? "rounded-lg bg-[#175cd3] px-4 py-2 text-sm font-semibold text-white"
              : "rounded-lg border border-[#d0d5dd] bg-white px-4 py-2 text-sm font-medium text-[#344054] hover:bg-[#f9fafb]"}
          >
            {label}
          </Link>
        ))}
      </nav>

      <section className="tba-card mb-6 overflow-hidden">
        <div className="border-b border-[#eaecf0] bg-[#f9fafb] px-5 py-4">
          <h2 className="text-lg font-semibold text-[#101828]">Case tasks <span className="text-sm font-normal text-[#667085]">({taskRows.length} shown)</span></h2>
          <p className="mt-1 text-sm text-[#667085]">Open, in-progress and blocked tasks, ordered by due date.</p>
        </div>
        {workList(taskRows, summaries, now)}
      </section>

      <section className="tba-card overflow-hidden">
        <div className="border-b border-[#eaecf0] bg-[#f9fafb] px-5 py-4">
          <h2 className="text-lg font-semibold text-[#101828]">Payer follow-ups <span className="text-sm font-normal text-[#667085]">({followupRows.length} shown)</span></h2>
          <p className="mt-1 text-sm text-[#667085]">Pending scheduled calls and follow-ups. Open the case to record an outcome or schedule the next contact.</p>
        </div>
        {workList(followupRows, summaries, now)}
      </section>

      {limited ? (
        <p className="mt-4 text-sm text-[#667085]">This page loads the earliest {LIMIT_PER_QUEUE} outstanding tasks and {LIMIT_PER_QUEUE} pending follow-ups. Summary counts may include additional items not listed here.</p>
      ) : null}
    </>
  );
}
