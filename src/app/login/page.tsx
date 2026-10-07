"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(signInError.message);
      setPending(false);
      return;
    }

    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-[#101828] px-6 py-12">
      <div className="mx-auto flex min-h-[calc(100vh-6rem)] max-w-6xl items-center">
        <div className="grid w-full overflow-hidden rounded-3xl bg-white shadow-2xl lg:grid-cols-[1.1fr_.9fr]">
          <section className="hidden bg-[#175cd3] p-12 text-white lg:flex lg:flex-col lg:justify-between">
            <div>
              <div className="mb-10 inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em]">
                TBA Credentialing
              </div>
              <h1 className="max-w-xl text-5xl font-semibold leading-tight">
                One operating system for credentialing work.
              </h1>
              <p className="mt-6 max-w-lg text-lg leading-8 text-blue-100">
                Providers, payers, requirements, follow-ups, documents, NPPES verification,
                and enrollment cases in one controlled workflow.
              </p>
            </div>
            <p className="text-sm text-blue-100">
              Multi-tenant security is enforced in Supabase with Row Level Security.
            </p>
          </section>

          <section className="p-8 sm:p-12">
            <div className="mx-auto max-w-md">
              <p className="text-sm font-semibold text-[#175cd3]">Welcome back</p>
              <h2 className="mt-2 text-3xl font-semibold text-[#101828]">Sign in</h2>
              <p className="mt-2 text-sm text-[#667085]">
                Use the Supabase Auth account you already created.
              </p>

              <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
                <div>
                  <label className="tba-label" htmlFor="email">Email</label>
                  <input
                    id="email"
                    className="tba-input"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                  />
                </div>

                <div>
                  <label className="tba-label" htmlFor="password">Password</label>
                  <input
                    id="password"
                    className="tba-input"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                  />
                </div>

                {error ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                ) : null}

                <button
                  className="w-full rounded-xl bg-[#175cd3] px-4 py-3 font-semibold text-white transition hover:bg-[#1849a9] disabled:cursor-not-allowed disabled:opacity-60"
                  type="submit"
                  disabled={pending}
                >
                  {pending ? "Signing in..." : "Sign in"}
                </button>
              </form>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
