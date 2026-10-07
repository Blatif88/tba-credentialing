"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

async function adminContext() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership, error } = await supabase
    .from("tenant_memberships")
    .select("tenant_id,role_key")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .single();

  if (error || !membership) {
    throw new Error("No active tenant membership is available.");
  }

  if (membership.role_key !== "organization_admin") {
    throw new Error("Organization admin role required.");
  }

  return { supabase, user, tenantId: membership.tenant_id };
}

function value(formData: FormData, key: string) {
  const raw = formData.get(key);
  return raw === null ? "" : String(raw).trim();
}

function programPath(offeringId: string) {
  return "/payer-programs/" + offeringId;
}

export async function cloneGlobalRuleToTenantDraft(formData: FormData) {
  const { supabase } = await adminContext();
  const ruleVersionId = value(formData, "rule_version_id");
  const offeringId = value(formData, "payer_offering_id");

  if (!ruleVersionId || !offeringId) {
    throw new Error("Rule version and payer program are required.");
  }

  const { error } = await supabase.rpc("clone_global_rule_to_tenant_draft", {
    p_rule_version_id: ruleVersionId,
  });

  if (error) throw new Error(error.message);
  revalidatePath(programPath(offeringId));
}

export async function createNextTenantRuleVersion(formData: FormData) {
  const { supabase } = await adminContext();
  const knowledgeRuleId = value(formData, "knowledge_rule_id");
  const offeringId = value(formData, "payer_offering_id");

  if (!knowledgeRuleId || !offeringId) {
    throw new Error("Rule and payer program are required.");
  }

  const { error } = await supabase.rpc("create_next_tenant_rule_version", {
    p_knowledge_rule_id: knowledgeRuleId,
  });

  if (error) throw new Error(error.message);
  revalidatePath(programPath(offeringId));
}

export async function setTenantRuleVersionStatus(formData: FormData) {
  const { supabase } = await adminContext();
  const ruleVersionId = value(formData, "rule_version_id");
  const offeringId = value(formData, "payer_offering_id");
  const status = value(formData, "status");
  const changeReason = value(formData, "change_reason");

  if (!ruleVersionId || !offeringId || !status) {
    throw new Error("Rule version, payer program, and status are required.");
  }

  const { error } = await supabase.rpc("set_tenant_rule_version_status", {
    p_rule_version_id: ruleVersionId,
    p_status: status,
    p_change_reason: changeReason || null,
  });

  if (error) throw new Error(error.message);
  revalidatePath(programPath(offeringId));
}
