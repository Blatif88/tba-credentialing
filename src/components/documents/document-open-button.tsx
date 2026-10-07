"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function DocumentOpenButton({ objectPath }: { objectPath: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openDocument() {
    setPending(true);
    setError(null);

    try {
      const supabase = createClient();
      const { data, error } = await supabase.storage
        .from("credentialing-documents")
        .createSignedUrl(objectPath, 300);

      if (error || !data?.signedUrl) {
        throw new Error(error?.message ?? "Could not create a secure file link.");
      }

      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open document.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={openDocument}
        disabled={pending}
        className="font-semibold text-[#175cd3] underline disabled:opacity-50"
      >
        {pending ? "Opening..." : "Open"}
      </button>
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
