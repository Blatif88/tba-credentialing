"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({
  idleLabel,
  pendingLabel = "Saving...",
  className = "",
  disabled = false,
}: {
  idleLabel: string;
  pendingLabel?: string;
  className?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className={`rounded-xl bg-[#175cd3] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1849a9] disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}
