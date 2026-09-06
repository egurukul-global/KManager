-- Rollback for 20260906000000_fix_self_escalation_and_income_ownership.sql
-- Not applied automatically - run manually only if the fix causes a real functional
-- bottleneck. Since the fix only ADDED triggers/functions (touched nothing existing),
-- this rollback is a clean, complete undo: no policies or columns need restoring.

DROP TRIGGER IF EXISTS enforce_users_self_update_limits_trigger ON public.users;
DROP FUNCTION IF EXISTS public.enforce_users_self_update_limits();

DROP TRIGGER IF EXISTS enforce_user_teams_self_update_limits_trigger ON public.user_teams;
DROP FUNCTION IF EXISTS public.enforce_user_teams_self_update_limits();

DROP TRIGGER IF EXISTS enforce_income_row_ownership_update ON public.income;
DROP TRIGGER IF EXISTS enforce_income_row_ownership_delete ON public.income;
DROP FUNCTION IF EXISTS public.enforce_income_row_ownership();
