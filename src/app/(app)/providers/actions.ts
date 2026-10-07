"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createProvider(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership, error: membershipError } = await supabase
    .from("tenant_memberships").select("tenant_id").eq("user_id", user.id).eq("status", "active").limit(1).single();

  if (membershipError || !membership) throw new Error("No active tenant membership is available for this user.");

  const firstName = String(formData.get("first_name") ?? "").trim();
  const middleName = String(formData.get("middle_name") ?? "").trim();
  const lastName = String(formData.get("last_name") ?? "").trim();
  const credential = String(formData.get("credential") ?? "").trim();
  const npi = String(formData.get("individual_npi") ?? "").trim();

  if (!firstName || !lastName) throw new Error("First and last name are required.");
  if (npi && !/^\d{10}$/.test(npi)) throw new Error("NPI must contain exactly 10 digits.");

  const { data: provider, error } = await supabase.from("providers").insert({
    tenant_id: membership.tenant_id,
    first_name: firstName,
    middle_name: middleName || null,
    last_name: lastName,
    credential: credential || null,
    individual_npi: npi || null,
    created_by: user.id,
    updated_by: user.id,
  }).select("id").single();

  if (error || !provider) throw new Error(error?.message ?? "Could not create provider.");
  revalidatePath("/providers");
  redirect(`/providers/${provider.id}`);
}
