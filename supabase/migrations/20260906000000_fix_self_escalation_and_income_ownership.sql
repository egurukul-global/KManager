-- Fix: close two live self-privilege-escalation paths (users.role, user_teams.access_level/team_id)
-- and restrict income edit/delete to the record's creator or a team lead/admin.
--
-- Design: purely additive. Adds three new BEFORE UPDATE/DELETE triggers; does not modify,
-- drop, or replace any existing policy. This makes the fix trivially reversible - see the
-- companion _ROLLBACK.sql file, which only needs to drop what this file creates.
--
-- Verified against actual app code before writing this (2026-09-06): the only legitimate
-- self-service updates in the codebase are users.request_alias, users.default_login_view,
-- and user_teams.is_primary. Everything else on these two tables is either admin-driven
-- (already gated by separate, correct policies this migration does not touch) or should
-- never be self-editable at all (role, access_level, team_id).

-- ============================================================================
-- 1. users: block self-escalation via role/team_id/on_hold/etc.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.enforce_users_self_update_limits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  allowed_keys text[] := ARRAY['request_alias', 'default_login_view'];
  old_j jsonb;
  new_j jsonb;
BEGIN
  -- Only restrict when the actor is updating their OWN row and is not already an admin.
  -- Admin-driven updates (via users_org_admin_update / users_ok_admin_update policies)
  -- are untouched by this check.
  IF auth.uid() = OLD.id AND NOT (is_org_admin() OR is_ok_admin()) THEN
    old_j := to_jsonb(OLD) - allowed_keys;
    new_j := to_jsonb(NEW) - allowed_keys;
    IF old_j IS DISTINCT FROM new_j THEN
      RAISE EXCEPTION 'You may only update request_alias or default_login_view on your own account. Contact an admin for other changes.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_users_self_update_limits_trigger ON public.users;
CREATE TRIGGER enforce_users_self_update_limits_trigger
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_users_self_update_limits();

-- ============================================================================
-- 2. user_teams: block self-escalation via access_level/team_id
-- ============================================================================
CREATE OR REPLACE FUNCTION public.enforce_user_teams_self_update_limits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  allowed_keys text[] := ARRAY['is_primary'];
  old_j jsonb;
  new_j jsonb;
BEGIN
  -- OLD.team_id (not NEW.team_id) is intentional: we check whether the actor already
  -- manages the team they're CURRENTLY on before allowing anything beyond is_primary -
  -- otherwise a non-manager could set NEW.team_id to a team they DO manage to slip past this.
  IF auth.uid() = OLD.user_id AND NOT (is_org_admin() OR is_team_roster_manager(OLD.team_id)) THEN
    old_j := to_jsonb(OLD) - allowed_keys;
    new_j := to_jsonb(NEW) - allowed_keys;
    IF old_j IS DISTINCT FROM new_j THEN
      RAISE EXCEPTION 'You may only toggle is_primary on your own team membership. Contact a team lead or admin for other changes.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_user_teams_self_update_limits_trigger ON public.user_teams;
CREATE TRIGGER enforce_user_teams_self_update_limits_trigger
  BEFORE UPDATE ON public.user_teams
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_user_teams_self_update_limits();

-- ============================================================================
-- 3. income: only the creator, a team lead/admin, or an org admin may edit/delete
--    (mirrors the already-correct pattern used on the `expenses` table)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.enforce_income_row_ownership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_row record;
BEGIN
  target_row := OLD;

  IF target_row.created_by = auth.uid() THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF is_org_admin() THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.user_teams ut
    WHERE ut.user_id = auth.uid()
      AND ut.team_id = target_row.team_id
      AND ut.access_level IN ('lead', 'admin')
  ) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role IN ('admin', 'caoh', 'oh', 'ceo')
  ) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  RAISE EXCEPTION 'You may only edit or delete income records you created, unless you are a team lead or admin.';
END;
$$;

DROP TRIGGER IF EXISTS enforce_income_row_ownership_update ON public.income;
CREATE TRIGGER enforce_income_row_ownership_update
  BEFORE UPDATE ON public.income
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_income_row_ownership();

DROP TRIGGER IF EXISTS enforce_income_row_ownership_delete ON public.income;
CREATE TRIGGER enforce_income_row_ownership_delete
  BEFORE DELETE ON public.income
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_income_row_ownership();
