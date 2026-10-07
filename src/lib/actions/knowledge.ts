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


export async function updateTenantRuleDraft(formData: FormData) {
  const { supabase, user, tenantId } = await adminContext();
  const ruleVersionId = value(formData, "rule_version_id");
  const knowledgeRuleId = value(formData, "knowledge_rule_id");
  const offeringId = value(formData, "payer_offering_id");

  if (!ruleVersionId || !knowledgeRuleId || !offeringId) {
    throw new Error("Rule, rule version, and payer program are required.");
  }

  const { data: version, error: versionError } = await supabase
    .from("rule_versions")
    .select("id,knowledge_rule_id,status,tenant_id")
    .eq("id", ruleVersionId)
    .eq("knowledge_rule_id", knowledgeRuleId)
    .eq("tenant_id", tenantId)
    .single();

  if (versionError || !version || version.status !== "draft") {
    throw new Error("Only a tenant draft version can be edited.");
  }

  const { error: ruleError } = await supabase
    .from("knowledge_rules")
    .update({
      name: value(formData, "rule_name"),
      description: value(formData, "rule_description") || null,
      updated_by: user.id,
    })
    .eq("id", knowledgeRuleId)
    .eq("tenant_id", tenantId);

  if (ruleError) throw new Error(ruleError.message);

  const { error: versionUpdateError } = await supabase
    .from("rule_versions")
    .update({
      summary: value(formData, "summary") || null,
      change_reason: value(formData, "change_reason") || null,
      effective_from: value(formData, "effective_from") || null,
      effective_to: value(formData, "effective_to") || null,
      updated_by: user.id,
    })
    .eq("id", ruleVersionId)
    .eq("tenant_id", tenantId);

  if (versionUpdateError) throw new Error(versionUpdateError.message);

  const effectIds = value(formData, "effect_ids")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  for (const effectId of effectIds) {
    const { data: effect, error: effectError } = await supabase
      .from("rule_effects")
      .select("id,payload")
      .eq("id", effectId)
      .eq("rule_version_id", ruleVersionId)
      .eq("tenant_id", tenantId)
      .single();

    if (effectError || !effect) throw new Error("A draft rule effect is not available.");

    const requiredValue = value(formData, "effect_required_" + effectId);
    const nextPayload = {
      ...((effect.payload as Record<string, unknown> | null) ?? {}),
      title: value(formData, "effect_title_" + effectId),
      description: value(formData, "effect_description_" + effectId) || null,
      required: requiredValue === "true",
    };

    const { error: updateError } = await supabase
      .from("rule_effects")
      .update({
        payload: nextPayload,
        severity: value(formData, "effect_severity_" + effectId) || "normal",
        updated_by: user.id,
      })
      .eq("id", effectId)
      .eq("rule_version_id", ruleVersionId)
      .eq("tenant_id", tenantId);

    if (updateError) throw new Error(updateError.message);
  }

  revalidatePath(programPath(offeringId));
}
