-- Migration 050: Auto Generate Task Number via BEFORE INSERT Trigger
-- This ensures task numbers are generated on the server side using SECURITY DEFINER,
-- preventing duplicate key violations caused by RLS SELECT limits on the client side.

CREATE OR REPLACE FUNCTION public.set_next_task_number()
RETURNS TRIGGER AS $$
DECLARE
  v_team_prefix TEXT;
  v_next_num INTEGER;
BEGIN
  -- Get team prefix (slice first 3 chars of name, uppercase)
  SELECT COALESCE(UPPER(SUBSTRING(name FROM 1 FOR 3)), 'TSK')
  INTO v_team_prefix
  FROM public.teams
  WHERE id = NEW.team_id;

  -- Find the max numeric suffix for this team_id from all tasks in the table (bypassing RLS)
  SELECT COALESCE(MAX(CAST(SUBSTRING(task_number FROM '[0-9]+') AS INTEGER)), 100000)
  INTO v_next_num
  FROM public.tasks
  WHERE team_id = NEW.team_id;

  NEW.task_number := v_team_prefix || '-' || (v_next_num + 1);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_set_next_task_number ON public.tasks;
CREATE TRIGGER trg_set_next_task_number
BEFORE INSERT ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.set_next_task_number();
