import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";

export default async function TodayPage() {
  const supabase = await createClient();
  const { data: tasks } = await supabase
    .from("tasks")
    .select("id,title,priority,status,due_at")
    .in("status", ["open", "in_progress", "blocked"])
    .order("due_at", { ascending: true, nullsFirst: false })
    .limit(100);

  return (
    <>
      <PageHeader
        eyebrow="Daily queue"
        title="Today's Work"
        description="Open, in-progress, and blocked tasks ordered by due date."
      />
      <div className="tba-card overflow-hidden">
        <div className="grid grid-cols-[1fr_120px_120px_180px] border-b border-[#eaecf0] bg-[#f9fafb] px-5 py-3 text-xs font-semibold uppercase tracking-wide text-[#667085]">
          <span>Task</span><span>Priority</span><span>Status</span><span>Due</span>
        </div>
        {(tasks ?? []).length ? tasks!.map((task) => (
          <div key={task.id} className="grid grid-cols-[1fr_120px_120px_180px] items-center border-b border-[#f2f4f7] px-5 py-4 text-sm last:border-0">
            <span className="font-medium text-[#101828]">{task.title}</span>
            <span className="capitalize text-[#475467]">{task.priority}</span>
            <span className="capitalize text-[#475467]">{task.status.replaceAll("_", " ")}</span>
            <span className="text-[#667085]">{task.due_at ? new Date(task.due_at).toLocaleString() : "No due date"}</span>
          </div>
        )) : (
          <div className="px-5 py-10 text-center text-sm text-[#667085]">No open tasks yet.</div>
        )}
      </div>
    </>
  );
}
