"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const roles = new Set(["employed", "contracted", "medical_staff", "other"]);

function field(data: FormData, name: string): string {
  return String(data.get(name) ?? "").trim();
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T00:00:00.000Z");
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

async function providerContext(providerId: string) {
  if (!uuidPattern.test(providerId)) throw new Error("Invalid provider.");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: provider, error } = await supabase
    .from("providers")
    .select("id,tenant_id,client_id")
    .eq("id", providerId)
    .is("archived_at", null)
    .single();

  if (error || !provider) throw new Error("Provider is not available.");

  const { data: membership, error: membershipError } = await supabase
    .from("tenant_memberships")
    .select("tenant_id")
    .eq("tenant_id", provider.tenant_id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (membershipError || !membership) throw new Error("Active tenant membership is required.");
  return { supabase, userId: user.id, provider };
}

export async function addProviderAffiliation(formData: FormData) {
  const providerId = field(formData, "provider_id");
  const organizationId = field(formData, "organization_id");
  const affiliationType = field(formData, "affiliation_type");
  const status = field(formData, "status");
  const effectiveFrom = field(formData, "effective_from");

  if (!uuidPattern.test(organizationId)) throw new Error("Select an organization.");
  if (!roles.has(affiliationType)) throw new Error("Select a valid affiliation type.");
  if (status !== "current" && status !== "pending") throw new Error("Select a valid affiliation status.");
  if (effectiveFrom && !validDate(effectiveFrom)) throw new Error("Enter a valid effective start date.");
  if (effectiveFrom && status === "current" && effectiveFrom > new Date().toISOString().slice(0, 10)) {
    throw new Error("A future affiliation must be marked Pending.");
  }

  const { supabase, userId, provider } = await providerContext(providerId);
  if (!provider.client_id) throw new Error("Assign the provider to a client before linking a group.");

  const { data: organization, error: organizationError } = await supabase
    .from("organizations")
    .select("id,tenant_id,client_id")
    .eq("id", organizationId)
    .eq("tenant_id", provider.tenant_id)
    .is("archived_at", null)
    .single();

  if (organizationError || !organization || organization.client_id !== provider.client_id) {
    throw new Error("The organization must belong to the same client as the provider.");
  }

  const { data: existing, error: existingError } = await supabase
    .from("provider_affiliations")
    .select("id")
    .eq("tenant_id", provider.tenant_id)
    .eq("provider_id", provider.id)
    .eq("organization_id", organization.id)
    .in("status", ["current", "pending"])
    .is("archived_at", null)
    .limit(1);

  if (existingError) throw new Error(existingError.message);
  if (existing?.length) throw new Error("A current or pending affiliation with this organization already exists.");

  const { error } = await supabase.from("provider_affiliations").insert({
    tenant_id: provider.tenant_id,
    provider_id: provider.id,
    organization_id: organization.id,
    affiliation_type: affiliationType,
    effective_from: effectiveFrom || null,
    primary_affiliation: false,
    status,
    created_by: userId,
    updated_by: userId,
  });

  if (error) throw new Error(error.message);
  revalidatePath(`/providers/${providerId}`);
  revalidatePath(`/clients/${provider.client_id}`);
}

export async function changeProviderAffiliationStatus(formData: FormData) {
  const providerId = field(formData, "provider_id");
  const affiliationId = field(formData, "affiliation_id");
  const nextStatus = field(formData, "next_status");
  if (!uuidPattern.test(affiliationId)) throw new Error("Invalid affiliation.");
  if (nextStatus !== "current" && nextStatus !== "historical") {
    throw new Error("Invalid affiliation transition.");
  }

  const { supabase, userId, provider } = await providerContext(providerId);
  const { data: affiliation, error: affiliationError } = await supabase
    .from("provider_affiliations")
    .select("id,status,effective_from,organization_id")
    .eq("id", affiliationId)
    .eq("provider_id", providerId)
    .eq("tenant_id", provider.tenant_id)
    .is("archived_at", null)
    .single();

  if (affiliationError || !affiliation) throw new Error("Affiliation not found.");

  let changes: { status: string; updated_by: string; effective_to?: string | null };
  if (nextStatus === "current") {
    if (affiliation.status !== "pending") throw new Error("Only pending affiliations can be activated.");
    if (affiliation.effective_from && affiliation.effective_from > new Date().toISOString().slice(0, 10)) {
      throw new Error("Cannot activate before the effective start date.");
    }
    const { data: duplicate, error: duplicateError } = await supabase
      .from("provider_affiliations")
      .select("id")
      .eq("tenant_id", provider.tenant_id)
      .eq("provider_id", providerId)
      .eq("organization_id", affiliation.organization_id)
      .eq("status", "current")
      .is("archived_at", null)
      .limit(1);
    if (duplicateError) throw new Error(duplicateError.message);
    if (duplicate?.length) throw new Error("A current affiliation already exists for this organization.");
    changes = { status: "current", updated_by: userId };
  } else {
    if (affiliation.status !== "current" && affiliation.status !== "pending") {
      throw new Error("Only open affiliations can be ended.");
    }
    const effectiveTo = field(formData, "effective_to") || new Date().toISOString().slice(0, 10);
    if (!validDate(effectiveTo)) throw new Error("Enter a valid end date.");
    if (effectiveTo > new Date().toISOString().slice(0, 10)) {
      throw new Error("A historical affiliation cannot have a future end date.");
    }
    if (affiliation.effective_from && effectiveTo < affiliation.effective_from) {
      throw new Error("End date cannot precede the effective start date.");
    }
    changes = { status: "historical", effective_to: effectiveTo, updated_by: userId };
  }

  const { data: updated, error } = await supabase
    .from("provider_affiliations")
    .update(changes)
    .eq("id", affiliationId)
    .eq("provider_id", providerId)
    .eq("tenant_id", provider.tenant_id)
    .eq("status", affiliation.status)
    .is("archived_at", null)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!updated) throw new Error("The affiliation was updated elsewhere. Refresh and try again.");
  revalidatePath(`/providers/${providerId}`);
  if (provider.client_id) revalidatePath(`/clients/${provider.client_id}`);
}
