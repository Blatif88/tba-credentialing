-- Run with psql on isolated staging ONLY after staging schema and synthetic fixtures exist.
-- psql -v case_id=<synthetic-case-uuid> -v user_id=<authorized-user-uuid> -f database/tests/activation_channels_regression.sql
-- Fixture: operational_complete exists; three channels pending. The transaction rolls back.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', :'user_id', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('app.regression_case_id', :'case_id', true);
DO $test$
BEGIN
  BEGIN
    PERFORM public.record_case_milestone(current_setting('app.regression_case_id')::uuid, null, 'era_complete', 'completed', now(), null, 'STAGING-TEST', 'Bypass negative test');
    RAISE EXCEPTION 'FAIL: generic milestone bypass succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'FAIL: generic milestone bypass succeeded' OR SQLERRM NOT LIKE '%structured evidence workflow%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.record_activation_channel(current_setting('app.regression_case_id')::uuid,'era','completed',now(),null,null);
    RAISE EXCEPTION 'FAIL: empty evidence accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'FAIL: empty evidence accepted' OR SQLERRM NOT LIKE '%evidence%' THEN RAISE; END IF;
  END;
END $test$;
SELECT public.record_activation_channel(current_setting('app.regression_case_id')::uuid,'era','completed',now(),'STAGING-ERA-001','Synthetic rollback QA evidence');
SELECT public.record_activation_channel(current_setting('app.regression_case_id')::uuid,'eft','completed',now(),'STAGING-EFT-001','Synthetic rollback QA evidence');
SELECT public.record_activation_channel(current_setting('app.regression_case_id')::uuid,'edi','completed',now(),'STAGING-EDI-001','Synthetic rollback QA evidence');
DO $test$
DECLARE v_status text; v_tracks integer; v_evidence integer;
BEGIN
  SELECT status_code INTO v_status FROM public.enrollment_cases WHERE id=current_setting('app.regression_case_id')::uuid;
  SELECT count(*) INTO v_tracks FROM public.case_activation_tracks WHERE case_id=current_setting('app.regression_case_id')::uuid AND status='active';
  SELECT count(*) INTO v_evidence FROM public.case_milestones WHERE case_id=current_setting('app.regression_case_id')::uuid AND milestone_code IN ('era_complete','eft_complete','edi_complete') AND outcome='completed';
  IF v_status IS DISTINCT FROM 'fully_activated' OR v_tracks <> 3 OR v_evidence <> 3 THEN
    RAISE EXCEPTION 'FAIL: final status=%, active tracks=%, evidence count=%',v_status,v_tracks,v_evidence;
  END IF;
  BEGIN
    PERFORM public.record_activation_channel(current_setting('app.regression_case_id')::uuid,'era','completed',now(),'STAGING-ERA-002','Duplicate test');
    RAISE EXCEPTION 'FAIL: duplicate accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'FAIL: duplicate accepted' OR SQLERRM NOT LIKE '%already classified%' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'PASS: governed activation, evidence synchronization, full activation, duplicate rejection';
END $test$;
ROLLBACK;
