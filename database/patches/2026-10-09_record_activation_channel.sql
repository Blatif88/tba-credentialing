-- Snapshot of the live governed activation RPC after the verified fix.
-- Apply ONLY to an existing TBA Credentialing schema. Not a schema baseline.
-- Source of truth: production function as of 2026-10-09.

CREATE OR REPLACE FUNCTION public.record_activation_channel(p_case_id uuid, p_channel text, p_outcome text, p_occurred_at timestamp with time zone, p_reference_number text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_user uuid := auth.uid();
  v_case record;
  v_code text;
  v_result jsonb;
  v_milestone_id uuid;
  v_track_id uuid;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  if p_channel not in ('era','eft','edi') then
    raise exception 'Activation channel must be ERA, EFT, or EDI';
  end if;

  if p_outcome not in ('completed','not_applicable') then
    raise exception 'Activation channel outcome must be completed or not applicable';
  end if;

  if p_occurred_at is null then
    raise exception 'Activation channel occurrence date/time is required';
  end if;

  select ec.id,ec.tenant_id,ec.status_code
  into v_case
  from public.enrollment_cases ec
  where ec.id=p_case_id
  for update;

  if v_case.id is null then
    raise exception 'Case not found';
  end if;

  if not private.has_tenant_role(
    v_case.tenant_id,
    array[
      'organization_admin',
      'credentialing_manager',
      'credentialing_specialist',
      'reviewer'
    ]
  ) then
    raise exception 'Insufficient permission to record activation channel';
  end if;

  if not exists (
    select 1
    from public.case_milestones cm
    where cm.case_id=p_case_id
      and cm.milestone_code='operational_complete'
      and cm.outcome='completed'
  ) then
    raise exception 'Operational completion must be recorded before ERA, EFT, or EDI activation';
  end if;

  v_code := p_channel || '_complete';

  if exists (
    select 1
    from public.case_milestones cm
    where cm.case_id=p_case_id
      and cm.milestone_code=v_code
      and cm.outcome in ('completed','not_applicable')
  ) then
    raise exception '% activation is already classified for this case',upper(p_channel);
  end if;

  if p_outcome='not_applicable'
     and nullif(trim(coalesce(p_notes,'')),'') is null
  then
    raise exception 'Not-applicable activation channels require an explanation';
  end if;

  if p_outcome='completed'
     and nullif(trim(coalesce(p_reference_number,'')),'') is null
     and nullif(trim(coalesce(p_notes,'')),'') is null
  then
    raise exception 'Completed activation channels require a reference number or evidence note';
  end if;

  -- Maintain the existing governed activation-track record and status,
  -- then write the evidence milestone directly. The generic milestone RPC
  -- intentionally rejects ERA/EFT/EDI evidence.
  -- The legacy activation tracks are initialized at operational completion.
  -- Keep them synchronized with evidence milestones in this same transaction.
  perform set_config('app.activation_track_rpc','true',true);

  update public.case_activation_tracks t
  set status=case when p_outcome='completed' then 'active' else 'not_required' end,
      reference_number=nullif(trim(coalesce(p_reference_number,'')),''),
      notes=nullif(trim(coalesce(p_notes,'')),''),
      completed_at=now(),
      updated_by=v_user,
      version=t.version+1
  where t.case_id=p_case_id
    and t.track_code=p_channel
    and t.status not in ('active','not_required')
  returning t.id into v_track_id;

  if v_track_id is null then
    raise exception 'Activation track unavailable or already satisfied';
  end if;

  perform set_config('app.activation_track_rpc','',true);

  v_result := jsonb_build_object('activation_track_id',v_track_id);
  perform set_config('app.milestone_governance_rpc','true',true);

  insert into public.case_milestones(
    tenant_id,case_id,submission_id,milestone_code,outcome,occurred_at,
    value_date,reference_number,notes,created_by,updated_by
  )
  values(
    v_case.tenant_id,p_case_id,null,v_code,p_outcome,p_occurred_at,
    null,
    nullif(trim(coalesce(p_reference_number,'')),''),
    nullif(trim(coalesce(p_notes,'')),''),
    v_user,v_user
  )
  returning id into v_milestone_id;

  perform set_config('app.milestone_governance_rpc','',true);

  return v_result || jsonb_build_object(
    'milestone_id',v_milestone_id,
    'milestone_code',v_code,
    'outcome',p_outcome,
    'channel',p_channel
  );
end;
$function$
;
