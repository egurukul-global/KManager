-- Migration 062: Cleanup incorrect request_role_assignments on personal teams
DELETE FROM public.request_role_assignments
WHERE team_id IN (
  SELECT id FROM public.teams WHERE is_personal_team = true
);
