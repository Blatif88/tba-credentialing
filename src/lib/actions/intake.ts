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

  let clientId = value(formData, "client_id");
  const newClientName = value(formData, "new_client_name");
  const providerId = value(formData, "provider_id");
  const organizationId = value(formData, "organization_id");
  const payerOfferingId = value(formData, "payer_offering_id");
  const name = value(formData, "name");

  if (!name) throw new Error("Project name is required.");
  if (!providerId && !organizationId) throw new Error("Select at least a provider or organization.");
  if (!payerOfferingId) throw new Error("Select a payer program.");

  let providerClientId: string | null = null;
  let organizationClientId: string | null = null;

  if (providerId) {
    const { data: provider, error } = await supabase
      .from("providers")
      .select("client_id")
      .eq("id", providerId)
      .single();

    if (error || !provider) throw new Error("Selected provider is not available.");
    providerClientId = provider.client_id;
  }

  if (organizationId) {
    const { data: organization, error } = await supabase
      .from("organizations")
      .select("client_id")
      .eq("id", organizationId)
      .single();

    if (error || !organization) throw new Error("Selected organization is not available.");
    organizationClientId = organization.client_id;
  }

  const assignedClientIds = Array.from(
    new Set([providerClientId, organizationClientId].filter((id): id is string => Boolean(id))),
  );

  if (!clientId) {
    if (assignedClientIds.length === 1) {
      clientId = assignedClientIds[0];
    } else if (assignedClientIds.length > 1) {
      throw new Error("The selected provider and organization belong to different clients. Select the intended client explicitly.");
    } else if (newClientName) {
      const clientType = organizationId ? "group" : "individual";
      const { data: newClient, error } = await supabase
        .from("clients")
        .insert({
          tenant_id: tenantId,
          name: newClientName,
          client_type: clientType,
          status: "onboarding",
          created_by: user.id,
          updated_by: user.id,
        })
        .select("id")
        .single();

      if (error || !newClient) throw new Error(error?.message ?? "Could not create the client.");
      clientId = newClient.id;
    } else {
      throw new Error("Select an existing client or enter a new client name.");
    }
  }

  if (providerClientId && providerClientId !== clientId) {
    throw new Error("The selected provider already belongs to a different client.");
  }

  if (organizationClientId && organizationClientId !== clientId) {
    throw new Error("The selected organization already belongs to a different client.");
  }

  if (providerId && !providerClientId) {
    const { error } = await supabase
      .from("providers")
      .update({ client_id: clientId, updated_by: user.id })
      .eq("id", providerId);

    if (error) throw new Error(error.message);
  }

  if (organizationId && !organizationClientId) {
    const { error } = await supabase
      .from("organizations")
      .update({ client_id: clientId, updated_by: user.id })
      .eq("id", organizationId);

    if (error) throw new Error(error.message);
  }

  const { data, error } = await supabase.rpc("create_credentialing_case_bundle", {
    p_client_id: clientId,
    p_project_name: name,
    p_provider_id: providerId || null,
    p_organization_id: organizationId || null,
    p_location_id: value(formData, "location_id") || null,
    p_payer_offering_id: payerOfferingId,
    p_state: value(formData, "state").toUpperCase() || null,
    p_enrollment_type: value(formData, "enrollment_type") || "initial",
    p_entity_context: value(formData, "entity_context") || "individual",
    p_network_intent: value(formData, "network_intent") || "in_network",
    p_start_date: value(formData, "start_date") || null,
    p_target_date: value(formData, "target_date") || null,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/clients");
  revalidatePath("/providers");
  revalidatePath("/organizations");
  revalidatePath("/projects");
  revalidatePath("/enrollment-cases");

  const result = data as { case_id?: string } | null;

  if (result?.case_id) {
    const { error: requirementsError } = await supabase.rpc("generate_case_requirements", {
      p_case_id: result.case_id,
    });

    if (requirementsError) {
      console.error("Requirement generation failed:", requirementsError.message);
    }

    redirect("/enrollment-cases");
  }

  redirect("/projects");
}
