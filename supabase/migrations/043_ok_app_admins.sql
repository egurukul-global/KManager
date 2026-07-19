-- Migration 043: Create public.ok_app_admins table

CREATE TABLE IF NOT EXISTS public.ok_app_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_code TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  created_by UUID REFERENCES public.users(id),
  UNIQUE(app_code, user_id)
);

-- Enable RLS
ALTER TABLE public.ok_app_admins ENABLE ROW LEVEL SECURITY;

CREATE POLICY select_app_admins ON public.ok_app_admins
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY manage_app_admins ON public.ok_app_admins
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  );
