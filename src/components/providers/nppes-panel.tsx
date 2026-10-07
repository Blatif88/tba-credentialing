"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Comparison = { id: string; field_name: string; internal_value: unknown; nppes_value: unknown; comparison_status: string; user_decision: string | null; };
function renderValue(value: unknown) { if (value === null || value === undefined || value === "") return "—"; return typeof value === "string" ? value : JSON.stringify(value); }

export function NppesPanel({ providerId, npi, status, comparisons }: { providerId: string; npi: string | null; status: string; comparisons: Comparison[]; }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function verify() {
    setPending(true); setMessage(null);
    const supabase = createClient();
    const { data, error } = await supabase.functions.invoke("verify-nppes", { body: { subject_type: "provider", subject_id: providerId } });
    if (error) { setMessage(error.message); setPending(false); return; }
    setMessage(data?.found === false ? "NPI was not found in NPPES." : "NPPES verification completed.");
    setPending(false); router.refresh();
  }

  async function review(comparisonId: string, decision: "accept" | "ignore" | "review_later") {
    setPending(true); setMessage(null);
    const supabase = createClient();
    const { error } = await supabase.functions.invoke("review-nppes-comparisons", { body: { comparison_ids: [comparisonId], decision } });
    if (error) { setMessage(error.message); setPending(false); return; }
    setPending(false); router.refresh();
  }

  return (
    <section className="tba-card p-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#175cd3]">NPPES</p><h2 className="mt-1 text-xl font-semibold">Identity verification</h2><p className="mt-1 text-sm text-[#667085]">Current status: <span className="font-medium capitalize text-[#344054]">{status.replaceAll("_", " ")}</span></p></div>
        <button onClick={verify} disabled={pending || !npi} className="rounded-xl bg-[#175cd3] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1849a9] disabled:cursor-not-allowed disabled:opacity-50">{pending ? "Working..." : "Verify NPPES"}</button>
      </div>
      {!npi ? <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Add a 10-digit NPI to this provider before verification.</div> : null}
      {message ? <div className="mt-5 rounded-xl border border-[#d0d5dd] bg-[#f9fafb] px-4 py-3 text-sm text-[#475467]">{message}</div> : null}
      {comparisons.length ? <div className="mt-6 overflow-hidden rounded-xl border border-[#eaecf0]">
        <div className="grid grid-cols-[1fr_1.2fr_1.2fr_130px] bg-[#f9fafb] px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[#667085]"><span>Field</span><span>Entered</span><span>NPPES</span><span>Decision</span></div>
        {comparisons.map((comparison) => <div key={comparison.id} className="grid grid-cols-[1fr_1.2fr_1.2fr_130px] items-center border-t border-[#f2f4f7] px-4 py-3 text-sm">
          <div><div className="font-medium text-[#344054]">{comparison.field_name.replaceAll("_", " ")}</div><div className="mt-0.5 text-xs capitalize text-[#667085]">{comparison.comparison_status.replaceAll("_", " ")}</div></div>
          <span className="pr-3 text-[#475467]">{renderValue(comparison.internal_value)}</span><span className="pr-3 text-[#475467]">{renderValue(comparison.nppes_value)}</span>
          {comparison.comparison_status === "same" ? <span className="text-xs font-semibold text-emerald-700">Matched</span> : comparison.user_decision ? <span className="text-xs font-semibold capitalize text-[#475467]">{comparison.user_decision}</span> : <div className="grid gap-1">
            <button onClick={() => review(comparison.id, "accept")} disabled={pending} className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">Accept</button>
            <button onClick={() => review(comparison.id, "ignore")} disabled={pending} className="rounded-md bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">Ignore</button>
            <button onClick={() => review(comparison.id, "review_later")} disabled={pending} className="rounded-md bg-[#f2f4f7] px-2 py-1 text-xs font-semibold text-[#475467]">Later</button>
          </div>}
        </div>)}
      </div> : null}
    </section>
  );
}
