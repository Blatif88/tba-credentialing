"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignOutButton } from "@/components/sign-out-button";

const navigation = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/today", label: "Today's Work" },
  { href: "/clients", label: "Clients" },
  { href: "/providers", label: "Providers" },
  { href: "/organizations", label: "Organizations" },
  { href: "/locations", label: "Locations" },
  { href: "/projects", label: "Projects" },
  { href: "/enrollment-cases", label: "Enrollment Cases" },
  { href: "/documents", label: "Documents" },
  { href: "/payer-programs", label: "Payer Programs" },
  { href: "/knowledge-review", label: "Knowledge Review" },
];

export function Sidebar({ email }: { email: string }) {
  const pathname = usePathname();

  return (
    <aside className="flex w-full shrink-0 flex-col bg-[#101828] px-4 py-5 text-white lg:min-h-screen lg:w-64">
      <div className="px-3 pb-6">
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[#84adff]">TBA</div>
        <div className="mt-1 text-lg font-semibold">Credentialing</div>
      </div>

      <nav className="grid gap-1 sm:grid-cols-3 lg:block">
        {navigation.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                "block rounded-lg px-3 py-2.5 text-sm font-medium transition",
                active
                  ? "bg-white/10 text-white"
                  : "text-[#98a2b3] hover:bg-white/5 hover:text-white",
              ].join(" ")}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-6 border-t border-white/10 pt-4 lg:mt-auto">
        <p className="truncate px-3 pb-3 text-xs text-[#98a2b3]">{email}</p>
        <SignOutButton />
      </div>
    </aside>
  );
}
