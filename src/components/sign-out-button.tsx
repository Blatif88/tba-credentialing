"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <button
      onClick={signOut}
      className="w-full rounded-lg border border-white/10 px-3 py-2 text-left text-sm text-[#d0d5dd] hover:bg-white/5 hover:text-white"
    >
      Sign out
    </button>
  );
}
