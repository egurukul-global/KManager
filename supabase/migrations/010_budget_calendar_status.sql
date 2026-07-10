-- Budget calendar open/closed status — only open periods appear in monthly budget creation

ALTER TABLE budget_calendar_entries
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open'
  CHECK (status IN ('open', 'closed'));

COMMENT ON COLUMN budget_calendar_entries.status IS
  'open = teams may create monthly budgets for this period; closed = hidden from selection';
