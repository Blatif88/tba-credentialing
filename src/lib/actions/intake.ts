"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

async function context() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership, error } = await supabase
    .from("tenant_memberships")
    .select("tenant_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .single();

  if (error || !membership) throw new Error("No active tenant membership is available.");
  return { supabase, user, tenantId: membership.tenant_id };
}

function value(formData: FormData, key: string) {
  const raw = formData.get(key);
  return raw === null ? "" : String(raw).trim();
}

export async function createClientRecord(formData: FormData) {
  const { supabase, user, tenantId } = await context();
  const name = value(formData, "name");
  if (!name) throw new Error("Client name is required.");

  const { error } = await supabase.from("clients").insert({
    tenant_id: tenantId,
    name,
    client_type: value(formData, "client_type") || "group",
    status: "onboarding",
    primary_contact_name: value(formData, "primary_contact_name") || null,
    primary_contact_email: value(formData, "primary_contact_email") || null,
    primary_contact_phone: value(formData, "primary_contact_phone") || null,
    created_by: user.id,
    updated_by: user.id,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/clients");
}

export async function createOrganizationRecord(formData: FormData) {
  const { supabase, user, tenantId } = await context();
  const legalName = value(formData, "legal_name");
  if (!legalName) throw new Error("Legal name is required.");

  const npi = value(formData, "entity_npi");
  if (npi && !/^\d{10}$/.test(npi)) throw new Error("Organization NPI must contain exactly 10 digits.");

  const { error } = await supabase.from("organizations").insert({
    tenant_id: tenantId,
    client_id: value(formData, "client_id") || null,
    legal_name: legalName,
    dba_name: value(formData, "dba_name") || null,
    organization_type: value(formData, "organization_type") || null,
    entity_npi: npi || null,
    created_by: user.id,
    updated_by: user.id,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/organizations");
}

export async function createLocationRecord(formData: FormData) {
  const { supabase, user, tenantId } = await context();
  const address1 = value(formData, "address_line_1");
  const city = value(formData, "city");
  const state = value(formData, "state").toUpperCase();
  const zip = value(formData, "zip");

  if (!address1 || !city || !/^[A-Z]{2}$/.test(state) || !zip) {
    throw new Error("Address, city, 2-letter state, and ZIP are required.");
  }

  const { error } = await supabase.from("locations").insert({
    tenant_id: tenantId,
    client_id: value(formData, "client_id") || null,
    organization_id: value(formData, "organization_id") || null,
    name: value(formData, "name") || null,
    address_line_1: address1,
    address_line_2: value(formData, "address_line_2") || null,
    city,
    state,
    zip,
    county: value(formData, "county") || null,
    phone: value(formData, "phone") || null,
    location_type: value(formData, "location_type") || null,
    billing_location: formData.get("billing_location") === "on",
    mailing_location: formData.get("mailing_location") === "on",
    credentialing_location: formData.get("credentialing_location") !== null,
    created_by: user.id,
    updated_by: user.id,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/locations");
}

export async function updateProviderRecord(formData: FormData) {
  const { supabase, user } = await context();
  const id = value(formData, "provider_id");
  if (!id) throw new Error("Provider ID is required.");

  const npi = value(formData, "individual_npi");
  if (npi && !/^\d{10}$/.test(npi)) throw new Error("NPI must contain exactly 10 digits.");

  const { error } = await supabase.from("providers").update({
    client_id: value(formData, "client_id") || null,
    first_name: value(formData, "first_name"),
    middle_name: value(formData, "middle_name") || null,
    last_name: value(formData, "last_name"),
    suffix: value(formData, "suffix") || null,
    credential: value(formData, "credential") || null,
    individual_npi: npi || null,
    caqh_id: value(formData, "caqh_id") || null,
    updated_by: user.id,
  }).eq("id", id);

  if (error) throw new Error(error.message);
  revalidatePath(`/providers/${id}`);
  revalidatePath("/providers");
}

export async function createCredentialingProject(formData: FormData) {
  const { supabase, user, tenantId } = await context();
  const clientId = value(formData, "client_id");
  const providerId = value(formData, "provider_id");
  const organizationId = value(formData, "organization_id");
  const locationId = value(formData, "location_id");
  const name = value(formData, "name");

  if (!clientId || !name) throw new Error("Project name and client are required.");
  if (!providerId && !organizationId) throw new Error("Select at least a provider or organization.");

  const { data: project, error } = await supabase.from("credentialing_projects").insert({
    tenant_id: tenantId,
    client_id: clientId,
    name,
    project_type: "credentialing",
    status: "draft",
    start_date: value(formData, "start_date") || null,
    target_date: value(formData, "target_date") || null,
    owner_user_id: user.id,
    created_by: user.id,
    updated_by: user.id,
  }).select("id").single();

  if (error || !project) throw new Error(error?.message ?? "Could not create project.");

  if (providerId) {
    const { error: linkError } = await supabase.from("project_providers").insert({
      tenant_id: tenantId,
      project_id: project.id,
      provider_id: providerId,
      created_by: user.id,
    });
    if (linkError) throw new Error(linkError.message);
  }

  if (organizationId) {
    const { error: linkError } = await supabase.from("project_organizations").insert({
      tenant_id: tenantId,
      project_id: project.id,
      organization_id: organizationId,
      created_by: user.id,
    });
    if (linkError) throw new Error(linkError.message);
  }

  if (locationId) {
    const { error: linkError } = await supabase.from("project_locations").insert({
      tenant_id: tenantId,
      project_id: project.id,
      location_id: locationId,
      created_by: user.id,
    });
    if (linkError) throw new Error(linkError.message);
  }

  revalidatePath("/projects");
  redirect("/projects");
}
